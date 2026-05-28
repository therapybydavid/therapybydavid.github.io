// TherapyByDavid chatbot widget. Drop-in, no dependencies.
//
// Usage on the site:
//   <link rel="stylesheet" href="/chatbot.css">
//   <script>
//     window.TBD_CHAT_ENDPOINT = "https://chatbot.therapybydavid.com/chat";
//   </script>
//   <script src="/chatbot.js" defer></script>

(function () {
  const ENDPOINT =
    window.TBD_CHAT_ENDPOINT || "https://chatbot.therapybydavid.com/chat";

  const GREETING =
    "Hi — I'm an intake assistant for David's practice. I can answer questions about therapy modalities, rates, insurance, or help you book a free consult. What's on your mind?";

  const sessionId = getOrCreateSessionId();
  const history = []; // [{role: 'user'|'assistant', content}]
  let sending = false;

  const root = document.createElement("div");
  root.className = "tbd-chat";
  root.innerHTML = `
    <button class="tbd-chat__bubble" aria-label="Open chat">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2z"/>
      </svg>
    </button>
    <div class="tbd-chat__window" role="dialog" aria-label="Intake assistant">
      <div class="tbd-chat__header">
        <div class="tbd-chat__title">Intake assistant</div>
        <div class="tbd-chat__sub">Questions, fit, booking — not therapy</div>
        <button class="tbd-chat__close" aria-label="Close chat">&times;</button>
      </div>
      <div class="tbd-chat__disclaimer">
        Not a therapist and not crisis support. If you're in crisis, call or text
        <strong>988</strong>, or call <strong>911</strong> if you're in immediate danger.
      </div>
      <div class="tbd-chat__messages" aria-live="polite"></div>
      <form class="tbd-chat__form">
        <textarea class="tbd-chat__input" rows="1" placeholder="Ask a question…"
          aria-label="Your message"></textarea>
        <button type="submit" class="tbd-chat__send">Send</button>
      </form>
    </div>
  `;
  document.body.appendChild(root);

  const bubble = root.querySelector(".tbd-chat__bubble");
  const closeBtn = root.querySelector(".tbd-chat__close");
  const messagesEl = root.querySelector(".tbd-chat__messages");
  const form = root.querySelector(".tbd-chat__form");
  const input = root.querySelector(".tbd-chat__input");
  const sendBtn = root.querySelector(".tbd-chat__send");

  bubble.addEventListener("click", () => {
    root.classList.toggle("tbd-chat--open");
    if (root.classList.contains("tbd-chat--open")) {
      if (messagesEl.children.length === 0) renderBot(GREETING);
      setTimeout(() => input.focus(), 50);
    }
  });
  closeBtn.addEventListener("click", () => root.classList.remove("tbd-chat--open"));

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 120) + "px";
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (sending) return;
    const text = input.value.trim();
    if (!text) return;

    input.value = "";
    input.style.height = "auto";
    renderUser(text);
    history.push({ role: "user", content: text });

    sending = true;
    sendBtn.disabled = true;
    const typingEl = renderTyping();

    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, messages: history }),
      });

      typingEl.remove();

      if (!res.ok) {
        if (res.status === 429) {
          renderBot("You're sending messages too quickly. Give it a minute and try again.");
        } else {
          renderBot("Sorry — something glitched on my end. Try again in a moment, or email David directly.");
        }
        return;
      }

      const data = await res.json();
      if (data.crisis) {
        renderCrisis(data.message);
        // Don't add crisis reply to history — we want the next turn to also be screened fresh.
      } else {
        renderBot(data.message);
        history.push({ role: "assistant", content: data.message });
      }
    } catch (err) {
      typingEl.remove();
      renderBot("Sorry — I couldn't reach the server. Check your connection and try again.");
    } finally {
      sending = false;
      sendBtn.disabled = false;
      input.focus();
    }
  });

  function renderUser(text) {
    appendMsg(text, "tbd-chat__msg--user");
  }
  function renderBot(text) {
    appendMsg(text, "tbd-chat__msg--bot");
  }
  function renderCrisis(text) {
    appendMsg(text, "tbd-chat__msg--crisis");
  }
  function renderTyping() {
    return appendMsg("…", "tbd-chat__msg--typing");
  }
  function appendMsg(text, cls) {
    const el = document.createElement("div");
    el.className = "tbd-chat__msg " + cls;
    el.textContent = text;
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return el;
  }

  function getOrCreateSessionId() {
    try {
      const k = "tbd_chat_session";
      let v = sessionStorage.getItem(k);
      if (!v) {
        v = "s_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
        sessionStorage.setItem(k, v);
      }
      return v;
    } catch {
      return "s_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    }
  }
})();
