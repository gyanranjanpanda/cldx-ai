import {
  getSession,
  proxySessionRequest,
  startSession,
  stopSession,
  streamSessionEvents
} from "../preview/previewManager.js";

export const startPreview = async (req, res, next) => {
  try {
    const session = await startSession(req.body.artifact);

    res.json({
      success: true,
      session
    });
  } catch (error) {
    next(error);
  }
};

export const getPreviewStatus = (req, res) => {
  const session = getSession(req.params.id);

  if (!session) {
    return res.status(404).json({
      success: false,
      message: "Preview session not found."
    });
  }

  return res.json({
    success: true,
    session
  });
};

export const stopPreview = async (req, res, next) => {
  try {
    const session = await stopSession(req.params.id);

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Preview session not found."
      });
    }

    return res.json({
      success: true,
      session
    });
  } catch (error) {
    next(error);
  }
};

export const proxyPreview = (req, res) => {
  proxySessionRequest(req, res);
};

export const streamPreviewEvents = (req, res) => {
  streamSessionEvents(req, res);
};
