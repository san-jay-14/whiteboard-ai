# Long-running AI-agent worker: watches one board over Supabase Realtime and
# runs the Anthropic reasoning loop. NOT serverless — it holds a persistent
# websocket, so it needs a always-on host (Railway / Render worker / Fly / VM).
#
# Build context MUST be the repo root: the agent imports ../../shared/*.
#   docker build -f ai-agent/Dockerfile -t whiteboard-agent .
FROM node:22-slim

WORKDIR /app

# Install deps first for layer caching. --include=dev because the start script
# runs the TypeScript entry directly via tsx (a devDependency).
COPY ai-agent/package.json ai-agent/package-lock.json ai-agent/
RUN cd ai-agent && npm ci --include=dev

# Source: shared transport/presence utils + the agent itself.
COPY shared shared
COPY ai-agent ai-agent

WORKDIR /app/ai-agent
CMD ["npm", "start"]
