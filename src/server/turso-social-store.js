const crypto = require('crypto');
const { createClient } = require('@libsql/client');
const {
  createAccessToken,
  deterministicIdentity,
  hashToken,
  isAccessToken,
  normalizeFriendCode,
} = require('./social-store');

const MAX_GLOBAL_HISTORY = 100;
const MAX_DIRECT_HISTORY = 100;

function publicUser(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    username: String(row.username),
    friendCode: String(row.friend_code),
    createdAt: Number(row.created_at),
  };
}

function conversationKey(firstId, secondId) {
  return [firstId, secondId].sort().join(':');
}

class TursoSocialStore {
  constructor({ url, authToken, client } = {}) {
    if (!client && (!url || !authToken)) {
      throw new Error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be configured together.');
    }
    this.client = client || createClient({ url, authToken });
    this.kind = url?.startsWith('file:') ? 'libsql-local' : 'turso';
    this.ready = this.migrate();
  }

  async migrate() {
    await this.client.batch([
      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        friend_code TEXT NOT NULL UNIQUE,
        token_hash TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS friendships (
        user_id TEXT NOT NULL,
        friend_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, friend_id)
      )`,
      `CREATE TABLE IF NOT EXISTS friend_requests (
        id TEXT PRIMARY KEY,
        from_id TEXT NOT NULL,
        to_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'declined')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER
      )`,
      `CREATE TABLE IF NOT EXISTS global_messages (
        id TEXT PRIMARY KEY,
        author_id TEXT NOT NULL,
        author TEXT NOT NULL,
        text TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS direct_messages (
        id TEXT PRIMARY KEY,
        conversation_key TEXT NOT NULL,
        from_id TEXT NOT NULL,
        to_id TEXT NOT NULL,
        author TEXT NOT NULL,
        text TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      )`,
      'CREATE INDEX IF NOT EXISTS idx_friendships_user ON friendships(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_requests_recipient ON friend_requests(to_id, status, created_at)',
      'CREATE INDEX IF NOT EXISTS idx_requests_pair ON friend_requests(from_id, to_id, status)',
      'CREATE INDEX IF NOT EXISTS idx_global_messages_time ON global_messages(timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_direct_messages_conversation ON direct_messages(conversation_key, timestamp)',
    ], 'write');
  }

  async findById(userId, executor = this.client) {
    const result = await executor.execute({
      sql: 'SELECT * FROM users WHERE id = ? LIMIT 1',
      args: [userId],
    });
    return result.rows[0] || null;
  }

  async findByToken(token, executor = this.client) {
    if (!isAccessToken(token)) return null;
    await this.ready;
    const result = await executor.execute({
      sql: 'SELECT * FROM users WHERE token_hash = ? LIMIT 1',
      args: [hashToken(token)],
    });
    return result.rows[0] || null;
  }

  async findByFriendCode(code, executor = this.client) {
    const result = await executor.execute({
      sql: 'SELECT * FROM users WHERE friend_code = ? LIMIT 1',
      args: [normalizeFriendCode(code)],
    });
    return result.rows[0] || null;
  }

  async uniqueFriendCode(preferred, executor = this.client) {
    if (preferred && !(await this.findByFriendCode(preferred, executor))) return preferred;
    let code;
    do code = `NX-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    while (await this.findByFriendCode(code, executor));
    return code;
  }

  async register(username, requestedToken) {
    await this.ready;
    const token = isAccessToken(requestedToken) ? requestedToken : createAccessToken();
    const identity = deterministicIdentity(token);
    const existing = await this.findById(identity.id);
    if (existing && String(existing.token_hash) === hashToken(token)) {
      return { token, user: publicUser(existing) };
    }
    const now = Date.now();
    const friendCode = await this.uniqueFriendCode(identity.friendCode);
    await this.client.execute({
      sql: `INSERT INTO users (id, username, friend_code, token_hash, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [identity.id, username, friendCode, hashToken(token), now, now],
    });
    return {
      token,
      user: { id: identity.id, username, friendCode, createdAt: now },
    };
  }

  async ensureIdentity(token, username) {
    const existing = await this.findByToken(token);
    if (existing) {
      const user = await this.updateUsername(String(existing.id), username);
      return { token: null, user, restored: false };
    }
    const registration = await this.register(username, token);
    return { ...registration, restored: isAccessToken(token) };
  }

  async updateUsername(userId, username) {
    await this.ready;
    await this.client.execute({
      sql: 'UPDATE users SET username = ?, updated_at = ? WHERE id = ?',
      args: [username, Date.now(), userId],
    });
    return publicUser(await this.findById(userId));
  }

  async friendIds(userId) {
    await this.ready;
    const result = await this.client.execute({
      sql: 'SELECT friend_id FROM friendships WHERE user_id = ?',
      args: [userId],
    });
    return result.rows.map((row) => String(row.friend_id));
  }

  async snapshot(userId, onlineIds = new Set()) {
    await this.ready;
    const [userRow, friendsResult, requestsResult, globalResult] = await Promise.all([
      this.findById(userId),
      this.client.execute({
        sql: `SELECT u.* FROM friendships f
              JOIN users u ON u.id = f.friend_id
              WHERE f.user_id = ? ORDER BY lower(u.username), u.id`,
        args: [userId],
      }),
      this.client.execute({
        sql: `SELECT r.id, r.created_at, u.id AS from_id, u.username AS from_username,
                     u.friend_code AS from_friend_code, u.created_at AS from_created_at
              FROM friend_requests r
              JOIN users u ON u.id = r.from_id
              WHERE r.to_id = ? AND r.status = 'pending'
              ORDER BY r.created_at`,
        args: [userId],
      }),
      this.client.execute({
        sql: `SELECT id, author_id, author, text, timestamp FROM global_messages
              ORDER BY timestamp DESC, rowid DESC LIMIT ?`,
        args: [MAX_GLOBAL_HISTORY],
      }),
    ]);
    if (!userRow) return null;
    const friends = friendsResult.rows.map((row) => ({
      ...publicUser(row),
      online: onlineIds.has(String(row.id)),
    }));
    const requests = requestsResult.rows.map((row) => ({
      id: String(row.id),
      from: {
        id: String(row.from_id),
        username: String(row.from_username),
        friendCode: String(row.from_friend_code),
        createdAt: Number(row.from_created_at),
      },
      createdAt: Number(row.created_at),
    }));
    const globalHistory = globalResult.rows.reverse().map((row) => ({
      id: String(row.id),
      authorId: String(row.author_id),
      author: String(row.author),
      text: String(row.text),
      timestamp: Number(row.timestamp),
    }));
    return { profile: publicUser(userRow), friends, requests, globalHistory };
  }

  async requestFriend(fromId, friendCode) {
    await this.ready;
    const transaction = await this.client.transaction('write');
    try {
      const from = await this.findById(fromId, transaction);
      const to = await this.findByFriendCode(friendCode, transaction);
      if (!from || !to) {
        await transaction.rollback();
        return { ok: false, code: 'FRIEND_NOT_FOUND', error: 'Friend code not found.' };
      }
      if (String(from.id) === String(to.id)) {
        await transaction.rollback();
        return { ok: false, code: 'SELF_REQUEST', error: 'You cannot add yourself.' };
      }
      const existing = await transaction.execute({
        sql: 'SELECT 1 FROM friendships WHERE user_id = ? AND friend_id = ? LIMIT 1',
        args: [fromId, String(to.id)],
      });
      if (existing.rows.length) {
        await transaction.rollback();
        return { ok: false, code: 'ALREADY_FRIENDS', error: 'You are already friends.' };
      }
      const duplicate = await transaction.execute({
        sql: `SELECT 1 FROM friend_requests WHERE status = 'pending'
              AND ((from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)) LIMIT 1`,
        args: [fromId, String(to.id), String(to.id), fromId],
      });
      if (duplicate.rows.length) {
        await transaction.rollback();
        return { ok: false, code: 'REQUEST_EXISTS', error: 'A friend request is already pending.' };
      }
      const request = {
        id: crypto.randomUUID(), fromId, toId: String(to.id), status: 'pending', createdAt: Date.now(),
      };
      await transaction.execute({
        sql: `INSERT INTO friend_requests (id, from_id, to_id, status, created_at)
              VALUES (?, ?, ?, 'pending', ?)`,
        args: [request.id, request.fromId, request.toId, request.createdAt],
      });
      await transaction.commit();
      return { ok: true, request, from: publicUser(from), to: publicUser(to) };
    } catch (error) {
      try { await transaction.rollback(); } catch (_) {}
      throw error;
    }
  }

  async respondToFriendRequest(userId, requestId, accept) {
    await this.ready;
    const transaction = await this.client.transaction('write');
    try {
      const result = await transaction.execute({
        sql: `SELECT id, from_id, to_id, status, created_at FROM friend_requests
              WHERE id = ? AND to_id = ? AND status = 'pending' LIMIT 1`,
        args: [requestId, userId],
      });
      const row = result.rows[0];
      if (!row) {
        await transaction.rollback();
        return { ok: false, code: 'REQUEST_NOT_FOUND', error: 'Friend request not found.' };
      }
      const now = Date.now();
      const status = accept ? 'accepted' : 'declined';
      await transaction.execute({
        sql: 'UPDATE friend_requests SET status = ?, updated_at = ? WHERE id = ?',
        args: [status, now, requestId],
      });
      if (accept) {
        await transaction.execute({
          sql: 'INSERT OR IGNORE INTO friendships (user_id, friend_id, created_at) VALUES (?, ?, ?)',
          args: [String(row.from_id), String(row.to_id), now],
        });
        await transaction.execute({
          sql: 'INSERT OR IGNORE INTO friendships (user_id, friend_id, created_at) VALUES (?, ?, ?)',
          args: [String(row.to_id), String(row.from_id), now],
        });
      }
      await transaction.commit();
      return {
        ok: true,
        request: {
          id: String(row.id), fromId: String(row.from_id), toId: String(row.to_id),
          status, createdAt: Number(row.created_at), updatedAt: now,
        },
      };
    } catch (error) {
      try { await transaction.rollback(); } catch (_) {}
      throw error;
    }
  }

  async addGlobalMessage(userId, text) {
    await this.ready;
    const user = await this.findById(userId);
    if (!user) return null;
    const message = {
      id: crypto.randomUUID(), authorId: userId, author: String(user.username), text, timestamp: Date.now(),
    };
    await this.client.batch([
      {
        sql: `INSERT INTO global_messages (id, author_id, author, text, timestamp)
              VALUES (?, ?, ?, ?, ?)`,
        args: [message.id, message.authorId, message.author, message.text, message.timestamp],
      },
      {
        sql: `DELETE FROM global_messages WHERE id NOT IN
              (SELECT id FROM global_messages ORDER BY timestamp DESC, rowid DESC LIMIT ?)`,
        args: [MAX_GLOBAL_HISTORY],
      },
    ], 'write');
    return message;
  }

  async directHistory(userId, friendId) {
    await this.ready;
    const friendship = await this.client.execute({
      sql: 'SELECT 1 FROM friendships WHERE user_id = ? AND friend_id = ? LIMIT 1',
      args: [userId, friendId],
    });
    if (!friendship.rows.length) return null;
    const result = await this.client.execute({
      sql: `SELECT id, from_id, to_id, author, text, timestamp FROM direct_messages
            WHERE conversation_key = ? ORDER BY timestamp DESC, rowid DESC LIMIT ?`,
      args: [conversationKey(userId, friendId), MAX_DIRECT_HISTORY],
    });
    return result.rows.reverse().map((row) => ({
      id: String(row.id),
      fromId: String(row.from_id),
      toId: String(row.to_id),
      author: String(row.author),
      text: String(row.text),
      timestamp: Number(row.timestamp),
    }));
  }

  async addDirectMessage(fromId, toId, text) {
    await this.ready;
    const [from, to, friendship] = await Promise.all([
      this.findById(fromId),
      this.findById(toId),
      this.client.execute({
        sql: 'SELECT 1 FROM friendships WHERE user_id = ? AND friend_id = ? LIMIT 1',
        args: [fromId, toId],
      }),
    ]);
    if (!from || !to || !friendship.rows.length) return null;
    const key = conversationKey(fromId, toId);
    const message = {
      id: crypto.randomUUID(), fromId, toId, author: String(from.username), text, timestamp: Date.now(),
    };
    await this.client.batch([
      {
        sql: `INSERT INTO direct_messages
              (id, conversation_key, from_id, to_id, author, text, timestamp)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [message.id, key, fromId, toId, message.author, text, message.timestamp],
      },
      {
        sql: `DELETE FROM direct_messages WHERE conversation_key = ? AND id NOT IN
              (SELECT id FROM direct_messages WHERE conversation_key = ?
               ORDER BY timestamp DESC, rowid DESC LIMIT ?)`,
        args: [key, key, MAX_DIRECT_HISTORY],
      },
    ], 'write');
    return message;
  }

  async close() {
    this.client.close();
  }
}

module.exports = { TursoSocialStore };
