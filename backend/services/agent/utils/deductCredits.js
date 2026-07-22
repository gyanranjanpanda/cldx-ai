import axios from "axios";
import User from "../../auth/models/user.model.js";

const COST = {
  chat: 1,
  search: 5,
  coding: 10,
  pdf: 10,
  ppt: 10,
  image: 10
};

export const deductCredits = async (userId, agent) => {
  const authServiceUrl = process.env.AUTH_SERVICE 
    ? `${process.env.AUTH_SERVICE}/internal/deduct-credits`
    : null;

  if (authServiceUrl) {
    try {
      await axios.patch(authServiceUrl, { userId, agent });
      return;
    } catch (error) {
      if (error.response) {
        const response = error.response?.data;
        const err = new Error(response?.message || "Failed to deduct credits.");
        err.status = error.response?.status || 500;
        err.data = {
          success: false,
          title: response?.title || "Insufficient Credits",
          message: response?.message || "You don't have enough credits. Please upgrade your plan."
        };
        throw err;
      }
    }
  }

  // Fallback for single unified server mode or offline microservice
  if (!userId) return;
  const user = await User.findById(userId);
  if (!user) return;

  const requiredCredits = COST[agent] || 1;
  if (user.credits < requiredCredits) {
    const err = new Error("Not enough credits.");
    err.status = 400;
    err.data = {
      success: false,
      title: "Insufficient Credits",
      message: "You don't have enough credits. Please upgrade your plan."
    };
    throw err;
  }

  user.credits -= requiredCredits;
  await user.save();
};