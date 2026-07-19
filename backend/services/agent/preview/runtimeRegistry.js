const DEFAULT_TTL_MS = Number(process.env.PREVIEW_TTL_MS || 15 * 60 * 1000);

function hasFile(files = [], matcher) {
  return files.some(file => matcher(file.name?.toLowerCase() || ""));
}

function packageManagerInstallCommand(files = []) {
  if (hasFile(files, name => name.endsWith("pnpm-lock.yaml"))) return "corepack enable && pnpm install";
  if (hasFile(files, name => name.endsWith("yarn.lock"))) return "corepack enable && yarn install";
  if (hasFile(files, name => name.endsWith("package-lock.json"))) return "npm ci";
  return "npm install";
}

function packageManagerRunCommand(files = [], script = "dev") {
  if (hasFile(files, name => name.endsWith("pnpm-lock.yaml"))) return `pnpm run ${script}`;
  if (hasFile(files, name => name.endsWith("yarn.lock"))) return `yarn ${script}`;
  return `npm run ${script}`;
}

function shellQuote(value = "") {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function findFileName(files = [], predicate) {
  return files.find(file => predicate(file.name || ""))?.name || "";
}

function allContent(files = []) {
  return files.map(file => file.content || "").join("\n");
}

function findPythonEntry(files = [], preferred = ["main.py", "app.py"]) {
  return (
    findFileName(files, name => preferred.includes(name)) ||
    findFileName(files, name => name.endsWith(".py") && !name.endsWith("__init__.py")) ||
    preferred[0]
  );
}

function pythonModuleName(fileName = "main.py") {
  return fileName
    .replace(/\.py$/i, "")
    .replace(/[\\/]/g, ".")
    .replace(/^\.+|\.+$/g, "") || "main";
}

function nodeRuntime(stack, port, runSuffix = "-- --host 0.0.0.0") {
  return {
    image: "node:20-alpine",
    port,
    ttlMs: DEFAULT_TTL_MS,
    buildCommand: files => packageManagerInstallCommand(files),
    startCommand: files => `${packageManagerRunCommand(files)} ${runSuffix}`.trim()
  };
}

const RUNTIMES = {
  react: nodeRuntime("react", 5173),
  vue: nodeRuntime("vue", 5173),
  svelte: nodeRuntime("svelte", 5173),
  astro: nodeRuntime("astro", 4321, "-- --host 0.0.0.0"),
  next: {
    image: "node:20-alpine",
    port: 3000,
    ttlMs: DEFAULT_TTL_MS,
    buildCommand: files => packageManagerInstallCommand(files),
    startCommand: files => `${packageManagerRunCommand(files)} -- -H 0.0.0.0 -p 3000`
  },
  nuxt: {
    image: "node:20-alpine",
    port: 3000,
    ttlMs: DEFAULT_TTL_MS,
    buildCommand: files => packageManagerInstallCommand(files),
    startCommand: files => `${packageManagerRunCommand(files)} -- --host 0.0.0.0 --port 3000`
  },
  angular: {
    image: "node:20-alpine",
    port: 4200,
    ttlMs: DEFAULT_TTL_MS,
    buildCommand: files => packageManagerInstallCommand(files),
    startCommand: files => `${packageManagerRunCommand(files, "start")} -- --host 0.0.0.0 --port 4200`
  },
  flask: {
    image: "python:3.12-slim",
    port: 5000,
    ttlMs: DEFAULT_TTL_MS,
    buildCommand: files => hasFile(files, name => name.endsWith("requirements.txt")) ? "pip install -r requirements.txt" : "pip install flask",
    startCommand: files => `python ${shellQuote(findPythonEntry(files, ["app.py", "main.py"]))}`
  },
  fastapi: {
    image: "python:3.12-slim",
    port: 8000,
    ttlMs: DEFAULT_TTL_MS,
    buildCommand: files => hasFile(files, name => name.endsWith("requirements.txt")) ? "pip install -r requirements.txt" : "pip install fastapi uvicorn",
    startCommand: files => `uvicorn ${pythonModuleName(findPythonEntry(files, ["main.py", "app.py"]))}:app --host 0.0.0.0 --port 8000`
  },
  streamlit: {
    image: "python:3.12-slim",
    port: 8501,
    ttlMs: DEFAULT_TTL_MS,
    buildCommand: files => hasFile(files, name => name.endsWith("requirements.txt")) ? "pip install -r requirements.txt" : "pip install streamlit",
    startCommand: files => {
      const entry = findPythonEntry(files, ["streamlit_app.py", "app.py", "main.py"]);
      return `streamlit run ${shellQuote(entry)} --server.address 0.0.0.0 --server.port 8501`;
    }
  },
  python: {
    image: "python:3.12-slim",
    port: 8000,
    ttlMs: DEFAULT_TTL_MS,
    buildCommand: files => hasFile(files, name => name.endsWith("requirements.txt")) ? "pip install -r requirements.txt" : "",
    startCommand: files => {
      const entry = findPythonEntry(files, ["main.py", "app.py"]);
      return `python ${shellQuote(entry)}`;
    },
    web: false
  },
  java: {
    image: "maven:3.9-eclipse-temurin-21",
    port: 8080,
    ttlMs: DEFAULT_TTL_MS,
    buildCommand: files => hasFile(files, name => name.endsWith("pom.xml")) ? "mvn -q -DskipTests package" : "",
    startCommand: files => {
      if (hasFile(files, name => name.endsWith("pom.xml"))) {
        return "mvn spring-boot:run -Dspring-boot.run.jvmArguments='-Dserver.address=0.0.0.0'";
      }

      const entry = findFileName(files, name => name.endsWith(".java")) || "Main.java";
      const className = entry.split("/").pop().replace(/\.java$/i, "");
      return `javac ${shellQuote(entry)} && java ${shellQuote(className)}`;
    },
    web: files => hasFile(files, name => name.endsWith("pom.xml")) || /SpringBootApplication|server\.port|HttpServer|listen\(/i.test(allContent(files))
  },
  cpp: {
    image: "gcc:13",
    port: 8080,
    ttlMs: DEFAULT_TTL_MS,
    buildCommand: () => "",
    startCommand: files => {
      const entry = files.find(file => [".cpp", ".cc", ".cxx", ".c"].some(ext => file.name?.endsWith(ext)))?.name || "main.cpp";
      return `g++ ${shellQuote(entry)} -std=c++17 -O2 -o app && ./app`;
    },
    web: false
  },
  go: {
    image: "golang:1.23-alpine",
    port: 8080,
    ttlMs: DEFAULT_TTL_MS,
    buildCommand: () => "",
    startCommand: () => "go run .",
    web: files => /net\/http|ListenAndServe|http\.Handle|http\.NewServeMux/i.test(allContent(files))
  },
  rust: {
    image: "rust:1.83",
    port: 8080,
    ttlMs: DEFAULT_TTL_MS,
    buildCommand: () => "",
    startCommand: files => {
      if (hasFile(files, name => name.endsWith("cargo.toml"))) {
        return "cargo run --release";
      }

      const entry = findFileName(files, name => name.endsWith(".rs")) || "main.rs";
      return `rustc ${shellQuote(entry)} -o app && ./app`;
    },
    web: false
  }
};

export function getRuntime(stack) {
  return RUNTIMES[stack] || null;
}

export function listRuntimeStacks() {
  return Object.keys(RUNTIMES);
}
