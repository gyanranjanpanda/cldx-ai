import razorpay from "../config/razorpay.js";
import { PLANS } from "../config/plans.js";
import Payment from "../models/payment.model.js";
import crypto from "crypto";
import axios from "axios";
import User from "../../auth/models/user.model.js";

const updateUserPlan = async (userId, plan, credits) => {
  if (process.env.AUTH_SERVICE) {
    try {
      await axios.patch(`${process.env.AUTH_SERVICE}/internal/update-plan`, {
        userId,
        plan,
        credits
      });
      return;
    } catch (e) {
      console.warn("AUTH_SERVICE update-plan HTTP request failed, using direct DB fallback:", e.message);
    }
  }
  try {
    const user = await User.findById(userId);
    if (user) {
      user.plan = plan;
      user.credits += credits;
      user.totalCredits += credits;
      user.planExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await user.save();
    }
  } catch (err) {
    console.error("Failed to update user plan in DB:", err.message);
  }
};

export const createOrder = async (req, res) => {
  try {
    const { plan } = req.body;
    const userId = req.headers["x-user-id"];
    const selectedPlan = PLANS[plan];

    if (!selectedPlan) {
      return res.status(400).json({
        success: false,
        message: "Invalid plan"
      });
    }

    if (!razorpay) {
      return res.status(500).json({
        success: false,
        message: "Razorpay credentials not configured."
      });
    }

    const order = await razorpay.orders.create({
      amount: selectedPlan.amount * 100,
      currency: "INR",
      receipt: `receipt_${Date.now()}`
    });

    await Payment.create({
      userId,
      orderId: order.id,
      amount: selectedPlan.amount,
      credits: selectedPlan.credits,
      plan: selectedPlan.id,
      currency: order.currency,
      status: "created"
    });

    return res.json({
      success: true,
      order,
      plan: selectedPlan
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    } = req.body;

    const generatedSignature = crypto
      .createHmac(
        "sha256",
        process.env.RAZORPAY_KEY_SECRET || ""
      )
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Payment verification failed"
      });
    }

    const payment = await Payment.findOne({
      orderId: razorpay_order_id
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found"
      });
    }

    payment.status = "paid";
    payment.paymentId = razorpay_payment_id;
    await payment.save();

    await updateUserPlan(payment.userId, payment.plan, payment.credits);

    return res.json({
      success: true,
      message: "Payment verified successfully"
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};