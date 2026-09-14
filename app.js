let chats = [];
let currentChatId = null;
let allModels = [];
let currentAbortController = null;
let keyDebounceTimer = null;

let selectedModelId = "";
let selectedModelName = "Select Model";

window.addEventListener('DOMContentLoaded', () => {
  const sidebar = document.getElementById('sidebar');
  const mobileQuery = window.matchMedia('(max-width: 800px)');
  const updateSidebarForViewport = () => {
    const isCollapsed = mobileQuery.matches;
    sidebar.classList.toggle('collapsed', isCollapsed);
    document.body.classList.toggle('sidebar-collapsed', isCollapsed);
    document.querySelectorAll('.hamburger-btn').forEach((btn) => {
      btn.setAttribute('aria-expanded', String(!isCollapsed));
    });
  };
  updateSidebarForViewport();
  mobileQuery.addEventListener('change', updateSidebarForViewport);

  const systemPromptInput = document.getElementById('systemPromptInput');
  systemPromptInput.addEventListener('input', saveCurrentSystemPrompt);
  systemPromptInput.addEventListener('blur', saveCurrentSystemPrompt);

  const savedUrl = localStorage.getItem('chat_base_url');
  const savedKey = localStorage.getItem('chat_api_key');
  if (savedUrl) document.getElementById('baseUrl').value = savedUrl;

  updateSubOnlyVisibility();

  if (savedKey) document.getElementById('apiKey').value = savedKey;

  loadChatsFromStorage();

  if (chats.length > 0) {
    switchChat(chats[0].id);
  } else {
    createNewChat();
  }

  focusInput();
});

function updateSubOnlyVisibility() {
  const baseUrl = document.getElementById('baseUrl').value.trim().toLowerCase();
  const subOnlyContainer = document.getElementById('subOnlyContainer');
  if (baseUrl.includes('nano-gpt')) {
    subOnlyContainer.style.display = 'flex';
  } else {
    subOnlyContainer.style.display = 'none';
    document.getElementById('subOnly').checked = false;
  }
}

function focusInput() {
  document.getElementById('message-input').focus();
}

function scrollToBottom() {
  const chat = document.getElementById('chat');
  setTimeout(() => { chat.scrollTop = chat.scrollHeight; }, 10);
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const isCollapsed = sidebar.classList.toggle('collapsed');
  document.body.classList.toggle('sidebar-collapsed', isCollapsed);
  document.querySelectorAll('.hamburger-btn').forEach((btn) => {
    btn.setAttribute('aria-expanded', String(!isCollapsed));
  });
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function extractAndFormatThinking(text) {
  if (!text) return '';

  const tagRegex = /<\|?(?:s_)?(?:think|thought|thinking|reasoning)(?:_start)?\|?>([\s\S]*?)(?:<\|?(?:\/|e_)?(?:think|thought|thinking|reasoning)(?:_end)?\|?>|$)/gi;
  const bracketRegex = /\[(think|thought|thinking|reasoning)\]([\s\S]*?)(?:\[\/\1\]|$)/gi;

  const replacer = (match, firstCapture, secondCapture) => {
    const content = typeof secondCapture === 'string' ? secondCapture : firstCapture;
    const trimmed = content.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (!trimmed) return '';
    return `\n\n<details class="thinking-block">
                  <summary>View Thinking Process</summary>
                  <div class="thinking-content">${escapeHtml(trimmed)}</div>
                </details>\n\n`;
  };

  let processed = text.replace(tagRegex, replacer);
  processed = processed.replace(bracketRegex, replacer);
  return processed;
}

function normalizeChat(chat) {
  if (!chat || typeof chat !== 'object') return null;
  if (!Array.isArray(chat.messages)) chat.messages = [];
  chat.systemPrompt = typeof chat.systemPrompt === 'string' ? chat.systemPrompt : 'You are a helpful agent';
  chat.modelId = typeof chat.modelId === 'string' ? chat.modelId : '';
  chat.modelName = typeof chat.modelName === 'string' ? chat.modelName : '';
  chat.baseUrl = typeof chat.baseUrl === 'string' ? chat.baseUrl : (localStorage.getItem('chat_base_url') || 'https://nano-gpt.com/api/v1');
  chat.apiKey = typeof chat.apiKey === 'string' ? chat.apiKey : (localStorage.getItem('chat_api_key') || '');
  chat.subOnly = !!chat.subOnly;
  return chat;
}

function getCurrentChat() {
  return chats.find(c => c.id === currentChatId) || null;
}

function loadChatsFromStorage() {
  const saved = localStorage.getItem('chat_app_history');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      chats = Array.isArray(parsed) ? parsed.map(normalizeChat).filter(Boolean) : [];
    } catch (e) {
      chats = [];
    }
  }
}

function saveChatsToStorage() {
  localStorage.setItem('chat_app_history', JSON.stringify(chats));
}

function applyChatConfigToInputs(chat) {
  const baseUrlInput = document.getElementById('baseUrl');
  const apiKeyInput = document.getElementById('apiKey');
  const subOnlyInput = document.getElementById('subOnly');

  if (!baseUrlInput || !apiKeyInput || !subOnlyInput) return;

  const source = chat || {
    baseUrl: localStorage.getItem('chat_base_url') || 'https://nano-gpt.com/api/v1',
    apiKey: localStorage.getItem('chat_api_key') || '',
    subOnly: false
  };

  baseUrlInput.value = source.baseUrl || 'https://nano-gpt.com/api/v1';
  apiKeyInput.value = source.apiKey || '';
  subOnlyInput.checked = !!source.subOnly;
  updateSubOnlyVisibility();
}

function saveCurrentSystemPrompt() {
  const chat = chats.find(c => c.id === currentChatId);
  if (!chat) return;

  chat.systemPrompt = document.getElementById('systemPromptInput').value;
  saveChatsToStorage();
}

function renderSystemPromptEditor() {
  const textarea = document.getElementById('systemPromptInput');
  if (!textarea) return;

  const chat = chats.find(c => c.id === currentChatId);
  textarea.value = chat && typeof chat.systemPrompt === 'string' ? chat.systemPrompt : 'You are a helpful agent';
}

function renderSidebar() {
  const listEl = document.getElementById('sidebarChatsList');
  listEl.innerHTML = '';

  chats.forEach(chat => {
    const item = document.createElement('div');
    item.className = `chat-item ${chat.id === currentChatId ? 'active' : ''}`;

    const titleSpan = document.createElement('span');
    titleSpan.className = 'chat-item-title';
    titleSpan.textContent = chat.title || 'New Chat';
    item.onclick = () => switchChat(chat.id);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'chat-item-delete';
    deleteBtn.textContent = '✕';
    deleteBtn.onclick = (e) => deleteChat(chat.id, e);

    item.appendChild(titleSpan);
    item.appendChild(deleteBtn);
    listEl.appendChild(item);
  });
}

function createNewChat() {
  const sourceChat = getCurrentChat();
  const inheritedConfig = sourceChat || {
    baseUrl: localStorage.getItem('chat_base_url') || 'https://nano-gpt.com/api/v1',
    apiKey: localStorage.getItem('chat_api_key') || '',
    subOnly: false,
    modelId: selectedModelId,
    modelName: selectedModelName
  };

  const newChat = {
    id: 'chat_' + Date.now(),
    title: 'New Chat',
    modelId: inheritedConfig.modelId || selectedModelId,
    modelName: inheritedConfig.modelName || selectedModelName,
    messages: [],
    systemPrompt: 'You are a helpful agent',
    baseUrl: inheritedConfig.baseUrl || 'https://nano-gpt.com/api/v1',
    apiKey: inheritedConfig.apiKey || '',
    subOnly: !!inheritedConfig.subOnly
  };
  chats.unshift(newChat);
  saveChatsToStorage();
  switchChat(newChat.id);
  focusInput();
}

function switchChat(id) {
  currentChatId = id;
  const chat = chats.find(c => c.id === id);

  if (chat && chat.modelId) {
    setDisplayModel(chat.modelId, chat.modelName || chat.modelId);
  } else if (selectedModelId) {
    setDisplayModel(selectedModelId, selectedModelName);
  }

  applyChatConfigToInputs(chat);
  renderSidebar();
  renderSystemPromptEditor();
  renderCurrentChatMessages();
  if (chat?.apiKey) fetchModels();
}

function deleteChat(id, event) {
  event.stopPropagation();
  chats = chats.filter(c => c.id !== id);
  saveChatsToStorage();

  if (chats.length === 0) {
    createNewChat();
  } else if (currentChatId === id) {
    switchChat(chats[0].id);
  } else {
    renderSidebar();
  }
}

function extractReasoningAndVisible(text = '') {
  const reasoningParts = [];
  let visible = text;

  visible = visible.replace(/<\|?(?:s_)?(?:think|thought|thinking|reasoning)(?:_start)?\|?>([\s\S]*?)(?:<\|?(?:\/|e_)?(?:think|thought|thinking|reasoning)(?:_end)?\|?>|$)/gi, (match, reason) => {
    if (reason && reason.trim()) reasoningParts.push(reason.trim());
    return '';
  });

  visible = visible.replace(/\[(think|thought|thinking|reasoning)\]([\s\S]*?)(?:\[\/\1\]|$)/gi, (match, label, reason) => {
    if (reason && reason.trim()) reasoningParts.push(reason.trim());
    return '';
  });

  return {
    reasoning: reasoningParts.join('\n\n').trim(),
    visible: visible.trim()
  };
}

function stripReasoningFromContent(text = '') {
  return extractReasoningAndVisible(text).visible;
}

function renderCurrentChatMessages() {
  const chatEl = document.getElementById('chat');
  chatEl.innerHTML = '';

  const chat = chats.find(c => c.id === currentChatId);
  if (!chat) return;

  chat.messages.forEach(msg => {
    const div = document.createElement('div');
    div.className = `msg ${msg.role}`;
    if (msg.role === 'user') {
      div.textContent = msg.content;
    } else {
      const reasoning = msg.reasoning || extractReasoningAndVisible(msg.content).reasoning;
      const displayText = reasoning ? `${reasoning ? `<think>${reasoning}</think>` : ''}${msg.content || ''}` : msg.content;
      div.innerHTML = DOMPurify.sanitize(marked.parse(extractAndFormatThinking(displayText)));
    }
    chatEl.appendChild(div);
  });
  scrollToBottom();
}

function toggleDropdown() {
  document.getElementById('dropdownMenu').classList.toggle('show');
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('#customModelSelect')) {
    document.getElementById('dropdownMenu').classList.remove('show');
  }
});

function setDisplayModel(id, name) {
  selectedModelId = id;
  selectedModelName = name;
  const displayObj = document.querySelector('.custom-select-display');
  displayObj.textContent = name;
  displayObj.title = name;
  localStorage.setItem('chat_model_id', id);

  if (currentChatId) {
    const chat = chats.find(c => c.id === currentChatId);
    if (chat) {
      chat.modelId = id;
      chat.modelName = name;
      saveChatsToStorage();
    }
  }
}

function selectOption(id, name) {
  setDisplayModel(id, name);
  document.getElementById('dropdownMenu').classList.remove('show');
}

function formatModelName(m) {
  return m.name || m.id;
}

function saveConfig() {
  const chat = getCurrentChat();
  if (!chat) return;

  chat.baseUrl = document.getElementById('baseUrl').value.trim();
  chat.apiKey = document.getElementById('apiKey').value.trim();
  chat.subOnly = document.getElementById('subOnly').checked;
  saveChatsToStorage();
}

function onKeyInput() {
  saveConfig();
  clearTimeout(keyDebounceTimer);
  keyDebounceTimer = setTimeout(() => {
    if (document.getElementById('apiKey').value.trim()) {
      fetchModels();
    }
  }, 500);
}

async function fetchModels() {
  const chat = getCurrentChat();
  const requestChatId = currentChatId;
  const rawUrl = (chat && typeof chat.baseUrl === 'string' ? chat.baseUrl : document.getElementById('baseUrl').value.trim()).trim();
  const apiKey = (chat && typeof chat.apiKey === 'string' ? chat.apiKey : document.getElementById('apiKey').value.trim()).trim();
  const subOnly = chat ? !!chat.subOnly : document.getElementById('subOnly').checked;

  if (!apiKey) {
    document.querySelector('.custom-select-display').textContent = 'Enter API Key above...';
    return;
  }

  document.querySelector('.custom-select-display').textContent = 'Loading models...';

  try {
    const basePath = rawUrl.replace(/\/v1\/?$/, "");
    const isNanoGpt = rawUrl.toLowerCase().includes('nano-gpt');
    const endpoint = (isNanoGpt && subOnly)
      ? `${basePath}/subscription/v1/models?detailed=true`
      : `${basePath}/v1/models?detailed=true`;

    const res = await fetch(endpoint, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    allModels = data.data || [];
    if (currentChatId !== requestChatId) return;
    applyModelFilter();

  } catch (e) {
    document.querySelector('.custom-select-display').textContent = 'Fetch Failed';
    console.error('Failed to fetch models:', e);
  }
}

function applyModelFilter() {
  const filterInput = document.getElementById('modelFilter');
  const filterText = filterInput.value.toLowerCase().trim();
  const clearBtn = document.getElementById('clearFilterBtn');

  clearBtn.style.display = filterText ? 'block' : 'none';

  const terms = filterText.split(/\s+/).filter(t => t.length > 0);
  const dropdownMenu = document.getElementById('dropdownMenu');
  dropdownMenu.innerHTML = '';

  const filteredModels = allModels.filter(m => {
    if (terms.length === 0) return true;
    const searchableText = `${m.id} ${m.name || ''} ${m.owned_by || ''}`.toLowerCase();
    return terms.every(term => searchableText.includes(term));
  });

  const groups = {};
  filteredModels.forEach(m => {
    let provider = m.owned_by;
    if (!provider || provider.toLowerCase() === 'other' || provider.toLowerCase() === 'system') {
      if (m.id && m.id.includes('/')) {
        provider = m.id.split('/')[0];
      } else {
        provider = 'Other';
      }
    }
    provider = provider.toUpperCase();

    if (!groups[provider]) groups[provider] = [];
    groups[provider].push(m);
  });

  Object.keys(groups).sort().forEach(provider => {
    const groupLabel = document.createElement('div');
    groupLabel.className = 'dropdown-group-label';
    groupLabel.textContent = provider;
    dropdownMenu.appendChild(groupLabel);

    groups[provider].forEach(m => {
      const displayName = formatModelName(m);
      const optDiv = document.createElement('div');
      optDiv.className = 'dropdown-option';
      optDiv.textContent = displayName;
      optDiv.title = `${displayName} \nID: ${m.id}`;
      optDiv.onclick = () => selectOption(m.id, displayName);
      dropdownMenu.appendChild(optDiv);
    });
  });

  if (filteredModels.length === 0) {
    document.querySelector('.custom-select-display').textContent = "No models found";
    selectedModelId = "";
  } else {
    const savedModelId = localStorage.getItem('chat_model_id');
    let targetModel = null;

    if (selectedModelId && filteredModels.find(m => m.id === selectedModelId)) {
      targetModel = filteredModels.find(m => m.id === selectedModelId);
    } else if (savedModelId && filteredModels.find(m => m.id === savedModelId)) {
      targetModel = filteredModels.find(m => m.id === savedModelId);
    } else {
      targetModel = filteredModels[0];
    }

    setDisplayModel(targetModel.id, formatModelName(targetModel));
  }
}

function clearFilter() {
  document.getElementById('modelFilter').value = '';
  applyModelFilter();
}

function handleSendClick() {
  if (currentAbortController) {
    currentAbortController.abort();
    return;
  }
  sendMessage();
}

async function sendMessage() {
  const input = document.getElementById('message-input');
  const sendBtn = document.getElementById('sendBtn');
  const text = input.value.trim();
  if (!text) return;

  const chat = chats.find(c => c.id === currentChatId);
  if (!chat) return;

  const rawUrl = (chat.baseUrl || document.getElementById('baseUrl').value.trim()).trim();
  const baseUrl = rawUrl.replace(/\/$/, "");
  const apiKey = (chat.apiKey || document.getElementById('apiKey').value.trim()).trim();
  const model = selectedModelId;

  if (!model) {
    alert("Please select a valid model first.");
    return;
  }

  if (chat.messages.length === 0) {
    chat.title = text.length > 25 ? text.substring(0, 25) + '...' : text;
  }

  chat.messages.push({ role: 'user', content: text });
  saveChatsToStorage();
  renderSidebar();

  const requestMessages = [];
  const trimmedPrompt = typeof chat.systemPrompt === 'string' ? chat.systemPrompt.trim() : '';
  if (trimmedPrompt) {
    requestMessages.push({ role: 'system', content: trimmedPrompt });
  }

  chat.messages.forEach(msg => {
    const content = typeof msg.content === 'string' ? stripReasoningFromContent(msg.content) : '';
    if (msg.role === 'assistant' && !content.trim()) return;
    requestMessages.push({ role: msg.role, content });
  });

  const chatEl = document.getElementById('chat');
  const userDiv = document.createElement('div');
  userDiv.className = 'msg user';
  userDiv.textContent = text;
  chatEl.appendChild(userDiv);
  scrollToBottom();

  input.value = '';

  const assistantDiv = document.createElement('div');
  assistantDiv.className = 'msg assistant streaming';
  assistantDiv.setAttribute('aria-busy', 'true');
  assistantDiv.setAttribute('aria-label', 'Waiting for response');
  assistantDiv.innerHTML = '';
  chatEl.appendChild(assistantDiv);
  scrollToBottom();

  currentAbortController = new AbortController();
  sendBtn.textContent = 'Stop';
  sendBtn.classList.add('stop-btn');

  let accumulatedContent = '';
  let isReasoningActive = false;

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({ model, messages: requestMessages, stream: true }),
      signal: currentAbortController.signal
    });

    if (!res.ok) {
      const errText = await res.text();
      let msg = `HTTP ${res.status}`;
      try {
        const errJson = JSON.parse(errText);
        msg = errJson.error?.message || errJson.error || msg;
      } catch(e) {}
      throw new Error(msg);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = '';
    const renderAssistant = () => {
      assistantDiv.classList.remove('streaming');
      assistantDiv.setAttribute('aria-busy', 'false');
      assistantDiv.removeAttribute('aria-label');
      assistantDiv.innerHTML = DOMPurify.sanitize(marked.parse(extractAndFormatThinking(accumulatedContent)));
      scrollToBottom();
    };
    const processStreamLine = (line) => {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith(':')) return;

      const payload = trimmedLine.startsWith('data:')
        ? trimmedLine.slice(5).trim()
        : '';
      if (!payload || payload === '[DONE]') return;

      let parsed;
      try {
        parsed = JSON.parse(payload);
      } catch (e) {
        console.warn('Ignoring malformed stream event:', payload, e);
        return;
      }

      const delta = parsed.choices?.[0]?.delta || {};
      const reasoning = delta.reasoning_content || delta.reasoning || delta.thinking;
      const content = delta.content;

      if (typeof reasoning === 'string' && reasoning) {
        if (!isReasoningActive) {
          accumulatedContent += '<think>';
          isReasoningActive = true;
        }
        accumulatedContent += reasoning;
      }

      if (typeof content === 'string' && content) {
        if (isReasoningActive) {
          accumulatedContent += '</think>';
          isReasoningActive = false;
        }
        accumulatedContent += content;
      }

      if (reasoning || content) renderAssistant();
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      lines.forEach(processStreamLine);
    }

    buffer += decoder.decode();
    if (buffer.trim()) processStreamLine(buffer);

    if (isReasoningActive) {
      accumulatedContent += '</think>';
      isReasoningActive = false;
      renderAssistant();
    }
    assistantDiv.classList.remove('streaming');
    assistantDiv.setAttribute('aria-busy', 'false');
    assistantDiv.removeAttribute('aria-label');

    const { reasoning, visible } = extractReasoningAndVisible(accumulatedContent);
    chat.messages.push({
      role: 'assistant',
      content: visible || accumulatedContent,
      ...(reasoning ? { reasoning } : {})
    });
    saveChatsToStorage();
    scrollToBottom();

  } catch (e) {
    assistantDiv.classList.remove('streaming');
    assistantDiv.setAttribute('aria-busy', 'false');
    assistantDiv.removeAttribute('aria-label');
    if (e.name === 'AbortError') {
      if (accumulatedContent) {
        if (isReasoningActive) accumulatedContent += '</think>';
        const { reasoning, visible } = extractReasoningAndVisible(accumulatedContent);
        chat.messages.push({
          role: 'assistant',
          content: visible || accumulatedContent,
          ...(reasoning ? { reasoning } : {})
        });
        saveChatsToStorage();
      } else {
        assistantDiv.textContent = '[Request Cancelled]';
      }
    } else {
      assistantDiv.textContent = 'Error: ' + e.message;
    }
    scrollToBottom();
  } finally {
    currentAbortController = null;
    sendBtn.textContent = 'Send';
    sendBtn.classList.remove('stop-btn');
    focusInput();
  }
}
