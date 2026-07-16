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
    this.writeQueue = Promise.resolve();
    this.data = { version: 1, users: {}, friendRequests: {}, globalMessages: [], directMessages: {} };
    this.load();
  }

  load() {
    if (!this.filePath || !fs.existsSync(this.filePath)) return;
    const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
    if (!parsed || typeof parsed !== 'object') throw new Error('Invalid social data file.');
    this.data = {
      version: 1,
      users: parsed.users || {},
      friendRequests: parsed.friendRequests || {},
      globalMessages: Array.isArray(parsed.globalMessages) ? parsed.globalMessages : [],
      directMessages: parsed.directMessages || {},
    };
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
    return { id: user.id, username: user.username, friendCode: user.friendCode, createdAt: user.createdAt };
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
      tokenHash: hashToken(token), friendIds: [], createdAt: Date.now(), updatedAt: Date.now(),
    };
    this.data.users[user.id] = user;
    await this.save();
    return { token, user };
  }

  async ensureIdentity(token, username) {
    const existing = this.findByToken(token);
    if (existing) {
      await this.updateUsername(existing.id, username);
      return { token: null, user: existing, restored: false };
    }
    const registration = await this.register(username, token);
    return { ...registration, restored: isAccessToken(token) };
  }

  async updateUsername(userId, username) {
    const user = this.data.users[userId];
    if (!user || user.username === username) return user || null;
    user.username = username;
    user.updatedAt = Date.now();
    await this.save();
    return user;
  }

  snapshot(userId, onlineIds = new Set()) {
    const user = this.data.users[userId];
    if (!user) return null;
    const friends = user.friendIds.map((id) => this.data.users[id]).filter(Boolean)
      .map((friend) => ({ ...this.publicUser(friend), online: onlineIds.has(friend.id) }));
    const requests = Object.values(this.data.friendRequests)
      .filter((request) => request.toId === userId && request.status === 'pending')
      .map((request) => ({ id: request.id, from: this.publicUser(this.data.users[request.fromId]), createdAt: request.createdAt }));
    return { profile: this.publicUser(user), friends, requests, globalHistory: this.data.globalMessages.slice(-MAX_GLOBAL_HISTORY) };
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

  async addGlobalMessage(userId, text) {
    const user = this.data.users[userId];
    if (!user) return null;
    const message = { id: crypto.randomUUID(), authorId: user.id, author: user.username, text, timestamp: Date.now() };
    this.data.globalMessages.push(message);
    this.data.globalMessages = this.data.globalMessages.slice(-MAX_GLOBAL_HISTORY);
    await this.save();
    return message;
  }

  conversationKey(firstId, secondId) { return [firstId, secondId].sort().join(':'); }

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
}

module.exports = {
  SocialStore,
  createAccessToken,
  deterministicIdentity,
  hashToken,
  isAccessToken,
  normalizeFriendCode,
};
