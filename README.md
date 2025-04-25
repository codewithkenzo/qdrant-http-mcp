# Qdrant HTTP MCP Server

An MCP server that provides vector database capabilities through HTTP/SSE transport, allowing AI assistants to store and retrieve information using semantic search.

## Features

- **HTTP/SSE Transport**: Exposes MCP functionality over HTTP with Server-Sent Events (SSE) for real-time communication
- **Vector Database**: Leverages Qdrant for efficient vector storage and similarity search
- **Hybrid Search**: Combines vector similarity with keyword search for better results
- **Metadata Filtering**: Apply filters to search results based on metadata
- **Batch Operations**: Store multiple items efficiently in a single operation
- **Docker Support**: Easily deploy with Docker and Docker Compose

## Tools

The server provides the following MCP tools:

- `qdrant-store`: Store a piece of information with optional metadata
- `qdrant-find`: Search for information using vector similarity
- `qdrant-hybrid-search`: Search using a combination of vector similarity and keyword matching
- `qdrant-filtered-search`: Search with metadata filters
- `qdrant-collection-stats`: Get statistics about a collection
- `qdrant-list-collections`: List all collections
- `qdrant-batch-store`: Store multiple items in a single operation

## Installation

### Prerequisites

- Docker and Docker Compose
- Node.js 18+ (for development)

### Using Docker Compose

1. Clone the repository:
```bash
git clone <repository-url>
cd qdrant-http-mcp
```

2. Start the services:
```bash
docker-compose up -d
```

This will start both the Qdrant server and the MCP server.

### Manual Setup

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

Note: You'll need to have a Qdrant server running separately.

## Configuration

The server can be configured using environment variables:

- `PORT`: Server port (default: 3456)
- `QDRANT_URL`: URL of the Qdrant server (default: http://localhost:6333)
- `QDRANT_API_KEY`: API key for Qdrant (if required)
- `COLLECTION_NAME`: Default collection name (default: agent-ren3)
- `VECTOR_SIZE`: Size of the embedding vectors (default: 384)
- `LOG_LEVEL`: Logging level (default: info)

## Usage with PearAI

To use this MCP server with PearAI, add the following configuration to your MCP settings file:

```json
{
  "mcpServers": {
    "qdrant-http": {
      "url": "http://localhost:3456/mcp",
      "disabled": false,
      "alwaysAllow": [
        "qdrant-store",
        "qdrant-find",
        "qdrant-hybrid-search",
        "qdrant-filtered-search",
        "qdrant-collection-stats",
        "qdrant-list-collections",
        "qdrant-batch-store"
      ]
    }
  }
}
```

This configures PearAI to connect to the HTTP/SSE endpoint of the MCP server.

## API Endpoints

- `GET /mcp`: SSE endpoint for establishing the connection
- `POST /messages?sessionId=<sessionId>`: Endpoint for receiving client messages
- `GET /health`: Health check endpoint

## Development

### Running in Development Mode

```bash
npm run dev
```

This will start the server with nodemon for automatic reloading.

### Building the Docker Image

```bash
docker build -t qdrant-http-mcp .
```

## License

MIT