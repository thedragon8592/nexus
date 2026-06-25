const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// Almacén de salas: gameId -> Map(socketId -> username)
const rooms = new Map();

io.on('connection', (socket) => {
  let currentGame = null;
  let currentUsername = null;

  socket.on('join', ({ gameId, username }) => {
    if (!gameId || !username) return;

    // Comprobar nombre duplicado en la sala
    const room = rooms.get(gameId) || new Map();
    if (Array.from(room.values()).includes(username)) {
      socket.emit('system-message', '❌ That name is already taken in this game.');
      return;
    }

    // Salir de sala anterior
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

    // Enviar lista de usuarios a todos (para /online)
    const userList = Array.from(rooms.get(gameId).values());
    io.to(gameId).emit('user-list', userList);
  });

  // Mensaje normal o privado
  socket.on('chat-message', (payload) => {
    const room = currentGame;
    if (!room) return;

    // Mensaje privado
    if (payload.recipient) {
      const userMap = rooms.get(room);
      if (!userMap) return;
      // Buscar el socket del destinatario por nombre
      let targetSocketId = null;
      for (const [id, name] of userMap.entries()) {
        if (name === payload.recipient) {
          targetSocketId = id;
          break;
        }
      }
      if (targetSocketId) {
        // Enviar al destinatario y al emisor
        io.to(targetSocketId).emit('chat-message', payload);
        socket.emit('chat-message', payload); // para que el emisor lo vea
      } else {
        socket.emit('system-message', `❌ User '${payload.recipient}' not found.`);
      }
      return;
    }

    // Mensaje público
    io.to(room).emit('chat-message', payload);
  });

  // Comando /online
  socket.on('request-online', () => {
    const room = currentGame;
    if (!room) return;
    const userMap = rooms.get(room);
    if (userMap) {
      socket.emit('online-list', Array.from(userMap.values()));
    }
  });

  // Reacciones
  socket.on('add-reaction', ({ messageId, emoji }) => {
    const room = currentGame;
    if (!room) return;
    socket.to(room).emit('reaction-update', {
      messageId,
      emoji,
      from: currentUsername
    });
    // También se lo enviamos al propio emisor para que su contador se actualice
    socket.emit('reaction-update', {
      messageId,
      emoji,
      from: currentUsername
    });
  });

  // Desconexión
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
