import { Constants } from './types';
import type { GameStateNN, Experience } from './types';

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
  // private momentum1: number[][] = [];
  private momentum2: number[][] = [];
  private momentum3: number[][] = [];
  // private momentumBias1: number[] = [];
  private momentumBias2: number[] = [];
  private momentumBias3: number[] = [];
  private readonly momentumRate = 0.9;

  constructor() {
    this.initializeWeights();
    this.initializeMomentum();
  }

  private initializeWeights() {
    // Xavier/Glorot Initialisierung für bessere Konvergenz
    const xavierScale1 = Math.sqrt(2.0 / this.inputSize);
    const xavierScale2 = Math.sqrt(2.0 / this.hiddenSize1);
    const xavierScale3 = Math.sqrt(2.0 / this.hiddenSize2);

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

    this.bias1 = new Array(this.hiddenSize1).fill(0);
    this.bias2 = new Array(this.hiddenSize2).fill(0);
    this.bias3 = new Array(this.outputSize).fill(0);
  }

  private initializeMomentum() {
    // this.momentum1 = this.createMatrix(this.inputSize, this.hiddenSize1, () => 0);
    this.momentum2 = this.createMatrix(this.hiddenSize1, this.hiddenSize2, () => 0);
    this.momentum3 = this.createMatrix(this.hiddenSize2, this.outputSize, () => 0);
    // this.momentumBias1 = new Array(this.hiddenSize1).fill(0);
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

  private softmax(values: number[]): number[] {
    const maxVal = Math.max(...values);

    const MAX_EXP_INPUT = 700; // exp(>~709) -> Infinity bei JS-Number
    const expVals = new Array<number>(values.length);
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
      const shifted = values[i] - maxVal; // größter Exponent wird 0, weil exp(0)=1, kleinere negative Exponenten werden kleiner
      const clamped = Math.min(shifted, MAX_EXP_INPUT); // Clamp to avoid overflow
      const e = Math.exp(clamped);
      expVals[i] = e;
      sum += e;
    }
    return expVals.map((v) => v / sum); // das sind jetzt die errechneten Q-Values / Wahrscheinlichkeiten
  }

  forward(input: number[]): number[] {
    // Layer 1 (input -> hidden1)
    const hidden1: number[] = new Array(this.hiddenSize1);
    for (let j = 0; j < this.hiddenSize1; j++) {
      let sum = this.bias1[j]; // sum = bias + (weight1 * input1) + (weight2 * input2) + ...
      for (let i = 0; i < this.inputSize; i++) {
        sum += input[i] * this.weights1[i][j];
      }
      hidden1[j] = this.leakyRelu(sum);
    }

    // Layer 2 (hidden1 -> hidden2)
    const hidden2: number[] = new Array(this.hiddenSize2);
    for (let j = 0; j < this.hiddenSize2; j++) {
      let sum = this.bias2[j];
      for (let i = 0; i < this.hiddenSize1; i++) {
        sum += hidden1[i] * this.weights2[i][j];
      }
      hidden2[j] = this.leakyRelu(sum);
    }

    const output: number[] = new Array(this.outputSize);
    for (let j = 0; j < this.outputSize; j++) {
      let sum = this.bias3[j];
      for (let i = 0; i < this.hiddenSize2; i++) {
        sum += hidden2[i] * this.weights3[i][j];
      }
      // Sigmoid für Output zwischen 0 und 1 (normalisierte Y-Position)
      output[j] = 1 / (1 + Math.exp(-sum));
    }
    return output;

    // // Output Layer (hidden2 -> Y-Position)
    // const logits: number[] = new Array(this.outputSize);
    // for (let j = 0; j < this.outputSize; j++) {
    //   let sum = this.bias3[j];
    //   for (let i = 0; i < this.hiddenSize2; i++) {
    //     sum += hidden2[i] * this.weights3[i][j];
    //   }
    //   logits[j] = sum;
    // }

    // // Softmax auf die Logits (raw predictions/scores) anwenden, um Wahrscheinlichkeiten zu erhalten
    // return this.softmax(logits);
  }

  // forwardSoft(input: number[]): number[] {
  //   // Softmax auf die Logits (raw predictions/scores) anwenden, um Wahrscheinlichkeiten zu erhalten
  //   return this.softmax(this.forward(input));
  // }

  // Verbesserte Gewichtsaktualisierung mit Momentum
  // updateWeights(experiences: Experience[], learningRate: number = 0.005) {
  //   // Prioritized Experience Replay - schwierigere Situationen bevorzugen
  //   experiences.sort((a, b) => b.priority - a.priority);
  //   const batchSize = Math.min(8, experiences.length);
  //   const batch = experiences.slice(0, batchSize);

  //   for (const exp of batch) {
  //     const qValues = this.forward(exp.state);

  //     const gamma = 0.99; // Höherer Discount Factor
  //     let targetValue = exp.reward;

  //     if (!exp.done) {
  //       const nextQValues = this.forward(exp.nextState);
  //       targetValue += gamma * Math.max(...nextQValues);
  //     }

  //     const oldValue = qValues[exp.action];
  //     qValues[exp.action] = targetValue;

  //     // Update priority basierend auf TD-Error
  //     const tdError = targetValue - oldValue;
  //     exp.priority = Math.abs(tdError) + 0.01;

  //     this.backpropagate(exp.state, exp.action, tdError, learningRate);
  //   }
  // }

  updateWeights(experiences: Experience[], learningRate: number = 0.005) {
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
  }

  // private backpropagate(state: number[], action: number, error: number, lr: number) {
  //   // Kurzzusammenfassung:
  //   // 1. Vorwärts rechnen (ohne Training), um die Zwischenwerte der beiden versteckten Schichten zu haben.
  //   // 2. Output-Schicht korrigieren:
  //   //     - Nur der Ausgang der gewählten Aktion wird angepasst.
  //   //     - Bias (b3) und die zugehörigen Gewichte (W3[:, action]) werden in Richtung „Fehler reduzieren“ verschoben.
  //   //     - Momentum sorgt für sanfte, stabile Updates.
  //   // 3. Einfluss zurück in Schicht 2 berechnen:
  //   //     - Mit der Ableitung der Aktivierung (leakyReLU’) und den Output-Gewichten wird ein „Rücksignal“ (delta2) bestimmt.
  //   //     - Bias von Schicht 2 (b2) und deren Gewichte (W2) werden entsprechend angepasst (auch mit Momentum).
  //   // Recompute Forward-Pass, um Hidden-Aktivierungen zu bekommen
  //   const hidden1: number[] = new Array(this.hiddenSize1);
  //   for (let j = 0; j < this.hiddenSize1; j++) {
  //     let sum = this.bias1[j];
  //     for (let i = 0; i < this.inputSize; i++) sum += state[i] * this.weights1[i][j];
  //     hidden1[j] = this.leakyRelu(sum);
  //   }
  //   const hidden2: number[] = new Array(this.hiddenSize2);
  //   for (let j = 0; j < this.hiddenSize2; j++) {
  //     let sum = this.bias2[j];
  //     for (let i = 0; i < this.hiddenSize1; i++) sum += hidden1[i] * this.weights2[i][j];
  //     hidden2[j] = this.leakyRelu(sum);
  //   }

  //   // Output-Delta (linearer Output für Aktion 'action')
  //   const delta3 = error; // dL/dz3 = (target - Q), da Output linear

  //   // Momentum-Rate
  //   const momRate = this.momentumRate;

  //   // Update b3[action]
  //   this.momentumBias3[action] =
  //     momRate * this.momentumBias3[action] + (1 - momRate) * (lr * delta3);
  //   this.bias3[action] += this.momentumBias3[action];

  //   // Update W3[:, action]
  //   for (let i = 0; i < this.hiddenSize2; i++) {
  //     if (!this.momentum3[i]) this.momentum3[i] = new Array(this.outputSize).fill(0);
  //     const gradW3 = lr * delta3 * hidden2[i];
  //     this.momentum3[i][action] = momRate * this.momentum3[i][action] + (1 - momRate) * gradW3;
  //     this.weights3[i][action] += this.momentum3[i][action];
  //   }

  //   // Delta2 = f'(z2) * (W3[:,action] * delta3)
  //   const delta2: number[] = new Array(this.hiddenSize2);
  //   for (let j = 0; j < this.hiddenSize2; j++) {
  //     const deriv = hidden2[j] > 0 ? 1 : 0.01; // leakyReLU' (also die Ableitung von leakyReLu!)
  //     delta2[j] = deriv * (this.weights3[j][action] * delta3);
  //   }

  //   // Update b2 und W2 mit Momentum
  //   for (let j = 0; j < this.hiddenSize2; j++) {
  //     this.momentumBias2[j] = momRate * this.momentumBias2[j] + (1 - momRate) * (lr * delta2[j]);
  //     this.bias2[j] += this.momentumBias2[j];

  //     for (let i = 0; i < this.hiddenSize1; i++) {
  //       if (!this.momentum2[i]) this.momentum2[i] = new Array(this.hiddenSize2).fill(0);
  //       const gradW2 = lr * delta2[j] * hidden1[i];
  //       this.momentum2[i][j] = momRate * this.momentum2[i][j] + (1 - momRate) * gradW2;
  //       this.weights2[i][j] += this.momentum2[i][j];
  //     }
  //   }

  //   // // Optional: leichte Updates in Layer 1 (kleiner Faktor, stabil)
  //   // const delta1: number[] = new Array(this.hiddenSize1).fill(0);
  //   // for (let i = 0; i < this.hiddenSize1; i++) {
  //   //   // delta1 = f'(z1) * sum_j W2[i][j] * delta2[j]
  //   //   let back = 0;
  //   //   for (let j = 0; j < this.hiddenSize2; j++) back += this.weights2[i][j] * delta2[j];
  //   //   const deriv1 = hidden1[i] > 0 ? 1 : 0.01;
  //   //   delta1[i] = deriv1 * back;
  //   // }
  //   // for (let j = 0; j < this.hiddenSize1; j++) {
  //   //   // kleinerer Lernschritt für Layer 1
  //   //   const stepB1 = lr * 0.1 * delta1[j];
  //   //   this.momentumBias1[j] = m * this.momentumBias1[j] + (1 - m) * stepB1;
  //   //   this.bias1[j] += this.momentumBias1[j];

  //   //   for (let i = 0; i < this.inputSize; i++) {
  //   //     if (!this.momentum1[i]) this.momentum1[i] = new Array(this.hiddenSize1).fill(0);
  //   //     const gradW1 = lr * 0.1 * delta1[j] * state[i];
  //   //     this.momentum1[i][j] = m * this.momentum1[i][j] + (1 - m) * gradW1;
  //   //     this.weights1[i][j] += this.momentum1[i][j];
  //   //   }
  //   // }
  // }

  //   private backpropagate(state: number[], action: number, error: number, lr: number) {
  //     // Vereinfachte Backpropagation mit Momentum
  //     const adjustment = error * lr;

  //     // Output layer updates mit Momentum
  //     const oldMomentumBias3 = this.momentumBias3[action];
  //     this.momentumBias3[action] = this.momentumRate * oldMomentumBias3 + (1 - this.momentumRate) * adjustment;
  //     this.bias3[action] += this.momentumBias3[action];

  //     // Weight updates für die letzten Layer
  //     for (let i = 0; i < Math.min(8, this.hiddenSize2); i++) {
  //       const oldMomentum = this.momentum3[i] ? this.momentum3[i][action] : 0;
  //       const newMomentum = this.momentumRate * oldMomentum + (1 - this.momentumRate) * adjustment * 0.1;

  //       if (!this.momentum3[i]) {
  //         this.momentum3[i] = new Array(this.outputSize).fill(0);
  //       }
  //       this.momentum3[i][action] = newMomentum;
  //       this.weights3[i][action] += newMomentum;
  //     }

  //     // Hidden layer updates (weniger aggressiv)
  //     for (let i = 0; i < Math.min(4, this.hiddenSize1); i++) {
  //       this.bias2[i % this.hiddenSize2] += adjustment * 0.01;
  //     }
  //   }
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
  private aggressionLevel = 0.5; // ist ein Input für die NN. 0 = sehr defensiv, 1 = sehr offensiv. Wird basierend auf Performance angepasst, was schnelleres Lernen fördert und eine Art Risikomanagement ermöglicht. Also nach Erfolgen ist er aggressiver/offensiver, nach Misserfolgen defensiver.

  constructor(private readonly constants: Constants) {
    this.network = new ImprovedNeuralNetwork();
  }

  private normalizeGameState(state: GameStateNN): number[] {
    const { ballX, ballY, ballVX, ballVY, aiY, playerY, canvasWidth, canvasHeight, ballSpeed } =
      state;

    // Erweiterte Feature-Extraktion
    const ballNormX = ballX / canvasWidth;
    const ballNormY = ballY / canvasHeight;
    const ballNormVX = Math.max(-1, Math.min(1, ballVX / this.constants.MAX_BALL_SPEED)); // ist zur Sicherheit, falls ballVX doch mall zu groß wird (ballVX = ballSpeed * cos(angle))
    const ballNormVY = Math.max(-1, Math.min(1, ballVY / this.constants.MAX_BALL_SPEED));
    const aiNormY = aiY / (canvasHeight - this.constants.paddleHeight);
    const playerNormY = playerY / (canvasHeight - this.constants.paddleHeight);

    // Strategische Features
    const timeToReachAI =
      ballVX > 0
        ? (canvasWidth - this.constants.paddleWidth - this.constants.ballRadius - ballX) /
          Math.max(ballVX, 1e-3)
        : 999; // Zeit bis Ball AI-Seite erreicht
    // Zeit = Strecke / Geschwindigkeit: Strecke bis zur AI-Kollisionslinie in Pixeln & Horizontale Geschwindigkeit vx in Pixel/Frame
    // const timeToReachAI = ballVX > 0 ? (canvasWidth - this.constants.MAX_BALL_SPEED - ballX) / Math.max(ballVX, 1) : 999; //Zeit = Strecke / Geschwindigkeit
    const predictedBallY = this.predictBallPosition(state, Math.min(timeToReachAI, 60));
    const distanceToOptimal =
      Math.abs(aiY + this.constants.paddleHeight / 2 - predictedBallY) / canvasHeight;
    const relativeSpeed = ballSpeed / this.constants.MAX_BALL_SPEED;

    // Defensive/Offensive Indikatoren
    const isDefensive = ballVX < 0 ? 1 : 0; // 1 wenn Ball auf AI zukommt, sonst 0
    const urgency = Math.max(0, 1 - timeToReachAI / 60); // Dringlichkeit basierend auf Zeit

    return [
      ballNormX,
      ballNormY,
      ballNormVX,
      ballNormVY,
      aiNormY,
      playerNormY,
      distanceToOptimal,
      relativeSpeed,
      isDefensive,
      urgency,
      this.aggressionLevel,
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
    const nextBallDistance = Math.abs(
      nextState.ballY - (nextState.aiY + this.constants.paddleCenter)
    );
    const distanceImprovement = ballDistance - nextBallDistance;

    if (distanceImprovement > 0) {
      reward += 0.3 * (distanceImprovement / 50); // Stärkere Belohnung für Verbesserung
    } else {
      reward -= 0.15 * (Math.abs(distanceImprovement) / 50);
    }

    // Prädiktive Positionierung
    const predictedY = this.predictBallPosition(state, 30);
    const optimalPosition = predictedY - this.constants.paddleCenter;
    const currentOptimality = Math.abs(state.aiY - optimalPosition);
    const nextOptimality = Math.abs(nextState.aiY - optimalPosition);

    if (nextOptimality < currentOptimality) {
      reward += 0.25; // Belohnung für strategische Positionierung
    }

    // Defensive Bonus
    if (
      state.ballVX < 0 &&
      Math.abs(nextState.ballY - (nextState.aiY + this.constants.paddleCenter)) < 30
    ) {
      reward += 0.2; // Defensive Bereitschaft
    }

    // Offensive Bonus - Ball Richtung Spieler lenken
    if (state.ballVX > 0 && state.ballX > state.canvasWidth * 0.7) {
      const targetArea = state.playerY + this.constants.paddleCenter; // Ziel ist die Mitte des Spieler-Schlägers
      if (Math.abs(state.ballY - targetArea) > Math.abs(nextState.ballY - targetArea)) {
        reward += 0.1 * this.aggressionLevel;
      }
    }

    // Grenzstrafen
    if (nextState.aiY < 0 || nextState.aiY > state.canvasHeight - this.constants.paddleHeight) {
      reward -= 0.4;
    }

    // Bewegungseffizienz
    if (lastTargetY === state.aiY && ballDistance < 20) {
      // STAY when close
      reward += 0.05;
    }

    // Tempo-Anpassung
    if (state.ballSpeed > 15 && Math.abs(distanceImprovement) < 5) {
      reward += 0.1; // Bonus für Stabilität bei hoher Geschwindigkeit
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

      const experience: Experience = {
        state: this.lastState,
        targetY: this.lastY / gameState.canvasHeight, // Normalisiert für Training
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
      // Exploration: Zufällige Variation um NN-Vorhersage
      const variation = (Math.random() - 0.5) * 200 * this.aggressionLevel;
      targetY += variation;
    } else {
      // Optional: Fallback auf Ball-Vorhersage bei sehr schlechter Performance
      if (this.consecutiveLosses > 5) {
        const predictedBallY = this.predictBallPosition(gameState, 30);
        const fallbackY = predictedBallY - this.constants.paddleHeight / 2;
        targetY = 0.7 * targetY + 0.3 * fallbackY; // Mischung
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

  // getAction(gameState: GameState): number {
  //   if (this.gameStartTime === 0) {
  //     this.gameStartTime = Date.now();
  //   }

  //   const currentTime = Date.now() - this.gameStartTime;
  //   gameState.gameTime = currentTime;

  //   const normalizedState = this.normalizeGameState(gameState);

  //   // Experience aus vorheriger Aktion speichern
  //   if (this.lastState !== null) {
  //     // ist NULL zu Beginn
  //     const reward = this.calculateAdvancedReward(
  //       this.denormalizeState(this.lastState, gameState),
  //       this.lastY,
  //       gameState
  //     );

  //     this.totalReward += reward;

  //     const experience: Experience = {
  //       state: this.lastState,
  //       targetY: this.lastY,
  //       reward: reward,
  //       nextState: normalizedState,
  //       done: false,
  //       priority: Math.abs(reward) + 0.1, // Initial priority
  //     };

  //     this.addExperience(experience);
  //   }

  //   // Aktion wählen mit verbesserter Strategie
  //   let action: Action;

  //   // Adaptive Epsilon basierend auf Performance
  //   let currentEpsilon = this.epsilon; // epsilon ist 0,4 zu Beginn, mal schauen ob erhöhen?
  //   if (this.consecutiveLosses > 3) {
  //     // ist 0 zu Beginn
  //     currentEpsilon = Math.min(0.6, this.epsilon * 1.5); // Mehr Exploration bei schlechter Performance
  //   }

  //   if (Math.random() < currentEpsilon) {
  //     // Intelligentere Exploration - nicht komplett zufällig
  //     const qValues = this.network.forward(normalizedState);
  //     const ballDistance = Math.abs(
  //       gameState.ballY - (gameState.aiY + this.constants.paddleCenter)
  //     );

  //     if (ballDistance < gameState.canvasWidth * 0.01) {
  //       // anpassen vielleicht?
  //       // Bei Ballnähe: bevorzuge doch die optimale Aktion
  //       action = qValues.indexOf(Math.max(...qValues)) as Action;
  //     } else {
  //       // gewichtete zufällige Auswahl (nutze normalisierte qValues)
  //       // qValues summiert sollte 1 ergeben ca. (Softmax)
  //       const rand = Math.random();
  //       let acc = 0;
  //       action = Action.Down; // Fallback
  //       for (let i = 0; i < qValues.length; i++) {
  //         acc += qValues[i];
  //         if (rand <= acc) {
  //           action = i as Action;
  //           break;
  //         }
  //       }
  //     }
  //   } else {
  //     // Exploit: beste bekannte Aktion
  //     const qValues = this.network.forward(normalizedState);
  //     action = qValues.indexOf(Math.max(...qValues)) as Action;
  //   }

  //   // State für nächste Iteration speichern
  //   this.lastState = [...normalizedState];
  //   this.lastAction = action;

  //   // Epsilon Decay
  //   this.epsilon = Math.max(this.minEpsilon, this.epsilon * this.epsilonDecay);

  //   return action;
  // }

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
      this.network.updateWeights(this.experienceBuffer, 0.003 + this.consecutiveLosses * 0.001);
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
    this.aggressionLevel = Math.min(1.0, this.aggressionLevel + 0.1);
  }

  onPlayerScore() {
    if (this.experienceBuffer.length > 0) {
      const lastExp = this.experienceBuffer[this.experienceBuffer.length - 1];
      lastExp.reward -= 1.0; // Moderate Strafe
      lastExp.done = true;
      lastExp.priority = 2.0; // Hohe Priorität für Lernerfahrungen
    }
    this.consecutiveLosses++;
    this.aggressionLevel = Math.max(0.0, this.aggressionLevel - 0.05);
  }

  onGameEnd() {
    this.gameCount++;

    // Lernanpassungen basierend auf Performance
    if (this.gameCount % 3 === 0) {
      const avgReward = this.totalReward / Math.max(1, this.gameCount);
      if (avgReward < 0) {
        this.epsilon = Math.min(0.5, this.epsilon * 1.1); // Mehr Exploration bei schlechter Performance
      }
    }

    this.lastState = null;
    this.lastY = 0;
    this.totalReward = 0;
  }

  getStats() {
    return {
      gamesPlayed: this.gameCount,
      wins: this.winCount,
      winRate: this.gameCount > 0 ? ((this.winCount / this.gameCount) * 100).toFixed(1) : '0.0',
      epsilon: this.epsilon.toFixed(3),
      experienceCount: this.experienceBuffer.length,
      aggressionLevel: (this.aggressionLevel * 100).toFixed(0),
      consecutiveLosses: this.consecutiveLosses,
      avgReward: this.gameCount > 0 ? (this.totalReward / this.gameCount).toFixed(2) : '0.00',
    };
  }
}
