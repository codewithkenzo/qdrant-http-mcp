// embeddings.js
// Handles embeddings generation for the Qdrant MCP server

import { FastEmbed } from 'fastembed';

/**
 * A client for generating embeddings using the FastEmbed library
 */
export class FastEmbedClient {
  constructor(modelName = 'sentence-transformers/all-MiniLM-L6-v2') {
    this.modelName = modelName;
    this.model = null;
    this.initialized = false;
  }

  /**
   * Initialize the embedding model
   */
  async init() {
    if (!this.initialized) {
      console.log(`Initializing FastEmbed with model: ${this.modelName}`);
      this.model = await FastEmbed.create({
        modelName: this.modelName,
        useFastTokenizer: true,
      });
      this.initialized = true;
      console.log('FastEmbed initialization complete');
    }
  }

  /**
   * Generate an embedding for a single text
   * @param {string} text The text to embed
   * @returns {Promise<number[]>} The embedding vector
   */
  async embed(text) {
    await this.init();
    
    try {
      const embeddings = await this.model.embed([text]);
      return embeddings[0];
    } catch (error) {
      console.error('Error generating embedding:', error);
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple texts
   * @param {string[]} texts Array of texts to embed
   * @returns {Promise<number[][]>} Array of embedding vectors
   */
  async embedBatch(texts) {
    await this.init();
    
    try {
      return await this.model.embed(texts);
    } catch (error) {
      console.error('Error generating batch embeddings:', error);
      throw error;
    }
  }
}