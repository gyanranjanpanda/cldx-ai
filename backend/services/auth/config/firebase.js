import { initializeApp, cert } from "firebase-admin/app";

import serviceAccount from "../serviceAccount.json" with { type: "json" };

let credential;
try {
  let sa = serviceAccount;
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  }
  if (sa && sa.private_key && sa.private_key.includes("BEGIN PRIVATE KEY")) {
    credential = cert(sa);
  }
} catch (e) {
  console.warn("Could not initialize Firebase credential cert:", e.message);
}

export const app = initializeApp({
  ...(credential ? { credential } : { projectId: serviceAccount.project_id || "cortex-ai-dummy" }),
});