var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { isAuthenticated } from './auth.js';
import { PongGame } from './game.js';
import { PongMultiplayer } from './multiPlayerGame.js';
import { SocketManager } from './socketManager.js';
const routes = [
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
        navbar === null || navbar === void 0 ? void 0 : navbar.classList.remove('hidden');
    }
    else {
        navbar === null || navbar === void 0 ? void 0 : navbar.classList.add('hidden');
    }
}
function showLiveChat() {
    const loginPage = document.querySelector('.login-page');
    const profilePage = document.querySelector('.profile-page');
    const gamePage = document.querySelector('.game-page');
    const multiPGamePage = document.querySelector('.multiplayer-lobby');
    manageNavbar();
    loginPage === null || loginPage === void 0 ? void 0 : loginPage.classList.add('hidden');
    profilePage === null || profilePage === void 0 ? void 0 : profilePage.classList.add('hidden');
    gamePage === null || gamePage === void 0 ? void 0 : gamePage.classList.add('hidden');
    multiPGamePage === null || multiPGamePage === void 0 ? void 0 : multiPGamePage.classList.add('hidden');
}
function showStatistics() {
    const loginPage = document.querySelector('.login-page');
    const profilePage = document.querySelector('.profile-page');
    const gamePage = document.querySelector('.game-page');
    const multiPGamePage = document.querySelector('.multiplayer-lobby');
    manageNavbar();
    loginPage === null || loginPage === void 0 ? void 0 : loginPage.classList.add('hidden');
    profilePage === null || profilePage === void 0 ? void 0 : profilePage.classList.add('hidden');
    gamePage === null || gamePage === void 0 ? void 0 : gamePage.classList.add('hidden');
    multiPGamePage === null || multiPGamePage === void 0 ? void 0 : multiPGamePage.classList.add('hidden');
}
function showTournamentPage() {
    const loginPage = document.querySelector('.login-page');
    const profilePage = document.querySelector('.profile-page');
    const gamePage = document.querySelector('.game-page');
    const multiPGamePage = document.querySelector('.multiplayer-lobby');
    manageNavbar();
    loginPage === null || loginPage === void 0 ? void 0 : loginPage.classList.add('hidden');
    profilePage === null || profilePage === void 0 ? void 0 : profilePage.classList.add('hidden');
    gamePage === null || gamePage === void 0 ? void 0 : gamePage.classList.add('hidden');
    multiPGamePage === null || multiPGamePage === void 0 ? void 0 : multiPGamePage.classList.add('hidden');
}
function showAuthPage() {
    var _a;
    const loginPage = document.querySelector('.login-page');
    const profilePage = document.querySelector('.profile-page');
    const gamePage = document.querySelector('.game-page');
    (_a = document.querySelector('.newgame-page')) === null || _a === void 0 ? void 0 : _a.classList.add('hidden');
    manageNavbar();
    loginPage === null || loginPage === void 0 ? void 0 : loginPage.classList.remove('hidden');
    profilePage === null || profilePage === void 0 ? void 0 : profilePage.classList.add('hidden');
    gamePage === null || gamePage === void 0 ? void 0 : gamePage.classList.add('hidden');
}
function showProfilePage() {
    var _a, _b, _c, _d, _e;
    if (!isAuthenticated()) {
        navigateTo('/');
        return;
    }
    manageNavbar();
    (_a = document.querySelector('.login-page')) === null || _a === void 0 ? void 0 : _a.classList.add('hidden');
    (_b = document.querySelector('.profile-page')) === null || _b === void 0 ? void 0 : _b.classList.remove('hidden');
    (_c = document.querySelector('.game-page')) === null || _c === void 0 ? void 0 : _c.classList.add('hidden');
    (_d = document.querySelector('.newgame-page')) === null || _d === void 0 ? void 0 : _d.classList.add('hidden');
    (_e = document.querySelector('.multiplayer-lobby')) === null || _e === void 0 ? void 0 : _e.classList.add('hidden');
    loadProfileData();
}
function showGamePage() {
    var _a, _b, _c, _d, _e;
    if (!isAuthenticated()) {
        navigateTo('/');
        return;
    }
    manageNavbar();
    (_a = document.querySelector('.login-page')) === null || _a === void 0 ? void 0 : _a.classList.add('hidden');
    (_b = document.querySelector('.profile-page')) === null || _b === void 0 ? void 0 : _b.classList.add('hidden');
    (_c = document.querySelector('.game-page')) === null || _c === void 0 ? void 0 : _c.classList.add('hidden');
    (_d = document.querySelector('.newgame-page')) === null || _d === void 0 ? void 0 : _d.classList.remove('hidden');
    (_e = document.querySelector('.multiplayer-lobby')) === null || _e === void 0 ? void 0 : _e.classList.add('hidden');
}
export function navigateTo(path) {
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
        const target = e.target;
        if (target.matches('[data-link]')) {
            e.preventDefault();
            navigateTo(target.getAttribute('href') || '/');
        }
    });
    document.addEventListener('click', (e) => {
        const target = e.target;
        if (target.closest('#singlegame-btn')) {
            e.preventDefault();
            initGame();
        }
    });
    document.addEventListener('click', (e) => {
        const target = e.target;
        if (target.closest('#multiplayergame-btn')) {
            e.preventDefault();
            initMultiplayerGame();
        }
    });
    document.body.addEventListener('click', (e) => {
        const target = e.target;
        if (target.matches('[data-link]')) {
            e.preventDefault();
            const href = target.getAttribute('href');
            if (href === '/logout') {
                handleLogout();
            }
            else {
                navigateTo(href || '/');
            }
        }
    });
    handleRouting();
});
function loadProfileData() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            const token = localStorage.getItem('authToken');
            if (!token) {
                throw new Error('No authentication token found');
            }
            const response = yield fetch('/api/profile', {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
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
            const data = yield response.json();
            if (!data.nickname || !data.email) {
                throw new Error('Invalid profile data received');
            }
            const nicknameElement = document.getElementById('profile-nickname');
            const emailElement = document.getElementById('profile-email');
            if (nicknameElement)
                nicknameElement.textContent = data.nickname;
            if (emailElement)
                emailElement.textContent = data.email;
        }
        catch (error) {
            console.error('Profile data load error:', error);
            localStorage.removeItem('authToken');
            (_a = document.querySelector('.main-nav')) === null || _a === void 0 ? void 0 : _a.classList.add('hidden');
            navigateTo('/');
        }
    });
}
function handleLogout() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            const token = localStorage.getItem('authToken');
            if (token) {
                yield fetch('/api/logout', {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                });
            }
            localStorage.removeItem('authToken');
            (_a = document.querySelector('.main-nav')) === null || _a === void 0 ? void 0 : _a.classList.add('hidden');
            manageNavbar();
            navigateTo('/');
        }
        catch (error) {
            localStorage.removeItem('authToken');
            navigateTo('/');
        }
    });
}
function initGame() {
    var _a, _b, _c, _d;
    if (!isAuthenticated()) {
        alert('Oyun oynamak için giriş yapmalısınız');
        navigateTo('/');
        return;
    }
    (_a = document.querySelector('.login-page')) === null || _a === void 0 ? void 0 : _a.classList.add('hidden');
    (_b = document.querySelector('.profile-page')) === null || _b === void 0 ? void 0 : _b.classList.add('hidden');
    (_c = document.querySelector('.newgame-page')) === null || _c === void 0 ? void 0 : _c.classList.add('hidden');
    (_d = document.querySelector('.game-page')) === null || _d === void 0 ? void 0 : _d.classList.remove('hidden');
    const gameCanvas = document.getElementById('gameCanvas');
    if (!gameCanvas) {
        console.error('Canvas element not found!');
        return;
    }
    gameCanvas.classList.add('bg-black'); //
    const existingGame = window.currentGame;
    if (existingGame) {
        existingGame.stop();
    }
    const game = new PongGame(gameCanvas);
    window.currentGame = game;
    game.start();
}
function showMultiplayerLobby() {
    var _a, _b, _c;
    (_a = document.querySelector('.game-page')) === null || _a === void 0 ? void 0 : _a.classList.add('hidden');
    (_b = document.querySelector('.multiplayer-lobby')) === null || _b === void 0 ? void 0 : _b.classList.remove('hidden');
    (_c = document.querySelector('.newgame-page')) === null || _c === void 0 ? void 0 : _c.classList.add('hidden');
}
function initMultiplayerGame() {
    return __awaiter(this, void 0, void 0, function* () {
        if (!isAuthenticated()) {
            alert('Multiplayer oynamak için giriş yapmalısınız');
            navigateTo('/');
            return;
        }
        showMultiplayerLobby();
        setupLobbyUI();
        try {
            const socketManager = SocketManager.getInstance();
            yield socketManager.connect();
            document.getElementById('lobby-status').textContent = 'Connected to server';
        }
        catch (error) {
            document.getElementById('lobby-status').textContent = 'Connection failed';
        }
    });
}
function setupLobbyUI() {
    var _a, _b;
    (_a = document.getElementById('create-room-btn')) === null || _a === void 0 ? void 0 : _a.addEventListener('click', () => __awaiter(this, void 0, void 0, function* () {
        const statusElement = document.getElementById('lobby-status');
        statusElement.textContent = 'Creating room...';
        try {
            const socketManager = SocketManager.getInstance();
            const roomId = yield socketManager.createRoom();
            statusElement.innerHTML = `Room created! ID: <strong class="neon-text-yellow">${roomId}</strong><br>Waiting for opponent...`;
            socketManager.onGameStart = () => {
                var _a, _b;
                (_a = document.querySelector('.multiplayer-lobby')) === null || _a === void 0 ? void 0 : _a.classList.add('hidden');
                (_b = document.querySelector('.game-page')) === null || _b === void 0 ? void 0 : _b.classList.remove('hidden');
                startMultiplayerGame();
            };
        }
        catch (error) {
            statusElement.textContent = 'Error creating room';
        }
    }));
    (_b = document.getElementById('join-room-btn')) === null || _b === void 0 ? void 0 : _b.addEventListener('click', () => __awaiter(this, void 0, void 0, function* () {
        const roomId = document.getElementById('room-id-input').value.trim();
        if (!roomId)
            return;
        const statusElement = document.getElementById('lobby-status');
        statusElement.textContent = 'Joining room...';
        try {
            const socketManager = SocketManager.getInstance();
            const success = yield socketManager.joinRoom(roomId);
            if (success) {
                statusElement.textContent = 'Joined successfully! Starting game...';
                socketManager.onGameStart = () => {
                    var _a, _b;
                    (_a = document.querySelector('.multiplayer-lobby')) === null || _a === void 0 ? void 0 : _a.classList.add('hidden');
                    (_b = document.querySelector('.game-page')) === null || _b === void 0 ? void 0 : _b.classList.remove('hidden');
                    startMultiplayerGame();
                };
            }
            else {
                statusElement.textContent = 'Room not found or full';
            }
        }
        catch (error) {
            statusElement.textContent = 'Connection error';
        }
    }));
}
function startMultiplayerGame() {
    const canvas = document.getElementById('gameCanvas');
    if (!canvas)
        return;
    const existingGame = window.currentGame;
    if (existingGame) {
        existingGame.stop();
    }
    const game = new PongMultiplayer(canvas);
    window.currentGame = game;
    game.start();
}
//# sourceMappingURL=router.js.map