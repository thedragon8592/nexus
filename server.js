const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// gameId -> Map(socketId, { username, color })
const rooms = new Map();

function normalizeName(name) {
  return name.trim().toLowerCase();
}

io.on('connection', (socket) => {
  let currentGame = null;
  let currentUsername = null;

  // ────────────────────────────────────────────────────────────
  // JOIN
  // ────────────────────────────────────────────────────────────
  socket.on('join', ({ gameId, username }) => {
    if (!gameId || !username) return;

    const room = rooms.get(gameId) || new Map();
    const lowerNames = Array.from(room.values()).map(u => normalizeName(u.username));

    // FIX BUG 2: si ya hay un socket con ese nombre, verificar que NO sea el propio socket
    // (permite reconexión sin bloquear al mismo usuario)
    const normalizedNew = normalizeName(username);
    const duplicate = Array.from(room.entries()).find(
      ([id, u]) => id !== socket.id && normalizeName(u.username) === normalizedNew
    );
    if (duplicate) {
      socket.emit('system-message', '❌ That name is already taken in this game.');
      return;
    }

    // Salir de sala anterior si existía
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
    // FIX BUG 2: guardar objeto { username, color } en vez de solo string
    rooms.get(gameId).set(socket.id, { username, color: null });

    socket.to(gameId).emit('system-message', `${username} joined the chat.`);
    io.to(gameId).emit('user-list', getUserList(gameId));
    console.log(`[JOIN] ${username} → room ${gameId} (socket ${socket.id})`);
  });

  // ────────────────────────────────────────────────────────────
  // FIX BUG 4: CAMBIO DE NOMBRE — el servidor es la fuente de verdad
  // El cliente NO debe actualizar localmente hasta recibir '✅' en system-message
  // ────────────────────────────────────────────────────────────
  socket.on('change-username', (newUsername) => {
    if (!currentGame || !newUsername) return;
    const room = rooms.get(currentGame);
    if (!room) return;

    const normalizedNew = normalizeName(newUsername);

    // Verificar duplicado (excluyendo al propio socket)
    for (const [id, entry] of room.entries()) {
      if (id !== socket.id && normalizeName(entry.username) === normalizedNew) {
        // Enviar error con prefijo especial para que el cliente pueda revertir
        socket.emit('system-message', `❌ Name '${newUsername}' is already taken.`);
        socket.emit('username-change-rejected', { rejectedName: newUsername });
        return;
      }
    }

    const oldName = currentUsername;
    currentUsername = newUsername;
    // Preservar color existente
    const existingEntry = room.get(socket.id) || {};
    room.set(socket.id, { username: newUsername, color: existingEntry.color || null });

    // Confirmar al cliente con prefijo especial
    socket.emit('system-message', `✅ Your name is now ${newUsername}.`);
    socket.emit('username-change-accepted', { newUsername });
    socket.to(currentGame).emit('system-message', `${oldName} changed their name to ${newUsername}.`);
    io.to(currentGame).emit('user-list', getUserList(currentGame));
    console.log(`[RENAME] ${oldName} → ${newUsername} in room ${currentGame}`);
  });

  // ────────────────────────────────────────────────────────────
  // MENSAJES
  // ────────────────────────────────────────────────────────────
  socket.on('chat-message', (payload) => {
    if (!currentGame) return;

    // FIX BUG 2: usar currentUsername del servidor (no el del payload)
    // para evitar inconsistencias si el cliente cambió nombre localmente sin confirmación
    payload.author = currentUsername;

    // Generar messageId en el servidor (FIX BUG 3: garantiza ID único compartido)
    const messageId = crypto.randomUUID
      ? crypto.randomUUID()
      : Date.now() + '-' + Math.random().toString(36).substring(2, 9);
    payload.messageId = messageId;

    console.log(`[MSG] ${currentUsername} → room ${currentGame} | id:${messageId} | recipient:${payload.recipient || 'all'}`);

    // Mensaje privado
    if (payload.recipient) {
      const userMap = rooms.get(currentGame);
      if (!userMap) return;

      let targetSocketId = null;
      const normalizedRecipient = normalizeName(payload.recipient);

      for (const [id, entry] of userMap.entries()) {
        if (normalizeName(entry.username) === normalizedRecipient) {
          targetSocketId = id;
          break;
        }
      }

      if (targetSocketId) {
        io.to(targetSocketId).emit('chat-message', payload);
        // Solo enviar copia al remitente si NO es el mismo socket
        if (targetSocketId !== socket.id) {
          socket.emit('chat-message', payload);
        }
      } else {
        // FIX BUG 2: mostrar usuarios online para que el remitente sepa quién está disponible
        const available = getUserList(currentGame).join(', ');
        socket.emit('system-message', `❌ User '${payload.recipient}' not found. Online: ${available}`);
      }
      return;
    }

    // Mensaje público: io.to incluye al emisor
    io.to(currentGame).emit('chat-message', payload);
  });

  // ────────────────────────────────────────────────────────────
  // ONLINE / REACCIONES / DISCONNECT
  // ────────────────────────────────────────────────────────────
  socket.on('request-online', () => {
    if (!currentGame) return;
    socket.emit('online-list', getUserList(currentGame));
  });

  socket.on('add-reaction', ({ messageId, emoji }) => {
    if (!currentGame) return;
    // Broadcast a toda la sala incluyendo al emisor
    io.to(currentGame).emit('reaction-update', { messageId, emoji });
  });

  socket.on('disconnect', () => {
    if (currentGame) {
      const userMap = rooms.get(currentGame);
      if (userMap) {
        userMap.delete(socket.id);
        if (userMap.size === 0) {
          rooms.delete(currentGame);
        } else {
          socket.to(currentGame).emit('system-message', `${currentUsername} left the chat.`);
          io.to(currentGame).emit('user-list', getUserList(currentGame));
        }
      }
    }
    console.log(`[DISCONNECT] ${currentUsername} (socket ${socket.id})`);
  });
});

// Helper: devuelve array de nombres de la sala
function getUserList(gameId) {
  const room = rooms.get(gameId);
  if (!room) return [];
  return Array.from(room.values()).map(entry => entry.username);
}

app.get('/', (req, res) => res.send('Nexus Chat Server v9.3 is running'));

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
