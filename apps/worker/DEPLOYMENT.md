# Worker Deployment Guide

## Overview
The Worker service handles:
- WhatsApp connection and message processing
- AI classification of messages
- Daily digest generation (19:00 Israel time)
- Immediate alert sending

## Requirements
- Node.js 20+
- ~1GB RAM (for Puppeteer/Chromium)
- Persistent storage for WhatsApp sessions

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key |
| `OPENAI_API_KEY` | Yes | OpenAI API key |
| `GREENAPI_INSTANCE_ID` | Yes | GreenAPI instance ID |
| `GREENAPI_API_TOKEN` | Yes | GreenAPI API token |
| `NODE_ENV` | No | Set to `production` in prod |

## Deployment Options

### Option 1: Railway (Recommended)

1. Create new project on [Railway](https://railway.app)
2. Connect your GitHub repo
3. Set root directory to repo root (not apps/worker)
4. Railway will auto-detect `railway.json`
5. Add environment variables in Railway dashboard
6. Deploy!

**Important:** Add a persistent volume mounted at `/app/apps/worker/sessions` for WhatsApp session persistence.

### Option 2: Docker Compose (Local/VPS)

```bash
cd apps/worker
cp env.example.txt .env
# Edit .env with your values
docker-compose up -d
```

### Option 3: Direct Docker

From repo root:
```bash
docker build -f apps/worker/Dockerfile -t parent-assistant-worker .

docker run -d \
  --name worker \
  -e SUPABASE_URL=xxx \
  -e SUPABASE_SERVICE_ROLE_KEY=xxx \
  -e OPENAI_API_KEY=xxx \
  -e GREENAPI_INSTANCE_ID=xxx \
  -e GREENAPI_API_TOKEN=xxx \
  -v worker-sessions:/app/apps/worker/sessions \
  parent-assistant-worker
```

### Option 4: Render

1. Create new Web Service on [Render](https://render.com)
2. Connect repo
3. Set:
   - Build Command: `docker build -f apps/worker/Dockerfile -t worker .`
   - Start Command: Auto-detected from Dockerfile
4. Add environment variables
5. Add persistent disk at `/app/apps/worker/sessions`

## WhatsApp Session Management

### First Connection
After deployment, the worker will generate a QR code. Check logs:
```bash
docker logs -f worker
# or
railway logs
```

Scan the QR code with WhatsApp on your phone.

### Session Persistence
Sessions are stored in `/app/apps/worker/sessions`. Mount a persistent volume here to avoid re-scanning QR after restarts.

### Disconnection Handling
If WhatsApp disconnects, the worker will:
1. Send a notification to the parent's phone via GreenAPI
2. Attempt to reconnect
3. If reconnection fails, a new QR code will be generated

## Monitoring

### Health Check
The worker logs health status every 30 seconds:
```
Health check: X active workers
```

### Logs to Watch For
- `WhatsApp client ready` - Connection successful
- `Synced X groups` - Groups loaded
- `Message received from` - Real-time message processing
- `Scan complete: processed=X` - Historical scan completed

## Troubleshooting

### "Execution context was destroyed"
Restart the worker. This is a Puppeteer issue.

### "WhatsApp not connected"
Check if the session was invalidated. You may need to re-scan QR.

### Messages not processing
1. Verify the group is active in the database
2. Check if the worker is connected (`Health check: X active workers`)
3. Ensure `wa_group_id` matches between WhatsApp and database


