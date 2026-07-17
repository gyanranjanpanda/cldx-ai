# ⚡ cldx.ai — Multi-Agent AI Platform

A premium multi-agent full-stack platform built with Express, Node.js, React, and LangGraph.

[![Deploy to Render](https://render.com/images/deploy-to-render.svg)](https://render.com/deploy?repo=https://github.com/gyanranjanpanda/cldx-ai)

---

## 🚀 Live Cloud Deployment (1-Click)

Click the **Deploy to Render** button above. It will automatically load the `render.yaml` blueprint and provision:
1. **API Gateway** (Public Web Service)
2. **Auth Service** (Private Service)
3. **Chat Service** (Private Service)
4. **Agent Service** (Private Service)
5. **Billing Service** (Private Service)
6. **Vite Frontend** (Static Web Site)
7. **Redis Cache** (Managed Database Instance)

*Note: You will be prompted in Render to provide your cloud keys (such as Groq, Gemini, and MongoDB Atlas URLs) during setup.*

---

## 💻 Local Development Setup

To run all 6 microservices locally on your machine:

1. Ensure **Redis** and **MongoDB** are running on your machine:
   ```bash
   brew services start mongodb-community
   brew services start redis
   ```
2. Start all services:
   ```bash
   node start-all.js
   ```

All microservices will run concurrently in the background. Access the frontend locally at **http://localhost:5173**.
