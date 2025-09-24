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
 * Strong baseline AI that uses physics prediction to intercept the ball
 * This serves as a reliable fallback when the RL AI is uncertain
 */
class StrongBaselineAI {
  constructor(private readonly constants: Constants) {}

  /**
   * Calculates optimal paddle position based on ball trajectory prediction
   */
  getAction(gameState: GameStateNN): number {
    const timeToImpact = this.calculateTimeToImpact(gameState);
    
    if (timeToImpact > 0) {
      const predictedY = this.predictBallInterceptY(gameState, timeToImpact);
      return this.calculateOptimalPaddlePosition(predictedY);
    }
    
    // Default to current position if ball is moving away
    return gameState.aiY;
  }

  private calculateTimeToImpact(gameState: GameStateNN): number {
    if (gameState.ballVX <= 0) return -1; // Ball moving away
    
    const distanceToAI = this.constants.canvasWidth - this.constants.paddleWidth - gameState.ballX;
    return distanceToAI / gameState.ballVX;
  }

  private predictBallInterceptY(gameState: GameStateNN, timeToImpact: number): number {
    let futureY = gameState.ballY + gameState.ballVY * timeToImpact;
    const canvasHeight = this.constants.canvasHeight;
    const period = 2 * canvasHeight;

    // Handle wall bounces using reflection
    futureY = ((futureY % period) + period) % period;
    if (futureY > canvasHeight) {
      futureY = period - futureY;
    }
    
    return futureY;
  }

  private calculateOptimalPaddlePosition(interceptY: number): number {
    const paddleCenter = this.constants.paddleHeight / 2;
    return interceptY - paddleCenter;
  }
}

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

    // Use probabilistic selection based on current RL weight
    if (Math.random() < this.rlWeight) {
      // Use RL AI with confidence-based fallback
      return this.shouldTrustRLDecision(gameState) ? rlTargetY : baselineTargetY;
    } else {
      // Use baseline AI as primary with potential RL override
      return this.shouldOverrideBaseline(gameState, rlTargetY, baselineTargetY) 
        ? rlTargetY 
        : baselineTargetY;
    }
  }

  /**
   * Determines whether to trust the RL AI decision based on situation and performance
   */
  private shouldTrustRLDecision(gameState: GameStateNN): boolean {
    const ballDistance = Math.abs(gameState.ballY - (gameState.aiY + this.constants.paddleCenter));
    const timeToImpact = this.calculateTimeToImpact(gameState);
    const recentWinRate = this.getRecentWinRate();

    // Trust RL AI in non-critical situations
    if (timeToImpact > CRITICAL_TIME_THRESHOLD || ballDistance > CRITICAL_DISTANCE_THRESHOLD) {
      return true;
    }

    // Trust RL AI when performance is good
    if (recentWinRate > GOOD_WIN_RATE) {
      return true;
    }

    // Trust RL AI in defensive situations where it might excel
    if (this.isDefensiveSituation(gameState, ballDistance)) {
      return true;
    }

    return false;
  }

  /**
   * Determines whether to override baseline AI with RL AI decision
   */
  private shouldOverrideBaseline(gameState: GameStateNN, rlTargetY: number, baselineTargetY: number): boolean {
    // Only override if RL weight is significant and performance is decent
    if (this.rlWeight < DEFAULT_RL_WEIGHT || this.getRecentWinRate() < POOR_WIN_RATE) {
      return false;
    }

    const ballDistance = Math.abs(gameState.ballY - (gameState.aiY + this.constants.paddleCenter));
    
    // Override in strategic situations where RL might have learned better patterns
    if (ballDistance < STRATEGIC_DISTANCE_THRESHOLD && rlTargetY !== baselineTargetY) {
      return Math.random() < RL_OVERRIDE_CHANCE;
    }

    return false;
  }

  private calculateTimeToImpact(gameState: GameStateNN): number {
    if (gameState.ballVX <= 0) return 999; // Ball moving away
    
    const distanceToAI = gameState.canvasWidth - this.constants.paddleWidth - 
                        this.constants.ballRadius - gameState.ballX;
    return distanceToAI / Math.max(gameState.ballVX, 1e-3);
  }

  private isDefensiveSituation(gameState: GameStateNN, ballDistance: number): boolean {
    return gameState.ballVX < 0 && ballDistance < DEFENSIVE_DISTANCE_THRESHOLD;
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

  /**
   * Called when a game ends
   */
  // onGameEnd(): void {
  //   this.rlAI.onGameEnd();
  //   this.gameCount++;

  //   // Adapt RL weight based on performance every few games
  //   if (this.gameCount % 3 === 0) {
  //     this.adaptRLWeight();
  //   }

  //   // Reset performance tracking periodically
  //   if (this.gameCount % PERFORMANCE_WINDOW === 0) {
  //     this.recentWins = 0;
  //   }
  // }

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
    

    if (won) {
      this.rlAI.onAIScore?.(); // AI hat gewonnen
    } else {
      this.rlAI.onPlayerScore?.(); // AI hat verloren
    }
      
    // Dann den originalen onGameEnd Aufruf
    await this.rlAI.onGameEnd(); // ← OHNE won Parameter
  }

  /**
   * Trims performance history to prevent unlimited growth
   */
  private trimPerformanceHistory(): void {
    if (this.performanceHistory.length > PERFORMANCE_WINDOW * 2) {
      this.performanceHistory = this.performanceHistory.slice(-PERFORMANCE_WINDOW);
    }
  }

  // Getter methods for monitoring and debugging
  public getCurrentRLWeight(): number {
    return this.rlWeight;
  }

  public getGameCount(): number {
    return this.gameCount;
  }

  public getPerformanceStats(): {
    rlWeight: number;
    recentWinRate: number;
    gameCount: number;
    totalGamesTracked: number;
  } {
    return {
      rlWeight: this.rlWeight,
      recentWinRate: this.getRecentWinRate(),
      gameCount: this.gameCount,
      totalGamesTracked: this.performanceHistory.length
    };
  }

  /**
   * Cleanup and save AI state before destruction
   */
  public async cleanup(): Promise<void> {
    console.log('[HybridAI] Performing cleanup and saving RL AI state...');
    if (this.rlAI && typeof this.rlAI.cleanup === 'function') {
      await this.rlAI.cleanup();
    }
  }
}
