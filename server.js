const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

io.on('connection', (socket) => {
  socket.on('join', (gameId) => {
    if (socket.data.room) socket.leave(socket.data.room);
    socket.join(gameId);
    socket.data.room = gameId;
    socket.to(gameId).emit('system-message', 'A player joined the chat');
  });

  socket.on('chat-message', (payload) => {
    const room = socket.data.room;
    if (!room) return;
    // Enviar a todos (el cliente filtra privados)
    io.to(room).emit('chat-message', payload);
  });

  socket.on('disconnect', () => {
    const room = socket.data.room;
    if (room) {
      socket.to(room).emit('system-message', 'A player left the chat');
    }
  });
});

app.get('/', (req, res) => res.send('Nexus Chat Server is running'));

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
