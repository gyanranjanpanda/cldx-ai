import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "";

export const protect = async (req, res, next) => {
  try {
    const sessionToken = req?.cookies?.session;

    if (!sessionToken) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    let decoded;
    try {
      // Try JWT verification first (new format)
      decoded = jwt.verify(sessionToken, JWT_SECRET || require("crypto").randomBytes(32).toString("hex"));
    } catch {
      return res.status(401).json({ message: "Session Expired" });
    }

    req.user = decoded;
    next();
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};