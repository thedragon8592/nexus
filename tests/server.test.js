const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
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

function expectNoEvent(socket, event, wait = 150) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      resolve();
    }, wait);
    function handler(payload) {
      clearTimeout(timer);
      reject(new Error(`Unexpected ${event}: ${JSON.stringify(payload)}`));
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

  assert.equal(aliceJoin.socialSession.protocolVersion, 3);
  assert.equal(aliceJoin.socialSession.serverVersion, '3.7.0');
  assert.match(aliceJoin.socialSession.profile.friendCode, /^NX-[0-9A-F]{8}$/);
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
  assert.equal(nexus.state.socialStore.snapshot(bobJoin.socialSession.profile.id).friends[0].conversation.unreadCount, 1);

  const bobDirectHistory = nextEvent(bob, 'direct-history');
  bob.emit('direct-history', aliceJoin.socialSession.profile.id);
  const [bobHistoryPayload] = await bobDirectHistory;
  assert.equal(bobHistoryPayload.messages[0].text, 'secret hello');
  assert.ok(bobHistoryPayload.readAt >= direct.timestamp);
  assert.equal(nexus.state.socialStore.snapshot(bobJoin.socialSession.profile.id).friends[0].conversation.unreadCount, 0);

  const directHistory = nextEvent(alice, 'direct-history');
  alice.emit('direct-history', bobJoin.socialSession.profile.id);
  assert.equal((await directHistory)[0].messages[0].text, 'secret hello');
});

test('profiles, global private messages, reactions, typing and friend removal work together', async (t) => {
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
  const charlie = await createConnectedClient(url);
  clients.push(alice, bob, charlie);
  const aliceJoin = await join(alice, 'social-features', 'Alice');
  const bobJoin = await join(bob, 'social-features', 'Bob');
  await join(charlie, 'another-match', 'Charlie');

  const globalOnline = nextEvent(alice, 'global-online-list');
  alice.emit('request-global-online');
  assert.deepEqual((await globalOnline)[0].map((user) => user.username), ['Alice', 'Bob', 'Charlie']);

  const globalPin = nextEvent(bob, 'global-pinned-message');
  alice.emit('global-pin-message', 'Global rules');
  assert.equal((await globalPin)[0], 'Global rules');

  const globalPollCreated = nextEvent(bob, 'global-poll-created');
  alice.emit('create-global-poll', { question: 'Drop location?', options: ['Docks', 'Bank'] });
  const [globalPoll] = await globalPollCreated;
  assert.equal(globalPoll.question, 'Drop location?');
  const globalPollUpdated = nextEvent(alice, 'global-poll-update');
  bob.emit('global-poll-vote', { pollId: globalPoll.pollId, optionIndex: 1 });
  assert.equal((await globalPollUpdated)[0].options[1].votes, 1);

  const profileUpdated = nextEvent(alice, 'profile-updated');
  alice.emit('profile-update', { avatarUrl: 'https://example.com/alice.png', bio: 'Last survivor standing.' });
  const [profile] = await profileUpdated;
  assert.equal(profile.avatarUrl, 'https://example.com/alice.png');
  assert.equal(profile.bio, 'Last survivor standing.');
  assert.ok(profile.updatedAt >= aliceJoin.socialSession.profile.updatedAt);

  const globalMessageForAlice = nextEvent(alice, 'global-message');
  alice.emit('global-message', 'Hello @Bob');
  const [globalMessage] = await globalMessageForAlice;
  assert.equal(globalMessage.profile.bio, 'Last survivor standing.');

  const reactionUpdate = nextEvent(alice, 'global-reaction-update');
  bob.emit('add-global-reaction', { messageId: globalMessage.id, emoji: '🔥' });
  const [reaction] = await reactionUpdate;
  assert.equal(reaction.messageId, globalMessage.id);
  assert.equal(reaction.reactions['🔥'], 1);

  const alicePrivate = nextEvent(alice, 'global-message');
  const bobPrivate = nextEvent(bob, 'global-message');
  const charliePrivate = expectNoEvent(charlie, 'global-message');
  alice.emit('global-private-message', { recipient: 'Bob', text: 'Global secret' });
  const [[privateEcho], [privateIncoming]] = await Promise.all([alicePrivate, bobPrivate, charliePrivate]);
  assert.equal(privateEcho.private, true);
  assert.equal(privateIncoming.recipientId, bobJoin.socialSession.profile.id);

  const typing = nextEvent(bob, 'typing-update');
  alice.emit('typing-update', { channel: 'global', typing: true });
  const [typingUpdate] = await typing;
  assert.equal(typingUpdate.channel, 'global');
  assert.equal(typingUpdate.userId, aliceJoin.socialSession.profile.id);

  const requestUpdate = nextEvent(bob, 'social-update');
  alice.emit('friend-request', bobJoin.socialSession.profile.friendCode);
  const [pending] = await requestUpdate;
  const aliceFriends = nextEvent(alice, 'social-update');
  const bobFriends = nextEvent(bob, 'social-update');
  bob.emit('friend-response', { requestId: pending.requests[0].id, accept: true });
  await Promise.all([aliceFriends, bobFriends]);

  const aliceRemoved = nextEvent(alice, 'social-update');
  const bobRemoved = nextEvent(bob, 'social-update');
  alice.emit('remove-friend', bobJoin.socialSession.profile.id);
  const [[aliceAfterRemoval], [bobAfterRemoval]] = await Promise.all([aliceRemoved, bobRemoved]);
  assert.deepEqual(aliceAfterRemoval.friends, []);
  assert.deepEqual(bobAfterRemoval.friends, []);
});

test('outgoing friend requests are visible and can be cancelled', async (t) => {
  const nexus = createNexusServer({ dataFile: null });
  const port = await nexus.start(0);
  const url = `http://127.0.0.1:${port}`;
  const alice = await createConnectedClient(url);
  const bob = await createConnectedClient(url);
  t.after(async () => {
    alice.disconnect();
    bob.disconnect();
    await nexus.stop();
  });

  const aliceJoin = await join(alice, 'request-cancel', 'Alice');
  const bobJoin = await join(bob, 'request-cancel', 'Bob');
  const sentEvent = nextEvent(alice, 'friend-request-sent');
  const alicePending = nextEvent(alice, 'social-update');
  const bobPending = nextEvent(bob, 'social-update');
  alice.emit('friend-request', bobJoin.socialSession.profile.friendCode);
  const [[sent], [aliceSocial], [bobSocial]] = await Promise.all([sentEvent, alicePending, bobPending]);
  assert.equal(aliceSocial.sentRequests[0].id, sent.requestId);
  assert.equal(bobSocial.requests[0].from.id, aliceJoin.socialSession.profile.id);

  const cancelledEvent = nextEvent(alice, 'friend-request-cancelled');
  const aliceCancelled = nextEvent(alice, 'social-update');
  const bobCancelled = nextEvent(bob, 'social-update');
  alice.emit('cancel-friend-request', sent.requestId);
  const [[cancelled], [aliceAfter], [bobAfter]] = await Promise.all([cancelledEvent, aliceCancelled, bobCancelled]);
  assert.equal(cancelled.requestId, sent.requestId);
  assert.deepEqual(aliceAfter.sentRequests, []);
  assert.deepEqual(bobAfter.requests, []);
});

test('match reactions are restored in history and typing stays inside the match', async (t) => {
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
  const outsider = await createConnectedClient(url);
  clients.push(alice, bob, outsider);
  await join(alice, 'reaction-match', 'Alice');
  await join(bob, 'reaction-match', 'Bob');
  await join(outsider, 'other-match', 'Outsider');

  const incoming = nextEvent(bob, 'chat-message');
  alice.emit('chat-message', { text: 'React to this' });
  const [message] = await incoming;
  const reactionUpdate = nextEvent(alice, 'reaction-update');
  bob.emit('add-reaction', { messageId: message.messageId, emoji: '👍' });
  assert.equal((await reactionUpdate)[0].count, 1);

  const newcomer = await createConnectedClient(url);
  clients.push(newcomer);
  const newcomerJoin = await join(newcomer, 'reaction-match', 'Newcomer');
  assert.equal(newcomerJoin.messages[0].reactions['👍'], 1);

  const typing = nextEvent(bob, 'typing-update');
  const outsiderTyping = expectNoEvent(outsider, 'typing-update');
  alice.emit('typing-update', { channel: 'game', typing: true });
  assert.equal((await typing)[0].channel, 'game');
  await outsiderTyping;
});

test('versioned public assets are served without stale caching', async (t) => {
  const nexus = createNexusServer({ dataFile: null });
  const port = await nexus.start(0);
  const url = `http://127.0.0.1:${port}`;
  t.after(() => nexus.stop());

  const healthResponse = await fetch(`${url}/health`);
  assert.equal(healthResponse.headers.get('x-frame-options'), 'DENY');
  assert.match(healthResponse.headers.get('permissions-policy'), /camera=\(\)/);
  const health = await healthResponse.json();
  assert.equal(health.version, '3.7.0');

  for (const path of ['/client.js', '/optimizer-early.js', '/optimizer-core.js', '/nexus-chat.user.js', '/nexus-optimizer.user.js']) {
    const response = await fetch(`${url}${path}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert.match(response.headers.get('content-type'), /javascript/);
  }

  const client = await fetch(`${url}/client.js`).then((response) => response.text());
  assert.match(client, /const EXT_VERSION = '3\.7\.0'/);
  assert.match(client, /raw\.githubusercontent\.com\/thedragon8592\/nexus\/main\/public\/version\.json/);
  assert.match(client, /setInterval\(checkForUpdate, UPDATE_CHECK_INTERVAL_MS\)/);
  assert.match(client, /nx-update-ready/);
  assert.match(client, /CLIENT_DISTRIBUTION/);
  assert.match(client, /Update on Greasy Fork/);
  assert.match(client, /Open update page/);
  assert.match(client, /greasyfork\.org\/es\/scripts\/584741-nexus-chat/);
  assert.match(client, /https:\/\/nexus-chat-free\.onrender\.com/);
  assert.match(client, /data-settings-page="diagnostics"/);
  assert.match(client, /theme-ocean/);
  assert.match(client, /theme-ember/);
  assert.match(client, /theme-orchid/);
  assert.match(client, /\^NX-\[0-9A-F\]\{6,8\}\$/);
  assert.match(client, /global-private-message/);
  assert.match(client, /function preparePrivateMessage/);
  assert.match(client, /Change your name in the game/);
  assert.match(client, /incomingVersion < currentVersion/);
  assert.doesNotMatch(client, /emit\('change-username'/);
  assert.match(client, /window\.NexusOptimizer/);
  assert.match(client, /showOptimizationProgress/);
  assert.match(client, /nx-chat-dimmed/);
  assert.match(client, /sharedAudioContext/);
  assert.match(client, /sharedAudioFilter/);
  assert.match(client, /function unlockAudio/);
  assert.match(client, /sharedAudioContext\.state !== 'running'/);
  assert.match(client, /reconnectionAttempts: Infinity/);
  assert.match(client, /MESSAGE_COOLDOWN_MS = 2000/);
  assert.match(client, /function attachKillLeaderObserver/);
  assert.match(client, /FIRE_GIF_URL/);
  assert.match(client, /cancel-friend-request/);
  assert.match(client, /250 words/);
  assert.match(client, /OPTIMIZER_MODE_LABELS/);
  assert.match(client, /data-optimizer-setting/);
  assert.match(client, /Input→frame p95/);
  assert.doesNotMatch(client, /PERFORMANCE_PROFILES/);
  assert.doesNotMatch(client, /data-nexus-performance/);
  assert.doesNotMatch(client, /observer\.observe\(document\.body/);
  assert.doesNotMatch(client, /waitForKillLeaderElements/);
  assert.doesNotMatch(client, /getEntriesByType\('resource'\)/);
  assert.match(client, /batchRenderDepth/);
  assert.match(client, /directConversationMeta/);
  assert.match(client, /emit\('direct-read'/);
  assert.doesNotMatch(client, /Reload the game to apply/);
  assert.match(client, /add-global-reaction/);
  assert.match(client, /profile-update/);
  assert.match(client, /data-remove-friend/);
  assert.match(client, /create-global-poll/);
  assert.match(client, /global-pin-message/);
  assert.match(client, /activeChannel === 'direct' \? \(selectedFriend \? \[selectedFriend\] : \[\]\)/);
  assert.match(client, /data-mention=/);
  assert.match(client, /containsMention/);
  assert.match(client, /split\(\/\\s\+\/\).*join\('\\\\s\+'\)/);
  assert.match(client, /mention: \[\[620/);
  assert.match(client, /playSound\('navigate'\)/);
  assert.doesNotMatch(client, /Configuración de Nexus/);

  const userscript = await fetch(`${url}/nexus-chat.user.js`).then((response) => response.text());
  assert.match(userscript, /@version\s+3\.7\.0/);
  assert.match(userscript, /clientType: 'userscript'/);
  assert.match(userscript, /installedVersion: LOADER_VERSION/);
  assert.match(userscript, /live performance optimizer/);
  assert.match(userscript, /nexus-chat-free\.onrender\.com/);
  assert.match(userscript, /nx-bootstrap-loader/);
  assert.match(userscript, /optimizer-early\.js/);
  assert.match(userscript, /optimizer-core\.js/);
  assert.doesNotMatch(userscript, /overlay\.id = 'nx-game-loader'/);

  const optimizerCore = await fetch(`${url}/optimizer-core.js`).then((response) => response.text());
  const optimizerEarly = await fetch(`${url}/optimizer-early.js`).then((response) => response.text());
  const compatibilityLoader = await fetch(`${url}/nexus-optimizer.user.js`).then((response) => response.text());
  assert.match(optimizerCore, /window\.NexusOptimizer/);
  assert.match(optimizerCore, /keepInterpolation: false/);
  assert.match(optimizerCore, /localRotation = true/);
  assert.match(optimizerCore, /inputP95/);
  assert.doesNotMatch(optimizerCore, /attachShadow|nxo-extension-root|createPanel/);
  assert.match(optimizerEarly, /gameConfig\.localRotation = true/);
  assert.match(compatibilityLoader, /Nexus Optimizer Compatibility Loader/);
  assert.doesNotMatch(compatibilityLoader, /createPanel|nxo-launcher/);

  const preview = await fetch(`${url}/preview?gameId=optimizer-preview`).then((response) => response.text());
  assert.match(preview, /src="\/optimizer-early\.js"/);
  assert.match(preview, /src="\/optimizer-core\.js"/);
});

test('the packaged browser extension is synchronized with the web client', () => {
  const projectRoot = path.resolve(__dirname, '..');
  const client = fs.readFileSync(path.join(projectRoot, 'public', 'client.js'), 'utf8');
  const extensionClient = fs.readFileSync(path.join(projectRoot, 'extension', 'nexus-chat.js'), 'utf8');
  const optimizerCore = fs.readFileSync(path.join(projectRoot, 'public', 'optimizer-core.js'), 'utf8');
  const extensionOptimizerCore = fs.readFileSync(path.join(projectRoot, 'extension', 'optimizer-core.js'), 'utf8');
  const optimizerEarly = fs.readFileSync(path.join(projectRoot, 'public', 'optimizer-early.js'), 'utf8');
  const extensionOptimizerEarly = fs.readFileSync(path.join(projectRoot, 'extension', 'optimizer-early.js'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'extension', 'manifest.json'), 'utf8'));
  assert.equal(extensionClient, client);
  assert.equal(extensionOptimizerCore, optimizerCore);
  assert.equal(extensionOptimizerEarly, optimizerEarly);
  assert.equal(manifest.version, '3.7.0');
  assert.deepEqual(manifest.host_permissions, [
    'https://nexus-chat-free.onrender.com/*',
    'https://raw.githubusercontent.com/thedragon8592/nexus/*',
  ]);
  assert.deepEqual(manifest.permissions, ['declarativeNetRequest']);
  assert.equal(manifest.background.service_worker, 'background.js');
  assert.equal(manifest.content_scripts[0].world, 'MAIN');
  assert.deepEqual(manifest.content_scripts[0].js, ['optimizer-early.js']);
  assert.deepEqual(manifest.content_scripts[1].js, ['optimizer-core.js', 'socket.io.min.js', 'nexus-chat.js']);
  assert.equal(manifest.content_scripts[0].all_frames, false);
  assert.ok(fs.existsSync(path.join(projectRoot, 'extension', 'interceptor.js')));
  assert.ok(fs.existsSync(path.join(projectRoot, 'extension', 'socket.io.min.js')));
  assert.ok(fs.existsSync(path.join(projectRoot, 'extension', 'background.js')));
  assert.ok(fs.existsSync(path.join(projectRoot, 'extension', 'rules', 'lean-resurviv.json')));
  assert.ok(fs.existsSync(path.join(projectRoot, 'extension', 'rules', 'lean-survev.json')));
});
