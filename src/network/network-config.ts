/**
 * Network configuration for multiplayer connections.
 */

/**
 * Get the server URL based on environment.
 * In production, connects to the same origin serving the app.
 * In development, connects to localhost:3001.
 */
function getServerURL(): string {
  // Check if we have an explicit server URL set
  if (import.meta.env.VITE_SERVER_URL) {
    return import.meta.env.VITE_SERVER_URL;
  }

  // In production (when served from a domain), use the same origin
  // This works because our production server serves both static files AND Socket.IO
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
    return window.location.origin;
  }

  // In development, use localhost:3001
  return 'http://localhost:3001';
}

/**
 * Server connection configuration.
 */
export const NetworkConfig = {
  /**
   * Server URL. Auto-detects based on environment:
   * - Production: Same origin as the app (window.location.origin)
   * - Development: http://localhost:3001
   * - Override: VITE_SERVER_URL environment variable
   */
  SERVER_URL: getServerURL(),

  /**
   * Reconnection configuration.
   */
  RECONNECTION: {
    enabled: true,
    attempts: 5,
    delay: 1000, // ms
    delayMax: 5000, // ms
  },

  /**
   * Network update rates (Hz).
   */
  UPDATE_RATES: {
    PLAYER_STATE: 20, // Send player state 20 times per second (active)
    PLAYER_STATE_IDLE: 5, // Send player state 5 times per second when idle (bandwidth optimization)
    INTERPOLATION_DELAY: 100, // ms - how far behind to interpolate remote players
  },
};
