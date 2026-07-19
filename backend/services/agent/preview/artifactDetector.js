const CODE_EXTENSIONS = new Set([
  ".html",
  ".css",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".vue",
  ".svelte",
  ".astro",
  ".py",
  ".java",
  ".cpp",
  ".cc",
  ".cxx",
  ".c",
  ".go",
  ".rs"
]);

const DOCUMENT_EXTENSIONS = new Set([
  ".md",
  ".markdown",
  ".mmd",
  ".mermaid",
  ".pdf",
  ".ppt",
  ".pptx"
]);

const MEDIA_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".mp4",
  ".webm",
  ".mp3",
  ".wav"
]);

function getExtension(name = "") {
  const cleanName = name.toLowerCase().split("?")[0];
  const dotIndex = cleanName.lastIndexOf(".");
  return dotIndex >= 0 ? cleanName.slice(dotIndex) : "";
}

function fileNameEndsWith(file, suffix) {
  return file.name?.toLowerCase().endsWith(suffix);
}

function getPackageJson(files = []) {
  const file = files.find(item => fileNameEndsWith(item, "package.json"));

  if (!file?.content) return null;

  try {
    return JSON.parse(file.content);
  } catch {
    return null;
  }
}

function hasDependency(packageJson, dependency) {
  return Boolean(
    packageJson?.dependencies?.[dependency] ||
    packageJson?.devDependencies?.[dependency]
  );
}

function inferStack(files = [], artifactType = "") {
  const type = artifactType.toLowerCase();
  const names = files.map(file => file.name?.toLowerCase() || "");
  const content = files.map(file => file.content || "").join("\n");
  const packageJson = getPackageJson(files);

  if (type.includes("next") || hasDependency(packageJson, "next") || names.some(name => name.includes("next.config"))) {
    return "next";
  }

  if (type.includes("nuxt") || hasDependency(packageJson, "nuxt")) {
    return "nuxt";
  }

  if (type.includes("angular") || hasDependency(packageJson, "@angular/core") || names.some(name => name.endsWith("angular.json"))) {
    return "angular";
  }

  if (type.includes("vue") || hasDependency(packageJson, "vue") || names.some(name => name.endsWith(".vue"))) {
    return "vue";
  }

  if (type.includes("svelte") || hasDependency(packageJson, "svelte") || names.some(name => name.endsWith(".svelte"))) {
    return "svelte";
  }

  if (type.includes("astro") || hasDependency(packageJson, "astro") || names.some(name => name.endsWith(".astro"))) {
    return "astro";
  }

  if (type.includes("react") || hasDependency(packageJson, "react") || /from\s+["']react["']|import\s+React\b|ReactDOM|createRoot\(/.test(content)) {
    return "react";
  }

  if (names.some(name => name.endsWith(".py")) || type.includes("python")) {
    if (/streamlit/.test(content) || hasPythonRequirement(files, "streamlit")) return "streamlit";
    if (/FastAPI/.test(content) || hasPythonRequirement(files, "fastapi")) return "fastapi";
    if (/Flask/.test(content) || hasPythonRequirement(files, "flask")) return "flask";
    return "python";
  }

  if (names.some(name => name.endsWith(".java")) || names.some(name => name.endsWith("pom.xml")) || type.includes("java")) {
    return "java";
  }

  if (names.some(name => [".cpp", ".cc", ".cxx", ".c"].includes(getExtension(name))) || type.includes("c++") || type.includes("cpp")) {
    return "cpp";
  }

  if (names.some(name => name.endsWith(".go")) || names.some(name => name.endsWith("go.mod")) || type.includes("go")) {
    return "go";
  }

  if (names.some(name => name.endsWith(".rs")) || names.some(name => name.endsWith("cargo.toml")) || type.includes("rust")) {
    return "rust";
  }

  if (names.some(name => name.endsWith(".html"))) {
    return "html";
  }

  return "unknown";
}

function hasPythonRequirement(files = [], dependency) {
  const requirements = files.find(file => fileNameEndsWith(file, "requirements.txt"))?.content || "";
  return requirements.toLowerCase().includes(dependency.toLowerCase());
}

function inferKind(files = [], artifactType = "") {
  const type = artifactType.toLowerCase();
  const extensions = files.map(file => getExtension(file.name));

  if (type.includes("pdf") || type.includes("ppt")) {
    return "document";
  }

  if (type.includes("project") || type.includes("code") || extensions.some(ext => CODE_EXTENSIONS.has(ext))) {
    return "code";
  }

  if (type.includes("image") || type.includes("media") || extensions.some(ext => MEDIA_EXTENSIONS.has(ext))) {
    return "media";
  }

  if (extensions.some(ext => DOCUMENT_EXTENSIONS.has(ext))) {
    return "document";
  }

  return "unknown";
}

function findEntry(files = [], stack = "") {
  const preferredByStack = {
    html: ["preview.html", "index.html"],
    react: ["preview.html", "src/main.jsx", "src/main.tsx", "main.jsx", "main.tsx", "App.jsx", "App.tsx"],
    next: ["package.json", "app/page.jsx", "app/page.tsx", "pages/index.jsx", "pages/index.tsx"],
    vue: ["preview.html", "src/main.js", "src/main.ts", "App.vue"],
    svelte: ["preview.html", "src/main.js", "src/main.ts", "App.svelte"],
    angular: ["package.json", "angular.json"],
    astro: ["package.json", "src/pages/index.astro"],
    flask: ["app.py", "main.py"],
    fastapi: ["main.py", "app.py"],
    streamlit: ["app.py", "streamlit_app.py", "main.py"],
    python: ["main.py", "app.py"],
    java: ["pom.xml", "Main.java", "src/main/java/Main.java"],
    cpp: ["main.cpp", "main.cc", "main.cxx", "main.c"],
    go: ["go.mod", "main.go"],
    rust: ["Cargo.toml", "src/main.rs", "main.rs"]
  };

  const preferred = preferredByStack[stack] || [];
  const match = preferred
    .map(name => files.find(file => file.name?.toLowerCase() === name.toLowerCase()))
    .find(Boolean);

  return match?.name || files[0]?.name || "";
}

function hasBrowserPreview(files = []) {
  return files.some(file => {
    const name = file.name?.toLowerCase() || "";
    return name.endsWith("preview.html") || name.endsWith("index.html");
  });
}

function inferPreviewStrategy(kind, stack, files = []) {
  if (kind === "document") return "viewer";
  if (kind === "media") return "viewer";
  if (hasBrowserPreview(files)) return "browser";
  if (stack === "html") return "browser";

  const runnableStacks = new Set([
    "react",
    "next",
    "nuxt",
    "vue",
    "svelte",
    "angular",
    "astro",
    "flask",
    "fastapi",
    "streamlit",
    "python",
    "java",
    "cpp",
    "go",
    "rust"
  ]);

  return runnableStacks.has(stack) ? "container" : "none";
}

export function createArtifactManifest(artifact = {}) {
  const files = artifact.files || [];
  const kind = inferKind(files, artifact.type);
  const stack = inferStack(files, artifact.type);
  const entry = findEntry(files, stack);
  const strategy = inferPreviewStrategy(kind, stack, files);

  return {
    version: 1,
    kind,
    stack,
    entry,
    files: files.map(file => ({
      name: file.name,
      mimeType: file.mimeType || "",
      size: file.size || file.content?.length || 0
    })),
    preview: {
      strategy,
      entry,
      stack,
      status: strategy === "container" ? "idle" : "ready"
    }
  };
}

export function enrichArtifact(artifact = {}) {
  const manifest = artifact.manifest || createArtifactManifest(artifact);

  return {
    ...artifact,
    manifest,
    preview: {
      ...manifest.preview,
      ...(artifact.preview || {})
    }
  };
}

export function enrichArtifacts(artifacts = []) {
  return artifacts.map(enrichArtifact);
}
