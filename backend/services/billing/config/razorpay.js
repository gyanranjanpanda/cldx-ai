import Razorpay from "razorpay";
import dotenv from "dotenv";

dotenv.config();

// Guard instantiation — Razorpay throws at construction if keys are missing
const razorpay = (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET)
  ? new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    })
  : null;

export default razorpay;