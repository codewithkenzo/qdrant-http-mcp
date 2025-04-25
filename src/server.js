// Qdrant HTTP MCP Server
// An MCP server that provides vector database capabilities through HTTP/SSE transport

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { QdrantClient } from '@qdrant/js-client-rest';
import { z } from 'zod';
import { FastEmbedClient } from './embeddings.js';

// Load environment variables
dotenv.config();

// Constants
const PORT = process.env.PORT || 3456;
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const QDRANT_API_KEY = process.env.QDRANT_API_KEY || '';
const COLLECTION_NAME = process.env.COLLECTION_NAME || 'agent-ren3';
const VECTOR_SIZE = parseInt(process.env.VECTOR_SIZE || '384');

// Initialize Qdrant client
const qdrantClient = new QdrantClient({
  url: QDRANT_URL,
  apiKey: QDRANT_API_KEY,
});

// Initialize embedding client
const embeddingClient = new FastEmbedClient();

// Ensure collection exists
async function ensureCollection() {
  try {
    // Check if collection exists
    const collections = await qdrantClient.getCollections();
    const collectionExists = collections.collections.some(
      (collection) => collection.name === COLLECTION_NAME
    );

    if (!collectionExists) {
      console.log(`Creating collection ${COLLECTION_NAME}...`);
      await qdrantClient.createCollection(COLLECTION_NAME, {
        vectors: {
          size: VECTOR_SIZE,
          distance: 'Cosine',
        },
      });
      console.log(`Collection ${COLLECTION_NAME} created.`);
    } else {
      console.log(`Collection ${COLLECTION_NAME} already exists.`);
    }
  } catch (error) {
    console.error('Error ensuring collection exists:', error);
    throw error;
  }
}

// Initialize MCP server
function createMcpServer() {
  const server = new McpServer({
    name: 'qdrant-http-mcp',
    version: '1.0.0',
  }, { capabilities: { logging: {} } });

  // Register tools
  server.tool(
    'qdrant-store',
    {
      information: z.string().describe('Information to store'),
      metadata: z.record(z.any()).optional().describe('Metadata for the information'),
    },
    async ({ information, metadata = {} }) => {
      try {
        // Generate embedding
        const embedding = await embeddingClient.embed(information);
        
        // Store in Qdrant
        const id = crypto.randomUUID();
        await qdrantClient.upsert(COLLECTION_NAME, {
          points: [
            {
              id,
              vector: embedding,
              payload: {
                information,
                metadata,
                timestamp: new Date().toISOString(),
              },
            },
          ],
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: true, id }),
            },
          ],
        };
      } catch (error) {
        console.error('Error storing information:', error);
        return {
          content: [
            {
              type: 'text',
              text: `Error storing information: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'qdrant-find',
    {
      query: z.string().describe('Search query'),
      limit: z.number().optional().default(5).describe('Maximum number of results to return'),
      filter: z.record(z.any()).optional().describe('Metadata filter'),
    },
    async ({ query, limit = 5, filter }) => {
      try {
        // Generate embedding for the query
        const embedding = await embeddingClient.embed(query);
        
        // Search in Qdrant
        const searchParams = {
          vector: embedding,
          limit,
        };
        
        if (filter) {
          searchParams.filter = filter;
        }
        
        const results = await qdrantClient.search(COLLECTION_NAME, searchParams);
        
        // Format results
        const formattedResults = results.map(result => ({
          information: result.payload.information,
          metadata: result.payload.metadata,
          score: result.score,
          timestamp: result.payload.timestamp,
        }));

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(formattedResults),
            },
          ],
        };
      } catch (error) {
        console.error('Error searching information:', error);
        return {
          content: [
            {
              type: 'text',
              text: `Error searching information: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'qdrant-hybrid-search',
    {
      query: z.string().describe('The search query'),
      vector_weight: z.number().min(0).max(1).default(0.7).describe('Weight for vector search results (0.0-1.0)'),
      keyword_weight: z.number().min(0).max(1).default(0.3).describe('Weight for keyword search results (0.0-1.0)'),
      filters: z.record(z.any()).optional().describe('Metadata filters to apply to results'),
      limit: z.number().optional().default(10).describe('Maximum number of results to return'),
    },
    async ({ query, vector_weight = 0.7, keyword_weight = 0.3, filters, limit = 10 }) => {
      try {
        // Generate embedding for the query
        const embedding = await embeddingClient.embed(query);
        
        // Configure search params
        const searchParams = {
          vector: embedding,
          limit: limit * 2, // Get more results to allow for hybrid reranking
          with_payload: true,
        };
        
        if (filters) {
          searchParams.filter = filters;
        }
        
        // Add text search with weights
        if (keyword_weight > 0) {
          searchParams.query = {
            text: query,
          };
          
          // Set hybrid scoring
          searchParams.score_threshold = 0.0;
          searchParams.params = {
            vector_weight,
            keyword_weight,
          };
        }
        
        // Search in Qdrant
        const results = await qdrantClient.search(COLLECTION_NAME, searchParams);
        
        // Format and limit results
        const formattedResults = results
          .slice(0, limit)
          .map(result => ({
            information: result.payload.information,
            metadata: result.payload.metadata,
            score: result.score,
            timestamp: result.payload.timestamp,
          }));

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(formattedResults),
            },
          ],
        };
      } catch (error) {
        console.error('Error performing hybrid search:', error);
        return {
          content: [
            {
              type: 'text',
              text: `Error performing hybrid search: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'qdrant-filtered-search',
    {
      query: z.string().optional().describe('The search query (optional if filters are provided)'),
      filters: z.record(z.any()).describe('Metadata filters to apply to results'),
      use_vector: z.boolean().default(true).describe('Whether to use vector search'),
      limit: z.number().optional().default(10).describe('Maximum number of results to return'),
    },
    async ({ query, filters, use_vector = true, limit = 10 }) => {
      try {
        // Configure search params
        const searchParams = {
          limit,
          filter: filters,
          with_payload: true,
        };
        
        // Add vector search if enabled and query provided
        if (use_vector && query) {
          const embedding = await embeddingClient.embed(query);
          searchParams.vector = embedding;
        }
        
        // Search in Qdrant
        const results = await qdrantClient.search(COLLECTION_NAME, searchParams);
        
        // Format results
        const formattedResults = results.map(result => ({
          information: result.payload.information,
          metadata: result.payload.metadata,
          score: result.score,
          timestamp: result.payload.timestamp,
        }));

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(formattedResults),
            },
          ],
        };
      } catch (error) {
        console.error('Error performing filtered search:', error);
        return {
          content: [
            {
              type: 'text',
              text: `Error performing filtered search: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'qdrant-collection-stats',
    {
      collection_name: z.string().describe('Name of the collection'),
    },
    async ({ collection_name }) => {
      try {
        const stats = await qdrantClient.getCollection(collection_name);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(stats),
            },
          ],
        };
      } catch (error) {
        console.error('Error getting collection stats:', error);
        return {
          content: [
            {
              type: 'text',
              text: `Error getting collection stats: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'qdrant-list-collections',
    {},
    async () => {
      try {
        const collections = await qdrantClient.getCollections();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(collections),
            },
          ],
        };
      } catch (error) {
        console.error('Error listing collections:', error);
        return {
          content: [
            {
              type: 'text',
              text: `Error listing collections: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'qdrant-batch-store',
    {
      items: z.array(
        z.object({
          information: z.string().describe('Information to store'),
          metadata: z.record(z.any()).optional().describe('Metadata for the information'),
          id: z.string().optional().describe('Optional ID for the point'),
        })
      ).describe('Array of items to store'),
      collection_name: z.string().optional().describe('Optional collection name (defaults to main collection)'),
    },
    async ({ items, collection_name = COLLECTION_NAME }) => {
      try {
        // Generate embeddings in batch
        const texts = items.map(item => item.information);
        const embeddings = await embeddingClient.embedBatch(texts);
        
        // Prepare points for batch insertion
        const points = items.map((item, index) => ({
          id: item.id || crypto.randomUUID(),
          vector: embeddings[index],
          payload: {
            information: item.information,
            metadata: item.metadata || {},
            timestamp: new Date().toISOString(),
          },
        }));
        
        // Store in Qdrant
        await qdrantClient.upsert(collection_name, { points });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ 
                success: true, 
                message: `Successfully stored ${points.length} items`,
                ids: points.map(point => point.id)
              }),
            },
          ],
        };
      } catch (error) {
        console.error('Error batch storing information:', error);
        return {
          content: [
            {
              type: 'text',
              text: `Error batch storing information: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  return server;
}

// Set up Express app
const app = express();
app.use(cors());
app.use(express.json());

// Store transports by session ID
const transports = {};

// SSE endpoint for establishing the stream
app.get('/mcp', async (req, res) => {
  console.log('Received GET request to /mcp (establishing SSE stream)');
  
  try {
    // Create a new SSE transport for the client
    const transport = new SSEServerTransport('/messages', res);
    
    // Store the transport by session ID
    const sessionId = transport.sessionId;
    transports[sessionId] = transport;
    
    // Set up onclose handler to clean up transport when closed
    transport.onclose = () => {
      console.log(`SSE transport closed for session ${sessionId}`);
      delete transports[sessionId];
    };
    
    // Connect the transport to the MCP server
    const server = createMcpServer();
    await server.connect(transport);
    
    // Start the SSE transport to begin streaming
    await transport.start();
    console.log(`Established SSE stream with session ID: ${sessionId}`);
  } catch (error) {
    console.error('Error establishing SSE stream:', error);
    if (!res.headersSent) {
      res.status(500).send('Error establishing SSE stream');
    }
  }
});

// Messages endpoint for receiving client JSON-RPC requests
app.post('/messages', async (req, res) => {
  console.log('Received POST request to /messages');
  
  // Extract session ID from URL query parameter
  const sessionId = req.query.sessionId;
  if (!sessionId) {
    console.error('No session ID provided in request URL');
    res.status(400).send('Missing sessionId parameter');
    return;
  }
  
  const transport = transports[sessionId];
  if (!transport) {
    console.error(`No active transport found for session ID: ${sessionId}`);
    res.status(404).send('Session not found');
    return;
  }
  
  try {
    // Handle the POST message with the transport
    await transport.handlePostMessage(req, res, req.body);
  } catch (error) {
    console.error('Error handling request:', error);
    if (!res.headersSent) {
      res.status(500).send('Error handling request');
    }
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Start the server
async function main() {
  try {
    // Ensure Qdrant collection exists
    await ensureCollection();
    
    // Start Express server
    app.listen(PORT, () => {
      console.log(`Qdrant HTTP MCP server listening on port ${PORT}`);
      console.log(`SSE endpoint: http://localhost:${PORT}/mcp`);
      console.log(`Messages endpoint: http://localhost:${PORT}/messages`);
      console.log(`Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error('Error starting server:', error);
    process.exit(1);
  }
}

// Handle server shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down server...');
  
  // Close all active transports to properly clean up resources
  for (const sessionId in transports) {
    try {
      console.log(`Closing transport for session ${sessionId}`);
      await transports[sessionId].close();
      delete transports[sessionId];
    } catch (error) {
      console.error(`Error closing transport for session ${sessionId}:`, error);
    }
  }
  
  console.log('Server shutdown complete');
  process.exit(0);
});

// Run the server
main();