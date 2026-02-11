/**
 * Network message type definitions for multiplayer communication.
 * These types define the structure of messages exchanged between client and server.
 */
/**
 * Event types for Socket.IO communication.
 */
export var NetworkEventType;
(function (NetworkEventType) {
    // Connection events
    NetworkEventType["PLAYER_CONNECTED"] = "player:connected";
    NetworkEventType["PLAYER_DISCONNECTED"] = "player:disconnected";
    // State sync events
    NetworkEventType["PLAYER_STATE_UPDATE"] = "player:state:update";
    NetworkEventType["GAME_STATE_SNAPSHOT"] = "game:state:snapshot";
    // Combat events (Phase 3)
    NetworkEventType["WEAPON_FIRE"] = "weapon:fire";
    NetworkEventType["PLAYER_DAMAGED"] = "player:damaged";
    NetworkEventType["PLAYER_DIED"] = "player:died";
    NetworkEventType["PLAYER_RESPAWNED"] = "player:respawned";
    // Equipment events (Phase 5)
    NetworkEventType["GRENADE_THROW"] = "grenade:throw";
    NetworkEventType["GRENADE_EXPLOSION"] = "grenade:explosion";
    NetworkEventType["FLASHLIGHT_TOGGLE"] = "flashlight:toggle";
    NetworkEventType["DESTRUCTIBLE_DESTROYED"] = "destructible:destroyed";
    // Game mode (Phase 4)
    NetworkEventType["GAME_OVER"] = "game:over";
})(NetworkEventType || (NetworkEventType = {}));
