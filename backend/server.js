const passport = require("passport");
const session = require("express-session");
const GoogleStrategy = require("passport-google-oauth20").Strategy;


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


const app = express();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

app.use(cors({
    origin: ["https://balu-ai.onrender.com", "http://localhost:3000"],
    credentials: true
}));
app.use(express.json({ limit: "20mb" }));
app.use(session({
    secret: process.env.JWT_SECRET,
    resave: false,
    saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.NODE_ENV === "production"
        ? "https://balu-ai.onrender.com/api/auth/google/callback"
        : "http://localhost:3000/api/auth/google/callback"
}, async (accessToken, refreshToken, profile, done) => {
    try {
        let user = await User.findOne({ googleId: profile.id });
        if (!user) {
            // Generate unique username from Google profile
            const baseName = profile.displayName.replace(/\s+/g, "_").slice(0, 20);
            const uniqueName = baseName + "_" + Math.floor(1000 + Math.random() * 9000);
            user = await User.create({
                name: uniqueName,
                googleId: profile.id,
                avatar: profile.photos[0]?.value
            });
        }
        const token = jwt.sign({ userId: user._id, name: user.name }, process.env.JWT_SECRET, { expiresIn: "7d" });
        done(null, { token, name: user.name });
    } catch (err) {
        console.error("Google OAuth error:", err.message);
        done(err, null);
    }
}));
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
    name: { type: String, unique: true },
    phone: { type: String, unique: true, sparse: true },
    password: String,
    googleId: { type: String, unique: true, sparse: true },
    avatar: String,
    resetOtp: String,
    resetOtpExpiry: Date,
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

// ── Fast2SMS OTP sender ──
const axios = require("axios");

async function sendOTP(phone, otp) {

    console.log("API KEY:", process.env.FAST2SMS_API_KEY); // add this line
    await axios.post("https://www.fast2sms.com/dev/bulkV2", {
        variables_values: otp,
        route: "otp",
        numbers: phone
    }, {
        headers: {
            "authorization": process.env.FAST2SMS_API_KEY,
            "Content-Type": "application/json"
        }
    });
}

// Register
app.post("/api/auth/register", async (req, res) => {
    const { name, phone, password } = req.body;
    if (!name || !phone || !password)
        return res.status(400).json({ error: "All fields required" });
    if (password.length < 6)
        return res.status(400).json({ error: "Password must be at least 6 characters" });
    if (!/^\d{10}$/.test(phone))
        return res.status(400).json({ error: "Enter valid 10-digit phone number" });
    try {
        const exists = await User.findOne({ $or: [{ name }, { phone }] });
        if (exists) return res.status(400).json({ error: "Username or phone already exists" });

        const hashed = await bcrypt.hash(password, 12);
        const user = await User.create({ name, phone, password: hashed });
        const token = jwt.sign({ userId: user._id, name: user.name }, process.env.JWT_SECRET, { expiresIn: "7d" });
        res.json({ success: true, token, name: user.name });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Login
app.post("/api/auth/login", async (req, res) => {
    const { name, password } = req.body;
    try {
        const user = await User.findOne({ name });
        if (!user) return res.status(400).json({ error: "Username not found" });

        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(400).json({ error: "Wrong password" });

        const token = jwt.sign({ userId: user._id, name: user.name }, process.env.JWT_SECRET, { expiresIn: "7d" });
        res.json({ success: true, token, name: user.name });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Forgot Password - Send OTP
app.post("/api/auth/forgot-password", async (req, res) => {
    const { phone } = req.body;
    try {
        const user = await User.findOne({ phone });
        if (!user) return res.status(400).json({ error: "Phone number not registered" });

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        user.resetOtp = otp;
        user.resetOtpExpiry = new Date(Date.now() + 10 * 60 * 1000);
        await user.save();

        await sendOTP(phone, otp);
        res.json({ success: true, message: "OTP sent to your phone" });
    } catch (err) {
        res.status(500).json({ error: "Failed to send OTP: " + err.message });
    }
});

// Reset Password
app.post("/api/auth/reset-password", async (req, res) => {
    const { phone, otp, newPassword } = req.body;
    try {
        const user = await User.findOne({ phone });
        if (!user) return res.status(400).json({ error: "Phone not found" });
        if (user.resetOtp !== otp) return res.status(400).json({ error: "Wrong OTP" });
        if (new Date() > user.resetOtpExpiry) return res.status(400).json({ error: "OTP expired" });
        if (newPassword.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });

        user.password = await bcrypt.hash(newPassword, 12);
        user.resetOtp = null;
        user.resetOtpExpiry = null;
        await user.save();

        res.json({ success: true, message: "Password reset successful" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Google OAuth routes
app.get("/api/auth/google",
    passport.authenticate("google", { scope: ["profile"] })
);

app.get("/api/auth/google/callback",
    passport.authenticate("google", { failureRedirect: "/auth.html" }),
    (req, res) => {
        const { token, name } = req.user;
        res.redirect(`/auth.html?token=${token}&name=${encodeURIComponent(name)}`);
    }
);






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
                { role: "system", content: "You are Aura AI, a smart assistant. Analyze images carefully and describe them in clean plain conversational text without unnecessary headers." },
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
                    role: "system", content: `You are Aura AI, a smart, friendly and professional AI assistant.

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
app.listen(PORT, () => console.log(`🚀 Aura AI running at http://localhost:${PORT}`));