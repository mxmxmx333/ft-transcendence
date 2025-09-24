import fs from 'fs/promises';
import path from 'path';

// Interface for AI model data
interface SerializedWeights {
  weights1: number[][];
  weights2: number[][];
  weights3: number[][];
  bias1: number[];
  bias2: number[];
  bias3: number[];
  epsilon: number;
  gameCount: number;
  winCount: number;
  aggressionLevel: number;
  totalReward: number;
}

interface PerformanceStats {
  winRate: number;
  averageReward: number;
  recentGames: number[];
  lastGameTimestamp: number;
}

interface AIModelFile {
  version: number;
  timestamp: string;
  weightsData: SerializedWeights;
  performanceStats: PerformanceStats;
}

export class AIFilePersistenceManager {
private readonly ENABLE_BACKUPS = false;
  private readonly MODEL_DIR = 'services/ai-opponent/ai_models';
  private readonly GLOBAL_MODEL_FILE = 'global_ai_model.json';
  private readonly BACKUP_DIR = 'services/ai-opponent/ai_models/backups';
  private initialized = false;

  constructor() {
    this.initialize();
  }

  /**
   * Initialize directories if they don't exist
   */
  private async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Create directories if they don't exist
      await fs.mkdir(this.MODEL_DIR, { recursive: true });
      await fs.mkdir(this.BACKUP_DIR, { recursive: true });
      
      this.initialized = true;
      console.log('[AIFilePersistence] Directories initialized');
    } catch (error) {
      console.error('[AIFilePersistence] Failed to initialize directories:', error);
    }
  }

  /**
   * Save AI model weights and performance data to JSON file
   */
  async saveAIModel(weightsData: SerializedWeights, performanceStats: PerformanceStats): Promise<void> {
    try {
      await this.initialize();

      // Create backup of existing model first
      if (this.ENABLE_BACKUPS) {
        await this.createBackup();
      }

      const modelData: AIModelFile = {
        version: Date.now(), // Use timestamp as version
        timestamp: new Date().toISOString(),
        weightsData,
        performanceStats,
      };

      const filePath = path.join(this.MODEL_DIR, this.GLOBAL_MODEL_FILE);
      await fs.writeFile(filePath, JSON.stringify(modelData, null, 2));
      
      console.log(`[AIFilePersistence] Model saved - Games: ${weightsData.gameCount}, Win Rate: ${(performanceStats.winRate * 100).toFixed(1)}%`);
    } catch (error) {
      console.error('[AIFilePersistence] Failed to save AI model:', error);
      throw error;
    }
  }

  /**
   * Load AI model weights and performance data from JSON file
   */
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

      console.log(`[AIFilePersistence] Model loaded - Games: ${modelData.weightsData.gameCount}, Win Rate: ${(modelData.performanceStats.winRate * 100).toFixed(1)}%`);
      
      return {
        weightsData: modelData.weightsData,
        performanceStats: modelData.performanceStats,
      };
    } catch (error) {
      console.error('[AIFilePersistence] Failed to load AI model:', error);
      return { weightsData: null, performanceStats: null };
    }
  }

  /**
   * Create a backup of the current model
   */
  private async createBackup(): Promise<void> {
    try {
      const sourcePath = path.join(this.MODEL_DIR, this.GLOBAL_MODEL_FILE);
      
      // Check if source file exists
      try {
        await fs.access(sourcePath);
      } catch {
        // No existing model to backup
        return;
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(this.BACKUP_DIR, `ai_model_backup_${timestamp}.json`);
      
      await fs.copyFile(sourcePath, backupPath);
      console.log(`[AIFilePersistence] Backup created: ${backupPath}`);

      // Clean old backups (keep only last 10)
      await this.cleanOldBackups();
    } catch (error) {
      console.warn('[AIFilePersistence] Failed to create backup:', error);
    }
  }

  /**
   * Clean old backups, keep only the 10 most recent
   */
  private async cleanOldBackups(): Promise<void> {
    try {
      const files = await fs.readdir(this.BACKUP_DIR);
      const backupFiles = files
        .filter(file => file.startsWith('ai_model_backup_') && file.endsWith('.json'))
        .sort()
        .reverse(); // Most recent first

      // Keep only the 10 most recent backups
      const filesToDelete = backupFiles.slice(10);
      
      for (const file of filesToDelete) {
        await fs.unlink(path.join(this.BACKUP_DIR, file));
      }

      if (filesToDelete.length > 0) {
        console.log(`[AIFilePersistence] Cleaned ${filesToDelete.length} old backups`);
      }
    } catch (error) {
      console.warn('[AIFilePersistence] Failed to clean old backups:', error);
    }
  }

  /**
   * Get model statistics
   */
  async getModelStats(): Promise<{
    totalGames: number;
    totalWins: number;
    winRate: number;
    lastUpdated: Date | null;
    modelVersion: number;
  }> {
    try {
      const { weightsData, performanceStats } = await this.loadAIModel();
      
      if (!weightsData || !performanceStats) {
        return {
          totalGames: 0,
          totalWins: 0,
          winRate: 0,
          lastUpdated: null,
          modelVersion: 0,
        };
      }

      return {
        totalGames: weightsData.gameCount,
        totalWins: weightsData.winCount,
        winRate: weightsData.gameCount > 0 ? (weightsData.winCount / weightsData.gameCount) * 100 : 0,
        lastUpdated: new Date(performanceStats.lastGameTimestamp),
        modelVersion: 1, // Simple version numbering
      };
    } catch (error) {
      console.error('[AIFilePersistence] Failed to get model stats:', error);
      return {
        totalGames: 0,
        totalWins: 0,
        winRate: 0,
        lastUpdated: null,
        modelVersion: 0,
      };
    }
  }

  /**
   * Delete the saved model (for testing/reset purposes)
   */
  async resetModel(): Promise<void> {
    try {
      const filePath = path.join(this.MODEL_DIR, this.GLOBAL_MODEL_FILE);
      await fs.unlink(filePath);
      console.log('[AIFilePersistence] Model reset successfully');
    } catch (error) {
      console.log('[AIFilePersistence] No model to reset or error:', error);
    }
  }
}

// Singleton instance
export const aiFilePersistenceManager = new AIFilePersistenceManager();