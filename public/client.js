(function() {
    'use strict';
    if (window.__nexusChatLoaded) return;
    window.__nexusChatLoaded = true;

    const EXT_VERSION = '3.1.0';
    const DOWNLOAD_URL = 'https://wnexuschat.netlify.app';
    const SERVER_URL    = 'https://nexus-chat-p7ph.onrender.com';
    const LOGO_URL      = 'https://i.ibb.co/FkXVWJnC/Chat-GPT-Image-26-jun-2026-19-06-21.png';
    const DISCORD_INVITE = 'https://discord.gg/rDJhfCTDqR';
    const FIRE_GIF_URL  = 'https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExd2lyZTFqbGttcWh0d3cwenUwc2R2NzB6aGF4YWw4dzQ0b2FpMXZjbyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/q4voi8znbYANE5GtYI/giphy.gif';

    function createSocialToken() {
        const bytes = new Uint8Array(32);
        crypto.getRandomValues(bytes);
        let binary = '';
        bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
        return `NXR-${btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')}`;
    }

    function isSocialToken(value) {
        return typeof value === 'string' && /^(?:NXR-)?[A-Za-z0-9_-]{40,160}$/.test(value);
    }

    function persistSocialToken(value) {
        if (!isSocialToken(value)) return false;
        localStorage.setItem('nexus_social_token', value);
        window.dispatchEvent(new CustomEvent('NEXUS_SOCIAL_TOKEN', { detail: { token: value } }));
        return true;
    }

    function createGameLoadingScreen() {
        const existing = document.getElementById('nx-game-loader');
        const overlay = existing || document.createElement('div');
        overlay.id = 'nx-game-loader';
        overlay.innerHTML = '<div class="nx-loader-core"><span class="nx-loader-mark">N</span><p>Preparing the battlefield</p><div class="nx-loader-track"><i></i></div><small>Loading essential assets…</small></div>';
        if (!existing) document.documentElement.appendChild(overlay);
        if (!document.getElementById('nx-game-loader-style')) {
            const style = document.createElement('style');
            style.id = 'nx-game-loader-style';
            style.textContent = `
                #nx-game-loader { position:fixed; inset:0; z-index:2147483646; display:grid; place-items:center; background:#0d100b; color:#f4eedb; font-family:Inter,Segoe UI,system-ui,sans-serif; transition:opacity .45s ease,visibility .45s ease; }
                #nx-game-loader.nx-loader-done { opacity:0; visibility:hidden; pointer-events:none; }
                .nx-loader-core { width:min(330px,calc(100vw - 48px)); text-align:center; }
                .nx-loader-mark { width:58px; height:58px; margin:auto; display:grid; place-items:center; border-radius:17px; color:#171a10; background:#f2c94c; font-weight:900; font-size:24px; box-shadow:0 20px 55px rgba(242,201,76,.18); }
                .nx-loader-core p { margin:20px 0 12px; font-weight:800; letter-spacing:.02em; }
                .nx-loader-core small { display:block; margin-top:10px; color:#8f9981; font-size:10px; }
                .nx-loader-track { height:3px; overflow:hidden; border-radius:4px; background:rgba(244,238,219,.12); }
                .nx-loader-track i { display:block; width:var(--nx-load,8%); height:100%; background:#f2c94c; box-shadow:0 0 14px rgba(242,201,76,.45); transition:width .25s ease; }
            `;
            document.documentElement.appendChild(style);
        }
        let lastResourceCount = 0;
        let stableChecks = 0;
        const startedAt = Date.now();
        const finish = () => {
            overlay.style.setProperty('--nx-load', '100%');
            overlay.querySelector('small').textContent = 'Ready';
            setTimeout(() => overlay.classList.add('nx-loader-done'), 180);
            setTimeout(() => overlay.remove(), 900);
        };
        const timer = setInterval(() => {
            const resources = performance.getEntriesByType('resource').length;
            stableChecks = resources === lastResourceCount ? stableChecks + 1 : 0;
            lastResourceCount = resources;
            const images = Array.from(document.images);
            const imageRatio = images.length ? images.filter((image) => image.complete).length / images.length : 0;
            const domReady = document.readyState !== 'loading';
            const canvasReady = Boolean(document.querySelector('canvas'));
            const progress = Math.min(94, 8 + (domReady ? 20 : 0) + Math.min(resources, 30) + Math.round(imageRatio * 22) + (canvasReady ? 14 : 0));
            overlay.style.setProperty('--nx-load', `${progress}%`);
            const majorityReady = domReady && canvasReady && imageRatio >= .7 && stableChecks >= 2;
            if (majorityReady || Date.now() - startedAt > 15000) {
                clearInterval(timer);
                finish();
            }
        }, 400);
    }

    createGameLoadingScreen();

    function hslToHex(hsl) {
        const match = hsl.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
        if (!match) return '#5dade2';
        const h = parseInt(match[1]) / 360;
        const s = parseInt(match[2]) / 100;
        const l = parseInt(match[3]) / 100;
        const a = s * Math.min(l, 1 - l);
        const f = n => {
            const k = (n + h * 12) % 12;
            return Math.round((l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)) * 255).toString(16).padStart(2, '0');
        };
        return `#${f(0)}${f(8)}${f(4)}`;
    }
    function escapeHtml(str) { const div = document.createElement('div'); div.textContent = str; return div.innerHTML; }
    function escapeRegex(str) { return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    function readStoredJson(key, fallback) {
        try {
            const value = JSON.parse(localStorage.getItem(key) || 'null');
            return value === null ? fallback : value;
        } catch (error) {
            console.warn(`[NexusChat] Ignoring invalid local setting: ${key}`);
            return fallback;
        }
    }
    function sanitizeColor(value) {
        return typeof value === 'string' && /^(#[0-9a-f]{6}|hsl\(\s*(?:\d|[1-9]\d|[12]\d\d|3[0-5]\d|360)\s*,\s*(?:\d|[1-9]\d|100)%\s*,\s*(?:\d|[1-9]\d|100)%\s*\))$/i.test(value.trim())
            ? value.trim()
            : '#5dade2';
    }

    const DEFAULT_CONFIG = {
        bgColor: '#1a1a1a',
        textColor: '#e0e0e0',
        size: 'mediano',
        position: 'bottom-left',
        activationKeyChar: '5',
        dimKeyChar: 'b',
        idleTimeout: 8,
        discordReminder: true,
        dndMode: false,
        theme: 'dark',
        emojiEnabled: true,
        glassmorphism: true,
        volume: 0.5,
        performanceMode: 'balanced'
    };
    let config = Object.assign({}, DEFAULT_CONFIG, readStoredJson('nexusChatConfig', {}));

    function applyPerformanceMode(mode) {
        if (mode === 'native') return;
        const gameConfig = readStoredJson('surviv_config', {});
        gameConfig.highResTex = false;
        gameConfig.screenShake = false;
        gameConfig.interpolation = mode !== 'low-power';
        gameConfig.localRotation = false;
        localStorage.setItem('surviv_config', JSON.stringify(gameConfig));
    }
    applyPerformanceMode(config.performanceMode);

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

    let blockedUsers        = readStoredJson('nexus_blocked', []);
    if (!Array.isArray(blockedUsers)) blockedUsers = [];
    let recentLongMessages  = [];
    let mutedUntil          = 0;

    let gameId = null, chatSocket = null, messageHistory = [];
    let activeChannel = 'game';
    let selectedFriend = null;
    let socialProfile = null;
    let socialFriends = [];
    let socialRequests = [];
    let globalMessageHistory = [];
    const directMessageHistory = new Map();
    const socialUnread = new Map();
    const bootstrapToken = window.__NEXUS_BOOTSTRAP__ && window.__NEXUS_BOOTSTRAP__.socialToken;
    const storedSocialToken = localStorage.getItem('nexus_social_token');
    let socialToken = isSocialToken(bootstrapToken)
        ? bootstrapToken
        : (isSocialToken(storedSocialToken) ? storedSocialToken : createSocialToken());
    persistSocialToken(socialToken);
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
    let killLeaderElement = null;
    let killLeaderObserver = null;
    let scrollToBottomBtn = null;
    let scrollAnimationId = null;
    let killLeaderName = null;

    function playSound(type) {
        if (config.dndMode && type !== 'mention') return;
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const sampleRate = audioCtx.sampleRate;
            const gainNode = audioCtx.createGain();
            gainNode.gain.value = config.volume || 0.5;
            gainNode.connect(audioCtx.destination);
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
            source.connect(gainNode);
            source.start();
        } catch(e) {}
    }

    function saveHistory() {
        const toSave = messageHistory.slice(-100);
        try { localStorage.setItem('nexus_chat_history', JSON.stringify(toSave)); } catch(e) {}
    }
    function loadHistory() {
        try {
            const saved = localStorage.getItem('nexus_chat_history');
            if (saved) {
                const arr = JSON.parse(saved);
                messageHistory = Array.isArray(arr) ? arr : [];
                messageHistory.forEach(msg => {
                    if (msg.system) {
                        const div = document.createElement('div');
                        div.className = 'system-msg';
                        div.textContent = msg.text;
                        if (messageArea) messageArea.appendChild(div);
                    } else {
                        addMessage(msg.author, msg.text, msg.isBlocked, msg.isMention, msg.isPrivate, msg.msgAuthorColor, msg.msgId, true);
                    }
                });
            }
        } catch(e) {}
    }

    function acceptGameId(newGameId) {
        if (typeof newGameId !== 'string' || !/^[a-zA-Z0-9._:-]{1,96}$/.test(newGameId)) return;
        if (newGameId !== gameId) {
            if (gameId && totalMessagesThisGame > 0) addSystemMessage(`Game ended. Messages: ${totalMessagesThisGame}, mentions: ${totalMentionsThisGame}`);
            gameId = newGameId;
            messageHistory = [];
            if (messageArea) messageArea.innerHTML = '';
            mentionCount = 0; unreadCount = 0;
            updateBadges();
            if (chatSocket) chatSocket.disconnect();
            totalMessagesThisGame = 0; totalMentionsThisGame = 0;
            connectToChat();
            startDiscordReminder();
        }
    }

    function setupGameIdDetection() {
        const isExtension = typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getURL === 'function';
        if (isExtension) {
            const script = document.createElement('script');
            script.src = chrome.runtime.getURL('interceptor.js');
            script.onload = function() { this.remove(); };
            (document.head || document.documentElement).appendChild(script);
            window.addEventListener('message', (event) => {
                if (event.source !== window || !event.data || event.data.type !== 'NEXUS_GAMEID') return;
                acceptGameId(event.data.gameId);
            });
        } else {
            const OriginalWebSocket = window.WebSocket;
            window.WebSocket = new Proxy(OriginalWebSocket, {
                construct(Target, args) {
                    const match = String(args[0] || '').match(/play\?gameId=([a-zA-Z0-9._:-]+)/i);
                    if (match) acceptGameId(match[1]);
                    return Reflect.construct(Target, args);
                }
            });
        }

        setTimeout(() => {
            if (!gameId) {
                const combined = window.location.hash + window.location.search;
                const match = combined.match(/gameId=([a-zA-Z0-9._:-]+)/i);
                if (match) acceptGameId(match[1]);
            }
        }, 2000);
    }

    setupGameIdDetection();

    function connectToChat() {
        if (!username) return;
        if (chatSocket && chatSocket.connected) return;
        if (typeof io === 'undefined') {
            const script = document.createElement('script');
            script.src = 'https://cdn.socket.io/4.7.2/socket.io.min.js';
            script.onload = initSocket;
            document.head.appendChild(script);
        } else {
            initSocket();
        }
    }

    function initSocket() {
        try {
            const roomId = gameId || 'lobby';
            chatSocket = io(SERVER_URL, { transports: ['websocket', 'polling'], query: { gameId: roomId } });
            chatSocket.on('connect', () => {
                updateConnectionIndicator(true);
                chatSocket.emit('join', { gameId: roomId, username, socialToken });
                addSystemMessage('✅ Connected');
                playSound('open');
                updateToggleConnectionDot(true);
            });
            chatSocket.on('disconnect', () => {
                updateConnectionIndicator(false);
                addSystemMessage('❌ Disconnected');
                playSound('close');
                stopDiscordReminder();
                updateToggleConnectionDot(false);
            });
            chatSocket.on('chat-history', (history) => {
                messageHistory = [];
                if (activeChannel === 'game' && messageArea) messageArea.innerHTML = '';
                history.forEach(msg => {
                    const isBlocked = blockedUsers.includes(msg.author) && msg.author !== username;
                    if (activeChannel === 'game') addMessage(msg.author, msg.text, isBlocked, false, !!msg.recipient, msg.authorColor, msg.messageId);
                    else messageHistory.push({ author: msg.author, text: msg.text, isBlocked, isMention: false, isPrivate: !!msg.recipient, msgAuthorColor: msg.authorColor, msgId: msg.messageId });
                });
            });
            chatSocket.on('pinned-message', (text) => {
                const oldPin = document.querySelector('.pinned-msg:not(.kill-leader)');
                if (oldPin) oldPin.remove();
                if (!text) return;
                const pinDiv = document.createElement('div');
                pinDiv.className = 'pinned-msg';
                pinDiv.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 17l-6 6v-12l-6-6h24l-6 6v12l-6-6z"/></svg>`;
                const pinText = document.createElement('span');
                pinText.textContent = text;
                pinDiv.appendChild(pinText);
                if (killLeaderElement && killLeaderElement.nextSibling) {
                    messageArea.insertBefore(pinDiv, killLeaderElement.nextSibling);
                } else {
                    messageArea.prepend(pinDiv);
                }
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
                const authorKills = payload.kills || 0;
                if (activeChannel === 'game') {
                    addMessage(author, payload.text, isBlocked, mentioned, !!payload.recipient, payload.authorColor, payload.messageId, false, authorKills);
                } else {
                    messageHistory.push({ author, text: payload.text, isBlocked, isMention: mentioned, isPrivate: !!payload.recipient, msgAuthorColor: payload.authorColor, msgId: payload.messageId, authorKills });
                    saveHistory();
                }
            });
            chatSocket.on('social-session', (session) => {
                if (session.token) {
                    socialToken = session.token;
                    persistSocialToken(socialToken);
                }
                socialProfile = session.profile;
                socialFriends = Array.isArray(session.friends) ? session.friends : [];
                socialRequests = Array.isArray(session.requests) ? session.requests : [];
                globalMessageHistory = Array.isArray(session.globalHistory) ? session.globalHistory : [];
                renderSocialSidebar();
                refreshSettingsIdentity();
                if (activeChannel !== 'game') renderActiveChannel();
            });
            chatSocket.on('social-update', (session) => {
                socialProfile = session.profile || socialProfile;
                socialFriends = Array.isArray(session.friends) ? session.friends : socialFriends;
                socialRequests = Array.isArray(session.requests) ? session.requests : socialRequests;
                renderSocialSidebar();
            });
            chatSocket.on('global-message', (message) => {
                if (!globalMessageHistory.some((item) => item.id === message.id)) globalMessageHistory.push(message);
                globalMessageHistory = globalMessageHistory.slice(-100);
                if (activeChannel === 'global') renderSocialMessage(message, false);
                else if (message.authorId !== socialProfile?.id) incrementSocialUnread('global');
            });
            chatSocket.on('direct-history', ({ friendId, messages }) => {
                directMessageHistory.set(friendId, Array.isArray(messages) ? messages : []);
                if (activeChannel === 'direct' && selectedFriend?.id === friendId) renderActiveChannel();
            });
            chatSocket.on('direct-message', (message) => {
                const friendId = message.fromId === socialProfile?.id ? message.toId : message.fromId;
                const history = directMessageHistory.get(friendId) || [];
                if (!history.some((item) => item.id === message.id)) history.push(message);
                directMessageHistory.set(friendId, history.slice(-100));
                if (activeChannel === 'direct' && selectedFriend?.id === friendId) renderSocialMessage(message, true);
                else if (message.fromId !== socialProfile?.id) incrementSocialUnread(friendId);
            });
            chatSocket.on('friend-request-received', ({ from }) => addSystemMessage(`${from.username} sent you a friend request.`));
            chatSocket.on('friend-request-sent', ({ to }) => addSystemMessage(`Friend request sent to ${to.username}.`));
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
            chatSocket.on('user-list', (users) => {
                window.__nexusOnlineUsers = users;
                const onlineCount = document.getElementById('nx-online-count');
                if (onlineCount) onlineCount.textContent = users.length;
                if (isInputFocused) onInputChange();
            });
            chatSocket.on('online-list', (users) => addSystemMessage(`👥 Online: ${users.join(', ')}`));
            chatSocket.on('reaction-update', ({ messageId, emoji, count }) => {
                const msgDiv = messageArea?.querySelector(`.user-msg[data-msgid="${CSS.escape(messageId)}"]`);
                if (msgDiv) {
                    const reactionsSpan = msgDiv.querySelector('.reactions');
                    const existing = reactionsSpan.querySelector(`.reaction[data-emoji="${emoji}"]`);
                    if (existing) {
                        existing.textContent = `${emoji} ${Number.isInteger(count) ? count : 1}`;
                    } else {
                        const span = document.createElement('span');
                        span.className = 'reaction';
                        span.setAttribute('data-emoji', emoji);
                        span.textContent = `${emoji} ${Number.isInteger(count) ? count : 1}`;
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

    function getPlayerName() {
        const configStr = localStorage.getItem('surviv_config');
        if (configStr) {
            try { const config = JSON.parse(configStr); if (config.playerName) return config.playerName; } catch(e) {}
        }
        return null;
    }

    function getPlayerKills() {
        const killEl = document.querySelector('.ui-player-kills.js-ui-player-kills, .player-kills');
        if (killEl) {
            const kills = parseInt(killEl.textContent, 10);
            return isNaN(kills) ? 0 : kills;
        }
        return 0;
    }

    function updateKillLeader() {
        const nameEl = document.getElementById('ui-kill-leader-name') || document.querySelector('.leader-name');
        const countEl = document.getElementById('ui-kill-leader-count') || document.querySelector('.leader-kills');
        if (!nameEl || !countEl) return;
        const name = nameEl.textContent.trim() || 'Nadie';
        const kills = countEl.textContent.trim() || '0';

        if (name !== killLeaderName) {
            killLeaderName = name;
            updateMessagesForKillLeader();
        }

        if (!killLeaderElement) {
            killLeaderElement = document.createElement('div');
            killLeaderElement.className = 'pinned-msg kill-leader';
            killLeaderElement.innerHTML = `
                <img src="${FIRE_GIF_URL}" class="fire-gif fire-gif-left" alt="🔥">
                <span class="kill-leader-text">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="gold" stroke="none"><path d="M5 16l-3-4 14-14 4 14-15 4z"/></svg>
                    Kill Leader: <strong>${escapeHtml(name)}</strong> (${escapeHtml(kills)})
                </span>
                <img src="${FIRE_GIF_URL}" class="fire-gif fire-gif-right" alt="🔥">
            `;
            if (messageArea && messageArea.firstChild) {
                messageArea.insertBefore(killLeaderElement, messageArea.firstChild);
            }
        } else {
            const strongEl = killLeaderElement.querySelector('strong');
            if (strongEl) strongEl.textContent = name;
            const textSpan = killLeaderElement.querySelector('.kill-leader-text');
            if (textSpan) textSpan.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="gold" stroke="none"><path d="M5 16l-3-4 14-14 4 14-15 4z"/></svg>
                Kill Leader: <strong>${escapeHtml(name)}</strong> (${escapeHtml(kills)})
            `;
        }
    }

    function updateMessagesForKillLeader() {
        if (!messageArea) return;
        const messages = messageArea.querySelectorAll('.user-msg');
        messages.forEach(msg => {
            const author = msg.getAttribute('data-author');
            if (author === killLeaderName) {
                msg.classList.add('kill-leader-msg');
            } else {
                msg.classList.remove('kill-leader-msg');
            }
        });
    }

    function waitForKillLeaderElements() {
        const check = () => {
            const nameEl = document.getElementById('ui-kill-leader-name') || document.querySelector('.leader-name');
            const countEl = document.getElementById('ui-kill-leader-count') || document.querySelector('.leader-kills');
            if (nameEl && countEl) {
                observeKillLeader();
                return true;
            }
            return false;
        };
        if (check()) return;
        const observer = new MutationObserver(() => {
            if (check()) observer.disconnect();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function observeKillLeader() {
        if (killLeaderObserver) killLeaderObserver.disconnect();
        const nameEl = document.getElementById('ui-kill-leader-name') || document.querySelector('.leader-name');
        const countEl = document.getElementById('ui-kill-leader-count') || document.querySelector('.leader-kills');
        if (!nameEl || !countEl) return;
        killLeaderObserver = new MutationObserver(updateKillLeader);
        killLeaderObserver.observe(nameEl, { childList: true, characterData: true, subtree: true });
        killLeaderObserver.observe(countEl, { childList: true, characterData: true, subtree: true });
        updateKillLeader();
    }

    function updateConnectionIndicator(connected) {
        if (!connectionIndicator) return;
        connectionIndicator.style.backgroundColor = connected ? '#2ecc71' : '#e74c3c';
    }
    function updateToggleConnectionDot(connected) {
        const dot = toggleIcon?.querySelector('.toggle-connection-dot');
        if (dot) dot.style.backgroundColor = connected ? '#2ecc71' : '#e74c3c';
    }

    function updateTypingIndicator() {
        const typingDiv = document.getElementById('nx-typing');
        if (!typingDiv) return;
        const names = Array.from(typingUsers.keys()).filter(name => name !== username);
        if (names.length > 0) {
            const safeNames = names.slice(0, 2).map(escapeHtml).join(', ');
            typingDiv.innerHTML = `<span class="typing-dots">${safeNames} ${names.length > 2 ? 'and others' : ''} is typing<span class="dots-anim"><span>.</span><span>.</span><span>.</span></span></span>`;
        } else {
            typingDiv.innerHTML = '';
        }
    }

    function renderPoll(pollId, question, options) {
        const div = document.createElement('div');
        div.className = 'poll-container';
        div.setAttribute('data-pollid', pollId);
        div.innerHTML = `<div class="poll-question"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 20V10M12 20V4M6 20v-6"/></svg> ${escapeHtml(question)}</div>`;
        options.forEach((opt, idx) => {
            const btn = document.createElement('button');
            btn.className = 'poll-option';
            btn.textContent = `${opt.option} (${opt.votes})`;
            btn.addEventListener('click', () => {
                if (chatSocket && chatSocket.connected) chatSocket.emit('poll-vote', { pollId, optionIndex: idx });
            });
            div.appendChild(btn);
        });
        messageArea.appendChild(div);
        scrollToBottom();
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
        scrollToBottom();
        setTimeout(() => div.remove(), 3000);
    }

    function incrementSocialUnread(key) {
        socialUnread.set(key, (socialUnread.get(key) || 0) + 1);
        renderSocialSidebar();
    }

    function setActiveChannel(channel, friend = null) {
        activeChannel = channel;
        selectedFriend = friend;
        const key = channel === 'direct' ? friend?.id : channel;
        if (key) socialUnread.delete(key);
        if (channel === 'direct' && friend && chatSocket?.connected) chatSocket.emit('direct-history', friend.id);
        renderSocialSidebar();
        renderActiveChannel();
    }

    function renderSocialSidebar() {
        const profile = document.getElementById('nx-social-profile');
        const friends = document.getElementById('nx-friend-list');
        const requests = document.getElementById('nx-request-list');
        if (!profile || !friends || !requests) return;
        profile.innerHTML = socialProfile
            ? `<span class="nx-avatar">${escapeHtml(socialProfile.username.slice(0, 1).toUpperCase())}</span><span><strong>${escapeHtml(socialProfile.username)}</strong><button id="nx-copy-code" title="Copy friend code">${escapeHtml(socialProfile.friendCode)}</button></span>`
            : '<span class="nx-social-loading">Connecting Nexus ID…</span>';
        requests.innerHTML = socialRequests.length
            ? socialRequests.map((request) => `<div class="nx-request" data-request-id="${request.id}"><span>${escapeHtml(request.from.username)}</span><button data-action="accept" title="Accept">✓</button><button data-action="decline" title="Decline">×</button></div>`).join('')
            : '<span class="nx-empty">No pending requests</span>';
        friends.innerHTML = socialFriends.length
            ? socialFriends.map((friend) => `<button class="nx-friend ${activeChannel === 'direct' && selectedFriend?.id === friend.id ? 'active' : ''}" data-friend-id="${friend.id}"><span class="nx-presence ${friend.online ? 'online' : ''}"></span><span>${escapeHtml(friend.username)}</span>${socialUnread.get(friend.id) ? `<b>${socialUnread.get(friend.id)}</b>` : ''}</button>`).join('')
            : '<span class="nx-empty">Add someone with their Nexus ID</span>';
        document.querySelectorAll('.nx-channel').forEach((button) => button.classList.toggle('active', button.dataset.channel === activeChannel));
        const globalBadge = document.getElementById('nx-global-unread');
        if (globalBadge) {
            const count = socialUnread.get('global') || 0;
            globalBadge.textContent = count;
            globalBadge.hidden = count === 0;
        }
    }

    function renderSocialMessage(message, direct) {
        if (!messageArea) return;
        const own = direct ? message.fromId === socialProfile?.id : message.authorId === socialProfile?.id;
        const div = document.createElement('div');
        div.className = `user-msg social-msg ${own ? 'own-msg' : 'other-msg'}`;
        const meta = document.createElement('div');
        meta.className = 'nx-message-meta';
        const author = document.createElement('strong');
        author.textContent = message.author || (own ? username : 'Player');
        const time = document.createElement('time');
        time.textContent = new Date(message.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        meta.append(author, time);
        const body = document.createElement('p');
        body.textContent = message.text;
        div.append(meta, body);
        messageArea.appendChild(div);
        scrollToBottom();
    }

    function renderActiveChannel() {
        if (!messageArea) return;
        messageArea.innerHTML = '';
        const title = document.getElementById('nx-channel-title');
        const subtitle = document.getElementById('nx-channel-subtitle');
        if (activeChannel === 'game') {
            if (title) title.textContent = 'Match chat';
            if (subtitle) subtitle.textContent = gameId ? `Room ${gameId}` : 'Waiting for a match';
            messageHistory.forEach((msg) => {
                if (msg.system) {
                    const div = document.createElement('div'); div.className = 'system-msg'; div.textContent = msg.text; messageArea.appendChild(div);
                } else addMessage(msg.author, msg.text, msg.isBlocked, msg.isMention, msg.isPrivate, msg.msgAuthorColor, msg.msgId, true, msg.authorKills || 0);
            });
            inputField.placeholder = `Message your match — ${config.activationKeyChar}`;
        } else if (activeChannel === 'global') {
            if (title) title.textContent = 'Global';
            if (subtitle) subtitle.textContent = 'Everyone connected to Nexus';
            globalMessageHistory.forEach((message) => renderSocialMessage(message, false));
            inputField.placeholder = 'Message #global';
        } else if (selectedFriend) {
            if (title) title.textContent = selectedFriend.username;
            if (subtitle) subtitle.textContent = selectedFriend.online ? 'Online now' : 'Offline · messages are saved';
            (directMessageHistory.get(selectedFriend.id) || []).forEach((message) => renderSocialMessage(message, true));
            inputField.placeholder = `Message ${selectedFriend.username}`;
        }
        const typing = document.getElementById('nx-typing');
        if (typing) typing.style.display = activeChannel === 'game' ? '' : 'none';
        renderSocialSidebar();
    }

    function sendMessage() {
        if (!chatSocket || !chatSocket.connected) return;
        if (Date.now() < mutedUntil) { showError(`Muted for ${Math.ceil((mutedUntil - Date.now()) / 1000)}s`); return; }
        if (sendCooldown) return;

        let text = inputField.value.trim();
        if (text === '/help') {
            addSystemMessage(`Commands: /online, /help, /poll, /pin, /stats, (name) msg, /me. Use the sidebar for Global and friends.`);
            inputField.value = ''; inputField.focus(); return;
        }
        if (activeChannel !== 'game') {
            if (!text || text.length > 250) { if (text.length > 250) showError('Max 250 chars'); return; }
            text = applyEmoji(text);
            if (activeChannel === 'global') chatSocket.emit('global-message', text);
            else if (selectedFriend) chatSocket.emit('direct-message', { friendId: selectedFriend.id, text });
            playSound('send');
            inputField.value = '';
            inputField.focus();
            sendCooldown = true; sendBtn.disabled = true;
            setTimeout(() => { sendCooldown = false; sendBtn.disabled = false; }, 800);
            return;
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

        const kills = getPlayerKills();
        chatSocket.emit('chat-message', { author: username, text, timestamp: Date.now(), recipient: recipient || null, authorColor: authorColor, kills: kills });
        playSound('send');
        inputField.value = ''; inputField.blur();
        if (typingTimeout) { clearTimeout(typingTimeout); chatSocket.emit('typing-stop'); typingTimeout = null; }
        if (isDim) applyDim(true); else { clearIdle(); startIdleTimer(); }
        sendCooldown = true; sendBtn.disabled = true;
        setTimeout(() => { sendCooldown = false; sendBtn.disabled = false; }, 2000);
    }

    function isAtBottom() {
        const tol = 30;
        return messageArea.scrollHeight - messageArea.clientHeight <= messageArea.scrollTop + tol;
    }
    function scrollToBottom(smooth = true) {
        if (scrollAnimationId) cancelAnimationFrame(scrollAnimationId);
        userScrolled = false;
        updateScrollButton();
        if (!smooth) { messageArea.scrollTop = messageArea.scrollHeight; return; }
        const target = messageArea.scrollHeight;
        const start = messageArea.scrollTop;
        const duration = 200;
        const startTime = performance.now();
        function animate(now) {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const ease = 1 - Math.pow(1 - progress, 3);
            messageArea.scrollTop = start + (target - start) * ease;
            if (progress < 1) { scrollAnimationId = requestAnimationFrame(animate); }
            else { scrollAnimationId = null; messageArea.scrollTop = target; }
        }
        scrollAnimationId = requestAnimationFrame(animate);
    }
    function updateScrollButton() {
        if (!scrollToBottomBtn) return;
        scrollToBottomBtn.classList.toggle('hidden', isAtBottom());
    }

    function createChatUI() {
        chatContainer = document.createElement('div');
        chatContainer.id = 'nx-chat';
        chatContainer.innerHTML = `
            <aside id="nx-sidebar" aria-label="Nexus social navigation">
                <div class="nx-sidebar-brand"><span>N</span><strong>Nexus</strong></div>
                <nav class="nx-channel-list" aria-label="Chat channels">
                    <button class="nx-channel active" data-channel="game"><span>#</span><span>Match chat</span></button>
                    <button class="nx-channel" data-channel="global"><span>◎</span><span>Global</span><b id="nx-global-unread" hidden>0</b></button>
                </nav>
                <div class="nx-sidebar-heading"><span>Friends</span><button id="nx-add-friend-toggle" title="Add friend">+</button></div>
                <form id="nx-add-friend" hidden>
                    <input id="nx-friend-code" maxlength="12" placeholder="NX-12AB34" aria-label="Friend code">
                    <button type="submit">Add</button>
                </form>
                <div id="nx-request-list" class="nx-request-list"><span class="nx-empty">No pending requests</span></div>
                <div id="nx-friend-list" class="nx-friend-list"><span class="nx-empty">Connecting friends…</span></div>
                <div id="nx-social-profile" class="nx-social-profile"><span class="nx-social-loading">Connecting Nexus ID…</span></div>
            </aside>
            <section id="nx-main">
            <div id="nx-header">
                <span class="nx-logo">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2"/>
                        <line x1="12" y1="22" x2="12" y2="15.5"/>
                        <polyline points="22 8.5 12 15.5 2 8.5"/>
                    </svg>
                    <span><strong id="nx-channel-title">Match chat</strong><small id="nx-channel-subtitle">Squad coordination</small></span>
                </span>
                <span class="nx-madeby" title="Made by ! System with ❤️">❤️</span>
                <div class="nx-header-actions">
                    <span id="nx-connection-dot" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#e74c3c;margin-right:4px;" title="Connection"></span>
                    <span id="nx-online-count" title="Usuarios en el chat" style="font-size:11px; margin-right:6px; color:#aaa;">0</span>
                    <button id="nx-mention-badge" style="display:none;">0</button>
                    <button id="nx-unread-badge" style="display:none;">0</button>
                    <button id="nx-dnd-btn" title="Do Not Disturb">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/></svg>
                    </button>
                    <button id="nx-dim-btn" title="Dim mode (${config.dimKeyChar})">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
                    </button>
                    <button id="nx-min-btn" title="Compact chat mode">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 3 12 9 6"/><polyline points="15 6 21 12 15 18"/></svg>
                    </button>
                    <button id="nx-cfg-btn" title="Settings">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="3"/>
                            <path d="M12 1v4m0 14v4M1 12h4m14 0h4M4.22 4.22l2.83 2.83m10.6 10.6l2.83 2.83M4.22 19.78l2.83-2.83m10.6-10.6l2.83-2.83"/>
                        </svg>
                    </button>
                </div>
            </div>
            <div id="nx-messages"></div>
            <button id="nx-scroll-bottom" class="hidden" title="Ir al final">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div id="nx-typing"></div>
            <div id="nx-input-box">
                <input type="text" id="nx-input" placeholder="Press ${config.activationKeyChar} to write..." maxlength="250">
                <button id="nx-send">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                </button>
            </div>
            <div id="nx-settings" style="display:none;"></div>
            <div id="nx-autocomplete" style="display:none;"></div>
            </section>
        `;
        connectionIndicator = document.getElementById('nx-connection-dot');

        const style = document.createElement('style');
        style.textContent = `
            :root, .theme-dark {
                --nx-bg: linear-gradient(145deg, rgba(18, 22, 16, .98), rgba(11, 14, 10, .97));
                --nx-sidebar-bg: rgba(25, 31, 20, .97);
                --nx-header-bg: rgba(22, 27, 18, .94);
                --nx-text: #f6f1df;
                --nx-text-secondary: #aab29a;
                --nx-own-msg-bg: linear-gradient(135deg, rgba(242, 201, 76, .16), rgba(102, 124, 67, .16));
                --nx-other-msg-bg: rgba(224, 230, 205, .055);
                --nx-own-border: #f2c94c;
                --nx-other-border: #718552;
                --nx-input-bg: rgba(8, 11, 7, .72);
                --nx-input-border: rgba(242, 201, 76, .24);
                --nx-discord: #7289da;
                --nx-glass-border: rgba(226, 219, 183, .14);
                --nx-accent: #f2c94c;
                --nx-accent-2: #8fa968;
                --nx-shadow: 0 30px 90px rgba(0,0,0,.62), 0 0 0 1px rgba(242,201,76,.05), inset 0 1px 0 rgba(255,255,255,.04);
            }
            .theme-light {
                --nx-bg: rgba(243, 238, 219, .98);
                --nx-sidebar-bg: rgba(222, 218, 193, .98);
                --nx-header-bg: rgba(248, 245, 232, .94);
                --nx-text: #20251b;
                --nx-text-secondary: #626b55;
                --nx-own-msg-bg: rgba(214, 176, 43, .18);
                --nx-other-msg-bg: rgba(81, 98, 57, .08);
                --nx-own-border: #b98e08;
                --nx-other-border: #657747;
                --nx-input-bg: rgba(255,255,255,.7);
                --nx-input-border: rgba(75,88,53,.28);
                --nx-discord: #5865f2;
                --nx-glass-border: rgba(44,53,34,.14);
                --nx-accent: #9a7400;
                --nx-accent-2: #657747;
                --nx-shadow: 0 20px 60px rgba(44,53,34,.22);
            }
            .theme-midnight {
                --nx-bg: rgba(5, 8, 5, .97);
                --nx-sidebar-bg: rgba(10, 15, 9, .98);
                --nx-header-bg: rgba(7, 11, 7, .96);
                --nx-text: #e8ecd9;
                --nx-text-secondary: #879078;
                --nx-own-msg-bg: rgba(218, 181, 52, .14);
                --nx-other-msg-bg: rgba(139, 164, 100, .07);
                --nx-own-border: #dab534;
                --nx-other-border: #52643a;
                --nx-input-bg: rgba(18, 26, 15, .75);
                --nx-input-border: rgba(218,181,52,.24);
                --nx-discord: #7289da;
                --nx-glass-border: rgba(149,169,116,.14);
                --nx-accent: #dab534;
                --nx-accent-2: #789251;
                --nx-shadow: 0 24px 70px rgba(0,0,0,.72);
            }

            #nx-chat {
                position: fixed; bottom: 20px; left: 20px;
                width: 760px; height: 520px; max-width: calc(100vw - 32px); max-height: calc(100vh - 32px);
                background: var(--nx-bg);
                color: var(--nx-text);
                font-family: 'Segoe UI', 'Inter', system-ui, sans-serif;
                font-size: 13px; border-radius: 18px;
                display: flex; flex-direction: row; z-index: 99990;
                box-shadow: var(--nx-shadow);
                border: 1px solid var(--nx-glass-border);
                backdrop-filter: blur(22px) saturate(145%);
                -webkit-backdrop-filter: blur(22px) saturate(145%);
                transition: opacity .3s ease, transform .3s ease, width .35s cubic-bezier(.22,1,.36,1), background .3s, color .3s;
                overflow: hidden;
                transform: scale(1);
                opacity: 1;
            }
            #nx-chat.nx-hidden { opacity: 0; transform: scale(0.9); pointer-events: none; }
            #nx-chat.idle  { opacity: 0.15; }
            #nx-chat.dim   { opacity: 0.05; }
            #nx-sidebar { width: 230px; flex: 0 0 230px; display: flex; flex-direction: column; background: var(--nx-sidebar-bg); border-right: 1px solid var(--nx-glass-border); overflow: hidden; transition: width .35s cubic-bezier(.22,1,.36,1), flex-basis .35s cubic-bezier(.22,1,.36,1), opacity .2s; }
            #nx-main { min-width: 0; flex: 1; display: flex; flex-direction: column; position: relative; }
            #nx-chat.social-collapsed { width: 390px !important; }
            #nx-chat.social-collapsed #nx-sidebar { width: 0; flex-basis: 0; opacity: 0; border: 0; pointer-events: none; }
            .nx-sidebar-brand { height: 55px; padding: 0 14px; display: flex; align-items: center; gap: 10px; border-bottom: 1px solid var(--nx-glass-border); }
            .nx-sidebar-brand > span, .nx-avatar { width: 30px; height: 30px; border-radius: 10px; display: inline-grid; place-items: center; background: var(--nx-accent); color: #1b1d13; font-weight: 900; }
            .nx-sidebar-brand strong { font-size: 15px; letter-spacing: .02em; }
            .nx-channel-list { padding: 10px 8px 6px; display: grid; gap: 4px; }
            .nx-channel, .nx-friend { width: 100%; border: 0; background: transparent; color: var(--nx-text-secondary); border-radius: 9px; padding: 8px 9px; display: flex; align-items: center; gap: 9px; text-align: left; cursor: pointer; }
            .nx-channel:hover, .nx-channel.active, .nx-friend:hover, .nx-friend.active { color: var(--nx-text); background: rgba(242,201,76,.1); }
            .nx-channel.active { box-shadow: inset 2px 0 var(--nx-accent); }
            .nx-channel b, .nx-friend b { margin-left: auto; min-width: 18px; height: 18px; border-radius: 9px; display: grid; place-items: center; background: #d75c3f; color: white; font-size: 10px; }
            .nx-sidebar-heading { padding: 12px 12px 6px; display: flex; justify-content: space-between; color: var(--nx-text-secondary); text-transform: uppercase; letter-spacing: .12em; font-size: 9px; font-weight: 800; }
            .nx-sidebar-heading button { border: 0; background: none; color: var(--nx-text-secondary); font-size: 18px; cursor: pointer; line-height: .7; }
            #nx-add-friend { display: flex; gap: 5px; padding: 0 8px 8px; }
            #nx-add-friend[hidden] { display: none; }
            #nx-add-friend input { min-width: 0; flex: 1; border: 1px solid var(--nx-input-border); border-radius: 7px; padding: 7px; color: var(--nx-text); background: var(--nx-input-bg); text-transform: uppercase; }
            #nx-add-friend button { border: 0; border-radius: 7px; padding: 0 9px; background: var(--nx-accent); color: #191b12; font-weight: 800; cursor: pointer; }
            .nx-request-list, .nx-friend-list { padding: 0 8px; display: grid; gap: 4px; }
            .nx-request-list { max-height: 92px; overflow: auto; }
            .nx-friend-list { flex: 1; overflow: auto; align-content: start; }
            .nx-request { display: flex; align-items: center; gap: 4px; padding: 6px 8px; border-radius: 8px; background: rgba(255,255,255,.04); }
            .nx-request span { flex: 1; overflow: hidden; text-overflow: ellipsis; }
            .nx-request button { width: 24px; height: 24px; border: 0; border-radius: 7px; background: rgba(242,201,76,.13); color: var(--nx-text); cursor: pointer; }
            .nx-presence { width: 8px; height: 8px; border-radius: 50%; background: #596052; box-shadow: 0 0 0 3px var(--nx-sidebar-bg); }
            .nx-presence.online { background: #8fc46a; }
            .nx-empty, .nx-social-loading { color: var(--nx-text-secondary); font-size: 10px; padding: 7px; }
            .nx-social-profile { min-height: 58px; padding: 9px 10px; display: flex; align-items: center; gap: 9px; background: rgba(0,0,0,.16); border-top: 1px solid var(--nx-glass-border); }
            .nx-social-profile > span:last-child { min-width: 0; display: grid; gap: 2px; }
            .nx-social-profile strong { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            #nx-copy-code { border: 0; background: none; color: var(--nx-text-secondary); font-size: 9px; padding: 0; text-align: left; cursor: pointer; }
            #nx-header {
                background: var(--nx-header-bg);
                padding: 10px 12px; display: flex; align-items: center; gap: 8px;
                border-bottom: 1px solid var(--nx-glass-border); flex-shrink: 0;
            }
            .nx-logo  { font-weight: 750; font-size: 14px; letter-spacing: .02em; color: var(--nx-text); margin-right: auto; display: flex; align-items: center; gap: 9px; }
            .nx-logo > span { display: grid; gap: 1px; }
            .nx-logo small { color: var(--nx-text-secondary); font-size: 9px; font-weight: 500; }
            .nx-logo svg { color: var(--nx-accent); filter: drop-shadow(0 0 8px rgba(242,201,76,.32)); }
            .nx-madeby { font-size: 14px; cursor: default; }
            .nx-header-actions { display: flex; gap: 4px; align-items: center; }
            .nx-header-actions button {
                background: none; border: none; color: #888; font-size: 14px; cursor: pointer;
                padding: 2px 4px; line-height: 1; transition: color 0.2s; display: flex; align-items: center;
            }
            .nx-header-actions button { border-radius: 7px; }
            .nx-header-actions button:hover { color: #fff; background: rgba(255,255,255,.08); }
            #nx-mention-badge, #nx-unread-badge {
                background: #ff4444; color: white; border-radius: 10px;
                font-size: 10px; padding: 2px 6px; font-weight: bold;
            }
            #nx-unread-badge { background: #4caf50; }
            #nx-dnd-btn.active { color: #ff4444; }
            #nx-dim-btn.active { color: #f39c12; }
            #nx-messages {
                flex: 1; overflow-y: auto; padding: 12px 10px; position: relative;
                scrollbar-width: thin; scrollbar-color: #444 transparent;
                word-break: break-word; overflow-wrap: anywhere;
            }
            #nx-messages::-webkit-scrollbar { width: 5px; }
            #nx-messages::-webkit-scrollbar-thumb { background: #444; border-radius: 4px; }
            #nx-scroll-bottom {
                position: absolute; bottom: 50px; right: 12px;
                width: 32px; height: 32px;
                background: var(--nx-bg); border: 1px solid var(--nx-glass-border);
                border-radius: 50%; color: var(--nx-text);
                font-size: 18px; cursor: pointer; z-index: 10;
                display: flex; align-items: center; justify-content: center;
                backdrop-filter: blur(8px); transition: opacity 0.3s, transform 0.3s;
                box-shadow: 0 2px 8px rgba(0,0,0,0.4);
            }
            #nx-scroll-bottom.hidden { opacity: 0; transform: scale(0.8); pointer-events: none; }
            #nx-typing { padding: 4px 8px; font-size: 11px; color: #4caf50; font-style: italic; min-height: 18px; }
            .typing-dots { display: inline-flex; align-items: center; }
            .dots-anim span { animation: dotPulse 1.4s infinite; opacity: 0; }
            .dots-anim span:nth-child(1) { animation-delay: 0s; }
            .dots-anim span:nth-child(2) { animation-delay: 0.2s; }
            .dots-anim span:nth-child(3) { animation-delay: 0.4s; }
            @keyframes dotPulse { 0%,20% { opacity: 0; } 50% { opacity: 1; } 100% { opacity: 0; } }
            .system-msg   { color: var(--nx-text-secondary); font-style: normal; font-size: 10.5px; letter-spacing: .015em; margin: 5px 3px; }
            .discord-reminder { background: rgba(114,137,218,0.15); border-radius: 4px; padding: 4px 8px; margin-bottom: 6px; }
            .discord-link { color: var(--nx-discord); cursor: pointer; text-decoration: underline; }
            .user-msg     { margin-bottom: 8px; line-height: 1.45; position: relative; padding: 8px 10px; border-radius: 12px; animation: slideUp 0.3s ease-out; box-shadow: inset 0 1px 0 rgba(255,255,255,.035); }
            @keyframes slideUp { 0% { opacity: 0; transform: translateY(10px); } 100% { opacity: 1; transform: translateY(0); } }
            .own-msg      { text-align: right; background: var(--nx-own-msg-bg); border-right: 2px solid var(--nx-own-border); margin-left: 26px; }
            .other-msg    { text-align: left; background: var(--nx-other-msg-bg); border-left: 2px solid var(--nx-other-border); margin-right: 26px; }
            .user-msg strong { font-weight: 600; cursor: pointer; }
            .user-msg strong:hover { text-decoration: underline; }
            .mention      { color: #f2c94c; font-weight: 750; text-shadow: 0 0 12px rgba(242,201,76,.3); }
            .private-msg  { color: #ffc86b; font-style: normal; }
            .error-msg    { color: #ff6666; font-size: 12px; margin: 4px 0; }
            .you-label    { font-size: 10px; opacity: 0.5; margin-left: 4px; }
            .blocked-hidden { display: none !important; }
            .blocked-placeholder { color: #555; font-size: 11px; font-style: italic; margin-bottom: 4px; display: flex; align-items: center; justify-content: space-between; }
            .unblock-btn { background: #b71c1c; border: none; color: white; font-size: 10px; padding: 2px 6px; border-radius: 4px; cursor: pointer; margin-left: 8px; }
            .unblock-btn:hover { background: #8b0000; }
            .reactions-bar { display: inline-flex; gap: 2px; margin-left: 6px; opacity: 0; transition: opacity 0.2s; vertical-align: middle; }
            .user-msg:hover .reactions-bar { opacity: 1; }
            .reaction-btn, .block-btn { background: none; border: none; color: #999; font-size: 13px; cursor: pointer; padding: 1px 3px; border-radius: 3px; display: flex; align-items: center; }
            .reaction-btn:hover, .block-btn:hover { background: #333; color: #fff; }
            .reactions { display: inline; }
            .reaction { display: inline-block; margin-left: 3px; font-size: 12px; background: rgba(255,255,255,0.1); padding: 1px 4px; border-radius: 4px; }
            .poll-container { background: rgba(255,255,255,0.05); border: 1px solid var(--nx-glass-border); border-radius: 14px; padding: 10px; margin-bottom: 8px; }
            .poll-question { font-weight: bold; margin-bottom: 6px; display: flex; align-items: center; gap: 4px; }
            .poll-option { display: block; width: 100%; text-align: left; background: rgba(255,255,255,0.065); border: 1px solid var(--nx-glass-border); color: var(--nx-text); padding: 7px 9px; margin-bottom: 5px; border-radius: 8px; cursor: pointer; }
            .poll-option:hover { background: rgba(255,255,255,0.15); }
            .pinned-msg { background: linear-gradient(90deg, rgba(242,201,76,.11), rgba(113,133,82,.1)); padding: 8px 10px; margin-bottom: 8px; border: 1px solid var(--nx-glass-border); font-style: normal; border-radius: 10px; display: flex; align-items: center; gap: 7px; }
            .kill-leader {
                position: relative;
                background-image: url('${FIRE_GIF_URL}');
                background-size: cover;
                background-blend-mode: overlay;
                background-color: rgba(0, 0, 0, 0.4);
                animation: firePulse 1.5s ease-in-out infinite;
                border: 2px solid gold;
                box-shadow: 0 0 30px rgba(255, 215, 0, 0.6);
                text-shadow: 0 0 10px gold, 0 0 20px darkorange;
                font-weight: 900;
                font-size: 1.1em;
                padding: 10px 14px;
                border-radius: 12px;
                color: #fff;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                overflow: hidden;
                z-index: 1;
            }
            .kill-leader .fire-gif { width: 28px; height: 28px; object-fit: contain; z-index: 2; }
            .kill-leader .kill-leader-text { z-index: 2; position: relative; display: flex; align-items: center; gap: 6px; }
            @keyframes firePulse {
                0% { box-shadow: 0 0 30px rgba(255, 215, 0, 0.6); }
                50% { box-shadow: 0 0 50px rgba(255, 215, 0, 1), 0 0 80px rgba(255, 69, 0, 0.6); }
                100% { box-shadow: 0 0 30px rgba(255, 215, 0, 0.6); }
            }
            .kill-leader-msg {
                background-image: url('${FIRE_GIF_URL}');
                background-size: cover;
                background-blend-mode: overlay;
                background-color: rgba(0, 0, 0, 0.4);
                border: 1px solid gold !important;
                box-shadow: 0 0 20px rgba(255, 215, 0, 0.5) !important;
                text-shadow: 0 0 5px gold, 0 0 10px darkorange;
                color: #fff !important;
            }
            .kills-badge {
                display: inline-block;
                background: rgba(0,0,0,0.4);
                border-radius: 10px;
                padding: 1px 6px;
                font-size: 0.9em;
                margin-right: 4px;
                color: #ffaa00;
            }
            .time-separator { text-align: center; font-size: 10px; color: #777; margin: 8px 0; }
            #nx-input-box { display: flex; padding: 9px; background: rgba(2,5,14,0.46); border-top: 1px solid var(--nx-glass-border); gap: 7px; }
            #nx-input { flex: 1; min-width: 0; background: var(--nx-input-bg); border: 1px solid var(--nx-input-border); color: var(--nx-text); padding: 9px 10px; outline: none; font-size: 13px; border-radius: 11px; transition: border-color .2s, box-shadow .2s, background .2s; }
            #nx-input:focus { border-color: rgba(62,231,255,.62); box-shadow: 0 0 0 3px rgba(62,231,255,.08); }
            #nx-send { background: linear-gradient(135deg, #f2c94c, #c9a52e); border: none; color: #171a10; font-weight: 800; padding: 8px 13px; cursor: pointer; font-size: 13px; border-radius: 11px; transition: transform .2s, box-shadow .2s; display: flex; align-items: center; }
            #nx-send:hover    { transform: translateY(-1px); box-shadow: 0 8px 20px rgba(242,201,76,.24); }
            #nx-send:disabled { opacity: 0.5; cursor: not-allowed; }
            .social-msg p { margin: 4px 0 0; color: var(--nx-text); }
            .nx-message-meta { display: flex; align-items: baseline; gap: 8px; }
            .nx-message-meta time { color: var(--nx-text-secondary); font-size: 9px; }
            #nx-toggle {
                position: fixed; bottom: 20px; left: 20px;
                width: 38px; height: 38px;
                background: linear-gradient(145deg, rgba(13,24,50,.96), rgba(27,12,50,.94)); border: 1px solid var(--nx-glass-border);
                border-radius: 13px; color: var(--nx-accent);
                display: flex; align-items: center; justify-content: center;
                font-size: 20px; cursor: pointer; z-index: 99989;
                backdrop-filter: blur(10px);
                box-shadow: 0 12px 32px rgba(0,0,0,.46), 0 0 20px rgba(62,231,255,.09);
                transition: background 0.2s;
            }
            #nx-toggle:hover { background: rgba(255,255,255,0.1); }
            #nx-toggle .toggle-connection-dot {
                position: absolute; top: -3px; right: -3px;
                width: 10px; height: 10px; border-radius: 50%;
                background: #e74c3c; border: 1px solid rgba(0,0,0,0.5);
            }
            #nx-toggle .badge {
                position: absolute; top: -5px; left: -5px;
                background: #4caf50; color: white; border-radius: 10px;
                font-size: 10px; padding: 1px 4px; font-weight: bold;
            }
            #nx-settings {
                position: absolute; top: 45px; right: 12px; width: 380px;
                max-width: calc(100% - 24px); max-height: calc(100% - 62px); overflow-y: auto;
                background: linear-gradient(155deg, rgba(27,33,22,.99), rgba(11,14,10,.99));
                backdrop-filter: blur(18px); border: 1px solid rgba(242,201,76,.24); padding: 0;
                color: var(--nx-text); font-size: 12px; box-shadow: 0 24px 70px rgba(0,0,0,.72);
                z-index: 100001; border-radius: 18px;
            }
            .nx-settings-head { position:sticky; top:0; z-index:2; display:flex; align-items:center; justify-content:space-between; padding:15px 16px; background:rgba(20,25,16,.97); border-bottom:1px solid var(--nx-glass-border); }
            .nx-settings-head strong { font-size:15px; letter-spacing:.01em; }
            .nx-settings-head span { display:block; margin-top:2px; color:var(--nx-text-secondary); font-size:10px; }
            #nx-settings-close { width:30px; height:30px; padding:0 !important; border-radius:9px !important; font-size:18px !important; }
            .nx-settings-body { padding:12px; display:grid; gap:10px; }
            .nx-settings-section { padding:12px; border:1px solid var(--nx-glass-border); border-radius:14px; background:rgba(255,255,255,.025); }
            .nx-settings-section h4 { margin:0 0 10px; color:var(--nx-accent); font-size:10px; text-transform:uppercase; letter-spacing:.13em; }
            .nx-settings-grid { display:grid; grid-template-columns:1fr 1fr; gap:9px; }
            #nx-settings label { display:block; margin:0; font-weight:650; font-size:10px; color:var(--nx-text-secondary); }
            #nx-settings input, #nx-settings select { width:100%; margin-top:5px; background:rgba(5,8,4,.72); border:1px solid rgba(226,219,183,.18); color:var(--nx-text); padding:8px 9px; font-size:11px; border-radius:9px; box-sizing:border-box; outline:none; }
            #nx-settings input:focus, #nx-settings select:focus { border-color:rgba(242,201,76,.62); box-shadow:0 0 0 3px rgba(242,201,76,.08); }
            .nx-account-card { display:flex; align-items:center; justify-content:space-between; gap:10px; }
            .nx-account-id { font:700 12px ui-monospace,SFMono-Regular,Consolas,monospace; color:var(--nx-text); }
            .nx-account-hint, .nx-settings-note { color:var(--nx-text-secondary); font-size:10px; line-height:1.45; }
            .nx-recovery-row { display:flex; gap:7px; margin-top:9px; }
            .nx-recovery-row input { margin-top:0 !important; }
            .nx-settings-toggle { display:flex !important; align-items:center; justify-content:space-between; padding:8px 0; color:var(--nx-text) !important; }
            .nx-settings-toggle input { width:16px !important; height:16px; margin:0 !important; accent-color:#f2c94c; }
            #nx-settings input[type="range"] {
                -webkit-appearance: none;
                appearance: none;
                width: 100%;
                height: 8px;
                background: linear-gradient(to right, #718552, #f2c94c);
                border-radius: 4px;
                outline: none;
                padding: 0;
                margin: 8px 0;
            }
            #nx-settings input[type="range"]::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                width: 18px;
                height: 18px;
                border-radius: 50%;
                background: white;
                border: 2px solid #f2c94c;
                cursor: pointer;
                box-shadow: 0 0 6px rgba(0,0,0,0.5);
            }
            #nx-settings input[type="range"]::-moz-range-thumb {
                width: 18px;
                height: 18px;
                border-radius: 50%;
                background: white;
                border: 2px solid #f2c94c;
                cursor: pointer;
            }
            #nx-settings button { margin:0; background:linear-gradient(135deg,#f2c94c,#c6a332); border:none; color:#171a10; font-weight:800; padding:8px 10px; cursor:pointer; font-size:11px; border-radius:9px; }
            #nx-settings button:hover { filter:brightness(1.08); transform:translateY(-1px); }
            #nx-settings .nx-secondary-btn { background:rgba(255,255,255,.075); color:var(--nx-text); border:1px solid var(--nx-glass-border); }
            #nx-settings small { color:var(--nx-text-secondary); display:block; margin-top:8px; }
            #nx-autocomplete {
                position: absolute; bottom: 40px; left: 8px; right: 8px;
                background: #2a2a2a; border: 1px solid #555;
                max-height: 100px; overflow-y: auto; z-index: 100002;
                border-radius: 4px; display: none;
            }
            #nx-autocomplete div { padding: 4px 8px; cursor: pointer; color: #e0e0e0; }
            #nx-autocomplete div:hover { background: #444; }
            @media (max-width: 680px) {
                #nx-chat { left: 8px !important; right: 8px !important; bottom: 8px !important; width: calc(100vw - 16px) !important; height: min(560px, calc(100vh - 16px)) !important; }
                #nx-sidebar { width: 190px; flex-basis: 190px; }
                #nx-chat.social-collapsed { width: calc(100vw - 16px) !important; }
                .nx-madeby, #nx-online-count { display: none !important; }
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(chatContainer);

        messageArea = document.getElementById('nx-messages');
        inputField   = document.getElementById('nx-input');
        sendBtn      = document.getElementById('nx-send');
        settingsPanel = document.getElementById('nx-settings');
        scrollToBottomBtn = document.getElementById('nx-scroll-bottom');
        toggleIcon = document.createElement('div');
        toggleIcon.id = 'nx-toggle';
        toggleIcon.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg><span class="toggle-connection-dot"></span>`;
        document.body.appendChild(toggleIcon);

        messageArea.addEventListener('scroll', () => {
            userScrolled = !isAtBottom();
            updateScrollButton();
        });
        scrollToBottomBtn.addEventListener('click', () => { userScrolled = false; scrollToBottom(true); });

        document.getElementById('nx-dnd-btn').addEventListener('click', toggleDnd);
        document.getElementById('nx-dim-btn').addEventListener('click', toggleDim);
        document.getElementById('nx-min-btn').addEventListener('click', toggleMinimize);
        document.getElementById('nx-cfg-btn').addEventListener('click', () => { settingsPanel.style.display = settingsPanel.style.display === 'block' ? 'none' : 'block'; });
        document.querySelectorAll('.nx-channel').forEach((button) => button.addEventListener('click', () => setActiveChannel(button.dataset.channel)));
        document.getElementById('nx-add-friend-toggle').addEventListener('click', () => {
            const form = document.getElementById('nx-add-friend');
            form.hidden = !form.hidden;
            if (!form.hidden) document.getElementById('nx-friend-code').focus();
        });
        document.getElementById('nx-add-friend').addEventListener('submit', (event) => {
            event.preventDefault();
            const field = document.getElementById('nx-friend-code');
            const code = field.value.trim().toUpperCase();
            if (!/^NX-[0-9A-F]{6}$/.test(code)) { showError('Use a Nexus ID like NX-12AB34'); return; }
            chatSocket?.emit('friend-request', code);
            field.value = '';
        });
        document.getElementById('nx-sidebar').addEventListener('click', (event) => {
            const friendButton = event.target.closest('.nx-friend');
            if (friendButton) {
                const friend = socialFriends.find((item) => item.id === friendButton.dataset.friendId);
                if (friend) setActiveChannel('direct', friend);
                return;
            }
            const response = event.target.closest('.nx-request button');
            if (response) {
                const request = response.closest('.nx-request');
                chatSocket?.emit('friend-response', { requestId: request.dataset.requestId, accept: response.dataset.action === 'accept' });
                return;
            }
            if (event.target.closest('#nx-copy-code') && socialProfile) {
                navigator.clipboard?.writeText(socialProfile.friendCode);
                event.target.closest('#nx-copy-code').textContent = 'Copied';
                setTimeout(renderSocialSidebar, 1200);
            }
        });
        document.getElementById('nx-mention-badge').addEventListener('click', () => { mentionCount = 0; updateBadges(); scrollToBottom(false); });
        document.getElementById('nx-unread-badge').addEventListener('click', () => { unreadCount = 0; updateBadges(); scrollToBottom(false); });
        sendBtn.addEventListener('click', sendMessage);
        inputField.addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); sendMessage(); } });
        inputField.addEventListener('input', () => {
            if (!chatSocket || !chatSocket.connected) return;
            if (activeChannel !== 'game') { onInputChange(); return; }
            if (inputField.value.length > 0) {
                if (!typingTimeout) chatSocket.emit('typing-start');
                clearTimeout(typingTimeout);
                typingTimeout = setTimeout(() => { if (chatSocket && chatSocket.connected) chatSocket.emit('typing-stop'); typingTimeout = null; }, 3000);
            } else if (typingTimeout) { clearTimeout(typingTimeout); typingTimeout = null; if (chatSocket && chatSocket.connected) chatSocket.emit('typing-stop'); }
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
                return;
            }

            const reactionBtn = target.closest('.reaction-btn');
            if (reactionBtn) {
                const msgDiv = reactionBtn.closest('.user-msg');
                if (msgDiv && chatSocket && chatSocket.connected) {
                    const msgId = msgDiv.getAttribute('data-msgid');
                    const emoji = reactionBtn.getAttribute('data-emoji');
                    chatSocket.emit('add-reaction', { messageId: msgId, emoji: emoji });
                }
                return;
            }

            const blockBtn = target.closest('.block-btn');
            if (blockBtn) {
                const msgDiv = blockBtn.closest('.user-msg');
                if (msgDiv) {
                    const author = msgDiv.getAttribute('data-author');
                    if (!author || author === username) return;
                    toggleBlockUser(author);
                }
                return;
            }

            const unblockBtn = target.closest('.unblock-btn');
            if (unblockBtn) {
                const placeholder = unblockBtn.closest('.blocked-placeholder');
                const author = placeholder.getAttribute('data-author');
                if (author) toggleBlockUser(author);
                return;
            }
        });

        messageArea.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const strong = e.target.closest('strong');
            if (strong) { const author = strong.textContent; const msgCount = messageHistory.filter(m => m.author === author).length; const online = window.__nexusOnlineUsers?.includes(author); alert(`${author} | Online: ${online ? 'Yes' : 'No'} | Messages: ${msgCount}`); }
        });

        openChat();
        buildSettingsPanel();
        applyTheme(config.theme);
        applyConfig();
        startDiscordReminder();
        if (config.dndMode) document.getElementById('nx-dnd-btn').classList.add('active');
        updateConnectionIndicator(false);
        loadHistory();
        renderActiveChannel();
        // El interceptor del WebSocket ya está funcionando
        connectToChat();
        waitForKillLeaderElements();
        checkForUpdate();
    }

    function toggleBlockUser(author) {
        if (blockedUsers.includes(author)) {
            blockedUsers = blockedUsers.filter(a => a !== author);
            localStorage.setItem('nexus_blocked', JSON.stringify(blockedUsers));
            document.querySelectorAll(`.user-msg[data-author="${CSS.escape(author)}"]`).forEach(el => {
                if (el.classList.contains('blocked-real')) el.classList.remove('blocked-hidden');
                const btn = el.querySelector('.block-btn'); if (btn) { btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>'; btn.title = 'Block user'; }
            });
            document.querySelectorAll(`.blocked-placeholder[data-author="${CSS.escape(author)}"]`).forEach(el => el.remove());
            addSystemMessage(`✅ Unblocked ${author}`);
        } else {
            blockedUsers.push(author);
            localStorage.setItem('nexus_blocked', JSON.stringify(blockedUsers));
            document.querySelectorAll(`.user-msg[data-author="${CSS.escape(author)}"]`).forEach(el => {
                el.classList.add('blocked-hidden'); el.classList.add('blocked-real');
                const btn = el.querySelector('.block-btn'); if (btn) { btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>'; btn.title = 'Unblock user'; }
            });
            addSystemMessage(`🚫 Blocked ${author}`);
        }
    }

    function toggleDnd() {
        config.dndMode = !config.dndMode;
        const btn = document.getElementById('nx-dnd-btn');
        btn.classList.toggle('active', config.dndMode);
        btn.innerHTML = config.dndMode
            ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
            : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/></svg>';
        saveConfig();
    }

    function toggleDim() { isDim = !isDim; applyDim(isDim); }
    function applyDim(state) {
        if (state) { chatContainer.classList.add('dim'); chatContainer.classList.remove('idle'); isIdle = false; }
        else { chatContainer.classList.remove('dim'); if (!isInputFocused && !isHovering) startIdleTimer(); }
        const btn = document.getElementById('nx-dim-btn');
        if (btn) {
            btn.classList.toggle('active', isDim);
            btn.innerHTML = isDim
                ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>'
                : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>';
        }
    }

    function toggleMinimize() {
        isMinimized = !isMinimized;
        chatContainer.classList.toggle('social-collapsed', isMinimized);
        const button = document.getElementById('nx-min-btn');
        if (button) button.title = isMinimized ? 'Show friends and channels' : 'Compact chat mode';
    }
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

    function addMessage(author, text, isBlocked=false, isMention=false, isPrivate=false, msgAuthorColor='#b0b0b0', messageId, skipSave = false, authorKills = 0) {
        const msgId = messageId || (Date.now() + '-' + Math.random().toString(36).substring(2,9));
        const msgObj = { author, text, isBlocked, isMention, isPrivate, msgAuthorColor, msgId };
        if (!skipSave) { messageHistory.push(msgObj); saveHistory(); }
        if (isBlocked) {
            const placeholder = document.createElement('div');
            placeholder.className = 'blocked-placeholder';
            placeholder.setAttribute('data-author', author);
            placeholder.innerHTML = `🚫 Blocked user sent a message <button class="unblock-btn">Unblock</button>`;
            messageArea.appendChild(placeholder); scrollToBottom(); return;
        }
        const now = Date.now();
        if (lastMessageTime && now - lastMessageTime > 300000) {
            const mins = Math.floor((now - lastMessageTime) / 60000);
            const sep = document.createElement('div'); sep.className = 'time-separator'; sep.textContent = `${mins} min ago`;
            messageArea.appendChild(sep);
        }
        lastMessageTime = now;
        const own = (author === username);
        const effectiveColor = sanitizeColor(msgAuthorColor || authorColor);
        const div = document.createElement('div');
        div.className = 'user-msg ' + (own ? 'own-msg' : 'other-msg') + (isPrivate ? ' private-msg' : '');
        div.setAttribute('data-msgid', msgId); div.setAttribute('data-author', author); div.classList.add('blocked-real');

        if (author === killLeaderName) {
            div.classList.add('kill-leader-msg');
        }

        const avatar = document.createElement('span');
        avatar.style.cssText = 'display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:4px;vertical-align:middle;';
        avatar.style.backgroundColor = effectiveColor;

        let kills = 0;
        if (own) {
            kills = getPlayerKills();
        } else {
            kills = authorKills || 0;
        }

        let contentHTML = '';
        if (isPrivate) {
            contentHTML = `<span class="private-msg">→ <span class="kills-badge">(${kills}💀)</span> <strong style="color:${effectiveColor}">${escapeHtml(author)}:</strong> ${escapeHtml(text)}</span>`;
        } else {
            const mentionClass = isMention ? ' class="mention"' : '';
            contentHTML = `<span class="kills-badge">(${kills}💀)</span> <strong style="color:${effectiveColor}">${escapeHtml(author)}:</strong> <span${mentionClass}>${escapeHtml(text)}</span>`;
        }
        if (own) { contentHTML += '<span class="you-label">(you)</span>'; }
        div.appendChild(avatar);
        const contentSpan = document.createElement('span'); contentSpan.innerHTML = contentHTML; div.appendChild(contentSpan);

        const bar = document.createElement('span'); bar.className = 'reactions-bar';
        bar.innerHTML = `
            <button class="reaction-btn" data-emoji="👍" title="Like"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/></svg></button>
            <button class="reaction-btn" data-emoji="😂" title="Laugh"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg></button>
            <button class="reaction-btn" data-emoji="😮" title="Wow"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/><circle cx="12" cy="15" r="1"/></svg></button>
            <button class="reaction-btn" data-emoji="❤️" title="Love"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg></button>
            <button class="reaction-btn" data-emoji="🔥" title="Fire"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z"/></svg></button>
            ${own ? '' : `<button class="block-btn" title="${blockedUsers.includes(author) ? 'Unblock' : 'Block'} user">${blockedUsers.includes(author) ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>' : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>'}</button>`}
        `;
        div.appendChild(bar);
        const reactionsSpan = document.createElement('span'); reactionsSpan.className = 'reactions'; div.appendChild(reactionsSpan);
        if (!own && blockedUsers.includes(author)) div.classList.add('blocked-hidden');
        messageArea.appendChild(div); scrollToBottom();
    }

    function addSystemMessage(text) {
        messageHistory.push({ system: true, text }); saveHistory();
        if (activeChannel !== 'game') return;
        const div = document.createElement('div'); div.className = 'system-msg'; div.textContent = text;
        messageArea.appendChild(div); scrollToBottom();
    }

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

    function openChat() {
        chatContainer.classList.remove('nx-hidden'); chatContainer.style.display = 'flex';
        isChatOpen = true; unreadCount = 0; updateBadges(); clearIdle();
        toggleIcon.style.display = 'none'; startIdleTimer(); playSound('open'); scrollToBottom(false);
    }
    function closeChat() {
        chatContainer.classList.add('nx-hidden');
        setTimeout(() => { if (!isChatOpen) chatContainer.style.display = 'none'; }, 300);
        isChatOpen = false; toggleIcon.style.display = 'flex'; clearIdle(); playSound('close');
    }

    function buildSettingsPanel() {
        const safeName = String(username || '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
        settingsPanel.innerHTML = `
            <div class="nx-settings-head"><div><strong>Nexus settings</strong><span>Identity, appearance and performance</span></div><button id="nx-settings-close" class="nx-secondary-btn" aria-label="Close">&times;</button></div>
            <div class="nx-settings-body">
                <section class="nx-settings-section"><h4>Your Nexus account</h4><div class="nx-account-card"><div><div id="cfg-nexus-id" class="nx-account-id">Connecting...</div><div class="nx-account-hint">This ID does not depend on your game name.</div></div><button id="cfg-copy-id" class="nx-secondary-btn">Copy ID</button></div><div class="nx-recovery-row"><input id="cfg-recovery-key" type="password" placeholder="Paste an NXR recovery key"><button id="cfg-import-key">Restore</button><button id="cfg-copy-key" class="nx-secondary-btn">Copy key</button></div><small>Keep the recovery key private. It restores the same Nexus ID on another browser or domain.</small></section>
                <section class="nx-settings-section"><h4>Profile and look</h4><div class="nx-settings-grid"><label>Name<input type="text" id="cfg-name" value="${safeName}" maxlength="15"></label><label>Your color<input type="color" id="cfg-authorcolor" value="${hslToHex(authorColor)}"></label><label>Theme<select id="cfg-theme"><option value="dark" ${config.theme==='dark'?'selected':''}>Survival</option><option value="light" ${config.theme==='light'?'selected':''}>Daylight</option><option value="midnight" ${config.theme==='midnight'?'selected':''}>Midnight</option></select></label><label>Window size<select id="cfg-size"><option value="pequeño" ${config.size==='pequeño'?'selected':''}>Compact</option><option value="mediano" ${config.size==='mediano'?'selected':''}>Medium</option><option value="grande" ${config.size==='grande'?'selected':''}>Large</option></select></label><label>Position<select id="cfg-pos"><option value="top-left" ${config.position==='top-left'?'selected':''}>Top left</option><option value="top-right" ${config.position==='top-right'?'selected':''}>Top right</option><option value="bottom-left" ${config.position==='bottom-left'?'selected':''}>Bottom left</option><option value="bottom-right" ${config.position==='bottom-right'?'selected':''}>Bottom right</option></select></label><label>Volume<input type="range" id="cfg-volume" min="0" max="1" step="0.05" value="${config.volume}"></label></div></section>
                <section class="nx-settings-section"><h4>Game performance</h4><label>Preset<select id="cfg-performance"><option value="native" ${config.performanceMode==='native'?'selected':''}>Native game settings</option><option value="balanced" ${config.performanceMode==='balanced'?'selected':''}>Balanced</option><option value="low-power" ${config.performanceMode==='low-power'?'selected':''}>Low power</option></select></label><small class="nx-settings-note">Uses real Survev/Resurviv settings: texture resolution, screen shake, interpolation and local rotation. Reload the game after changing it.</small></section>
                <section class="nx-settings-section"><h4>Controls and alerts</h4><div class="nx-settings-grid"><label>Chat key<button id="cfg-key" class="nx-secondary-btn">${config.activationKeyChar}</button></label><label>Dim key<button id="cfg-dim-key" class="nx-secondary-btn">${config.dimKeyChar}</button></label><label>Auto-hide (seconds)<input type="number" id="cfg-idle" value="${config.idleTimeout}" min="1" max="30"></label></div><label class="nx-settings-toggle">Discord reminders<input type="checkbox" id="cfg-discord-reminder" ${config.discordReminder?'checked':''}></label><label class="nx-settings-toggle">Do not disturb<input type="checkbox" id="cfg-dnd" ${config.dndMode?'checked':''}></label></section>
            </div>
        `;

        document.getElementById('nx-settings-close').addEventListener('click', () => { settingsPanel.style.display = 'none'; });
        document.getElementById('cfg-copy-id').addEventListener('click', async function() {
            if (!socialProfile || !socialProfile.friendCode) return;
            await navigator.clipboard.writeText(socialProfile.friendCode);
            this.textContent = 'Copied'; setTimeout(() => { this.textContent = 'Copy ID'; }, 1200);
        });
        document.getElementById('cfg-copy-key').addEventListener('click', async function() {
            await navigator.clipboard.writeText(socialToken);
            this.textContent = 'Copied'; setTimeout(() => { this.textContent = 'Copy key'; }, 1200);
        });
        document.getElementById('cfg-import-key').addEventListener('click', function() {
            const input = document.getElementById('cfg-recovery-key');
            const nextToken = input.value.trim();
            if (!isSocialToken(nextToken)) { input.setCustomValidity('Invalid Nexus recovery key'); input.reportValidity(); return; }
            input.setCustomValidity(''); socialToken = nextToken; persistSocialToken(socialToken); input.value = '';
            if (chatSocket) chatSocket.disconnect();
            chatSocket = null; connectToChat(); addSystemMessage('Nexus account restored. Reconnecting...');
        });
        document.getElementById('cfg-name').addEventListener('change', function() {
            const newName = this.value.trim().substring(0,15);
            if (!newName || newName === username) { this.value = username; return; }
            if (chatSocket && chatSocket.connected) chatSocket.emit('change-username', newName);
            else { username = newName; sessionStorage.setItem('nexus_username', username); authorColor = getUserColor(username); localStorage.setItem('nexus_authorColor', authorColor); }
        });
        document.getElementById('cfg-authorcolor').addEventListener('input', function() { authorColor = this.value; localStorage.setItem('nexus_authorColor', authorColor); });
        document.getElementById('cfg-size').addEventListener('change', function() { config.size = this.value; applySize(); saveConfig(); });
        document.getElementById('cfg-pos').addEventListener('change', function() { config.position = this.value; applyPosition(); saveConfig(); });
        document.getElementById('cfg-volume').addEventListener('input', function() { config.volume = parseFloat(this.value); saveConfig(); });
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
        document.getElementById('cfg-dnd').addEventListener('change', function() { config.dndMode = this.checked; const btn = document.getElementById('nx-dnd-btn'); btn.classList.toggle('active', config.dndMode); btn.innerHTML = config.dndMode ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/><line x1="1" y1="1" x2="23" y2="23"/></svg>' : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/></svg>'; saveConfig(); });
        document.getElementById('cfg-theme').addEventListener('change', function() { config.theme = this.value; applyTheme(config.theme); saveConfig(); });
        document.getElementById('cfg-performance').addEventListener('change', function() { config.performanceMode = this.value; applyPerformanceMode(config.performanceMode); saveConfig(); addSystemMessage('Performance preset saved. Reload the game to apply every change.'); });
        refreshSettingsIdentity();
    }

    function refreshSettingsIdentity() {
        const id = document.getElementById('cfg-nexus-id');
        if (id) id.textContent = socialProfile && socialProfile.friendCode ? socialProfile.friendCode : 'Connecting...';
    }

    function applyTheme(theme) { chatContainer.classList.remove('theme-dark', 'theme-light', 'theme-midnight'); chatContainer.classList.add('theme-' + theme); }
    function applySize() { const sizes = { pequeño: {w:620,h:440}, mediano: {w:760,h:520}, grande: {w:920,h:620} }; const size = sizes[config.size] || sizes.mediano; chatContainer.style.width = size.w+'px'; chatContainer.style.height = size.h+'px'; }
    function applyPosition() {
        const posMap = { 'top-left':{top:'20px',left:'20px',bottom:'auto',right:'auto'}, 'top-right':{top:'20px',right:'20px',bottom:'auto',left:'auto'}, 'bottom-left':{bottom:'20px',left:'20px',top:'auto',right:'auto'}, 'bottom-right':{bottom:'20px',right:'20px',top:'auto',left:'auto'} };
        Object.assign(chatContainer.style, posMap[config.position]); Object.assign(toggleIcon.style, posMap[config.position]);
    }
    function applyConfig() {
        if (config.bgColor && config.bgColor !== DEFAULT_CONFIG.bgColor) chatContainer.style.background = config.bgColor;
        else chatContainer.style.removeProperty('background');
        chatContainer.style.color = config.textColor;
        applySize();
        applyPosition();
    }
    function saveConfig() { localStorage.setItem('nexusChatConfig', JSON.stringify(config)); }

    function startDiscordReminder() {
        stopDiscordReminder();
        if (!config.discordReminder) return;
        discordReminderInterval = setInterval(() => {
            if (chatSocket && chatSocket.connected && gameId) {
                const div = document.createElement('div'); div.className = 'system-msg discord-reminder';
                div.innerHTML = `🎮 Join our Discord! <span class="discord-link">Click here</span>`;
                messageArea.appendChild(div); scrollToBottom();
                div.querySelector('.discord-link').addEventListener('click', () => { if (confirm('Go to Discord?')) window.open(DISCORD_INVITE, '_blank'); });
            }
        }, 120000);
    }
    function stopDiscordReminder() { if (discordReminderInterval) { clearInterval(discordReminderInterval); discordReminderInterval = null; } }

    function globalKeyHandler(e) {
        if (isInputFocused) return;
        if (config.dndMode && e.key === config.activationKeyChar && !isChatOpen) return;
        if (e.key === config.activationKeyChar) { e.preventDefault(); e.stopPropagation(); if (!isChatOpen) openChat(); if (isDim) { isDim = false; applyDim(false); } inputField.focus(); }
        if (e.key === config.dimKeyChar) { e.preventDefault(); e.stopPropagation(); toggleDim(); }
    }
    document.addEventListener('keydown', globalKeyHandler, true);

    function createOnboardingOverlay() {
        if (onboardingOverlay) return;
        onboardingOverlay = document.createElement('div'); onboardingOverlay.id = 'nx-onboarding';
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
                <a href="${DISCORD_INVITE}" target="_blank" rel="noopener noreferrer" class="nx-discord-btn">Join Discord</a>
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
            username = name; sessionStorage.setItem('nexus_username', username); authorColor = getUserColor(username); localStorage.setItem('nexus_authorColor', authorColor);
            onboardingOverlay.style.transition = 'opacity 0.5s ease'; onboardingOverlay.style.opacity = '0';
            setTimeout(() => { onboardingOverlay.remove(); onboardingOverlay = null; startChat(); }, 500);
        }
        submitBtn.addEventListener('click', submitName);
        nameInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') submitName(); });

        const canvas = document.getElementById('nx-particles');
        const ctx = canvas.getContext('2d');
        canvas.width = window.innerWidth; canvas.height = window.innerHeight;
        const particles = [];
        for (let i = 0; i < 150; i++) particles.push({ x:Math.random()*canvas.width, y:Math.random()*canvas.height, radius:Math.random()*3+1, speedX:Math.random()*0.8-0.4, speedY:Math.random()*0.8-0.4, alpha:Math.random()*0.6+0.3 });
        function animateParticles() {
            if (!onboardingOverlay) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = '#b71c1c';
            for (const p of particles) {
                p.x += p.speedX; p.y += p.speedY;
                if (p.x < 0 || p.x > canvas.width) p.speedX *= -1;
                if (p.y < 0 || p.y > canvas.height) p.speedY *= -1;
                ctx.globalAlpha = p.alpha; ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI*2); ctx.fill();
            }
            requestAnimationFrame(animateParticles);
        }
        animateParticles();
    }

    async function checkForUpdate() {
        try {
            const res = await fetch(`${SERVER_URL}/version.json?_=${Date.now()}`);
            if (!res.ok) return;
            const data = await res.json();
            if (compareVersions(data.version, EXT_VERSION) > 0) {
                showUpdateOverlay(data);
            }
        } catch(e) {}
    }

    function showUpdateOverlay(data) {
        if (document.getElementById('nx-update-overlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'nx-update-overlay';
        overlay.innerHTML = `
            <div id="nx-update-box">
                <button id="nx-update-close" title="Cerrar">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
                <img src="${LOGO_URL}" alt="Nexus Chat" class="nx-logo-img">
                <h1 class="nx-title-neon">¡Actualización disponible!</h1>
                <p class="nx-version">Versión ${escapeHtml(String(data.version || ''))}</p>
                <div class="nx-changelog">
                    <h3>✨ Novedades:</h3>
                    <ul>${(data.changes || []).map(c => `<li>${escapeHtml(String(c))}</li>`).join('')}</ul>
                    <h3>🐛 Bugs solucionados:</h3>
                    <ul>${(data.bugs || []).map(b => `<li>${escapeHtml(String(b))}</li>`).join('')}</ul>
                </div>
                <button id="nx-update-download">⬇ Descargar actualización</button>
            </div>
        `;

        const style = document.createElement('style');
        style.textContent = `
            #nx-update-overlay {
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0, 0, 0, 0.85);
                backdrop-filter: blur(12px);
                -webkit-backdrop-filter: blur(12px);
                z-index: 100000;
                display: flex; align-items: center; justify-content: center;
                animation: fadeIn 0.4s ease;
            }
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            #nx-update-box {
                background: var(--nx-bg, rgba(18, 18, 24, 0.95));
                border: 1px solid var(--nx-glass-border, rgba(255,255,255,0.1));
                border-radius: 20px;
                padding: 40px;
                text-align: center;
                max-width: 450px;
                width: 90%;
                box-shadow: 0 20px 60px rgba(0,0,0,0.8), 0 0 40px rgba(183,28,28,0.3);
                position: relative;
                color: var(--nx-text, #f0f0f0);
                font-family: 'Segoe UI', 'Inter', system-ui, sans-serif;
            }
            #nx-update-close {
                position: absolute; top: 12px; right: 12px;
                background: none; border: none; color: #888; cursor: pointer;
                transition: color 0.2s;
            }
            #nx-update-close:hover { color: #fff; }
            .nx-logo-img { width: 80px; height: 80px; margin-bottom: 20px; filter: drop-shadow(0 0 10px #b71c1c); }
            .nx-title-neon {
                font-size: 28px; font-weight: 800;
                color: #ff4444;
                text-shadow: 0 0 10px #ff4444, 0 0 20px #b71c1c;
                margin: 0 0 10px;
            }
            .nx-version { font-size: 18px; color: #ccc; margin: 0 0 20px; }
            .nx-changelog { text-align: left; margin: 20px 0; font-size: 14px; }
            .nx-changelog h3 { color: #ff4444; margin-top: 15px; }
            .nx-changelog ul { padding-left: 20px; }
            .nx-changelog li { margin-bottom: 6px; }
            #nx-update-download {
                background: linear-gradient(135deg, #b71c1c, #ff4444);
                border: none; color: white; font-weight: bold;
                padding: 14px 28px; border-radius: 10px;
                cursor: pointer; font-size: 16px;
                box-shadow: 0 0 20px rgba(183,28,28,0.5);
                transition: transform 0.2s, box-shadow 0.2s;
                margin-top: 10px;
            }
            #nx-update-download:hover {
                transform: scale(1.05);
                box-shadow: 0 0 30px rgba(255,68,68,0.7);
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(overlay);

        document.getElementById('nx-update-download').onclick = () => window.open(DOWNLOAD_URL, '_blank');
        document.getElementById('nx-update-close').onclick = () => overlay.remove();
    }

    function compareVersions(v1, v2) {
        const a = v1.split('.').map(Number); const b = v2.split('.').map(Number);
        for (let i = 0; i < Math.max(a.length, b.length); i++) { const x = a[i] || 0, y = b[i] || 0; if (x > y) return 1; if (x < y) return -1; }
        return 0;
    }

    function startChat() { createChatUI(); }

    function safeInit() {
        try {
            const savedName = getPlayerName();
            if (savedName) { username = savedName; sessionStorage.setItem('nexus_username', username); authorColor = getUserColor(username); localStorage.setItem('nexus_authorColor', authorColor); }
            if (document.body) {
                console.log('[NexusChat] Body ready, starting chat');
                if (!username) { createOnboardingOverlay(); } else { startChat(); }
            } else {
                document.addEventListener('DOMContentLoaded', () => { if (!username) createOnboardingOverlay(); else startChat(); });
                setTimeout(() => { if (document.body && !document.getElementById('nx-chat')) { if (!username) createOnboardingOverlay(); else startChat(); } }, 1000);
            }
        } catch(e) { console.error('[NexusChat]', e); }
    }
    safeInit();
})();
