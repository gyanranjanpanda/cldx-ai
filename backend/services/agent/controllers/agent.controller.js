import redis from "../../../shared/redis/redis.js";
import { graph } from "../graph/supervisor.graph.js";
import { addMessage } from "../utils/memory.js";
import axios from "axios";
import { enrichArtifacts } from "../preview/artifactDetector.js";
import Message from "../../chat/models/message.model.js";

const saveMessage = async (payload) => {
  if (process.env.CHAT_SERVICE) {
    try {
      await axios.post(`${process.env.CHAT_SERVICE}/save-message`, payload);
      return;
    } catch (e) {
      console.warn("CHAT_SERVICE save-message HTTP request failed, using direct DB fallback:", e.message);
    }
  }
  try {
    await Message.create(payload);
  } catch (err) {
    console.error("Failed to save message to DB:", err.message);
  }
};

export const chat = async (req, res, next) => {
  try {
    const {
      prompt,
      conversationId,
      agent
    } = req.body;

    const userId = req.user?.userId || req.user?._id || req.headers["x-user-id"] || "default-user";

    console.log("Agent Chat Request:", { prompt, conversationId, agent, userId });

    await addMessage(
      conversationId,
      "user",
      prompt
    );

    await saveMessage({
      conversationId,
      role: "user",
      content: prompt
    });

    const result = await graph.invoke({
      prompt,
      conversationId,
      userId,
      agent,
      file: req.file
    });

    console.log("after res", result);

    const artifacts = enrichArtifacts(
      result.artifacts || []
    );

    await addMessage(
      conversationId,
      "assistant",
      result.response
    );

    await saveMessage({
      conversationId,
      role: "assistant",
      content: result.response,
      images: result.images,
      artifacts: artifacts
    });

    return res.json({
      success: true,
      answer: result.response,
      images: result.images,
      artifacts: artifacts
    });

  } catch (error) {
    next(error);
  }
};
