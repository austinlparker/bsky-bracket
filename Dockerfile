FROM node:20-slim

WORKDIR /app

# Install system dependencies (for better-sqlite3)
RUN apt-get update && apt-get install -y \
    python3 \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Create volume mount point for SQLite database
VOLUME /app/data

# Expose port
EXPOSE 3000

# Start the service
CMD ["pnpm", "start"]
