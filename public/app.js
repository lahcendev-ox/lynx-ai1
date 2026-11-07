(() => {
  const $ = (s) => document.querySelector(s);
  const userKey = "lynx_device_id";
  const nameKey = "lynx_first_name";

  let userName = localStorage.getItem(nameKey);

  const nameModal = $("#nameModal");
  const nameForm = $("#nameForm");
  const firstNameInput = $("#firstNameInput");

  function updateProfile() {
    const profileName = $(".profile-text b");
    const avatar = $(".profile .avatar");

    if (profileName) profileName.textContent = userName || "Guest user";
    if (avatar) avatar.textContent = userName ? userName.charAt(0).toUpperCase() : "L";
  }

  function requestName() {
    if (!userName && nameModal) {
      nameModal.style.display = "flex";
      document.body.style.overflow = "hidden";
      setTimeout(() => firstNameInput?.focus(), 100);
    } else {
      if (nameModal) nameModal.style.display = "none";
      document.body.style.overflow = "";
      updateProfile();
    }
  }

  nameForm?.addEventListener("submit", (e) => {
    e.preventDefault();

    const value = firstNameInput.value.trim();

    if (!value) {
      firstNameInput.focus();
      return;
    }

    userName = value.slice(0, 30);
    localStorage.setItem(nameKey, userName);

    nameModal.style.display = "none";
    document.body.style.overflow = "";

    updateProfile();
    toast("مرحباً بك في LYNX AI، " + userName);
  });

  requestName();

  let userId = localStorage.getItem(userKey);
  if (!userId || !/^[a-f0-9-]{36}$/i.test(userId)) {
    userId = crypto.randomUUID();
    localStorage.setItem(userKey, userId);
  }

  let activeId = null, conversations = [], attachedFile = null, busy = false;
  const list = $("#conversationList"), messages = $("#messages"), welcome = $("#welcome");
  const input = $("#messageInput"), sendBtn = $("#sendBtn"), fileInput = $("#fileInput");

  async function api(url, options = {}) {
    const headers = { "x-lynx-user": userId, ...(options.headers || {}) };
    const res = await fetch(url, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  function toast(msg) {
    const el = $("#toast"); el.textContent = msg; el.classList.add("show");
    clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove("show"), 2600);
  }

  function titleFor(id) { return conversations.find(c => c.id === id)?.title || "محادثة جديدة"; }

  function renderList() {
    list.innerHTML = "";
    if (!conversations.length) {
      list.innerHTML = '<div style="padding:12px 8px;color:var(--muted);font-size:11px">لا توجد محادثات بعد.</div>'; return;
    }
    conversations.forEach(c => {
      const row = document.createElement("div");
      row.className = "conversation-item" + (c.id === activeId ? " active" : "");
      row.innerHTML = `<span class="conv-icon">◷</span><span class="conv-title"></span><button class="delete-conv" title="حذف المحادثة">×</button>`;
      row.querySelector(".conv-title").textContent = c.title || "محادثة جديدة";
      row.addEventListener("click", (e) => { if (!e.target.closest(".delete-conv")) openConversation(c.id); });
      row.querySelector(".delete-conv").addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!confirm("هل تريد حذف هذه المحادثة نهائياً؟")) return;
        try {
          await api(`/api/conversations/${c.id}`, { method: "DELETE" });
          conversations = conversations.filter(x => x.id !== c.id);
          if (activeId === c.id) { activeId = null; messages.innerHTML = ""; showWelcome(true); }
          renderList();
        } catch (err) { toast(err.message); }
      });
      list.appendChild(row);
    });
  }

  function showWelcome(show) { welcome.style.display = show ? "" : "none"; }

  function safeMarkdown(text) {
    const raw = window.marked ? marked.parse(text || "", { breaks: true, gfm: true }) : (text || "").replaceAll("<","&lt;");
    return window.DOMPurify ? DOMPurify.sanitize(raw) : raw;
  }

  function appendMessage(role, text, time = new Date(), file = null) {
    const node = document.createElement("article");
    node.className = `message ${role === "user" ? "user" : "assistant"}`;

    const avatar = role === "user" ? (userName ? userName.charAt(0).toUpperCase() : "U") : "L";
    const label = role === "user" ? (userName || "أنت") : "LYNX AI";

    node.innerHTML = `<div class="message-avatar"></div><div class="message-body"><div class="message-meta"><b></b><span>${new Date(time).toLocaleTimeString("ar-DZ",{hour:"2-digit",minute:"2-digit"})}</span></div><div class="bubble"></div><div class="message-actions"><button class="copy">نسخ</button></div></div>`;

    node.querySelector(".message-avatar").textContent = avatar;
    node.querySelector(".message-meta b").textContent = label;

    const bubble = node.querySelector(".bubble");

    if (role === "assistant") bubble.innerHTML = safeMarkdown(text);
    else {
      const p = document.createElement("p"); p.textContent = text || "";
      bubble.appendChild(p);
      if (file) { const f = document.createElement("small"); f.textContent = `📎 ${file.name}`; f.style.color = "var(--muted)"; bubble.appendChild(f); }
    }

    node.querySelector(".copy").addEventListener("click", async () => {
      await navigator.clipboard.writeText(text || ""); toast("تم نسخ النص.");
    });

    messages.appendChild(node);
    node.querySelectorAll("pre code").forEach(el => window.hljs?.highlightElement(el));
    if (window.renderMathInElement) {}
    $("#chatArea").scrollTop = $("#chatArea").scrollHeight;
  }

  async function refreshList() {
    const data = await api("/api/bootstrap");
    conversations = data.conversations || [];
    renderList();
  }

  async function createConversation() {
    const data = await api("/api/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    conversations.unshift({ id: data.conversation.id, title: data.conversation.title, updatedAt: data.conversation.updatedAt, count: 0 });
    activeId = data.conversation.id; messages.innerHTML = ""; showWelcome(true);
    $("#currentTitle").textContent = "محادثة جديدة"; renderList(); input.focus();
    $("#sidebar").classList.remove("open");
  }

  async function openConversation(id) {
    try {
      const data = await api(`/api/conversations/${id}`);
      activeId = id; messages.innerHTML = ""; showWelcome(!data.conversation.messages?.length);
      $("#currentTitle").textContent = data.conversation.title || "محادثة جديدة";
      (data.conversation.messages || []).forEach(m => appendMessage(m.role === "user" ? "user" : "assistant", m.text, m.createdAt, m.file));
      renderList(); $("#sidebar").classList.remove("open");
    } catch (e) { toast(e.message); }
  }

  function showTyping() {
    const n = document.createElement("article"); n.className = "message assistant"; n.id = "typing";
    n.innerHTML = '<div class="message-avatar">L</div><div class="message-body"><div class="message-meta"><b>LYNX AI</b><span>يكتب الآن</span></div><div class="typing"><span></span><span></span><span></span></div></div>';
    messages.appendChild(n); $("#chatArea").scrollTop = $("#chatArea").scrollHeight;
  }

  function setBusy(v) { busy = v; sendBtn.disabled = v; sendBtn.textContent = v ? "…" : "↑"; }

  async function sendMessage(text) {
    if (busy) return;
    if (!activeId) await createConversation();
    if (!text.trim() && !attachedFile) return;

    const prompt = text.trim(), file = attachedFile;
    input.value = ""; resizeInput(); attachedFile = null; renderAttachment();
    showWelcome(false);
    appendMessage("user", prompt, Date.now(), file ? { name: file.name } : null);

    setBusy(true); showTyping();

    try {
      const form = new FormData();
      form.append("conversationId", activeId); form.append("message", prompt);
      if (file) form.append("file", file);

      const data = await api("/api/chat", { method: "POST", body: form });
      $("#typing")?.remove();
      appendMessage("assistant", data.answer);

      const found = conversations.find(c => c.id === activeId);
      if (found) { found.title = data.conversation.title; found.updatedAt = data.conversation.updatedAt; }

      $("#currentTitle").textContent = data.conversation.title;
      renderList();
    } catch (e) {
      $("#typing")?.remove();
      appendMessage("assistant", `تعذّر إكمال الطلب: **${e.message}**`);
      toast(e.message);
    } finally { setBusy(false); input.focus(); }
  }

  function resizeInput() { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 170) + "px"; }

  function renderAttachment() {
    const box = $("#attachmentPreview"); box.innerHTML = "";
    if (!attachedFile) return;

    const pill = document.createElement("div"); pill.className = "file-pill";

    if (attachedFile.type.startsWith("image/")) {
      const img = document.createElement("img"); img.src = URL.createObjectURL(attachedFile); pill.appendChild(img);
    } else { const icon = document.createElement("span"); icon.textContent = "📄"; pill.appendChild(icon); }

    const name = document.createElement("span"); name.textContent = attachedFile.name; pill.appendChild(name);
    const remove = document.createElement("button"); remove.textContent = "×"; remove.type = "button"; remove.onclick = () => { attachedFile = null; renderAttachment(); }; pill.appendChild(remove);
    box.appendChild(pill);
  }

  $("#chatForm").addEventListener("submit", e => { e.preventDefault(); sendMessage(input.value); });
  input.addEventListener("input", resizeInput);

  input.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#chatForm").requestSubmit(); }
  });

  $("#newChat").addEventListener("click", createConversation);
  $("#attachBtn").addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", () => {
    if (!fileInput.files[0]) return;
    if (fileInput.files[0].size > 15 * 1024 * 1024) { toast("الحد الأقصى للملف 15MB."); fileInput.value = ""; return; }
    attachedFile = fileInput.files[0]; renderAttachment(); fileInput.value = "";
  });

  document.querySelectorAll(".suggestion").forEach(b => b.addEventListener("click", () => { input.value = b.dataset.prompt; resizeInput(); input.focus(); }));

  $("#openSidebar").onclick = () => $("#sidebar").classList.add("open");
  $("#closeSidebar").onclick = () => $("#sidebar").classList.remove("open");

  // Sidebar Visibility
const settingsToggle = $("#settingsToggle");
const sidebar = $("#sidebar");

settingsToggle?.addEventListener("click", () => {
  if (!sidebar) return;

  const hidden = sidebar.classList.toggle("sidebar-hidden");

  settingsToggle.title = hidden
    ? "إظهار القائمة الجانبية"
    : "إخفاء القائمة الجانبية";

  settingsToggle.setAttribute("aria-expanded", String(!hidden));

  document.body.classList.remove("sidebar-open");
});

  function toggleTheme() { setTheme(!document.body.classList.contains("light")); }
  $("#themeToggle").onclick = toggleTheme; $("#topTheme").onclick = toggleTheme;
  setTheme(localStorage.getItem("lynx_theme") === "light");

  const palettes = {
    violet:["#9b7bff","155,123,255","Violet"], blue:["#4d9fff","77,159,255","Blue"],
    cyan:["#42d9d0","66,217,208","Cyan"], emerald:["#48c98b","72,201,139","Emerald"],
    rose:["#ff729e","255,114,158","Rose"], amber:["#f4b65f","244,182,95","Amber"]
  };

  function setPalette(name) {
    const p = palettes[name] || palettes.violet;
    document.documentElement.style.setProperty("--accent", p[0]);
    document.documentElement.style.setProperty("--accent-rgb", p[1]);
    $("#paletteLabel").textContent = p[2]; localStorage.setItem("lynx_palette", name);
    document.querySelectorAll(".swatch").forEach(s => s.classList.toggle("active", s.dataset.color === name));
  }

  $("#paletteToggle").onclick = () => $("#palettePop").classList.toggle("open");
  $("#closePalette").onclick = () => $("#palettePop").classList.remove("open");
  document.querySelectorAll(".swatch").forEach(s => s.onclick = () => setPalette(s.dataset.color));
  setPalette(localStorage.getItem("lynx_palette") || "violet");

  document.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); createConversation(); }
    if (e.key === "Escape") { $("#palettePop").classList.remove("open"); $("#sidebar").classList.remove("open"); }
  });

  (async () => {
    try {
      await refreshList();
      if (conversations.length) await openConversation(conversations[0].id);
    } catch (e) { toast(e.message); }
  })();

})();
