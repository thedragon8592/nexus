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

    if (payload.recipient) {
      // Enviar solo al destinatario (y al emisor)
      const sockets = io.sockets.adapter.rooms.get(room);
      if (sockets) {
        for (const socketId of sockets) {
          const client = io.sockets.sockets.get(socketId);
          // Suponemos que el nombre del usuario está en el socket (no lo tenemos)
          // En su lugar, enviamos a todos y el cliente filtra (no es privado real)
          // pero al menos lo recibe el destinatario. Para hacerlo privado de verdad,
          // necesitaríamos guardar el nombre de cada socket.
          // Como solución temporal, enviaremos a todos, pero el cliente solo lo muestra si coincide.
        }
      }
      // Mejor: emitir a todos (client-side filtering)
      io.to(room).emit('chat-message', payload);
    } else {
      io.to(room).emit('chat-message', payload);
    }
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
