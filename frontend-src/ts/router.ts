import { isAuthenticated } from './auth.js';
import { PongGame } from './multiPlayerGame.js';
import { SocketManager } from './socketManager.js';

const socketManager = SocketManager.getInstance();
socketManager.connect();

type Route = {
  path: string;
  view: () => void;
  authRequired?: boolean;
};

const routes: Route[] = [
  {
    path: '/',
    view: showAuthPage,
  },
  {
    path: '/profile',
    view: showProfilePage,
    authRequired: true,
  },
  {
    path: '/game',
    view: showGamePage,
    authRequired: true,
  },
  {
    path: '/tournament',
    view: showTournamentPage,
    authRequired: true,
  },
  {
    path: '/statistics',
    view: showStatistics,
    authRequired: true,
  },
  {
    path: '/livechat',
    view: showLiveChat,
    authRequired: true,
  },
];

export function manageNavbar() {
  const navbar = document.getElementById('header-navbar');
  if (isAuthenticated()) {
    navbar?.classList.remove('hidden');
  } else {
    navbar?.classList.add('hidden');
  }
}

function showLiveChat() {
  const loginPage = document.querySelector('.login-page');
  const profilePage = document.querySelector('.profile-page');
  const gamePage = document.querySelector('.game-page');
  const multiPGamePage = document.querySelector('.multiplayer-lobby');

  manageNavbar();
  loginPage?.classList.add('hidden');
  profilePage?.classList.add('hidden');
  gamePage?.classList.add('hidden');
  multiPGamePage?.classList.add('hidden');
}
function showStatistics() {
  const loginPage = document.querySelector('.login-page');
  const profilePage = document.querySelector('.profile-page');
  const gamePage = document.querySelector('.game-page');
  const multiPGamePage = document.querySelector('.multiplayer-lobby');

  manageNavbar();
  loginPage?.classList.add('hidden');
  profilePage?.classList.add('hidden');
  gamePage?.classList.add('hidden');
  multiPGamePage?.classList.add('hidden');
}

function showTournamentPage() {
  const loginPage = document.querySelector('.login-page');
  const profilePage = document.querySelector('.profile-page');
  const gamePage = document.querySelector('.game-page');
  const multiPGamePage = document.querySelector('.multiplayer-lobby');

  manageNavbar();
  loginPage?.classList.add('hidden');
  profilePage?.classList.add('hidden');
  gamePage?.classList.add('hidden');
  multiPGamePage?.classList.add('hidden');
}
function showAuthPage() {
  const loginPage = document.querySelector('.login-page');
  const profilePage = document.querySelector('.profile-page');
  const gamePage = document.querySelector('.game-page');
  document.querySelector('.newgame-page')?.classList.add('hidden');

  manageNavbar();
  loginPage?.classList.remove('hidden');
  profilePage?.classList.add('hidden');
  gamePage?.classList.add('hidden');
}

function showProfilePage() {
  if (!isAuthenticated()) {
    navigateTo('/');
    return;
  }
  manageNavbar();
  document.querySelector('.login-page')?.classList.add('hidden');
  document.querySelector('.profile-page')?.classList.remove('hidden');
  document.querySelector('.game-page')?.classList.add('hidden');
  document.querySelector('.newgame-page')?.classList.add('hidden');
  document.querySelector('.multiplayer-lobby')?.classList.add('hidden');

  loadProfileData();
}

function showGamePage() {
  if (!isAuthenticated()) {
    navigateTo('/');
    return;
  }
  manageNavbar();
  document.querySelector('.login-page')?.classList.add('hidden');
  document.querySelector('.profile-page')?.classList.add('hidden');
  document.querySelector('.game-page')?.classList.add('hidden');
  document.querySelector('.newgame-page')?.classList.remove('hidden');
  document.querySelector('.multiplayer-lobby')?.classList.add('hidden');
}

export function navigateTo(path: string) {
  window.history.pushState({}, '', path);
  handleRouting();
}

function handleRouting() {
  const currentPath = window.location.pathname;
  const route = routes.find((r) => r.path === currentPath) || routes[0];

  if (route.authRequired && !isAuthenticated()) {
    navigateTo('/');
    return;
  }

  route.view();
}

// Browser button functionality
window.addEventListener('popstate', handleRouting);

// Routing to start when dom loaded
document.addEventListener('DOMContentLoaded', () => {
  manageNavbar();
  document.body.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.matches('[data-link]')) {
      e.preventDefault();
      navigateTo(target.getAttribute('href') || '/');
    }
  });
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('#singlegame-btn')) {
      e.preventDefault();
      initPongGame(true, false);
    }
  });
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('#multiplayergame-btn')) {
      e.preventDefault();
      initPongGame(false, true);
    }
  });
  document.body.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.matches('[data-link]')) {
      e.preventDefault();
      const href = target.getAttribute('href');

      if (href === '/logout') {
        handleLogout();
      } else {
        navigateTo(href || '/');
      }
    }
  });
  handleRouting();
});

async function loadProfileData() {
  try {
    const token = localStorage.getItem('authToken');
    if (!token) {
      throw new Error('No authentication token found');
    }

    const response = await fetch('/api/profile', {
      headers: {
        Authorization: `Bearer ${token}`,
        // 'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('authToken');
        navigateTo('/');
        return;
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    if (!data.nickname || !data.email) {
      throw new Error('Invalid profile data received');
    }

    const nicknameElement = document.getElementById('profile-nickname');
    const emailElement = document.getElementById('profile-email');

    if (nicknameElement) nicknameElement.textContent = data.nickname;
    if (emailElement) emailElement.textContent = data.email;
  } catch (error) {
    console.error('Profile data load error:', error);
    localStorage.removeItem('authToken');
    document.querySelector('.main-nav')?.classList.add('hidden');
    navigateTo('/');
  }
}

async function handleLogout() {
  try {
    const token = localStorage.getItem('authToken');
    if (token) {
      await fetch('/api/logout', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    }

    localStorage.removeItem('authToken');
    document.querySelector('.main-nav')?.classList.add('hidden');

    manageNavbar();
    navigateTo('/');
  } catch (error) {
    localStorage.removeItem('authToken');
    navigateTo('/');
  }
}


// QUESTION: what's happening here? is it more of a "show game options?" --> is the funciton name appropriate?
function showMultiplayerLobby() {
  document.querySelector('.game-page')?.classList.add('hidden');
  document.querySelector('.multiplayer-lobby')?.classList.remove('hidden');
  document.querySelector('.newgame-page')?.classList.add('hidden');
}

async function initPongGame( singlePlayer: boolean, remote: boolean) {
  if (!isAuthenticated()) {
    alert('Multiplayer oynamak için giriş yapmalısınız');
    navigateTo('/');
    return;
  }
  showMultiplayerLobby();
  setupLobbyUI(singlePlayer, remote);
  try {
    document.getElementById('lobby-status')!.textContent = 'Connected to server';
  } catch (error) {
    document.getElementById('lobby-status')!.textContent = 'Connection failed';
  }
}

function setupLobbyUI(singlePlayer: boolean, remote: boolean) {
  const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
  if (!canvas) return;
  const game = new PongGame(canvas, socketManager);
  socketManager.setGameInstance(game);
  game.isSinglePlayer = singlePlayer;
  game.isRemote = remote;
  document.getElementById('create-room-btn')?.addEventListener('click', async () => {
    const statusElement = document.getElementById('lobby-status')!;
    statusElement.textContent = 'Creating room...';
    try {
      const roomId = await socketManager.createRoom();

      statusElement.innerHTML = `Room created! ID: <strong class="neon-text-yellow">${roomId}</strong><br>Waiting for opponent...`;

      socketManager.onGameStart = () => {
        document.querySelector('.multiplayer-lobby')?.classList.add('hidden');
        document.querySelector('.game-page')?.classList.remove('hidden');
        startMultiplayerGame(game);
      };
    } catch (error) {
      statusElement.textContent = 'Error creating room';
    }
  });

  document.getElementById('join-room-btn')?.addEventListener('click', async () => {
    const roomId = (document.getElementById('room-id-input') as HTMLInputElement).value.trim();
    if (!roomId) return;

    const statusElement = document.getElementById('lobby-status')!;
    statusElement.textContent = 'Joining room...';

    try {
      const success = await socketManager.joinRoom(roomId);
      if (success) {
        statusElement.textContent = 'Joined successfully! Starting game...';
        socketManager.onGameStart = () => {
          document.querySelector('.multiplayer-lobby')?.classList.add('hidden');
          document.querySelector('.game-page')?.classList.remove('hidden');
          startMultiplayerGame(game);
        };
      } else {
        statusElement.textContent = 'Room not found or full';
      }
    } catch (error) {
      statusElement.textContent = 'Connection error';
    }
  });
}

function startMultiplayerGame(game: PongGame) {
  const existingGame = (window as any).currentGame;
  if (existingGame) {
    existingGame.stop();
  }
  
  (window as any).currentGame = game;
  // game.start();
}
