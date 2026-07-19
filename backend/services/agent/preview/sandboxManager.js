import { startDockerPreview, stopDockerPreview } from "./dockerRunner.js";

const DEFAULT_SANDBOX = process.env.PREVIEW_SANDBOX || "docker";

export function getSandboxName() {
  return DEFAULT_SANDBOX;
}

export async function startSandboxPreview(options) {
  if (DEFAULT_SANDBOX === "docker") {
    const session = await startDockerPreview(options);

    return {
      ...session,
      sandbox: "docker"
    };
  }

  const error = new Error(`Preview sandbox '${DEFAULT_SANDBOX}' is not registered.`);
  error.status = 400;
  throw error;
}

export async function stopSandboxPreview(session) {
  if (!session) return;

  if ((session.sandbox || DEFAULT_SANDBOX) === "docker") {
    await stopDockerPreview(session);
    return;
  }

  const error = new Error(`Preview sandbox '${session.sandbox}' is not registered.`);
  error.status = 400;
  throw error;
}
