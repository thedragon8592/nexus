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
  socket.emit('join', { gameId, username });
  const [[joinData], [messages]] = await Promise.all([accepted, history]);
  return { joinData, messages };
}

test('public chat uses server identity and enters public history', async (t) => {
  const nexus = createNexusServer();
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
  const nexus = createNexusServer();
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
  const nexus = createNexusServer();
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
  const nexus = createNexusServer();
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
