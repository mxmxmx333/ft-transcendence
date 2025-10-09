import { isAuthenticated } from "./auth";
import { navigateTo } from "./router";

interface MatchHistory {
  id: number;
  opponent_nickname: string;
  opponent_avatar: string;
  my_score: number;
  opponent_score: number;
  result: 'won' | 'lost' | 'draw';
  game_type: string;
  game_mode?: string;
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
      console.log('Loading statistics...');
    
        const [statsResponse, matchesResponse] = await Promise.all([
        fetch('/api/my-statistics', {
            headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
        }),
        fetch('/api/my-matches?limit=50', {
            headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
        })
        ]);

        if (!statsResponse.ok) {
        throw new Error(`Stats API failed: ${statsResponse.status}`);
        }
        
        if (!matchesResponse.ok) {
        throw new Error(`Matches API failed: ${matchesResponse.status}`);
        }

        this.stats = await statsResponse.json();
        const matchesData = await matchesResponse.json();
        this.matches = matchesData.matches || [];

        console.log('Statistics loaded:', this.stats);
        console.log('Matches loaded:', this.matches.length);

        this.displayStatistics();
        this.displayMatchHistory();

    } catch (error) {
        console.error('Failed to load statistics:', error);
        this.showErrorMessage('Failed to load statistics. Please try again.');
    }
    }

  private displayStatistics() {
    if (!this.stats) return;

    // Grundlegende Stats
    this.updateElement('games-played', this.stats.games_played.toString());
    this.updateElement('games-won', this.stats.games_won.toString());
    this.updateElement('games-lost', this.stats.games_lost.toString());
    this.updateElement('win-rate', `${this.stats.win_rate}%`);
    this.updateElement('avg-score', this.stats.avg_score?.toString() || '0');
    this.updateElement('total-score', this.stats.total_score.toString());

    // Letztes Spiel
    if (this.stats.last_game_date) {
      const lastGame = new Date(this.stats.last_game_date);
      this.updateElement('last-game', lastGame.toLocaleDateString());
    } else {
      this.updateElement('last-game', 'Never');
    }

    // Progress bars für Win Rate
    const winRateBar = document.getElementById('win-rate-bar') as HTMLElement;
    if (winRateBar) {
      winRateBar.style.width = `${this.stats.win_rate}%`;
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

    container.innerHTML = this.matches.map(match => this.renderMatchCard(match)).join('');
  }

  private renderMatchCard(match: MatchHistory): string {
    const opponent = match.opponent_nickname || 'AI';
    const gameDate = new Date(match.played_at);
    const timeAgo = this.getTimeAgo(gameDate);

    return `
      <div class="match-card ${match.result} bg-gray-800 rounded-lg p-4 border-l-4 hover:bg-gray-750 transition-colors">
        <div class="flex items-center justify-between">
          <!-- Opponent Info -->
          <div class="flex items-center space-x-3">
            <img src="/imgs/avatars/${match.opponent_avatar || 'default'}.png" 
                 alt="${opponent}" 
                 class="w-12 h-12 rounded-full border-2 border-gray-600"
                 onerror="this.src='/imgs/avatars/default.png'">
            <div>
              <div class="font-medium text-gray-200">${opponent}</div>
              <div class="text-sm text-gray-400">
                ${match.game_type} ${match.game_mode ? `• ${match.game_mode}` : ''}
              </div>
            </div>
          </div>

          <!-- Score -->
          <div class="text-center">
            <div class="text-2xl font-bold ${this.getScoreColor(match.result)}">
              ${match.my_score} - ${match.opponent_score}
            </div>
          </div>

          <!-- Result & Date -->
          <div class="text-right">
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
    }
  }

  private getScoreColor(result: string): string {
    switch (result) {
      case 'won': return 'text-green-400';
      case 'lost': return 'text-red-400';
      case 'draw': return 'text-yellow-400';
      default: return 'text-gray-400';
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
    statisticsManager.loadStatistics();
  } else {
    console.error('Statistics page element not found');
  }
}
