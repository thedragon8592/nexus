const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const rooms = new Map(); // gameId -> Map(socketId, username)

io.on('connection', (socket) => {
  let currentGame = null;
  let currentUsername = null;

  socket.on('join', ({ gameId, username }) => {
    if (!gameId || !username) return;

    // Comprobar nombre duplicado (insensible a mayúsculas)
    const room = rooms.get(gameId) || new Map();
    const lowerNames = Array.from(room.values()).map(n => n.toLowerCase());
    if (lowerNames.includes(username.toLowerCase())) {
      socket.emit('system-message', '❌ That name is already taken in this game.');
      return;
    }

    if (currentGame) {
      socket.leave(currentGame);
      const oldRoom = rooms.get(currentGame);
      if (oldRoom) {
        oldRoom.delete(socket.id);
        if (oldRoom.size === 0) rooms.delete(currentGame);
      }
    }

    socket.join(gameId);
    currentGame = gameId;
    currentUsername = username;

    if (!rooms.has(gameId)) rooms.set(gameId, new Map());
    rooms.get(gameId).set(socket.id, username);

    socket.to(gameId).emit('system-message', `${username} joined the chat.`);
    io.to(gameId).emit('user-list', Array.from(rooms.get(gameId).values()));
  });

  socket.on('chat-message', (payload) => {
    const room = currentGame;
    if (!room) return;

    // Mensaje privado
    if (payload.recipient) {
      const userMap = rooms.get(room);
      if (!userMap) return;
      // Búsqueda insensible a mayúsculas
      let targetSocketId = null;
      for (const [id, name] of userMap.entries()) {
        if (name.toLowerCase() === payload.recipient.toLowerCase()) {
          targetSocketId = id;
          break;
        }
      }
      if (targetSocketId) {
        io.to(targetSocketId).emit('chat-message', payload);
        socket.emit('chat-message', payload);
      } else {
        socket.emit('system-message', `❌ User '${payload.recipient}' not found.`);
      }
      return;
    }

    // Mensaje público
    io.to(room).emit('chat-message', payload);
  });

  socket.on('request-online', () => {
    const room = currentGame;
    if (!room) return;
    const userMap = rooms.get(room);
    if (userMap) {
      socket.emit('online-list', Array.from(userMap.values()));
    }
  });

  socket.on('add-reaction', ({ messageId, emoji }) => {
    const room = currentGame;
    if (!room) return;
    socket.to(room).emit('reaction-update', { messageId, emoji, from: currentUsername });
    socket.emit('reaction-update', { messageId, emoji, from: currentUsername });
  });

  socket.on('disconnect', () => {
    if (currentGame) {
      const userMap = rooms.get(currentGame);
      if (userMap) {
        userMap.delete(socket.id);
        if (userMap.size === 0) rooms.delete(currentGame);
        else {
          socket.to(currentGame).emit('system-message', `${currentUsername} left the chat.`);
          io.to(currentGame).emit('user-list', Array.from(userMap.values()));
        }
      }
    }
  });
});

app.get('/', (req, res) => res.send('Nexus Chat Server is running'));

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
