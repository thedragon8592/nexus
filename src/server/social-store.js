const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const MAX_GLOBAL_HISTORY = 100;
const MAX_DIRECT_HISTORY = 100;
const ACCESS_TOKEN_PATTERN = /^(?:NXR-)?[A-Za-z0-9_-]{40,160}$/;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function normalizeFriendCode(value) {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function createAccessToken() {
  return `NXR-${crypto.randomBytes(32).toString('base64url')}`;
}

function isAccessToken(token) {
  return typeof token === 'string' && ACCESS_TOKEN_PATTERN.test(token);
}

function deterministicIdentity(token) {
  const digest = crypto.createHash('sha256').update(`nexus-account-v1:${token}`).digest('hex');
  return {
    id: `nx_${digest.slice(0, 32)}`,
    friendCode: `NX-${digest.slice(32, 40).toUpperCase()}`,
  };
}

class SocialStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.kind = filePath ? 'file' : 'memory';
    this.ready = Promise.resolve();
    this.writeQueue = Promise.resolve();
    this.data = {
      version: 3,
      users: {},
      friendRequests: {},
      globalMessages: [],
      globalReactions: {},
      directMessages: {},
      directReadAt: {},
    };
    this.load();
  }

  load() {
    if (!this.filePath || !fs.existsSync(this.filePath)) return;
    const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
    if (!parsed || typeof parsed !== 'object') throw new Error('Invalid social data file.');
    this.data = {
      version: 3,
      users: parsed.users || {},
      friendRequests: parsed.friendRequests || {},
      globalMessages: Array.isArray(parsed.globalMessages) ? parsed.globalMessages : [],
      globalReactions: parsed.globalReactions || {},
      directMessages: parsed.directMessages || {},
      directReadAt: parsed.directReadAt || {},
    };
    Object.values(this.data.users).forEach((user) => {
      user.avatarUrl = typeof user.avatarUrl === 'string' ? user.avatarUrl : '';
      user.bio = typeof user.bio === 'string' ? user.bio : '';
    });
  }

  save() {
    if (!this.filePath) return Promise.resolve();
    const snapshot = JSON.stringify(this.data, null, 2);
    const directory = path.dirname(this.filePath);
    const temporary = `${this.filePath}.tmp`;
    this.writeQueue = this.writeQueue.then(async () => {
      await fs.promises.mkdir(directory, { recursive: true });
      await fs.promises.writeFile(temporary, snapshot, { encoding: 'utf8', mode: 0o600 });
      await fs.promises.rename(temporary, this.filePath);
    });
    return this.writeQueue;
  }

  publicUser(user) {
    return {
      id: user.id,
      username: user.username,
      friendCode: user.friendCode,
      avatarUrl: user.avatarUrl || '',
      bio: user.bio || '',
      createdAt: user.createdAt,
      updatedAt: user.updatedAt || user.createdAt,
    };
  }

  findByToken(token) {
    if (!isAccessToken(token)) return null;
    const tokenHash = hashToken(token);
    return Object.values(this.data.users).find((user) => user.tokenHash === tokenHash) || null;
  }

  findByFriendCode(code) {
    const normalized = normalizeFriendCode(code);
    return Object.values(this.data.users).find((user) => user.friendCode === normalized) || null;
  }

  uniqueFriendCode(preferred) {
    if (preferred && !this.findByFriendCode(preferred)) return preferred;
    let code;
    do code = `NX-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    while (this.findByFriendCode(code));
    return code;
  }

  async register(username, requestedToken) {
    const token = isAccessToken(requestedToken) ? requestedToken : createAccessToken();
    const identity = deterministicIdentity(token);
    const existing = this.data.users[identity.id];
    if (existing && existing.tokenHash === hashToken(token)) return { token, user: existing };
    const user = {
      id: identity.id, username, friendCode: this.uniqueFriendCode(identity.friendCode),
      tokenHash: hashToken(token), friendIds: [], avatarUrl: '', bio: '', createdAt: Date.now(), updatedAt: Date.now(),
    };
    this.data.users[user.id] = user;
    await this.save();
    return { token, user };
  }

  async ensureIdentity(token, username) {
    const existing = this.findByToken(token);
    if (existing) {
      const user = await this.updateUsername(existing.id, username);
      return { token: null, user, restored: false };
    }
    const registration = await this.register(username, token);
    return { ...registration, restored: isAccessToken(token) };
  }

  async updateUsername(userId, username) {
    const user = this.data.users[userId];
    if (!user) return null;
    if (user.username === username) return this.publicUser(user);
    user.username = username;
    user.updatedAt = Date.now();
    await this.save();
    return this.publicUser(user);
  }

  async updateProfile(userId, profile) {
    const user = this.data.users[userId];
    if (!user) return null;
    user.avatarUrl = profile.avatarUrl || '';
    user.bio = profile.bio || '';
    user.updatedAt = Date.now();
    await this.save();
    return this.publicUser(user);
  }

  globalReactionCounts(messageId) {
    const reactions = this.data.globalReactions[messageId] || {};
    return Object.fromEntries(Object.entries(reactions).map(([emoji, userIds]) => [emoji, userIds.length]));
  }

  snapshot(userId, onlineIds = new Set()) {
    const user = this.data.users[userId];
    if (!user) return null;
    const friends = user.friendIds.map((id) => this.data.users[id]).filter(Boolean)
      .map((friend) => {
        const history = this.data.directMessages[this.conversationKey(userId, friend.id)] || [];
        const lastMessage = history[history.length - 1] || null;
        const readAt = Number(this.data.directReadAt[this.directReadKey(userId, friend.id)] || 0);
        const unreadCount = history.reduce((count, message) => (
          message.toId === userId && Number(message.timestamp) > readAt ? count + 1 : count
        ), 0);
        return {
          ...this.publicUser(friend),
          online: onlineIds.has(friend.id),
          conversation: {
            unreadCount,
            lastMessageAt: Number(lastMessage?.timestamp || 0),
            lastMessageText: lastMessage?.text || '',
            lastMessageFromId: lastMessage?.fromId || '',
          },
        };
      })
      .sort((first, second) => Number(second.conversation.lastMessageAt) - Number(first.conversation.lastMessageAt)
        || first.username.localeCompare(second.username));
    const requests = Object.values(this.data.friendRequests)
      .filter((request) => request.toId === userId && request.status === 'pending')
      .map((request) => ({ id: request.id, from: this.publicUser(this.data.users[request.fromId]), createdAt: request.createdAt }));
    const globalHistory = this.data.globalMessages.slice(-MAX_GLOBAL_HISTORY).map((message) => {
      const author = this.data.users[message.authorId];
      return {
        ...message,
        author: author?.username || message.author,
        profile: author ? this.publicUser(author) : null,
        reactions: this.globalReactionCounts(message.id),
      };
    });
    return { profile: this.publicUser(user), friends, requests, globalHistory };
  }

  friendIds(userId) {
    return this.data.users[userId]?.friendIds || [];
  }

  async requestFriend(fromId, friendCode) {
    const from = this.data.users[fromId];
    const to = this.findByFriendCode(friendCode);
    if (!from || !to) return { ok: false, code: 'FRIEND_NOT_FOUND', error: 'Friend code not found.' };
    if (from.id === to.id) return { ok: false, code: 'SELF_REQUEST', error: 'You cannot add yourself.' };
    if (from.friendIds.includes(to.id)) return { ok: false, code: 'ALREADY_FRIENDS', error: 'You are already friends.' };
    const duplicate = Object.values(this.data.friendRequests).find((request) => request.status === 'pending'
      && ((request.fromId === from.id && request.toId === to.id) || (request.fromId === to.id && request.toId === from.id)));
    if (duplicate) return { ok: false, code: 'REQUEST_EXISTS', error: 'A friend request is already pending.' };
    const request = { id: crypto.randomUUID(), fromId: from.id, toId: to.id, status: 'pending', createdAt: Date.now() };
    this.data.friendRequests[request.id] = request;
    await this.save();
    return { ok: true, request, from: this.publicUser(from), to: this.publicUser(to) };
  }

  async respondToFriendRequest(userId, requestId, accept) {
    const request = this.data.friendRequests[requestId];
    if (!request || request.toId !== userId || request.status !== 'pending') {
      return { ok: false, code: 'REQUEST_NOT_FOUND', error: 'Friend request not found.' };
    }
    request.status = accept ? 'accepted' : 'declined';
    request.updatedAt = Date.now();
    if (accept) {
      const from = this.data.users[request.fromId];
      const to = this.data.users[request.toId];
      if (!from.friendIds.includes(to.id)) from.friendIds.push(to.id);
      if (!to.friendIds.includes(from.id)) to.friendIds.push(from.id);
    }
    await this.save();
    return { ok: true, request };
  }

  async removeFriend(userId, friendId) {
    const user = this.data.users[userId];
    const friend = this.data.users[friendId];
    if (!user || !friend || !user.friendIds.includes(friendId)) {
      return { ok: false, code: 'FRIEND_NOT_FOUND', error: 'This user is not in your friends list.' };
    }
    user.friendIds = user.friendIds.filter((id) => id !== friendId);
    friend.friendIds = friend.friendIds.filter((id) => id !== userId);
    user.updatedAt = Date.now();
    friend.updatedAt = Date.now();
    await this.save();
    return { ok: true, friend: this.publicUser(friend) };
  }

  async addGlobalMessage(userId, text) {
    const user = this.data.users[userId];
    if (!user) return null;
    const message = {
      id: crypto.randomUUID(),
      authorId: user.id,
      author: user.username,
      text,
      timestamp: Date.now(),
      profile: this.publicUser(user),
      reactions: {},
    };
    this.data.globalMessages.push(message);
    this.data.globalMessages = this.data.globalMessages.slice(-MAX_GLOBAL_HISTORY);
    const activeMessageIds = new Set(this.data.globalMessages.map((item) => item.id));
    Object.keys(this.data.globalReactions).forEach((messageId) => {
      if (!activeMessageIds.has(messageId)) delete this.data.globalReactions[messageId];
    });
    await this.save();
    return message;
  }

  conversationKey(firstId, secondId) { return [firstId, secondId].sort().join(':'); }

  directReadKey(userId, friendId) { return `${userId}>${friendId}`; }

  directHistory(userId, friendId) {
    const user = this.data.users[userId];
    if (!user || !user.friendIds.includes(friendId)) return null;
    return (this.data.directMessages[this.conversationKey(userId, friendId)] || []).slice(-MAX_DIRECT_HISTORY);
  }

  async addDirectMessage(fromId, toId, text) {
    const from = this.data.users[fromId];
    const to = this.data.users[toId];
    if (!from || !to || !from.friendIds.includes(toId)) return null;
    const message = { id: crypto.randomUUID(), fromId, toId, author: from.username, text, timestamp: Date.now() };
    const key = this.conversationKey(fromId, toId);
    const history = this.data.directMessages[key] || [];
    history.push(message);
    this.data.directMessages[key] = history.slice(-MAX_DIRECT_HISTORY);
    await this.save();
    return message;
  }

  async markDirectRead(userId, friendId, readAt = Date.now()) {
    const user = this.data.users[userId];
    if (!user || !user.friendIds.includes(friendId)) return false;
    const key = this.directReadKey(userId, friendId);
    this.data.directReadAt[key] = Math.max(Number(this.data.directReadAt[key] || 0), Number(readAt) || 0);
    await this.save();
    return true;
  }

  async addGlobalReaction(userId, messageId, emoji) {
    if (!this.data.users[userId] || !this.data.globalMessages.some((message) => message.id === messageId)) return null;
    const messageReactions = this.data.globalReactions[messageId] || {};
    const userIds = messageReactions[emoji] || [];
    if (!userIds.includes(userId)) userIds.push(userId);
    messageReactions[emoji] = userIds;
    this.data.globalReactions[messageId] = messageReactions;
    await this.save();
    return this.globalReactionCounts(messageId);
  }

  async close() {}
}

module.exports = {
  SocialStore,
  createAccessToken,
  deterministicIdentity,
  hashToken,
  isAccessToken,
  normalizeFriendCode,
};
