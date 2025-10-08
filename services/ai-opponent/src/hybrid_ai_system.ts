import { ImprovedReinforcementLearningAI } from './rl_ai';
import type { Constants, GameStateNN } from './types';

// Performance tracking constants
const DEFAULT_RL_WEIGHT = 0.5;
const MAX_RL_WEIGHT = 0.85;
const MIN_RL_WEIGHT = 0.1;
const PERFORMANCE_WINDOW = 50;
const EXCELLENT_WIN_RATE = 0.6;
const GOOD_WIN_RATE = 0.4;
const POOR_WIN_RATE = 0.3;
const BAD_WIN_RATE = 0.2;
const ADAPTATION_THRESHOLD = 10;

// AI decision constants
const CRITICAL_TIME_THRESHOLD = 60;
const CRITICAL_DISTANCE_THRESHOLD = 100;
const DEFENSIVE_DISTANCE_THRESHOLD = 30;
const STRATEGIC_DISTANCE_THRESHOLD = 50;
const RL_OVERRIDE_CHANCE = 0.3;

/**
 * Hybrid AI system that combines reinforcement learning with a strong baseline AI
 * Adapts the blend ratio based on performance metrics
 */
export class HybridAISystem {
  private readonly rlAI: ImprovedReinforcementLearningAI;
  private readonly baselineAI: StrongBaselineAI;

  // Performance tracking
  private rlWeight = DEFAULT_RL_WEIGHT;
  private performanceHistory: number[] = [];
  private gameCount = 0;
  private recentWins = 0;

  constructor(private readonly constants: Constants) {
    this.rlAI = new ImprovedReinforcementLearningAI(constants);
    this.baselineAI = new StrongBaselineAI(constants);
  }

  /**
   * Gets the target Y position by blending RL and baseline AI decisions
   */
  getTargetY(gameState: GameStateNN): number {
    const rlTargetY = this.rlAI.getAction(gameState);
    const baselineTargetY = this.baselineAI.getAction(gameState);

    if (Math.random() < this.rlWeight) {
      return rlTargetY;
    } else {
      return baselineTargetY;
    }
  }

  /**
   * Calculates recent win rate based on performance window
   */
  private getRecentWinRate(): number {
    if (this.performanceHistory.length === 0) {
      return 0;
    }

    const recentGames = this.performanceHistory.slice(-PERFORMANCE_WINDOW);
    const totalWins = recentGames.reduce((sum, result) => sum + result, 0);
    return totalWins / recentGames.length;
  }

  /**
   * Adapts the RL weight based on recent performance
   */
  private adaptRLWeight(): void {
    const recentWinRate = this.getRecentWinRate();

    if (recentWinRate > EXCELLENT_WIN_RATE) {
      // Excellent performance - increase RL contribution
      this.rlWeight = Math.min(MAX_RL_WEIGHT, this.rlWeight + 0.05);
    } else if (recentWinRate > GOOD_WIN_RATE) {
      // Good performance - gradually increase RL
      this.rlWeight = Math.min(MAX_RL_WEIGHT, this.rlWeight + 0.02);
    } else if (recentWinRate < BAD_WIN_RATE) {
      // Poor performance - reduce RL contribution
      this.rlWeight = Math.max(MIN_RL_WEIGHT, this.rlWeight - 0.015);
    } else if (recentWinRate < POOR_WIN_RATE) {
      // Mediocre performance - slightly reduce RL
      this.rlWeight = Math.max(MIN_RL_WEIGHT, this.rlWeight - 0.01);
    }

    // Long-term adaptation: gradually increase RL dominance over time
    if (this.gameCount > ADAPTATION_THRESHOLD) {
      this.applyLongTermAdaptation();
    }
  }

  /**
   * Applies long-term adaptation strategy to gradually increase RL weight
   */
  private applyLongTermAdaptation(): void {
    const experienceBonus = (this.gameCount - ADAPTATION_THRESHOLD) * 0.002;
    const targetWeight = Math.min(MAX_RL_WEIGHT, 0.6 + experienceBonus);

    if (this.rlWeight < targetWeight) {
      this.rlWeight = Math.min(targetWeight, this.rlWeight + 0.01);
    }
  }

  /**
   * Called when AI scores a point
   */
  onAIScore(): void {
    this.rlAI.onAIScore();
    this.recentWins++;
    this.performanceHistory.push(1);
    this.trimPerformanceHistory();
  }

  /**
   * Called when player scores a point
   */
  onPlayerScore(): void {
    this.rlAI.onPlayerScore();
    this.performanceHistory.push(0);
    this.trimPerformanceHistory();
  }

  public async onGameEnd(won: boolean): Promise<void> {
    console.log(`[HybridAI] Game ended - AI ${won ? 'WON' : 'LOST'}`);

    // Aktualisiere Performance-Tracking
    this.performanceHistory.push(won ? 1 : 0);
    this.gameCount++;

    if (won) {
      this.recentWins++;
    }

    // Trimme History
    if (this.performanceHistory.length > PERFORMANCE_WINDOW) {
      this.performanceHistory.shift();
    }

    // Adaptiere RL-Weight basierend auf Performance alle 3 Spiele
    if (this.gameCount % 3 === 0) {
      this.adaptRLWeight();
    }

    // Reset performance tracking periodically
    if (this.gameCount % PERFORMANCE_WINDOW === 0) {
      this.recentWins = 0;
    }

    this.rlAI.onGameEnd(won);
  }

  /**
   * Trims performance history to prevent unlimited growth
   */
  private trimPerformanceHistory(): void {
    if (this.performanceHistory.length > PERFORMANCE_WINDOW * 2) {
      this.performanceHistory = this.performanceHistory.slice(-PERFORMANCE_WINDOW);
    }
  }

  /**
   * Cleanup and save AI state before destruction
   */
  public async cleanup(): Promise<void> {
    console.log('[HybridAI] Performing cleanup and saving RL AI state...');
    if (this.rlAI) {
      await this.rlAI.cleanup();
    }
  }
}

/**
 * Strong baseline AI that uses physics prediction to intercept the ball
 * This serves as a reliable fallback when the RL AI is uncertain
 */
class StrongBaselineAI {
  constructor(private readonly constants: Constants) {}

  /**
   * Calculates optimal paddle position based on ball trajectory prediction
   */
  getAction(gameState: GameStateNN): number {
    if (gameState.ballVX <= 0) return gameState.aiY; // Ball moving away

    const ballDist = this.constants.canvasWidth - this.constants.paddleWidth - gameState.ballX;
    let timeToImpact = ballDist / gameState.ballVX;

    let futureY = gameState.ballY + gameState.ballVY * timeToImpact;
    const period = 2 * this.constants.canvasHeight;

    // Handle wall bounces using reflection
    futureY = ((futureY % period) + period) % period;
    if (futureY > this.constants.canvasHeight) {
      futureY = period - futureY;
    }

    return futureY - this.constants.paddleHeight / 2;
  }
}
