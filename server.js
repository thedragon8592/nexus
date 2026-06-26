const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto'); // para generar IDs únicos

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const rooms = new Map(); // gameId -> Map(socketId, username)

function normalizeName(name) {
  return name.trim().toLowerCase();
}

io.on('connection', (socket) => {
  let currentGame = null;
  let currentUsername = null;

  socket.on('join', ({ gameId, username }) => {
    if (!gameId || !username) return;

    const room = rooms.get(gameId) || new Map();
    // Comprobar nombre duplicado (insensible a mayúsculas/minúsculas)
    const lowerNames = Array.from(room.values()).map(n => normalizeName(n));
    if (lowerNames.includes(normalizeName(username))) {
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

  // Cambio de nombre
  socket.on('change-username', (newUsername) => {
    if (!currentGame || !newUsername) return;
    const room = rooms.get(currentGame);
    if (!room) return;
    const normalizedNew = normalizeName(newUsername);
    // Verificar si ya existe (excluyendo al propio usuario)
    for (const [id, name] of room.entries()) {
      if (id !== socket.id && normalizeName(name) === normalizedNew) {
        socket.emit('system-message', `❌ Name '${newUsername}' is already taken.`);
        return;
      }
    }
    // Nombre válido
    const oldName = currentUsername;
    currentUsername = newUsername;
    room.set(socket.id, newUsername);
    socket.emit('system-message', `✅ Your name is now ${newUsername}.`);
    socket.to(currentGame).emit('system-message', `${oldName} changed their name to ${newUsername}.`);
    io.to(currentGame).emit('user-list', Array.from(room.values()));
  });

  socket.on('chat-message', (payload) => {
    const room = currentGame;
    if (!room) return;

    // Generar un ID único para este mensaje
    const messageId = crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).substring(2,9);
    payload.messageId = messageId;

    // Mensaje privado
    if (payload.recipient) {
      const userMap = rooms.get(room);
      if (!userMap) return;
      // Buscar destinatario normalizando
      let targetSocketId = null;
      for (const [id, name] of userMap.entries()) {
        if (normalizeName(name) === normalizeName(payload.recipient)) {
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
    socket.to(room).emit('reaction-update', { messageId, emoji });
    socket.emit('reaction-update', { messageId, emoji });
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
