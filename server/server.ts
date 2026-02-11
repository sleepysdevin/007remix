import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { GameRoom } from './game-room.js';

/**
 * Port to run the server on.
 */
const PORT = process.env.PORT || 3001;

/**
 * Main game server using Socket.IO.
 * Handles player connections and manages game rooms.
 */
class GameServer {
  private httpServer;
  private io: SocketIOServer;
  private gameRoom: GameRoom;

  constructor() {
    // Create HTTP server
    this.httpServer = createServer();

    // Create Socket.IO server with CORS for development
    this.io = new SocketIOServer(this.httpServer, {
      cors: {
        origin: '*', // Allow all origins in development (restrict in production)
        methods: ['GET', 'POST'],
      },
    });

    // Create a single game room for now (Phase 1)
    // In Phase 4, we'll support multiple rooms
    this.gameRoom = new GameRoom();

    // Set up broadcast callback
    this.gameRoom.onBroadcast = (eventName, data) => {
      this.io.emit(eventName, data);
    };

    this.setupSocketHandlers();
  }

  /**
   * Set up Socket.IO event handlers.
   */
  private setupSocketHandlers(): void {
    this.io.on('connection', (socket) => {
      console.log(`[Server] Client connected: ${socket.id}`);

      // Player connected event
      socket.on('player:connected', (data: { playerId: string; username: string }) => {
        this.gameRoom.addPlayer(socket.id, data.username);

        // Broadcast to all clients that a new player joined
        this.io.emit('player:connected', {
          playerId: socket.id,
          username: data.username,
        });
      });

      // Player state update
      socket.on('player:state:update', (state: any) => {
        this.gameRoom.updatePlayerState(socket.id, state);
      });

      // Weapon fire event (Phase 3)
      socket.on('weapon:fire', (event: any) => {
        console.log(`[Server] Received weapon:fire event from ${socket.id}:`, event);
        this.gameRoom.handleWeaponFire(event);
      });

      // Grenade throw event (Phase 5)
      socket.on('grenade:throw', (event: any) => {
        this.gameRoom.handleGrenadeThrow(event);
      });

      // Grenade explosion event (Phase 5)
      socket.on('grenade:explosion', (event: any) => {
        this.gameRoom.handleGrenadeExplosion(event);
      });

      // Flashlight toggle event (Phase 5)
      socket.on('flashlight:toggle', (event: any) => {
        this.gameRoom.handleFlashlightToggle(event);
      });

      // Destructible destroyed event (Phase 5)
      socket.on('destructible:destroyed', (event: any) => {
        this.gameRoom.handleDestructibleDestroyed(event);
      });

      // Player disconnected
      socket.on('disconnect', () => {
        console.log(`[Server] Client disconnected: ${socket.id}`);
        this.gameRoom.removePlayer(socket.id);

        // Broadcast to all clients that player left
        this.io.emit('player:disconnected', {
          playerId: socket.id,
        });
      });
    });
  }

  /**
   * Start the server.
   */
  start(): void {
    this.httpServer.listen(PORT, () => {
      console.log(`[Server] Game server running on port ${PORT}`);
      console.log(`[Server] Players can connect to: http://localhost:${PORT}`);
    });
  }

  /**
   * Stop the server.
   */
  stop(): void {
    this.gameRoom.dispose();
    this.io.close();
    this.httpServer.close();
  }
}

// Start the server
const server = new GameServer();
server.start();

// Graceful shutdown on Ctrl+C
process.on('SIGINT', () => {
  console.log('\n[Server] Shutting down gracefully...');
  server.stop();
  process.exit(0);
});
