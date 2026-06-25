const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const rooms = new Map();

io.on('connection', (socket) => {
  console.log('🔌 Conectado:', socket.id);

  socket.on('join', (gameId) => {
    if (!gameId) return;
    const prevRoom = socket.data.room;
    if (prevRoom) {
      socket.leave(prevRoom);
      const set = rooms.get(prevRoom);
      if (set) {
        set.delete(socket.id);
        if (set.size === 0) rooms.delete(prevRoom);
      }
    }
    socket.join(gameId);
    socket.data.room = gameId;
    if (!rooms.has(gameId)) rooms.set(gameId, new Set());
    rooms.get(gameId).add(socket.id);
    socket.to(gameId).emit('system-message', 'Un jugador se ha conectado.');
  });

  socket.on('chat-message', (payload) => {
    const gameId = socket.data.room;
    if (!gameId) return;
    if (!payload || typeof payload.author !== 'string' || typeof payload.text !== 'string') return;
    if (payload.text.length > 150) payload.text = payload.text.slice(0, 150);
    io.to(gameId).emit('chat-message', payload);
  });

  socket.on('disconnect', () => {
    const gameId = socket.data.room;
    if (gameId) {
      const set = rooms.get(gameId);
      if (set) {
        set.delete(socket.id);
        if (set.size === 0) rooms.delete(gameId);
        socket.to(gameId).emit('system-message', 'Un jugador ha abandonado el chat.');
      }
    }
    console.log('❌ Desconectado:', socket.id);
  });
});

app.get('/', (req, res) => res.send('Nexus Chat Server running!'));

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor en puerto ${PORT}`);
});