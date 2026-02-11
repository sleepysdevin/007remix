# 🚀 Quick Deployment Guide

## What Was Created

Your repository now has everything needed for Docker + Coolify deployment:

### 📦 Docker Files
- **`Dockerfile`** - Multi-stage build (Vite frontend + Node.js server)
- **`.dockerignore`** - Excludes unnecessary files from build
- **`server-production.js`** - Production server (serves static files + Socket.IO)

### 🔄 CI/CD
- **`.github/workflows/docker-build.yml`** - Auto-builds and pushes to GitHub Container Registry

### 🐳 Deployment
- **`docker-compose.yml`** - Coolify-compatible compose file
- **`.env.example`** - Example environment variables
- **`DEPLOYMENT.md`** - Full deployment guide

## ⚡ Quick Deploy to Coolify

### 1️⃣ Enable GitHub Actions (One-time setup)

```bash
# Go to GitHub repo → Settings → Actions → General
# Enable "Read and write permissions"
```

### 2️⃣ Make Docker Image Public (One-time setup)

```bash
# Go to: https://github.com/users/YOUR_USERNAME/packages
# Find your package "007remix"
# Package settings → Change visibility → Public
```

### 3️⃣ Push to GitHub

```bash
git add .
git commit -m "Add Docker deployment"
git push origin main
```

**Wait 2-3 minutes** for GitHub Action to build the image.

### 4️⃣ Deploy in Coolify

1. **Create Service**:
   - Click "New Service" → "Docker Compose"
   - Name: `007remix-game`

2. **Paste Compose File**:
   - Copy contents of `docker-compose.yml`
   - Replace `yourusername/007remix` with your repo path

3. **Set Environment Variables**:
   ```
   GITHUB_REPOSITORY=yourusername/007remix
   IMAGE_TAG=main
   ```

4. **Add Domain** (optional):
   - e.g., `game.yourdomain.com`
   - Coolify auto-configures SSL

5. **Deploy** 🎉

## 🔍 Verify Deployment

After deployment (1-2 minutes):

1. **Check Logs** in Coolify:
   ```
   [Production Server] Running on port 3000
   [Production Server] Socket.IO game server ready
   ```

2. **Visit Your Domain**:
   - `https://your-domain.com` → Game loads
   - Multiplayer should auto-connect to same domain

3. **Test Multiplayer**:
   - Open 2 browser tabs
   - Both should connect to server
   - Should see other player's movements

## 📝 Configuration

### Image Tags

Update `IMAGE_TAG` in Coolify to deploy different versions:

- `main` - Latest from main branch (auto-updates)
- `develop` - Latest from develop branch
- `v1.0.0` - Specific version tag
- `sha-abc123` - Specific commit

### Custom Domain

In Coolify:
1. Add domain in service settings
2. Point DNS to Coolify server
3. Coolify auto-provisions SSL

### Environment Variables

Set in Coolify UI (Service → Configuration → Environment):

| Variable | Example | Notes |
|----------|---------|-------|
| `GITHUB_REPOSITORY` | `yourusername/007remix` | Required |
| `IMAGE_TAG` | `main` | Branch or tag |
| `PORT` | `3000` | Container port (default: 3000) |

Coolify automatically sets:
- `SERVICE_FQDN_GAME_3000` → Your domain URL
- Used by client to connect to Socket.IO

## 🔄 Updates

To deploy updates:

1. **Push code to GitHub**:
   ```bash
   git push origin main
   ```

2. **GitHub Action builds new image** (automatic)

3. **Redeploy in Coolify**:
   - Click "Redeploy" button
   - Or enable "Auto Deploy" for automatic updates

## 🐛 Troubleshooting

### "Failed to fetch image"

**Problem**: Coolify can't pull the Docker image

**Solution**:
1. Make package public on GitHub
2. Or add GitHub token in Coolify
3. Check `GITHUB_REPOSITORY` variable is correct

### "Container exits immediately"

**Problem**: Server crashes on startup

**Solution**:
1. Check logs in Coolify
2. Verify all environment variables are set
3. Check GitHub Actions build succeeded

### "Can't connect to multiplayer"

**Problem**: Socket.IO connection fails

**Solution**:
1. Verify domain is accessible
2. Check `SERVICE_FQDN_GAME_3000` is set correctly
3. Ensure WebSocket connections allowed (not blocked by firewall)

### "Build fails in GitHub Actions"

**Problem**: Docker build errors

**Solution**:
1. Check GitHub Actions logs
2. Verify all dependencies in `package.json`
3. Test build locally: `docker build -t test .`

## 📚 Next Steps

- [ ] Configure custom domain
- [ ] Enable auto-deploy on push
- [ ] Set up monitoring/alerts
- [ ] Review CORS settings in `server-production.js`
- [ ] Add rate limiting for production

## 📖 Full Documentation

For detailed information, see:
- **`DEPLOYMENT.md`** - Complete deployment guide
- **`.env.example`** - All environment variables
- **GitHub Workflow** - `.github/workflows/docker-build.yml`

## 🆘 Need Help?

1. Check Coolify logs: Service → Logs
2. Check GitHub Actions: Repository → Actions tab
3. Review `DEPLOYMENT.md` for detailed troubleshooting
4. Test locally: `docker-compose up`
