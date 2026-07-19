import express from "express";
import { chat } from "../controllers/agent.controller.js";
import {
  getPreviewStatus,
  proxyPreview,
  startPreview,
  stopPreview,
  streamPreviewEvents
} from "../controllers/preview.controller.js";
import multer from "../config/multer.js";



const router =
express.Router();

router.post(
 "/chat",
 multer.single("file"),
 chat
);

router.post(
 "/preview/start",
 startPreview
);

router.get(
 "/preview/:id/status",
 getPreviewStatus
);

router.get(
 "/preview/:id/events",
 streamPreviewEvents
);

router.delete(
 "/preview/:id",
 stopPreview
);

router.use(
 "/preview/:id/proxy",
 proxyPreview
);

export default router;
