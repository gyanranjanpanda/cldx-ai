import Conversation from "../models/conversation.model.js";
import Message from "../models/message.model.js";

export const createConversation = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?._id || req.headers["x-user-id"];
    console.log("createConversation userId:", userId);
    
    if (!userId) {
      return res.status(400).json({ message: "User ID is required to create a conversation." });
    }

    const conversation = await Conversation.create({ userId });
    return res.json(conversation);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const getConversations = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?._id || req.headers["x-user-id"];
    
    if (!userId) {
      return res.json([]);
    }

    const conversations = await Conversation.find({ userId }).sort({ updatedAt: -1 });
    return res.json(conversations);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const saveMessage = async (req, res) => {
  try {
    const {
      conversationId,
      role,
      content,
      images,
      artifacts
    } = req.body;

    const message = await Message.create({
      conversationId,
      role,
      images,
      content,
      artifacts: artifacts || []
    });

    return res.json(message);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const getMessages = async (req, res) => {
  try {
    const messages = await Message.find({
      conversationId: req.params.id
    }).sort({ createdAt: 1 });

    return res.json(messages);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const updateConversation = async (req, res) => {
  try {
    const { conversationId, title } = req.body;
    const conversation = await Conversation.findByIdAndUpdate(conversationId, { title });
    return res.json(conversation);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};