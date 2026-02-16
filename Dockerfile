# Build stage
FROM oven/bun:1 AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
RUN bun run build

# Production stage
FROM oven/bun:1 AS runner

WORKDIR /app

# Copy necessary files from builder
COPY --from=builder /app/package.json ./
COPY --from=builder /app/bun.lock ./
COPY --from=builder /app/next.config.ts ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/data ./data

# Install production dependencies
RUN bun install --frozen-lockfile --production

# Set environment to production
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Expose the UI port
EXPOSE 3000

# Mock servers can run on any port defined in environment JSON files.
# When using network_mode: host in docker-compose, all ports are automatically available.
# If using bridge network, you'll need to expose specific ports or use a port range.
# Example for common mock server ports:
# EXPOSE 3001-3010

# Set the hostname
ENV HOSTNAME="0.0.0.0"
ENV PORT=3000

# Start the application using bun
CMD ["bun", "run", "server.js"]
