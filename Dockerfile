FROM node:20-slim

WORKDIR /app

# Install necessary system dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy package.json and install dependencies
COPY package.json ./
RUN npm install

# Copy source code
COPY src/ ./src/

# Set environment variables
ENV PORT=3456
ENV NODE_ENV=production

# Expose the port
EXPOSE 3456

# Start the server
CMD ["node", "src/server.js"]