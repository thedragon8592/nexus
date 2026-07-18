const crypto = require('crypto');
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const packageJson = require('../../package.json');
const { SocialStore } = require('./social-store');
const { TursoSocialStore } = require('./turso-social-store');
const {
  ALLOWED_REACTIONS,
  LIMITS,
  normalizeName,
  readChatPayload,
  readFriendCode,
  readGameId,
  readPoll,
  readProfile,
  readText,
  readUsername,
} = require('./validation');

const DEFAULT_ORIGINS = new Set([
  'https://resurviv.biz',
  'https://survev.io',
  'https://wnexuschat.netlify.app',
]);
const GLOBAL_POLL_TTL_MS = 15 * 60 * 1000;

function originIsAllowed(origin, configuredOrigins) {
  if (!origin) return true;
  if (configuredOrigins.has(origin)) return true;
  try {
    const url = new URL(origin);
    if (url.protocol === 'chrome-extension:') return true;
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return true;
    return url.hostname.endsWith('.resurviv.biz') || url.hostname.endsWith('.survev.io');
  } catch {
    return false;
  }
}

function createRateLimiter() {
  const buckets = new Map();
  return {
    consume(key, limit, windowMs) {
      const now = Date.now();
      const recent = (buckets.get(key) || []).filter((time) => now - time < windowMs);
      if (recent.length >= limit) {
        buckets.set(key, recent);
        return false;
      }
      recent.push(now);
      buckets.set(key, recent);
      return true;
    },
    clear() {
      buckets.clear();
    },
  };
}

function createNexusServer(options = {}) {
  const app = express();
  const server = http.createServer(app);
  const configuredOrigins = new Set([
    ...DEFAULT_ORIGINS,
    ...(process.env.ALLOWED_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean),
    ...(options.allowedOrigins || []),
  ]);

  const io = new Server(server, {
    cors: {
      origin(origin, callback) {
        callback(null, originIsAllowed(origin, configuredOrigins));
      },
      methods: ['GET', 'POST'],
    },
    maxHttpBufferSize: 16 * 1024,
    serveClient: true,
  });

  const rooms = new Map();
  const roomHistory = new Map();
  const roomPolls = new Map();
  const roomPinned = new Map();
  const roomReactions = new Map();
  const globalPolls = new Map();
  let globalPinned = null;
  const onlineAccounts = new Map();
  const accountProfiles = new Map();
  const hasDataFileOption = Object.prototype.hasOwnProperty.call(options, 'dataFile');
  const dataFile = hasDataFileOption
    ? options.dataFile
    : (process.env.DATA_FILE || path.join(__dirname, '../../data/nexus-social.json'));
  const tursoUrl = options.tursoUrl ?? process.env.TURSO_DATABASE_URL;
  const tursoAuthToken = options.tursoAuthToken ?? process.env.TURSO_AUTH_TOKEN;
  if (!hasDataFileOption && Boolean(tursoUrl) !== Boolean(tursoAuthToken)) {
    throw new Error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be configured together.');
  }
  if (!hasDataFileOption && process.env.NODE_ENV === 'production' && (!tursoUrl || !tursoAuthToken)) {
    throw new Error('Persistent Turso storage is required in production.');
  }
  const socialStore = options.socialStore
    || (hasDataFileOption || !tursoUrl ? new SocialStore(dataFile) : new TursoSocialStore({ url: tursoUrl, authToken: tursoAuthToken }));

  function getOnlineAccountIds() {
    return new Set(Array.from(onlineAccounts.entries()).filter(([, sockets]) => sockets.size > 0).map(([id]) => id));
  }

  function emitToAccount(accountId, event, payload) {
    const sockets = onlineAccounts.get(accountId);
    if (!sockets) return;
    for (const socketId of sockets) io.to(socketId).emit(event, payload);
  }

  async function emitSocialUpdate(accountId) {
    const snapshot = await socialStore.snapshot(accountId, getOnlineAccountIds());
    if (!snapshot) return;
    const { globalHistory, ...social } = snapshot;
    emitToAccount(accountId, 'social-update', social);
  }

  async function refreshFriendPresence(accountId) {
    const friendIds = await socialStore.friendIds(accountId);
    await Promise.all([emitSocialUpdate(accountId), ...friendIds.map((friendId) => emitSocialUpdate(friendId))]);
  }

  function getUserList(gameId) {
    const room = rooms.get(gameId);
    return room ? Array.from(room.values(), (entry) => ({
      id: entry.accountId || `socket:${entry.socketId || entry.username}`,
      username: entry.username,
      friendCode: entry.profile?.friendCode || '',
      avatarUrl: entry.profile?.avatarUrl || '',
      bio: entry.profile?.bio || '',
      online: true,
    })) : [];
  }

  function getGlobalUserList() {
    return Array.from(accountProfiles.values(), (profile) => ({ ...profile, online: true }))
      .sort((first, second) => first.username.localeCompare(second.username));
  }

  function broadcastGlobalUsers() {
    io.emit('global-user-list', getGlobalUserList());
  }

  function getOnlineCount() {
    let count = 0;
    for (const room of rooms.values()) count += room.size;
    return count;
  }

  function setApiCors(req, res, next) {
    const origin = req.headers.origin;
    if (origin && originIsAllowed(origin, configuredOrigins)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  }

  app.use(setApiCors);
  function sendPublicFile(res, fileName, contentType) {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    if (contentType) res.type(contentType);
    res.sendFile(path.join(__dirname, '../../public', fileName));
  }
  app.get('/client.js', (req, res) => sendPublicFile(res, 'client.js', 'application/javascript'));
  app.get('/nexus-chat.user.js', (req, res) => sendPublicFile(res, 'nexus-chat.user.js', 'application/javascript'));
  app.get('/nexus-optimizer.user.js', (req, res) => sendPublicFile(res, 'nexus-optimizer.user.js', 'application/javascript'));
  app.get('/version.json', (req, res) => sendPublicFile(res, 'version.json', 'application/json'));
  if (options.enablePreview || process.env.NODE_ENV !== 'production') {
    app.get('/preview', (req, res) => {
      const requestedName = typeof req.query.username === 'string' ? req.query.username.trim() : '';
      const previewUsername = /^[A-Za-z0-9_.-]{1,15}$/.test(requestedName) ? requestedName : 'PreviewUser';
      res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Nexus Chat Preview</title><style>html,body{height:100%;margin:0;background:radial-gradient(circle at 50% 20%,#25331f,#090d08 70%);overflow:hidden}</style></head><body><script>sessionStorage.setItem('nexus_username',${JSON.stringify(previewUsername)});window.__NEXUS_BOOTSTRAP__={serverUrl:location.origin};</script><script src="/socket.io/socket.io.js"></script><script src="/client.js"></script></body></html>`);
    });
  }
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      version: packageJson.version,
      activeRooms: rooms.size,
      onlineUsers: getOnlineCount(),
      storage: socialStore.kind,
      uptimeSeconds: Math.floor(process.uptime()),
    });
  });
  app.get('/', (req, res) => res.type('text/plain').send(`Nexus Chat Server v${packageJson.version}`));

  io.on('connection', (socket) => {
    let currentGame = null;
    let currentUsername = null;
    let currentAccountId = null;
    const limiter = createRateLimiter();

    function protocolError(code, message) {
      socket.emit('protocol-error', { code, message });
      socket.emit('system-message', `Error: ${message}`);
    }

    function allow(event, limit, windowMs) {
      if (limiter.consume(event, limit, windowMs)) return true;
      protocolError('RATE_LIMITED', 'You are doing that too quickly.');
      return false;
    }

    function requireJoined() {
      if (currentGame && currentUsername) return true;
      protocolError('NOT_JOINED', 'Join a game before using chat.');
      return false;
    }

    function cleanRoomIfEmpty(gameId) {
      const room = rooms.get(gameId);
      if (room && room.size > 0) return;
      rooms.delete(gameId);
      roomHistory.delete(gameId);
      roomPolls.delete(gameId);
      roomPinned.delete(gameId);
      roomReactions.delete(gameId);
    }

    function leaveCurrentRoom(announce = true) {
      if (!currentGame) return;
      const gameId = currentGame;
      const username = currentUsername;
      socket.leave(gameId);
      const room = rooms.get(gameId);
      if (room) room.delete(socket.id);
      cleanRoomIfEmpty(gameId);
      if (rooms.has(gameId)) {
        if (announce) socket.to(gameId).emit('system-message', `${username} left the chat.`);
        io.to(gameId).emit('user-list', getUserList(gameId));
      }
      currentGame = null;
      currentUsername = null;
    }

    socket.on('join', async (payload) => {
      if (!allow('join', 5, 10_000)) return;
      if (!payload || typeof payload !== 'object') {
        protocolError('INVALID_JOIN', 'Join data is invalid.');
        return;
      }
      const parsedGame = readGameId(payload.gameId);
      const parsedName = readUsername(payload.username);
      if (!parsedGame.ok || !parsedName.ok) {
        protocolError('INVALID_JOIN', parsedGame.error || parsedName.error);
        return;
      }
      const gameId = parsedGame.value;
      const username = parsedName.value;
      const room = rooms.get(gameId) || new Map();
      const duplicate = Array.from(room.entries()).some(
        ([id, user]) => id !== socket.id && normalizeName(user.username) === normalizeName(username),
      );
      if (duplicate) {
        protocolError('NAME_TAKEN', 'That name is already taken in this game.');
        return;
      }

      if (currentGame) leaveCurrentRoom();
      socket.join(gameId);
      currentGame = gameId;
      currentUsername = username;
      if (!rooms.has(gameId)) rooms.set(gameId, new Map());
      rooms.get(gameId).set(socket.id, { username, socketId: socket.id });
      if (!roomHistory.has(gameId)) roomHistory.set(gameId, []);
      if (!roomPolls.has(gameId)) roomPolls.set(gameId, new Map());
      if (!roomPinned.has(gameId)) roomPinned.set(gameId, null);
      if (!roomReactions.has(gameId)) roomReactions.set(gameId, new Map());

      let issuedToken = null;
      if (!currentAccountId) {
        const identity = await socialStore.ensureIdentity(payload.socialToken, username);
        const socialUser = identity.user;
        issuedToken = identity.token;
        currentAccountId = socialUser.id;
        if (!onlineAccounts.has(currentAccountId)) onlineAccounts.set(currentAccountId, new Set());
        onlineAccounts.get(currentAccountId).add(socket.id);
      }

      socket.emit('join-accepted', { gameId, username });
      const socialSnapshot = await socialStore.snapshot(currentAccountId, getOnlineAccountIds());
      const profile = { ...socialSnapshot.profile, username };
      accountProfiles.set(currentAccountId, profile);
      rooms.get(gameId).set(socket.id, {
        username,
        socketId: socket.id,
        accountId: currentAccountId,
        profile,
      });
      socket.emit('social-session', {
        token: issuedToken,
        protocolVersion: 3,
        serverVersion: packageJson.version,
        globalPinned,
        ...socialSnapshot,
      });
      await refreshFriendPresence(currentAccountId);
      socket.emit('chat-history', roomHistory.get(gameId));
      const pinned = roomPinned.get(gameId);
      if (pinned) socket.emit('pinned-message', pinned);
      socket.to(gameId).emit('system-message', `${username} joined the chat.`);
      io.to(gameId).emit('user-list', getUserList(gameId));
      broadcastGlobalUsers();
    });

    socket.on('change-username', async (value) => {
      if (!requireJoined() || !allow('change-username', 3, 30_000)) return;
      const parsedName = readUsername(value);
      if (!parsedName.ok) {
        protocolError('INVALID_USERNAME', parsedName.error);
        socket.emit('username-change-rejected', { rejectedName: value });
        return;
      }
      const newUsername = parsedName.value;
      const room = rooms.get(currentGame);
      const duplicate = Array.from(room.entries()).some(
        ([id, user]) => id !== socket.id && normalizeName(user.username) === normalizeName(newUsername),
      );
      if (duplicate) {
        protocolError('NAME_TAKEN', `Name '${newUsername}' is already taken.`);
        socket.emit('username-change-rejected', { rejectedName: newUsername });
        return;
      }
      const oldName = currentUsername;
      currentUsername = newUsername;
      let updatedProfile = null;
      if (currentAccountId) {
        updatedProfile = await socialStore.updateUsername(currentAccountId, newUsername);
        accountProfiles.set(currentAccountId, updatedProfile);
      }
      room.set(socket.id, {
        username: newUsername,
        socketId: socket.id,
        accountId: currentAccountId,
        profile: updatedProfile,
      });
      socket.emit('username-change-accepted', { newUsername });
      socket.emit('system-message', `✅ Your name is now ${newUsername}.`);
      socket.to(currentGame).emit('system-message', `${oldName} changed their name to ${newUsername}.`);
      io.to(currentGame).emit('user-list', getUserList(currentGame));
      if (currentAccountId) {
        await refreshFriendPresence(currentAccountId);
        broadcastGlobalUsers();
      }
    });

    socket.on('chat-message', (rawPayload) => {
      if (!requireJoined() || !allow('chat-message', 5, 10_000)) return;
      const parsed = readChatPayload(rawPayload);
      if (!parsed.ok) {
        protocolError('INVALID_MESSAGE', parsed.error);
        return;
      }
      const message = {
        ...parsed.value,
        author: currentUsername,
        authorId: currentAccountId,
        profile: accountProfiles.get(currentAccountId) || null,
        reactions: {},
        messageId: crypto.randomUUID(),
        timestamp: Date.now(),
      };

      if (message.recipient) {
        const target = Array.from(rooms.get(currentGame).entries()).find(
          ([, user]) => normalizeName(user.username) === normalizeName(message.recipient),
        );
        if (!target) {
          protocolError('USER_NOT_FOUND', `User '${message.recipient}' is not online in this game.`);
          socket.emit('message-delivery-failed', { reason: 'USER_NOT_FOUND' });
          return;
        }
        io.to(target[0]).emit('chat-message', message);
        if (target[0] !== socket.id) socket.emit('chat-message', message);
        socket.emit('message-delivered', { messageId: message.messageId, private: true });
        return;
      }

      const history = roomHistory.get(currentGame) || [];
      history.push(message);
      if (history.length > LIMITS.history) history.shift();
      roomHistory.set(currentGame, history);
      io.to(currentGame).emit('chat-message', message);
      socket.emit('message-delivered', { messageId: message.messageId, private: false });
    });

    socket.on('global-message', async (value) => {
      if (!currentAccountId || !allow('global-message', 5, 10_000)) return;
      const parsed = readText(value, { name: 'Global message', max: LIMITS.message });
      if (!parsed.ok) {
        protocolError('INVALID_GLOBAL_MESSAGE', parsed.error);
        return;
      }
      const message = await socialStore.addGlobalMessage(currentAccountId, parsed.value);
      if (message) io.emit('global-message', message);
    });

    socket.on('global-private-message', (payload) => {
      if (!currentAccountId || !allow('global-private-message', 5, 10_000)) return;
      if (!payload || typeof payload.recipient !== 'string') {
        protocolError('INVALID_GLOBAL_PRIVATE_MESSAGE', 'Private message data is invalid.');
        return;
      }
      const parsedRecipient = readUsername(payload.recipient);
      const parsedText = readText(payload.text, { name: 'Private message', max: LIMITS.message });
      if (!parsedRecipient.ok || !parsedText.ok) {
        protocolError('INVALID_GLOBAL_PRIVATE_MESSAGE', parsedRecipient.error || parsedText.error);
        return;
      }
      const target = Array.from(accountProfiles.entries()).find(
        ([, profile]) => normalizeName(profile.username) === normalizeName(parsedRecipient.value),
      );
      if (!target) {
        protocolError('USER_NOT_FOUND', `User '${parsedRecipient.value}' is not online globally.`);
        return;
      }
      const messageId = crypto.randomUUID();
      const message = {
        id: messageId,
        messageId,
        authorId: currentAccountId,
        author: accountProfiles.get(currentAccountId)?.username || currentUsername,
        recipientId: target[0],
        recipient: target[1].username,
        text: parsedText.value,
        timestamp: Date.now(),
        private: true,
        profile: accountProfiles.get(currentAccountId) || null,
        reactions: {},
      };
      emitToAccount(target[0], 'global-message', message);
      if (target[0] !== currentAccountId) emitToAccount(currentAccountId, 'global-message', message);
      socket.emit('message-delivered', { messageId: message.messageId, private: true, channel: 'global' });
    });

    socket.on('profile-update', async (payload) => {
      if (!currentAccountId || !allow('profile-update', 4, 30_000)) return;
      const parsed = readProfile(payload);
      if (!parsed.ok) {
        protocolError('INVALID_PROFILE', parsed.error);
        return;
      }
      const profile = await socialStore.updateProfile(currentAccountId, parsed.value);
      if (!profile) return;
      accountProfiles.set(currentAccountId, profile);
      const room = rooms.get(currentGame);
      if (room?.has(socket.id)) {
        room.set(socket.id, {
          username: currentUsername,
          socketId: socket.id,
          accountId: currentAccountId,
          profile,
        });
        io.to(currentGame).emit('user-list', getUserList(currentGame));
      }
      socket.emit('profile-updated', profile);
      await refreshFriendPresence(currentAccountId);
      broadcastGlobalUsers();
    });

    socket.on('friend-request', async (value) => {
      if (!currentAccountId || !allow('friend-request', 3, 30_000)) return;
      const parsed = readFriendCode(value);
      if (!parsed.ok) {
        protocolError('INVALID_FRIEND_CODE', parsed.error);
        return;
      }
      const result = await socialStore.requestFriend(currentAccountId, parsed.value);
      if (!result.ok) {
        protocolError(result.code, result.error);
        return;
      }
      socket.emit('friend-request-sent', { to: result.to });
      emitToAccount(result.request.toId, 'friend-request-received', { from: result.from });
      await Promise.all([emitSocialUpdate(result.request.toId), emitSocialUpdate(result.request.fromId)]);
    });

    socket.on('friend-response', async (payload) => {
      if (!currentAccountId || !allow('friend-response', 6, 30_000)) return;
      if (!payload || typeof payload.requestId !== 'string' || typeof payload.accept !== 'boolean') {
        protocolError('INVALID_FRIEND_RESPONSE', 'Friend response is invalid.');
        return;
      }
      const result = await socialStore.respondToFriendRequest(currentAccountId, payload.requestId, payload.accept);
      if (!result.ok) {
        protocolError(result.code, result.error);
        return;
      }
      await Promise.all([emitSocialUpdate(result.request.fromId), emitSocialUpdate(result.request.toId)]);
    });

    socket.on('remove-friend', async (friendId) => {
      if (!currentAccountId || !allow('remove-friend', 5, 30_000) || typeof friendId !== 'string') return;
      const result = await socialStore.removeFriend(currentAccountId, friendId);
      if (!result.ok) {
        protocolError(result.code, result.error);
        return;
      }
      await Promise.all([emitSocialUpdate(currentAccountId), emitSocialUpdate(friendId)]);
      emitToAccount(currentAccountId, 'friend-removed', { friendId, friend: result.friend });
      emitToAccount(friendId, 'friend-removed', { friendId: currentAccountId });
    });

    socket.on('direct-history', async (friendId) => {
      if (!currentAccountId || typeof friendId !== 'string') return;
      const history = await socialStore.directHistory(currentAccountId, friendId);
      if (!history) {
        protocolError('NOT_FRIENDS', 'Direct messages are available between friends.');
        return;
      }
      const readAt = Number(history[history.length - 1]?.timestamp || Date.now());
      await socialStore.markDirectRead(currentAccountId, friendId, readAt);
      socket.emit('direct-history', { friendId, messages: history, readAt });
    });

    socket.on('direct-read', async (payload) => {
      if (!currentAccountId || !allow('direct-read', 30, 10_000)) return;
      if (!payload || typeof payload.friendId !== 'string') return;
      const readAt = Number(payload.readAt);
      if (!Number.isFinite(readAt) || readAt <= 0) return;
      await socialStore.markDirectRead(currentAccountId, payload.friendId, readAt);
    });

    socket.on('direct-message', async (payload) => {
      if (!currentAccountId || !allow('direct-message', 5, 10_000)) return;
      if (!payload || typeof payload.friendId !== 'string') {
        protocolError('INVALID_DIRECT_MESSAGE', 'Direct message is invalid.');
        return;
      }
      const parsed = readText(payload.text, { name: 'Direct message', max: LIMITS.message });
      if (!parsed.ok) {
        protocolError('INVALID_DIRECT_MESSAGE', parsed.error);
        return;
      }
      const message = await socialStore.addDirectMessage(currentAccountId, payload.friendId, parsed.value);
      if (!message) {
        protocolError('NOT_FRIENDS', 'Direct messages are available between friends.');
        return;
      }
      socket.emit('direct-message', message);
      emitToAccount(payload.friendId, 'direct-message', message);
    });

    socket.on('pin-message', (value) => {
      if (!requireJoined() || !allow('pin-message', 2, 30_000)) return;
      const parsed = readText(value, {
        name: 'Pinned message',
        max: LIMITS.pinnedMessage,
        allowEmpty: true,
      });
      if (!parsed.ok) {
        protocolError('INVALID_PIN', parsed.error);
        return;
      }
      roomPinned.set(currentGame, parsed.value || null);
      io.to(currentGame).emit('pinned-message', parsed.value || null);
    });

    socket.on('global-pin-message', (value) => {
      if (!currentAccountId || !allow('global-pin-message', 2, 30_000)) return;
      const parsed = readText(value, {
        name: 'Global pinned message',
        max: LIMITS.pinnedMessage,
        allowEmpty: true,
      });
      if (!parsed.ok) {
        protocolError('INVALID_PIN', parsed.error);
        return;
      }
      globalPinned = parsed.value || null;
      io.emit('global-pinned-message', globalPinned);
    });

    socket.on('typing-start', () => {
      if (!requireJoined() || !allow('typing-start', 8, 10_000)) return;
      socket.to(currentGame).emit('user-typing', { username: currentUsername, typing: true });
    });
    socket.on('typing-stop', () => {
      if (!requireJoined() || !allow('typing-stop', 8, 10_000)) return;
      socket.to(currentGame).emit('user-typing', { username: currentUsername, typing: false });
    });

    socket.on('typing-update', async (payload) => {
      if (!currentAccountId || !payload || typeof payload.typing !== 'boolean'
        || !['game', 'global', 'direct'].includes(payload.channel)
        || !allow('typing-update', 20, 10_000)) return;
      const update = {
        channel: payload.channel,
        userId: currentAccountId,
        username: payload.channel === 'game'
          ? currentUsername
          : (accountProfiles.get(currentAccountId)?.username || currentUsername),
        profile: accountProfiles.get(currentAccountId) || null,
        typing: payload.typing,
      };
      if (payload.channel === 'game') {
        if (!requireJoined()) return;
        socket.to(currentGame).emit('typing-update', update);
        return;
      }
      if (payload.channel === 'global') {
        socket.broadcast.emit('typing-update', update);
        return;
      }
      if (typeof payload.friendId !== 'string') return;
      const friendIds = await socialStore.friendIds(currentAccountId);
      if (!friendIds.includes(payload.friendId)) return;
      emitToAccount(payload.friendId, 'typing-update', { ...update, friendId: currentAccountId });
    });

    socket.on('request-online', () => {
      if (!requireJoined() || !allow('request-online', 4, 10_000)) return;
      socket.emit('online-list', getUserList(currentGame));
    });

    socket.on('request-global-online', () => {
      if (!currentAccountId || !allow('request-global-online', 4, 10_000)) return;
      socket.emit('global-online-list', getGlobalUserList());
    });

    socket.on('add-reaction', (payload) => {
      if (!requireJoined() || !allow('add-reaction', 12, 10_000)) return;
      if (!payload || typeof payload.messageId !== 'string'
        || payload.messageId.length > LIMITS.messageId
        || !ALLOWED_REACTIONS.has(payload.emoji)) {
        protocolError('INVALID_REACTION', 'Reaction is invalid.');
        return;
      }
      const message = (roomHistory.get(currentGame) || []).find((entry) => entry.messageId === payload.messageId);
      if (!message) {
        protocolError('MESSAGE_NOT_FOUND', 'That match message no longer exists.');
        return;
      }
      const reactions = roomReactions.get(currentGame);
      if (!reactions.has(payload.messageId)) reactions.set(payload.messageId, new Map());
      const messageReactions = reactions.get(payload.messageId);
      if (!messageReactions.has(payload.emoji)) messageReactions.set(payload.emoji, new Set());
      const voters = messageReactions.get(payload.emoji);
      voters.add(socket.id);
      message.reactions = { ...(message.reactions || {}), [payload.emoji]: voters.size };
      io.to(currentGame).emit('reaction-update', {
        messageId: payload.messageId,
        emoji: payload.emoji,
        count: voters.size,
      });
    });

    socket.on('add-global-reaction', async (payload) => {
      if (!currentAccountId || !allow('add-global-reaction', 12, 10_000)) return;
      if (!payload || typeof payload.messageId !== 'string'
        || payload.messageId.length > LIMITS.messageId
        || !ALLOWED_REACTIONS.has(payload.emoji)) {
        protocolError('INVALID_REACTION', 'Reaction is invalid.');
        return;
      }
      const reactions = await socialStore.addGlobalReaction(currentAccountId, payload.messageId, payload.emoji);
      if (!reactions) {
        protocolError('MESSAGE_NOT_FOUND', 'That global message no longer exists.');
        return;
      }
      io.emit('global-reaction-update', { messageId: payload.messageId, reactions });
    });

    socket.on('create-poll', (payload) => {
      if (!requireJoined() || !allow('create-poll', 2, 60_000)) return;
      const parsed = readPoll(payload);
      if (!parsed.ok) {
        protocolError('INVALID_POLL', parsed.error);
        return;
      }
      const polls = roomPolls.get(currentGame);
      if (polls.size >= LIMITS.activePolls) {
        protocolError('POLL_LIMIT', 'This game has too many active polls.');
        return;
      }
      const pollId = crypto.randomUUID();
      const poll = {
        id: pollId,
        question: parsed.value.question,
        options: parsed.value.options.map((option) => ({ option, votes: 0 })),
        votes: new Map(),
      };
      polls.set(pollId, poll);
      io.to(currentGame).emit('poll-created', {
        pollId,
        question: poll.question,
        options: poll.options,
      });
    });

    socket.on('create-global-poll', (payload) => {
      if (!currentAccountId || !allow('create-global-poll', 2, 60_000)) return;
      const parsed = readPoll(payload);
      if (!parsed.ok) {
        protocolError('INVALID_POLL', parsed.error);
        return;
      }
      if (globalPolls.size >= LIMITS.activePolls) {
        protocolError('POLL_LIMIT', 'Global chat has too many active polls.');
        return;
      }
      const pollId = crypto.randomUUID();
      const poll = {
        id: pollId,
        question: parsed.value.question,
        options: parsed.value.options.map((option) => ({ option, votes: 0 })),
        votes: new Map(),
      };
      globalPolls.set(pollId, poll);
      io.emit('global-poll-created', {
        pollId,
        question: poll.question,
        options: poll.options,
      });
      const expiry = setTimeout(() => {
        if (!globalPolls.delete(pollId)) return;
        io.emit('global-poll-closed', { pollId });
      }, GLOBAL_POLL_TTL_MS);
      expiry.unref?.();
    });

    socket.on('poll-vote', (payload) => {
      if (!requireJoined() || !allow('poll-vote', 8, 10_000)) return;
      if (!payload || typeof payload.pollId !== 'string' || !Number.isInteger(payload.optionIndex)) {
        protocolError('INVALID_VOTE', 'Poll vote is invalid.');
        return;
      }
      const poll = roomPolls.get(currentGame)?.get(payload.pollId);
      if (!poll || payload.optionIndex < 0 || payload.optionIndex >= poll.options.length) {
        protocolError('INVALID_VOTE', 'Poll or option does not exist.');
        return;
      }
      if (poll.votes.has(socket.id)) {
        poll.options[poll.votes.get(socket.id)].votes -= 1;
      }
      poll.votes.set(socket.id, payload.optionIndex);
      poll.options[payload.optionIndex].votes += 1;
      io.to(currentGame).emit('poll-update', {
        pollId: poll.id,
        options: poll.options.map(({ option, votes }) => ({ option, votes })),
      });
    });

    socket.on('global-poll-vote', (payload) => {
      if (!currentAccountId || !allow('global-poll-vote', 8, 10_000)) return;
      if (!payload || typeof payload.pollId !== 'string' || !Number.isInteger(payload.optionIndex)) {
        protocolError('INVALID_VOTE', 'Global poll vote is invalid.');
        return;
      }
      const poll = globalPolls.get(payload.pollId);
      if (!poll || payload.optionIndex < 0 || payload.optionIndex >= poll.options.length) {
        protocolError('INVALID_VOTE', 'Global poll or option does not exist.');
        return;
      }
      if (poll.votes.has(currentAccountId)) {
        poll.options[poll.votes.get(currentAccountId)].votes -= 1;
      }
      poll.votes.set(currentAccountId, payload.optionIndex);
      poll.options[payload.optionIndex].votes += 1;
      io.emit('global-poll-update', {
        pollId: poll.id,
        options: poll.options.map(({ option, votes }) => ({ option, votes })),
      });
    });

    socket.on('disconnect', () => {
      leaveCurrentRoom();
      if (currentAccountId) {
        const sockets = onlineAccounts.get(currentAccountId);
        if (sockets) {
          sockets.delete(socket.id);
          if (sockets.size === 0) {
            onlineAccounts.delete(currentAccountId);
            accountProfiles.delete(currentAccountId);
          }
        }
        refreshFriendPresence(currentAccountId).catch((error) => {
          console.error('[NexusChat] Failed to refresh friend presence', error);
        });
        broadcastGlobalUsers();
      }
      limiter.clear();
    });
  });

  return {
    app,
    io,
    server,
    state: {
      rooms,
      roomHistory,
      roomPolls,
      roomPinned,
      roomReactions,
      globalPolls,
      onlineAccounts,
      accountProfiles,
      socialStore,
    },
    version: packageJson.version,
    async start(port = 0) {
      await socialStore.ready;
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(Number(port), options.host || '127.0.0.1', () => {
          server.off('error', reject);
          resolve(server.address().port);
        });
      });
    },
    async stop() {
      await new Promise((resolve) => {
        io.close(() => {
          if (!server.listening) resolve();
          else server.close(() => resolve());
        });
      });
      await socialStore.close?.();
    },
  };
}

module.exports = { createNexusServer, originIsAllowed };
