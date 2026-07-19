import { ChatGoogleGenerativeAI }
  from "@langchain/google-genai";
import { ChatGroq } from "@langchain/groq"
import dotenv from "dotenv"
dotenv.config()
import { ChatOpenRouter } from "@langchain/openrouter";

const hasGroqKey = !!process.env.GROQ_API_KEY;
const hasOpenRouterKey = !!process.env.OPENROUTER_API_KEY;

const openRouter = hasOpenRouterKey
  ? new ChatOpenRouter({
      model: "deepseek/deepseek-chat",
      temperature: 0,
      maxTokens: 2500,
    })
  : null;

export const gemini = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash",
  apiKey: process.env.GOOGLE_API_KEY,
});

const groq = hasGroqKey
  ? new ChatGroq({
      model: "llama-3.3-70b-versatile",
      temperature: 0,
      maxTokens: undefined,
      maxRetries: 2,
    })
  : null;

export const getModel = (agent) => {
  const activeGroq = groq ?? gemini;
  const activeOpenRouter = openRouter ?? gemini;

  switch (agent) {

      case "coding":
        return activeOpenRouter;

      case "image":
        return activeGroq;

      case "search":
        return activeGroq;

      case "chat":
        return activeGroq;
      case "vision":
        return gemini;
      default:
        return activeGroq;

    }

  }