import { Constants } from './types';
import type { GameStateNN, Experience } from './types';
import { aiFilePersistenceManager } from './aiFilePersistenceManager';

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
  totalReward: number;
}

interface PerformanceStats {
  winRate: number;
  averageReward: number;
  recentGames: number[];
  lastGameTimestamp: number;
}

class ImprovedNeuralNetwork {
  private weights1!: number[][];
  private weights2!: number[][];
  private weights3!: number[][];
  private bias1!: number[];
  private bias2!: number[];
  private bias3!: number[];
  private readonly inputSize = 11; // Erweiterte Eingabe
  private readonly hiddenSize1 = 32; // Größeres Netzwerk
  private readonly hiddenSize2 = 16;
  private readonly outputSize = 1;

  // Momentum für besseres Lernen
  private momentum1: number[][] = [];
  private momentum2: number[][] = [];
  private momentum3: number[][] = [];
  private momentumBias1: number[] = [];
  private momentumBias2: number[] = [];
  private momentumBias3: number[] = [];
  private readonly momentumRate = 0.9;

  constructor() {
    this.initializeWeights();
    this.initializeMomentum();
  }

  private initializeWeights() {
    // Xavier/Glorot Initialisierung für bessere Konvergenz (Vermeidung von zu großen Anfangsgewichten, ist damit ±√(2/inputs) ~0.427) -> Gradienten explodieren/verschwinden nicht 
    const xavierScale1 = Math.sqrt(2.0 / this.inputSize);
    const xavierScale2 = Math.sqrt(2.0 / this.hiddenSize1);
    const xavierScale3 = Math.sqrt(6.0 / this.hiddenSize2);

    this.weights1 = this.createMatrix(
      this.inputSize,
      this.hiddenSize1,
      () => (Math.random() - 0.5) * 2 * xavierScale1
    );
    this.weights2 = this.createMatrix(
      this.hiddenSize1,
      this.hiddenSize2,
      () => (Math.random() - 0.5) * 2 * xavierScale2
    );
    this.weights3 = this.createMatrix(
      this.hiddenSize2,
      this.outputSize,
      () => (Math.random() - 0.5) * 2 * xavierScale3
    );

    // Bias1 mit kleinen zufälligen Werten initialisieren weil sonst die Neuronen zu ähnlich reagieren (bei 0), bzw. das bias sonst die Aktivierungsfunktion zu stark (in den negativen Bereich) verschiebt (bei -1 bis 1) --> die Aktivierung muss vom Input abhängen, nicht vom Bias!
    this.bias1 = new Array(this.hiddenSize1).fill(0).map(() => (Math.random() - 0.5) * 0.2);
    this.bias2 = new Array(this.hiddenSize2).fill(0).map(() => (Math.random() - 0.5) * 0.2);
    this.bias3 = new Array(this.outputSize).fill(0).map(() => (Math.random() - 0.5) * 4.0);
  }

  private initializeMomentum() {
    this.momentum1 = this.createMatrix(this.inputSize, this.hiddenSize1, () => 0);
    this.momentum2 = this.createMatrix(this.hiddenSize1, this.hiddenSize2, () => 0);
    this.momentum3 = this.createMatrix(this.hiddenSize2, this.outputSize, () => 0);

    // Momentum mit 0 initialisieren weil sonst die Updates nicht korrekt sind (gibt sonst zu viele & arge zufällige Sprünge am Anfang)
    this.momentumBias1 = new Array(this.hiddenSize1).fill(0);
    this.momentumBias2 = new Array(this.hiddenSize2).fill(0);
    this.momentumBias3 = new Array(this.outputSize).fill(0);
  }

  private createMatrix(rows: number, cols: number, initializer: () => number): number[][] {
    return Array(rows)
      .fill(0)
      .map(() => Array(cols).fill(0).map(initializer));
  }

  private leakyRelu(x: number): number {
    return x > 0 ? x : 0.01 * x; // Leaky ReLU statt ReLU
  }

  forward(input: number[]): number[] {
    // Layer 1 (input -> hidden1)
    const hidden1: number[] = new Array(this.hiddenSize1);
    for (let j = 0; j < this.hiddenSize1; j++) {
      let sum = this.bias1[j]; // sum = bias + (weight1 * input1) + (weight2 * input2) + ...
      for (let i = 0; i < this.inputSize; i++) {
        sum += input[i] * this.weights1[i][j];
      }
      // hier leakyRelu weil wir negative Werte nicht einfach auf 0 setzen wollen, das wären dann "Dead Neurons" (sonst könnten ganze Neuronen nicht mehr lernen wenn sie einmal im negativen Bereich sind)
      hidden1[j] = this.leakyRelu(sum);
    }

    // Layer 2 (hidden1 -> hidden2)
    const hidden2: number[] = new Array(this.hiddenSize2);
    for (let j = 0; j < this.hiddenSize2; j++) {
      let sum = this.bias2[j];
      for (let i = 0; i < this.hiddenSize1; i++) {
        sum += hidden1[i] * this.weights2[i][j];
      }
      // hier leakyRelu weil wir negative Werte nicht einfach auf 0 setzen wollen, das wären dann "Dead Neurons" und somit schnell & robust aktivieren
      hidden2[j] = this.leakyRelu(sum);
    }

    const output: number[] = new Array(this.outputSize);
    for (let j = 0; j < this.outputSize; j++) {
      let sum = this.bias3[j];
      for (let i = 0; i < this.hiddenSize2; i++) {
        sum += hidden2[i] * this.weights3[i][j];
      }
      // Sigmoid für Output weil es einen Bereich zwischen 0 & 1 garantiert (normalisierte Y-Position, Sigmoid-Kurve ist S-förmig, damit sind sehr große zahlen sehr nah am Rand und sehr kleine auch, aber das paddel kann auch tatschlich eigentlich nie den Rand erreichen?), damit Paddle immer im sichtbaren Bereich bleibt
      output[j] = 1 / (1 + Math.exp(-sum));
    }
    return output;
  }

  updateWeights(experiences: Experience[], learningRate: number = 0.02) {
    experiences.sort((a, b) => b.priority - a.priority);
    const batchSize = Math.min(8, experiences.length);
    const batch = experiences.slice(0, batchSize);

    for (const exp of batch) {
      const predicted = this.forward(exp.state)[0]; // Vorhergesagte Y-Position
      const target = exp.targetY; // Gewünschte Y-Position

      const error = target - predicted;
      exp.priority = Math.abs(error) + 0.01;

      this.backpropagate(exp.state, target, error, learningRate);
    }
  }

  private backpropagate(state: number[], target: number, error: number, lr: number) {
    // Forward pass um hidden values zu bekommen
    const hidden1: number[] = new Array(this.hiddenSize1);
    for (let j = 0; j < this.hiddenSize1; j++) {
      let sum = this.bias1[j];
      for (let i = 0; i < this.inputSize; i++) sum += state[i] * this.weights1[i][j];
      hidden1[j] = this.leakyRelu(sum);
    }

    const hidden2: number[] = new Array(this.hiddenSize2);
    for (let j = 0; j < this.hiddenSize2; j++) {
      let sum = this.bias2[j];
      for (let i = 0; i < this.hiddenSize1; i++) sum += hidden1[i] * this.weights2[i][j];
      hidden2[j] = this.leakyRelu(sum);
    }

    // Output layer (Sigmoid)
    let outputSum = this.bias3[0];
    for (let i = 0; i < this.hiddenSize2; i++) {
      outputSum += hidden2[i] * this.weights3[i][0];
    }
    const output = 1 / (1 + Math.exp(-outputSum));

    // Output delta für Sigmoid: error * sigmoid'(x) = error * output * (1 - output)
    const delta3 = error * output * (1 - output);

    // Update output bias und weights
    this.momentumBias3[0] =
      this.momentumRate * this.momentumBias3[0] + (1 - this.momentumRate) * (lr * delta3);
    this.bias3[0] += this.momentumBias3[0];

    for (let i = 0; i < this.hiddenSize2; i++) {
      if (!this.momentum3[i]) this.momentum3[i] = new Array(this.outputSize).fill(0);
      const gradW3 = lr * delta3 * hidden2[i];
      this.momentum3[i][0] =
        this.momentumRate * this.momentum3[i][0] + (1 - this.momentumRate) * gradW3;
      this.weights3[i][0] += this.momentum3[i][0];
    }

    // Hidden layer 2 deltas
    const delta2: number[] = new Array(this.hiddenSize2);
    for (let j = 0; j < this.hiddenSize2; j++) {
      const deriv = hidden2[j] > 0 ? 1 : 0.01; // leakyReLU'
      delta2[j] = deriv * (this.weights3[j][0] * delta3);
    }

    // Update hidden layer 2
    for (let j = 0; j < this.hiddenSize2; j++) {
      this.momentumBias2[j] =
        this.momentumRate * this.momentumBias2[j] + (1 - this.momentumRate) * (lr * delta2[j]);
      this.bias2[j] += this.momentumBias2[j];

      for (let i = 0; i < this.hiddenSize1; i++) {
        if (!this.momentum2[i]) this.momentum2[i] = new Array(this.hiddenSize2).fill(0);
        const gradW2 = lr * delta2[j] * hidden1[i];
        this.momentum2[i][j] =
          this.momentumRate * this.momentum2[i][j] + (1 - this.momentumRate) * gradW2;
        this.weights2[i][j] += this.momentum2[i][j];
      }
    }

    // Hidden layer 1 deltas und Updates
    const delta1: number[] = new Array(this.hiddenSize1);
    for (let i = 0; i < this.hiddenSize1; i++) {
      let backError = 0;
      for (let j = 0; j < this.hiddenSize2; j++) {
        backError += this.weights2[i][j] * delta2[j];
      }
      const deriv = hidden1[i] > 0 ? 1 : 0.01; // leakyReLU'
      delta1[i] = deriv * backError;
    }

    // Update hidden layer 1 (bias1 und weights1)
    for (let i = 0; i < this.hiddenSize1; i++) {
      this.momentumBias1[i] = this.momentumRate * this.momentumBias1[i] + (1 - this.momentumRate) * (lr * delta1[i]);
      this.bias1[i] += this.momentumBias1[i];

      for (let j = 0; j < this.inputSize; j++) {
        if (!this.momentum1[j]) this.momentum1[j] = new Array(this.hiddenSize1).fill(0);
        const gradW1 = lr * delta1[i] * state[j];
        this.momentum1[j][i] = this.momentumRate * this.momentum1[j][i] + (1 - this.momentumRate) * gradW1;
        this.weights1[j][i] += this.momentum1[j][i];
      }
    }
  }

  /**
   * Serialize network weights and biases for persistence
   */
  serializeWeights(): {
    weights1: number[][];
    weights2: number[][];
    weights3: number[][];
    bias1: number[];
    bias2: number[];
    bias3: number[];
  } {
    return {
      weights1: this.weights1.map(row => [...row]),
      weights2: this.weights2.map(row => [...row]),
      weights3: this.weights3.map(row => [...row]),
      bias1: [...this.bias1],
      bias2: [...this.bias2],
      bias3: [...this.bias3],
    };
  }

  /**
   * Load weights and biases from serialized data
   */
  loadWeights(data: {
    weights1: number[][];
    weights2: number[][];
    weights3: number[][];
    bias1: number[];
    bias2: number[];
    bias3: number[];
  }): void {
    // Validate dimensions before loading
    if (data.weights1.length !== this.inputSize ||
        data.weights1[0]?.length !== this.hiddenSize1 ||
        data.weights2.length !== this.hiddenSize1 ||
        data.weights2[0]?.length !== this.hiddenSize2 ||
        data.weights3.length !== this.hiddenSize2 ||
        data.weights3[0]?.length !== this.outputSize) {
      console.warn('[NeuralNetwork] Weight dimensions mismatch, reinitializing...');
      this.initializeWeights();
      return;
    }

    try {
      this.weights1 = data.weights1.map(row => [...row]);
      this.weights2 = data.weights2.map(row => [...row]);
      this.weights3 = data.weights3.map(row => [...row]);
      this.bias1 = [...data.bias1];
      this.bias2 = [...data.bias2];
      this.bias3 = [...data.bias3];
      
      console.log('[NeuralNetwork] Weights loaded successfully');
    } catch (error) {
      console.error('[NeuralNetwork] Failed to load weights:', error);
      this.initializeWeights();
    }
  }
}

export class ImprovedReinforcementLearningAI {
  private network: ImprovedNeuralNetwork;
  private experienceBuffer: Experience[] = [];
  private readonly maxBufferSize = 200; // Größerer Puffer
  private epsilon = 0.4; // Höhere initiale Exploration
  private readonly epsilonDecay = 0.998; // Langsamere Reduktion
  private readonly minEpsilon = 0.02; // Niedrigere minimale Exploration
  private lastState: number[] | null = null;
  private lastY: number = 0;
  private gameCount = 0;
  private winCount = 0;
  private totalReward = 0;

  // Strategische Variablen
  private consecutiveLosses = 0;
  
  // Persistenz-Eigenschaften
  private recentGames: number[] = []; // 1 für Sieg, 0 für Niederlage
  private lastSaveTime = 0;
  private readonly SAVE_INTERVAL = 3000; // 3 Sekunden
  private isLoading = false;
  private initialized = false;

  constructor(private readonly constants: Constants) {
    this.network = new ImprovedNeuralNetwork();
    this.initializeFromPersistence();
  }

  /**
   * Initialize AI from persisted data if available
   */
  private async initializeFromPersistence(): Promise<void> {
    if (this.isLoading || this.initialized) return;
    
    this.isLoading = true;
    try {
      console.log('[RL-AI] Loading persisted model from files...');
      const { weightsData, performanceStats } = await aiFilePersistenceManager.loadAIModel();
      
      if (weightsData && performanceStats) {
        // Load network weights
        this.network.loadWeights({
          weights1: weightsData.weights1,
          weights2: weightsData.weights2,
          weights3: weightsData.weights3,
          bias1: weightsData.bias1,
          bias2: weightsData.bias2,
          bias3: weightsData.bias3,
        });
        
        // Load AI state
        this.epsilon = weightsData.epsilon;
        this.gameCount = weightsData.gameCount;
        this.winCount = weightsData.winCount;
        this.totalReward = weightsData.totalReward;
        this.recentGames = performanceStats.recentGames || [];
        
        console.log(`[RL-AI] Model loaded successfully - Games: ${this.gameCount}, Win Rate: ${((this.winCount / Math.max(this.gameCount, 1)) * 100).toFixed(1)}%`);
      } else {
        console.log('[RL-AI] No persisted model found, starting fresh');
      }
    } catch (error) {
      console.error('[RL-AI] Failed to load persisted model:', error);
    } finally {
      this.isLoading = false;
      this.initialized = true;
    }
  }

  private normalizeGameState(state: GameStateNN): number[] {
    const { ballX, ballY, ballVX, ballVY, aiY, playerY, canvasWidth, canvasHeight, ballSpeed } =
      state;

    // Erweiterte Feature-Extraktion
    const ballNormX = ballX / canvasWidth;
    const ballNormY = ballY / canvasHeight;
    const ballNormVX = ballVX / 20; // Math.max(-1, Math.min(1, ballVX / this.constants.MAX_BALL_SPEED)); // ist zur Sicherheit, falls ballVX doch mall zu groß wird (ballVX = ballSpeed * cos(angle))
    const ballNormVY = ballVY / 20; // Math.max(-1, Math.min(1, ballVY / this.constants.MAX_BALL_SPEED));
    const aiNormY = aiY / (canvasHeight - this.constants.paddleHeight);
    const playerNormY = playerY / (canvasHeight - this.constants.paddleHeight);

    const ballToAI = (ballY - (aiY + this.constants.paddleHeight / 2)) / canvasHeight; // -1 bis +1
    const ballToPlayer = (ballY - (playerY + this.constants.paddleHeight / 2)) / canvasHeight; // -1 bis +1
    
    // Verschiedene Zeitskalen für Vorhersage
    const shortTermY = this.predictBallPosition(state, 15) / canvasHeight; // 0-1
    const mediumTermY = this.predictBallPosition(state, 30) / canvasHeight; // 0-1
    const longTermY = this.predictBallPosition(state, 60) / canvasHeight; // 0-1

    // // Strategische Features
    // const timeToReachAI =
    //   ballVX > 0
    //     ? (canvasWidth - this.constants.paddleWidth - this.constants.ballRadius - ballX) /
    //       Math.max(ballVX, 1e-3)
    //     : 999; // Zeit bis Ball AI-Seite erreicht
    // // Zeit = Strecke / Geschwindigkeit: Strecke bis zur AI-Kollisionslinie in Pixeln & Horizontale Geschwindigkeit vx in Pixel/Frame
    // // const timeToReachAI = ballVX > 0 ? (canvasWidth - this.constants.MAX_BALL_SPEED - ballX) / Math.max(ballVX, 1) : 999; //Zeit = Strecke / Geschwindigkeit
    // const predictedBallY = this.predictBallPosition(state, Math.min(timeToReachAI, 60));
    // const distanceToOptimal =
    //   Math.abs(aiY + this.constants.paddleHeight / 2 - predictedBallY) / canvasHeight;
    // const relativeSpeed = ballSpeed / this.constants.MAX_BALL_SPEED;

    // // Defensive/Offensive Indikatoren
    // const isDefensive = ballVX < 0 ? 1 : 0; // 1 wenn Ball auf AI zukommt, sonst 0
    // const urgency = Math.max(0, 1 - timeToReachAI / 60); // Dringlichkeit basierend auf Zeit

    return [
      ballNormX,           // 0-1
      ballNormY,           // 0-1  
      ballNormVX,          // -1 bis +1 (nicht geclampt)
      ballNormVY,          // -1 bis +1 (nicht geclampt)
      aiNormY,             // 0-1
      playerNormY,         // 0-1
      ballToAI,            // -1 bis +1
      ballToPlayer,        // -1 bis +1
      shortTermY,          // 0-1
      mediumTermY,         // 0-1
      longTermY            // 0-1
    ];
  }

  private predictBallPosition(state: GameStateNN, frames: number): number {
    let futureX = state.ballX;
    let futureY = state.ballY;
    let futureVX = state.ballVX;
    let futureVY = state.ballVY;

    for (let i = 0; i < frames; i++) {
      futureX += futureVX;
      futureY += futureVY;

      // Wandkollisionen simulieren
      if (futureY <= 0 || futureY >= state.canvasHeight) {
        futureVY *= -1;
        futureY = Math.max(0, Math.min(state.canvasHeight, futureY));
      }

      // Wenn Ball AI-Seite erreicht
      if (futureX >= state.canvasWidth - this.constants.paddleWidth - this.constants.ballRadius) {
        break;
      }
    }

    return Math.max(0, Math.min(state.canvasHeight, futureY));
  }

  private calculateAdvancedReward(
    state: GameStateNN,
    lastTargetY: number,
    nextState: GameStateNN
  ): number {
    let reward = 0;

    // Grundbelohnung für Ballnähe (wichtigster Faktor)
    const ballDistance = Math.abs(state.ballY - (state.aiY + this.constants.paddleCenter));
    const nextBallDistance = Math.abs(nextState.ballY - (nextState.aiY + this.constants.paddleCenter));
    const distanceImprovement = ballDistance - nextBallDistance;

    if (distanceImprovement > 2) {
      reward += 0.3 * (distanceImprovement / 30); // Stärkere Belohnung für Verbesserung
    } else if (distanceImprovement < -2) {
      reward -= 0.15 * (Math.abs(distanceImprovement) / 30);
    }

    // Prädiktive Positionierung
    const predictedY = this.predictBallPosition(state, 30);
    const optimalPosition = predictedY - this.constants.paddleCenter;
    const currentOptimality = Math.abs(state.aiY - optimalPosition);
    const nextOptimality = Math.abs(nextState.aiY - optimalPosition);
    const movementDistance = Math.abs(nextState.aiY - state.aiY);

    // Nur belohnen wenn sich AI bewegt UND dabei näher zum Optimum kommt
    if (movementDistance > 1 && nextOptimality < currentOptimality - 3) {
      reward += 0.4 * (currentOptimality - nextOptimality) / 50; // Bewegungsabhängige Belohnung
    }

    // Rechtzeitige Reaktion auf Ball-Richtungsänderung
    const timeToImpact = state.ballVX > 0 ? (state.canvasWidth - state.ballX) / Math.max(state.ballVX, 1) : 999;
    if (timeToImpact < 60 && movementDistance > 2) {
      // Belohne schnelle Reaktion bei herannahender Kollision
      const urgencyBonus = Math.max(0, (60 - timeToImpact) / 60);
      reward += 0.3 * urgencyBonus * (movementDistance / 20);
    }

    // Strafe für Bewegung zur falschen Zeit
    if (state.ballVX < 0 && Math.abs(state.ballX - (state.canvasWidth * 0.8)) > 100) {
      // Ball ist weit weg und bewegt sich weg von AI
      if (movementDistance > 10) {
        reward -= 0.1; // Leichte Strafe für unnötige Bewegung
      }
    }

    // Defensive Bonus - nur für gute Positionierung bei Annäherung
    if (state.ballVX < 0) {
      const ballDistanceToAI = Math.abs(nextState.ballY - (nextState.aiY + this.constants.paddleCenter));
      const timeToImpact = (state.ballX) / Math.max(Math.abs(state.ballVX), 1);
      
      if (timeToImpact < 30 && ballDistanceToAI < 40) {
        // Hohe Belohnung für perfekte Timing-Positionierung
        reward += 0.6 * (1 - ballDistanceToAI / 40) * (1 - timeToImpact / 30);
      }
    }

    // Offensive Bonus - Ball Richtung Spieler lenken
    if (state.ballVX > 0 && state.ballX > state.canvasWidth * 0.7) {
      const targetArea = state.playerY + this.constants.paddleCenter; // Ziel ist die Mitte des Spieler-Schlägers
      if (Math.abs(state.ballY - targetArea) > Math.abs(nextState.ballY - targetArea)) {
        reward += 0.05
      }
    }

    // Grenzstrafen
    if (nextState.aiY < 0 || nextState.aiY > state.canvasHeight - this.constants.paddleHeight) {
      reward -= 0.4;
    }

    // Tempo-Anpassung - Belohne präzise Bewegungen bei hoher Geschwindigkeit
    if (state.ballSpeed > 12 && movementDistance > 1) {
      const precisionBonus = Math.max(0, 1 - Math.abs(distanceImprovement) / 10);
      reward += 0.15 * precisionBonus; // Bonus für kontrollierte Bewegung bei hohem Tempo
    }

    return reward;
  }

  getAction(gameState: GameStateNN): number {
    const normalizedState = this.normalizeGameState(gameState);

    // Experience aus vorheriger Aktion speichern
    if (this.lastState !== null) {
      const reward = this.calculateAdvancedReward(
        this.denormalizeState(this.lastState, gameState),
        this.lastY,
        gameState
      );

      this.totalReward += reward;

      const optimalY = this.predictBallPosition(gameState, 30);
      const optimalTarget = Math.max(0, Math.min(1, optimalY / gameState.canvasHeight));

      const experience: Experience = {
        state: this.lastState,
        targetY: optimalTarget, // Normalisiert für Training
        reward: reward,
        nextState: normalizedState,
        done: false,
        priority: Math.abs(reward) + 0.1,
      };

      this.addExperience(experience);
    }

    // Neural Network Vorhersage
    const prediction = this.network.forward(normalizedState)[0]; // Wert zwischen 0 und 1
    let targetY = prediction * gameState.canvasHeight; // Denormalisieren

    // Epsilon-Greedy mit kontinuierlicher Exploration
    if (Math.random() < this.epsilon) {
      // Exploration: Zufällige Sigmoid-Inputs statt Output-Variation
      const randomTarget = Math.random(); // 0-1 für volles Spektrum
      return randomTarget * gameState.canvasHeight;
    } else {
      // Reset bei schlechter Performance
      if (this.consecutiveLosses > 8) {
        console.log('[RL-AI] Poor performance detected, increasing exploration...');
        this.epsilon = Math.min(0.8, this.epsilon * 1.5); // Mehr Exploration
        
        // Aggressiveres Training statt Bias-Anpassung
        if (this.experienceBuffer.length > 3) {
          this.network.updateWeights(this.experienceBuffer, 0.1); // Hohe Learning Rate
        }
        
        this.consecutiveLosses = 0; // Reset counter
      }
    }

    // Begrenze auf gültigen Bereich
    targetY = Math.max(0, Math.min(gameState.canvasHeight - this.constants.paddleHeight, targetY));

    // State für nächste Iteration speichern
    this.lastState = [...normalizedState];
    this.lastY = targetY;

    // Epsilon Decay
    this.epsilon = Math.max(this.minEpsilon, this.epsilon * this.epsilonDecay);

    return targetY;
  }

  private denormalizeState(normalizedState: number[], currentState: GameStateNN): GameStateNN {
    return {
      ballX: normalizedState[0] * currentState.canvasWidth,
      ballY: normalizedState[1] * currentState.canvasHeight,
      ballVX: normalizedState[2] * this.constants.MAX_BALL_SPEED,
      ballVY: normalizedState[3] * this.constants.MAX_BALL_SPEED,
      aiY: normalizedState[4] * this.constants.playableHeight,
      playerY: normalizedState[5] * this.constants.playableHeight,
      canvasWidth: currentState.canvasWidth,
      canvasHeight: currentState.canvasHeight,
      ballSpeed: currentState.ballSpeed,
      gameTime: currentState.gameTime,
    };
  }

  private addExperience(experience: Experience) {
    this.experienceBuffer.push(experience);

    if (this.experienceBuffer.length > this.maxBufferSize) {
      // Entferne älteste Erfahrung mit niedrigster Priorität
      this.experienceBuffer.sort((a, b) => a.priority - b.priority);
      this.experienceBuffer.shift();
    }

    // Häufigeres Training mit besserer Qualität
    if (this.experienceBuffer.length >= 15 && Math.random() < 0.3) {
      this.network.updateWeights(this.experienceBuffer, 0.015 + this.consecutiveLosses * 0.005);
    }
  }

  onAIScore() {
    if (this.experienceBuffer.length > 0) {
      const lastExp = this.experienceBuffer[this.experienceBuffer.length - 1];
      lastExp.reward += 2.0; // Höhere Belohnung für Punkte
      lastExp.done = true;
      lastExp.priority = 3.0; // Hohe Priorität für Erfolgserfahrungen
    }
    this.winCount++;
    this.consecutiveLosses = 0;
    
    // Track recent performance
    this.recentGames.push(1); // Win
    this.trimRecentGames();
  }

  onPlayerScore() {
    if (this.experienceBuffer.length > 0) {
      const lastExp = this.experienceBuffer[this.experienceBuffer.length - 1];
      lastExp.reward -= 1.5; // Strafe für Punkte-Verlust
      lastExp.done = true;
      lastExp.priority = 2.0; // Hohe Priorität auch für Fehler lernen
    }
    this.consecutiveLosses++;
    
    // Track recent performance
    this.recentGames.push(0); // Loss
    this.trimRecentGames();
  }

  onGameEnd(won: boolean) {
    this.gameCount++;
    if (won) {
      this.winCount++;
    }

    // Intensive Training am Spielende
    if (this.experienceBuffer.length > 5) {
      this.network.updateWeights(this.experienceBuffer, 0.08 + this.consecutiveLosses * 0.02);
    }

    // Reset für nächstes Spiel
    this.lastState = null;
    this.lastY = 0;
    this.totalReward = 0;

    // Adaptive Epsilon-Adjustment
    const winRate = this.winCount / Math.max(this.gameCount, 1);
    if (winRate > 0.6) {
      // Sehr erfolgreich - reduziere Exploration
      this.epsilon = Math.max(this.minEpsilon, this.epsilon * 0.98);
    } else if (winRate < 0.3) {
      // Schlechte Performance - erhöhe Exploration
      this.epsilon = Math.min(0.6, this.epsilon * 1.02);
    }

    console.log(
      `[RL-AI] Game ${this.gameCount} ended. W/L: ${this.winCount}/${this.gameCount - this.winCount} (${(winRate * 100).toFixed(1)}%) | Epsilon: ${this.epsilon.toFixed(3)}`
    );
    
    // Save model periodically
    this.saveModelIfNeeded();
  }

  /**
   * Keep only recent game results to prevent memory bloat
   */
  private trimRecentGames(): void {
    const MAX_RECENT_GAMES = 100;
    if (this.recentGames.length > MAX_RECENT_GAMES) {
      this.recentGames = this.recentGames.slice(-MAX_RECENT_GAMES);
    }
  }
  
  /**
   * Save model to file if enough time has passed
   */
  private async saveModelIfNeeded(): Promise<void> {
    const now = Date.now();
    if (!this.initialized || this.isLoading || (now - this.lastSaveTime < this.SAVE_INTERVAL)) {
      return;
    }
    
    try {
      this.lastSaveTime = now;
      
      const weightsData: SerializedWeights = {
        ...this.network.serializeWeights(),
        epsilon: this.epsilon,
        gameCount: this.gameCount,
        winCount: this.winCount,
        totalReward: this.totalReward,
      };
      
      const performanceStats: PerformanceStats = {
        winRate: this.winCount / Math.max(this.gameCount, 1),
        averageReward: this.totalReward / Math.max(this.gameCount, 1),
        recentGames: [...this.recentGames],
        lastGameTimestamp: now,
      };
      
      await aiFilePersistenceManager.saveAIModel(weightsData, performanceStats);
    } catch (error) {
      console.error('[RL-AI] Failed to save model to file:', error);
    }
  }

  getStats() {
    return {
      gamesPlayed: this.gameCount,
      wins: this.winCount,
      winRate: this.gameCount > 0 ? ((this.winCount / this.gameCount) * 100).toFixed(1) : '0.0',
      epsilon: this.epsilon.toFixed(3),
      experienceCount: this.experienceBuffer.length,
      consecutiveLosses: this.consecutiveLosses,
      avgReward: this.gameCount > 0 ? (this.totalReward / this.gameCount).toFixed(2) : '0.00',
    };
  }
  
  /**
   * Force save the current model state
   */
  public async forceSave(): Promise<void> {
    this.lastSaveTime = 0; // Reset timer to force save
    await this.saveModelIfNeeded();
  }
  
  /**
   * Get current AI statistics including file-based data
   */
  public getDetailedStats(): {
    gameCount: number;
    winCount: number;
    winRate: number;
    epsilon: number;
    recentWinRate: number;
    experienceCount: number;
  } {
    const winRate = this.winCount / Math.max(this.gameCount, 1);
    const recentWins = this.recentGames.slice(-20).reduce((sum, game) => sum + game, 0);
    const recentWinRate = recentWins / Math.max(this.recentGames.slice(-20).length, 1);
    
    return {
      gameCount: this.gameCount,
      winCount: this.winCount,
      winRate,
      epsilon: this.epsilon,
      recentWinRate,
      experienceCount: this.experienceBuffer.length,
    };
  }
  
  /**
   * Cleanup and final save before destruction
   */
  public async cleanup(): Promise<void> {
    console.log('[RL-AI] Performing final cleanup and save to file...');
    await this.forceSave();
  }
}
