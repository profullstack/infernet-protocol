FROM node:18-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml* ./
COPY web/package.json ./web/

# Install dependencies
RUN pnpm install -r

# Copy source code
COPY . .

# Build the web application
WORKDIR /app/web
RUN pnpm build

# Production stage
FROM node:18-alpine AS production

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy built assets from builder stage
COPY --from=builder /app/web/build /app/web/build
COPY --from=builder /app/web/server /app/web/server
COPY --from=builder /app/web/package.json /app/web/

# Install production dependencies only
WORKDIR /app/web
RUN pnpm install --prod

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV POCKETBASE_URL=http://localhost:8080

# Expose ports for the web server and PocketBase
EXPOSE 3000
EXPOSE 8080

# Copy PocketBase executable (assuming it's in the repo)
COPY --from=builder /app/bin/pocketbase /app/bin/pocketbase

# Copy startup script
COPY docker/start.sh /app/
RUN chmod +x /app/start.sh

CMD ["/app/start.sh"]
