const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { TursoSocialStore } = require('../src/server/turso-social-store');

test('Turso persists accounts, friendships and chat history across restarts', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-turso-'));
  const filePath = path.join(directory, 'social.db').replace(/\\/g, '/');
  const url = `file:${filePath}`;
  let second;
  t.after(async () => {
    try { await second?.close(); } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 20));
    try {
      fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    } catch (error) {
      if (error.code !== 'EPERM') throw error;
    }
  });

  const first = new TursoSocialStore({ url, authToken: 'local-test-token' });
  await first.ready;
  const alice = await first.register('Alice');
  const bob = await first.register('Bob');

  const request = await first.requestFriend(alice.user.id, bob.user.friendCode);
  assert.equal(request.ok, true);
  assert.equal((await first.respondToFriendRequest(bob.user.id, request.request.id, true)).ok, true);
  await first.addGlobalMessage(alice.user.id, 'persistent global');
  await first.addDirectMessage(alice.user.id, bob.user.id, 'persistent direct');
  await first.close();

  second = new TursoSocialStore({ url, authToken: 'local-test-token' });
  await second.ready;

  const aliceSnapshot = await second.snapshot(alice.user.id);
  assert.equal(aliceSnapshot.friends[0].username, 'Bob');
  assert.equal(aliceSnapshot.globalHistory[0].text, 'persistent global');
  assert.equal((await second.directHistory(alice.user.id, bob.user.id))[0].text, 'persistent direct');

  const stored = await second.client.execute({
    sql: 'SELECT token_hash FROM users WHERE id = ?',
    args: [alice.user.id],
  });
  assert.notEqual(String(stored.rows[0].token_hash), alice.token);
});
