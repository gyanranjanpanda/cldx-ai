import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define services and their directories relative to workspace root
const services = [
  { name: "auth-service", dir: "backend/services/auth", color: "\x1b[32m" }, // Green
  { name: "chat-service", dir: "backend/services/chat", color: "\x1b[36m" }, // Cyan
  { name: "agent-service", dir: "backend/services/agent", color: "\x1b[33m" }, // Yellow
  { name: "billing-service", dir: "backend/services/billing", color: "\x1b[35m" }, // Magenta
  { name: "gateway", dir: "backend/gateway", color: "\x1b[31m" }, // Red
  { name: "frontend", dir: "frontend", color: "\x1b[34m" }, // Blue
];

const children = [];

// Ensure homebrew and standard paths are in the PATH environment variable
const env = {
  ...process.env,
  PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || ""}`,
};

console.log("\x1b[1m\x1b[34mStarting all Cortex AI services locally...\x1b[0m\n");

services.forEach((service) => {
  const servicePath = path.resolve(__dirname, service.dir);
  console.log(`Launching ${service.name} in ${servicePath}...`);

  const child = spawn("npm", ["run", "dev"], {
    cwd: servicePath,
    env,
    shell: true,
  });

  children.push({ child, name: service.name });

  child.stdout.on("data", (data) => {
    const lines = data.toString().split("\n");
    lines.forEach((line) => {
      if (line.trim()) {
        console.log(`${service.color}[${service.name}]\x1b[0m ${line}`);
      }
    });
  });

  child.stderr.on("data", (data) => {
    const lines = data.toString().split("\n");
    lines.forEach((line) => {
      if (line.trim()) {
        console.error(`${service.color}[${service.name} ERROR]\x1b[0m ${line}`);
      }
    });
  });

  child.on("close", (code) => {
    console.log(`${service.color}[${service.name}]\x1b[0m exited with code ${code}`);
  });
});

// Handle graceful shutdown on Ctrl+C (SIGINT/SIGTERM)
const cleanup = () => {
  console.log("\n\x1b[1m\x1b[31mStopping all services...\x1b[0m");
  children.forEach(({ child, name }) => {
    try {
      console.log(`Killing ${name} (PID: ${child.pid})...`);
      child.kill("SIGTERM");
    } catch (e) {
      console.error(`Failed to kill ${name}:`, e.message);
    }
  });
  process.exit();
};

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
