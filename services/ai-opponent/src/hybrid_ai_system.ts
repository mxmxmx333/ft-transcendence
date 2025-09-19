import { ImprovedReinforcementLearningAI } from './improved_rl_ai';
import type { Constants } from './game_old';
import { Action } from './game_old';

interface GameState {
  ballX: number;
  ballY: number;
  ballVX: number;
  ballVY: number;
  aiY: number;
  playerY: number;
  canvasWidth: number;
  canvasHeight: number;
  ballSpeed: number;
  gameTime: number;
}

class StrongBaselineAI {
  private lastPrediction = 0;
  private predictionTime = 0;
  constructor(private readonly constants: Constants) {}
  private readonly paddleHeight = this.constants.paddleHeight;
  
  getAction(gameState: GameState): Action {
    const { ballX, ballY, ballVX, ballVY, aiY, canvasWidth, canvasHeight } = gameState;
    const dt = (canvasWidth - this.constants.paddleWidth - ballX) / ballVX;
    if (dt > 0){
      let futureY = ballY + ballVY * dt;
      const period = 2 * canvasHeight;

      // Reflect for wall bounces
      futureY = ((futureY % period) + period) % period;
      if (futureY > canvasHeight) 
        futureY = period - futureY;   
      const errorMargin = 0; // (Math.random() - 0.5) * 100;
      const AITargetY = futureY - (this.paddleHeight / 2) - errorMargin;
      if (AITargetY > aiY + 10) {
        return Action.Down;
      } else if (AITargetY < aiY - 10) {
        return Action.Up;
      } else {
        return Action.Stay;
      }
    }
    return Action.Stay;
  }
}
    
//     // Nur bei Ball Richtung AI-Paddle reagieren oder defensive Positionierung
//     if (ballVX > 0 || ballX > canvasWidth * 0.5) {
//       // Erweiterte Ballvorhersage mit Wandkollisionen
//       const timeToReach = ballVX > 0 ? (canvasWidth - 25 - ballX) / ballVX : 0;
//       let predictedY = this.predictBallYAtPaddle(ballX, ballY, ballVX, ballVY, canvasWidth, canvasHeight);
      
//       // Paddle-Zielposition (Mitte des Paddles sollte Ball treffen)
//       const targetPaddleY = predictedY - this.paddleHeight / 2;
//       const paddleCenter = aiY + this.paddleHeight / 2;
//       const difference = targetPaddleY + this.paddleHeight / 2 - paddleCenter;
      
//       // Schwellwerte für Bewegung (verhindert "Zittern")
//       if (difference > 15) {
//         return Action.Down;
//       } else if (difference < -15) {
//         return Action.Up;
//       } else {
//         return Action.Stay;
//       }
//     } else {
//       // Defensive Zentrierung wenn Ball weg ist
//       const centerY = canvasHeight / 2 - this.paddleHeight / 2;
//       const currentCenter = aiY + this.paddleHeight / 2;
//       const centerDiff = centerY + this.paddleHeight / 2 - currentCenter;
      
//       if (centerDiff > 20) {
//         return Action.Down;
//       } else if (centerDiff < -20) {
//         return Action.Up;
//       } else {
//         return Action.Stay;
//       }
//     }
//   }
  
//   private predictBallYAtPaddle(ballX: number, ballY: number, ballVX: number, ballVY: number, 
//                                canvasWidth: number, canvasHeight: number): number {
//     if (ballVX <= 0) return ballY; // Ball bewegt sich nicht zur AI
    
//     const timeToReachPaddle = (canvasWidth - 25 - ballX) / ballVX;
//     let futureY = ballY + ballVY * timeToReachPaddle;
    
//     // Simuliere Wandkollisionen
//     const bounces = Math.floor(Math.abs(futureY) / canvasHeight);
//     futureY = futureY % canvasHeight;
    
//     if (futureY < 0) {
//       futureY = -futureY;
//     }
    
//     // Gerade Anzahl von Bounces = normale Richtung
//     // Ungerade Anzahl = gespiegelt
//     if (bounces % 2 === 1) {
//       futureY = canvasHeight - futureY;
//     }
    
//     // Erweiterte Physik-Simulation für mehrere Bounces
//     let simY = ballY;
//     let simVY = ballVY;
//     let simTime = 0;
//     const dt = 0.5; // Kleinere Zeitschritte für Genauigkeit
    
//     while (simTime < timeToReachPaddle) {
//       simY += simVY * dt;
//       simTime += dt;
      
//       // Wandkollision
//       if (simY <= 0 || simY >= canvasHeight) {
//         simVY *= -1;
//         simY = Math.max(0, Math.min(canvasHeight, simY));
//       }
//     }
    
//     return Math.max(0, Math.min(canvasHeight, simY));
//   }
// }

export class HybridAISystem {
  private rlAI: ImprovedReinforcementLearningAI;
  private baselineAI: StrongBaselineAI;
  private rlWeight = 0.2; // Startet mit 50% RL, 50% Baseline
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
  
  getAction(gameState: GameState): Action {
    // Beide AIs um Aktionen fragen
    const rlAction = this.rlAI.getAction(gameState);
    const baselineAction = this.baselineAI.getAction(gameState);
    
    // Gewichtete Entscheidung oder Confidence-basierte Auswahl
    if (Math.random() < this.rlWeight) {
      return rlAction;
      // RL-AI Entscheidung mit Fallback
      // if (this.shouldTrustRLDecision(gameState, rlAction)) {
      //   return rlAction;
      // } else {
      //   // Fallback zu Baseline bei unsicheren Situationen
      //   return baselineAction;
      // }
    } else {
      return baselineAction;
      // // Baseline-AI Entscheidung mit RL-Verbesserung
      // if (this.shouldOverrideBaseline(gameState, rlAction, baselineAction)) {
      //   return rlAction;
      // } else {
      //   return baselineAction;
      // }
    }
  }
  
  private shouldTrustRLDecision(gameState: GameState, rlAction: Action): boolean {
    // Vertraue RL-AI mehr in weniger kritischen Situationen
    const ballDistance = Math.abs(gameState.ballY - (gameState.aiY + this.constants.paddleCenter));
    const timeToImpact = gameState.ballVX > 0 ? (gameState.canvasWidth - this.constants.paddleWidth - this.constants.ballRadius - gameState.ballX) / Math.max(gameState.ballVX, 1e-3) : 999; // Zeit bis Ball AI-Seite erreicht
    
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
  
  private shouldOverrideBaseline(gameState: GameState, rlAction: Action, baselineAction: Action): boolean {
    // Override Baseline nur bei starker RL-Confidence und guter Performance
    if (this.rlWeight < 0.5) return false; // Zu früh für Override
    
    const recentWinRate = this.getRecentWinRate();
    if (recentWinRate < 0.3) return false; // Schlechte Performance
    
    // Override bei strategischen Entscheidungen wo RL-AI besser sein könnte
    const ballDistance = Math.abs(gameState.ballY - (gameState.aiY + 50));
    
    // Override wenn RL-AI aggressiver/defensiver spielen will
    if (ballDistance < 50 && rlAction !== baselineAction) {
      return Math.random() < 0.3; // 30% Chance für RL-Override
    }
    
    return false;
  }
  
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
  
  // getStats() {
  //   const rlStats = this.rlAI.getStats();
  //   const recentWinRate = this.getRecentWinRate();
    
  //   return {
  //     ...rlStats,
  //     rlWeight: (this.rlWeight * 100).toFixed(1),
  //     baselineWeight: ((1 - this.rlWeight) * 100).toFixed(1),
  //     recentWinRate: (recentWinRate * 100).toFixed(1),
  //     systemMode: this.rlWeight > 0.5 ? 'RL-Dominant' : 'Baseline-Dominant',
  //     adaptivePhase: this.gameCount < 20 ? 'Learning' : 
  //                    this.gameCount < 50 ? 'Adapting' : 'Optimizing'
  //   };
  // }
  
  // // Manueller Reset für Testing
  // resetToBaseline() {
  //   this.rlWeight = 0.1;
  //   this.performanceHistory = [];
  //   this.gameCount = 0;
  //   this.recentWins = 0;
  // }
  
  // // Force RL-Mode für Advanced Players
  // forceRLMode() {
  //   this.rlWeight = 0.8;
  // }
  
  // // Get current strategy info
  // getCurrentStrategy(): string {
  //   if (this.rlWeight < 0.3) {
  //     return "🛡️ Defensive Baseline (Learning Phase)";
  //   } else if (this.rlWeight < 0.5) {
  //     return "⚖️ Balanced Hybrid (Adapting Phase)";
  //   } else if (this.rlWeight < 0.7) {
  //     return "🧠 RL-Focused (Smart Phase)";
  //   } else {
  //     return "🚀 Advanced RL (Master Phase)";
  //   }
  // }
}