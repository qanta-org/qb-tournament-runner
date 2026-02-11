# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build client and server
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Copy package files for production
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy built files
COPY --from=builder /app/dist ./dist

# Copy any static assets
COPY --from=builder /app/client/public ./dist/client

# Create uploads directory
RUN mkdir -p uploads runs

# Set environment
ENV NODE_ENV=production
ENV PORT=3001

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://localhost:3001/api/health || exit 1

# Start the server
CMD ["node", "dist/server/index.js"]
