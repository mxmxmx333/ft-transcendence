interface MatchHistory {
  id: number;
  opponent_nickname: string;
  opponent_avatar: string;
  my_score: number;
  opponent_score: number;
  result: 'won' | 'lost' | 'draw';
  game_type: string;
  played_at: string;
}

interface GameStatistics {
  user_id: number;
  games_played: number;
  games_won: number;
  games_lost: number;
  win_rate: number;
  avg_score: number;
  total_score: number;
  last_game_date?: string;
}

export class StatisticsManager {
  private matches: MatchHistory[] = [];
  private stats: GameStatistics | null = null;

  constructor() {}

  public async loadStatistics() {
    try {
      // console.log('Loading statistics...');

      const [statsResponse, matchesResponse] = await Promise.all([
        fetch('/api/my-statistics', {
          headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` },
        }),
        fetch('/api/my-matches?limit=50', {
          headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` },
        }),
      ]);

      if (!statsResponse.ok) throw new Error(`Stats API failed: ${statsResponse.status}`);
      if (!matchesResponse.ok) throw new Error(`Matches API failed: ${matchesResponse.status}`);

      this.stats = await statsResponse.json();
      const matchesData = await matchesResponse.json();
      this.matches = matchesData.matches || [];

      console.log('Statistics loaded:', this.stats);
      // console.log('Matches loaded:', this.matches.length);

      this.displayStatistics();
      this.drawCharts();
      this.displayMatchHistory();
    } catch (error) {
      console.error('Failed to load statistics:', error);
      this.showErrorMessage('Failed to load statistics. Please try again.');
    }
  }

  private displayStatistics() {
    if (!this.stats) {
      console.log('no stats?')
      return;
    }
    console.log('we got stats!')
    let lost = this.stats.games_lost;
    if (this.stats.games_lost + this.stats.games_won !== this.stats.games_played) {
      lost = this.stats.games_played - this.stats.games_won;
    }
    const winRate =
      this.stats.games_played > 0 ? (this.stats.games_won / this.stats.games_played) * 100 : 0;
    const avgScore =
      this.stats.games_played > 0 ? this.stats.total_score / this.stats.games_played : 0;

    // Grundlegende Stats
    this.updateElement('win-rate-percentage', `${winRate.toFixed(1)}%`);
    this.updateElement('avg-score-value', avgScore.toFixed(1));
    this.updateElement('games-played', this.stats.games_played.toString());
    console.log(`${this.stats.games_played}`);

    console.log(`${this.stats.games_won} wins / ${lost} losses`);

    const winLossText = `${this.stats.games_won} wins / ${lost} losses`;
    this.updateElement('win-loss-text', winLossText);

    // Letztes Spiel
    // if (this.stats.last_game_date) {
    //   const lastGame = new Date(this.stats.last_game_date);
    //   this.updateElement('last-game', lastGame.toLocaleDateString());
    // } else {
    //   this.updateElement('last-game', 'Never');
    // }
  }

  private drawCharts() {
    this.drawWinRateChart();
    this.drawAvgScoreChart();
  }

  private drawWinRateChart() {
    const canvas = document.getElementById('win-rate-chart') as HTMLCanvasElement;
    if (!canvas || !this.stats) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = 70;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const winRate =
      this.stats.games_played > 0 ? this.stats.games_won / this.stats.games_played : 0;

    // Background circle
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.strokeStyle = '#374151'; // gray-700
    ctx.lineWidth = 8;
    ctx.stroke();

    // Win rate arc
    if (winRate > 0) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, -Math.PI / 2, 2 * Math.PI * winRate - Math.PI / 2);
      ctx.strokeStyle = '#10B981'; // emerald-500
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.stroke();

      // Add glow effect
      ctx.shadowColor = '#10B981';
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  private drawAvgScoreChart() {
    const canvas = document.getElementById('avg-score-chart') as HTMLCanvasElement;
    if (!canvas || !this.stats) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = 70;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const avgScore =
      this.stats.games_played > 0 ? this.stats.total_score / this.stats.games_played : 0;

    const scoreRatio = Math.min(avgScore / 10, 1); // Max score is 10

    // Background circle
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.strokeStyle = '#374151'; // gray-700
    ctx.lineWidth = 8;
    ctx.stroke();

    // Score arc
    if (scoreRatio > 0) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, -Math.PI / 2, 2 * Math.PI * scoreRatio - Math.PI / 2);

      // Color gradient based on score
      let color = '#EF4444'; // red-500 (low score)
      if (scoreRatio > 0.7)
        color = '#10B981'; // emerald-500 (high score)
      else if (scoreRatio > 0.4) color = '#F59E0B'; // amber-500 (medium score)

      ctx.strokeStyle = color;
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.stroke();

      // Add glow effect
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  private displayMatchHistory() {
    const container = document.getElementById('match-history-container');
    if (!container) return;

    if (this.matches.length === 0) {
      container.innerHTML = `
        <div class="text-center py-8">
          <div class="text-gray-400 text-lg mb-4">No matches played yet</div>
          <p class="text-gray-500">Start playing to see your match history here!</p>
        </div>
      `;
      return;
    }

    container.innerHTML = this.matches.map((match) => this.renderMatchCard(match)).join('');
  }

  private renderMatchCard(match: MatchHistory): string {
    let opponent = match.opponent_nickname || '[Deleted User]';
    if (match.game_type == 'single') opponent = 'AI';
    const gameDate = new Date(match.played_at);
    const timeAgo = this.getTimeAgo(gameDate);

    return `
      <div class="match-card ${match.result} bg-gray-800 rounded-lg p-4 border-l-4 hover:bg-gray-750 transition-colors">
        <div class="flex items-center justify-between">
          <!-- Opponent Info -->
          <div class="flex items-center space-x-3 w-1/3 overflow-hidden">
            <img src="/imgs/avatars/${match.opponent_avatar || 'default'}.png" 
                 alt="${opponent}" 
                 class="w-12 h-12 rounded-full border-2 border-gray-600"
                 onerror="this.src='/imgs/avatars/default.png'">
            <div>
              <div class="font-medium text-gray-200">${opponent}</div>
              <div class="text-sm text-gray-400">
                ${match.game_type}
            </div>
          </div>
        </div>

          <!-- Score -->
          <div class="text-center">
            <div class="text-2xl font-bold ${this.getScoreColor(match.result)}">
              ${match.opponent_score} - ${match.my_score}
            </div>
          </div>

          <!-- Result & Date -->
          <div class="text-right w-1/3">
            <div class="result-badge ${match.result} px-3 py-1 rounded-full text-xs font-bold uppercase">
              ${match.result}
            </div>
            <div class="text-xs text-gray-500 mt-1">${timeAgo}</div>
          </div>
        </div>
      </div>
    `;
  }

  private updateElement(id: string, value: string) {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = value;
      // console.log(`Updated ${id}:`, value);
    } else {
      console.warn(`Element not found: ${id}`);
    }
  }

  private getScoreColor(result: string): string {
    switch (result) {
      case 'won':
        return 'text-green-400';
      case 'lost':
        return 'text-red-400';
      case 'draw':
        return 'text-yellow-400';
      default:
        return 'text-gray-400';
    }
  }

  private getTimeAgo(date: Date): string {
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

    if (diffInDays === 0) {
      const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
      if (diffInHours === 0) {
        const diffInMins = Math.floor(diffInMs / (1000 * 60));
        return diffInMins <= 1 ? 'Just now' : `${diffInMins}m ago`;
      }
      return `${diffInHours}h ago`;
    } else if (diffInDays === 1) {
      return 'Yesterday';
    } else if (diffInDays < 7) {
      return `${diffInDays}d ago`;
    } else {
      return date.toLocaleDateString();
    }
  }

  private showErrorMessage(message: string) {
    const container = document.getElementById('statistics-container');
    if (container) {
      container.innerHTML = `
        <div class="text-center py-8">
          <div class="text-red-400 text-lg mb-4">Error</div>
          <p class="text-gray-400">${message}</p>
        </div>
      `;
    }
  }
}

// Global instance
let statisticsManager: StatisticsManager;

// Export functions for router
export function getStatistics() {
  // Initialize manager if not exists
  if (!statisticsManager) {
    statisticsManager = new StatisticsManager();
  }
  statisticsManager.loadStatistics();
}
