import fs from "fs";
import http from "http";
import path from "path";
import { execFile, spawn } from "child_process";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PREVIEW_ROOT = path.resolve(__dirname, "../../../../../.preview-workspaces");
const MAX_LOG_CHARS = 60_000;

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeRelativePath(fileName = "") {
  const normalized = path
    .normalize(fileName)
    .replace(/^(\.\.(\/|\\|$))+/, "")
    .replace(/^\/+/, "");

  return normalized || "index.txt";
}

function writeWorkspaceFiles(workspaceDir, files = [], stack = "") {
  ensureDir(workspaceDir);

  files.forEach(file => {
    if (!file?.name || typeof file.content !== "string") return;

    const relativePath = safeRelativePath(file.name);
    const targetPath = path.join(workspaceDir, relativePath);

    if (!targetPath.startsWith(workspaceDir)) return;

    ensureDir(path.dirname(targetPath));
    fs.writeFileSync(targetPath, file.content);
  });

  scaffoldMissingProjectFiles(workspaceDir, files, stack);
}

function hasWorkspaceFile(workspaceDir, relativePath) {
  return fs.existsSync(path.join(workspaceDir, relativePath));
}

function scaffoldMissingProjectFiles(workspaceDir, files = [], stack = "") {
  if (stack === "react" && !hasWorkspaceFile(workspaceDir, "package.json")) {
    const appFile =
      files.find(file => ["App.jsx", "App.tsx", "src/App.jsx", "src/App.tsx"].includes(file.name)) ||
      files.find(file => [".jsx", ".tsx"].some(ext => file.name?.endsWith(ext)));
    const cssFile =
      files.find(file => file.name === "style.css") ||
      files.find(file => file.name?.endsWith(".css"));

    ensureDir(path.join(workspaceDir, "src"));

    if (appFile && !hasWorkspaceFile(workspaceDir, "src/App.jsx")) {
      fs.writeFileSync(path.join(workspaceDir, "src/App.jsx"), appFile.content);
    }

    if (cssFile && !hasWorkspaceFile(workspaceDir, "src/style.css")) {
      fs.writeFileSync(path.join(workspaceDir, "src/style.css"), cssFile.content);
    }

    fs.writeFileSync(
      path.join(workspaceDir, "src/main.jsx"),
      `import React from "react";\nimport { createRoot } from "react-dom/client";\nimport App from "./App.jsx";\nimport "./style.css";\n\ncreateRoot(document.getElementById("root")).render(<App />);\n`
    );
    fs.writeFileSync(
      path.join(workspaceDir, "index.html"),
      `<!doctype html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>Preview</title></head><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>`
    );
    fs.writeFileSync(
      path.join(workspaceDir, "package.json"),
      JSON.stringify(
        {
          scripts: {
            dev: "vite --host 0.0.0.0"
          },
          dependencies: {
            "@vitejs/plugin-react": "latest",
            vite: "latest",
            react: "latest",
            "react-dom": "latest",
            "lucide-react": "latest",
            "react-icons": "latest",
            "framer-motion": "latest"
          },
          devDependencies: {}
        },
        null,
        2
      )
    );
  }
}

function execFileAsync(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}

function appendLog(session, chunk) {
  session.logs += chunk.toString();
  if (session.logs.length > MAX_LOG_CHARS) {
    session.logs = session.logs.slice(-MAX_LOG_CHARS);
  }
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function httpReady(port) {
  return new Promise(resolve => {
    const req = http.get(
      {
        hostname: "127.0.0.1",
        port,
        path: "/",
        timeout: 1000
      },
      res => {
        res.resume();
        resolve(res.statusCode < 500);
      }
    );

    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForHttp(port, timeoutMs = 60_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await httpReady(port)) return true;
    await wait(1000);
  }

  return false;
}

async function resolveHostPort(containerName, containerPort) {
  const { stdout } = await execFileAsync("docker", ["port", containerName, `${containerPort}/tcp`]);
  const line = stdout.trim().split("\n")[0] || "";
  const port = Number(line.split(":").pop());

  if (!port) {
    throw new Error(`Unable to resolve Docker host port for ${containerName}`);
  }

  return port;
}

async function waitForHostPort(session, timeoutMs = 120_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (session.process?.exitCode !== null) {
      throw new Error("Preview container exited before exposing a port.");
    }

    try {
      return await resolveHostPort(session.containerName, session.containerPort);
    } catch {
      await wait(1000);
    }
  }

  throw new Error(`Preview container did not expose port ${session.containerPort} before timeout.`);
}

function buildContainerCommand(runtime, files, workspaceDir) {
  const buildCommand =
    typeof runtime.buildCommand === "function"
      ? runtime.buildCommand(files)
      : runtime.buildCommand || "";
  const startCommand =
    typeof runtime.startCommand === "function"
      ? runtime.startCommand(files)
      : runtime.startCommand || "";

  return [
    "set -e",
    "cd /workspace",
    buildCommand,
    startCommand
  ]
    .filter(Boolean)
    .join(" && ");
}

function runtimeIsWeb(runtime, files) {
  if (typeof runtime.web === "function") {
    return runtime.web(files);
  }

  return runtime.web !== false;
}

export async function startDockerPreview({ artifact, runtime, stack }) {
  const id = randomUUID();
  const workspaceDir = path.join(PREVIEW_ROOT, id);
  const containerName = `cortex-preview-${id}`;
  const files = artifact.files || [];

  writeWorkspaceFiles(workspaceDir, files, stack);
  const web = runtimeIsWeb(runtime, files);

  const session = {
    id,
    stack,
    status: "starting",
    logs: "",
    containerName,
    containerPort: runtime.port,
    hostPort: null,
    previewPath: `/preview/${id}/proxy/`,
    workspaceDir,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + runtime.ttlMs).toISOString(),
    web
  };

  const shellCommand = buildContainerCommand(runtime, files, workspaceDir);
  const dockerArgs = [
    "run",
    "--rm",
    "--name",
    containerName,
    "--cpus",
    process.env.PREVIEW_DOCKER_CPUS || "1",
    "--memory",
    process.env.PREVIEW_DOCKER_MEMORY || "768m",
    "--pids-limit",
    process.env.PREVIEW_DOCKER_PIDS || "256",
    "--network",
    process.env.PREVIEW_DOCKER_NETWORK || "bridge",
    ...(web ? ["-p", `127.0.0.1::${runtime.port}`] : []),
    "-v",
    `${workspaceDir}:/workspace:rw`,
    "-w",
    "/workspace",
    runtime.image,
    "sh",
    "-lc",
    shellCommand
  ];

  const child = spawn("docker", dockerArgs, {
    stdio: ["ignore", "pipe", "pipe"]
  });

  session.process = child;

  child.stdout.on("data", chunk => appendLog(session, chunk));
  child.stderr.on("data", chunk => appendLog(session, chunk));
  child.on("error", error => {
    session.status = "error";
    appendLog(session, `\n${error.message}\n`);
  });
  child.on("exit", code => {
    if (session.status !== "stopped") {
      session.status = code === 0 ? "exited" : "error";
      appendLog(session, `\nContainer exited with code ${code}.\n`);
    }
  });

  if (!web) {
    session.status = "running";
    return session;
  }

  try {
    session.hostPort = await waitForHostPort(
      session,
      Number(process.env.PREVIEW_CONTAINER_START_TIMEOUT_MS || 120_000)
    );
  } catch (error) {
    session.status = "error";
    appendLog(session, `\n${error.message}\n`);
    return session;
  }

  session.status = "building";
  const ready = await waitForHttp(session.hostPort, Number(process.env.PREVIEW_READY_TIMEOUT_MS || 60_000));
  session.status = ready ? "running" : "error";

  if (!ready) {
    appendLog(session, "\nPreview server did not become ready before timeout.\n");
  }

  return session;
}

export async function stopDockerPreview(session) {
  if (!session) return;

  session.status = "stopped";

  try {
    await execFileAsync("docker", ["rm", "-f", session.containerName], {
      timeout: 10_000
    });
  } catch (error) {
    appendLog(session, `\nFailed to stop container: ${error.message}\n`);
  }

  try {
    fs.rmSync(session.workspaceDir, { recursive: true, force: true });
  } catch (error) {
    appendLog(session, `\nFailed to remove workspace: ${error.message}\n`);
  }
}
