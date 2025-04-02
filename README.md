# enhanced-llm-playground Enhanced LLM Playground (Hosted via Fireworks.ai)
This project provides an interactive web-based playground for experimenting with various Large Language Models (LLMs). It's optimized for speed, flexibility, with COD reasoning, and real-time response streaming by leveraging Fireworks.ai as the backend for model inference.

 Key Features
Hosted on Fireworks.ai: All models used are served via Fireworks.ai, ensuring fast, cost-effective, and scalable performance.

Multi-model Support: Easily switch between models like mistralai, phi, and others (check /api folder).

Streaming Responses: Real-time token-by-token output.

Serverless API Integration: Built using Vercel's edge functions to proxy requests securely to Fireworks APIs.

Frontend Ready: Minimal and clean UI powered by index.html for direct interaction.

🛠️ Technologies Used
Node.js (API layer)

Fireworks.ai (Model hosting)

Vercel (Serverless deployment)

HTML/CSS/JS (Frontend)

 Folder Structure
/api/ – Serverless API handlers for model proxying and streaming

/index.html – Frontend playground interface

vercel.json – Routing and config for Vercel deployment

✅ Quick Start
bash
Copy
Edit
# Clone the repo
git clone https://github.com/your-username/enhanced-llm-playground.git

# Deploy to Vercel or your serverless provider
📌 Note
To use this playground, you’ll need a valid Fireworks.ai API key, which should be passed securely via headers when making requests.
