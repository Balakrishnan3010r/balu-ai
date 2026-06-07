require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const Groq = require("groq-sdk");
const path = require("path");
const multer = require("multer");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");

const app = express();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(express.static(path.join(__dirname, "../frontend")));

// ── Uploads ──
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + "_" + file.originalname)
});
const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf", "text/plain"];
        allowed.includes(file.mimetype) ? cb(null, true) : cb(new Error("File type not allowed"));
    }
});
app.use("/uploads", express.static(uploadDir));

// ── MongoDB ──
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log("✅ MongoDB connected"))
    .catch(err => console.error("❌ MongoDB error:", err));

// User Schema
const userSchema = new mongoose.Schema({
    name: String,
    email: { type: String, unique: true },
    password: String,
    isVerified: { type: Boolean, default: false },
    verifyCode: String,
    verifyExpiry: Date,
    createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model("User", userSchema);

// Message Schema
const messageSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    sessionId: String,
    role: String,
    content: String,
    fileInfo: {
        name: { type: String, default: null },
        type: { type: String, default: null },
        url: { type: String, default: null }
    },
    timestamp: { type: Date, default: Date.now }
});
const Message = mongoose.model("Message", messageSchema);

// ── Email sender ──
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

function sendVerificationEmail(email, name, code) {
    return transporter.sendMail({
        from: `"Balu AI" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: "Verify your Balu AI account",
        html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:32px;background:#0f0f0f;color:#e8e8e8;border-radius:16px;">
        <h2 style="color:#a78bff;">⚡ Balu AI</h2>
        <p>Hi <strong>${name}</strong>! Welcome to Balu AI.</p>
        <p>Your verification code is:</p>
        <div style="background:#1a1a1a;border:1px solid #6c47ff;border-radius:12px;padding:24px;text-align:center;margin:24px 0;">
          <span style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#a78bff;">${code}</span>
        </div>
        <p style="color:#888;font-size:13px;">This code expires in 15 minutes.</p>
      </div>
    `
    });
}

// ── Auth middleware ──
function optionalAuth(req, res, next) {
    const token = req.headers.authorization?.split(" ")[1];
    if (token) {
        try { req.user = jwt.verify(token, process.env.JWT_SECRET); } catch { }
    }
    next();
}
function authMiddleware(req, res, next) {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "No token provided" });
    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch {
        res.status(401).json({ error: "Invalid token" });
    }
}

// ── Auth Routes ──

// Register
app.post("/api/auth/register", async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
        return res.status(400).json({ error: "All fields required" });

    if (password.length < 6)
        return res.status(400).json({ error: "Password must be at least 6 characters" });

    try {
        const exists = await User.findOne({ email });
        if (exists) return res.status(400).json({ error: "Email already registered" });

        const hashed = await bcrypt.hash(password, 12);
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expiry = new Date(Date.now() + 15 * 60 * 1000);

        const user = await User.create({
            name, email,
            password: hashed,
            verifyCode: code,
            verifyExpiry: expiry
        });

        await sendVerificationEmail(email, name, code);
        res.json({ success: true, message: "Verification code sent to your email!", userId: user._id });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Verify email
app.post("/api/auth/verify", async (req, res) => {
    const { userId, code } = req.body;
    try {
        const user = await User.findById(userId);
        if (!user) return res.status(400).json({ error: "User not found" });
        if (user.isVerified) return res.status(400).json({ error: "Already verified" });
        if (user.verifyCode !== code) return res.status(400).json({ error: "Wrong code" });
        if (new Date() > user.verifyExpiry) return res.status(400).json({ error: "Code expired. Register again." });

        user.isVerified = true;
        user.verifyCode = null;
        user.verifyExpiry = null;
        await user.save();

        const token = jwt.sign({ userId: user._id, name: user.name, email: user.email }, process.env.JWT_SECRET, { expiresIn: "7d" });
        res.json({ success: true, token, name: user.name, email: user.email });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Login
app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ error: "Email not found" });
        if (!user.isVerified) return res.status(400).json({ error: "Please verify your email first" });

        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(400).json({ error: "Wrong password" });

        const token = jwt.sign({ userId: user._id, name: user.name, email: user.email }, process.env.JWT_SECRET, { expiresIn: "7d" });
        res.json({ success: true, token, name: user.name, email: user.email });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── File upload ──
app.post("/api/upload", optionalAuth, upload.single("file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const fileUrl = `/uploads/${req.file.filename}`;
    const fileType = req.file.mimetype;
    let extractedText = "";
    if (fileType === "text/plain") {
        extractedText = fs.readFileSync(req.file.path, "utf8").slice(0, 3000);
    }
    res.json({
        success: true, fileUrl,
        fileName: req.file.originalname,
        fileType, extractedText,
        isImage: fileType.startsWith("image/")
    });
});

// ── Chat route ──
app.post("/api/chat", optionalAuth, async (req, res) => {
    const { message, sessionId, history, fileContext } = req.body;
    if (!message || !sessionId) return res.status(400).json({ error: "message and sessionId required" });

    try {
        let userContent = message;
        if (fileContext && fileContext.text) {
            userContent = `The user uploaded "${fileContext.name}".\nContent:\n${fileContext.text}\n\nQuestion: ${message}`;
        }

        let messages;
        if (fileContext && fileContext.isImage && fileContext.base64) {
            messages = [
                { role: "system", content: "You are Balu AI, a smart assistant. Analyze images carefully and describe them in clean plain conversational text without unnecessary headers." },
                ...history,
                {
                    role: "user", content: [
                        { type: "text", text: message },
                        { type: "image_url", image_url: { url: `data:${fileContext.mimeType};base64,${fileContext.base64}` } }
                    ]
                }
            ];
        } else {
            messages = [
                {
                    role: "system", content: `You are Balu AI, a smart, friendly and professional AI assistant.

FORMATTING RULES:
- For casual conversation and greetings: use plain text only, no headers
- Use **bold** only for important terms
- Use bullet points only for lists of 3+ items
- Use headers (##, ###) ONLY for long structured responses like tutorials or guides
- Never start a response with a header
- Keep greetings and short answers clean and simple
- Be warm, concise and conversational` },
                ...history,
                { role: "user", content: userContent }
            ];
        }

        const model = (fileContext && fileContext.isImage)
            ? "meta-llama/llama-4-scout-17b-16e-instruct"
            : "llama-3.3-70b-versatile";
        // Set headers for streaming
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        const stream = await groq.chat.completions.create({
            model, messages, stream: true
        });

        let fullReply = "";

        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || "";
            if (content) {
                fullReply += content;
                res.write(`data: ${JSON.stringify({ content })}\n\n`);
            }
        }

        res.write(`data: [DONE]\n\n`);
        res.end();

        // Save to DB after streaming completes
        await Message.create({
            userId: req.user?.userId || null,
            sessionId, role: "user", content: message,
            fileInfo: fileContext
                ? { name: fileContext.name, type: fileContext.mimeType, url: fileContext.fileUrl || "" }
                : { name: null, type: null, url: null }
        });
        await Message.create({
            userId: req.user?.userId || null,
            sessionId, role: "assistant", content: fullReply,
            fileInfo: { name: null, type: null, url: null }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// ── History routes ──
app.get("/api/history/:sessionId", authMiddleware, async (req, res) => {
    try {
        const messages = await Message.find({ sessionId: req.params.sessionId, userId: req.user.userId }).sort({ timestamp: 1 });
        res.json(messages);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/sessions", authMiddleware, async (req, res) => {
    try {
        const sessions = await Message.aggregate([
            { $match: { role: "user", userId: new mongoose.Types.ObjectId(req.user.userId) } },
            { $sort: { timestamp: -1 } },
            { $group: { _id: "$sessionId", firstMessage: { $last: "$content" }, updatedAt: { $first: "$timestamp" } } },
            { $limit: 20 }
        ]);
        res.json(sessions);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Balu AI running at http://localhost:${PORT}`));