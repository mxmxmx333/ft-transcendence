import fs from 'fs/promises';
import path from 'path';
import type { SerializedWeights, PerformanceStats, AIModelFile } from './types';

export class AIFilePersistenceManager {
  private readonly MODEL_DIR = 'services/ai-opponent/ai_model';
  private readonly GLOBAL_MODEL_FILE = 'global_ai_model.json';
  private initialized = false;

  constructor() {
    this.initialize();
  }

  private async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Create directories if they don't exist
      await fs.mkdir(this.MODEL_DIR, { recursive: true });

      this.initialized = true;
      console.log('[AIFilePersistence] Directories initialized');
    } catch (error) {
      console.error('[AIFilePersistence] Failed to initialize directories:', error);
    }
  }

  async saveAIModel(
    weightsData: SerializedWeights,
    performanceStats: PerformanceStats
  ): Promise<void> {
    try {
      await this.initialize();

      const modelData: AIModelFile = {
        timestamp: new Date().toISOString(),
        weightsData,
        performanceStats,
      };

      const filePath = path.join(this.MODEL_DIR, this.GLOBAL_MODEL_FILE);
      await fs.writeFile(filePath, JSON.stringify(modelData, null, 2));

      console.log(
        `[AIFilePersistence] Model saved - Games: ${weightsData.gameCount}, Win Rate: ${(performanceStats.winRate * 100).toFixed(1)}%`
      );
    } catch (error) {
      console.error('[AIFilePersistence] Failed to save AI model:', error);
      throw error;
    }
  }

  async loadAIModel(): Promise<{
    weightsData: SerializedWeights | null;
    performanceStats: PerformanceStats | null;
  }> {
    try {
      await this.initialize();

      const filePath = path.join(this.MODEL_DIR, this.GLOBAL_MODEL_FILE);

      // Check if file exists
      try {
        await fs.access(filePath);
      } catch {
        console.log('[AIFilePersistence] No saved model found, starting fresh');
        return { weightsData: null, performanceStats: null };
      }

      const fileContent = await fs.readFile(filePath, 'utf-8');
      const modelData: AIModelFile = JSON.parse(fileContent);

      // Validate model data
      if (!modelData.weightsData || !modelData.performanceStats) {
        console.warn('[AIFilePersistence] Invalid model data, starting fresh');
        return { weightsData: null, performanceStats: null };
      }

      console.log(
        `[AIFilePersistence] Model loaded - Games: ${modelData.weightsData.gameCount}, Win Rate: ${(modelData.performanceStats.winRate * 100).toFixed(1)}%`
      );

      return {
        weightsData: modelData.weightsData,
        performanceStats: modelData.performanceStats,
      };
    } catch (error) {
      console.error('[AIFilePersistence] Failed to load AI model:', error);
      return { weightsData: null, performanceStats: null };
    }
  }
}

// Singleton instance
export const aiFilePersistenceManager = new AIFilePersistenceManager();
