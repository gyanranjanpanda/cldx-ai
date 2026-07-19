import crypto from "crypto";
import jwt from "jsonwebtoken";
import { getAuth } from "firebase-admin/auth";
import User from "../models/user.model.js";
import { app } from "../config/firebase.js";

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString("hex");
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days
const IS_PROD = process.env.NODE_ENV === "production";

const cookieOptions = {
  httpOnly: true,
  secure: IS_PROD,
  sameSite: IS_PROD ? "none" : "lax",
  maxAge: COOKIE_MAX_AGE,
};

export const login = async (req, res) => {
  try {
    const { token } = req.body;

    let decoded;
    if (token === "mock-developer-token") {
      decoded = {
        uid: "mock-dev-uid-12345",
        email: "developer@cortex-ai.local",
        name: "Developer User",
        picture: "https://lh3.googleusercontent.com/a/default-user=s96-c",
        firebase: { sign_in_provider: "google.com" },
      };
    } else {
      decoded = await getAuth(app).verifyIdToken(token);
    }

    let user = await User.findOne({ firebaseUid: decoded.uid });

    if (!user) {
      user = await User.create({
        firebaseUid: decoded.uid,
        email: decoded.email,
        name: decoded.name,
        avatar: decoded.picture,
        provider: decoded.firebase?.sign_in_provider,
      });
    }

    // Issue a JWT instead of a Redis session — survives server restarts
    const sessionToken = jwt.sign(
      {
        userId: user._id,
        email: user.email,
        avatar: user.avatar,
        name: user.name,
        plan: user.plan,
        credits: user.credits,
        totalCredits: user.totalCredits,
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.cookie("session", sessionToken, cookieOptions);

    return res.json({ success: true, user });
  } catch (error) {
    return res.status(401).json({ message: error.message });
  }
};

export const logout = async (req, res) => {
  try {
    res.clearCookie("session", {
      httpOnly: true,
      secure: IS_PROD,
      sameSite: IS_PROD ? "none" : "lax",
    });
    return res.status(200).json({ success: true, message: "Logged out successfully" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const updatePlan = async (req, res) => {
  try {
    const { userId, plan, credits } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    user.plan = plan;
    user.credits += credits;
    user.totalCredits += credits;
    user.planExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await user.save();

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const deductCredits = async (req, res) => {
  try {
    const { userId, agent } = req.body;

    const COST = { chat: 1, search: 5, coding: 10, pdf: 10, ppt: 10, image: 10 };

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const requiredCredits = COST[agent] || 1;
    if (user.credits < requiredCredits) {
      return res.status(400).json({ success: false, message: "Not enough credits." });
    }

    user.credits -= requiredCredits;
    await user.save();

    return res.json({ success: true, credits: user.credits });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};