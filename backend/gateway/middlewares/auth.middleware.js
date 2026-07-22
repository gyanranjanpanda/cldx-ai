import jwt from "jsonwebtoken";

import { JWT_SECRET } from "../../shared/jwt.js";

export const protect = async (req, res, next) => {
  try {
    const sessionToken = req?.cookies?.session;

    if (!sessionToken) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    let decoded;
    try {
      // Try JWT verification first (new format)
      decoded = jwt.verify(sessionToken, JWT_SECRET);
    } catch {
      return res.status(401).json({ message: "Session Expired" });
    }

    req.user = decoded;
    if (decoded && (decoded.userId || decoded._id)) {
      req.headers["x-user-id"] = String(decoded.userId || decoded._id);
    }
    next();
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};