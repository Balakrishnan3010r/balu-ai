# ⚡ Balu AI — Full Stack AI Chatbot

A professional AI chatbot web application built from scratch, inspired by ChatGPT.

## 🚀 Live Features
- 💬 Real AI conversations (Llama 3.3 70B via Groq)
- 🔐 Email + password authentication with verification
- 👤 Guest mode — use without login
- 🖼️ Image upload with AI vision analysis
- 📄 PDF & document upload
- 💾 Chat history saved to MongoDB per user
- 📱 Mobile responsive design
- ⚡ Real-time streaming responses
- 🎨 ChatGPT-style dark UI with markdown rendering

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML, CSS, JavaScript |
| Backend | Node.js, Express.js |
| Database | MongoDB |
| AI Models | Llama 3.3 70B, Llama 4 Scout (vision) |
| Auth | JWT + Nodemailer |
| API | Groq API |

## ⚙️ Setup

1. Clone the repo
```bash
   git clone https://github.com/yourusername/balu-ai.git
```

2. Install dependencies
```bash
   cd backend
   npm install
```

3. Create `.env` file in backend folder
```env
   GROQ_API_KEY=your_groq_key
   MONGODB_URI=mongodb://localhost:27017/chatbot
   PORT=3000
   JWT_SECRET=your_secret
   EMAIL_USER=your_gmail
   EMAIL_PASS=your_app_password
```

4. Start the server
```bash
   node server.js
```

5. Open browser → `http://localhost:3000`

## 👨‍💻 Developer
Built by **Balakrishnan R** — Computer Science Student