(function() {
    'use strict';
    if (window.__nexusChatLoaded) return;
    window.__nexusChatLoaded = true;

    const SERVER_URL    = 'https://nexus-chat-p7ph.onrender.com';
    const LOGO_URL      = 'https://i.ibb.co/FkXVWJnC/Chat-GPT-Image-26-jun-2026-19-06-21.png';
    const DISCORD_INVITE = 'https://discord.gg/comingsoon';

    const DEFAULT_CONFIG = {
        bgColor: '#1a1a1a',
        textColor: '#e0e0e0',
        size: 'pequeño',
        position: 'bottom-left',
        activationKeyChar: '5',
        dimKeyChar: 'b',
        idleTimeout: 8,
        discordReminder: true,
        dndMode: false,
        theme: 'dark',
        emojiEnabled: true
    };
    let config = Object.assign({}, DEFAULT_CONFIG, JSON.parse(localStorage.getItem('nexusChatConfig') || '{}'));

    let username     = sessionStorage.getItem('nexus_username') || '';
    function getUserColor(name) {
        if (!name) return '#5dade2';
        let hash = 0;
        for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
        const hue = ((hash % 360) + 360) % 360;
        return `hsl(${hue}, 65%, 60%)`;
    }
    let authorColor = getUserColor(username);
    localStorage.setItem('nexus_authorColor', authorColor);

    let blockedUsers        = JSON.parse(localStorage.getItem('nexus_blocked') || '[]');
    let recentLongMessages  = [];
    let mutedUntil          = 0;

    let gameId = null, chatSocket = null, messageHistory = [];
    let isChatOpen = false, isMinimized = false, isIdle = false, isDim = false;
    let idleTimer = null, isInputFocused = false, isHovering = false;
    let sendCooldown = false, mentionCount = 0, unreadCount = 0;
    let typingTimeout = null, typingUsers = new Map();
    let chatContainer, messageArea, inputField, sendBtn, toggleIcon, settingsPanel;
    let onboardingOverlay = null;
    let discordReminderInterval = null;
    let lastMessageTime = 0;
    let userScrolled = false;
    let totalMessagesThisGame = 0, totalMentionsThisGame = 0;
    let connectionIndicator = null;

    function playSound(type) {
        if (config.dndMode && type !== 'mention') return;
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const sampleRate = audioCtx.sampleRate;
            let duration, freq1, freq2;
            switch(type) {
                case 'open':    duration=0.12; freq1=600;  freq2=900;  break;
                case 'close':   duration=0.12; freq1=900;  freq2=600;  break;
                case 'send':    duration=0.06; freq1=1200; freq2=1200; break;
                case 'mention': duration=0.3;  freq1=800;  freq2=1000; break;
                default:        duration=0.1;  freq1=700;  freq2=700;
            }
            const bufferSize = sampleRate * duration;
            const buffer     = audioCtx.createBuffer(1, bufferSize, sampleRate);
            const data       = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                const t = i / sampleRate;
                let s;
                if      (type === 'open')    s = Math.sin(2*Math.PI*freq1*t)*(1-t/duration) + Math.sin(2*Math.PI*freq2*t)*(t/duration);
                else if (type === 'close')   s = Math.sin(2*Math.PI*freq1*t)*(t/duration)   + Math.sin(2*Math.PI*freq2*t)*(1-t/duration);
                else if (type === 'send')    s = Math.sin(2*Math.PI*freq1*t)*Math.exp(-t*30);
                else if (type === 'mention') s = Math.sin(2*Math.PI*freq1*t)*Math.exp(-t*8)*0.5 + Math.sin(2*Math.PI*freq2*t)*Math.exp(-(t-0.1)*10)*0.4;
                else                         s = Math.sin(2*Math.PI*freq1*t)*Math.exp(-t*10);
                data[i] = s * 0.4;
            }
            const source = audioCtx.createBufferSource();
            source.buffer = buffer;
            source.connect(audioCtx.destination);
            source.start();
        } catch(e) {}
    }

    const OrigWS = window.WebSocket;
    window.WebSocket = function(url, protocols) {
        const m = url.match(/play\?gameId=([a-f0-9-]+)/i);
        if (m && m[1] !== gameId) {
            if (gameId && totalMessagesThisGame > 0) addSystemMessage(`Game ended. Messages: ${totalMessagesThisGame}, mentions: ${totalMentionsThisGame}`);
            gameId = m[1];
            messageHistory = [];
            if (messageArea) messageArea.innerHTML = '';
            mentionCount = 0; unreadCount = 0;
            updateBadges();
            if (chatSocket) chatSocket.disconnect();
            totalMessagesThisGame = 0; totalMentionsThisGame = 0;
            connectToChat();
            startDiscordReminder();
        }
        return new OrigWS(url, protocols);
    };

    setTimeout(() => {
        if (!gameId) {
            const combined = (window.location.hash + window.location.search);
            const m = combined.match(/gameId=([a-f0-9-]+)/i);
            if (m) { gameId = m[1]; connectToChat(); startDiscordReminder(); }
        }
    }, 2000);

    function connectToChat() {
        if (!gameId || !username) return;
        if (typeof io === 'undefined') {
            const script = document.createElement('script');
            script.src = 'https://cdn.socket.io/4.7.2/socket.io.min.js';
            script.onload = initSocket;
            document.head.appendChild(script);
        } else initSocket();
    }

    function initSocket() {
        try {
            chatSocket = io(SERVER_URL, { transports: ['websocket', 'polling'], query: { gameId } });
            chatSocket.on('connect', () => {
                updateConnectionIndicator(true);
                chatSocket.emit('join', { gameId, username });
                addSystemMessage('✅ Connected');
                playSound('open');
            });
            chatSocket.on('disconnect', () => {
                updateConnectionIndicator(false);
                addSystemMessage('❌ Disconnected');
                playSound('close');
                stopDiscordReminder();
            });
            chatSocket.on('chat-history', (history) => {
                if (!messageArea) return;
                messageArea.innerHTML = '';
                history.forEach(msg => {
                    const isBlocked = blockedUsers.includes(msg.author) && msg.author !== username;
                    addMessage(msg.author, msg.text, isBlocked, false, !!msg.recipient, msg.authorColor, msg.messageId);
                });
            });
            chatSocket.on('pinned-message', (text) => {
                const oldPin = document.querySelector('.pinned-msg');
                if (oldPin) oldPin.remove();
                if (!text) return;
                const pinDiv = document.createElement('div');
                pinDiv.className = 'pinned-msg';
                pinDiv.textContent = '📌 ' + text;
                messageArea.prepend(pinDiv);
            });
            chatSocket.on('chat-message', (payload) => {
                const author = payload.author;
                const isBlocked = blockedUsers.includes(author) && author !== username;
                const mentionPattern = new RegExp(`@${escapeRegex(username)}\\b`, 'i');
                const mentioned = !isBlocked && (author !== username) && mentionPattern.test(payload.text);
                if (mentioned) {
                    playSound('mention');
                    totalMentionsThisGame++;
                    if (!isInputFocused || isDim || isIdle) mentionCount++;
                }
                if (!isChatOpen && !isBlocked && author !== username) unreadCount++;
                updateBadges();
                totalMessagesThisGame++;
                addMessage(author, payload.text, isBlocked, mentioned, !!payload.recipient, payload.authorColor, payload.messageId);
            });
            chatSocket.on('system-message', (text) => addSystemMessage(text));
            chatSocket.on('username-change-accepted', ({ newUsername }) => {
                username = newUsername;
                sessionStorage.setItem('nexus_username', username);
                authorColor = getUserColor(username);
                localStorage.setItem('nexus_authorColor', authorColor);
                const cfgNameInput = document.getElementById('cfg-name');
                if (cfgNameInput) cfgNameInput.value = username;
            });
            chatSocket.on('username-change-rejected', ({ rejectedName }) => {
                const cfgNameInput = document.getElementById('cfg-name');
                if (cfgNameInput) cfgNameInput.value = username;
            });
            chatSocket.on('user-list', (users) => { window.__nexusOnlineUsers = users; if (isInputFocused) onInputChange(); });
            chatSocket.on('online-list', (users) => addSystemMessage(`👥 Online: ${users.join(', ')}`));
            chatSocket.on('reaction-update', ({ messageId, emoji }) => {
                const msgDiv = messageArea?.querySelector(`.user-msg[data-msgid="${CSS.escape(messageId)}"]`);
                if (msgDiv) {
                    const reactionsSpan = msgDiv.querySelector('.reactions');
                    const existing = reactionsSpan.querySelector(`.reaction[data-emoji="${emoji}"]`);
                    if (existing) {
                        const count = (parseInt(existing.textContent.match(/\d+/)?.[0] || 0) || 0) + 1;
                        existing.textContent = `${emoji} ${count}`;
                    } else {
                        const span = document.createElement('span');
                        span.className = 'reaction';
                        span.setAttribute('data-emoji', emoji);
                        span.textContent = `${emoji} 1`;
                        reactionsSpan.appendChild(span);
                    }
                }
            });
            chatSocket.on('user-typing', ({ username: typer, typing }) => {
                if (typing) typingUsers.set(typer, setTimeout(() => typingUsers.delete(typer), 4000));
                else typingUsers.delete(typer);
                updateTypingIndicator();
            });
            chatSocket.on('poll-created', ({ pollId, question, options }) => renderPoll(pollId, question, options));
            chatSocket.on('poll-update', ({ pollId, options }) => {
                const pollDiv = messageArea?.querySelector(`.poll-container[data-pollid="${pollId}"]`);
                if (pollDiv) {
                    const btns = pollDiv.querySelectorAll('.poll-option');
                    btns.forEach((btn, idx) => { btn.textContent = `${options[idx].option} (${options[idx].votes})`; });
                }
            });
        } catch(e) { console.error('[NexusChat]', e); }
    }

    function updateConnectionIndicator(connected) {
        if (!connectionIndicator) return;
        connectionIndicator.style.backgroundColor = connected ? '#2ecc71' : '#e74c3c';
    }

    function updateTypingIndicator() {
        const typingDiv = document.getElementById('nx-typing');
        if (!typingDiv) return;
        const names = Array.from(typingUsers.keys()).filter(name => name !== username);
        typingDiv.textContent = names.length === 0 ? '' : names.length === 1 ? `${names[0]} is typing...` : `${names.slice(0,2).join(', ')} and others are typing...`;
    }

    function renderPoll(pollId, question, options) {
        const div = document.createElement('div');
        div.className = 'poll-container';
        div.setAttribute('data-pollid', pollId);
        div.innerHTML = `<div class="poll-question">📊 ${escapeHtml(question)}</div>`;
        options.forEach((opt, idx) => {
            const btn = document.createElement('button');
            btn.className = 'poll-option';
            btn.textContent = `${opt.option} (${opt.votes})`;
            btn.addEventListener('click', () => chatSocket.emit('poll-vote', { pollId, optionIndex: idx }));
            div.appendChild(btn);
        });
        messageArea.appendChild(div);
        scrollIfNeeded();
    }

    function applyEmoji(text) {
        if (!config.emojiEnabled) return text;
        const map = {
            ':D': '😄', ':P': '😛', ':O': '😮', ':3': '😊', ';)': '😉',
            ':)': '🙂', ':(': '☹️', ':|': '😐', ':\'(': '😢', ':/': '😕',
            '<3': '❤️', ':*': '😘', ':S': '😬', '>:)': '😈'
        };
        return text.replace(/:D|:P|:O|:3|;\)|:\)|:\(|:\||:\'\(|:\/|<3|:\*|:S|>:\)/g, match => map[match] || match);
    }

    function showError(msg) {
        const div = document.createElement('div');
        div.className = 'error-msg';
        div.textContent = '⚠️ ' + msg;
        messageArea.appendChild(div);
        scrollIfNeeded();
        setTimeout(() => div.remove(), 3000);
    }

    function sendMessage() {
        if (!chatSocket || !chatSocket.connected) return;
        if (Date.now() < mutedUntil) { showError(`Muted for ${Math.ceil((mutedUntil - Date.now()) / 1000)}s`); return; }
        if (sendCooldown) return;

        let text = inputField.value.trim();
        if (text === '/help') {
            addSystemMessage(`Commands: /online, /help, /poll, /pin, /stats, (name) msg, /me`);
            inputField.value = ''; inputField.focus(); return;
        }
        if (text === '/stats') {
            addSystemMessage(`📊 This game: ${totalMessagesThisGame} msgs, ${totalMentionsThisGame} mentions.`);
            inputField.value = ''; inputField.focus(); return;
        }
        if (text.startsWith('/pin ')) {
            chatSocket.emit('pin-message', text.slice(5).trim());
            inputField.value = ''; inputField.focus(); return;
        }
        if (text.startsWith('/poll ')) {
            const args = text.match(/"([^"]+)"/g);
            if (args && args.length >= 3) {
                chatSocket.emit('create-poll', { question: args[0].slice(1,-1), options: args.slice(1).map(s=>s.slice(1,-1)) });
                inputField.value = ''; inputField.focus(); return;
            } else { showError('Usage: /poll "q" "opt1" "opt2"'); return; }
        }
        if (text === '/online') { chatSocket.emit('request-online'); inputField.value = ''; inputField.focus(); return; }
        if (text.startsWith('/me ')) text = `* ${username} ${text.slice(4)}`;

        if (!text || text.length > 250) { if (text.length > 250) showError('Max 250 chars'); return; }
        if (text.length > 200) {
            const now = Date.now();
            recentLongMessages.push(now);
            recentLongMessages = recentLongMessages.filter(t => now - t < 10000);
            if (recentLongMessages.length >= 3) { mutedUntil = now + 60000; showError('Muted 1 min (spam)'); return; }
        }
        text = applyEmoji(text);

        let recipient = null;
        const privMatch = text.match(/^\(([^)]+)\)\s*(.*)/);
        if (privMatch) { recipient = privMatch[1].trim(); text = privMatch[2].trim(); if (!text) { showError('Empty message'); return; } }

        chatSocket.emit('chat-message', { author: username, text, timestamp: Date.now(), recipient: recipient || null, authorColor: authorColor });
        playSound('send');
        inputField.value = ''; inputField.blur();
        if (typingTimeout) { clearTimeout(typingTimeout); chatSocket.emit('typing-stop'); typingTimeout = null; }
        if (isDim) applyDim(true); else { clearIdle(); startIdleTimer(); }
        sendCooldown = true; sendBtn.disabled = true;
        setTimeout(() => { sendCooldown = false; sendBtn.disabled = false; }, 2000);
    }

    function createChatUI() {
        chatContainer = document.createElement('div');
        chatContainer.id = 'nx-chat';
        chatContainer.innerHTML = `
            <div id="nx-header">
                <span class="nx-logo">◈ Nexus Chat</span>
                <span class="nx-madeby" title="Made by ! System with ❤️">❤️</span>
                <div class="nx-header-actions">
                    <span id="nx-connection-dot" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#e74c3c;margin-right:4px;" title="Connection"></span>
                    <button id="nx-mention-badge" style="display:none;">0</button>
                    <button id="nx-unread-badge" style="display:none;">0</button>
                    <button id="nx-dnd-btn" title="Do Not Disturb">🔔</button>
                    <button id="nx-dim-btn" title="Dim mode (${config.dimKeyChar})">🌓</button>
                    <button id="nx-min-btn" title="Minimize">─</button>
                    <button id="nx-cfg-btn" title="Settings">⚙</button>
                </div>
            </div>
            <div id="nx-messages"></div>
            <div id="nx-typing"></div>
            <div id="nx-input-box">
                <input type="text" id="nx-input" placeholder="Press ${config.activationKeyChar} to write..." maxlength="250">
                <button id="nx-send">Send</button>
            </div>
            <div id="nx-settings" style="display:none;"></div>
            <div id="nx-autocomplete" style="display:none;"></div>
        `;
        connectionIndicator = document.getElementById('nx-connection-dot');

        const style = document.createElement('style');
        style.textContent = `
            #nx-chat {
                position: fixed; bottom: 20px; left: 20px;
                width: 250px; height: 250px;
                background: #1a1a1a; color: #e0e0e0;
                font-family: 'Segoe UI', 'Inter', system-ui, sans-serif;
                font-size: 13px; border-radius: 8px;
                display: flex; flex-direction: column; z-index: 99990;
                box-shadow: 0 8px 32px rgba(0,0,0,0.6);
                border: 1px solid #333;
                transition: opacity 0.25s ease;
                overflow: hidden;
            }
            #nx-chat.idle  { opacity: 0.15; }
            #nx-chat.dim   { opacity: 0.05; }
            #nx-chat.minimized #nx-messages, #nx-chat.minimized #nx-input-box, #nx-chat.minimized #nx-typing { display: none; }
            #nx-header {
                background: #111; padding: 6px 10px;
                display: flex; align-items: center; gap: 8px;
                border-bottom: 1px solid #333; flex-shrink: 0;
            }
            .nx-logo  { font-weight: 600; font-size: 14px; color: #ccc; margin-right: auto; }
            .nx-madeby { font-size: 14px; cursor: default; }
            .nx-header-actions { display: flex; gap: 4px; align-items: center; }
            .nx-header-actions button {
                background: none; border: none; color: #888; font-size: 14px; cursor: pointer;
                padding: 2px 4px; line-height: 1; transition: color 0.2s;
            }
            .nx-header-actions button:hover { color: #fff; }
            #nx-mention-badge, #nx-unread-badge {
                background: #ff4444; color: white; border-radius: 10px;
                font-size: 10px; padding: 2px 6px; font-weight: bold;
            }
            #nx-unread-badge { background: #4caf50; }
            #nx-dnd-btn.active { color: #ff4444; }
            #nx-dim-btn.active { color: #f39c12; }
            #nx-messages {
                flex: 1; overflow-y: auto; padding: 8px; background: #181818;
                scrollbar-width: thin; scrollbar-color: #444 #181818;
                word-break: break-word; overflow-wrap: anywhere;
            }
            #nx-messages::-webkit-scrollbar { width: 5px; }
            #nx-messages::-webkit-scrollbar-thumb { background: #444; }
            #nx-typing { padding: 2px 8px; font-size: 11px; color: #aaa; font-style: italic; background: #181818; }
            .system-msg   { color: #777; font-style: italic; font-size: 11px; margin-bottom: 4px; }
            .discord-reminder { background: rgba(114,137,218,0.15); border-radius: 4px; padding: 4px 8px; margin-bottom: 6px; }
            .discord-link { color: #7289da; cursor: pointer; text-decoration: underline; }
            .user-msg     { margin-bottom: 6px; line-height: 1.4; position: relative; padding: 4px 8px; border-radius: 6px; }
            .own-msg      { text-align: right; background: rgba(255,255,255,0.04); }
            .other-msg    { text-align: left; }
            .user-msg strong { font-weight: 600; cursor: pointer; }
            .user-msg strong:hover { text-decoration: underline; }
            .mention      { color: #00ff88; font-weight: bold; }
            .private-msg  { color: #ffaa00; font-style: italic; }
            .error-msg    { color: #ff6666; font-size: 12px; margin: 4px 0; }
            .you-label    { font-size: 10px; opacity: 0.5; margin-left: 4px; }
            .msg-status   { font-size: 10px; opacity: 0.6; margin-left: 4px; }
            .blocked-hidden { display: none !important; }
            .blocked-placeholder {
                color: #555; font-size: 11px; font-style: italic; margin-bottom: 4px;
                display: flex; align-items: center; justify-content: space-between;
            }
            .unblock-btn {
                background: #b71c1c; border: none; color: white; font-size: 10px;
                padding: 2px 6px; border-radius: 4px; cursor: pointer; margin-left: 8px;
            }
            .unblock-btn:hover { background: #8b0000; }
            .reactions-bar {
                display: inline-flex; gap: 2px; margin-left: 6px;
                opacity: 0; transition: opacity 0.2s; vertical-align: middle;
            }
            .user-msg:hover .reactions-bar { opacity: 1; }
            .reaction-btn, .block-btn {
                background: none; border: none; color: #999; font-size: 13px;
                cursor: pointer; padding: 1px 3px; border-radius: 3px;
            }
            .reaction-btn:hover, .block-btn:hover { background: #333; color: #fff; }
            .reactions { display: inline; }
            .reaction {
                display: inline-block; margin-left: 3px; font-size: 12px;
                background: rgba(255,255,255,0.1); padding: 1px 4px; border-radius: 4px;
            }
            .poll-container {
                background: rgba(255,255,255,0.05); border-radius: 6px; padding: 8px; margin-bottom: 8px;
            }
            .poll-question { font-weight: bold; margin-bottom: 6px; }
            .poll-option {
                display: block; width: 100%; text-align: left;
                background: rgba(255,255,255,0.08); border: 1px solid #444; color: #e0e0e0;
                padding: 4px 8px; margin-bottom: 3px; border-radius: 4px; cursor: pointer;
            }
            .poll-option:hover { background: rgba(255,255,255,0.15); }
            .pinned-msg {
                background: rgba(255,255,255,0.03); padding: 6px; margin-bottom: 6px;
                border-bottom: 1px solid #333; font-style: italic;
            }
            .time-separator {
                text-align: center; font-size: 10px; color: #777;
                margin: 8px 0;
            }
            #nx-input-box {
                display: flex; padding: 6px; background: #111;
                border-top: 1px solid #333; gap: 6px;
            }
            #nx-input {
                flex: 1; background: #222; border: 1px solid #333; color: #e0e0e0;
                padding: 6px 8px; outline: none; font-size: 13px; border-radius: 4px;
            }
            #nx-send {
                background: #b71c1c; border: none; color: white; font-weight: 600;
                padding: 6px 14px; cursor: pointer; font-size: 13px; border-radius: 4px;
                transition: background 0.2s;
            }
            #nx-send:hover    { background: #8b0000; }
            #nx-send:disabled { opacity: 0.5; cursor: not-allowed; }
            #nx-toggle {
                position: fixed; bottom: 20px; left: 20px;
                width: 38px; height: 38px;
                background: #111; border: 1px solid #333; border-radius: 6px;
                display: flex; align-items: center; justify-content: center;
                font-size: 20px; cursor: pointer; z-index: 99989;
                box-shadow: 0 4px 12px rgba(0,0,0,0.4);
                transition: background 0.2s; user-select: none;
            }
            #nx-toggle:hover { background: #222; }
            #nx-toggle .badge {
                position: absolute; top: -5px; right: -5px;
                background: #4caf50; color: white; border-radius: 10px;
                font-size: 10px; padding: 1px 4px; font-weight: bold;
            }
            #nx-settings {
                position: absolute; top: 34px; right: 6px;
                width: auto; max-width: 260px; max-height: 280px; overflow-y: auto;
                background: #1e1e1e; border: 1px solid #444; padding: 10px;
                color: #e0e0e0; font-size: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.8);
                z-index: 100001; border-radius: 6px; min-width: 200px;
            }
            #nx-settings label { display: block; margin-top: 10px; font-weight: 600; font-size: 11px; color: #aaa; }
            #nx-settings input, #nx-settings select {
                width: 100%; margin-bottom: 5px; background: #2a2a2a; border: 1px solid #444;
                color: white; padding: 5px; font-size: 12px; border-radius: 4px; box-sizing: border-box;
            }
            #nx-settings button {
                margin-top: 5px; background: #b71c1c; border: none; color: white;
                padding: 6px 10px; cursor: pointer; font-size: 12px; border-radius: 4px;
            }
            #nx-settings button:hover { background: #8b0000; }
            #nx-settings small { color: #888; display: block; margin-top: 8px; }
            #nx-autocomplete {
                position: absolute; bottom: 40px; left: 8px; right: 8px;
                background: #2a2a2a; border: 1px solid #555;
                max-height: 100px; overflow-y: auto; z-index: 100002;
                border-radius: 4px; display: none;
            }
            #nx-autocomplete div { padding: 4px 8px; cursor: pointer; color: #e0e0e0; }
            #nx-autocomplete div:hover { background: #444; }
        `;
        document.head.appendChild(style);
        document.body.appendChild(chatContainer);

        messageArea = document.getElementById('nx-messages');
        inputField   = document.getElementById('nx-input');
        sendBtn      = document.getElementById('nx-send');
        settingsPanel = document.getElementById('nx-settings');
        toggleIcon = document.createElement('div');
        toggleIcon.id = 'nx-toggle';
        toggleIcon.innerHTML = '💬';
        document.body.appendChild(toggleIcon);

        messageArea.addEventListener('scroll', () => {
            const tol = 10;
            const atBottom = messageArea.scrollHeight - messageArea.clientHeight <= messageArea.scrollTop + tol;
            userScrolled = !atBottom;
        });

        document.getElementById('nx-dnd-btn').addEventListener('click', toggleDnd);
        document.getElementById('nx-dim-btn').addEventListener('click', toggleDim);
        document.getElementById('nx-min-btn').addEventListener('click', toggleMinimize);
        document.getElementById('nx-cfg-btn').addEventListener('click', () => { settingsPanel.style.display = settingsPanel.style.display === 'block' ? 'none' : 'block'; });
        document.getElementById('nx-mention-badge').addEventListener('click', () => { mentionCount = 0; updateBadges(); messageArea.scrollTop = messageArea.scrollHeight; });
        document.getElementById('nx-unread-badge').addEventListener('click', () => { unreadCount = 0; updateBadges(); messageArea.scrollTop = messageArea.scrollHeight; });
        sendBtn.addEventListener('click', sendMessage);
        inputField.addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); sendMessage(); } });
        inputField.addEventListener('input', () => {
            if (inputField.value.length > 0) { if (!typingTimeout) chatSocket.emit('typing-start'); clearTimeout(typingTimeout); typingTimeout = setTimeout(() => { chatSocket.emit('typing-stop'); typingTimeout = null; }, 3000); }
            else if (typingTimeout) { clearTimeout(typingTimeout); typingTimeout = null; chatSocket.emit('typing-stop'); }
            onInputChange();
        });
        inputField.addEventListener('focus', () => { isInputFocused = true; clearIdle(); applyDim(false); resetIdleTimer(); onInputChange(); });
        inputField.addEventListener('blur', () => { isInputFocused = false; if (!isDim) startIdleTimer(); setTimeout(() => { document.getElementById('nx-autocomplete').style.display = 'none'; }, 100); });
        chatContainer.addEventListener('mouseenter', () => { isHovering = true; clearIdle(); resetIdleTimer(); });
        chatContainer.addEventListener('mouseleave', () => { isHovering = false; if (!isInputFocused && !isDim) startIdleTimer(); });
        toggleIcon.addEventListener('click', () => { if (!isChatOpen) openChat(); else closeChat(); });

        document.addEventListener('keydown', (e) => {
            if (!isInputFocused) return;
            if (e.key === 'Tab') { e.preventDefault(); const ac = document.getElementById('nx-autocomplete'); if (ac.style.display === 'block') { const first = ac.querySelector('div'); if (first) first.click(); } }
            else if (e.key === 'Escape') { e.preventDefault(); inputField.blur(); if (isChatOpen) closeChat(); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); const ownMsgs = messageHistory.filter(m => m.author === username && m.text); if (ownMsgs.length > 0) inputField.value = ownMsgs[ownMsgs.length-1].text; }
            else if (e.key === 'ArrowDown') { e.preventDefault(); inputField.value = ''; }
        });

        messageArea.addEventListener('click', (e) => {
            const target = e.target;
            if (target.tagName === 'STRONG') {
                let name = target.textContent;
                if (name.endsWith(':')) name = name.slice(0, -1);
                name = name.trim();
                if (name === username) return;
                inputField.value = `(${name}) ${inputField.value}`;
                inputField.focus();
            }
            if (target.classList.contains('reaction-btn')) { const msgDiv = target.closest('.user-msg'); if (msgDiv && chatSocket) { const msgId = msgDiv.getAttribute('data-msgid'); chatSocket.emit('add-reaction', { messageId: msgId, emoji: target.textContent.trim() }); } }
            if (target.classList.contains('block-btn')) {
                const msgDiv = target.closest('.user-msg');
                if (msgDiv) {
                    const author = msgDiv.getAttribute('data-author');
                    if (!author || author === username) return;
                    toggleBlockUser(author);
                }
            }
            if (target.classList.contains('unblock-btn')) {
                const placeholder = target.closest('.blocked-placeholder');
                const author = placeholder.getAttribute('data-author');
                if (author) toggleBlockUser(author);
            }
        });
        messageArea.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const strong = e.target.closest('strong');
            if (strong) { const author = strong.textContent; const msgCount = messageHistory.filter(m => m.author === author).length; const online = window.__nexusOnlineUsers?.includes(author); alert(`${author} | Online: ${online ? 'Yes' : 'No'} | Messages: ${msgCount}`); }
        });

        openChat();
        buildSettingsPanel();
        applyConfig();
        startDiscordReminder();
        if (config.dndMode) document.getElementById('nx-dnd-btn').classList.add('active');
        updateConnectionIndicator(false);
    }

    function toggleBlockUser(author) {
        if (blockedUsers.includes(author)) {
            blockedUsers = blockedUsers.filter(a => a !== author);
            localStorage.setItem('nexus_blocked', JSON.stringify(blockedUsers));
            document.querySelectorAll(`.user-msg[data-author="${CSS.escape(author)}"]`).forEach(el => {
                if (el.classList.contains('blocked-real')) el.classList.remove('blocked-hidden');
                const btn = el.querySelector('.block-btn');
                if (btn) { btn.textContent = '🚫'; btn.title = 'Block user'; }
            });
            document.querySelectorAll(`.blocked-placeholder[data-author="${CSS.escape(author)}"]`).forEach(el => el.remove());
            addSystemMessage(`✅ Unblocked ${author}`);
        } else {
            blockedUsers.push(author);
            localStorage.setItem('nexus_blocked', JSON.stringify(blockedUsers));
            document.querySelectorAll(`.user-msg[data-author="${CSS.escape(author)}"]`).forEach(el => {
                el.classList.add('blocked-hidden');
                el.classList.add('blocked-real');
                const btn = el.querySelector('.block-btn');
                if (btn) { btn.textContent = '🔓'; btn.title = 'Unblock user'; }
            });
            addSystemMessage(`🚫 Blocked ${author}`);
        }
    }

    function toggleDnd() {
        config.dndMode = !config.dndMode;
        const btn = document.getElementById('nx-dnd-btn');
        btn.classList.toggle('active', config.dndMode);
        btn.textContent = config.dndMode ? '🔕' : '🔔';
        saveConfig();
    }

    function toggleDim() { isDim = !isDim; applyDim(isDim); }
    function applyDim(state) {
        if (state) {
            chatContainer.classList.add('dim'); chatContainer.classList.remove('idle'); isIdle = false;
        } else {
            chatContainer.classList.remove('dim');
            if (!isInputFocused && !isHovering) startIdleTimer();
        }
        const btn = document.getElementById('nx-dim-btn');
        if (btn) {
            btn.classList.toggle('active', isDim);
            btn.textContent = isDim ? '🌑' : '🌓';
            btn.style.color = isDim ? '#f39c12' : '';
        }
    }

    function toggleMinimize() { isMinimized = !isMinimized; chatContainer.classList.toggle('minimized', isMinimized); }
    function setIdle() { if (!isInputFocused && !isHovering && isChatOpen && !isDim) { isIdle = true; chatContainer.classList.add('idle'); } }
    function clearIdle() { isIdle = false; chatContainer.classList.remove('idle'); }
    function resetIdleTimer() { if (idleTimer) clearTimeout(idleTimer); }
    function startIdleTimer() { resetIdleTimer(); if (!isInputFocused && !isHovering && isChatOpen && !isDim) idleTimer = setTimeout(setIdle, config.idleTimeout * 1000); }

    function updateBadges() {
        const mentionBadge = document.getElementById('nx-mention-badge');
        const unreadBadge = document.getElementById('nx-unread-badge');
        if (mentionBadge) { mentionBadge.style.display = mentionCount > 0 ? 'inline' : 'none'; mentionBadge.textContent = mentionCount; }
        if (unreadBadge) { unreadBadge.style.display = unreadCount > 0 ? 'inline' : 'none'; unreadBadge.textContent = unreadCount; }
        const toggleBadge = toggleIcon.querySelector('.badge');
        if (unreadCount > 0) {
            if (!toggleBadge) { const span = document.createElement('span'); span.className = 'badge'; span.textContent = unreadCount; toggleIcon.appendChild(span); }
            else { toggleBadge.textContent = unreadCount; toggleBadge.style.display = 'block'; }
        } else if (toggleBadge) toggleBadge.style.display = 'none';
        if (document.hidden && mentionCount > 0) document.title = `🔴 (${mentionCount}) Nexus Chat`;
    }

    function scrollIfNeeded() { if (!userScrolled) messageArea.scrollTop = messageArea.scrollHeight; }

    function addMessage(author, text, isBlocked=false, isMention=false, isPrivate=false, msgAuthorColor='#b0b0b0', messageId) {
        const msgId = messageId || (Date.now() + '-' + Math.random().toString(36).substring(2,9));
        messageHistory.push({ author, text, isBlocked, isMention, isPrivate, msgAuthorColor, msgId });
        if (isBlocked) {
            const placeholder = document.createElement('div');
            placeholder.className = 'blocked-placeholder';
            placeholder.setAttribute('data-author', author);
            placeholder.innerHTML = `🚫 Blocked user sent a message <button class="unblock-btn">Unblock</button>`;
            messageArea.appendChild(placeholder);
            scrollIfNeeded();
            return;
        }
        const now = Date.now();
        if (lastMessageTime && now - lastMessageTime > 300000) {
            const mins = Math.floor((now - lastMessageTime) / 60000);
            const sep = document.createElement('div');
            sep.className = 'time-separator';
            sep.textContent = `${mins} min ago`;
            messageArea.appendChild(sep);
        }
        lastMessageTime = now;
        const own = (author === username);
        const effectiveColor = msgAuthorColor || authorColor;
        const div = document.createElement('div');
        div.className = 'user-msg ' + (own ? 'own-msg' : 'other-msg') + (isPrivate ? ' private-msg' : '');
        div.setAttribute('data-msgid', msgId);
        div.setAttribute('data-author', author);
        div.classList.add('blocked-real');
        const avatar = document.createElement('span');
        avatar.style.cssText = 'display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:4px;vertical-align:middle;';
        avatar.style.backgroundColor = effectiveColor;
        let contentHTML = '';
        if (isPrivate) contentHTML = `<span class="private-msg"><strong style="color:${effectiveColor}">→ ${escapeHtml(author)}:</strong> ${escapeHtml(text)}</span>`;
        else {
            const mentionClass = isMention ? ' class="mention"' : '';
            contentHTML = `<strong style="color:${effectiveColor}">${escapeHtml(author)}:</strong> <span${mentionClass}>${escapeHtml(text)}</span>`;
        }
        if (own) { contentHTML += '<span class="you-label">(you)</span>'; }
        div.appendChild(avatar);
        const contentSpan = document.createElement('span');
        contentSpan.innerHTML = contentHTML;
        div.appendChild(contentSpan);
        const bar = document.createElement('span');
        bar.className = 'reactions-bar';
        bar.innerHTML = `
            <button class="reaction-btn" title="👍">👍</button><button class="reaction-btn" title="😂">😂</button><button class="reaction-btn" title="😮">😮</button><button class="reaction-btn" title="❤️">❤️</button><button class="reaction-btn" title="🔥">🔥</button>
            ${own ? '' : `<button class="block-btn" title="${blockedUsers.includes(author) ? 'Unblock' : 'Block'} user">${blockedUsers.includes(author) ? '🔓' : '🚫'}</button>`}
        `;
        div.appendChild(bar);
        const reactionsSpan = document.createElement('span');
        reactionsSpan.className = 'reactions';
        div.appendChild(reactionsSpan);
        if (!own && blockedUsers.includes(author)) div.classList.add('blocked-hidden');
        messageArea.appendChild(div);
        scrollIfNeeded();
    }

    function addSystemMessage(text) { messageHistory.push({ system: true, text }); const div = document.createElement('div'); div.className = 'system-msg'; div.textContent = text; messageArea.appendChild(div); scrollIfNeeded(); }

    function onInputChange() {
        const val = inputField.value;
        const cursorPos = inputField.selectionStart;
        const textBefore = val.slice(0, cursorPos);
        const autocomplete = document.getElementById('nx-autocomplete');
        if (textBefore.startsWith('/') && !textBefore.includes(' ')) {
            const partial = textBefore.slice(1).toLowerCase();
            const commands = [
                { name: '/help', desc: 'Show help' }, { name: '/online', desc: 'List online players' },
                { name: '/poll', desc: 'Create poll' }, { name: '/pin', desc: 'Pin a message' },
                { name: '/stats', desc: 'Your statistics' }, { name: '/me', desc: 'Roleplay action' }
            ];
            const filtered = commands.filter(c => c.name.startsWith('/' + partial));
            if (filtered.length > 0) {
                autocomplete.innerHTML = filtered.map(c => `<div><b>${c.name}</b> – ${c.desc}</div>`).join('');
                autocomplete.style.display = 'block';
                autocomplete.onclick = (ev) => { const div = ev.target.closest('div'); if (div) { inputField.value = div.querySelector('b').textContent + ' '; inputField.focus(); autocomplete.style.display = 'none'; } };
            } else autocomplete.style.display = 'none';
            return;
        }
        const match = textBefore.match(/@(\w*)$/);
        if (match) {
            const partial = match[1].toLowerCase();
            const users = window.__nexusOnlineUsers || [];
            const filtered = users.filter(u => u.toLowerCase().startsWith(partial) && u !== username);
            if (filtered.length > 0) {
                autocomplete.innerHTML = filtered.map(u => `<div>@${u}</div>`).join('');
                autocomplete.style.display = 'block';
                autocomplete.onclick = (ev) => { if (ev.target.tagName === 'DIV') { const name = ev.target.textContent.slice(1); inputField.value = val.slice(0, match.index) + '@' + name + ' ' + val.slice(cursorPos); inputField.focus(); autocomplete.style.display = 'none'; } };
            } else autocomplete.style.display = 'none';
        } else autocomplete.style.display = 'none';
    }

    function openChat() { chatContainer.style.display = 'flex'; isChatOpen = true; unreadCount = 0; updateBadges(); clearIdle(); toggleIcon.style.display = 'none'; startIdleTimer(); playSound('open'); }
    function closeChat() { chatContainer.style.display = 'none'; isChatOpen = false; toggleIcon.style.display = 'flex'; clearIdle(); playSound('close'); }

    function buildSettingsPanel() {
        settingsPanel.innerHTML = `
            <label>Your name</label><input type="text" id="cfg-name" value="${username}" maxlength="15">
            <label>Your color</label><input type="color" id="cfg-authorcolor" value="${authorColor}">
            <label>Theme</label><select id="cfg-theme"><option value="dark" selected>Dark</option></select>
            <label>Background</label><input type="color" id="cfg-bg" value="${config.bgColor}">
            <label>Text color</label><input type="color" id="cfg-text" value="${config.textColor}">
            <label>Size</label><select id="cfg-size">
                <option value="pequeño" ${config.size==='pequeño'?'selected':''}>Small</option>
                <option value="mediano" ${config.size==='mediano'?'selected':''}>Medium</option>
                <option value="grande" ${config.size==='grande'?'selected':''}>Large</option>
            </select>
            <label>Position</label><select id="cfg-pos">
                <option value="top-left" ${config.position==='top-left'?'selected':''}>Top Left</option>
                <option value="top-right" ${config.position==='top-right'?'selected':''}>Top Right</option>
                <option value="bottom-left" ${config.position==='bottom-left'?'selected':''}>Bottom Left</option>
                <option value="bottom-right" ${config.position==='bottom-right'?'selected':''}>Bottom Right</option>
            </select>
            <label>Chat key</label><button id="cfg-key">${config.activationKeyChar}</button>
            <label>Dim key</label><button id="cfg-dim-key">${config.dimKeyChar}</button>
            <label>Auto-hide (s)</label><input type="number" id="cfg-idle" value="${config.idleTimeout}" min="1" max="30">
            <label>Discord reminders</label><input type="checkbox" id="cfg-discord-reminder" ${config.discordReminder?'checked':''}>
            <label>Do Not Disturb</label><input type="checkbox" id="cfg-dnd" ${config.dndMode?'checked':''}>
            <a href="${DISCORD_INVITE}" target="_blank" style="display:block;margin-top:10px;color:#7289da;text-decoration:none;">Join our Discord</a>
            <small>Made by ! System with ❤️</small>
        `;

        document.getElementById('cfg-name').addEventListener('change', function() {
            const newName = this.value.trim().substring(0,15);
            if (!newName || newName === username) { this.value = username; return; }
            if (chatSocket && chatSocket.connected) chatSocket.emit('change-username', newName);
            else { username = newName; sessionStorage.setItem('nexus_username', username); authorColor = getUserColor(username); localStorage.setItem('nexus_authorColor', authorColor); }
        });
        document.getElementById('cfg-authorcolor').addEventListener('input', function() { authorColor = this.value; localStorage.setItem('nexus_authorColor', authorColor); });
        document.getElementById('cfg-bg').addEventListener('input', function() { config.bgColor = this.value; chatContainer.style.background = config.bgColor; saveConfig(); });
        document.getElementById('cfg-text').addEventListener('input', function() { config.textColor = this.value; chatContainer.style.color = config.textColor; saveConfig(); });
        document.getElementById('cfg-size').addEventListener('change', function() { config.size = this.value; applySize(); saveConfig(); });
        document.getElementById('cfg-pos').addEventListener('change', function() { config.position = this.value; applyPosition(); saveConfig(); });
        document.getElementById('cfg-key').addEventListener('click', function() {
            this.textContent = 'Press a key...';
            const handler = (e) => { e.preventDefault(); config.activationKeyChar = e.key; this.textContent = e.key; document.removeEventListener('keydown', handler); saveConfig(); inputField.placeholder = `Press ${config.activationKeyChar} to write...`; };
            document.addEventListener('keydown', handler);
        });
        document.getElementById('cfg-dim-key').addEventListener('click', function() {
            this.textContent = 'Press a key...';
            const handler = (e) => { e.preventDefault(); config.dimKeyChar = e.key; this.textContent = e.key; document.removeEventListener('keydown', handler); saveConfig(); };
            document.addEventListener('keydown', handler);
        });
        document.getElementById('cfg-idle').addEventListener('change', function() { config.idleTimeout = parseInt(this.value)||8; saveConfig(); });
        document.getElementById('cfg-discord-reminder').addEventListener('change', function() { config.discordReminder = this.checked; saveConfig(); if (config.discordReminder) startDiscordReminder(); else stopDiscordReminder(); });
        document.getElementById('cfg-dnd').addEventListener('change', function() { config.dndMode = this.checked; const btn = document.getElementById('nx-dnd-btn'); btn.classList.toggle('active', config.dndMode); btn.textContent = config.dndMode ? '🔕' : '🔔'; saveConfig(); });
    }

    function applySize() { const sizes = { pequeño: {w:250,h:250}, mediano: {w:330,h:330}, grande: {w:400,h:400} }; chatContainer.style.width = sizes[config.size].w+'px'; chatContainer.style.height = sizes[config.size].h+'px'; }
    function applyPosition() {
        const posMap = { 'top-left':{top:'20px',left:'20px',bottom:'auto',right:'auto'}, 'top-right':{top:'20px',right:'20px',bottom:'auto',left:'auto'}, 'bottom-left':{bottom:'20px',left:'20px',top:'auto',right:'auto'}, 'bottom-right':{bottom:'20px',right:'20px',top:'auto',left:'auto'} };
        Object.assign(chatContainer.style, posMap[config.position]);
        Object.assign(toggleIcon.style, posMap[config.position]);
    }
    function applyConfig() { chatContainer.style.background = config.bgColor; chatContainer.style.color = config.textColor; applySize(); applyPosition(); }
    function saveConfig() { localStorage.setItem('nexusChatConfig', JSON.stringify(config)); }

    function startDiscordReminder() {
        stopDiscordReminder();
        if (!config.discordReminder) return;
        discordReminderInterval = setInterval(() => {
            if (chatSocket && chatSocket.connected && gameId) {
                const div = document.createElement('div');
                div.className = 'system-msg discord-reminder';
                div.innerHTML = `🎮 Join our Discord! <span class="discord-link">Click here</span>`;
                messageArea.appendChild(div);
                scrollIfNeeded();
                div.querySelector('.discord-link').addEventListener('click', () => { if (confirm('Go to Discord?')) window.open(DISCORD_INVITE, '_blank'); });
            }
        }, 120000);
    }
    function stopDiscordReminder() { if (discordReminderInterval) { clearInterval(discordReminderInterval); discordReminderInterval = null; } }

    function globalKeyHandler(e) {
        if (isInputFocused) return;
        if (e.key === config.activationKeyChar) { e.preventDefault(); e.stopPropagation(); if (!isChatOpen) openChat(); if (isDim) { isDim = false; applyDim(false); } inputField.focus(); }
        if (e.key === config.dimKeyChar) { e.preventDefault(); e.stopPropagation(); toggleDim(); }
    }
    document.addEventListener('keydown', globalKeyHandler, true);

    function createOnboardingOverlay() {
        if (onboardingOverlay) return;
        onboardingOverlay = document.createElement('div');
        onboardingOverlay.id = 'nx-onboarding';
        onboardingOverlay.innerHTML = `
            <canvas id="nx-particles"></canvas>
            <div id="nx-onboarding-box">
                <img src="${LOGO_URL}" alt="Nexus Chat" class="nx-logo-img">
                <h1 class="nx-title-neon">Welcome to Nexus Chat</h1>
                <p class="nx-subtitle">Choose your battle name (max 15)</p>
                <div class="nx-input-group">
                    <input type="text" id="nx-name-input" placeholder="Enter your name..." maxlength="15" autocomplete="off">
                    <button id="nx-name-submit">Join</button>
                </div>
                <p class="nx-madeby">Made by ! System with ❤️</p>
                <a href="${DISCORD_INVITE}" target="_blank" class="nx-discord-btn">Join Discord</a>
            </div>
        `;
        const style = document.createElement('style');
        style.textContent = `
            #nx-onboarding { position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.92);z-index:100000;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.6s ease; }
            @keyframes fadeIn { from{opacity:0;} to{opacity:1;} }
            #nx-particles { position:absolute;top:0;left:0;width:100%;height:100%; }
            #nx-onboarding-box { position:relative;background:rgba(10,10,10,0.95);border:2px solid #b71c1c;box-shadow:0 0 60px rgba(183,28,28,0.8),0 0 120px rgba(183,28,28,0.4);padding:50px 60px;text-align:center;z-index:1;animation:glitchIn 0.8s ease, scaleIn 0.4s ease 0.8s both;border-radius:8px; }
            @keyframes glitchIn { 0%{transform:translate(-3px,3px) skewX(0deg);opacity:0.7;} 20%{transform:translate(3px,-3px) skewX(4deg);} 40%{transform:translate(-3px,0) skewX(-2deg);} 60%{transform:translate(0,0) skewX(0);opacity:1;} }
            @keyframes scaleIn { from{transform:scale(0.85);opacity:0;} to{transform:scale(1);opacity:1;} }
            .nx-logo-img { width:120px;height:120px;margin-bottom:25px;filter:drop-shadow(0 0 15px #b71c1c); }
            .nx-title-neon { font-family:'Segoe UI',sans-serif;font-weight:700;font-size:36px;color:#ff4444;margin:0 0 10px;text-shadow:0 0 15px #b71c1c,0 0 30px #8b0000,0 0 60px #b71c1c;animation:pulse 2s infinite; }
            @keyframes pulse { 0%,100%{text-shadow:0 0 15px #b71c1c,0 0 30px #8b0000;} 50%{text-shadow:0 0 30px #ff4444,0 0 60px #b71c1c;} }
            .nx-subtitle { font-size:18px;color:#ccc;margin:0 0 30px;font-weight:300; }
            .nx-input-group { margin:0;display:flex;gap:10px;justify-content:center; }
            #nx-name-input { background:#1a1a1a;border:2px solid #b71c1c;color:white;padding:14px 24px;font-size:20px;width:280px;outline:none;border-radius:6px;transition:border-color 0.2s,box-shadow 0.2s; }
            #nx-name-input:focus { border-color:#ff4444;box-shadow:0 0 25px rgba(255,68,68,0.4); }
            #nx-name-submit { background:#b71c1c;border:none;color:white;font-weight:bold;font-size:20px;padding:14px 30px;cursor:pointer;border-radius:6px;transition:background 0.2s,transform 0.1s; }
            #nx-name-submit:hover { background:#8b0000;transform:scale(1.02); }
            .nx-madeby { font-size:13px;color:#555;margin-top:25px; }
            .nx-discord-btn { display:inline-block;margin-top:15px;color:#7289da;text-decoration:none;font-size:14px;border:1px solid #7289da;padding:8px 16px;border-radius:4px;transition:background 0.2s; }
            .nx-discord-btn:hover { background:rgba(114,137,218,0.2); }
            .shake { animation:shake 0.4s ease; }
            @keyframes shake { 0%,100%{transform:translateX(0);} 25%{transform:translateX(-10px);} 50%{transform:translateX(10px);} 75%{transform:translateX(-6px);} }
        `;
        document.head.appendChild(style);
        document.body.appendChild(onboardingOverlay);

        const nameInput = document.getElementById('nx-name-input');
        const submitBtn = document.getElementById('nx-name-submit');
        const box = document.getElementById('nx-onboarding-box');
        function submitName() {
            const name = nameInput.value.trim();
            if (!name || name.length > 15) { box.classList.add('shake'); nameInput.style.borderColor = '#ff0000'; setTimeout(() => { box.classList.remove('shake'); nameInput.style.borderColor = '#b71c1c'; }, 400); return; }
            username = name;
            sessionStorage.setItem('nexus_username', username);
            authorColor = getUserColor(username);
            localStorage.setItem('nexus_authorColor', authorColor);
            onboardingOverlay.style.transition = 'opacity 0.5s ease';
            onboardingOverlay.style.opacity = '0';
            setTimeout(() => { onboardingOverlay.remove(); onboardingOverlay = null; startChat(); }, 500);
        }
        submitBtn.addEventListener('click', submitName);
        nameInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') submitName(); });

        const canvas = document.getElementById('nx-particles');
        const ctx = canvas.getContext('2d');
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        const particles = [];
        for (let i = 0; i < 150; i++) particles.push({ x:Math.random()*canvas.width, y:Math.random()*canvas.height, radius:Math.random()*3+1, speedX:Math.random()*0.8-0.4, speedY:Math.random()*0.8-0.4, alpha:Math.random()*0.6+0.3 });
        function animateParticles() {
            if (!onboardingOverlay) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#b71c1c';
            for (const p of particles) {
                p.x += p.speedX; p.y += p.speedY;
                if (p.x < 0 || p.x > canvas.width) p.speedX *= -1;
                if (p.y < 0 || p.y > canvas.height) p.speedY *= -1;
                ctx.globalAlpha = p.alpha;
                ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI*2); ctx.fill();
            }
            requestAnimationFrame(animateParticles);
        }
        animateParticles();
    }

        function escapeHtml(str) { const div = document.createElement('div'); div.textContent = str; return div.innerHTML; }
    function escapeRegex(str) { return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

    function startChat() { createChatUI(); }

    function safeInit() {
        if (document.body) {
            if (!username) createOnboardingOverlay();
            else startChat();
        } else {
            document.addEventListener('DOMContentLoaded', () => {
                if (!username) createOnboardingOverlay();
                else startChat();
            });
        }
    }
    safeInit();
})();
