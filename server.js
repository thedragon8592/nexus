const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const rooms = new Map();
const roomHistory = new Map();
const roomPolls = new Map();
const roomPinned = new Map();

function normalizeName(name) {
  return name.trim().toLowerCase();
}

function getUserList(gameId) {
  const room = rooms.get(gameId);
  if (!room) return [];
  return Array.from(room.values()).map(entry => entry.username);
}

// Servir client.js con CORS abierto (sin restricción de origen)
app.get('/client.js', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.sendFile(__dirname + '/public/client.js');
});

io.on('connection', (socket) => {
  let currentGame = null;
  let currentUsername = null;

  socket.on('join', ({ gameId, username }) => {
    if (!gameId || !username) return;

    const room = rooms.get(gameId) || new Map();
    const normalizedNew = normalizeName(username);
    const duplicate = Array.from(room.entries()).find(
      ([id, u]) => id !== socket.id && normalizeName(u.username) === normalizedNew
    );
    if (duplicate) {
      socket.emit('system-message', '❌ That name is already taken in this game.');
      return;
    }

    if (currentGame) {
      socket.leave(currentGame);
      const oldRoom = rooms.get(currentGame);
      if (oldRoom) {
        oldRoom.delete(socket.id);
        if (oldRoom.size === 0) rooms.delete(currentGame);
        else {
          socket.to(currentGame).emit('system-message', `${currentUsername} left the chat.`);
          io.to(currentGame).emit('user-list', getUserList(currentGame));
        }
      }
    }

    socket.join(gameId);
    currentGame = gameId;
    currentUsername = username;

    if (!rooms.has(gameId)) rooms.set(gameId, new Map());
    rooms.get(gameId).set(socket.id, { username, color: null });

    if (!roomHistory.has(gameId)) roomHistory.set(gameId, []);
    if (!roomPolls.has(gameId)) roomPolls.set(gameId, new Map());
    if (!roomPinned.has(gameId)) roomPinned.set(gameId, null);

    socket.emit('chat-history', roomHistory.get(gameId));
    if (roomPinned.get(gameId)) {
      socket.emit('pinned-message', roomPinned.get(gameId));
    }

    socket.to(gameId).emit('system-message', `${username} joined the chat.`);
    io.to(gameId).emit('user-list', getUserList(gameId));
  });

  socket.on('change-username', (newUsername) => {
    if (!currentGame || !newUsername) return;
    const room = rooms.get(currentGame);
    if (!room) return;

    const normalizedNew = normalizeName(newUsername);
    for (const [id, entry] of room.entries()) {
      if (id !== socket.id && normalizeName(entry.username) === normalizedNew) {
        socket.emit('system-message', `❌ Name '${newUsername}' is already taken.`);
        socket.emit('username-change-rejected', { rejectedName: newUsername });
        return;
      }
    }

    const oldName = currentUsername;
    currentUsername = newUsername;
    const existingEntry = room.get(socket.id) || {};
    room.set(socket.id, { username: newUsername, color: existingEntry.color || null });

    socket.emit('system-message', `✅ Your name is now ${newUsername}.`);
    socket.emit('username-change-accepted', { newUsername });
    socket.to(currentGame).emit('system-message', `${oldName} changed their name to ${newUsername}.`);
    io.to(currentGame).emit('user-list', getUserList(currentGame));
  });

  socket.on('chat-message', (payload) => {
    if (!currentGame) return;
    payload.author = currentUsername;

    const messageId = crypto.randomUUID
      ? crypto.randomUUID()
      : Date.now() + '-' + Math.random().toString(36).substring(2, 9);
    payload.messageId = messageId;

    const history = roomHistory.get(currentGame) || [];
    history.push({ ...payload, timestamp: payload.timestamp || Date.now() });
    if (history.length > 50) history.shift();
    roomHistory.set(currentGame, history);

    socket.emit('message-delivered', { messageId });

    if (payload.recipient) {
      const userMap = rooms.get(currentGame);
      if (!userMap) return;
      const normalizedRecipient = normalizeName(payload.recipient);
      let targetSocketId = null;
      for (const [id, entry] of userMap.entries()) {
        if (normalizeName(entry.username) === normalizedRecipient) {
          targetSocketId = id;
          break;
        }
      }
      if (targetSocketId) {
        io.to(targetSocketId).emit('chat-message', payload);
        if (targetSocketId !== socket.id) {
          socket.emit('chat-message', payload);
        }
      } else {
        const available = getUserList(currentGame).join(', ');
        socket.emit('system-message', `❌ User '${payload.recipient}' not found. Online: ${available}`);
      }
      return;
    }

    io.to(currentGame).emit('chat-message', payload);
  });

  socket.on('pin-message', (text) => {
    if (!currentGame) return;
    roomPinned.set(currentGame, text);
    io.to(currentGame).emit('pinned-message', text);
  });

  socket.on('typing-start', () => {
    if (!currentGame) return;
    socket.to(currentGame).emit('user-typing', { username: currentUsername, typing: true });
  });
  socket.on('typing-stop', () => {
    if (!currentGame) return;
    socket.to(currentGame).emit('user-typing', { username: currentUsername, typing: false });
  });

  socket.on('request-online', () => {
    if (!currentGame) return;
    socket.emit('online-list', getUserList(currentGame));
  });

  socket.on('add-reaction', ({ messageId, emoji }) => {
    if (!currentGame) return;
    io.to(currentGame).emit('reaction-update', { messageId, emoji });
  });

  socket.on('create-poll', ({ question, options }) => {
    if (!currentGame) return;
    const polls = roomPolls.get(currentGame) || new Map();
    const pollId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36);
    const poll = {
      id: pollId,
      question,
      options: options.map(opt => ({ option: opt, votes: 0 })),
      votes: new Map()
    };
    polls.set(pollId, poll);
    roomPolls.set(currentGame, polls);
    io.to(currentGame).emit('poll-created', { pollId, question, options: poll.options });
  });

  socket.on('poll-vote', ({ pollId, optionIndex }) => {
    if (!currentGame) return;
    const polls = roomPolls.get(currentGame);
    if (!polls) return;
    const poll = polls.get(pollId);
    if (!poll) return;
    if (poll.votes.has(socket.id)) {
      const prevIdx = poll.votes.get(socket.id);
      if (prevIdx >= 0 && prevIdx < poll.options.length) poll.options[prevIdx].votes--;
    }
    poll.votes.set(socket.id, optionIndex);
    if (optionIndex >= 0 && optionIndex < poll.options.length) poll.options[optionIndex].votes++;
    io.to(currentGame).emit('poll-update', {
      pollId,
      options: poll.options.map(opt => ({ option: opt.option, votes: opt.votes }))
    });
  });

  socket.on('disconnect', () => {
    if (currentGame) {
      const userMap = rooms.get(currentGame);
      if (userMap) {
        userMap.delete(socket.id);
        if (userMap.size === 0) rooms.delete(currentGame);
        else {
          socket.to(currentGame).emit('system-message', `${currentUsername} left the chat.`);
          io.to(currentGame).emit('user-list', getUserList(currentGame));
        }
      }
    }
  });
});

app.get('/', (req, res) => res.send('Nexus Chat Server v11 is running'));

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
