// ── Mobile sidebar toggle ──
const hamburgerBtn = document.getElementById("hamburgerBtn");
const sidebarEl = document.querySelector(".sidebar");
const overlayEl = document.getElementById("sidebarOverlay");

function openSidebar() {
    sidebarEl.classList.add("open");
    overlayEl.classList.add("show");
}

function closeSidebar() {
    sidebarEl.classList.remove("open");
    overlayEl.classList.remove("show");
}

hamburgerBtn?.addEventListener("click", () => {
    sidebarEl.classList.contains("open") ? closeSidebar() : openSidebar();
});

overlayEl?.addEventListener("click", closeSidebar);

// Close sidebar on mobile when new chat clicked
document.getElementById("newChatBtn")?.addEventListener("click", () => {
    if (window.innerWidth <= 768) closeSidebar();
});
newChatBtn?.addEventListener("click", () => {
    if (window.innerWidth <= 768) closeSidebar();
});

const API_BASE = "https://balu-ai.onrender.com/api";
const token = localStorage.getItem("token");
const userName = localStorage.getItem("userName") || "Guest";
const isLoggedIn = !!token;

// ── API helper ──
async function apiFetch(url, options = {}) {
    const isFormData = options.body instanceof FormData;
    const headers = {};
    if (!isFormData) headers["Content-Type"] = "application/json";
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await window.fetch(url, { ...options, headers });
    if (res.status === 401) {
        localStorage.clear();
        window.location.reload();
    }
    return res;
}

let sessionId = generateId();
let history = [];
let currentFile = null;

function generateId() {
    return "session_" + Math.random().toString(36).slice(2, 10) + "_" + Date.now();
}

const chatMessages = document.getElementById("chatMessages");
const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const historyList = document.getElementById("historyList");
const fileInput = document.getElementById("fileInput");
const filePreview = document.getElementById("filePreview");
const filePreviewInner = document.getElementById("filePreviewInner");
const removeFileBtn = document.getElementById("removeFile");

// ── Sidebar auth section (runs ONCE) ──
const footer = document.querySelector(".sidebar-footer");
if (footer) {
    if (isLoggedIn) {
        footer.innerHTML = `
      <div class="user-pill">
        <div class="user-avatar-sm">${userName.charAt(0).toUpperCase()}</div>
        <span>${userName}</span>
      </div>
      <button id="logoutBtn" style="
        width:100%; margin-top:8px; padding:8px 10px;
        background:transparent; border:1px solid #2a2a2a;
        border-radius:8px; color:#666; cursor:pointer;
        font-size:13px; font-family:'Inter',Arial,sans-serif;">
        🚪 Logout
      </button>`;
        document.getElementById("logoutBtn").onclick = () => {
            localStorage.clear();
            window.location.reload();
        };
    } else {
        footer.innerHTML = `
      <button onclick="window.location.href='/auth.html'" style="
        width:100%; padding:10px; margin-bottom:8px;
        background:#6c47ff; color:white; border:none;
        border-radius:8px; font-size:13px; cursor:pointer;
        font-family:'Inter',Arial,sans-serif; font-weight:500;">
        Sign in
      </button>
      <button onclick="window.location.href='/auth.html?tab=register'" style="
        width:100%; padding:10px;
        background:transparent; color:#aaa;
        border:1px solid #2a2a2a; border-radius:8px;
        font-size:13px; cursor:pointer;
        font-family:'Inter',Arial,sans-serif;">
        Create account
      </button>
      <p style="font-size:11px;color:#444;text-align:center;margin-top:10px;">
        Sign in to save your chats
      </p>`;
    }
}

// ── Markdown renderer ──
function renderMarkdown(text) {
    return text
        .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/^#### (.+)$/gm, '<h4 style="font-size:14px;font-weight:600;color:#ccc;margin:6px 0 3px;">$1</h4>')
        .replace(/^## (.+)$/gm, '<h2 style="font-size:17px;font-weight:600;color:#fff;margin:10px 0 4px;">$1</h2>')
        .replace(/^# (.+)$/gm, '<h1 style="font-size:20px;font-weight:700;color:#fff;margin:12px 0 6px;">$1</h1>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/^- (.+)$/gm, '<li>$1</li>')
        .replace(/(<li>.*<\/li>)/gs, '<ul style="padding-left:20px;margin:6px 0;">$1</ul>')
        .replace(/\n\n/g, '</p><p>')
        .replace(/^(?!<)(.+)$/gm, '<p>$1</p>');
}

// ── File upload ──
fileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    filePreview.style.display = "flex";
    filePreviewInner.innerHTML = `<span class="file-icon">⏳</span><div><div class="file-name">Uploading...</div></div>`;

    try {
        const res = await apiFetch(`${API_BASE}/upload`, { method: "POST", body: formData });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        currentFile = data;

        if (data.isImage) {
            filePreviewInner.innerHTML = `
        <img src="https://balu-ai.onrender.com
${data.fileUrl}" alt="preview" />
        <div>
          <div class="file-name">${data.fileName}</div>
          <div class="file-size">Image ready</div>
        </div>`;
        } else {
            filePreviewInner.innerHTML = `
        <span class="file-icon">${data.fileType === "application/pdf" ? "📄" : "📝"}</span>
        <div>
          <div class="file-name">${data.fileName}</div>
          <div class="file-size">Ready to analyze</div>
        </div>`;
        }
    } catch (err) {
        filePreviewInner.innerHTML = `<span class="file-icon">❌</span><div class="file-name">Upload failed</div>`;
        currentFile = null;
    }
});

removeFileBtn.addEventListener("click", () => {
    currentFile = null;
    fileInput.value = "";
    filePreview.style.display = "none";
});

// ── Add message ──
function addMessage(text, sender, fileData = null) {
    document.getElementById("welcomeScreen")?.remove();

    const row = document.createElement("div");
    row.classList.add("message-row", sender);

    if (sender === "bot") {
        const avatar = document.createElement("div");
        avatar.classList.add("bot-avatar");
        avatar.textContent = "⚡";
        row.appendChild(avatar);
    }

    const bubble = document.createElement("div");
    bubble.classList.add("bubble", sender === "user" ? "user-bubble" : "bot-bubble");

    if (fileData) {
        const attach = document.createElement("div");
        attach.classList.add("file-attachment");
        if (fileData.isImage) {
            attach.innerHTML = `<img src="https://balu-ai.onrender.com
${fileData.fileUrl}" alt="${fileData.fileName}" />`;
        } else {
            attach.innerHTML = `
        <div class="doc-attachment">
          <span>${fileData.fileType === "application/pdf" ? "📄" : "📝"}</span>
          <span>${fileData.fileName}</span>
        </div>`;
        }
        bubble.appendChild(attach);
    }

    const textEl = document.createElement("div");
    if (sender === "bot") {
        textEl.innerHTML = renderMarkdown(text);
    } else {
        textEl.textContent = text;
    }
    bubble.appendChild(textEl);

    row.appendChild(avatar);
    row.appendChild(bubble);
    chatMessages.appendChild(row);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function showTyping() {
    document.getElementById("welcomeScreen")?.remove();
    const row = document.createElement("div");
    row.classList.add("message-row", "bot");
    row.id = "typingRow";

    const avatar = document.createElement("div");
    avatar.classList.add("avatar", "bot-avatar");
    avatar.textContent = "⚡";

    const bubble = document.createElement("div");
    bubble.classList.add("bubble", "bot-bubble");
    bubble.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';

    row.appendChild(avatar);
    row.appendChild(bubble);
    chatMessages.appendChild(row);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function removeTyping() {
    document.getElementById("typingRow")?.remove();
}

// ── Sidebar history ──
function addToSidebar(sid, label) {
    if (document.querySelector(`[data-sid="${sid}"]`)) return;
    document.querySelectorAll(".history-item").forEach(i => i.classList.remove("active"));
    const item = document.createElement("div");
    item.classList.add("history-item", "active");
    item.dataset.sid = sid;
    item.textContent = "💬 " + label.slice(0, 28) + (label.length > 28 ? "..." : "");
    item.onclick = () => loadSession(sid);
    historyList.prepend(item);
}

async function loadSession(sid) {
    sessionId = sid;
    history = [];
    chatMessages.innerHTML = "";
    try {
        const res = await apiFetch(`${API_BASE}/history/${sid}`);
        const messages = await res.json();
        messages.forEach(msg => {
            addMessage(msg.content, msg.role === "user" ? "user" : "bot");
            history.push({ role: msg.role, content: msg.content });
        });
        document.querySelectorAll(".history-item").forEach(i => i.classList.remove("active"));
        document.querySelector(`[data-sid="${sid}"]`)?.classList.add("active");
    } catch (err) {
        addMessage("Could not load history.", "bot");
    }
}

async function loadAllSessions() {
    try {
        const res = await apiFetch(`${API_BASE}/sessions`);
        const sessions = await res.json();
        sessions.forEach(s => {
            if (!document.querySelector(`[data-sid="${s._id}"]`)) {
                const item = document.createElement("div");
                item.classList.add("history-item");
                item.dataset.sid = s._id;
                item.textContent = "💬 " + s.firstMessage.slice(0, 28);
                item.onclick = () => loadSession(s._id);
                historyList.appendChild(item);
            }
        });
    } catch (err) { console.log("No sessions yet"); }
}

function useChip(el) {
    userInput.value = el.textContent;
    sendMessage();
}
async function typewriterEffect(element, fullText) {
    element.innerHTML = renderMarkdown(fullText);
    const chars = element.innerText.length;
    element.style.opacity = "1";
}

let typewriterQueue = [];
let isTyping = false;

async function typewriterEffect(bubble, fullText) {
    return new Promise((resolve) => {
        bubble.innerHTML = renderMarkdown(fullText);
        resolve();
    });
}

// ── Send message ──
async function sendMessage() {
    const text = userInput.value.trim();
    if (!text && !currentFile) return;

    const messageText = text || `Tell me about this ${currentFile?.isImage ? "image" : "document"}`;

    if (history.length === 0 && isLoggedIn) addToSidebar(sessionId, messageText);

    addMessage(messageText, "user", currentFile);
    userInput.value = "";
    userInput.style.height = "auto";
    sendBtn.disabled = true;
    showTyping();

    let fileContext = null;
    if (currentFile) {
        fileContext = {
            name: currentFile.fileName,
            mimeType: currentFile.fileType,
            isImage: currentFile.isImage,
            text: currentFile.extractedText || "",
            fileUrl: currentFile.fileUrl
        };

        if (currentFile.isImage) {
            https://balu-ai.onrender.com 

            try {
                const imgRes = await window.fetch(`${currentFile.fileUrl}`);
                const blob = await imgRes.blob();
                const base64 = await new Promise(resolve => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result.split(",")[1]);
                    reader.readAsDataURL(blob);
                });
                fileContext.base64 = base64;
            } catch (e) { console.error("Image encode error", e); }
        }
    }

    history.push({ role: "user", content: messageText });

    currentFile = null;
    fileInput.value = "";
    filePreview.style.display = "none";

    try {
        const res = await apiFetch(`${API_BASE}/chat`, {
            method: "POST",
            body: JSON.stringify({ message: messageText, sessionId, history, fileContext })
        });

        if (!res.ok) {
            const err = await res.json();
            removeTyping();
            addMessage("Error: " + err.error, "bot");
            sendBtn.disabled = false;
            return;
        }

        // ── Streaming response ──
        removeTyping();

        // Create streaming bubble
        const row = document.createElement("div");
        row.classList.add("message-row", "bot");
        const avatar = document.createElement("div");
        avatar.classList.add("avatar", "bot-avatar");
        avatar.textContent = "⚡";
        const bubble = document.createElement("div");
        bubble.classList.add("bubble", "bot-bubble");
        row.appendChild(avatar);
        row.appendChild(bubble);
        chatMessages.appendChild(row);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullReply = "";
        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop();

            for (const line of lines) {
                if (line.startsWith("data: ")) {
                    const data = line.slice(6).trim();
                    if (data === "[DONE]") break;
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.content) {
                            // Typewriter: add one character at a time
                            for (const char of parsed.content) {
                                fullReply += char;
                                bubble.innerHTML = renderMarkdown(fullReply);
                                chatMessages.scrollTop = chatMessages.scrollHeight;
                                await new Promise(r => setTimeout(r, 18));
                            }
                        }
                    } catch { }
                }
            }
        }

        history.push({ role: "assistant", content: fullReply });

    } catch (err) {
        removeTyping();
        addMessage("Network error: " + err.message, "bot");
    }
    sendBtn.disabled = false;
}

// ── New chat ──
newChatBtn.addEventListener("click", () => {
    sessionId = generateId();
    history = [];
    currentFile = null;
    fileInput.value = "";
    filePreview.style.display = "none";
    chatMessages.innerHTML = `
    <div class="welcome" id="welcomeScreen">
      <div class="welcome-icon">⚡</div>
      <h1>How can I help you, ${userName}?</h1>
      <p>Ask anything or upload an image / document</p>
      <div class="suggestion-chips">
        <div class="chip" onclick="useChip(this)">Explain machine learning</div>
        <div class="chip" onclick="useChip(this)">Write a Python script</div>
        <div class="chip" onclick="useChip(this)">Help me with my resume</div>
        <div class="chip" onclick="useChip(this)">What is data mining?</div>
      </div>
    </div>`;
    document.querySelectorAll(".history-item").forEach(i => i.classList.remove("active"));
});

// ── Auto resize textarea ──
userInput.addEventListener("input", () => {
    userInput.style.height = "auto";
    userInput.style.height = userInput.scrollHeight + "px";
});

// ── Enter to send ──
userInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

sendBtn.addEventListener("click", sendMessage);

// ── Load sessions only if logged in ──
if (isLoggedIn) loadAllSessions();