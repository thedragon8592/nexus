const test = require('node:test');
const assert = require('node:assert/strict');
const { io: createClient } = require('socket.io-client');
const { createNexusServer } = require('../src/server/create-server');

function nextEvent(socket, event, timeout = 1500) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeout);
    function handler(...args) {
      clearTimeout(timer);
      resolve(args);
    }
    socket.once(event, handler);
  });
}

async function createConnectedClient(url) {
  const socket = createClient(url, {
    forceNew: true,
    reconnection: false,
    transports: ['websocket'],
  });
  await nextEvent(socket, 'connect');
  return socket;
}

async function join(socket, gameId, username) {
  const accepted = nextEvent(socket, 'join-accepted');
  const history = nextEvent(socket, 'chat-history');
  const social = nextEvent(socket, 'social-session');
  socket.emit('join', { gameId, username });
  const [[joinData], [messages], [socialSession]] = await Promise.all([accepted, history, social]);
  return { joinData, messages, socialSession };
}

test('public chat uses server identity and enters public history', async (t) => {
  const nexus = createNexusServer({ dataFile: null });
  const port = await nexus.start(0);
  const url = `http://127.0.0.1:${port}`;
  const clients = [];
  t.after(async () => {
    clients.forEach((socket) => socket.disconnect());
    await nexus.stop();
  });

  const alice = await createConnectedClient(url);
  const bob = await createConnectedClient(url);
  clients.push(alice, bob);
  await join(alice, 'game-public', 'Alice');
  await join(bob, 'game-public', 'Bob');

  const incoming = nextEvent(bob, 'chat-message');
  alice.emit('chat-message', { author: 'Spoofed', text: 'hello', kills: 4, authorColor: '#123456' });
  const [message] = await incoming;
  assert.equal(message.author, 'Alice');
  assert.equal(message.text, 'hello');
  assert.equal(message.kills, 4);

  const charlie = await createConnectedClient(url);
  clients.push(charlie);
  const { messages } = await join(charlie, 'game-public', 'Charlie');
  assert.equal(messages.length, 1);
  assert.equal(messages[0].text, 'hello');
});

test('private messages are delivered only to participants and never enter public history', async (t) => {
  const nexus = createNexusServer({ dataFile: null });
  const port = await nexus.start(0);
  const url = `http://127.0.0.1:${port}`;
  const clients = [];
  t.after(async () => {
    clients.forEach((socket) => socket.disconnect());
    await nexus.stop();
  });

  const alice = await createConnectedClient(url);
  const bob = await createConnectedClient(url);
  clients.push(alice, bob);
  await join(alice, 'game-private', 'Alice');
  await join(bob, 'game-private', 'Bob');

  const receivedByBob = nextEvent(bob, 'chat-message');
  const echoedToAlice = nextEvent(alice, 'chat-message');
  alice.emit('chat-message', { text: 'secret', recipient: 'Bob' });
  const [[bobMessage], [aliceMessage]] = await Promise.all([receivedByBob, echoedToAlice]);
  assert.equal(bobMessage.text, 'secret');
  assert.equal(aliceMessage.recipient, 'Bob');

  const charlie = await createConnectedClient(url);
  clients.push(charlie);
  const { messages } = await join(charlie, 'game-private', 'Charlie');
  assert.deepEqual(messages, []);
});

test('duplicate names and malformed events are rejected without stopping the server', async (t) => {
  const nexus = createNexusServer({ dataFile: null });
  const port = await nexus.start(0);
  const url = `http://127.0.0.1:${port}`;
  const clients = [];
  t.after(async () => {
    clients.forEach((socket) => socket.disconnect());
    await nexus.stop();
  });

  const alice = await createConnectedClient(url);
  const duplicate = await createConnectedClient(url);
  clients.push(alice, duplicate);
  await join(alice, 'safe-game', 'Alice');

  const duplicateError = nextEvent(duplicate, 'protocol-error');
  duplicate.emit('join', { gameId: 'safe-game', username: ' alice ' });
  assert.equal((await duplicateError)[0].code, 'NAME_TAKEN');

  const malformedError = nextEvent(alice, 'protocol-error');
  alice.emit('chat-message', null);
  assert.equal((await malformedError)[0].code, 'INVALID_MESSAGE');

  const health = await fetch(`${url}/health`).then((response) => response.json());
  assert.equal(health.status, 'ok');
  assert.equal(health.onlineUsers, 1);
});

test('ephemeral room data is removed after the final disconnect', async (t) => {
  const nexus = createNexusServer({ dataFile: null });
  const port = await nexus.start(0);
  const url = `http://127.0.0.1:${port}`;
  t.after(() => nexus.stop());

  const alice = await createConnectedClient(url);
  await join(alice, 'cleanup-game', 'Alice');
  alice.emit('pin-message', 'temporary');
  alice.disconnect();
  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.equal(nexus.state.rooms.size, 0);
  assert.equal(nexus.state.roomHistory.size, 0);
  assert.equal(nexus.state.roomPolls.size, 0);
  assert.equal(nexus.state.roomPinned.size, 0);
  assert.equal(nexus.state.roomReactions.size, 0);
});

test('social accounts support global chat, friend requests and direct messages', async (t) => {
  const nexus = createNexusServer({ dataFile: null });
  const port = await nexus.start(0);
  const url = `http://127.0.0.1:${port}`;
  const clients = [];
  t.after(async () => {
    clients.forEach((socket) => socket.disconnect());
    await nexus.stop();
  });

  const alice = await createConnectedClient(url);
  const bob = await createConnectedClient(url);
  clients.push(alice, bob);
  const aliceJoin = await join(alice, 'social-game', 'Alice');
  const bobJoin = await join(bob, 'social-game', 'Bob');

  assert.match(aliceJoin.socialSession.profile.friendCode, /^NX-[0-9A-F]{6}$/);
  assert.ok(aliceJoin.socialSession.token);

  const requestReceived = nextEvent(bob, 'friend-request-received');
  const requestSent = nextEvent(alice, 'friend-request-sent');
  const bobUpdate = nextEvent(bob, 'social-update');
  alice.emit('friend-request', bobJoin.socialSession.profile.friendCode);
  await Promise.all([requestReceived, requestSent]);
  const [pending] = await bobUpdate;
  assert.equal(pending.requests.length, 1);

  const aliceFriends = nextEvent(alice, 'social-update');
  const bobFriends = nextEvent(bob, 'social-update');
  bob.emit('friend-response', { requestId: pending.requests[0].id, accept: true });
  const [[aliceSocial], [bobSocial]] = await Promise.all([aliceFriends, bobFriends]);
  assert.equal(aliceSocial.friends[0].username, 'Bob');
  assert.equal(bobSocial.friends[0].username, 'Alice');

  const globalIncoming = nextEvent(bob, 'global-message');
  alice.emit('global-message', 'hello world');
  assert.equal((await globalIncoming)[0].text, 'hello world');

  const directIncoming = nextEvent(bob, 'direct-message');
  alice.emit('direct-message', { friendId: bobJoin.socialSession.profile.id, text: 'secret hello' });
  const direct = (await directIncoming)[0];
  assert.equal(direct.author, 'Alice');

  const directHistory = nextEvent(alice, 'direct-history');
  alice.emit('direct-history', bobJoin.socialSession.profile.id);
  assert.equal((await directHistory)[0].messages[0].text, 'secret hello');
});
