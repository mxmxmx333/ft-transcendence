import { ImprovedReinforcementLearningAI } from './improved_rl_ai';
import type { Constants, GameStateNN } from './types';

class StrongBaselineAI {
  constructor(private readonly constants: Constants) {}

  getAction(gameState: GameStateNN): number {
    const dt = (this.constants.canvasWidth - this.constants.paddleWidth - gameState.ballX) / gameState.ballVX;
    if (dt > 0) {
      let futureY = gameState.ballY + gameState.ballVY * dt;
      const period = 2 * this.constants.canvasHeight;

      // Reflect for wall bounces
      futureY = ((futureY % period) + period) % period;
      if (futureY > this.constants.canvasHeight) futureY = period - futureY;
      const errorMargin = 0; // (Math.random() - 0.5) * 100;
      const AITargetY = futureY - this.constants.paddleHeight / 2 - errorMargin;
      return AITargetY;
    }
    return gameState.aiY; // Bleib in der Mitte
  }
}

export class HybridAISystem {
  private rlAI: ImprovedReinforcementLearningAI;
  private baselineAI: StrongBaselineAI;
  private rlWeight = 0.5; // Startet mit 50% RL, 50% Baseline
  private readonly maxRLWeight = 0.85; // Maximum 85% RL
  private readonly minRLWeight = 0.1; // Minimum 10% RL
  private performanceHistory: number[] = [];
  private gameCount = 0;
  private recentWins = 0;
  private readonly performanceWindow = 50; // Bewertung über 10 Spiele

  constructor(private readonly constants: Constants) {
    this.rlAI = new ImprovedReinforcementLearningAI(constants);
    this.baselineAI = new StrongBaselineAI(constants);
  }

  getTargetY(gameState: GameStateNN): number {
    // Beide AIs um Aktionen fragen
    const rlTargetY = this.rlAI.getAction(gameState);
    const baselineTargetY = this.baselineAI.getAction(gameState);

    // Gewichtete Entscheidung oder Confidence-basierte Auswahl
    if (Math.random() < this.rlWeight) {
      return rlTargetY;
      // RL-AI Entscheidung mit Fallback
      // if (this.shouldTrustRLDecision(gameState, rlAction)) {
      //   return rlAction;
      // } else {
      //   // Fallback zu Baseline bei unsicheren Situationen
      //   return baselineAction;
      // }
    } else {
      return baselineTargetY;
      // // Baseline-AI Entscheidung mit RL-Verbesserung
      // if (this.shouldOverrideBaseline(gameState, rlAction, baselineAction)) {
      //   return rlAction;
      // } else {
      //   return baselineAction;
      // }
    }
  }

  private shouldTrustRLDecision(gameState: GameStateNN): boolean {
    // Vertraue RL-AI mehr in weniger kritischen Situationen
    const ballDistance = Math.abs(gameState.ballY - (gameState.aiY + this.constants.paddleCenter));
    const timeToImpact =
      gameState.ballVX > 0
        ? (gameState.canvasWidth -
            this.constants.paddleWidth -
            this.constants.ballRadius -
            gameState.ballX) /
          Math.max(gameState.ballVX, 1e-3)
        : 999; // Zeit bis Ball AI-Seite erreicht

    // Vertraue RL-AI bei:
    // 1. Unkritischen Situationen (Ball weit weg oder lange Zeit)
    // 2. Guter Performance-Historie
    // 3. Defensive Situationen

    if (timeToImpact > 60 || ballDistance > 100) {
      return true; // Unkritisch
    }

    if (this.getRecentWinRate() > 0.4) {
      return true; // Gute Performance
    }

    if (gameState.ballVX < 0 && ballDistance < 30) {
      return true; // Defensive Stärke der RL-AI nutzen
    }

    return false;
  }

  // private shouldOverrideBaseline(
  //   gameState: GameStateNN,
  // ): boolean {
  //   // Override Baseline nur bei starker RL-Confidence und guter Performance
  //   if (this.rlWeight < 0.5) return false; // Zu früh für Override

  //   const recentWinRate = this.getRecentWinRate();
  //   if (recentWinRate < 0.3) return false; // Schlechte Performance

  //   // Override bei strategischen Entscheidungen wo RL-AI besser sein könnte
  //   const ballDistance = Math.abs(gameState.ballY - (gameState.aiY + 50));

  //   // Override wenn RL-AI aggressiver/defensiver spielen will
  //   if (ballDistance < 50 && rlAction !== baselineAction) {
  //     return Math.random() < 0.3; // 30% Chance für RL-Override
  //   }

  //   return false;
  // }

  private getRecentWinRate(): number {
    if (this.performanceHistory.length === 0) return 0;

    const recentGames = this.performanceHistory.slice(-this.performanceWindow);
    const wins = recentGames.reduce((sum, result) => sum + result, 0);
    return wins / recentGames.length;
  }

  private adaptRLWeight() {
    const recentWinRate = this.getRecentWinRate();

    if (recentWinRate > 0.6) {
      // Sehr gute Performance - erhöhe RL-Anteil
      this.rlWeight = Math.min(this.maxRLWeight, this.rlWeight + 0.05);
    } else if (recentWinRate > 0.4) {
      // Gute Performance - sanft erhöhen
      this.rlWeight = Math.min(this.maxRLWeight, this.rlWeight + 0.02);
    } else if (recentWinRate < 0.2) {
      // Schlechte Performance - reduziere RL-Anteil
      this.rlWeight = Math.max(this.minRLWeight, this.rlWeight + 0.015);
    } else if (recentWinRate < 0.3) {
      // Mittelmäßige Performance - leicht reduzieren
      this.rlWeight = Math.max(this.minRLWeight, this.rlWeight + 0.01);
    }

    // Langzeit-Anpassung: Nach 10 Spielen sollte RL dominanter werden
    if (this.gameCount > 10) {
      const targetWeight = 0.6 + (this.gameCount - 50) * 0.002;
      const maxTarget = Math.min(this.maxRLWeight, targetWeight);
      this.rlWeight = Math.max(this.rlWeight, Math.min(maxTarget, this.rlWeight + 0.01));
    }
  }

  onAIScore() {
    this.rlAI.onAIScore();
    this.recentWins++;
    this.performanceHistory.push(1); // Win
    this.trimPerformanceHistory();
  }

  onPlayerScore() {
    this.rlAI.onPlayerScore();
    this.performanceHistory.push(0); // Loss
    this.trimPerformanceHistory();
  }

  onGameEnd() {
    this.rlAI.onGameEnd();
    this.gameCount++;

    // Anpassung der RL-Gewichtung basierend auf Performance
    // if (this.gameCount % 3 === 0) {
    //   this.adaptRLWeight();
    // }

    // Performance-Statistiken zurücksetzen
    if (this.gameCount % this.performanceWindow === 0) {
      this.recentWins = 0;
    }
  }

  private trimPerformanceHistory() {
    if (this.performanceHistory.length > this.performanceWindow * 2) {
      this.performanceHistory = this.performanceHistory.slice(-this.performanceWindow);
    }
  }
}
