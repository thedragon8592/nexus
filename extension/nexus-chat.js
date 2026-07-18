(function() {
    'use strict';
    if (window.__nexusChatLoaded) return;
    window.__nexusChatLoaded = true;
    window.__nexusIntegratedOptimizer = true;

    const EXT_VERSION = '3.5.0';
    const WEBSITE_URL = 'https://wnexuschat.netlify.app';
    const GREASYFORK_URL = 'https://greasyfork.org/es/scripts/584741-nexus-chat';
    const bootstrap = window.__NEXUS_BOOTSTRAP__ || {};
    const hasExtensionRuntime = typeof chrome !== 'undefined' && chrome.runtime && Boolean(chrome.runtime.id);
    const CLIENT_DISTRIBUTION = bootstrap.clientType === 'userscript' || (!hasExtensionRuntime && Boolean(bootstrap.serverUrl))
        ? 'userscript'
        : (hasExtensionRuntime ? 'extension' : 'web');
    const INSTALLED_VERSION = bootstrap.installedVersion
        || (CLIENT_DISTRIBUTION === 'userscript' ? '3.4.0' : EXT_VERSION);
    const SERVER_URL    = window.__NEXUS_BOOTSTRAP__ && window.__NEXUS_BOOTSTRAP__.serverUrl
        ? window.__NEXUS_BOOTSTRAP__.serverUrl
        : 'https://nexus-chat-free.onrender.com';
    const LOGO_URL      = 'https://i.ibb.co/FkXVWJnC/Chat-GPT-Image-26-jun-2026-19-06-21.png';
    const DISCORD_INVITE = 'https://discord.gg/rDJhfCTDqR';

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
        const bootstrapLoader = document.getElementById('nx-bootstrap-loader');
        if (bootstrapLoader) bootstrapLoader.remove();
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
        let completed = false;
        const finish = () => {
            if (completed) return;
            completed = true;
            overlay.style.setProperty('--nx-load', '100%');
            overlay.querySelector('small').textContent = 'Ready';
            setTimeout(() => overlay.classList.add('nx-loader-done'), 180);
            setTimeout(() => overlay.remove(), 900);
        };
        const domReady = () => overlay.style.setProperty('--nx-load', '58%');
        const loaded = () => {
            overlay.style.setProperty('--nx-load', '92%');
            requestAnimationFrame(() => requestAnimationFrame(finish));
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', domReady, { once: true });
        else domReady();
        if (document.readyState === 'complete') loaded();
        else window.addEventListener('load', loaded, { once: true });
        setTimeout(finish, 8000);
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
    function containsMention(text, name) {
        if (!text || !name) return false;
        const namePattern = String(name).trim().split(/\s+/).map(escapeRegex).join('\\s+');
        return new RegExp(`(^|\\s)@${namePattern}(?=\\s|$|[.,!?;:])`, 'i').test(text);
    }
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
        size: 'medium',
        position: 'bottom-left',
        activationKeyChar: '5',
        dimKeyChar: 'b',
        idleTimeout: 8,
        discordReminder: false,
        dndMode: false,
        theme: 'dark',
        emojiEnabled: true,
        glassmorphism: true,
        volume: 0.5,
        performanceMode: 'balanced'
    };
    let config = Object.assign({}, DEFAULT_CONFIG, readStoredJson('nexusChatConfig', {}));
    config.size = ({ 'peque\u00f1o': 'compact', mediano: 'medium', grande: 'large' })[config.size] || config.size;
    const AVAILABLE_THEMES = ['dark', 'light', 'midnight', 'ocean', 'ember', 'orchid'];
    if (!AVAILABLE_THEMES.includes(config.theme)) config.theme = DEFAULT_CONFIG.theme;

    const PERFORMANCE_PROFILES = Object.freeze({
        native: {
            label: 'Native', game: null, renderedMessages: 100, particles: 80,
            details: 'Keeps the game and Nexus visual effects unchanged.'
        },
        balanced: {
            label: 'Balanced', renderedMessages: 40, particles: 10,
            game: { highResTex: false, screenShake: false, interpolation: true, localRotation: true },
            details: 'Low-resolution textures, no shake, smooth interpolation, client-side rotation, and lighter Nexus effects.'
        },
        'low-power': {
            label: 'Low power', renderedMessages: 20, particles: 0,
            game: { highResTex: false, screenShake: false, interpolation: false, localRotation: true },
            details: 'Minimum Nexus effects and message workload while keeping client-side rotation enabled.'
        }
    });

    function selectedPerformanceProfile(mode = config.performanceMode) {
        return PERFORMANCE_PROFILES[mode] || PERFORMANCE_PROFILES.balanced;
    }

    function persistGamePerformance(profile) {
        if (!profile.game) return;
        const gameConfig = readStoredJson('surviv_config', {});
        Object.assign(gameConfig, profile.game);
        localStorage.setItem('surviv_config', JSON.stringify(gameConfig));
    }

    function applyRuntimePerformance(mode) {
        const safeMode = PERFORMANCE_PROFILES[mode] ? mode : 'balanced';
        document.documentElement.dataset.nexusPerformance = safeMode;
    }

    function pruneRuntimeState(profile) {
        if (messageHistory.length > 100) messageHistory = messageHistory.slice(-100);
        if (globalMessageHistory.length > 100) globalMessageHistory = globalMessageHistory.slice(-100);
        directMessageHistory.forEach((messages, friendId) => {
            if (messages.length > 100) directMessageHistory.set(friendId, messages.slice(-100));
        });
        while (profileCache.size > 250) {
            const removableId = Array.from(profileCache.keys()).find((id) => id !== socialProfile?.id && !socialFriends.some((friend) => friend.id === id));
            if (!removableId) break;
            profileCache.delete(removableId);
        }
        if (profile.renderedMessages < 100 && messageArea && !isDim) renderActiveChannel();
    }

    function refreshPerformanceDetails() {
        const profile = selectedPerformanceProfile();
        const setText = (id, value) => { const element = document.getElementById(id); if (element) element.textContent = value; };
        setText('cfg-performance-state', `${profile.label} active`);
        setText('cfg-performance-summary', profile.details);
        setText('cfg-performance-textures', profile.game ? (profile.game.highResTex ? 'High' : 'Low') : 'Game setting');
        setText('cfg-performance-shake', profile.game ? (profile.game.screenShake ? 'On' : 'Off') : 'Game setting');
        setText('cfg-performance-interpolation', profile.game ? (profile.game.interpolation ? 'On' : 'Off') : 'Game setting');
        setText('cfg-performance-rotation', profile.game ? (profile.game.localRotation ? 'On' : 'Off') : 'Game setting');
        setText('cfg-performance-messages', String(profile.renderedMessages));
    }

    function showOptimizationProgress(profile, tasks) {
        const previous = document.getElementById('nx-optimization-loader');
        if (previous) previous.remove();
        const overlay = document.createElement('div');
        overlay.id = 'nx-optimization-loader';
        overlay.innerHTML = `<div class="nx-opt-loader-card"><span class="nx-opt-loader-mark">N</span><strong>Applying ${profile.label}</strong><p id="nx-opt-loader-status">Preparing optimizer…</p><div class="nx-opt-loader-track"><i></i></div><small id="nx-opt-loader-count">0 / ${tasks.length}</small></div>`;
        document.documentElement.appendChild(overlay);
        return new Promise((resolve) => {
            let index = 0;
            const advance = () => {
                const task = tasks[index];
                if (!task) {
                    overlay.classList.add('done');
                    setTimeout(() => { overlay.remove(); resolve(); }, 320);
                    return;
                }
                document.getElementById('nx-opt-loader-status').textContent = task.label;
                task.run();
                index += 1;
                overlay.style.setProperty('--nx-opt-progress', `${Math.round((index / tasks.length) * 100)}%`);
                document.getElementById('nx-opt-loader-count').textContent = `${index} / ${tasks.length}`;
                setTimeout(advance, 140);
            };
            requestAnimationFrame(advance);
        });
    }

    function applyPerformanceMode(mode, { showProgress = false } = {}) {
        const safeMode = PERFORMANCE_PROFILES[mode] ? mode : 'balanced';
        const profile = PERFORMANCE_PROFILES[safeMode];
        config.performanceMode = safeMode;
        const tasks = [
            { label: 'Saving verified game settings', run: () => persistGamePerformance(profile) },
            { label: 'Reducing Nexus rendering effects', run: () => applyRuntimePerformance(safeMode) },
            { label: 'Trimming inactive chat work', run: () => pruneRuntimeState(profile) },
            { label: 'Refreshing optimizer diagnostics', run: () => {
                localStorage.setItem('nexus_optimizer_mode', safeMode);
                window.dispatchEvent(new CustomEvent('NEXUS_PERFORMANCE_APPLIED', { detail: { mode: safeMode } }));
                refreshPerformanceDetails();
            } }
        ];
        if (!showProgress || !document.body) {
            tasks.forEach((task) => task.run());
            return Promise.resolve();
        }
        return showOptimizationProgress(profile, tasks);
    }

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
    let socialServerVersion = null;
    let socialFriends = [];
    let socialRequests = [];
    let globalUsers = [];
    let globalMessageHistory = [];
    let globalNotices = [];
    const channelPolls = { game: new Map(), global: new Map() };
    const pinnedMessages = { game: null, global: null };
    const directMessageHistory = new Map();
    const socialUnread = new Map();
    const directConversationMeta = new Map();
    const directReadAt = new Map();
    const profileCache = new Map();
    let profilePopover = null;
    let profilePopoverTimer = null;
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
    let lastConnectionError = '';
    let scrollToBottomBtn = null;
    let scrollAnimationId = null;
    let historySaveTimer = null;
    let historyDirty = false;
    let sharedAudioContext = null;
    let sharedAudioFilter = null;
    let lastSoundAt = 0;
    let batchRenderDepth = 0;
    let pendingBatchScroll = false;
    let mentionPatternCache = { key: '', pattern: null };

    applyPerformanceMode(config.performanceMode);

    function playSound(type) {
        if (config.dndMode) return;
        const now = performance.now();
        if (type !== 'mention' && now - lastSoundAt < 80) return;
        lastSoundAt = now;
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) return;
            if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
                sharedAudioContext = new AudioContextClass();
                sharedAudioFilter = null;
            }
            if (sharedAudioContext.state === 'suspended') sharedAudioContext.resume().catch(() => {});
            const patterns = {
                open: [[420, 0, .08, 'triangle', .7], [680, .045, .11, 'sine', .85], [980, .09, .13, 'sine', .6]],
                close: [[880, 0, .07, 'sine', .65], [560, .045, .1, 'triangle', .7], [320, .09, .12, 'sine', .55]],
                send: [[760, 0, .05, 'triangle', .6], [1240, .035, .09, 'sine', .72]],
                receive: [[520, 0, .07, 'sine', .52], [760, .055, .1, 'triangle', .48]],
                mention: [[620, 0, .11, 'triangle', .85], [940, .09, .14, 'sine', 1], [1320, .19, .2, 'sine', .78]],
                navigate: [[440, 0, .045, 'triangle', .42], [660, .03, .065, 'sine', .5]],
                panel: [[340, 0, .07, 'sine', .5], [720, .045, .1, 'triangle', .58]],
                toggle: [[560, 0, .055, 'square', .3], [840, .035, .075, 'sine', .5]],
                success: [[520, 0, .07, 'triangle', .58], [780, .06, .09, 'sine', .66], [1120, .12, .13, 'sine', .55]],
                friend: [[480, 0, .1, 'triangle', .65], [720, .075, .12, 'sine', .75], [960, .15, .16, 'sine', .6]],
                reaction: [[980, 0, .04, 'sine', .38], [1180, .025, .065, 'triangle', .34]],
                error: [[260, 0, .1, 'sawtooth', .34], [190, .075, .15, 'triangle', .42]],
                default: [[700, 0, .08, 'sine', .5]]
            };
            const volume = Math.max(0, Math.min(1, Number(config.volume ?? .5))) * .095;
            if (volume <= 0) return;
            const startAt = sharedAudioContext.currentTime;
            if (!sharedAudioFilter) {
                sharedAudioFilter = sharedAudioContext.createBiquadFilter();
                sharedAudioFilter.type = 'lowpass';
                sharedAudioFilter.frequency.value = 4200;
                sharedAudioFilter.Q.value = .7;
                sharedAudioFilter.connect(sharedAudioContext.destination);
            }
            (patterns[type] || patterns.default).forEach(([frequency, delay, duration, waveform = 'sine', level = 1]) => {
                const oscillator = sharedAudioContext.createOscillator();
                const gain = sharedAudioContext.createGain();
                oscillator.type = waveform;
                oscillator.frequency.value = frequency;
                gain.gain.setValueAtTime(volume * level, startAt + delay);
                gain.gain.exponentialRampToValueAtTime(.0001, startAt + delay + duration);
                oscillator.connect(gain);
                gain.connect(sharedAudioFilter);
                oscillator.start(startAt + delay);
                oscillator.stop(startAt + delay + duration);
            });
        } catch(e) {}
    }

    function flushHistory() {
        historySaveTimer = null;
        if (!historyDirty) return;
        historyDirty = false;
        const toSave = messageHistory.filter((message) => !message.isPrivate).slice(-100);
        try { localStorage.setItem('nexus_chat_history', JSON.stringify(toSave)); } catch(e) {}
    }
    function saveHistory() {
        historyDirty = true;
        if (historySaveTimer) return;
        historySaveTimer = setTimeout(flushHistory, 350);
    }
    function loadHistory() {
        try {
            const saved = localStorage.getItem('nexus_chat_history');
            if (saved) {
                const arr = JSON.parse(saved);
                messageHistory = Array.isArray(arr) ? arr.slice(-100) : [];
                messageHistory.forEach(msg => {
                    if (msg.system) {
                        const div = document.createElement('div');
                        div.className = 'system-msg';
                        div.textContent = msg.text;
                        if (messageArea) messageArea.appendChild(div);
                    } else {
                        addMessage(msg.author, msg.text, msg.isBlocked, msg.isMention, msg.isPrivate, msg.msgAuthorColor, msg.msgId, true, msg.authorKills || 0, msg.profile, msg.reactions);
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
            if (messageArea) renderActiveChannel();
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

        const combined = window.location.hash + window.location.search;
        const match = combined.match(/gameId=([a-zA-Z0-9._:-]+)/i);
        if (match) gameId = match[1];
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
                lastConnectionError = '';
                updateConnectionIndicator(true);
                chatSocket.emit('join', { gameId: roomId, username, socialToken });
                addSystemMessage('✅ Connected');
                playSound('open');
                updateToggleConnectionDot(true);
                refreshSettingsDiagnostics();
                const connectedSocket = chatSocket;
                setTimeout(() => {
                    if (chatSocket === connectedSocket && chatSocket.connected && !socialProfile) {
                        lastConnectionError = 'The server responded but Nexus Social Protocol 3 is unavailable. Update the deployment.';
                        refreshSettingsDiagnostics();
                    }
                }, 5000);
            });
            chatSocket.on('disconnect', () => {
                typingUsers.forEach((entry) => { if (entry?.timer) clearTimeout(entry.timer); });
                typingUsers.clear();
                updateTypingIndicator();
                updateConnectionIndicator(false);
                addSystemMessage('❌ Disconnected');
                playSound('close');
                stopDiscordReminder();
                updateToggleConnectionDot(false);
                refreshSettingsDiagnostics();
            });
            chatSocket.on('connect_error', (error) => {
                lastConnectionError = error && error.message ? error.message : 'Connection failed';
                refreshSettingsDiagnostics();
            });
            chatSocket.on('protocol-error', (payload) => {
                lastConnectionError = payload && payload.message ? payload.message : 'Protocol error';
                showError(lastConnectionError);
                refreshSettingsDiagnostics();
            });
            chatSocket.on('chat-history', (history) => {
                messageHistory = [];
                if (activeChannel === 'game' && messageArea) messageArea.innerHTML = '';
                history.forEach(msg => {
                    cacheProfile(msg.profile);
                    const isBlocked = isUserBlocked(msg.authorId, msg.author) && msg.author !== username;
                    if (activeChannel === 'game') addMessage(msg.author, msg.text, isBlocked, false, !!msg.recipient, msg.authorColor, msg.messageId, false, msg.kills || 0, msg.profile, msg.reactions);
                    else messageHistory.push({ author: msg.author, authorId: msg.authorId, profile: msg.profile, reactions: msg.reactions, text: msg.text, isBlocked, isMention: false, isPrivate: !!msg.recipient, msgAuthorColor: msg.authorColor, msgId: msg.messageId });
                });
            });
            chatSocket.on('pinned-message', (text) => {
                pinnedMessages.game = text || null;
                if (activeChannel === 'game') renderChannelPin('game');
            });
            chatSocket.on('global-pinned-message', (text) => {
                pinnedMessages.global = text || null;
                if (activeChannel === 'global') renderChannelPin('global');
            });
            chatSocket.on('chat-message', (payload) => {
                const author = payload.author;
                cacheProfile(payload.profile);
                const isBlocked = isUserBlocked(payload.authorId, author) && author !== username;
                const mentioned = !isBlocked && (author !== username) && containsMention(payload.text, username);
                if (mentioned) {
                    playSound('mention');
                    totalMentionsThisGame++;
                    if (!isInputFocused || isDim || isIdle) mentionCount++;
                } else if (!isBlocked && author !== username) playSound('receive');
                if (!isChatOpen && !isBlocked && author !== username) unreadCount++;
                updateBadges();
                totalMessagesThisGame++;
                const authorKills = payload.kills || 0;
                if (activeChannel === 'game' && isChatOpen && !isDim) {
                    addMessage(author, payload.text, isBlocked, mentioned, !!payload.recipient, payload.authorColor, payload.messageId, false, authorKills, payload.profile, payload.reactions);
                } else {
                    messageHistory.push({ author, authorId: payload.authorId, profile: payload.profile, reactions: payload.reactions, text: payload.text, isBlocked, isMention: mentioned, isPrivate: !!payload.recipient, msgAuthorColor: payload.authorColor, msgId: payload.messageId, authorKills });
                    if (messageHistory.length > 100) messageHistory = messageHistory.slice(-100);
                    saveHistory();
                }
            });
            chatSocket.on('social-session', (session) => {
                socialServerVersion = session.serverVersion || null;
                if (session.protocolVersion !== 3) lastConnectionError = 'Incompatible social protocol version.';
                if (session.token) {
                    socialToken = session.token;
                    persistSocialToken(socialToken);
                }
                socialProfile = cacheProfile(session.profile);
                pinnedMessages.global = session.globalPinned || null;
                socialFriends = Array.isArray(session.friends) ? session.friends.map(cacheProfile) : [];
                syncConversationMetadata(socialFriends, true);
                socialRequests = Array.isArray(session.requests)
                    ? session.requests.map((request) => ({ ...request, from: cacheProfile(request.from) }))
                    : [];
                globalMessageHistory = Array.isArray(session.globalHistory)
                    ? session.globalHistory.map((message) => ({ ...message, profile: cacheProfile(message.profile) }))
                    : [];
                renderSocialSidebar();
                refreshSettingsIdentity();
                if (activeChannel !== 'game') renderActiveChannel();
            });
            chatSocket.on('social-update', (session) => {
                let channelChanged = false;
                socialProfile = session.profile ? cacheProfile(session.profile) : socialProfile;
                socialFriends = Array.isArray(session.friends) ? session.friends.map(cacheProfile) : socialFriends;
                syncConversationMetadata(socialFriends, false);
                socialRequests = Array.isArray(session.requests)
                    ? session.requests.map((request) => ({ ...request, from: cacheProfile(request.from) }))
                    : socialRequests;
                if (selectedFriend) {
                    const refreshedFriend = socialFriends.find((friend) => friend.id === selectedFriend.id);
                    if (refreshedFriend) selectedFriend = refreshedFriend;
                    else if (activeChannel === 'direct') {
                        activeChannel = 'global';
                        selectedFriend = null;
                        channelChanged = true;
                    }
                }
                renderSocialSidebar();
                if (channelChanged) renderActiveChannel();
                else if (activeChannel === 'direct') refreshDirectChannelHeader();
            });
            chatSocket.on('global-message', (message) => {
                cacheProfile(message.profile);
                if (!globalMessageHistory.some((item) => item.id === message.id)) globalMessageHistory.push(message);
                globalMessageHistory = globalMessageHistory.slice(-100);
                const mentioned = message.authorId !== socialProfile?.id
                    && containsMention(message.text, username);
                if (mentioned && !isUserBlocked(message.authorId, message.author)) playSound('mention');
                else if (message.authorId !== socialProfile?.id && !isUserBlocked(message.authorId, message.author)) playSound('receive');
                if (activeChannel === 'global' && isChatOpen && !isDim) renderSocialMessage(message, false);
                else if (message.authorId !== socialProfile?.id && !isUserBlocked(message.authorId, message.author)) incrementSocialUnread('global');
            });
            chatSocket.on('global-user-list', (users) => {
                globalUsers.forEach((user) => cacheProfile({ ...user, online: false }));
                globalUsers = Array.isArray(users) ? users : [];
                cacheProfiles(globalUsers);
                if (isInputFocused) onInputChange();
            });
            chatSocket.on('global-online-list', (users) => {
                const names = (users || []).map((user) => typeof user === 'string' ? user : user.username);
                addChannelNotice(`Global online: ${names.join(', ') || 'Nobody else is online.'}`, 'global');
            });
            chatSocket.on('direct-history', ({ friendId, messages, readAt }) => {
                const history = Array.isArray(messages) ? messages : [];
                directMessageHistory.set(friendId, history);
                const lastMessage = history[history.length - 1];
                if (lastMessage) updateDirectConversation(lastMessage);
                directReadAt.set(friendId, Math.max(Number(directReadAt.get(friendId) || 0), Number(readAt || lastMessage?.timestamp || 0)));
                socialUnread.delete(friendId);
                if (activeChannel === 'direct' && selectedFriend?.id === friendId) renderActiveChannel();
                else renderSocialSidebar();
            });
            chatSocket.on('direct-message', (message) => {
                const friendId = message.fromId === socialProfile?.id ? message.toId : message.fromId;
                const history = directMessageHistory.get(friendId) || [];
                if (!history.some((item) => item.id === message.id)) history.push(message);
                directMessageHistory.set(friendId, history.slice(-100));
                updateDirectConversation(message);
                if (message.fromId !== socialProfile?.id) playSound(containsMention(message.text, username) ? 'mention' : 'receive');
                if (activeChannel === 'direct' && selectedFriend?.id === friendId && isChatOpen && !isDim) {
                    renderSocialMessage(message, true);
                    directReadAt.set(friendId, Number(message.timestamp || Date.now()));
                    chatSocket.emit('direct-read', { friendId, readAt: Number(message.timestamp || Date.now()) });
                    socialUnread.delete(friendId);
                    renderSocialSidebar();
                }
                else if (message.fromId !== socialProfile?.id) incrementSocialUnread(friendId);
            });
            chatSocket.on('friend-request-received', ({ from }) => { playSound('friend'); addChannelNotice(`${from.username} sent you a friend request.`); });
            chatSocket.on('friend-request-sent', ({ to }) => addChannelNotice(`Friend request sent to ${to.username}.`));
            chatSocket.on('friend-removed', ({ friendId }) => {
                if (selectedFriend?.id === friendId) setActiveChannel('global');
                addChannelNotice('Friend removed.');
            });
            chatSocket.on('profile-updated', (profile) => {
                socialProfile = cacheProfile(profile);
                renderSocialSidebar();
                refreshSettingsIdentity();
                playSound('success');
                addChannelNotice('Profile saved.');
            });
            chatSocket.on('system-message', (text) => addSystemMessage(text));
            chatSocket.on('username-change-accepted', ({ newUsername }) => {
                username = newUsername;
                sessionStorage.setItem('nexus_username', username);
                authorColor = getUserColor(username);
                localStorage.setItem('nexus_authorColor', authorColor);
            });
            chatSocket.on('user-list', (users) => {
                window.__nexusOnlineUsers = (users || []).map((user) => typeof user === 'string' ? { username: user } : user);
                cacheProfiles(window.__nexusOnlineUsers);
                const onlineCount = document.getElementById('nx-online-count');
                if (onlineCount) onlineCount.textContent = users.length;
                if (isInputFocused) onInputChange();
            });
            chatSocket.on('online-list', (users) => addChannelNotice(`Match online: ${(users || []).map((user) => typeof user === 'string' ? user : user.username).join(', ') || 'Nobody else is online.'}`, 'game'));
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
                if (msgDiv) playSound('reaction');
            });
            chatSocket.on('global-reaction-update', ({ messageId, reactions }) => {
                const message = globalMessageHistory.find((item) => item.id === messageId);
                if (message) message.reactions = reactions || {};
                const msgDiv = messageArea?.querySelector(`.social-msg[data-msgid="${CSS.escape(messageId)}"]`);
                if (msgDiv) {
                    renderReactionCounts(msgDiv.querySelector('.reactions'), reactions || {});
                    playSound('reaction');
                }
            });
            chatSocket.on('user-typing', ({ username: typer, typing }) => {
                updateTypingUser('game', typer, typer, typing);
                updateTypingIndicator();
            });
            chatSocket.on('typing-update', (update) => {
                const key = update.channel === 'direct' ? `direct:${update.userId}` : `${update.channel}:${update.userId}`;
                updateTypingUser(update.channel, key, update.username, update.typing, update.userId);
                updateTypingIndicator();
            });
            chatSocket.on('poll-created', (poll) => storePoll('game', poll));
            chatSocket.on('poll-update', (poll) => updatePoll('game', poll));
            chatSocket.on('global-poll-created', (poll) => storePoll('global', poll));
            chatSocket.on('global-poll-update', (poll) => updatePoll('global', poll));
            chatSocket.on('global-poll-closed', ({ pollId }) => {
                channelPolls.global.delete(pollId);
                messageArea?.querySelector(`.poll-container[data-channel="global"][data-pollid="${CSS.escape(pollId)}"]`)?.remove();
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

    function updateConnectionIndicator(connected) {
        if (!connectionIndicator) return;
        connectionIndicator.style.backgroundColor = connected ? '#2ecc71' : '#e74c3c';
    }
    function updateToggleConnectionDot(connected) {
        const dot = toggleIcon?.querySelector('.toggle-connection-dot');
        if (dot) dot.style.backgroundColor = connected ? '#2ecc71' : '#e74c3c';
    }

    function updateTypingUser(channel, key, name, typing, userId = null) {
        const existing = typingUsers.get(key);
        if (existing?.timer) clearTimeout(existing.timer);
        if (!typing) {
            typingUsers.delete(key);
            return;
        }
        const timer = setTimeout(() => {
            typingUsers.delete(key);
            updateTypingIndicator();
        }, 4500);
        typingUsers.set(key, { channel, name, userId, timer });
    }

    function updateTypingIndicator() {
        const typingDiv = document.getElementById('nx-typing');
        if (!typingDiv) return;
        const names = Array.from(typingUsers.values())
            .filter((entry) => entry.channel === activeChannel
                && entry.name !== username
                && (activeChannel !== 'direct' || entry.userId === selectedFriend?.id))
            .map((entry) => entry.name);
        if (names.length > 0) {
            const safeNames = names.slice(0, 2).map(escapeHtml).join(', ');
            const verb = names.length === 1 ? 'is' : 'are';
            typingDiv.innerHTML = `<span class="typing-dots">${safeNames}${names.length > 2 ? ' and others' : ''} ${verb} typing<span class="dots-anim"><span>.</span><span>.</span><span>.</span></span></span>`;
        } else {
            typingDiv.innerHTML = '';
        }
    }

    function renderChannelPin(channel) {
        if (!messageArea || activeChannel !== channel) return;
        messageArea.querySelectorAll('.pinned-msg:not(.kill-leader)').forEach((element) => element.remove());
        const text = pinnedMessages[channel];
        if (!text) return;
        const pinDiv = document.createElement('div');
        pinDiv.className = 'pinned-msg';
        pinDiv.dataset.channel = channel;
        pinDiv.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 17l-6 6v-12l-6-6h24l-6 6v12l-6-6z"/></svg>`;
        const pinText = document.createElement('span');
        pinText.textContent = text;
        pinDiv.appendChild(pinText);
        messageArea.prepend(pinDiv);
    }

    function storePoll(channel, poll) {
        if (!poll || !poll.pollId) return;
        const isNew = !channelPolls[channel].has(poll.pollId);
        channelPolls[channel].set(poll.pollId, {
            pollId: poll.pollId,
            question: poll.question,
            options: Array.isArray(poll.options) ? poll.options : [],
        });
        if (isNew) playSound('panel');
        if (activeChannel === channel) renderPoll(poll.pollId, poll.question, poll.options, channel);
    }

    function updatePoll(channel, poll) {
        if (!poll || !poll.pollId) return;
        const current = channelPolls[channel].get(poll.pollId);
        if (current) current.options = Array.isArray(poll.options) ? poll.options : current.options;
        const pollDiv = activeChannel === channel
            ? messageArea?.querySelector(`.poll-container[data-channel="${channel}"][data-pollid="${CSS.escape(poll.pollId)}"]`)
            : null;
        if (!pollDiv) return;
        const buttons = pollDiv.querySelectorAll('.poll-option');
        buttons.forEach((button, index) => {
            if (poll.options[index]) button.textContent = `${poll.options[index].option} (${poll.options[index].votes})`;
        });
    }

    function renderPoll(pollId, question, options, channel = 'game') {
        if (activeChannel !== channel) return;
        const div = document.createElement('div');
        div.className = 'poll-container';
        div.setAttribute('data-pollid', pollId);
        div.setAttribute('data-channel', channel);
        div.innerHTML = `<div class="poll-question"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 20V10M12 20V4M6 20v-6"/></svg> ${escapeHtml(question)}</div>`;
        options.forEach((opt, idx) => {
            const btn = document.createElement('button');
            btn.className = 'poll-option';
            btn.textContent = `${opt.option} (${opt.votes})`;
            btn.addEventListener('click', () => {
                if (chatSocket && chatSocket.connected) {
                    chatSocket.emit(channel === 'global' ? 'global-poll-vote' : 'poll-vote', { pollId, optionIndex: idx });
                }
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
        playSound('error');
        const div = document.createElement('div');
        div.className = 'error-msg';
        div.textContent = '⚠️ ' + msg;
        messageArea.appendChild(div);
        scrollToBottom();
        setTimeout(() => div.remove(), 3000);
    }

    function appendChannelNotice(text) {
        if (!messageArea) return;
        const div = document.createElement('div');
        div.className = 'system-msg channel-notice';
        div.textContent = text;
        messageArea.appendChild(div);
        scrollToBottom();
    }

    function addChannelNotice(text, channel = activeChannel) {
        if (channel === 'game') {
            addSystemMessage(text);
            return;
        }
        if (channel === 'global') {
            globalNotices.push(text);
            globalNotices = globalNotices.slice(-20);
        }
        if (activeChannel === channel) appendChannelNotice(text);
    }

    function typingPayload(typing) {
        return {
            channel: activeChannel,
            friendId: activeChannel === 'direct' ? selectedFriend?.id : undefined,
            typing,
        };
    }

    function stopTyping() {
        if (typingTimeout) clearTimeout(typingTimeout);
        typingTimeout = null;
        if (chatSocket?.connected) chatSocket.emit('typing-update', typingPayload(false));
    }

    function syncConversationMetadata(friends, replaceUnread) {
        if (replaceUnread) {
            Array.from(socialUnread.keys()).forEach((key) => {
                if (key !== 'global') socialUnread.delete(key);
            });
        }
        (friends || []).forEach((friend) => {
            const incoming = friend?.conversation || {};
            const current = directConversationMeta.get(friend.id) || {};
            const merged = {
                unreadCount: Number(incoming.unreadCount || 0),
                lastMessageAt: Math.max(Number(current.lastMessageAt || 0), Number(incoming.lastMessageAt || 0)),
                lastMessageText: Number(incoming.lastMessageAt || 0) >= Number(current.lastMessageAt || 0)
                    ? String(incoming.lastMessageText || '')
                    : String(current.lastMessageText || ''),
                lastMessageFromId: Number(incoming.lastMessageAt || 0) >= Number(current.lastMessageAt || 0)
                    ? String(incoming.lastMessageFromId || '')
                    : String(current.lastMessageFromId || ''),
            };
            const locallyReadAt = Number(directReadAt.get(friend.id) || 0);
            if (merged.lastMessageAt <= locallyReadAt) merged.unreadCount = 0;
            directConversationMeta.set(friend.id, merged);
            friend.conversation = merged;
            if (replaceUnread) {
                if (merged.unreadCount > 0) socialUnread.set(friend.id, merged.unreadCount);
            } else if (merged.unreadCount > 0) {
                socialUnread.set(friend.id, Math.max(Number(socialUnread.get(friend.id) || 0), merged.unreadCount));
            }
        });
    }

    function updateDirectConversation(message) {
        if (!message || !socialProfile) return;
        const friendId = message.fromId === socialProfile.id ? message.toId : message.fromId;
        if (!friendId) return;
        const timestamp = Number(message.timestamp || Date.now());
        const current = directConversationMeta.get(friendId) || {};
        if (timestamp < Number(current.lastMessageAt || 0)) return;
        const next = {
            ...current,
            lastMessageAt: timestamp,
            lastMessageText: String(message.text || ''),
            lastMessageFromId: String(message.fromId || ''),
        };
        directConversationMeta.set(friendId, next);
        const friend = socialFriends.find((item) => item.id === friendId);
        if (friend) friend.conversation = next;
    }

    function refreshDirectChannelHeader() {
        if (activeChannel !== 'direct' || !selectedFriend) return;
        const title = document.getElementById('nx-channel-title');
        const subtitle = document.getElementById('nx-channel-subtitle');
        if (title) title.textContent = selectedFriend.username;
        if (subtitle) subtitle.textContent = selectedFriend.online ? 'Online now' : 'Offline · messages are saved';
    }

    function incrementSocialUnread(key) {
        socialUnread.set(key, (socialUnread.get(key) || 0) + 1);
        const conversation = directConversationMeta.get(key);
        if (conversation) conversation.unreadCount = socialUnread.get(key);
        renderSocialSidebar();
    }

    function cacheProfile(profile) {
        if (profile && profile.id) {
            const current = profileCache.get(profile.id);
            const currentVersion = Number(current?.updatedAt || current?.createdAt || 0);
            const incomingVersion = Number(profile.updatedAt || profile.createdAt || 0);
            if (current && currentVersion && incomingVersion && incomingVersion < currentVersion) return current;
            const merged = { ...(current || {}), ...profile };
            profileCache.set(profile.id, merged);
            if (profileCache.size > 250) {
                const removableId = Array.from(profileCache.keys()).find((id) => id !== socialProfile?.id && !socialFriends.some((friend) => friend.id === id));
                if (removableId) profileCache.delete(removableId);
            }
            return merged;
        }
        return profile;
    }

    function cacheProfiles(profiles) {
        (profiles || []).forEach(cacheProfile);
    }

    function isUserBlocked(profileOrId, fallbackName = '') {
        const id = typeof profileOrId === 'object' ? profileOrId?.id : profileOrId;
        const name = typeof profileOrId === 'object' ? profileOrId?.username : fallbackName;
        return (id && blockedUsers.includes(`id:${id}`)) || (name && blockedUsers.includes(name));
    }

    function toggleBlockedUser(profileOrId, fallbackName = '') {
        const id = typeof profileOrId === 'object' ? profileOrId?.id : profileOrId;
        const name = typeof profileOrId === 'object' ? profileOrId?.username : fallbackName;
        const key = id ? `id:${id}` : name;
        if (!key) return false;
        const blocked = isUserBlocked(id, name);
        blockedUsers = blocked
            ? blockedUsers.filter((item) => item !== key && item !== name)
            : [...blockedUsers.filter((item) => item !== name), key];
        localStorage.setItem('nexus_blocked', JSON.stringify(blockedUsers));
        return !blocked;
    }

    function avatarMarkup(profile, className = 'nx-avatar') {
        const name = profile?.username || 'Player';
        if (profile?.avatarUrl) {
            return `<span class="${className} has-image"><span class="nx-avatar-fallback">${escapeHtml(name.slice(0, 1).toUpperCase())}</span><img src="${escapeHtml(profile.avatarUrl)}" alt="${escapeHtml(name)} avatar" referrerpolicy="no-referrer"></span>`;
        }
        return `<span class="${className}">${escapeHtml(name.slice(0, 1).toUpperCase())}</span>`;
    }

    function renderRichText(element, text) {
        element.textContent = '';
        const value = String(text || '');
        const names = [
            username,
            ...Array.from(profileCache.values(), (profile) => profile?.username),
            ...(window.__nexusOnlineUsers || []).map((profile) => profile?.username),
            ...globalUsers.map((profile) => profile?.username),
            ...socialFriends.map((profile) => profile?.username),
        ].filter(Boolean);
        const uniqueNames = Array.from(new Set(names.map((name) => String(name).trim()).filter(Boolean)))
            .sort((first, second) => second.length - first.length);
        if (!uniqueNames.length) {
            element.textContent = value;
            return;
        }
        const cacheKey = uniqueNames.join('\u0000');
        if (mentionPatternCache.key !== cacheKey) {
            const alternatives = uniqueNames.map((name) => name.split(/\s+/).map(escapeRegex).join('\\s+')).join('|');
            mentionPatternCache = {
                key: cacheKey,
                pattern: new RegExp(`(^|\\s)(@(?:${alternatives}))(?=\\s|$|[.,!?;:])`, 'gi'),
            };
        }
        const pattern = mentionPatternCache.pattern;
        pattern.lastIndex = 0;
        let lastIndex = 0;
        let match;
        while ((match = pattern.exec(value))) {
            const mentionStart = match.index + match[1].length;
            element.appendChild(document.createTextNode(value.slice(lastIndex, mentionStart)));
            const mention = document.createElement('span');
            mention.className = `nx-inline-mention${containsMention(match[2], username) ? ' is-you' : ''}`;
            mention.textContent = match[2];
            element.appendChild(mention);
            lastIndex = pattern.lastIndex;
        }
        element.appendChild(document.createTextNode(value.slice(lastIndex)));
    }

    function hideProfilePopover(delay = 120) {
        if (profilePopoverTimer) clearTimeout(profilePopoverTimer);
        profilePopoverTimer = setTimeout(() => {
            if (profilePopover) profilePopover.hidden = true;
        }, delay);
    }

    function showProfilePopover(profileId, anchor) {
        const profile = profileCache.get(profileId);
        if (!profile || !anchor) return;
        if (profilePopoverTimer) clearTimeout(profilePopoverTimer);
        if (!profilePopover) {
            profilePopover = document.createElement('div');
            profilePopover.id = 'nx-profile-popover';
            profilePopover.addEventListener('mouseenter', () => {
                if (profilePopoverTimer) clearTimeout(profilePopoverTimer);
            });
            profilePopover.addEventListener('mouseleave', () => hideProfilePopover());
            profilePopover.addEventListener('click', (event) => {
                const addButton = event.target.closest('[data-profile-add]');
                if (addButton) {
                    const targetProfile = profileCache.get(addButton.dataset.profileAdd);
                    if (targetProfile?.friendCode) chatSocket?.emit('friend-request', targetProfile.friendCode);
                    hideProfilePopover(0);
                }
                const removeButton = event.target.closest('[data-profile-remove]');
                if (removeButton) {
                    const targetProfile = profileCache.get(removeButton.dataset.profileRemove);
                    if (targetProfile && confirm(`Remove ${targetProfile.username} from your friends?`)) chatSocket?.emit('remove-friend', targetProfile.id);
                    hideProfilePopover(0);
                }
            });
            document.body.appendChild(profilePopover);
        }
        const friend = socialFriends.find((item) => item.id === profile.id);
        const own = profile.id === socialProfile?.id;
        profilePopover.innerHTML = `${avatarMarkup(profile, 'nx-avatar nx-avatar-popover')}<div class="nx-popover-copy"><strong>${escapeHtml(profile.username)}</strong><span>${profile.online || friend?.online ? 'Online' : 'Offline'}</span><p>${escapeHtml(profile.bio || 'No bio yet.')}</p><small>${escapeHtml(profile.friendCode || '')}</small></div>${own ? '' : (friend ? `<button data-profile-remove="${escapeHtml(profile.id)}">Remove friend</button>` : (profile.friendCode ? `<button data-profile-add="${escapeHtml(profile.id)}">Add friend</button>` : ''))}`;
        const chatStyle = getComputedStyle(chatContainer);
        ['--nx-bg', '--nx-text', '--nx-text-secondary', '--nx-accent', '--nx-accent-2', '--nx-glass-border'].forEach((property) => {
            profilePopover.style.setProperty(property, chatStyle.getPropertyValue(property));
        });
        profilePopover.hidden = false;
        const rect = anchor.getBoundingClientRect();
        const width = 260;
        const left = Math.min(window.innerWidth - width - 12, Math.max(12, rect.right + 10));
        const top = Math.min(window.innerHeight - 190, Math.max(12, rect.top - 30));
        Object.assign(profilePopover.style, { left: `${left}px`, top: `${top}px` });
    }

    function setActiveChannel(channel, friend = null) {
        const changed = activeChannel !== channel || (channel === 'direct' && selectedFriend?.id !== friend?.id);
        stopTyping();
        activeChannel = channel;
        selectedFriend = friend;
        const key = channel === 'direct' ? friend?.id : channel;
        if (key) socialUnread.delete(key);
        if (channel === 'direct' && friend) {
            const conversation = directConversationMeta.get(friend.id);
            if (conversation) conversation.unreadCount = 0;
            if (chatSocket?.connected) chatSocket.emit('direct-history', friend.id);
        }
        renderSocialSidebar();
        renderActiveChannel();
        if (changed) playSound('navigate');
    }

    function preparePrivateMessage(name) {
        const recipient = String(name || '').replace(/:$/, '').trim();
        if (!recipient || recipient === username || activeChannel === 'direct') return false;
        const draft = inputField.value.replace(/^\([^)]+\)\s*/, '');
        inputField.value = `(${recipient}) ${draft}`;
        inputField.focus();
        onInputChange();
        return true;
    }

    function renderSocialSidebar() {
        const profile = document.getElementById('nx-social-profile');
        const friends = document.getElementById('nx-friend-list');
        const requests = document.getElementById('nx-request-list');
        if (!profile || !friends || !requests) return;
        if (socialProfile) socialProfile = cacheProfile(socialProfile);
        profile.innerHTML = socialProfile
            ? `${avatarMarkup(socialProfile)}<span><strong>${escapeHtml(socialProfile.username)}</strong><button id="nx-copy-code" title="Copy Nexus ID">${escapeHtml(socialProfile.friendCode)}</button></span>`
            : '<span class="nx-social-loading">Connecting Nexus ID…</span>';
        requests.innerHTML = socialRequests.length
            ? socialRequests.map((request) => `<div class="nx-request nx-profile-trigger" data-request-id="${request.id}" data-profile-id="${escapeHtml(request.from.id)}">${avatarMarkup(request.from, 'nx-avatar nx-avatar-small')}<span>${escapeHtml(request.from.username)}</span><button data-action="accept" title="Accept request">✓</button><button data-action="decline" title="Decline request">×</button></div>`).join('')
            : '<span class="nx-empty">No pending requests</span>';
        socialFriends.sort((first, second) => {
            const firstTime = Number(directConversationMeta.get(first.id)?.lastMessageAt || 0);
            const secondTime = Number(directConversationMeta.get(second.id)?.lastMessageAt || 0);
            return secondTime - firstTime || Number(Boolean(second.online)) - Number(Boolean(first.online)) || first.username.localeCompare(second.username);
        });
        friends.innerHTML = socialFriends.length
            ? socialFriends.map((friend) => `<div class="nx-friend-row nx-profile-trigger" data-profile-id="${escapeHtml(friend.id)}"><button class="nx-friend ${activeChannel === 'direct' && selectedFriend?.id === friend.id ? 'active' : ''}" data-friend-id="${escapeHtml(friend.id)}">${avatarMarkup(friend, 'nx-avatar nx-avatar-small')}<span class="nx-presence ${friend.online ? 'online' : ''}"></span><span>${escapeHtml(friend.username)}</span>${socialUnread.get(friend.id) ? `<b>${socialUnread.get(friend.id)}</b>` : ''}</button><button class="nx-remove-friend" data-remove-friend="${escapeHtml(friend.id)}" title="Remove friend">×</button></div>`).join('')
            : '<span class="nx-empty">Add someone with their Nexus ID</span>';
        document.querySelectorAll('.nx-channel').forEach((button) => button.classList.toggle('active', button.dataset.channel === activeChannel));
        const globalBadge = document.getElementById('nx-global-unread');
        if (globalBadge) {
            const count = socialUnread.get('global') || 0;
            globalBadge.textContent = count;
            globalBadge.hidden = count === 0;
        }
        updateBadges();
    }

    function renderReactionCounts(container, reactions) {
        if (!container) return;
        container.textContent = '';
        Object.entries(reactions || {}).forEach(([emoji, count]) => {
            if (!count) return;
            const reaction = document.createElement('button');
            reaction.className = 'reaction';
            reaction.dataset.emoji = emoji;
            reaction.textContent = `${emoji} ${count}`;
            container.appendChild(reaction);
        });
    }

    function renderSocialMessage(message, direct) {
        if (!messageArea) return;
        const own = direct ? message.fromId === socialProfile?.id : message.authorId === socialProfile?.id;
        const profile = cacheProfile(message.profile || profileCache.get(direct
            ? (own ? socialProfile?.id : selectedFriend?.id)
            : message.authorId)) || {
            id: direct ? (own ? socialProfile?.id : selectedFriend?.id) : message.authorId,
            username: message.author || (own ? username : 'Player'),
            avatarUrl: '',
            bio: '',
        };
        const blocked = !direct && !own && isUserBlocked(profile, message.author);
        if (blocked) {
            const placeholder = document.createElement('div');
            placeholder.className = 'blocked-placeholder social-blocked nx-profile-trigger';
            placeholder.dataset.profileId = profile.id || '';
            placeholder.innerHTML = `Blocked message from ${escapeHtml(profile.username)} <button class="unblock-btn" data-profile-id="${escapeHtml(profile.id || '')}">Unblock</button>`;
            messageArea.appendChild(placeholder);
            return;
        }
        const div = document.createElement('div');
        div.className = `user-msg social-msg ${own ? 'own-msg' : 'other-msg'}${message.private ? ' private-msg' : ''}`;
        div.dataset.msgid = message.id || message.messageId || '';
        div.dataset.author = message.author || profile.username;
        div.dataset.profileId = profile.id || '';
        const meta = document.createElement('div');
        meta.className = 'nx-message-meta';
        meta.insertAdjacentHTML('beforeend', avatarMarkup(profile, 'nx-avatar nx-avatar-message nx-profile-trigger'));
        const author = document.createElement('strong');
        author.className = 'nx-profile-trigger';
        author.dataset.profileId = profile.id || '';
        author.textContent = message.author || profile.username;
        const time = document.createElement('time');
        time.textContent = new Date(message.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        meta.append(author, time);
        if (message.private) {
            const badge = document.createElement('span');
            badge.className = 'nx-private-badge';
            badge.textContent = `Private → ${message.recipient || 'you'}`;
            meta.appendChild(badge);
        }
        const body = document.createElement('p');
        renderRichText(body, message.text);
        div.append(meta, body);
        if (!direct) {
            const bar = document.createElement('span');
            bar.className = 'reactions-bar social-reactions-bar';
            bar.innerHTML = (message.private ? '' : ['👍', '😂', '😮', '❤️', '🔥'].map((emoji) => `<button class="reaction-btn" data-channel="global" data-emoji="${emoji}" title="React ${emoji}">${emoji}</button>`).join(''))
                + (own ? '' : `<button class="block-btn" data-profile-id="${escapeHtml(profile.id || '')}" title="${blocked ? 'Unblock' : 'Block'} user">${blocked ? 'Unlock' : 'Block'}</button>`);
            div.appendChild(bar);
            if (!message.private) {
                const reactions = document.createElement('span');
                reactions.className = 'reactions';
                renderReactionCounts(reactions, message.reactions || {});
                div.appendChild(reactions);
            }
        }
        messageArea.appendChild(div);
        scrollToBottom();
    }

    function renderActiveChannel() {
        if (!messageArea) return;
        batchRenderDepth += 1;
        messageArea.innerHTML = '';
        const renderLimit = selectedPerformanceProfile().renderedMessages;
        const title = document.getElementById('nx-channel-title');
        const subtitle = document.getElementById('nx-channel-subtitle');
        if (activeChannel === 'game') {
            if (title) title.textContent = 'Match chat';
            if (subtitle) subtitle.textContent = gameId ? `Room ${gameId}` : 'Waiting for a match';
            messageHistory.slice(-renderLimit).forEach((msg) => {
                if (msg.system) {
                    const div = document.createElement('div'); div.className = 'system-msg'; div.textContent = msg.text; messageArea.appendChild(div);
                } else addMessage(msg.author, msg.text, msg.isBlocked, msg.isMention, msg.isPrivate, msg.msgAuthorColor, msg.msgId, true, msg.authorKills || 0, msg.profile, msg.reactions);
            });
            inputField.placeholder = `Message your match — ${config.activationKeyChar}`;
        } else if (activeChannel === 'global') {
            if (title) title.textContent = 'Global';
            if (subtitle) subtitle.textContent = 'Everyone connected to Nexus';
            globalMessageHistory.slice(-renderLimit).forEach((message) => renderSocialMessage(message, false));
            globalNotices.forEach(appendChannelNotice);
            inputField.placeholder = 'Message #global';
        } else if (selectedFriend) {
            if (title) title.textContent = selectedFriend.username;
            if (subtitle) subtitle.textContent = selectedFriend.online ? 'Online now' : 'Offline · messages are saved';
            (directMessageHistory.get(selectedFriend.id) || []).slice(-renderLimit).forEach((message) => renderSocialMessage(message, true));
            inputField.placeholder = `Message ${selectedFriend.username}`;
        }
        if (activeChannel === 'game' || activeChannel === 'global') {
            channelPolls[activeChannel].forEach((poll) => renderPoll(
                poll.pollId,
                poll.question,
                poll.options,
                activeChannel,
            ));
            renderChannelPin(activeChannel);
        }
        const typing = document.getElementById('nx-typing');
        if (typing) typing.style.display = '';
        updateTypingIndicator();
        renderSocialSidebar();
        batchRenderDepth -= 1;
        if (batchRenderDepth === 0 && pendingBatchScroll) {
            pendingBatchScroll = false;
            scrollToBottom(false);
        }
    }

    function sendMessage() {
        if (!chatSocket || !chatSocket.connected) return;
        if (Date.now() < mutedUntil) { showError(`Muted for ${Math.ceil((mutedUntil - Date.now()) / 1000)}s`); return; }
        if (sendCooldown) return;

        let text = inputField.value.trim();
        if (activeChannel === 'direct') {
            if (!text || text.length > 250) { if (text.length > 250) showError('Max 250 chars'); return; }
            text = applyEmoji(text);
            if (selectedFriend) chatSocket.emit('direct-message', { friendId: selectedFriend.id, text });
            playSound('send');
            inputField.value = '';
            inputField.focus();
            stopTyping();
            sendCooldown = true; sendBtn.disabled = true;
            setTimeout(() => { sendCooldown = false; sendBtn.disabled = false; }, 800);
            return;
        }
        if (activeChannel === 'global') {
            if (text === '/help') {
                addChannelNotice('Global commands: /online, /help, /poll, /pin, /stats, /me action, and (name) private message. Use @ to mention someone.', 'global');
                inputField.value = ''; inputField.focus(); return;
            }
            if (text === '/online') {
                chatSocket.emit('request-global-online'); inputField.value = ''; inputField.focus(); return;
            }
            if (text === '/stats') {
                addChannelNotice(`Global: ${globalMessageHistory.length} recent messages and ${globalUsers.length} users online.`, 'global');
                inputField.value = ''; inputField.focus(); return;
            }
            if (text === '/pin' || text.startsWith('/pin ')) {
                chatSocket.emit('global-pin-message', text.slice(4).trim());
                inputField.value = ''; inputField.focus(); return;
            }
            if (text.startsWith('/poll')) {
                const args = text.match(/"([^"]+)"/g);
                if (args && args.length >= 3) {
                    chatSocket.emit('create-global-poll', { question: args[0].slice(1, -1), options: args.slice(1).map((item) => item.slice(1, -1)) });
                    inputField.value = ''; inputField.focus(); return;
                }
                showError('Usage: /poll "q" "opt1" "opt2"'); return;
            }
            if (text.startsWith('/me ')) text = `* ${username} ${text.slice(4)}`;
            if (!text || text.length > 250) { if (text.length > 250) showError('Max 250 chars'); return; }
            text = applyEmoji(text);
            const privateMatch = text.match(/^\(([^)]+)\)\s*(.*)/);
            if (privateMatch) {
                const recipient = privateMatch[1].trim();
                const privateText = privateMatch[2].trim();
                if (!privateText) { showError('Private message cannot be empty.'); return; }
                chatSocket.emit('global-private-message', { recipient, text: privateText });
            } else chatSocket.emit('global-message', text);
            playSound('send');
            inputField.value = '';
            inputField.focus();
            stopTyping();
            sendCooldown = true; sendBtn.disabled = true;
            setTimeout(() => { sendCooldown = false; sendBtn.disabled = false; }, 800);
            return;
        }
        if (text === '/help') {
            addChannelNotice('Match commands: /online, /help, /poll, /pin, /stats, /me action, and (name) private message. Use @ to mention someone.', 'game');
            inputField.value = ''; inputField.focus(); return;
        }
        if (text === '/stats') {
            addSystemMessage(`📊 This game: ${totalMessagesThisGame} msgs, ${totalMentionsThisGame} mentions.`);
            inputField.value = ''; inputField.focus(); return;
        }
        if (text === '/pin' || text.startsWith('/pin ')) {
            chatSocket.emit('pin-message', text.slice(4).trim());
            inputField.value = ''; inputField.focus(); return;
        }
        if (text.startsWith('/poll')) {
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
        stopTyping();
        if (isDim) applyDim(true); else { clearIdle(); startIdleTimer(); }
        sendCooldown = true; sendBtn.disabled = true;
        setTimeout(() => { sendCooldown = false; sendBtn.disabled = false; }, 2000);
    }

    function isAtBottom() {
        const tol = 30;
        return messageArea.scrollHeight - messageArea.clientHeight <= messageArea.scrollTop + tol;
    }
    function scrollToBottom(smooth = true) {
        if (!messageArea) return;
        if (batchRenderDepth > 0) {
            pendingBatchScroll = true;
            return;
        }
        if (scrollAnimationId) cancelAnimationFrame(scrollAnimationId);
        userScrolled = false;
        updateScrollButton();
        if (config.performanceMode !== 'native' || isDim || document.hidden) smooth = false;
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

    function showSettingsPage(pageName = 'account') {
        if (!settingsPanel) return;
        settingsPanel.style.display = 'block';
        document.querySelectorAll('.nx-settings-nav button').forEach((button) => button.classList.toggle('active', button.dataset.settingsPage === pageName));
        document.querySelectorAll('.nx-settings-page').forEach((page) => page.classList.toggle('active', page.dataset.page === pageName));
        resetIdleTimer();
        clearIdle();
        if (isDim) { isDim = false; applyDim(false); }
        refreshSettingsIdentity();
        refreshSettingsDiagnostics();
        if (pageName === 'performance') refreshPerformanceDetails();
        playSound('panel');
    }

    function createChatUI() {
        document.getElementById('nx-optimizer')?.remove();
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
                    <input id="nx-friend-code" maxlength="12" placeholder="NX-12AB34CD" aria-label="Friend code">
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
                    <span id="nx-online-count" title="Users in match chat" style="font-size:11px; margin-right:6px; color:#aaa;">0</span>
                    <button id="nx-mention-badge" style="display:none;">0</button>
                    <button id="nx-unread-badge" style="display:none;">0</button>
                    <button id="nx-dnd-btn" title="Do Not Disturb">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/></svg>
                    </button>
                    <button id="nx-opt-btn" title="Performance optimizer">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z"/></svg>
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
            <button id="nx-scroll-bottom" class="hidden" title="Jump to latest message">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div id="nx-typing"></div>
            <div id="nx-input-box">
                <input type="text" id="nx-input" placeholder="Press ${config.activationKeyChar} to write..." maxlength="250">
                <button id="nx-send" aria-label="Send message" title="Send message">
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
                --nx-bg: linear-gradient(145deg, rgba(10,12,31,.98), rgba(4,6,20,.98));
                --nx-sidebar-bg: rgba(12,15,39,.98);
                --nx-header-bg: rgba(9,11,31,.96);
                --nx-text: #f1f2ff;
                --nx-text-secondary: #9aa3c7;
                --nx-own-msg-bg: rgba(124,92,255,.19);
                --nx-other-msg-bg: rgba(61,220,255,.07);
                --nx-own-border: #9b7cff;
                --nx-other-border: #3ddcff;
                --nx-input-bg: rgba(4,7,24,.78);
                --nx-input-border: rgba(155,124,255,.32);
                --nx-discord: #8ea1ff;
                --nx-glass-border: rgba(168,179,255,.15);
                --nx-accent: #a88cff;
                --nx-accent-2: #45d8ee;
                --nx-shadow: 0 28px 80px rgba(2,3,15,.76), 0 0 42px rgba(124,92,255,.12);
            }
            .theme-ocean {
                --nx-bg: linear-gradient(145deg, rgba(4,29,43,.98), rgba(2,14,25,.98));
                --nx-sidebar-bg: rgba(4,35,49,.98); --nx-header-bg: rgba(3,24,37,.96);
                --nx-text: #eaffff; --nx-text-secondary: #8eb8c3;
                --nx-own-msg-bg: rgba(32,213,194,.17); --nx-other-msg-bg: rgba(255,127,102,.075);
                --nx-own-border: #23d6c1; --nx-other-border: #ff8066;
                --nx-input-bg: rgba(1,17,28,.78); --nx-input-border: rgba(35,214,193,.3);
                --nx-discord: #7e9cff; --nx-glass-border: rgba(132,219,222,.16);
                --nx-accent: #35dcc8; --nx-accent-2: #ff8066;
                --nx-shadow: 0 28px 80px rgba(0,9,16,.7), 0 0 42px rgba(35,214,193,.1);
            }
            .theme-ember {
                --nx-bg: linear-gradient(145deg, rgba(39,17,12,.98), rgba(18,8,8,.98));
                --nx-sidebar-bg: rgba(43,20,14,.98); --nx-header-bg: rgba(31,14,11,.96);
                --nx-text: #fff4e8; --nx-text-secondary: #c6a08d;
                --nx-own-msg-bg: rgba(255,139,54,.18); --nx-other-msg-bg: rgba(57,207,194,.07);
                --nx-own-border: #ff983f; --nx-other-border: #39cfc2;
                --nx-input-bg: rgba(24,9,8,.8); --nx-input-border: rgba(255,152,63,.3);
                --nx-discord: #a5b4ff; --nx-glass-border: rgba(255,190,143,.16);
                --nx-accent: #ff9a44; --nx-accent-2: #3dd0c3;
                --nx-shadow: 0 28px 80px rgba(16,4,2,.72), 0 0 44px rgba(255,92,43,.11);
            }
            .theme-orchid {
                --nx-bg: linear-gradient(145deg, rgba(34,12,39,.98), rgba(15,7,24,.98));
                --nx-sidebar-bg: rgba(38,15,44,.98); --nx-header-bg: rgba(28,10,34,.96);
                --nx-text: #fff0ff; --nx-text-secondary: #c3a0c8;
                --nx-own-msg-bg: rgba(232,103,255,.17); --nx-other-msg-bg: rgba(124,238,177,.075);
                --nx-own-border: #e875ff; --nx-other-border: #7ceeb1;
                --nx-input-bg: rgba(20,7,27,.8); --nx-input-border: rgba(232,117,255,.28);
                --nx-discord: #aab7ff; --nx-glass-border: rgba(239,183,255,.15);
                --nx-accent: #ea7dff; --nx-accent-2: #7ceeb1;
                --nx-shadow: 0 28px 80px rgba(10,2,15,.74), 0 0 44px rgba(232,103,255,.1);
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
            html.nx-chat-dimmed #nx-chat,
            html.nx-chat-dimmed #nx-toggle,
            html.nx-chat-dimmed #nx-profile-popover { opacity:0 !important; visibility:hidden !important; pointer-events:none !important; }
            html[data-nexus-performance="balanced"] #nx-chat,
            html[data-nexus-performance="low-power"] #nx-chat { backdrop-filter:none; -webkit-backdrop-filter:none; box-shadow:0 14px 42px rgba(0,0,0,.46); }
            html[data-nexus-performance="low-power"] #nx-chat { box-shadow:0 8px 24px rgba(0,0,0,.38); }
            html[data-nexus-performance="low-power"] #nx-chat *,
            html[data-nexus-performance="low-power"] #nx-toggle { animation:none !important; transition-duration:.01ms !important; }
            html[data-nexus-performance="low-power"] .fire-gif { display:none !important; }
            #nx-optimization-loader { --nx-opt-progress:0%; position:fixed; inset:0; z-index:2147483647; display:grid; place-items:center; background:rgba(8,11,7,.96); color:#f4eedb; font-family:Inter,Segoe UI,system-ui,sans-serif; opacity:1; transition:opacity .28s ease; }
            #nx-optimization-loader.done { opacity:0; pointer-events:none; }
            .nx-opt-loader-card { width:min(360px,calc(100vw - 42px)); padding:24px; border:1px solid rgba(242,201,76,.22); border-radius:18px; background:#141911; box-shadow:0 24px 70px rgba(0,0,0,.6); text-align:center; }
            .nx-opt-loader-mark { width:48px; height:48px; margin:0 auto 14px; display:grid; place-items:center; border-radius:14px; background:#f2c94c; color:#15190f; font-size:20px; font-weight:900; }
            .nx-opt-loader-card strong { display:block; font-size:15px; }
            .nx-opt-loader-card p { min-height:18px; margin:9px 0; color:#aab29a; font-size:11px; }
            .nx-opt-loader-track { height:4px; overflow:hidden; border-radius:6px; background:#272d21; }
            .nx-opt-loader-track i { display:block; width:var(--nx-opt-progress); height:100%; background:linear-gradient(90deg,#718552,#f2c94c); transition:width .18s ease; }
            .nx-opt-loader-card small { display:block; margin-top:8px; color:#78816f; font-size:9px; }
            #nx-sidebar { width: 230px; flex: 0 0 230px; display: flex; flex-direction: column; background: var(--nx-sidebar-bg); border-right: 1px solid var(--nx-glass-border); overflow: hidden; transition: width .35s cubic-bezier(.22,1,.36,1), flex-basis .35s cubic-bezier(.22,1,.36,1), opacity .2s; }
            #nx-main { min-width: 0; flex: 1; display: flex; flex-direction: column; position: relative; }
            #nx-chat.social-collapsed { width: 390px !important; }
            #nx-chat.social-collapsed #nx-sidebar { width: 0; flex-basis: 0; opacity: 0; border: 0; pointer-events: none; }
            .nx-sidebar-brand { height: 55px; padding: 0 14px; display: flex; align-items: center; gap: 10px; border-bottom: 1px solid var(--nx-glass-border); }
            .nx-sidebar-brand > span, .nx-avatar { width: 30px; height: 30px; border-radius: 10px; display: inline-grid; place-items: center; background: var(--nx-accent); color: #1b1d13; font-weight: 900; }
            .nx-avatar { position:relative; flex:0 0 auto; overflow:hidden; }
            .nx-avatar-small { width:24px; height:24px; border-radius:8px; font-size:10px; }
            .nx-avatar-message { width:26px; height:26px; border-radius:9px; font-size:10px; }
            .nx-avatar-popover { width:48px; height:48px; border-radius:14px; font-size:18px; }
            .nx-avatar-fallback { position:absolute; inset:0; display:grid; place-items:center; }
            .nx-avatar img { position:relative; width:100%; height:100%; object-fit:cover; display:block; }
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
            .nx-request > span:not(.nx-avatar) { flex: 1; overflow: hidden; text-overflow: ellipsis; }
            .nx-request button { width: 24px; height: 24px; border: 0; border-radius: 7px; background: rgba(242,201,76,.13); color: var(--nx-text); cursor: pointer; }
            .nx-friend-row { display:flex; align-items:center; gap:2px; border-radius:9px; }
            .nx-friend-row .nx-friend { min-width:0; flex:1; }
            .nx-friend-row .nx-friend > span:not(.nx-avatar):not(.nx-presence) { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
            .nx-remove-friend { width:25px; height:25px; flex:0 0 auto; border:0; border-radius:8px; background:transparent; color:var(--nx-text-secondary); cursor:pointer; opacity:0; }
            .nx-friend-row:hover .nx-remove-friend { opacity:1; }
            .nx-remove-friend:hover { color:#ff7b78; background:rgba(255,123,120,.12); }
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
            .nx-inline-mention { color:var(--nx-accent-2); font-weight:750; border-radius:4px; background:color-mix(in srgb,var(--nx-accent-2) 10%,transparent); padding:0 2px; }
            .nx-inline-mention.is-you { color:var(--nx-accent); background:color-mix(in srgb,var(--nx-accent) 15%,transparent); }
            .private-msg  { color: #ffc86b; font-style: normal; }
            .nx-private-badge { margin-left:auto; padding:2px 6px; border-radius:999px; color:#ffc86b; background:rgba(255,200,107,.1); font-size:9px; }
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
            .reaction { display: inline-block; margin-left: 3px; font-size: 12px; color:var(--nx-text); background: rgba(255,255,255,0.1); border:1px solid transparent; padding: 1px 4px; border-radius: 5px; cursor:pointer; }
            .poll-container { background: rgba(255,255,255,0.05); border: 1px solid var(--nx-glass-border); border-radius: 14px; padding: 10px; margin-bottom: 8px; }
            .poll-question { font-weight: bold; margin-bottom: 6px; display: flex; align-items: center; gap: 4px; }
            .poll-option { display: block; width: 100%; text-align: left; background: rgba(255,255,255,0.065); border: 1px solid var(--nx-glass-border); color: var(--nx-text); padding: 7px 9px; margin-bottom: 5px; border-radius: 8px; cursor: pointer; }
            .poll-option:hover { background: rgba(255,255,255,0.15); }
            .pinned-msg { background: linear-gradient(90deg, rgba(242,201,76,.11), rgba(113,133,82,.1)); padding: 8px 10px; margin-bottom: 8px; border: 1px solid var(--nx-glass-border); font-style: normal; border-radius: 10px; display: flex; align-items: center; gap: 7px; }
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
            .nx-message-meta { display: flex; align-items: center; gap: 8px; }
            .nx-message-meta time { color: var(--nx-text-secondary); font-size: 9px; }
            .nx-profile-trigger { cursor:pointer; }
            #nx-profile-popover { position:fixed; z-index:100010; width:260px; box-sizing:border-box; display:grid; grid-template-columns:48px 1fr; gap:11px; padding:13px; color:var(--nx-text); background:var(--nx-bg); border:1px solid var(--nx-glass-border); border-radius:16px; box-shadow:0 20px 60px rgba(0,0,0,.7); backdrop-filter:blur(22px); }
            #nx-profile-popover[hidden] { display:none; }
            #nx-profile-popover .nx-popover-copy { min-width:0; display:grid; gap:3px; }
            #nx-profile-popover strong { font-size:14px; overflow:hidden; text-overflow:ellipsis; }
            #nx-profile-popover span, #nx-profile-popover small { color:var(--nx-text-secondary); font-size:9px; }
            #nx-profile-popover p { margin:4px 0; color:var(--nx-text); font-size:11px; line-height:1.4; overflow-wrap:anywhere; }
            #nx-profile-popover > button { grid-column:1 / -1; border:0; border-radius:9px; padding:8px; background:linear-gradient(135deg,var(--nx-accent),var(--nx-accent-2)); color:#11170f; font-weight:800; cursor:pointer; }
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
                position:absolute; inset:10px; overflow:hidden; background:var(--nx-bg);
                backdrop-filter:blur(24px) saturate(150%); border:1px solid var(--nx-glass-border); padding:0;
                color:var(--nx-text); font-size:12px; box-shadow:0 28px 90px rgba(0,0,0,.78);
                z-index:100001; border-radius:18px;
            }
            .nx-settings-head { height:58px; display:flex; align-items:center; justify-content:space-between; padding:0 18px; background:var(--nx-header-bg); border-bottom:1px solid var(--nx-glass-border); box-sizing:border-box; }
            .nx-settings-head strong { font-size:16px; letter-spacing:.01em; }
            .nx-settings-head span { display:block; margin-top:2px; color:var(--nx-text-secondary); font-size:10px; }
            #nx-settings-close { width:30px; height:30px; padding:0 !important; border-radius:9px !important; font-size:18px !important; }
            .nx-settings-shell { height:calc(100% - 58px); display:grid; grid-template-columns:142px minmax(0,1fr); }
            .nx-settings-nav { padding:14px 9px; background:var(--nx-sidebar-bg); border-right:1px solid var(--nx-glass-border); display:flex; flex-direction:column; gap:4px; }
            .nx-settings-nav button { display:flex; align-items:center; gap:8px; width:100%; padding:9px 10px !important; color:var(--nx-text-secondary) !important; background:transparent !important; border:1px solid transparent !important; text-align:left; }
            .nx-settings-nav button:hover { color:var(--nx-text) !important; background:rgba(255,255,255,.045) !important; transform:none !important; }
            .nx-settings-nav button.active { color:var(--nx-text) !important; background:rgba(255,255,255,.075) !important; border-color:var(--nx-glass-border) !important; box-shadow:inset 3px 0 0 var(--nx-accent); }
            .nx-settings-body { min-width:0; padding:16px; overflow-y:auto; }
            .nx-settings-page { display:none; animation:nxSettingsIn .18s ease-out; }
            .nx-settings-page.active { display:grid; gap:11px; }
            @keyframes nxSettingsIn { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:none; } }
            .nx-settings-page-title { margin:0 0 2px; font-size:17px; }
            .nx-settings-page-copy { margin:0 0 4px; color:var(--nx-text-secondary); font-size:10px; line-height:1.5; }
            .nx-settings-section { padding:13px; border:1px solid var(--nx-glass-border); border-radius:14px; background:rgba(255,255,255,.025); }
            .nx-settings-section h4 { margin:0 0 10px; color:var(--nx-accent); font-size:10px; text-transform:uppercase; letter-spacing:.13em; }
            .nx-settings-grid { display:grid; grid-template-columns:1fr 1fr; gap:9px; }
            #nx-settings label { display:block; margin:0; font-weight:650; font-size:10px; color:var(--nx-text-secondary); }
            #nx-settings input, #nx-settings select, #nx-settings textarea { width:100%; margin-top:5px; background:var(--nx-input-bg); border:1px solid var(--nx-input-border); color:var(--nx-text); padding:8px 9px; font-size:11px; border-radius:9px; box-sizing:border-box; outline:none; }
            #nx-settings textarea { min-height:68px; resize:vertical; font-family:inherit; }
            #nx-settings input:focus, #nx-settings select:focus, #nx-settings textarea:focus { border-color:var(--nx-accent); box-shadow:0 0 0 3px color-mix(in srgb,var(--nx-accent) 12%,transparent); }
            .nx-readonly-value { margin-top:5px; padding:9px 10px; border:1px solid var(--nx-input-border); border-radius:9px; background:color-mix(in srgb,var(--nx-input-bg) 72%,transparent); color:var(--nx-text); font-weight:700; }
            .nx-readonly-note { display:block; margin-top:5px; color:var(--nx-text-secondary); font-size:9px; line-height:1.35; }
            .nx-account-card { display:flex; align-items:center; justify-content:space-between; gap:10px; }
            .nx-account-id { font:700 12px ui-monospace,SFMono-Regular,Consolas,monospace; color:var(--nx-text); }
            .nx-account-hint, .nx-settings-note { color:var(--nx-text-secondary); font-size:10px; line-height:1.45; }
            .nx-recovery-row { display:flex; gap:7px; margin-top:9px; }
            .nx-recovery-row input { margin-top:0 !important; }
            .nx-settings-toggle { display:flex !important; align-items:center; justify-content:space-between; padding:8px 0; color:var(--nx-text) !important; }
            .nx-settings-toggle input { width:16px !important; height:16px; margin:0 !important; accent-color:var(--nx-accent); }
            .nx-theme-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
            .nx-theme-card { position:relative; display:grid !important; grid-template-columns:46px 1fr; align-items:center; gap:9px; padding:9px !important; color:var(--nx-text) !important; background:rgba(255,255,255,.03) !important; border:1px solid var(--nx-glass-border) !important; text-align:left; }
            .nx-theme-card.active { border-color:var(--nx-accent) !important; box-shadow:0 0 0 2px color-mix(in srgb,var(--nx-accent) 11%,transparent); }
            .nx-theme-swatch { height:32px; border-radius:9px; background:linear-gradient(135deg,var(--swatch-a),var(--swatch-b)); box-shadow:inset 0 0 0 1px rgba(255,255,255,.16); }
            .nx-theme-card strong { display:block; font-size:11px; }
            .nx-theme-card small { margin:2px 0 0 !important; font-size:9px; }
            .nx-status-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
            .nx-status-card { padding:10px; border-radius:11px; background:rgba(255,255,255,.035); border:1px solid var(--nx-glass-border); }
            .nx-status-card span { display:block; color:var(--nx-text-secondary); font-size:9px; text-transform:uppercase; letter-spacing:.08em; }
            .nx-status-card strong { display:block; margin-top:5px; font-size:11px; overflow:hidden; text-overflow:ellipsis; }
            .nx-status-ok { color:#65d69a; } .nx-status-warn { color:#ffc56d; } .nx-status-error { color:#ff7b78; }
            #nx-settings input[type="range"] {
                -webkit-appearance: none;
                appearance: none;
                width: 100%;
                height: 8px;
                background: linear-gradient(to right, var(--nx-accent-2), var(--nx-accent));
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
                border: 2px solid var(--nx-accent);
                cursor: pointer;
                box-shadow: 0 0 6px rgba(0,0,0,0.5);
            }
            #nx-settings input[type="range"]::-moz-range-thumb {
                width: 18px;
                height: 18px;
                border-radius: 50%;
                background: white;
                border: 2px solid var(--nx-accent);
                cursor: pointer;
            }
            #nx-settings button { margin:0; background:linear-gradient(135deg,var(--nx-accent),var(--nx-accent-2)); border:none; color:#10140e; font-weight:800; padding:8px 10px; cursor:pointer; font-size:11px; border-radius:9px; }
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
            #nx-autocomplete .nx-autocomplete-option { width:100%; border:0; background:transparent; color:var(--nx-text); padding:7px 9px; display:flex; align-items:center; gap:8px; text-align:left; cursor:pointer; }
            #nx-autocomplete .nx-autocomplete-option:hover { background:color-mix(in srgb,var(--nx-accent) 13%,transparent); }
            #nx-autocomplete .nx-mention-option > span:last-child { min-width:0; display:grid; gap:1px; }
            #nx-autocomplete .nx-mention-option b { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--nx-accent); }
            #nx-autocomplete .nx-mention-option small { margin:0; color:var(--nx-text-secondary); font-size:9px; }
            @media (max-width: 680px) {
                #nx-chat { left: 8px !important; right: 8px !important; bottom: 8px !important; width: calc(100vw - 16px) !important; height: min(560px, calc(100vh - 16px)) !important; }
                #nx-sidebar { width: 190px; flex-basis: 190px; }
                #nx-chat.social-collapsed { width: calc(100vw - 16px) !important; }
                .nx-madeby, #nx-online-count { display: none !important; }
                #nx-settings { inset:6px; }
                .nx-settings-shell { grid-template-columns:1fr; grid-template-rows:auto minmax(0,1fr); }
                .nx-settings-nav { padding:7px; flex-direction:row; overflow-x:auto; border-right:0; border-bottom:1px solid var(--nx-glass-border); }
                .nx-settings-nav button { width:auto; white-space:nowrap; }
                .nx-settings-body { padding:11px; }
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
        document.getElementById('nx-opt-btn').addEventListener('click', () => showSettingsPage('performance'));
        document.getElementById('nx-dim-btn').addEventListener('click', toggleDim);
        document.getElementById('nx-min-btn').addEventListener('click', toggleMinimize);
        document.getElementById('nx-cfg-btn').addEventListener('click', () => {
            const opening = settingsPanel.style.display !== 'block';
            if (opening) showSettingsPage('account');
            else { settingsPanel.style.display = 'none'; startIdleTimer(); playSound('close'); }
        });
        document.querySelectorAll('.nx-channel').forEach((button) => button.addEventListener('click', () => setActiveChannel(button.dataset.channel)));
        document.getElementById('nx-add-friend-toggle').addEventListener('click', () => {
            const form = document.getElementById('nx-add-friend');
            form.hidden = !form.hidden;
            playSound(form.hidden ? 'close' : 'panel');
            if (!form.hidden) document.getElementById('nx-friend-code').focus();
        });
        document.getElementById('nx-add-friend').addEventListener('submit', (event) => {
            event.preventDefault();
            const field = document.getElementById('nx-friend-code');
            const code = field.value.trim().toUpperCase();
            if (!/^NX-[0-9A-F]{6,8}$/.test(code)) { showError('Use a Nexus ID such as NX-12AB34CD.'); return; }
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
            const removeButton = event.target.closest('[data-remove-friend]');
            if (removeButton) {
                const friend = socialFriends.find((item) => item.id === removeButton.dataset.removeFriend);
                if (friend && confirm(`Remove ${friend.username} from your friends?`)) chatSocket?.emit('remove-friend', friend.id);
                return;
            }
            if (event.target.closest('#nx-copy-code') && socialProfile) {
                copyText(socialProfile.friendCode);
                event.target.closest('#nx-copy-code').textContent = 'Copied';
                setTimeout(renderSocialSidebar, 1200);
            }
        });
        document.getElementById('nx-mention-badge').addEventListener('click', () => { mentionCount = 0; updateBadges(); scrollToBottom(false); });
        document.getElementById('nx-unread-badge').addEventListener('click', () => { unreadCount = 0; updateBadges(); scrollToBottom(false); });
        sendBtn.addEventListener('click', sendMessage);
        inputField.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            const autocomplete = document.getElementById('nx-autocomplete');
            const firstOption = autocomplete.style.display === 'block'
                ? autocomplete.querySelector('.nx-autocomplete-option, div')
                : null;
            if (firstOption) firstOption.click();
            else sendMessage();
        });
        inputField.addEventListener('input', () => {
            if (!chatSocket || !chatSocket.connected) return;
            if (inputField.value.length > 0) {
                if (!typingTimeout) chatSocket.emit('typing-update', typingPayload(true));
                clearTimeout(typingTimeout);
                typingTimeout = setTimeout(stopTyping, 3000);
            } else stopTyping();
            onInputChange();
        });
        inputField.addEventListener('focus', () => { isInputFocused = true; clearIdle(); applyDim(false); resetIdleTimer(); onInputChange(); });
        inputField.addEventListener('blur', () => { isInputFocused = false; stopTyping(); if (!isDim) startIdleTimer(); setTimeout(() => { document.getElementById('nx-autocomplete').style.display = 'none'; }, 100); });
        chatContainer.addEventListener('mouseenter', () => { isHovering = true; clearIdle(); resetIdleTimer(); });
        chatContainer.addEventListener('mouseleave', () => { isHovering = false; if (!isInputFocused && !isDim) startIdleTimer(); });
        chatContainer.addEventListener('mouseover', (event) => {
            const trigger = event.target.closest('.nx-profile-trigger');
            if (trigger?.dataset.profileId) showProfilePopover(trigger.dataset.profileId, trigger);
        });
        chatContainer.addEventListener('mouseout', (event) => {
            if (event.target.closest('.nx-profile-trigger')) hideProfilePopover();
        });
        chatContainer.addEventListener('error', (event) => {
            if (event.target.matches('.nx-avatar img')) event.target.hidden = true;
        }, true);
        toggleIcon.addEventListener('click', () => { if (!isChatOpen) openChat(); else closeChat(); });

        document.addEventListener('keydown', (e) => {
            if (!isInputFocused) return;
            if (e.key === 'Tab') { e.preventDefault(); const ac = document.getElementById('nx-autocomplete'); if (ac.style.display === 'block') { const first = ac.querySelector('.nx-autocomplete-option, div'); if (first) first.click(); } }
            else if (e.key === 'Escape') { e.preventDefault(); inputField.blur(); if (isChatOpen) closeChat(); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); const ownMsgs = messageHistory.filter(m => m.author === username && m.text); if (ownMsgs.length > 0) inputField.value = ownMsgs[ownMsgs.length-1].text; }
            else if (e.key === 'ArrowDown') { e.preventDefault(); inputField.value = ''; }
        });

        messageArea.addEventListener('click', (e) => {
            const target = e.target;

            const reactionBtn = target.closest('.reaction-btn');
            if (reactionBtn) {
                const msgDiv = reactionBtn.closest('.user-msg');
                if (msgDiv && chatSocket && chatSocket.connected) {
                    const msgId = msgDiv.getAttribute('data-msgid');
                    const emoji = reactionBtn.getAttribute('data-emoji');
                    chatSocket.emit(reactionBtn.dataset.channel === 'global' ? 'add-global-reaction' : 'add-reaction', { messageId: msgId, emoji: emoji });
                }
                return;
            }

            const blockBtn = target.closest('.block-btn');
            if (blockBtn) {
                const msgDiv = blockBtn.closest('.user-msg');
                if (msgDiv) {
                    const author = msgDiv.getAttribute('data-author');
                    const profileId = blockBtn.dataset.profileId || msgDiv.dataset.profileId;
                    if (!author || author === username) return;
                    toggleBlockedUser(profileId, author);
                    renderActiveChannel();
                }
                return;
            }

            const unblockBtn = target.closest('.unblock-btn');
            if (unblockBtn) {
                const placeholder = unblockBtn.closest('.blocked-placeholder');
                const author = placeholder.getAttribute('data-author');
                const profileId = unblockBtn.dataset.profileId || placeholder.dataset.profileId;
                if (author || profileId) {
                    toggleBlockedUser(profileId, author);
                    renderActiveChannel();
                }
                return;
            }

            const profileTrigger = target.closest('.nx-profile-trigger');
            if (profileTrigger) {
                const message = profileTrigger.closest('.user-msg, .blocked-placeholder');
                const profileId = profileTrigger.dataset.profileId || message?.dataset.profileId;
                const profile = profileId ? profileCache.get(profileId) : null;
                const author = profile?.username || message?.dataset.author || profileTrigger.textContent;
                if (preparePrivateMessage(author)) return;
            }
        });

        messageArea.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const strong = e.target.closest('strong');
            if (strong) { const author = strong.textContent; const msgCount = messageHistory.filter(m => m.author === author).length; const online = window.__nexusOnlineUsers?.some((user) => user.username === author); alert(`${author} | Online: ${online ? 'Yes' : 'No'} | Messages: ${msgCount}`); }
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
        // The game WebSocket interceptor is already active.
        connectToChat();
        checkForUpdate();
    }

    function toggleDnd() {
        config.dndMode = !config.dndMode;
        const btn = document.getElementById('nx-dnd-btn');
        btn.classList.toggle('active', config.dndMode);
        btn.innerHTML = config.dndMode
            ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
            : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/></svg>';
        saveConfig();
        playSound('toggle');
    }

    function toggleDim() { isDim = !isDim; applyDim(isDim); playSound('toggle'); }
    function applyDim(state) {
        isDim = Boolean(state);
        document.documentElement.classList.toggle('nx-chat-dimmed', isDim);
        if (isDim) {
            resetIdleTimer();
            clearIdle();
            stopTyping();
            if (inputField) inputField.blur();
            if (settingsPanel) settingsPanel.style.display = 'none';
            hideProfilePopover(0);
            if (scrollAnimationId) { cancelAnimationFrame(scrollAnimationId); scrollAnimationId = null; }
            if (sharedAudioContext && sharedAudioContext.state === 'running') sharedAudioContext.suspend().catch(() => {});
        } else {
            renderActiveChannel();
            if (!isInputFocused && !isHovering) startIdleTimer();
        }
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
        playSound(isMinimized ? 'close' : 'open');
    }
    function setIdle() { if (!isInputFocused && !isHovering && isChatOpen && !isDim && settingsPanel.style.display !== 'block') { isIdle = true; chatContainer.classList.add('idle'); } }
    function clearIdle() { isIdle = false; chatContainer.classList.remove('idle'); }
    function resetIdleTimer() { if (idleTimer) clearTimeout(idleTimer); }
    function startIdleTimer() { resetIdleTimer(); if (!isInputFocused && !isHovering && isChatOpen && !isDim && settingsPanel.style.display !== 'block') idleTimer = setTimeout(setIdle, config.idleTimeout * 1000); }

    function updateBadges() {
        const mentionBadge = document.getElementById('nx-mention-badge');
        const unreadBadge = document.getElementById('nx-unread-badge');
        const socialUnreadCount = Array.from(socialUnread.values()).reduce((total, count) => total + Number(count || 0), 0);
        const totalUnreadCount = unreadCount + socialUnreadCount;
        if (mentionBadge) { mentionBadge.style.display = mentionCount > 0 ? 'inline' : 'none'; mentionBadge.textContent = mentionCount; }
        if (unreadBadge) { unreadBadge.style.display = unreadCount > 0 ? 'inline' : 'none'; unreadBadge.textContent = unreadCount; }
        if (!toggleIcon) return;
        const toggleBadge = toggleIcon.querySelector('.badge');
        if (totalUnreadCount > 0) {
            if (!toggleBadge) { const span = document.createElement('span'); span.className = 'badge'; span.textContent = totalUnreadCount > 99 ? '99+' : totalUnreadCount; toggleIcon.appendChild(span); }
            else { toggleBadge.textContent = totalUnreadCount > 99 ? '99+' : totalUnreadCount; toggleBadge.style.display = 'block'; }
        } else if (toggleBadge) toggleBadge.style.display = 'none';
        if (document.hidden && mentionCount > 0) document.title = `🔴 (${mentionCount}) Nexus Chat`;
    }

    function addMessage(author, text, isBlocked=false, isMention=false, isPrivate=false, msgAuthorColor='#b0b0b0', messageId, skipSave = false, authorKills = 0, profile = null, initialReactions = {}) {
        const msgId = messageId || (Date.now() + '-' + Math.random().toString(36).substring(2,9));
        const resolvedProfile = cacheProfile(profile) || { id: '', username: author, avatarUrl: '', bio: '' };
        isBlocked = author !== username && isUserBlocked(resolvedProfile, author);
        const msgObj = { author, authorId: resolvedProfile.id, profile: resolvedProfile, reactions: initialReactions || {}, text, isBlocked, isMention, isPrivate, msgAuthorColor, msgId, authorKills };
        if (!skipSave) {
            messageHistory.push(msgObj);
            if (messageHistory.length > 100) messageHistory = messageHistory.slice(-100);
            saveHistory();
        }
        if (isBlocked) {
            const placeholder = document.createElement('div');
            placeholder.className = 'blocked-placeholder';
            placeholder.setAttribute('data-author', author);
            placeholder.dataset.profileId = resolvedProfile.id || '';
            placeholder.innerHTML = `Blocked message from ${escapeHtml(author)} <button class="unblock-btn" data-profile-id="${escapeHtml(resolvedProfile.id || '')}">Unblock</button>`;
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
        div.setAttribute('data-msgid', msgId); div.setAttribute('data-author', author); div.dataset.profileId = resolvedProfile.id || ''; div.classList.add('blocked-real');

        if (author === killLeaderName) {
            div.classList.add('kill-leader-msg');
        }

        const avatar = document.createElement('span');
        avatar.className = 'nx-profile-trigger nx-match-avatar';
        avatar.dataset.profileId = resolvedProfile.id || '';
        if (resolvedProfile.avatarUrl) avatar.innerHTML = avatarMarkup(resolvedProfile, 'nx-avatar nx-avatar-message');
        else {
            avatar.style.cssText = 'display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:4px;vertical-align:middle;';
            avatar.style.backgroundColor = effectiveColor;
        }

        let kills = 0;
        if (own) {
            kills = getPlayerKills();
        } else {
            kills = authorKills || 0;
        }

        div.appendChild(avatar);
        const contentSpan = document.createElement('span');
        if (isPrivate) contentSpan.appendChild(document.createTextNode('Private · '));
        const killsBadge = document.createElement('span'); killsBadge.className = 'kills-badge'; killsBadge.textContent = `(${kills}💀) `;
        const authorNode = document.createElement('strong'); authorNode.style.color = effectiveColor; authorNode.textContent = `${author}:`;
        authorNode.className = 'nx-profile-trigger'; authorNode.dataset.profileId = resolvedProfile.id || '';
        const body = document.createElement('span'); if (isMention) body.classList.add('mention'); renderRichText(body, ` ${text}`);
        contentSpan.append(killsBadge, authorNode, body);
        if (own) { const you = document.createElement('span'); you.className = 'you-label'; you.textContent = '(you)'; contentSpan.appendChild(you); }
        div.appendChild(contentSpan);

        const bar = document.createElement('span'); bar.className = 'reactions-bar';
        bar.innerHTML = `
            <button class="reaction-btn" data-emoji="👍" title="Like"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/></svg></button>
            <button class="reaction-btn" data-emoji="😂" title="Laugh"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg></button>
            <button class="reaction-btn" data-emoji="😮" title="Wow"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/><circle cx="12" cy="15" r="1"/></svg></button>
            <button class="reaction-btn" data-emoji="❤️" title="Love"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg></button>
            <button class="reaction-btn" data-emoji="🔥" title="Fire"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z"/></svg></button>
            ${own ? '' : `<button class="block-btn" data-profile-id="${escapeHtml(resolvedProfile.id || '')}" title="${isUserBlocked(resolvedProfile, author) ? 'Unblock' : 'Block'} user">${isUserBlocked(resolvedProfile, author) ? 'Unlock' : 'Block'}</button>`}
        `;
        if (isPrivate) bar.querySelectorAll('.reaction-btn').forEach((button) => button.remove());
        div.appendChild(bar);
        if (!isPrivate) {
            const reactionsSpan = document.createElement('span'); reactionsSpan.className = 'reactions'; renderReactionCounts(reactionsSpan, initialReactions || {}); div.appendChild(reactionsSpan);
        }
        if (!own && isUserBlocked(resolvedProfile, author)) div.classList.add('blocked-hidden');
        messageArea.appendChild(div); scrollToBottom();
    }

    function addSystemMessage(text) {
        messageHistory.push({ system: true, text }); saveHistory();
        if (activeChannel !== 'game') return;
        const div = document.createElement('div'); div.className = 'system-msg'; div.textContent = text;
        messageArea.appendChild(div); scrollToBottom();
    }

    function getMentionCandidates() {
        const source = activeChannel === 'global'
            ? globalUsers
            : (activeChannel === 'direct' ? (selectedFriend ? [selectedFriend] : []) : (window.__nexusOnlineUsers || []));
        const seen = new Set();
        return source
            .map((person) => typeof person === 'string' ? { username: person } : person)
            .filter((person) => {
                const normalized = String(person?.username || '').trim().toLocaleLowerCase();
                if (!normalized || normalized === username.trim().toLocaleLowerCase() || seen.has(normalized)) return false;
                seen.add(normalized);
                return true;
            })
            .sort((first, second) => first.username.localeCompare(second.username));
    }

    function onInputChange() {
        const val = inputField.value;
        const cursorPos = inputField.selectionStart;
        const textBefore = val.slice(0, cursorPos);
        const autocomplete = document.getElementById('nx-autocomplete');
        if (activeChannel !== 'direct' && textBefore.startsWith('/') && !textBefore.includes(' ')) {
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
        const match = textBefore.match(/(^|\s)@([^@\r\n]*)$/);
        if (match) {
            const partial = match[2].toLocaleLowerCase();
            const filtered = getMentionCandidates().filter((person) => person.username.toLocaleLowerCase().startsWith(partial));
            if (filtered.length > 0) {
                autocomplete.innerHTML = filtered.map((person) => `<button type="button" class="nx-autocomplete-option nx-mention-option" data-mention="${escapeHtml(person.username)}">${avatarMarkup(person, 'nx-avatar nx-avatar-small')}<span><b>@${escapeHtml(person.username)}</b><small>${activeChannel === 'direct' ? 'Friend' : (person.online === false ? 'Offline' : 'Online')}</small></span></button>`).join('');
                autocomplete.style.display = 'block';
                autocomplete.onclick = (event) => {
                    const option = event.target.closest('[data-mention]');
                    if (!option) return;
                    const mentionStart = cursorPos - match[2].length - 1;
                    const before = val.slice(0, mentionStart);
                    const after = val.slice(cursorPos);
                    inputField.value = `${before}@${option.dataset.mention} ${after}`;
                    const nextCursor = before.length + option.dataset.mention.length + 2;
                    inputField.focus();
                    inputField.setSelectionRange(nextCursor, nextCursor);
                    autocomplete.style.display = 'none';
                };
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
        setTimeout(() => {
            if (!isChatOpen && sharedAudioContext && sharedAudioContext.state === 'running') sharedAudioContext.suspend().catch(() => {});
        }, 220);
    }

    async function copyText(value) {
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(value);
                return true;
            }
        } catch (error) { console.warn('[NexusChat] Clipboard API unavailable, using fallback.'); }
        const field = document.createElement('textarea');
        field.value = value; field.setAttribute('readonly', ''); field.style.position = 'fixed'; field.style.opacity = '0';
        document.body.appendChild(field); field.select();
        const copied = document.execCommand('copy'); field.remove();
        return copied;
    }

    function buildSettingsPanel() {
        const safeName = String(username || '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
        const safeAvatar = escapeHtml(socialProfile?.avatarUrl || '');
        const safeBio = escapeHtml(socialProfile?.bio || '');
        settingsPanel.innerHTML = `
            <div class="nx-settings-head"><div><strong>Nexus Settings</strong><span>Customize chat, profile, and connection</span></div><button id="nx-settings-close" class="nx-secondary-btn" aria-label="Close">&times;</button></div>
            <div class="nx-settings-shell">
                <nav class="nx-settings-nav" aria-label="Settings sections">
                    <button class="active" data-settings-page="account">◈ Account</button>
                    <button data-settings-page="appearance">◐ Appearance</button>
                    <button data-settings-page="chat"># Chat</button>
                    <button data-settings-page="performance">⚡ Performance</button>
                    <button data-settings-page="diagnostics">● Diagnostics</button>
                </nav>
                <div class="nx-settings-body">
                    <section class="nx-settings-page active" data-page="account"><h3 class="nx-settings-page-title">Your Nexus account</h3><p class="nx-settings-page-copy">Your Nexus ID comes from a private recovery key and stays the same when your game name changes.</p><div class="nx-settings-section"><h4>Identity</h4><div class="nx-account-card"><div><div id="cfg-nexus-id" class="nx-account-id">Connecting…</div><div class="nx-account-hint">Share only this public ID when adding friends.</div></div><button id="cfg-copy-id" class="nx-secondary-btn">Copy ID</button></div></div><div class="nx-settings-section"><h4>Public profile</h4><label>Avatar image URL<input id="cfg-avatar-url" type="url" maxlength="500" placeholder="https://example.com/avatar.png" value="${safeAvatar}"></label><label>Bio<textarea id="cfg-bio" maxlength="160" placeholder="Tell other survivors about yourself">${safeBio}</textarea></label><button id="cfg-save-profile">Save profile</button></div><div class="nx-settings-section"><h4>Recovery</h4><div class="nx-recovery-row"><input id="cfg-recovery-key" type="password" placeholder="Paste an NXR recovery key"><button id="cfg-import-key">Restore</button><button id="cfg-copy-key" class="nx-secondary-btn">Copy key</button></div><small>Keep this key private. It restores the exact same account in another browser or game domain.</small></div></section>
                    <section class="nx-settings-page" data-page="appearance"><h3 class="nx-settings-page-title">Appearance</h3><p class="nx-settings-page-copy">Each theme uses a deliberate color harmony with readable contrast.</p><div class="nx-theme-grid"><button class="nx-theme-card ${config.theme==='dark'?'active':''}" data-theme="dark" style="--swatch-a:#1c2518;--swatch-b:#f2c94c"><span class="nx-theme-swatch"></span><span><strong>Survival</strong><small>Olive + amber</small></span></button><button class="nx-theme-card ${config.theme==='light'?'active':''}" data-theme="light" style="--swatch-a:#f3eedb;--swatch-b:#657747"><span class="nx-theme-swatch"></span><span><strong>Daylight</strong><small>Cream + forest</small></span></button><button class="nx-theme-card ${config.theme==='midnight'?'active':''}" data-theme="midnight" style="--swatch-a:#0a0c28;--swatch-b:#a88cff"><span class="nx-theme-swatch"></span><span><strong>Midnight</strong><small>Violet + cyan</small></span></button><button class="nx-theme-card ${config.theme==='ocean'?'active':''}" data-theme="ocean" style="--swatch-a:#04283a;--swatch-b:#35dcc8"><span class="nx-theme-swatch"></span><span><strong>Ocean</strong><small>Turquoise + coral</small></span></button><button class="nx-theme-card ${config.theme==='ember'?'active':''}" data-theme="ember" style="--swatch-a:#35140d;--swatch-b:#ff9a44"><span class="nx-theme-swatch"></span><span><strong>Ember</strong><small>Orange + teal</small></span></button><button class="nx-theme-card ${config.theme==='orchid'?'active':''}" data-theme="orchid" style="--swatch-a:#32103a;--swatch-b:#ea7dff"><span class="nx-theme-swatch"></span><span><strong>Orchid</strong><small>Magenta + mint</small></span></button></div><div class="nx-settings-section"><h4>Chat window</h4><div class="nx-settings-grid"><label>Display name<input type="text" id="cfg-name" value="${safeName}" maxlength="15"></label><label>Author color<input type="color" id="cfg-authorcolor" value="${hslToHex(authorColor)}"></label><label>Size<select id="cfg-size"><option value="compact" ${config.size==='compact'?'selected':''}>Compact</option><option value="medium" ${config.size==='medium'?'selected':''}>Medium</option><option value="large" ${config.size==='large'?'selected':''}>Large</option></select></label><label>Position<select id="cfg-pos"><option value="top-left" ${config.position==='top-left'?'selected':''}>Top left</option><option value="top-right" ${config.position==='top-right'?'selected':''}>Top right</option><option value="bottom-left" ${config.position==='bottom-left'?'selected':''}>Bottom left</option><option value="bottom-right" ${config.position==='bottom-right'?'selected':''}>Bottom right</option></select></label><label>Volume<input type="range" id="cfg-volume" min="0" max="1" step="0.05" value="${config.volume}"></label></div></div></section>
                    <section class="nx-settings-page" data-page="chat"><h3 class="nx-settings-page-title">Chat</h3><p class="nx-settings-page-copy">Control shortcuts, alerts, and window behavior.</p><div class="nx-settings-section"><h4>Keys and timing</h4><div class="nx-settings-grid"><label>Open chat<button id="cfg-key" class="nx-secondary-btn">${config.activationKeyChar}</button></label><label>Dim chat<button id="cfg-dim-key" class="nx-secondary-btn">${config.dimKeyChar}</button></label><label>Hide after (seconds)<input type="number" id="cfg-idle" value="${config.idleTimeout}" min="1" max="30"></label></div></div><div class="nx-settings-section"><h4>Notifications</h4><label class="nx-settings-toggle">Discord reminders<input type="checkbox" id="cfg-discord-reminder" ${config.discordReminder?'checked':''}></label><label class="nx-settings-toggle">Do not disturb<input type="checkbox" id="cfg-dnd" ${config.dndMode?'checked':''}></label></div></section>
                    <section class="nx-settings-page" data-page="performance"><h3 class="nx-settings-page-title">Performance optimizer</h3><p class="nx-settings-page-copy">Applies verified Survev and Resurviv settings while reducing Nexus rendering work immediately.</p><div class="nx-settings-section"><div class="nx-account-card"><div><h4 id="cfg-performance-state">Optimizer ready</h4><small id="cfg-performance-summary" class="nx-settings-note">Choose a preset to see its details.</small></div><button id="cfg-apply-performance">Apply now</button></div><label>Preset<select id="cfg-performance"><option value="native" ${config.performanceMode==='native'?'selected':''}>Native</option><option value="balanced" ${config.performanceMode==='balanced'?'selected':''}>Balanced</option><option value="low-power" ${config.performanceMode==='low-power'?'selected':''}>Low power</option></select></label><div class="nx-status-grid" style="margin-top:10px"><div class="nx-status-card"><span>Textures</span><strong id="cfg-performance-textures">—</strong></div><div class="nx-status-card"><span>Screen shake</span><strong id="cfg-performance-shake">—</strong></div><div class="nx-status-card"><span>Interpolation</span><strong id="cfg-performance-interpolation">—</strong></div><div class="nx-status-card"><span>Rendered messages</span><strong id="cfg-performance-messages">—</strong></div></div><small class="nx-settings-note">Nexus effects change live. Verified game preferences are saved immediately and are also used by the next match created by the game.</small></div></section>
                    <section class="nx-settings-page" data-page="diagnostics"><h3 class="nx-settings-page-title">Diagnostics</h3><p class="nx-settings-page-copy">Check whether Nexus ID and Global chat are ready.</p><div class="nx-status-grid"><div class="nx-status-card"><span>Server</span><strong id="cfg-status-server">Checking…</strong></div><div class="nx-status-card"><span>Nexus ID</span><strong id="cfg-status-id">Checking…</strong></div><div class="nx-status-card"><span>Client</span><strong>v${EXT_VERSION}</strong></div></div><div class="nx-settings-section"><h4>Connection</h4><div id="cfg-status-detail" class="nx-settings-note">Waiting for socket information…</div><button id="cfg-reconnect" style="margin-top:10px">Reconnect now</button></div></section>
                </div>
            </div>
        `;

        const displayNameInput = document.getElementById('cfg-name');
        const displayNameLabel = displayNameInput?.closest('label');
        if (displayNameLabel) {
            displayNameLabel.innerHTML = `Game name<div class="nx-readonly-value" role="textbox" aria-readonly="true">${safeName}</div><small class="nx-readonly-note">Change your name in the game. Nexus follows it automatically.</small>`;
        }
        const renderedMessagesCard = document.getElementById('cfg-performance-messages')?.closest('.nx-status-card');
        if (renderedMessagesCard) renderedMessagesCard.insertAdjacentHTML('beforebegin', '<div class="nx-status-card"><span>Client rotation</span><strong id="cfg-performance-rotation">—</strong></div>');

        document.getElementById('nx-settings-close').addEventListener('click', () => { settingsPanel.style.display = 'none'; playSound('close'); });
        document.querySelectorAll('.nx-settings-nav button').forEach((button) => button.addEventListener('click', () => {
            document.querySelectorAll('.nx-settings-nav button').forEach((item) => item.classList.toggle('active', item === button));
            document.querySelectorAll('.nx-settings-page').forEach((page) => page.classList.toggle('active', page.dataset.page === button.dataset.settingsPage));
            if (button.dataset.settingsPage === 'diagnostics') refreshSettingsDiagnostics();
            if (button.dataset.settingsPage === 'performance') refreshPerformanceDetails();
            playSound('navigate');
        }));
        document.getElementById('cfg-copy-id').addEventListener('click', async function() {
            if (!socialProfile || !socialProfile.friendCode) return;
            await copyText(socialProfile.friendCode);
            playSound('success');
            this.textContent = 'Copied'; setTimeout(() => { this.textContent = 'Copy ID'; }, 1200);
        });
        document.getElementById('cfg-copy-key').addEventListener('click', async function() {
            await copyText(socialToken);
            playSound('success');
            this.textContent = 'Copied'; setTimeout(() => { this.textContent = 'Copy key'; }, 1200);
        });
        document.getElementById('cfg-save-profile').addEventListener('click', function() {
            const avatarUrl = document.getElementById('cfg-avatar-url').value.trim();
            const bio = document.getElementById('cfg-bio').value.trim();
            if (avatarUrl && !/^https:\/\//i.test(avatarUrl)) { showError('Avatar URL must use HTTPS.'); return; }
            chatSocket?.emit('profile-update', { avatarUrl, bio });
            this.textContent = 'Saving…'; setTimeout(() => { this.textContent = 'Save profile'; }, 1200);
        });
        document.getElementById('cfg-import-key').addEventListener('click', function() {
            const input = document.getElementById('cfg-recovery-key');
            const nextToken = input.value.trim();
            if (!isSocialToken(nextToken)) { input.setCustomValidity('This Nexus recovery key is invalid.'); input.reportValidity(); return; }
            input.setCustomValidity(''); socialToken = nextToken; persistSocialToken(socialToken); input.value = '';
            if (chatSocket) chatSocket.disconnect();
            chatSocket = null; connectToChat(); addSystemMessage('Nexus account restored. Reconnecting…');
        });
        document.getElementById('cfg-authorcolor').addEventListener('input', function() { authorColor = this.value; localStorage.setItem('nexus_authorColor', authorColor); });
        document.getElementById('cfg-size').addEventListener('change', function() { config.size = this.value; applySize(); saveConfig(); });
        document.getElementById('cfg-pos').addEventListener('change', function() { config.position = this.value; applyPosition(); saveConfig(); playSound('toggle'); });
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
        document.querySelectorAll('.nx-theme-card').forEach((button) => button.addEventListener('click', () => {
            config.theme = button.dataset.theme;
            applyTheme(config.theme); saveConfig();
            document.querySelectorAll('.nx-theme-card').forEach((item) => item.classList.toggle('active', item === button));
            playSound('toggle');
        }));
        const applySelectedPerformance = async () => {
            const select = document.getElementById('cfg-performance');
            const button = document.getElementById('cfg-apply-performance');
            select.disabled = true;
            button.disabled = true;
            config.performanceMode = select.value;
            saveConfig();
            await applyPerformanceMode(config.performanceMode, { showProgress: true });
            select.disabled = false;
            button.disabled = false;
            playSound('success');
            addChannelNotice(`${selectedPerformanceProfile().label} optimization applied without reloading.`);
        };
        document.getElementById('cfg-performance').addEventListener('change', applySelectedPerformance);
        document.getElementById('cfg-apply-performance').addEventListener('click', applySelectedPerformance);
        document.getElementById('cfg-reconnect').addEventListener('click', function() {
            lastConnectionError = '';
            if (chatSocket) chatSocket.disconnect();
            chatSocket = null; socialProfile = null; socialServerVersion = null; refreshSettingsIdentity(); connectToChat();
            this.textContent = 'Reconnecting…'; setTimeout(() => { this.textContent = 'Reconnect now'; refreshSettingsDiagnostics(); }, 1200);
        });
        refreshSettingsIdentity();
        refreshSettingsDiagnostics();
        refreshPerformanceDetails();
    }

    function refreshSettingsIdentity() {
        const id = document.getElementById('cfg-nexus-id');
        if (id) id.textContent = socialProfile && socialProfile.friendCode ? socialProfile.friendCode : 'Connecting…';
        const avatar = document.getElementById('cfg-avatar-url');
        const bio = document.getElementById('cfg-bio');
        if (avatar && socialProfile) avatar.value = socialProfile.avatarUrl || '';
        if (bio && socialProfile) bio.value = socialProfile.bio || '';
        refreshSettingsDiagnostics();
    }

    function refreshSettingsDiagnostics() {
        const server = document.getElementById('cfg-status-server');
        const identity = document.getElementById('cfg-status-id');
        const detail = document.getElementById('cfg-status-detail');
        if (!server || !identity || !detail) return;
        const connected = Boolean(chatSocket && chatSocket.connected);
        server.textContent = connected ? `Connected${socialServerVersion ? ` · v${socialServerVersion}` : ''}` : 'Disconnected';
        server.className = connected ? 'nx-status-ok' : 'nx-status-error';
        identity.textContent = socialProfile && socialProfile.friendCode ? 'Ready' : 'Pending';
        identity.className = socialProfile && socialProfile.friendCode ? 'nx-status-ok' : 'nx-status-warn';
        detail.textContent = lastConnectionError
            ? `Last error: ${lastConnectionError}`
            : (connected ? `Socket connected to ${SERVER_URL}. Global chat is available.` : `Connecting to ${SERVER_URL}…`);
    }

    function applyTheme(theme) { AVAILABLE_THEMES.forEach((name) => chatContainer.classList.remove('theme-' + name)); chatContainer.classList.add('theme-' + (AVAILABLE_THEMES.includes(theme) ? theme : 'dark')); }
    function applySize() { const sizes = { compact: {w:620,h:440}, medium: {w:760,h:520}, large: {w:920,h:620} }; const size = sizes[config.size] || sizes.medium; chatContainer.style.width = size.w+'px'; chatContainer.style.height = size.h+'px'; }
    function applyPosition() {
        const posMap = { 'top-left':{top:'20px',left:'20px',bottom:'auto',right:'auto'}, 'top-right':{top:'20px',right:'20px',bottom:'auto',left:'auto'}, 'bottom-left':{bottom:'20px',left:'20px',top:'auto',right:'auto'}, 'bottom-right':{bottom:'20px',right:'20px',top:'auto',left:'auto'} };
        Object.assign(chatContainer.style, posMap[config.position]); Object.assign(toggleIcon.style, posMap[config.position]);
    }
    function applyConfig() {
        chatContainer.style.removeProperty('background');
        chatContainer.style.removeProperty('color');
        applySize();
        applyPosition();
    }
    function saveConfig() { localStorage.setItem('nexusChatConfig', JSON.stringify(config)); }

    function startDiscordReminder() {
        stopDiscordReminder();
        if (!config.discordReminder || config.performanceMode !== 'native') return;
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
    window.addEventListener('pagehide', () => {
        if (historySaveTimer) clearTimeout(historySaveTimer);
        flushHistory();
        if (sharedAudioContext && sharedAudioContext.state === 'running') sharedAudioContext.suspend().catch(() => {});
    });

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
        nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitName(); });

        const canvas = document.getElementById('nx-particles');
        const ctx = canvas.getContext('2d');
        canvas.width = window.innerWidth; canvas.height = window.innerHeight;
        const particles = [];
        const particleCount = selectedPerformanceProfile().particles;
        for (let i = 0; i < particleCount; i++) particles.push({ x:Math.random()*canvas.width, y:Math.random()*canvas.height, radius:Math.random()*2+1, speedX:Math.random()*0.6-0.3, speedY:Math.random()*0.6-0.3, alpha:Math.random()*0.45+0.2 });
        let lastParticleFrame = 0;
        function animateParticles(now = 0) {
            if (!onboardingOverlay) return;
            if (now - lastParticleFrame < 33) { requestAnimationFrame(animateParticles); return; }
            lastParticleFrame = now;
            ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = '#b71c1c';
            for (const p of particles) {
                p.x += p.speedX; p.y += p.speedY;
                if (p.x < 0 || p.x > canvas.width) p.speedX *= -1;
                if (p.y < 0 || p.y > canvas.height) p.speedY *= -1;
                ctx.globalAlpha = p.alpha; ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI*2); ctx.fill();
            }
            requestAnimationFrame(animateParticles);
        }
        if (particles.length) requestAnimationFrame(animateParticles);
    }

    async function checkForUpdate() {
        try {
            const res = await fetch(`${SERVER_URL}/version.json?_=${Date.now()}`);
            if (!res.ok) return;
            const data = await res.json();
            if (compareVersions(data.version, INSTALLED_VERSION) > 0
                && sessionStorage.getItem('nexus_update_dismissed') !== data.version) {
                showUpdateOverlay(data);
            }
        } catch(e) {}
    }

    function showUpdateOverlay(data) {
        if (document.getElementById('nx-update-overlay')) return;

        const isUserscript = CLIENT_DISTRIBUTION === 'userscript';
        const updateUrl = isUserscript ? GREASYFORK_URL : WEBSITE_URL;
        const updateTitle = isUserscript ? 'Tampermonkey update available' : 'Extension update available';
        const updateCopy = isUserscript
            ? 'Tampermonkey normally updates Nexus automatically. If it has not updated yet, open Greasy Fork and press Update or Reinstall.'
            : 'Open the official Nexus website to download the latest extension package, then replace or reload your installed extension.';
        const updateButton = isUserscript ? 'Update on Greasy Fork' : 'Open update page';

        const overlay = document.createElement('div');
        overlay.id = 'nx-update-overlay';
        overlay.innerHTML = `
            <div id="nx-update-box">
                <button id="nx-update-close" title="Close">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
                <img src="${LOGO_URL}" alt="Nexus Chat" class="nx-logo-img">
                <span class="nx-update-kicker">NEXUS RELEASE</span>
                <h1 class="nx-title-neon">${updateTitle}</h1>
                <p class="nx-version">Version ${escapeHtml(String(data.version || ''))}</p>
                <p class="nx-update-copy">${updateCopy}</p>
                <div class="nx-changelog">
                    <h3>New:</h3>
                    <ul>${(data.changes || []).map(c => `<li>${escapeHtml(String(c))}</li>`).join('')}</ul>
                    <h3>Fixed:</h3>
                    <ul>${(data.bugs || []).map(b => `<li>${escapeHtml(String(b))}</li>`).join('')}</ul>
                </div>
                <button id="nx-update-download">${updateButton}</button>
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
                background: linear-gradient(150deg, rgba(28,34,24,.98), rgba(12,15,11,.98));
                border: 1px solid rgba(242,201,76,.28);
                border-radius: 20px;
                padding: 40px;
                text-align: center;
                max-width: 450px;
                width: 90%;
                box-shadow: 0 24px 70px rgba(0,0,0,.82), 0 0 42px rgba(113,133,82,.2);
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
            .nx-logo-img { width: 76px; height: 76px; margin-bottom: 14px; filter: drop-shadow(0 0 14px rgba(242,201,76,.35)); }
            .nx-update-kicker { display:block; color:#aab29a; font-size:11px; font-weight:800; letter-spacing:.2em; margin-bottom:8px; }
            .nx-title-neon {
                font-size: 28px; font-weight: 800;
                color: #f4eedb;
                text-shadow: 0 0 18px rgba(242,201,76,.2);
                margin: 0 0 10px;
            }
            .nx-version { font-size: 15px; color: #f2c94c; margin: 0 0 12px; font-weight:700; }
            .nx-update-copy { color:#c9cfbd; font-size:14px; line-height:1.55; margin:0 auto 18px; max-width:390px; }
            .nx-changelog { text-align: left; margin: 20px 0; font-size: 14px; }
            .nx-changelog h3 { color: #f2c94c; margin-top: 15px; }
            .nx-changelog ul { padding-left: 20px; }
            .nx-changelog li { margin-bottom: 6px; }
            #nx-update-download {
                background: linear-gradient(135deg, #718552, #f2c94c);
                border: none; color: #11150e; font-weight: 800;
                padding: 14px 28px; border-radius: 10px;
                cursor: pointer; font-size: 16px;
                box-shadow: 0 0 22px rgba(242,201,76,.24);
                transition: transform 0.2s, box-shadow 0.2s;
                margin-top: 10px;
            }
            #nx-update-download:hover {
                transform: scale(1.05);
                box-shadow: 0 0 30px rgba(242,201,76,.4);
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(overlay);

        playSound('panel');
        document.getElementById('nx-update-download').onclick = () => window.open(updateUrl, '_blank', 'noopener,noreferrer');
        document.getElementById('nx-update-close').onclick = () => {
            sessionStorage.setItem('nexus_update_dismissed', String(data.version || ''));
            overlay.remove();
        };
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
