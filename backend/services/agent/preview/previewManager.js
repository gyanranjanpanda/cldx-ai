import http from "http";
import { enrichArtifact } from "./artifactDetector.js";
import { getRuntime } from "./runtimeRegistry.js";
import { startSandboxPreview, stopSandboxPreview } from "./sandboxManager.js";

const sessions = new Map();
const MAX_PREVIEW_FILES = Number(process.env.MAX_PREVIEW_FILES || 80);
const MAX_PREVIEW_BYTES = Number(process.env.MAX_PREVIEW_BYTES || 2_000_000);
const EVENT_INTERVAL_MS = Number(process.env.PREVIEW_EVENT_INTERVAL_MS || 1000);

function assertPreviewSize(artifact = {}) {
  const files = artifact.files || [];
  const totalBytes = files.reduce((sum, file) => sum + Buffer.byteLength(file.content || "", "utf8"), 0);

  if (files.length > MAX_PREVIEW_FILES) {
    const error = new Error(`Preview contains too many files (${files.length}/${MAX_PREVIEW_FILES}).`);
    error.status = 413;
    throw error;
  }

  if (totalBytes > MAX_PREVIEW_BYTES) {
    const error = new Error(`Preview files are too large (${totalBytes}/${MAX_PREVIEW_BYTES} bytes).`);
    error.status = 413;
    throw error;
  }
}

function publicSession(session) {
  if (!session) return null;

  return {
    id: session.id,
    stack: session.stack,
    status: session.status,
    logs: session.logs || "",
    previewPath: session.previewPath,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    sandbox: session.sandbox || "docker",
    web: session.web,
    error: session.error || ""
  };
}

function scheduleCleanup(session) {
  const ttl = Math.max(1000, new Date(session.expiresAt).getTime() - Date.now());
  session.cleanupTimer = setTimeout(() => {
    stopSession(session.id);
  }, ttl);

  session.cleanupTimer.unref?.();
}

export async function startSession(rawArtifact) {
  const artifact = enrichArtifact(rawArtifact);
  assertPreviewSize(artifact);
  const strategy = artifact.preview?.strategy;
  const stack = artifact.preview?.stack || artifact.manifest?.stack;

  if (strategy !== "container") {
    const error = new Error(`Artifact uses ${strategy || "no"} preview strategy, not container runtime.`);
    error.status = 400;
    throw error;
  }

  const runtime = getRuntime(stack);

  if (!runtime) {
    const error = new Error(`No runtime registered for ${stack}.`);
    error.status = 400;
    throw error;
  }

  const session = await startSandboxPreview({
    artifact,
    runtime,
    stack
  });

  sessions.set(session.id, session);
  scheduleCleanup(session);

  return publicSession(session);
}

export function getSession(id) {
  return publicSession(sessions.get(id));
}

export function streamSessionEvents(req, res) {
  const session = sessions.get(req.params.id);

  if (!session) {
    res.status(404).json({
      success: false,
      message: "Preview session not found."
    });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });

  let lastLogs = "";

  const send = () => {
    const payload = publicSession(session);
    const logs = payload.logs || "";
    const nextLogs = logs.startsWith(lastLogs)
      ? logs.slice(lastLogs.length)
      : logs;

    lastLogs = logs;

    res.write(`event: status\n`);
    res.write(`data: ${JSON.stringify({ ...payload, logs: undefined })}\n\n`);

    if (nextLogs) {
      res.write(`event: logs\n`);
      res.write(`data: ${JSON.stringify({ chunk: nextLogs })}\n\n`);
    }

    if (["error", "exited", "stopped"].includes(session.status)) {
      clearInterval(interval);
      res.write(`event: done\n`);
      res.write(`data: ${JSON.stringify(publicSession(session))}\n\n`);
      res.end();
    }
  };

  const interval = setInterval(send, EVENT_INTERVAL_MS);
  send();

  req.on("close", () => {
    clearInterval(interval);
  });
}

export async function stopSession(id) {
  const session = sessions.get(id);
  if (!session) return null;

  sessions.delete(id);
  clearTimeout(session.cleanupTimer);
  await stopSandboxPreview(session);

  return publicSession(session);
}

export function proxySessionRequest(req, res) {
  const session = sessions.get(req.params.id);

  if (!session) {
    res.status(404).send("Preview session not found.");
    return;
  }

  if (session.status !== "running" || !session.hostPort) {
    res.status(409).send("Preview session is not running yet.");
    return;
  }

  const targetPath = req.url || "/";
  const proxyReq = http.request(
    {
      hostname: "127.0.0.1",
      port: session.hostPort,
      path: targetPath,
      method: req.method,
      headers: {
        ...req.headers,
        host: `127.0.0.1:${session.hostPort}`
      }
    },
    proxyRes => {
      res.status(proxyRes.statusCode || 200);
      Object.entries(proxyRes.headers).forEach(([key, value]) => {
        if (value !== undefined) {
          res.setHeader(key, value);
        }
      });
      proxyRes.pipe(res);
    }
  );

  proxyReq.on("error", error => {
    res.status(502).send(`Preview proxy error: ${error.message}`);
  });

  req.pipe(proxyReq);
}
