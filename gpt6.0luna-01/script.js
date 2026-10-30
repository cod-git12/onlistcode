"use strict";

const STORAGE_KEY = "nova-ai-conversations-v1";
const SETTINGS_KEY = "nova-ai-settings-v1";

const elements = {
  body: document.body,
  sidebar: document.getElementById("sidebar"),
  sidebarOverlay: document.getElementById("sidebarOverlay"),
  conversationList: document.getElementById("conversationList"),
  chatArea: document.getElementById("chatArea"),
  messageList: document.getElementById("messageList"),
  welcomePanel: document.getElementById("welcomePanel"),
  composerForm: document.getElementById("composerForm"),
  messageInput: document.getElementById("messageInput"),
  newChatButton: document.getElementById("newChatButton"),
  clearAllButton: document.getElementById("clearAllButton"),
  openSidebarButton: document.getElementById("openSidebarButton"),
  closeSidebarButton: document.getElementById("closeSidebarButton"),
  settingsButton: document.getElementById("settingsButton"),
  topSettingsButton: document.getElementById("topSettingsButton"),
  settingsModal: document.getElementById("settingsModal"),
  closeSettingsButton: document.getElementById("closeSettingsButton"),
  cancelSettingsButton: document.getElementById("cancelSettingsButton"),
  saveSettingsButton: document.getElementById("saveSettingsButton"),
  themeSelect: document.getElementById("themeSelect"),
  fontSizeSelect: document.getElementById("fontSizeSelect"),
  enterToSendCheckbox: document.getElementById("enterToSendCheckbox"),
  exportButton: document.getElementById("exportButton"),
  voiceButton: document.getElementById("voiceButton"),
  toast: document.getElementById("toast")
};

let conversations = loadConversations();
let settings = loadSettings();
let activeConversationId = null;
let isResponding = false;
let recognition = null;
let toastTimer = null;

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function loadConversations() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveConversations() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
}

function loadSettings() {
  const defaultSettings = {
    theme: "light",
    fontSize: "medium",
    enterToSend: true
  };

  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    return { ...defaultSettings, ...(saved || {}) };
  } catch {
    return defaultSettings;
  }
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function applySettings() {
  elements.body.dataset.theme = settings.theme;
  elements.body.dataset.fontSize = settings.fontSize;
  elements.themeSelect.value = settings.theme;
  elements.fontSizeSelect.value = settings.fontSize;
  elements.enterToSendCheckbox.checked = settings.enterToSend;
}

function getActiveConversation() {
  return conversations.find(
    conversation => conversation.id === activeConversationId
  );
}

function createConversation() {
  const conversation = {
    id: createId(),
    title: "新しいチャット",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: []
  };

  conversations.unshift(conversation);
  activeConversationId = conversation.id;
  saveConversations();
  renderConversationList();
  renderActiveConversation();
  closeSidebar();
  elements.messageInput.focus();
}

function ensureConversation() {
  if (!activeConversationId || !getActiveConversation()) {
    createConversation();
  }
}

function renderConversationList() {
  elements.conversationList.innerHTML = "";

  if (conversations.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-history";
    empty.textContent = "まだ会話履歴がありません。新しいチャットを開始してください。";
    elements.conversationList.appendChild(empty);
    return;
  }

  conversations
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .forEach(conversation => {
      const item = document.createElement("div");
      item.className = "conversation-item";

      if (conversation.id === activeConversationId) {
        item.classList.add("active");
      }

      const title = document.createElement("span");
      title.className = "conversation-title";
      title.textContent = conversation.title;

      const deleteButton = document.createElement("button");
      deleteButton.className = "conversation-delete";
      deleteButton.type = "button";
      deleteButton.textContent = "×";
      deleteButton.title = "この会話を削除";
      deleteButton.setAttribute("aria-label", "この会話を削除");

      deleteButton.addEventListener("click", event => {
        event.stopPropagation();
        deleteConversation(conversation.id);
      });

      item.appendChild(title);
      item.appendChild(deleteButton);

      item.addEventListener("click", () => {
        activeConversationId = conversation.id;
        renderConversationList();
        renderActiveConversation();
        closeSidebar();
      });

      elements.conversationList.appendChild(item);
    });
}

function renderActiveConversation() {
  const conversation = getActiveConversation();

  elements.messageList.innerHTML = "";

  if (!conversation || conversation.messages.length === 0) {
    elements.welcomePanel.hidden = false;
    return;
  }

  elements.welcomePanel.hidden = true;

  conversation.messages.forEach(message => {
    renderMessage(message);
  });

  scrollToBottom();
}

function renderMessage(message) {
  const wrapper = document.createElement("article");
  wrapper.className = `message ${message.role}`;

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = message.role === "user" ? "U" : "✦";

  const content = document.createElement("div");
  content.className = "message-content";

  const author = document.createElement("div");
  author.className = "message-author";
  author.textContent = message.role === "user" ? "YOU" : "NOVA AI";

  const text = document.createElement("div");
  text.className = "message-text";

  if (message.role === "assistant") {
    text.innerHTML = markdownToHtml(message.content);
  } else {
    text.textContent = message.content;
  }

  content.appendChild(author);
  content.appendChild(text);

  const tools = document.createElement("div");
  tools.className = "message-tools";

  const copyButton = document.createElement("button");
  copyButton.className = "copy-message-button";
  copyButton.type = "button";
  copyButton.textContent = "コピー";

  copyButton.addEventListener("click", async () => {
    const success = await copyText(message.content);
    copyButton.textContent = success ? "コピー済み" : "コピー失敗";

    setTimeout(() => {
      copyButton.textContent = "コピー";
    }, 1500);
  });

  tools.appendChild(copyButton);
  content.appendChild(tools);

  wrapper.appendChild(avatar);
  wrapper.appendChild(content);
  elements.messageList.appendChild(wrapper);

  text.querySelectorAll(".code-copy").forEach(button => {
    button.addEventListener("click", async () => {
      const code = button.dataset.code || "";
      const success = await copyText(code);
      button.textContent = success ? "コピー済み" : "コピー失敗";

      setTimeout(() => {
        button.textContent = "コピー";
      }, 1500);
    });
  });
}

function addMessage(role, content) {
  ensureConversation();

  const conversation = getActiveConversation();

  conversation.messages.push({
    id: createId(),
    role,
    content,
    createdAt: Date.now()
  });

  conversation.updatedAt = Date.now();

  if (role === "user" && conversation.title === "新しいチャット") {
    conversation.title = content
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 32);

    if (content.length > 32) {
      conversation.title += "…";
    }
  }

  saveConversations();
  renderConversationList();
  renderActiveConversation();
}

function deleteConversation(id) {
  const target = conversations.find(conversation => conversation.id === id);

  if (!target) {
    return;
  }

  const confirmed = confirm(`「${target.title}」を削除しますか？`);

  if (!confirmed) {
    return;
  }

  conversations = conversations.filter(conversation => conversation.id !== id);

  if (activeConversationId === id) {
    activeConversationId = conversations[0]?.id || null;
  }

  saveConversations();
  renderConversationList();
  renderActiveConversation();
  showToast("会話を削除しました");
}

function deleteAllConversations() {
  if (conversations.length === 0) {
    showToast("削除する会話がありません");
    return;
  }

  const confirmed = confirm("すべての会話履歴を削除しますか？");

  if (!confirmed) {
    return;
  }

  conversations = [];
  activeConversationId = null;
  saveConversations();
  renderConversationList();
  renderActiveConversation();
  showToast("すべての会話を削除しました");
}

async function sendMessage(content) {
  const text = content.trim();

  if (!text || isResponding) {
    return;
  }

  ensureConversation();
  elements.messageInput.value = "";
  autoResizeTextarea();
  addMessage("user", text);

  isResponding = true;
  const typingElement = renderTypingIndicator();

  await wait(650);

  typingElement.remove();

  const response = generateDemoResponse(text);
  addMessage("assistant", response);

  isResponding = false;
}

function renderTypingIndicator() {
  elements.welcomePanel.hidden = true;

  const wrapper = document.createElement("article");
  wrapper.className = "message assistant";

  wrapper.innerHTML = `
    <div class="avatar">✦</div>
    <div class="message-content">
      <div class="message-author">NOVA AI</div>
      <div class="typing-indicator">
        <span></span><span></span><span></span>
      </div>
    </div>
  `;

  elements.messageList.appendChild(wrapper);
  scrollToBottom();

  return wrapper;
}

function generateDemoResponse(text) {
  const lowerText = text.toLowerCase();

  if (
    lowerText.includes("コード") ||
    lowerText.includes("javascript") ||
    lowerText.includes("サンプル")
  ) {
    return `## サンプルコード

以下は、ボタンをクリックしたときにメッセージを表示するJavaScriptの例です。

\`\`\`javascript
const button = document.querySelector("#helloButton");

button.addEventListener("click", () => {
  alert("Hello, NOVA AI!");
});
\`\`\`

ポイントは、**DOM要素を取得してイベントを登録すること**です。`;
  }

  if (
    lowerText.includes("デザイン") ||
    lowerText.includes("ui") ||
    lowerText.includes("デザイン")
  ) {
    return `## 未来的なUIの提案

次の要素を組み合わせると、未来的で使いやすいUIになります。

- 明るい背景と透明感のあるカード
- 青や紫を使ったアクセントカラー
- 状態を明確に伝えるアニメーション
- 余白を活かしたレイアウト
- スマートフォンでも操作しやすいボタン

装飾だけでなく、**現在の状態がわかること**を優先すると実用性が高まります。`;
  }

  if (text.includes("説明") || text.includes("わかりやすく")) {
    return `## わかりやすく説明する方法

複雑な内容は、次の順番で整理すると伝わりやすくなります。

1. まず結論を示す
2. 理由を説明する
3. 具体例を出す
4. 注意点を補足する

> 最初に全体像を提示すると、読み手が情報を整理しやすくなります。`;
  }

  return `「${text}」について考えてみます。

このデモではブラウザだけで動作するため、回答はサンプル生成です。実際のAI APIに接続する場合は、サーバー側のAPIエンドポイントから応答を取得してください。

### 次にできること

- 条件を追加して内容を具体化する
- 目的や対象ユーザーを指定する
- 例やコードを含めるように依頼する

お気軽に詳しい条件を入力してください。`;
}

function markdownToHtml(markdown) {
  const source = String(markdown || "").replace(/\r\n/g, "\n");
  const lines = source.split("\n");
  const output = [];
  let paragraph = [];
  let listType = null;
  let codeLines = null;
  let codeLanguage = "";

  const flushParagraph = () => {
    if (paragraph.length === 0) {
      return;
    }

    const text = paragraph.join("\n");
    output.push(`<p>${formatInlineMarkdown(text).replace(/\n/g, "<br>")}</p>`);
    paragraph = [];
  };

  const closeList = () => {
    if (listType) {
      output.push(`</${listType}>`);
      listType = null;
    }
  };

  const closeCode = () => {
    if (codeLines === null) {
      return;
    }

    const code = codeLines.join("\n");
    const escapedCode = escapeHtml(code);
    const encodedCode = encodeURIComponent(code);

    output.push(`
      <div class="code-block">
        <div class="code-header">
          <span>${escapeHtml(codeLanguage || "code")}</span>
          <button class="code-copy" type="button" data-code="${encodedCode}">
            コピー
          </button>
        </div>
        <pre><code>${escapedCode}</code></pre>
      </div>
    `);

    codeLines = null;
    codeLanguage = "";
  };

  for (const line of lines) {
    const fence = line.match(/^```([\w#+.-]*)\s*$/);

    if (fence) {
      if (codeLines === null) {
        flushParagraph();
        closeList();
        codeLines = [];
        codeLanguage = fence[1] || "";
      } else {
        closeCode();
      }

      continue;
    }

    if (codeLines !== null) {
      codeLines.push(line);
      continue;
    }

    if (line.trim() === "") {
      flushParagraph();
      closeList();
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);

    if (heading) {
      flushParagraph();
      closeList();

      const level = heading[1].length;
      output.push(`<h${level}>${formatInlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    const unordered = line.match(/^\s*[-*]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+\.\s+(.+)$/);

    if (unordered || ordered) {
      flushParagraph();

      const requiredListType = unordered ? "ul" : "ol";

      if (listType !== requiredListType) {
        closeList();
        listType = requiredListType;
        output.push(`<${listType}>`);
      }

      output.push(`<li>${formatInlineMarkdown((unordered || ordered)[1])}</li>`);
      continue;
    }

    if (line.startsWith(">")) {
      flushParagraph();
      closeList();

      output.push(
        `<blockquote>${formatInlineMarkdown(line.replace(/^>\s?/, ""))}</blockquote>`
      );
      continue;
    }

    flushParagraph();
    paragraph.push(line);
  }

  flushParagraph();
  closeList();
  closeCode();

  return output.join("");
}

function formatInlineMarkdown(text) {
  let result = escapeHtml(text);

  result = result.replace(
    /!$$([^$$]*)\]$$(https?:\/\/[^)\s]+)$$/g,
    '<img src="$2" alt="$1">'
  );

  result = result.replace(
    /$$([^$$]+)\]$$(https?:\/\/[^)\s]+)$$/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );

  result = result.replace(
    /`([^`\n]+)`/g,
    "<code>$1</code>"
  );

  result = result.replace(
    /\*\*([^*]+)\*\*/g,
    "<strong>$1</strong>"
  );

  result = result.replace(
    /__([^_]+)__/g,
    "<strong>$1</strong>"
  );

  result = result.replace(
    /(^|[^\*])\*([^*\n]+)\*(?!\*)/g,
    "$1<em>$2</em>"
  );

  result = result.replace(
    /(^|[^_])_([^_\n]+)_(?!_)/g,
    "$1<em>$2</em>"
  );

  return result;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();

    const copied = document.execCommand("copy");
    textarea.remove();

    return copied;
  } catch {
    return false;
  }
}

function autoResizeTextarea() {
  const textarea = elements.messageInput;
  textarea.style.height = "auto";
  textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    elements.chatArea.scrollTop = elements.chatArea.scrollHeight;
  });
}

function wait(milliseconds) {
  return new Promise(resolve => {
    setTimeout(resolve, milliseconds);
  });
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    elements.toast.classList.remove("show");
  }, 1800);
}

function openSidebar() {
  elements.sidebar.classList.add("open");
  elements.sidebarOverlay.classList.add("open");
}

function closeSidebar() {
  elements.sidebar.classList.remove("open");
  elements.sidebarOverlay.classList.remove("open");
}

function openSettings() {
  elements.themeSelect.value = settings.theme;
  elements.fontSizeSelect.value = settings.fontSize;
  elements.enterToSendCheckbox.checked = settings.enterToSend;
  elements.settingsModal.classList.add("open");
  elements.settingsModal.setAttribute("aria-hidden", "false");
}

function closeSettings() {
  elements.settingsModal.classList.remove("open");
  elements.settingsModal.setAttribute("aria-hidden", "true");
}

function exportConversation() {
  const conversation = getActiveConversation();

  if (!conversation || conversation.messages.length === 0) {
    showToast("書き出す会話がありません");
    return;
  }

  const content = [
    `# ${conversation.title}`,
    "",
    ...conversation.messages.map(message => {
      const author = message.role === "user" ? "YOU" : "NOVA AI";
      return `## ${author}\n\n${message.content}`;
    })
  ].join("\n\n");

  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `${conversation.title || "nova-chat"}.md`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  showToast("Markdownファイルを書き出しました");
}

function startVoiceInput() {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    showToast("このブラウザは音声入力に対応していません");
    return;
  }

  if (recognition) {
    recognition.stop();
    recognition = null;
    elements.voiceButton.classList.remove("recording");
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = "ja-JP";
  recognition.interimResults = true;
  recognition.continuous = false;

  elements.voiceButton.classList.add("recording");
  showToast("音声を認識しています");

  recognition.onresult = event => {
    let transcript = "";

    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }

    elements.messageInput.value = transcript;
    autoResizeTextarea();
  };

  recognition.onerror = () => {
    showToast("音声を認識できませんでした");
  };

  recognition.onend = () => {
    recognition = null;
    elements.voiceButton.classList.remove("recording");
  };

  recognition.start();
}

elements.composerForm.addEventListener("submit", event => {
  event.preventDefault();
  sendMessage(elements.messageInput.value);
});

elements.messageInput.addEventListener("input", autoResizeTextarea);

elements.messageInput.addEventListener("keydown", event => {
  if (
    event.key === "Enter" &&
    !event.shiftKey &&
    settings.enterToSend
  ) {
    event.preventDefault();
    elements.composerForm.requestSubmit();
  }
});

document.querySelectorAll(".suggestion-card").forEach(button => {
  button.addEventListener("click", () => {
    elements.messageInput.value = button.textContent.trim();
    autoResizeTextarea();
    elements.messageInput.focus();
  });
});

elements.newChatButton.addEventListener("click", createConversation);
elements.clearAllButton.addEventListener("click", deleteAllConversations);

elements.openSidebarButton.addEventListener("click", openSidebar);
elements.closeSidebarButton.addEventListener("click", closeSidebar);
elements.sidebarOverlay.addEventListener("click", closeSidebar);

elements.settingsButton.addEventListener("click", openSettings);
elements.topSettingsButton.addEventListener("click", openSettings);
elements.closeSettingsButton.addEventListener("click", closeSettings);
elements.cancelSettingsButton.addEventListener("click", closeSettings);

elements.settingsModal.addEventListener("click", event => {
  if (event.target === elements.settingsModal) {
    closeSettings();
  }
});

elements.saveSettingsButton.addEventListener("click", () => {
  settings = {
    theme: elements.themeSelect.value,
    fontSize: elements.fontSizeSelect.value,
    enterToSend: elements.enterToSendCheck
