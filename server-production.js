/**
 * Production server for 007 Remix
 * Serves both the static Vite build AND the Socket.IO game server on the same port
 */

import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

// Import the compiled game room (using dynamic import for ESM)
const { GameRoom } = await import('./server/dist/server/game-room.js');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;

// Create Express app to serve static files
const app = express();

// Serve static files from dist/
app.use(express.static(path.join(__dirname, 'dist')));

// All routes serve index.html (SPA)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Create HTTP server with Express
const httpServer = createServer(app);

// Create Socket.IO server
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: '*', // In production, you may want to restrict this
    methods: ['GET', 'POST'],
  },
});

// Create game room
const gameRoom = new GameRoom();

// Set up broadcast callback
gameRoom.onBroadcast = (eventName, data) => {
  io.emit(eventName, data);
};

// Socket.IO event handlers
io.on('connection', (socket) => {
  console.log(`[Server] Client connected: ${socket.id}`);

  // Player connected event
  socket.on('player:connected', (data) => {
    gameRoom.addPlayer(socket.id, data.username);
    io.emit('player:connected', {
      playerId: socket.id,
      username: data.username,
    });
  });

  // Player state update
  socket.on('player:state:update', (state) => {
    gameRoom.updatePlayerState(socket.id, state);
  });

  // Weapon fire event
  socket.on('weapon:fire', (event) => {
    gameRoom.handleWeaponFire(event);
  });

  // Grenade throw event
  socket.on('grenade:throw', (event) => {
    gameRoom.handleGrenadeThrow(event);
  });

  // Grenade explosion event
  socket.on('grenade:explosion', (event) => {
    gameRoom.handleGrenadeExplosion(event);
  });

  // Flashlight toggle event
  socket.on('flashlight:toggle', (event) => {
    gameRoom.handleFlashlightToggle(event);
  });

  // Destructible destroyed event
  socket.on('destructible:destroyed', (event) => {
    gameRoom.handleDestructibleDestroyed(event);
  });

  // Player disconnected
  socket.on('disconnect', () => {
    console.log(`[Server] Client disconnected: ${socket.id}`);
    gameRoom.removePlayer(socket.id);
    io.emit('player:disconnected', {
      playerId: socket.id,
    });
  });
});

// Start server
httpServer.listen(PORT, () => {
  console.log(`[Production Server] Running on port ${PORT}`);
  console.log(`[Production Server] Serving static files from /dist`);
  console.log(`[Production Server] Socket.IO game server ready`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Production Server] Shutting down gracefully...');
  gameRoom.dispose();
  io.close();
  httpServer.close();
  process.exit(0);
});
