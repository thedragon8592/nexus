const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { SocialStore, createAccessToken } = require('../src/server/social-store');

test('social data survives a store restart without persisting raw access tokens', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-social-'));
  const filePath = path.join(directory, 'social.json');
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const first = new SocialStore(filePath);
  const registration = await first.register('PersistentPlayer');
  const publicProfile = await first.updateUsername(registration.user.id, 'PersistentPlayer');
  assert.equal(publicProfile.tokenHash, undefined);
  await first.addGlobalMessage(registration.user.id, 'saved message');

  const raw = fs.readFileSync(filePath, 'utf8');
  assert.equal(raw.includes(registration.token), false);

  const second = new SocialStore(filePath);
  const authenticated = second.findByToken(registration.token);
  assert.equal(authenticated.username, 'PersistentPlayer');
  assert.equal(second.data.globalMessages[0].text, 'saved message');
});

test('a recovery key derives the same Nexus ID without server storage', async () => {
  const token = createAccessToken();
  const first = new SocialStore(null);
  const second = new SocialStore(null);

  const initial = await first.register('FirstName', token);
  const restored = await second.register('ChangedName', token);

  assert.equal(restored.user.id, initial.user.id);
  assert.equal(restored.user.friendCode, initial.user.friendCode);
  assert.notEqual(restored.user.username, initial.user.username);
});

test('offline direct messages expose persistent unread counts and recent conversation order', async () => {
  const store = new SocialStore(null);
  const alice = await store.register('Alice');
  const bob = await store.register('Bob');
  const charlie = await store.register('Charlie');

  for (const friend of [bob, charlie]) {
    const request = await store.requestFriend(alice.user.id, friend.user.friendCode);
    assert.equal(request.ok, true);
    assert.equal((await store.respondToFriendRequest(friend.user.id, request.request.id, true)).ok, true);
  }

  await store.addDirectMessage(bob.user.id, alice.user.id, 'from Bob while offline');
  await new Promise((resolve) => setTimeout(resolve, 2));
  await store.addDirectMessage(charlie.user.id, alice.user.id, 'newest offline message');

  const snapshot = store.snapshot(alice.user.id);
  assert.equal(snapshot.friends[0].username, 'Charlie');
  assert.equal(snapshot.friends[0].conversation.unreadCount, 1);
  assert.equal(snapshot.friends[1].conversation.unreadCount, 1);
  assert.equal(snapshot.friends[0].conversation.lastMessageText, 'newest offline message');

  const bobHistory = store.directHistory(alice.user.id, bob.user.id);
  assert.equal(await store.markDirectRead(alice.user.id, bob.user.id, bobHistory.at(-1).timestamp), true);
  const afterRead = store.snapshot(alice.user.id);
  assert.equal(afterRead.friends.find((friend) => friend.id === bob.user.id).conversation.unreadCount, 0);
  assert.equal(afterRead.friends.find((friend) => friend.id === charlie.user.id).conversation.unreadCount, 1);
});

test('sent friend requests can be cancelled and old direct messages use the current name', async () => {
  const store = new SocialStore(null);
  const alice = await store.register('Alice');
  const bob = await store.register('Bob');

  const pending = await store.requestFriend(alice.user.id, bob.user.friendCode);
  assert.equal(store.snapshot(alice.user.id).sentRequests[0].to.username, 'Bob');
  assert.equal(await store.cancelFriendRequest(alice.user.id, pending.request.id).then((result) => result.ok), true);
  assert.deepEqual(store.snapshot(alice.user.id).sentRequests, []);
  assert.deepEqual(store.snapshot(bob.user.id).requests, []);

  const accepted = await store.requestFriend(alice.user.id, bob.user.friendCode);
  await store.respondToFriendRequest(bob.user.id, accepted.request.id, true);
  await store.addDirectMessage(alice.user.id, bob.user.id, 'remember my current name');
  await store.updateUsername(alice.user.id, 'AliceNew');
  assert.equal(store.directHistory(bob.user.id, alice.user.id)[0].author, 'AliceNew');
});
