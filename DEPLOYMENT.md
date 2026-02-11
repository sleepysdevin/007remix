# Deployment Guide for 007 Remix

This guide covers deploying 007 Remix using Docker and Coolify.

## Architecture

The production deployment runs both the game client (Vite build) and game server (Socket.IO) in a single container:
- **Port 3000**: Serves static files (HTML/JS/CSS) AND Socket.IO WebSocket connections
- **Node.js + Express**: Serves the built frontend and handles Socket.IO game logic

## Prerequisites

1. A GitHub repository for the project
2. [Coolify](https://coolify.io/) instance running (or any Docker-compatible hosting)
3. Domain name (optional, but recommended)

## Quick Start with Coolify

### Step 1: Enable GitHub Container Registry

The GitHub Action automatically builds and pushes Docker images to GitHub Container Registry (GHCR).

1. Go to your GitHub repository settings
2. Navigate to "Actions" → "General"
3. Ensure "Read and write permissions" is enabled for workflows

### Step 2: Push to GitHub

```bash
git add .
git commit -m "Add Docker deployment configuration"
git push origin main
```

The GitHub Action will automatically:
- Build the Docker image
- Push it to `ghcr.io/yourusername/007remix:main`

### Step 3: Deploy to Coolify

1. **Create a new Service in Coolify**:
   - Click "New Service"
   - Select "Docker Compose"
   - Give it a name (e.g., "007-remix")

2. **Configure Docker Compose**:
   - Paste the contents of `docker-compose.yml`
   - Update the image name: `ghcr.io/yourusername/007remix:main`

3. **Set Environment Variables** (in Coolify UI):
   ```
   PORT=3000
   IMAGE_TAG=main
   GITHUB_REPOSITORY=yourusername/007remix
   ```

4. **Configure Domain**:
   - Add your domain in Coolify (e.g., `game.yourdomain.com`)
   - Coolify will automatically set `SERVICE_FQDN_GAME` environment variable
   - The client will connect to the same domain for Socket.IO

5. **Deploy**:
   - Click "Deploy"
   - Wait for container to start
   - Check logs for any errors

### Step 4: Access Your Game

Once deployed, visit your domain:
- `https://game.yourdomain.com` - Main game
- Socket.IO will automatically connect to the same domain

## Manual Docker Deployment

If you're not using Coolify:

### Build the Image

```bash
docker build -t 007remix:latest .
```

### Run the Container

```bash
docker run -d \
  --name 007remix-game \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -e VITE_SERVER_URL=https://yourdomain.com \
  --restart unless-stopped \
  007remix:latest
```

### Using Docker Compose

```bash
# Update docker-compose.yml with your image name
docker-compose up -d
```

## Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PORT` | Port the server runs on | `3000` | No |
| `NODE_ENV` | Node environment | `production` | No |
| `VITE_SERVER_URL` | Client connection URL | `http://localhost:3000` | Yes (production) |
| `GITHUB_REPOSITORY` | GitHub repo for image | - | Yes (Coolify) |
| `IMAGE_TAG` | Docker image tag | `main` | No |

## Coolify-Specific Features

### Automatic Domain Configuration

Coolify automatically sets `SERVICE_FQDN_GAME` which is used for:
- Serving the game client
- Socket.IO WebSocket connections
- SSL/TLS termination

### Health Checks

The container includes a health check that pings the server every 30 seconds.

### Auto-Deploy on Push

To enable auto-deploy:
1. In Coolify, go to your service settings
2. Enable "Auto Deploy" on Git push
3. Connect your GitHub repository
4. Select the `main` branch

Now every push to `main` will:
1. Trigger GitHub Action to build new image
2. Push image to GHCR
3. Coolify pulls the new image and redeploys

## GitHub Actions Workflow

The workflow (`.github/workflows/docker-build.yml`) runs on:
- Push to `main` or `develop` branches
- Pull requests to `main`
- Git tags (e.g., `v1.0.0`)

It builds multi-platform images (amd64 and arm64) and pushes to GHCR.

## Troubleshooting

### Container Won't Start

Check logs:
```bash
docker logs 007remix-game
```

Common issues:
- Missing `express` dependency → Run `npm install express` and rebuild
- Port already in use → Change `PORT` environment variable
- Build errors → Check GitHub Actions logs

### Socket.IO Connection Fails

1. Ensure `VITE_SERVER_URL` matches your domain
2. Check that WebSocket connections are allowed (not blocked by firewall/proxy)
3. Verify SSL/TLS is working (mixed content issues)

### Client Shows "Connection Error"

1. Check server logs: `docker logs 007remix-game`
2. Verify server is running: `curl http://localhost:3000`
3. Check `VITE_SERVER_URL` environment variable

## Updating

### Pull Latest Changes

```bash
git pull origin main
```

### Redeploy in Coolify

1. Push changes to GitHub (triggers build)
2. In Coolify, click "Redeploy" or wait for auto-deploy
3. Monitor logs for successful startup

### Rollback

In Coolify:
1. Go to "Deployments" tab
2. Select previous deployment
3. Click "Redeploy"

Or with Docker:
```bash
docker pull ghcr.io/yourusername/007remix:previous-tag
docker-compose down
docker-compose up -d
```

## Production Checklist

Before deploying to production:

- [ ] Update `VITE_SERVER_URL` to production domain
- [ ] Set up SSL/TLS (Coolify does this automatically)
- [ ] Configure proper CORS origins in `server-production.js` (currently allows all)
- [ ] Set up monitoring/logging
- [ ] Test multiplayer functionality
- [ ] Set up backups (if using persistent storage)
- [ ] Configure firewall rules (allow port 3000 or your chosen port)

## Security Considerations

1. **CORS**: Update `server-production.js` to restrict allowed origins:
   ```javascript
   cors: {
     origin: 'https://yourdomain.com', // Restrict to your domain
     methods: ['GET', 'POST'],
   }
   ```

2. **Rate Limiting**: Consider adding rate limiting for Socket.IO connections

3. **Environment Variables**: Never commit `.env` files with production secrets

4. **Container Security**: Keep Node.js and dependencies up to date

## Support

For issues or questions:
- Check GitHub Issues: https://github.com/yourusername/007remix/issues
- Review logs in Coolify or via `docker logs`
