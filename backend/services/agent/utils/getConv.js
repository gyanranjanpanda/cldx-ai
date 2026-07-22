import axios from "axios";
import Message from "../../chat/models/message.model.js";

export const getConversationHistory = async (conversationId) => {
  if (process.env.CHAT_SERVICE) {
    try {
      const response = await axios.get(
        `${process.env.CHAT_SERVICE}/get-messages/${conversationId}`
      );
      return response.data;
    } catch (e) {
      console.warn("CHAT_SERVICE request failed, using direct DB fallback:", e.message);
    }
  }

  try {
    const messages = await Message.find({ conversationId }).sort({ createdAt: 1 });
    return messages;
  } catch (err) {
    console.error("Failed to fetch messages from DB:", err.message);
    return [];
  }
};