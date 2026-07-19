import { useCallback, useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import Editor from "@monaco-editor/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FiCode } from "react-icons/fi";
import {
  Check,
  Code2,
  Copy,
  ExternalLink,
  Eye,
  FileText,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Presentation,
  RefreshCw,
  X
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  getArtifactPreviewEventsUrl,
  getArtifactPreviewUrl,
  startArtifactPreview,
  stopArtifactPreview
} from "../features/agent.api";
import { detectLanguage } from "../utils/detectLanguage";

const FILE_TYPE_LABELS = {
  html: "Live Preview",
  react: "React App",
  pdf: "PDF",
  ppt: "Slides",
  markdown: "Markdown",
  mermaid: "Mermaid",
  framework: "Framework App",
  runtime: "Runtime Preview"
};

const PREVIEW_ICONS = {
  pdf: FileText,
  ppt: Presentation,
  markdown: FileText,
  mermaid: RefreshCw,
  runtime: Play
};

function getExtension(name = "") {
  const cleanName = name.toLowerCase().split("?")[0];
  const dotIndex = cleanName.lastIndexOf(".");
  return dotIndex >= 0 ? cleanName.slice(dotIndex) : "";
}

function getBaseName(name = "") {
  return name.split("/").pop()?.replace(/\.[^.]+$/, "") || "App";
}

function toComponentName(name = "") {
  const baseName = getBaseName(name)
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim();

  const pascal = baseName
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");

  return /^[A-Za-z_$][\w$]*$/.test(pascal) ? pascal : "App";
}

function getFileUrl(file = {}) {
  return file.url || file.downloadUrl || file.href || file.contentUrl || "";
}

function toAbsoluteUrl(url = "") {
  if (!url) return "";

  try {
    return new URL(url, window.location.origin).href;
  } catch {
    return url;
  }
}

function stripCodeFence(content = "") {
  return content
    .replace(/^```[\w-]*\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function escapeScriptContent(content = "") {
  return content.replace(/<\/script/gi, `<${"/"}script`);
}

function extractProblems(logs = "") {
  const problemPatterns = [
    /error/i,
    /failed/i,
    /exception/i,
    /traceback/i,
    /errno/i,
    /not found/i,
    /cannot/i,
    /warning/i
  ];

  return logs
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => problemPatterns.some(pattern => pattern.test(line)))
    .slice(-30);
}

function isMermaidContent(content = "") {
  return /^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|mindmap|timeline|gitGraph)\b/i.test(
    stripCodeFence(content)
  );
}

function findFile(files, predicate) {
  return files.find(file => predicate(file, getExtension(file.name)));
}

function isPreviewHtmlFile(file = {}) {
  const name = file.name?.toLowerCase() || "";
  return getExtension(name) === ".html" && /(^|\/)(preview|index)\.html$/.test(name);
}

function findHtmlPreviewFile(files = []) {
  return (
    files.find(file => file.name?.toLowerCase().endsWith("preview.html")) ||
    files.find(file => file.name?.toLowerCase().endsWith("index.html")) ||
    findFile(files, file => getExtension(file.name) === ".html")
  );
}

function inferFrameworkStack(files = [], type = "") {
  const names = files.map(file => file.name?.toLowerCase() || "");
  const contents = files.map(file => file.content || "").join("\n");
  const packageJson = files.find(file => file.name?.toLowerCase().endsWith("package.json"))?.content || "";

  if (type.includes("vue") || names.some(name => name.endsWith(".vue")) || /"vue"\s*:/.test(packageJson)) {
    return "Vue";
  }

  if (type.includes("svelte") || names.some(name => name.endsWith(".svelte")) || /"svelte"\s*:/.test(packageJson)) {
    return "Svelte";
  }

  if (type.includes("angular") || names.some(name => name.includes("angular")) || /"@angular\/core"\s*:/.test(packageJson)) {
    return "Angular";
  }

  if (type.includes("next") || /"next"\s*:/.test(packageJson)) {
    return "Next.js";
  }

  if (type.includes("astro") || names.some(name => name.endsWith(".astro")) || /"astro"\s*:/.test(packageJson)) {
    return "Astro";
  }

  if (type.includes("react") || /from\s+["']react["']|import\s+React\b|ReactDOM|createRoot\(/.test(contents)) {
    return "React";
  }

  return "Framework";
}

function inferRuntimeStack(files = [], type = "") {
  const lowerType = type.toLowerCase();
  const names = files.map(file => file.name?.toLowerCase() || "");
  const contents = files.map(file => file.content || "").join("\n");
  const packageJson = files.find(file => file.name?.toLowerCase().endsWith("package.json"))?.content || "";

  if (lowerType.includes("next") || /"next"\s*:/.test(packageJson) || names.some(name => name.includes("next.config"))) return "next";
  if (lowerType.includes("nuxt") || /"nuxt"\s*:/.test(packageJson)) return "nuxt";
  if (lowerType.includes("angular") || /"@angular\/core"\s*:/.test(packageJson) || names.some(name => name.endsWith("angular.json"))) return "angular";
  if (lowerType.includes("vue") || /"vue"\s*:/.test(packageJson) || names.some(name => name.endsWith(".vue"))) return "vue";
  if (lowerType.includes("svelte") || /"svelte"\s*:/.test(packageJson) || names.some(name => name.endsWith(".svelte"))) return "svelte";
  if (lowerType.includes("astro") || /"astro"\s*:/.test(packageJson) || names.some(name => name.endsWith(".astro"))) return "astro";
  if (lowerType.includes("react") || /"react"\s*:/.test(packageJson) || /from\s+["']react["']|import\s+React\b|ReactDOM|createRoot\(/.test(contents)) return "react";
  if (names.some(name => name.endsWith(".py"))) return "python";
  if (names.some(name => name.endsWith(".java") || name.endsWith("pom.xml"))) return "java";
  if (names.some(name => [".cpp", ".cc", ".cxx", ".c"].includes(getExtension(name)))) return "cpp";
  if (names.some(name => name.endsWith(".go") || name.endsWith("go.mod"))) return "go";
  if (names.some(name => name.endsWith(".rs") || name.endsWith("cargo.toml"))) return "rust";

  return "";
}

function getPreviewModel(artifact, files, activeFileIndex) {
  const type = (artifact?.type || "").toLowerCase();
  const activeFile = files[activeFileIndex] || files[0];
  const artifactUrl = getFileUrl(artifact);

  const pdfFile = findFile(
    files,
    file => file.mimeType === "application/pdf" || getExtension(file.name) === ".pdf"
  );

  if (type.includes("pdf") || pdfFile) {
    return {
      type: "pdf",
      url: toAbsoluteUrl(getFileUrl(pdfFile) || artifactUrl),
      file: pdfFile
    };
  }

  const htmlPreviewFile = findHtmlPreviewFile(files);

  const pptFile = findFile(files, file =>
    [
      ".ppt",
      ".pptx",
      ".pps",
      ".ppsx"
    ].includes(getExtension(file.name)) ||
    file.mimeType === "application/vnd.ms-powerpoint" ||
    file.mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  );

  if ((type.includes("ppt") || type.includes("presentation") || pptFile) && htmlPreviewFile) {
    return {
      type: "html",
      files,
      file: htmlPreviewFile
    };
  }

  if (type.includes("ppt") || type.includes("presentation") || pptFile) {
    return {
      type: "ppt",
      url: toAbsoluteUrl(getFileUrl(pptFile) || artifactUrl),
      file: pptFile
    };
  }

  if (htmlPreviewFile) {
    return {
      type: "html",
      files,
      file: htmlPreviewFile
    };
  }

  if (artifact?.preview?.strategy === "container") {
    return {
      type: "runtime",
      stack: artifact.preview.stack || artifact.manifest?.stack || inferFrameworkStack(files, type),
      preview: artifact.preview
    };
  }

  const hasReactFile = files.some(file =>
    [".jsx", ".tsx"].includes(getExtension(file.name)) ||
    /from\s+["']react["']|import\s+React\b|ReactDOM|createRoot\(/.test(file.content || "")
  );

  if (type.includes("react") || hasReactFile) {
    return {
      type: "runtime",
      stack: "react"
    };
  }

  const htmlFile = findFile(files, file => getExtension(file.name) === ".html");

  if (type.includes("html") || type.includes("project") || htmlFile) {
    if (htmlFile) {
      return {
        type: "html",
        files,
        file: htmlFile
      };
    }
  }

  const hasFrameworkFile = files.some(file =>
    [".vue", ".svelte", ".astro"].includes(getExtension(file.name)) ||
    ["angular.json", "vite.config.js", "vite.config.ts", "next.config.js", "next.config.mjs"].some(name =>
      file.name?.toLowerCase().endsWith(name)
    )
  );

  if (hasFrameworkFile) {
    return {
      type: "runtime",
      stack: inferRuntimeStack(files, type) || inferFrameworkStack(files, type)
    };
  }

  const runtimeStack = inferRuntimeStack(files, type);

  if (runtimeStack) {
    return {
      type: "runtime",
      stack: runtimeStack
    };
  }

  const mermaidFile =
    [activeFile, ...files].find(
      file =>
        file &&
        [".mmd", ".mermaid"].includes(getExtension(file.name)) &&
        file.content
    ) ||
    [activeFile, ...files].find(file => file?.content && isMermaidContent(file.content));

  if (type.includes("mermaid") || mermaidFile) {
    return {
      type: "mermaid",
      content: mermaidFile?.content || artifact?.content || ""
    };
  }

  const markdownFile =
    [activeFile, ...files].find(
      file =>
        file &&
        [".md", ".markdown", ".mdx"].includes(getExtension(file.name)) &&
        file.content
    ) || null;

  if (type.includes("markdown") || markdownFile) {
    return {
      type: "markdown",
      content: markdownFile?.content || artifact?.content || ""
    };
  }

  return null;
}

function buildHtmlPreviewDoc(files = []) {
  const htmlFile =
    files.find(file => isPreviewHtmlFile(file) && file.name?.toLowerCase().endsWith("preview.html")) ||
    files.find(file => file.name?.toLowerCase() === "index.html") ||
    files.find(file => getExtension(file.name) === ".html");
  const html = htmlFile?.content || "";
  const css = files
    .filter(file => getExtension(file.name) === ".css")
    .map(file => file.content || "")
    .join("\n\n");
  const js = files
    .filter(file => getExtension(file.name) === ".js")
    .map(file => file.content || "")
    .join("\n\n");
  const styleTag = css ? `<style>${css}</style>` : "";
  const scriptTag = js ? `<script>${escapeScriptContent(js)}</script>` : "";

  if (/<html[\s>]/i.test(html) || /<!doctype/i.test(html)) {
    let doc = html;

    if (styleTag) {
      doc = /<\/head>/i.test(doc)
        ? doc.replace(/<\/head>/i, `${styleTag}</head>`)
        : `${styleTag}${doc}`;
    }

    if (scriptTag) {
      doc = /<\/body>/i.test(doc)
        ? doc.replace(/<\/body>/i, `${scriptTag}</body>`)
        : `${doc}${scriptTag}`;
    }

    return doc;
  }

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
${styleTag}
</head>
<body>
${html}
${scriptTag}
</body>
</html>`;
}

function replaceNamedImportWithStubs(source, packageName, replacementFactory) {
  const escapedPackage = packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const namedImportPattern = new RegExp(
    `import\\s+\\{([^}]+)\\}\\s+from\\s+["']${escapedPackage}["'];?`,
    "g"
  );

  return source.replace(namedImportPattern, (_, names) =>
    names
      .split(",")
      .map(name => {
        const [original, alias] = name.split(/\s+as\s+/i).map(part => part.trim());
        return replacementFactory(alias || original);
      })
      .join("\n")
  );
}

function normalizeReactSource(file) {
  const fallbackName = toComponentName(file.name);
  const sourceWithStubs = replaceNamedImportWithStubs(
    replaceNamedImportWithStubs(
      replaceNamedImportWithStubs(file.content || "", "lucide-react", name => `const ${name} = IconStub;`),
      "react-icons/fi",
      name => `const ${name} = IconStub;`
    ),
    "react-icons/fa",
    name => `const ${name} = IconStub;`
  ).replace(/import\s+\{[^}]+\}\s+from\s+["']framer-motion["'];?\s*/g, "");

  return sourceWithStubs
    .replace(/import\s+["'][^"']+\.css["'];?\s*/g, "")
    .replace(/import\s+[^;]+from\s+["']react["'];?\s*/g, "")
    .replace(/import\s+[^;]+from\s+["']react-dom\/client["'];?\s*/g, "")
    .replace(/import\s+[^;]+from\s+["']react-dom["'];?\s*/g, "")
    .replace(/import\s+[^;]+from\s+["'][^"']+\.(png|jpg|jpeg|gif|webp|svg)["'];?\s*/g, "")
    .replace(/import\s+\w+\s+from\s+["'][^"']+["'];?\s*/g, "")
    .replace(/import\s+\{[^}]+\}\s+from\s+["'][^"']+["'];?\s*/g, "")
    .replace(/export\s+default\s+function\s*\(/g, `function ${fallbackName}(`)
    .replace(/export\s+default\s+function\s+([A-Za-z_$][\w$]*)\s*\(/g, "function $1(")
    .replace(/export\s+default\s+class\s+([A-Za-z_$][\w$]*)/g, "class $1")
    .replace(/export\s+default\s+class\s+/g, `class ${fallbackName} `)
    .replace(/export\s+default\s+([A-Za-z_$][\w$]*);?/g, "")
    .replace(/export\s+default\s+/g, `const ${fallbackName} = `)
    .replace(/export\s+\{[^}]+\};?/g, "")
    .replace(/export\s+(const|let|var|function|class)\s+/g, "$1 ");
}

function buildReactPreviewDoc(files = []) {
  const css = files
    .filter(file => getExtension(file.name) === ".css")
    .map(file => file.content || "")
    .join("\n\n");
  const reactFiles = files.filter(file =>
    [".jsx", ".tsx", ".js", ".ts"].includes(getExtension(file.name))
  );
  const appFile =
    reactFiles.find(file => /(^|\/)app\.(jsx|tsx|js|ts)$/i.test(file.name || "")) ||
    reactFiles.find(file => !/(^|\/)(main|index)\.(jsx|tsx|js|ts)$/i.test(file.name || "")) ||
    reactFiles[0];
  const appComponentName = toComponentName(appFile?.name || "App.jsx");
  const orderedFiles = [
    ...reactFiles.filter(file => file !== appFile && !/(^|\/)(main|index)\.(jsx|tsx|js|ts)$/i.test(file.name || "")),
    ...(appFile ? [appFile] : [])
  ];
  const userCode = orderedFiles
    .map(file => normalizeReactSource(file))
    .join("\n\n");
  const source = escapeScriptContent(userCode);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<script crossorigin src="https://unpkg.com/react@18/umd/react.development.js" onerror="window.__showPreviewError && window.__showPreviewError('React runtime failed to load. Generate a preview.html artifact or check network access.')"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js" onerror="window.__showPreviewError && window.__showPreviewError('React DOM runtime failed to load. Generate a preview.html artifact or check network access.')"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js" onerror="window.__showPreviewError && window.__showPreviewError('JSX compiler failed to load. Generate a preview.html artifact for offline preview.')"></script>
<style>
* { box-sizing: border-box; }
html, body, #root { min-height: 100%; margin: 0; }
body { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #ffffff; color: #0f172a; }
button, input, textarea, select { font: inherit; }
.preview-status { min-height: 100vh; display: grid; place-items: center; padding: 24px; background: #f8fafc; color: #475569; text-align: center; }
.preview-error { min-height: 100vh; margin: 0; white-space: pre-wrap; padding: 24px; color: #991b1b; background: #fff1f2; border: 0; font: 13px/1.6 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
${css}
</style>
</head>
<body>
<div id="root"><div class="preview-status">Loading React preview...</div></div>
<script>
window.__showPreviewError = function(message) {
  var root = document.getElementById("root");
  if (!root) return;
  root.innerHTML = "";
  var pre = document.createElement("pre");
  pre.className = "preview-error";
  pre.textContent = message;
  root.appendChild(pre);
};

window.addEventListener("error", function(event) {
  window.__showPreviewError(event.message || "Preview runtime error.");
});

setTimeout(function() {
  var root = document.getElementById("root");
  if (!root || !root.textContent.includes("Loading React preview")) return;
  if (!window.React || !window.ReactDOM || !window.Babel) {
    window.__showPreviewError("React preview could not start because the browser compiler/runtime is unavailable. Regenerate the artifact so it includes preview.html.");
  }
}, 2500);
</script>
<script type="text/babel" data-presets="env,react,typescript">
const { useCallback, useEffect, useMemo, useRef, useState } = React;
const IconStub = ({ size = 18, className = "", ...props }) => (
  <span
    {...props}
    className={className}
    style={{ display: "inline-block", width: size, height: size, borderRadius: 999, border: "1.5px solid currentColor", ...props.style }}
  />
);
const AnimatePresence = ({ children }) => <>{children}</>;
const motion = new Proxy({}, { get: (_, tag) => tag });
const createRoot = ReactDOM.createRoot;

try {
${source}

  const root = ReactDOM.createRoot(document.getElementById("root"));
  if (typeof ${appComponentName} !== "undefined") {
    root.render(React.createElement(${appComponentName}));
  } else if (typeof App !== "undefined") {
    root.render(React.createElement(App));
  } else {
    root.render(React.createElement("pre", { style: { padding: 24, color: "#475569" } }, "No React component was found to preview."));
  }
} catch (error) {
  window.__showPreviewError(error.stack || error.message || "React preview failed.");
}
</script>
</body>
</html>`;
}

function buildMermaidPreviewDoc(content = "") {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<style>
html, body { min-height: 100%; margin: 0; }
body { display: grid; place-items: center; padding: 24px; background: #f8fafc; color: #0f172a; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
#diagram { width: 100%; overflow: auto; text-align: center; }
#diagram svg { max-width: 100%; height: auto; }
.preview-status { color: #475569; }
pre { max-width: 100%; white-space: pre-wrap; color: #b91c1c; background: #fff1f2; border: 1px solid #fecdd3; border-radius: 12px; padding: 16px; text-align: left; }
</style>
</head>
<body>
<div id="diagram"><div class="preview-status">Rendering Mermaid diagram...</div></div>
<script type="module">
const source = ${JSON.stringify(stripCodeFence(content))};
const target = document.getElementById("diagram");
const showError = (message) => {
  target.innerHTML = "";
  const pre = document.createElement("pre");
  pre.textContent = message;
  target.appendChild(pre);
};

try {
  const { default: mermaid } = await import("https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs");
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "base",
    themeVariables: {
      primaryColor: "#eef2ff",
      primaryTextColor: "#0f172a",
      primaryBorderColor: "#6366f1",
      lineColor: "#475569",
      secondaryColor: "#ecfeff",
      tertiaryColor: "#f8fafc"
    }
  });
  const { svg } = await mermaid.render("live-preview-diagram", source);
  target.innerHTML = svg;
} catch (error) {
  showError(error.message || "Mermaid preview failed. Check the diagram syntax or network access.");
}
</script>
</body>
</html>`;
}

function getOfficeViewerUrl(url = "") {
  return url
    ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`
    : "";
}

function MarkdownPreview({ content }) {
  return (
    <div className="h-full overflow-y-auto bg-slate-50 text-slate-900 px-6 sm:px-8 py-7">
      <article className="mx-auto max-w-3xl text-[14px] leading-7">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => <h1 className="text-3xl font-semibold tracking-tight mb-5 text-slate-950">{children}</h1>,
            h2: ({ children }) => <h2 className="text-xl font-semibold mt-7 mb-3 text-slate-950">{children}</h2>,
            h3: ({ children }) => <h3 className="text-base font-semibold mt-5 mb-2 text-slate-950">{children}</h3>,
            p: ({ children }) => <p className="mb-4 text-slate-700">{children}</p>,
            ul: ({ children }) => <ul className="list-disc pl-5 space-y-1.5 mb-4 text-slate-700">{children}</ul>,
            ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1.5 mb-4 text-slate-700">{children}</ol>,
            blockquote: ({ children }) => <blockquote className="border-l-4 border-indigo-300 bg-indigo-50/70 pl-4 py-2 my-4 text-slate-700">{children}</blockquote>,
            code: ({ className, children }) => {
              const value = String(children).trim();

              if (!className) {
                return <code className="rounded bg-slate-200 px-1.5 py-0.5 text-[12px] text-slate-900">{value}</code>;
              }

              return (
                <pre className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-950 p-4 text-[12px] leading-6 text-slate-100">
                  <code>{String(children).replace(/\n$/, "")}</code>
                </pre>
              );
            },
            table: ({ children }) => (
              <div className="my-5 overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full border-collapse bg-white">{children}</table>
              </div>
            ),
            th: ({ children }) => <th className="border-b border-slate-200 bg-slate-100 px-3 py-2 text-left font-semibold">{children}</th>,
            td: ({ children }) => <td className="border-b border-slate-100 px-3 py-2">{children}</td>
          }}
        >
          {content}
        </ReactMarkdown>
      </article>
    </div>
  );
}

function FrameworkPreviewNotice({ stack }) {
  return (
    <div className="flex h-full items-center justify-center bg-slate-50 px-6 text-center text-slate-700">
      <div className="max-w-sm">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-600">
          <Code2 size={18} />
        </div>
        <h3 className="text-[15px] font-semibold text-slate-950">{stack} needs a runnable preview file</h3>
        <p className="mt-2 text-[13px] leading-6 text-slate-600">
          Raw framework files need a compiler or dev server. Regenerate this app so the artifact includes
          <code className="mx-1 rounded bg-slate-200 px-1.5 py-0.5 text-[12px] text-slate-900">preview.html</code>
          and the preview will render here.
        </p>
      </div>
    </div>
  );
}

function RuntimePreview({ artifact, files, onRuntimeUpdate }) {
  const [session, setSession] = useState(null);
  const [logs, setLogs] = useState("");
  const [error, setError] = useState("");
  const [restartToken, setRestartToken] = useState(0);
  const runtimeArtifact = useMemo(
    () => ({
      ...artifact,
      files
    }),
    [artifact, files]
  );
  const previewUrl = session?.previewPath ? getArtifactPreviewUrl(session.previewPath) : "";
  const isBusy = ["starting", "building"].includes(session?.status);
  const isTerminalRuntime = session?.web === false;
  const canShowIframe = session?.status === "running" && session?.web !== false && previewUrl;

  useEffect(() => {
    let cancelled = false;

    const launchPreview = async () => {
      setError("");
      setSession({
        status: "starting",
        logs: "Starting preview runtime..."
      });
      setLogs("Starting preview runtime...");

      try {
        const nextSession = await startArtifactPreview(runtimeArtifact);
        if (!cancelled) {
          setSession(nextSession);
          setLogs(nextSession.logs || "");
        }
      } catch (caughtError) {
        if (!cancelled) {
          setSession(null);
          setError(
            caughtError.response?.data?.message ||
            caughtError.message ||
            "Failed to start preview runtime."
          );
        }
      }
    };

    launchPreview();

    return () => {
      cancelled = true;
    };
  }, [runtimeArtifact, restartToken]);

  useEffect(() => {
    if (!session?.id) return undefined;

    const eventsUrl = getArtifactPreviewEventsUrl(session.id);
    const events = new EventSource(eventsUrl, {
      withCredentials: true
    });

    events.addEventListener("status", event => {
      const nextSession = JSON.parse(event.data);
      setSession(prev => ({
        ...(prev || {}),
        ...nextSession
      }));
    });

    events.addEventListener("logs", event => {
      const { chunk } = JSON.parse(event.data);
      setLogs(current => `${current || ""}${chunk || ""}`);
    });

    events.addEventListener("done", event => {
      const nextSession = JSON.parse(event.data);
      setSession(nextSession);
      setLogs(nextSession.logs || "");
      events.close();
    });

    events.onerror = () => {
      events.close();
    };

    return () => events.close();
  }, [session?.id]);

  useEffect(() => {
    onRuntimeUpdate?.({
      session,
      logs: error || logs
    });
  }, [error, logs, onRuntimeUpdate, session]);

  const handleRestart = async () => {
    if (session?.id) {
      try {
        await stopArtifactPreview(session.id);
      } catch {
        // Best effort cleanup before starting a replacement preview.
      }
    }

    setSession(null);
    setLogs("");
    setError("");
    setRestartToken(token => token + 1);
  };

  if (canShowIframe) {
    return (
      <div className="flex h-full flex-col bg-slate-950">
        <div className="flex h-10 items-center justify-between gap-3 border-b border-white/[0.08] px-3 text-[11px] text-slate-400">
          <span className="truncate">
            {runtimeArtifact.preview?.stack || runtimeArtifact.manifest?.stack || "runtime"} running
            {session?.sandbox ? ` on ${session.sandbox}` : ""}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleRestart}
              className="rounded-md px-2 py-1 text-slate-300 hover:bg-white/[0.06] hover:text-white"
            >
              Restart
            </button>
            <a
              href={previewUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-slate-300 hover:bg-white/[0.06] hover:text-white"
            >
              <ExternalLink size={12} />
              Open
            </a>
          </div>
        </div>
        <iframe
          title="Runtime preview"
          src={previewUrl}
          className="min-h-0 flex-1 bg-white"
          sandbox="allow-scripts allow-forms allow-modals allow-popups allow-same-origin"
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[#0d0f14]">
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-indigo-500/20 bg-indigo-500/10 text-indigo-300">
          {isBusy ? <Loader2 size={19} className="animate-spin" /> : <Play size={18} />}
        </div>
        <h3 className="text-[15px] font-semibold text-slate-100">
          {isBusy ? "Starting runtime preview" : isTerminalRuntime ? "Terminal runtime" : "Runtime preview"}
        </h3>
        <p className="mt-2 max-w-sm text-[13px] leading-6 text-slate-500">
          {error ||
            (isTerminalRuntime
              ? "This artifact ran in Docker but does not expose a web server. Output is shown in the logs below."
              : "The Preview Manager is building this artifact in an isolated Docker runtime and will attach the preview URL here.")}
        </p>

        {(error || ["error", "exited", "stopped"].includes(session?.status)) && (
          <button
            type="button"
            onClick={handleRestart}
            className="mt-5 inline-flex items-center gap-2 rounded-lg border border-indigo-500/30 bg-indigo-500 px-3 py-2 text-[12px] font-semibold text-white hover:bg-indigo-400"
          >
            <RefreshCw size={13} />
            Restart preview
          </button>
        )}
      </div>

      {(logs || error) && (
        <pre className="max-h-48 overflow-auto border-t border-white/[0.08] bg-black/30 p-4 text-left text-[11px] leading-5 text-slate-400">
          {error || logs}
        </pre>
      )}
    </div>
  );
}

function ConsoleView({ logs }) {
  return (
    <div className="h-full bg-[#05070b]">
      <pre className="h-full overflow-auto p-4 text-[12px] leading-6 text-slate-300">
        {logs || "Runtime output will appear here."}
      </pre>
    </div>
  );
}

function ProblemsView({ problems }) {
  if (!problems.length) {
    return (
      <div className="flex h-full items-center justify-center bg-[#0d0f14] px-6 text-center text-[13px] text-slate-500">
        No problems detected.
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-[#0d0f14] p-4">
      <div className="space-y-2">
        {problems.map((problem, index) => (
          <div
            key={`${problem}-${index}`}
            className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-[12px] leading-5 text-red-200"
          >
            {problem}
          </div>
        ))}
      </div>
    </div>
  );
}

function ArtifactPanelContent({
  activeFile,
  artifact,
  canPreview,
  copied,
  draftFiles,
  file,
  handleCopy,
  handleEditorChange,
  onClose,
  PreviewIcon,
  previewLabel,
  previewModel,
  renderPreview,
  runtimeState,
  setActiveFile,
  setCollapsed,
  setTab,
  tab
}) {
  const hasRuntimeTools =
    previewModel?.type === "runtime" ||
    Boolean(runtimeState.logs) ||
    runtimeState.problems.length > 0;
  const displayTab =
    (tab === "console" || tab === "problems") && !hasRuntimeTools
      ? canPreview
        ? "preview"
        : "code"
      : tab;

  return (
    <div className="flex h-full flex-col bg-[#0d0f14]">
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.06] px-4">
        <button
          onClick={onClose ?? (() => setCollapsed(true))}
          className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-slate-500 transition-colors duration-150 hover:bg-white/[0.05] hover:text-slate-200"
        >
          {onClose ? <X size={15} /> : <PanelRightClose size={15} />}
        </button>

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-indigo-500/20 bg-indigo-500/10">
            <FiCode className="text-indigo-400" size={12} />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-[13px] font-medium text-slate-200">{artifact.title}</h2>
            {canPreview && (
              <p className="truncate text-[10px] font-medium text-slate-600">{previewLabel}</p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {tab === "code" && file && (
            <button
              onClick={handleCopy}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg border-none bg-transparent px-2.5 py-1.5 text-[11px] font-medium text-slate-400 transition-colors duration-150 hover:bg-white/[0.05] hover:text-slate-200"
            >
              {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
              {copied ? "Copied" : "Copy"}
            </button>
          )}

          {canPreview && (
            <div className="flex items-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.04] p-1">
              <button
                onClick={() => setTab("code")}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors duration-150 ${
                  displayTab === "code" ? "bg-indigo-500 text-white" : "text-slate-500 hover:text-slate-200"
                }`}
              >
                <Code2 size={11} /> Files
              </button>
              <button
                onClick={() => setTab("preview")}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors duration-150 ${
                  displayTab === "preview" ? "bg-indigo-500 text-white" : "text-slate-500 hover:text-slate-200"
                }`}
              >
                <PreviewIcon size={11} /> Preview
              </button>
              {hasRuntimeTools && (
                <>
                  <button
                    onClick={() => setTab("console")}
                    className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors duration-150 ${
                      displayTab === "console" ? "bg-indigo-500 text-white" : "text-slate-500 hover:text-slate-200"
                    }`}
                  >
                    <PanelRightOpen size={11} /> Console
                  </button>
                  <button
                    onClick={() => setTab("problems")}
                    className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors duration-150 ${
                      displayTab === "problems" ? "bg-indigo-500 text-white" : "text-slate-500 hover:text-slate-200"
                    }`}
                  >
                    <FileText size={11} /> Problems
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {displayTab === "code" && draftFiles.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="flex shrink-0 overflow-x-auto border-b border-white/[0.06] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {draftFiles.map((item, index) => (
              <button
                key={`${item.name}-${index}`}
                onClick={() => setActiveFile(index)}
                className={`relative cursor-pointer whitespace-nowrap border-r border-white/[0.05] bg-transparent px-4 py-2.5 text-[11px] font-medium transition-colors duration-150 ${
                  activeFile === index ? "text-indigo-400" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {item.name}
                {activeFile === index && (
                  <motion.div layoutId="filetab" className="absolute bottom-0 left-0 right-0 h-[2px] rounded-t-full bg-indigo-500" />
                )}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="min-h-0 flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          {displayTab === "preview" && canPreview ? (
            <motion.div
              key={`preview-${previewModel.type}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="h-full w-full"
            >
              {renderPreview()}
            </motion.div>
          ) : displayTab === "console" ? (
            <motion.div
              key="console"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="h-full w-full"
            >
              <ConsoleView logs={runtimeState.logs} />
            </motion.div>
          ) : displayTab === "problems" ? (
            <motion.div
              key="problems"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="h-full w-full"
            >
              <ProblemsView problems={runtimeState.problems} />
            </motion.div>
          ) : (
            <motion.div
              key={`code-${activeFile}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="h-full w-full"
            >
              {file ? (
                <Editor
                  theme="vs-dark"
                  language={detectLanguage(file.name || "")}
                  value={file.content || getFileUrl(file) || ""}
                  onChange={handleEditorChange}
                  options={{
                    readOnly: !("content" in file),
                    minimap: { enabled: false },
                    fontSize: 13,
                    wordWrap: "on",
                    automaticLayout: true,
                    scrollBeyondLastLine: false,
                    padding: { top: 16 },
                    lineNumbers: "on",
                    renderLineHighlight: "none"
                  }}
                />
              ) : (
                <div className="flex h-full items-center justify-center px-6 text-center text-[13px] text-slate-500">
                  Preview-only artifact
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function ArtifactPanelBody({ artifact }) {
  const initialFiles = artifact?.files?.map(item => ({ ...item })) || [];
  const [tab, setTab] = useState(() =>
    getPreviewModel(artifact, initialFiles, 0) ? "preview" : "code"
  );
  const [activeFile, setActiveFile] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [draftFiles, setDraftFiles] = useState(() => initialFiles);
  const [runtimeState, setRuntimeState] = useState({
    session: null,
    logs: "",
    problems: []
  });

  const file = draftFiles[activeFile];
  const previewModel = useMemo(
    () => getPreviewModel(artifact, draftFiles, activeFile),
    [artifact, draftFiles, activeFile]
  );
  const canPreview = Boolean(previewModel);
  const previewLabel = previewModel ? FILE_TYPE_LABELS[previewModel.type] : "Preview";
  const PreviewIcon = previewModel ? PREVIEW_ICONS[previewModel.type] || Eye : Eye;

  const handleRuntimeUpdate = useCallback(({ session, logs }) => {
    setRuntimeState({
      session,
      logs: logs || "",
      problems: extractProblems(logs || "")
    });
  }, []);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(file?.content || getFileUrl(file) || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleEditorChange = value => {
    setDraftFiles(files =>
      files.map((item, index) =>
        index === activeFile
          ? {
              ...item,
              content: value ?? ""
            }
          : item
      )
    );
  };

  const renderPreview = () => {
    if (!previewModel) return null;

    if (previewModel.type === "runtime") {
      return <RuntimePreview artifact={artifact} files={draftFiles} onRuntimeUpdate={handleRuntimeUpdate} />;
    }

    if (previewModel.type === "markdown") {
      return <MarkdownPreview content={previewModel.content} />;
    }

    if (previewModel.type === "framework") {
      return <FrameworkPreviewNotice stack={previewModel.stack} />;
    }

    if (previewModel.type === "pdf") {
      return (
        <iframe
          title="PDF preview"
          src={previewModel.url}
          className="h-full w-full bg-white"
        />
      );
    }

    if (previewModel.type === "ppt") {
      return (
        <div className="flex h-full flex-col bg-slate-950">
          <div className="flex h-10 items-center justify-between border-b border-white/[0.08] px-3 text-[11px] text-slate-400">
            <span className="truncate">{previewModel.file?.name || artifact.title}</span>
            {previewModel.url && (
              <a
                href={previewModel.url}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 rounded-md px-2 py-1 text-slate-300 hover:bg-white/[0.06] hover:text-white"
              >
                Open file
              </a>
            )}
          </div>
          <iframe
            title="Slide preview"
            src={getOfficeViewerUrl(previewModel.url)}
            className="min-h-0 flex-1 bg-white"
            allowFullScreen
          />
        </div>
      );
    }

    const srcDoc =
      previewModel.type === "react"
        ? buildReactPreviewDoc(previewModel.files)
        : previewModel.type === "mermaid"
          ? buildMermaidPreviewDoc(previewModel.content)
          : buildHtmlPreviewDoc(previewModel.files);

    return (
      <iframe
        title={`${previewLabel} preview`}
        sandbox="allow-scripts allow-forms allow-modals allow-popups"
        srcDoc={srcDoc}
        className="h-full w-full bg-white"
      />
    );
  };

  return (
    <>
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed bottom-24 right-4 z-40 flex cursor-pointer items-center gap-2 rounded-xl border-none bg-indigo-600 px-3.5 py-2 text-[12px] font-medium text-white shadow-lg shadow-indigo-500/20 transition-colors duration-150 hover:bg-indigo-500 lg:hidden"
      >
        <FiCode size={13} />
        View Artifact
      </button>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              key="mob-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm lg:hidden"
            />
            <motion.div
              key="mob-drawer"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="fixed inset-y-0 right-0 z-50 w-[88vw] max-w-[420px] overflow-hidden border-l border-white/[0.06] lg:hidden"
            >
              <ArtifactPanelContent
                activeFile={activeFile}
                artifact={artifact}
                canPreview={canPreview}
                copied={copied}
                draftFiles={draftFiles}
                file={file}
                handleCopy={handleCopy}
                handleEditorChange={handleEditorChange}
                onClose={() => setMobileOpen(false)}
                PreviewIcon={PreviewIcon}
                previewLabel={previewLabel}
                previewModel={previewModel}
                renderPreview={renderPreview}
                runtimeState={runtimeState}
                setActiveFile={setActiveFile}
                setCollapsed={setCollapsed}
                setTab={setTab}
                tab={tab}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {!collapsed ? (
          <motion.div
            key="open"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: "clamp(340px, 38%, 680px)", opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            className="hidden h-full shrink-0 flex-col overflow-hidden border-l border-white/[0.06] lg:flex"
          >
            <ArtifactPanelContent
              activeFile={activeFile}
              artifact={artifact}
              canPreview={canPreview}
              copied={copied}
              draftFiles={draftFiles}
              file={file}
              handleCopy={handleCopy}
              handleEditorChange={handleEditorChange}
              PreviewIcon={PreviewIcon}
              previewLabel={previewLabel}
              previewModel={previewModel}
              renderPreview={renderPreview}
              runtimeState={runtimeState}
              setActiveFile={setActiveFile}
              setCollapsed={setCollapsed}
              setTab={setTab}
              tab={tab}
            />
          </motion.div>
        ) : (
          <motion.div
            key="collapsed"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 48, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            className="hidden h-full w-12 shrink-0 flex-col items-center gap-3 border-l border-white/[0.06] bg-[#0d0f14] py-4 lg:flex"
          >
            <button
              onClick={() => setCollapsed(false)}
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-slate-500 transition-colors duration-150 hover:bg-white/[0.05] hover:text-slate-200"
            >
              <PanelRightOpen size={15} />
            </button>
            <div className="flex flex-1 items-center justify-center">
              <p
                className="whitespace-nowrap text-[10px] font-medium uppercase tracking-widest text-slate-600"
                style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
              >
                {artifact.title}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default function ArtifactPanel() {
  const { artifacts } = useSelector(state => state.message);
  const artifact = artifacts?.[0];

  if (!artifact) return null;

  const artifactKey = `${artifact.id || ""}-${artifact.title || ""}-${artifact.createdAt || ""}`;

  return <ArtifactPanelBody key={artifactKey} artifact={artifact} />;
}
