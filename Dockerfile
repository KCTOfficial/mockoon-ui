# Build stage
FROM node:22-slim AS builder

WORKDIR /app

# Copy package files
COPY package.json yarn.lock ./

# Install dependencies
RUN yarn install --frozen-lockfile

# Copy source code
COPY . .

# Build the client (dist/client) and the API server (dist/server)
RUN yarn build

# Production stage
FROM node:22-slim AS runner

WORKDIR /app

# Install production dependencies
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production && yarn cache clean

# Copy necessary files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/data ./data

# Set environment to production
ENV NODE_ENV=production

# Expose the UI port
EXPOSE 3000

# Mock servers can run on any port defined in environment JSON files.
# When using network_mode: host in docker-compose, all ports are automatically available.
# If using bridge network, you'll need to expose specific ports or use a port range.
# Example for common mock server ports:
# EXPOSE 3001-3010

# Bind address and port of the UI
ENV HOST="0.0.0.0"
ENV PORT=3000

# Start the UI + API server
CMD ["node", "dist/server/index.mjs"]
