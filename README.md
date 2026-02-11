# 007 Remix

A browser-based multiplayer first-person shooter inspired by GoldenEye 007, built with Three.js, Rapier3D physics, and Socket.IO for real-time multiplayer.

## 🎮 Features

- **Real-time Multiplayer**: 20Hz state sync with authoritative server validation
- **Classic Weapons**: Pistol, Rifle, Shotgun, Sniper with realistic ballistics
- **Destructible Environment**: Exploding barrels, breakable crates
- **Game Modes**: Deathmatch (first to 25 kills)
- **Procedural Graphics**: All textures and models generated at runtime
- **Anti-cheat**: Server-side movement and fire rate validation

## 🚀 Quick Start

### Local Development

```bash
# Install dependencies
npm install

# Start development client (Vite)
npm run dev

# Start multiplayer server (Socket.IO) - in another terminal
npm run server
```

Visit `http://localhost:5173` and click "Multiplayer" to play!

### Production Deployment

See **[DEPLOYMENT_QUICKSTART.md](./DEPLOYMENT_QUICKSTART.md)** for deploying to Coolify/Docker.

## 📚 Documentation

- **[CLAUDE.md](./CLAUDE.md)** - Architecture guide for AI assistants
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Full deployment guide
- **[DEPLOYMENT_QUICKSTART.md](./DEPLOYMENT_QUICKSTART.md)** - Quick Coolify setup

## 🐳 Docker

```bash
# Build image
npm run docker:build

# Run container
npm run docker:run
```

## 🛠️ Tech Stack

- **Frontend**: Three.js, Vite, TypeScript
- **Physics**: Rapier3D (WASM)
- **Multiplayer**: Socket.IO
- **Server**: Node.js, Express
- **Deployment**: Docker, Coolify, GitHub Actions
