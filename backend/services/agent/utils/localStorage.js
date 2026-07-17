import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.resolve(__dirname, "../../../gateway/uploads");

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export const saveFileLocally = async (buffer, fileName, contentType) => {
  const filePath = path.join(UPLOADS_DIR, fileName);
  fs.writeFileSync(filePath, buffer);
  return fileName;
};

export const getLocalDownloadUrl = (fileName) => {
  const gatewayUrl = process.env.GATEWAY_URL || "http://localhost:8000";
  return `${gatewayUrl}/uploads/${fileName}`;
};
