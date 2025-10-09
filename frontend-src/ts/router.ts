import { isAuthenticated, isPreAuthenticated } from './auth.js';
import { PongGame } from './multiPlayerGame.js';
import { SocketManager } from './socketManager.js';
import { ProfileOptions } from './profileOptions.js';
import { setupMobileMenu } from './mobilMenu';
import { displayLiveChat, initLiveChat } from './LiveChat/liveChat.js';
import { ChatSocketManager } from './LiveChat/chatSocketManager.js';

const loginPage = document.querySelector('.login-page') as HTMLElement;
export const profilePage = document.querySelector('.profile-page') as HTMLElement;
export const gamePage = document.querySelector('.game-page') as HTMLElement;
export const newgamePage = document.querySelector('.newgame-page') as HTMLElement;
const multiplayerLobby = document.querySelector('.multiplayer-lobby') as HTMLElement;
const optionsPage = document.querySelector('.options-page') as HTMLElement;
const userSearchPage = document.querySelector('.user-search-page') as HTMLElement;
const userProfilePage = document.querySelector('.user-profile-page') as HTMLElement;
const oauthResultPage = document.querySelector('.oauth-result-page') as HTMLElement;
const nicknamePage = document.querySelector('.nickname-page') as HTMLElement;
const tournamentLobby = document.querySelector('.tournament-lobby') as HTMLElement;
const liveChatPage = document.querySelector('.live-chat') as HTMLElement;
let currentPage = loginPage;

export function showPage(pageToShow: HTMLElement)
{
	if (currentPage === pageToShow)
		return;
	currentPage.classList.add('hidden');
	pageToShow.classList.remove('hidden');
	currentPage = pageToShow;
}

const socketManager = SocketManager.getInstance();
// socketManager.connect();
const chatSocketManager = ChatSocketManager.getInstance();

type Route = {
  path: string;
  view: () => void;
  authRequired?: boolean;
  preAuthRequired?: boolean;
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
  { path: '/options', view: showOptionsPage, authRequired: true },
  {
    path: '/search',
    view: showUserSearchPage,
    authRequired: true,
  },
  {
    path: '/user/:id',
    view: showUserProfilePage,
    authRequired: true,
  },
  {
    path: '/oAuthCallback',
    view: showOAuthResultPage,
  },
  {
    path: '/choose-nickname',
    view: showNicknamePage,
    preAuthRequired: true,
  }
];

export function manageNavbar() {
  const navbar = document.querySelector('.main-nav') as HTMLElement;

  if (!navbar) return;

  if (isAuthenticated()) {
    // Kullanıcı giriş yaptıysa navbar'ı göster
    navbar.classList.remove('hidden');
    navbar.classList.add('md:flex');
  } else {
    // Kullanıcı giriş yapmadıysa navbar'ı gizle
    navbar.classList.add('hidden');
    navbar.classList.remove('md:flex');
  }
}

async function saveProfileChanges() {
  const nickname = (document.getElementById('options-nickname') as HTMLInputElement)?.value;
  const status = (document.getElementById('options-status') as HTMLSelectElement)?.value;

  try {
    const token = localStorage.getItem('authToken');
    if (!token) return;

    const response = await fetch('/api/profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ nickname, status }),
    });

    if (response.ok) {
      // Alert yerine daha zarif bir bildirim kullanın
      console.log('Profile updated successfully!');
      // navigateTo yerine direkt olarak sayfayı kapat
      showPage(profilePage);

      // Profil verilerini yenile
      await loadProfileData();
    } else {
      throw new Error('Failed to update profile');
    }
  } catch (error) {
    console.error('Profile update failed:', error);
    alert('Failed to update profile');
  }
}

function setupOptionsPageListeners() {
  // Back to profile butonu - sadece sayfayı gizle, yönlendirme yapma
  document.getElementById('back-to-profile')?.addEventListener('click', (e) => {
    e.preventDefault();
    showPage(profilePage);
  });

  // Options form submit
  document.getElementById('profile-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveProfileChanges();
  });
}

function showOptionsPage() {
  if (!isAuthenticated()) {
    navigateTo('/');
    return;
  }

  manageNavbar();
  showPage(optionsPage);


  loadOptionsData();
  setupOptionsPageListeners(); // Bu satırı ekleyin
}

async function loadOptionsData() {
  try {
    const token = localStorage.getItem('authToken');
    if (!token) return;

    // ProfileOptions sınıfını başlat
    const profileOptions = new ProfileOptions();
    profileOptions.init();
  } catch (error) {
    console.error('Failed to load options data:', error);
  }
}

function showUserSearchPage() {
  if (!isAuthenticated()) {
    navigateTo('/');
    return;
  }

  manageNavbar();

  // TÜM sayfaları gizle


  // Search sayfasını göster
  showPage(userSearchPage);

  // Setup fonksiyonunu çağır
  setupUserSearch();
}

function setupUserSearch() {
  const searchInput = document.getElementById('user-search-input') as HTMLInputElement;
  const resultsContainer = document.getElementById('search-results');

  if (!searchInput || !resultsContainer) {
    console.error('Search elements not found');
    return;
  }

  // Önceki event listener'ları temizle
  const newInput = searchInput.cloneNode(true) as HTMLInputElement;
  searchInput.parentNode?.replaceChild(newInput, searchInput);

  let searchTimeout: ReturnType<typeof setTimeout>;

  // Input event listener
  newInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    const query = newInput.value.trim();

    console.log('Search input:', query); // Debug

    if (query.length < 2) {
      resultsContainer.innerHTML =
        '<p class="text-gray-400 text-center py-4">Type at least 2 characters to search</p>';
      return;
    }

    searchTimeout = setTimeout(async () => {
      await performSearch(query, resultsContainer);
    }, 300);
  });

  // Initial message
  resultsContainer.innerHTML =
    '<p class="text-gray-400 text-center py-4">Type at least 2 characters to search</p>';
}
async function performSearch(query: string, resultsContainer: HTMLElement) {
  try {
    const token = localStorage.getItem('authToken');
    if (!token) {
      navigateTo('/');
      return;
    }

    resultsContainer.innerHTML = '<p class="text-gray-400 text-center py-4">Searching...</p>';

    console.log('Making search request for:', query); // Debug

    const response = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    console.log('Search response status:', response.status); // Debug

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Search results data:', data); // Debug

    if (data.users && data.users.length > 0) {
      renderSearchResults(data.users, resultsContainer);
    } else {
      resultsContainer.innerHTML =
        '<p class="text-gray-400 text-center py-4">No users found matching your search</p>';
    }
  } catch (error) {
    console.error('Search failed:', error);
    resultsContainer.innerHTML =
      '<p class="text-red-400 text-center py-4">Search failed. Please try again.</p>';
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'online':
      return 'text-green-400';
    case 'away':
      return 'text-yellow-400';
    case 'busy':
      return 'text-red-400';
    case 'invisible':
      return 'text-gray-400';
    default:
      return 'text-gray-400';
  }
}

function renderSearchResults(users: any[], container: HTMLElement) {
  console.log('Rendering search results:', users); // Debug

  container.innerHTML = users
    .map((user) => {
      const friendshipBadge = getFriendshipBadge(user.friendship_status || 'none');

      return `
            <div class="user-result flex items-center justify-between p-4 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors border border-gray-700">
                <div class="flex items-center space-x-4">
                    <img src="/imgs/avatars/${user.avatar || 'default'}.png"
                         class="w-12 h-12 rounded-full border-2 border-gray-600"
                         onerror="this.src='/imgs/avatars/default.png'">
                    <div>
                        <div class="text-white font-semibold text-lg">${user.nickname}</div>
                        <div class="flex items-center space-x-2">
                            <span class="text-sm ${getStatusColor(user.status || 'offline')}">
                                ● ${user.status || 'offline'}
                            </span>
                            ${friendshipBadge}
                        </div>
                    </div>
                </div>
                <div class="flex space-x-2">
                    ${getFriendActionButton(user)}
                    <button class="px-4 py-2 bg-green-600 rounded-lg hover:bg-green-700 transition-colors view-profile-btn text-white font-medium"
                            data-user-id="${user.id}">
                        View Profile
                    </button>
                </div>
            </div>
        `;
    })
    .join('');
  // Event listener'ları ekle
  addSearchResultEventListeners(container);
}

function addSearchResultEventListeners(container: HTMLElement) {
  // Friend request butonları
  container.querySelectorAll('.friend-request-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const target = e.target as HTMLElement;
      const userId = target.getAttribute('data-user-id');
      if (userId) {
        target.textContent = 'Sending...';
        target.setAttribute('disabled', 'true');

        const success = await sendFriendRequest(parseInt(userId));
        if (success) {
          target.textContent = 'Request Sent';
          target.classList.remove('bg-blue-600', 'hover:bg-blue-700');
          target.classList.add('bg-gray-600', 'cursor-not-allowed');
        } else {
          target.textContent = 'Add Friend';
          target.removeAttribute('disabled');
        }
      }
    });
  });

  container.querySelectorAll('.view-profile-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const target = e.target as HTMLElement;
      const userId = target.getAttribute('data-user-id');
      console.log('View profile clicked for user ID:', userId); // Debug
      if (userId) {
        const userIdNum = parseInt(userId);
        console.log('Parsed user ID:', userIdNum); // Debug
        if (!isNaN(userIdNum)) {
          navigateTo(`/user/${userIdNum}`);
        } else {
          console.error('Invalid user ID:', userId);
        }
      } else {
        console.error('No user ID found on button');
      }
    });
  });

  // Remove friend butonları
  container.querySelectorAll('.remove-friend-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const target = e.target as HTMLElement;
      const userId = target.getAttribute('data-user-id');
      if (userId && confirm('Are you sure you want to remove this friend?')) {
        const success = await removeFriend(parseInt(userId));
        if (success) {
          // Refresh search results
          const searchInput = document.getElementById('user-search-input') as HTMLInputElement;
          if (searchInput && searchInput.value.trim().length >= 2) {
            await performSearch(searchInput.value.trim(), container);
          }
        }
      }
    });
  });
}

async function removeFriend(friendId: number): Promise<boolean> {
  try {
    const token = localStorage.getItem('authToken');
    if (!token) {
      navigateTo('/');
      return false;
    }

    const response = await fetch(`/api/friends/${friendId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    return response.ok;
  } catch (error) {
    console.error('Remove friend failed:', error);
    return false;
  }
}

function getFriendActionButton(user: any): string {
  const friendshipStatus = user.friendship_status || 'none';

  switch (friendshipStatus) {
    case 'accepted':
      return `<button class="px-4 py-2 bg-red-600 rounded-lg hover:bg-red-700 transition-colors remove-friend-btn text-white font-medium"
                           data-user-id="${user.id}">
                        Remove Friend
                    </button>`;
    case 'pending':
      return `<button class="px-4 py-2 bg-gray-600 rounded-lg cursor-not-allowed text-white font-medium" disabled>
                        Request Sent
                    </button>`;
    default:
      return `<button class="px-4 py-2 bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors friend-request-btn text-white font-medium"
                           data-user-id="${user.id}">
                        Add Friend
                    </button>`;
  }
}
function getFriendshipBadge(status: string): string {
  switch (status) {
    case 'accepted':
      return '<span class="text-xs bg-green-600 px-2 py-1 rounded-full">Friend</span>';
    case 'pending':
      return '<span class="text-xs bg-yellow-600 px-2 py-1 rounded-full">Pending</span>';
    default:
      return '';
  }
}

async function sendFriendRequest(targetUserId: number): Promise<boolean> {
  try {
    const token = localStorage.getItem('authToken');
    if (!token) {
      navigateTo('/');
      return false;
    }

    console.log('Sending friend request to user:', targetUserId); // Debug

    const response = await fetch('/api/friends/request', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ targetUserId }),
    });

    console.log('Friend request response:', response.status); // Debug

    if (response.ok) {
      console.log('Friend request sent successfully');
      return true;
    } else {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.error('Friend request failed:', errorData);
      return false;
    }
  } catch (error) {
    console.error('Friend request network error:', error);
    return false;
  }
}

function showUserProfilePage() {
  if (!isAuthenticated()) {
    navigateTo('/');
    return;
  }

  manageNavbar();
  // Tüm sayfaları gizle
  showPage(userProfilePage);


  // URL'den user ID'yi al ve profil verilerini yükle
  const userId = window.location.pathname.split('/').pop();
  if (userId && !isNaN(parseInt(userId))) {
    loadUserProfileData(parseInt(userId));
  } else {
    // Geçersiz user ID, search sayfasına yönlendir
    navigateTo('/search');
  }
}

async function showOAuthResultPage() {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');
  const state = urlParams.get('state');

  manageNavbar();

  const oauth_result_header = document.getElementById('oauth-result-header');
  const oauth_result_text= document.getElementById('oauth-result-text');

  let header = 'Authentication Error';
  let text = 'Error when trying to login through 42.';

  if (code !== null && state !== null) {
    const result = await fetch('/api/auth/42/callback?' + urlParams.toString());
    if (result.ok) {
      const data = await result.json();

      console.log(data);
      if (data.token && data.action_required !== false) {
        localStorage.setItem('preAuthToken', data.token);
        const location = data.action_required === 'nickname' ? '/choose-nickname' : data.action_required === '2fa' ? '/2fa' : null;
        if (location) {
          window.location.href = location;
          return;
        }
      } else if (data.token && data.action_required === false) {
        // TODO: Check if the user should be redirected back to CLI instead of setting it in the browser
        localStorage.setItem('authToken', data.token);
        navigateTo('/profile');
        return;
      } else if (!data.token && isAuthenticated()) {
        navigateTo('/profile');
        return;
      }
    }
  }

  if (oauth_result_header) {
    oauth_result_header.innerText = header;
  }

  if (oauth_result_text) {
    oauth_result_text.innerText = text;
  }

  showPage(oauthResultPage);
}

function showNicknamePage() {
  manageNavbar();
  showPage(nicknamePage);
}

async function loadUserProfileData(userId: number) {
  try {
    const token = localStorage.getItem('authToken');
    if (!token) {
      console.error('No auth token found');
      navigateTo('/');
      return;
    }

    console.log('Loading user profile for ID:', userId);
    console.log('Using endpoint:', `/api/user/${userId}`);

    const response = await fetch(`/api/user/${userId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    console.log('User profile response status:', response.status);
    console.log('User profile response headers:', response.headers);

    if (response.ok) {
      const userData = await response.json();
      console.log('User profile data received:', userData);
      renderUserProfile(userData);
    } else {
      // Response body'yi de kontrol edelim
      const errorText = await response.text();
      console.error('User profile error response:', errorText);

      // Alternatif endpoint'i deneyelim
      console.log('Trying alternative endpoint...');
      const altResponse = await fetch(`/api/users/${userId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      console.log('Alternative endpoint status:', altResponse.status);

      if (altResponse.ok) {
        const userData = await altResponse.json();
        console.log('Alternative endpoint data:', userData);
        renderUserProfile(userData);
      } else {
        alert('User not found');
        navigateTo('/search');
      }
    }
  } catch (error) {
    console.error('Network error loading user profile:', error);
    alert('Error loading user profile');
    navigateTo('/search');
  }
}

function renderUserProfile(userData: any) {
  const avatarImg = document.getElementById('user-profile-avatar') as HTMLImageElement;
  const nicknameElem = document.getElementById('user-profile-nickname');
  const statusElem = document.getElementById('user-profile-status');
  const actionsElem = document.getElementById('user-profile-actions');

  if (avatarImg) {
    avatarImg.src = `/imgs/avatars/${userData.avatar || 'default'}.png`;
    avatarImg.onerror = () => {
      avatarImg.src = '/imgs/avatars/default.png';
    };
  }
  if (nicknameElem) nicknameElem.textContent = userData.nickname;
  if (statusElem) {
    statusElem.textContent = userData.status || 'offline';
    statusElem.className = `${getStatusColor(userData.status || 'offline')} text-lg`;
  }

  // Friend durumuna göre aksiyon butonları
  if (actionsElem) {
    const friendshipStatus = userData.friendship_status || 'none';
    actionsElem.innerHTML = getFriendActionButton({
      id: userData.id,
      friendship_status: friendshipStatus,
    });

    // Event listener'ları ekle
    addUserProfileEventListeners(userData.id);
  }
}

function addUserProfileEventListeners(userId: number) {
  // Add friend button
  document.querySelector('.friend-request-btn')?.addEventListener('click', async (e) => {
    e.preventDefault();
    const button = e.target as HTMLElement;
    button.textContent = 'Sending...';
    button.setAttribute('disabled', 'true');

    const success = await sendFriendRequest(userId);
    if (success) {
      button.textContent = 'Request Sent';
      button.classList.remove('bg-blue-600', 'hover:bg-blue-700');
      button.classList.add('bg-gray-600', 'cursor-not-allowed');
    } else {
      button.textContent = 'Add Friend';
      button.removeAttribute('disabled');
    }
  });

  // Remove friend button
  document.querySelector('.remove-friend-btn')?.addEventListener('click', async (e) => {
    e.preventDefault();
    if (confirm('Are you sure you want to remove this friend?')) {
      const success = await removeFriend(userId);
      if (success) {
        // Profili yenile
        loadUserProfileData(userId);
      }
    }
  });

  // Back button
  const backButton = document.createElement('button');
  backButton.className =
    'mt-4 px-4 py-2 bg-gray-600 rounded-lg hover:bg-gray-700 transition-colors text-white font-medium';
  backButton.textContent = 'Back to Search';
  backButton.addEventListener('click', () => navigateTo('/search'));

  document.getElementById('user-profile-actions')?.appendChild(backButton);
}

function showLiveChat() {
  manageNavbar();
  showPage(liveChatPage);
  displayLiveChat();
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
  document.querySelector('.options-page')?.classList.add('hidden');
  document.querySelector('.user-search-page')?.classList.add('hidden');
  document.querySelector('.user-profile-page')?.classList.add('hidden');
  document.querySelector('.oauth-result-page')?.classList.add('hidden');
  document.querySelector('.nickname-page')?.classList.add('hidden');
  document.querySelector('.tournament-lobby')?.classList.add('hidden');

}

function showAuthPage() {
  manageNavbar();
  showPage(loginPage);
}

function showProfilePage() {
  if (!isAuthenticated()) {
    navigateTo('/');
    return;
  }

  // showPage() will check that
//   if (document.querySelector('.profile-page')?.classList.contains('hidden') === false) {
//     return;
//   }

  manageNavbar();
  showPage(profilePage);
  loadProfileData();
}

function showGamePage() {
  if (!isAuthenticated()) {
    navigateTo('/');
    return;
  }
  manageNavbar();
  showPage(newgamePage);
}

export function navigateTo(path: string) {
  if (window.location.pathname === path) {
    return;
  }

  window.history.pushState({}, '', path);
  handleRouting();
}

function handleRouting() {
  const currentPath = window.location.pathname;

  // Parametreli route'ları kontrol et
  if (currentPath.startsWith('/user/')) {
    const userId = currentPath.split('/').pop();
    if (userId && !isNaN(parseInt(userId))) {
      if (!isAuthenticated()) {
        navigateTo('/');
        return;
      }
      showUserProfilePage();
      return;
    }
  }

  // Normal route'ları kontrol et
  const route = routes.find((r) => r.path === currentPath) || routes[0];

  if (route.authRequired && !isAuthenticated()) {
    navigateTo('/');
    return;
  }

  if (route.preAuthRequired && !isPreAuthenticated()) {
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
  initLiveChat(chatSocketManager);
  document.body.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.matches('[data-link]')) {
      e.preventDefault();
      navigateTo(target.getAttribute('href') || '/');
    }
  });

  const optionsBtn = document.getElementById('options-btn');
  if (optionsBtn) {
    optionsBtn.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo('/options');
    });
  }

  const remoteAuthButton = document.getElementById('remote-auth-btn');
  if (remoteAuthButton) {
    remoteAuthButton.addEventListener('click', async (e) => {
      e.preventDefault();

      const result = await fetch('/api/auth/42');
      if (!result.ok) {
        navigateTo('/oAuthCallback');
      } else {
        const { url }= await result.json();
        if (!url) {
          navigateTo('/oAuthCallback');
        } else {
          window.location.href = url;
        }
      }
    });
  }

  const loginScreenBtn = document.getElementById('loginscreen-btn');
  if (loginScreenBtn) {
    loginScreenBtn.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo('/');
    });
  }

  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('#singlegame-btn')) {
      e.preventDefault();
      initPongGame(true, false);
    }
  });
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('#multiplayergame-remote-btn')) {
      e.preventDefault();
      initPongGame(false, true);
    }
  });
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('#multiplayergame-local-btn')) {
      e.preventDefault();
      initPongGame(false, false);
    }
  });

  document.body.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.matches('[data-link]')) {
            e.preventDefault();
            const href = target.getAttribute('href');
            const dataLink = target.getAttribute('data-link');
            
            // Href veya data-link'ten birini kullan
            const link = href || dataLink;
            
            if (link === '/logout') {
                handleLogout();
            } else if (link) {
                navigateTo(link);
            }
        }
    });
  
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    
    // Create Tournament
    if (target.closest('#create-tournament-btn')) {
      e.preventDefault();
      createTournament();
    }
    
    // Join Tournament
    if (target.closest('#join-tournament-btn')) {
      e.preventDefault();
      joinTournament();
    }
    
    // Start Tournament
    if (target.closest('#start-tournament-btn')) {
      e.preventDefault();
      startTournament();
    }
    
    // Leave Tournament
    if (target.closest('#leave-tournament-btn')) {
      e.preventDefault();
      leaveTournament();
    }
  });

  // Tournament ID Input - Enter key support
  document.addEventListener('keypress', (e) => {
    if (e.target instanceof HTMLInputElement && e.target.id === 'tournament-id-input') {
      if (e.key === 'Enter') {
        e.preventDefault();
        joinTournament();
      }
    }
  });

  handleRouting();
});
setupMobileMenu(); // For mobile toggle issues.
document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  if (target.matches('a[data-link]')) {
    e.preventDefault();
    const href = target.getAttribute('href');
    if (href) navigateTo(href);

    // menüyü kapat
    const navMenu = document.querySelector('.main-nav') as HTMLElement;
    const closeMenu = document.getElementById('close-menu') as HTMLImageElement;
    const hamburgerMenu = document.getElementById('hamburger') as HTMLImageElement;
    if (navMenu && closeMenu && hamburgerMenu) {
      navMenu.classList.add('hidden', 'md:flex');
      closeMenu.classList.add('hidden');
      hamburgerMenu.classList.remove('hidden');
    }
  }
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

    if (!data.nickname) {
      throw new Error('Invalid profile data received');
    }

    const email = data.email ?? 'N/A (Logged in through 42)';

    const nicknameElement = document.getElementById('profile-nickname');
    const emailElement = document.getElementById('profile-email');

    if (nicknameElement) nicknameElement.textContent = data.nickname;
    if (emailElement) emailElement.textContent = email;
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
    document.querySelector('.options-page')?.classList.add('hidden');
    document.querySelector('.multiplayer-lobby')?.classList.add('hidden');
    document.querySelector('.user-search-page')?.classList.add('hidden');
    document.querySelector('.user-profile-page')?.classList.add('hidden');
    document.querySelector('.tournament-lobby')?.classList.add('hidden');


    manageNavbar();
    navigateTo('/');
	chatSocketManager.disconnect();
  } catch (error) {
    localStorage.removeItem('authToken');
    navigateTo('/');
  }
}

// QUESTION: what's happening here? is it more of a "show game options?" --> is the funciton name appropriate?
// function showMultiplayerLobby() {
//   document.querySelector('.game-page')?.classList.add('hidden');
//   document.querySelector('.multiplayer-lobby')?.classList.remove('hidden');
//   document.querySelector('.newgame-page')?.classList.add('hidden');
//   document.querySelector('.user-search-page')?.classList.add('hidden');
//   document.querySelector('.options-page')?.classList.add('hidden');
//   document.querySelector('.user-profile-page')?.classList.add('hidden');
//   document.querySelector('.oauth-result-page')?.classList.add('hidden');
//   document.querySelector('.nickname-page')?.classList.add('hidden');
//   document.querySelector('.tournament-lobby')?.classList.add('hidden');

// }

async function initPongGame(singlePlayer: boolean, remote: boolean) {
  if (!isAuthenticated()) {
    alert('Multiplayer oynamak için giriş yapmalısınız');
    navigateTo('/');
    return;
  }

  const socketManager = SocketManager.getInstance();
  const existingGame = socketManager.getGameInstance();
  if (existingGame && existingGame.gameRunning) {
    alert('A game is already running. Please wait for it to finish first.');
    return; 
  }

  if (!singlePlayer && remote) {
    // showMultiplayerLobby();
	showPage(multiplayerLobby);
    setupLobbyUI(singlePlayer, remote);
    try {
      await socketManager.ensureConnection();
      document.getElementById('lobby-status')!.textContent = 'Connected to server';
    } catch (error) {
      document.getElementById('lobby-status')!.textContent = 'Connection failed';
    }
  }
  else {
    showPage(gamePage);
    setupLobbyUI(singlePlayer, remote);
  }
}

function startSinglePlayerGame(game: PongGame, singlePlayer: boolean, remote: boolean) {
  try {
    const roomId = socketManager.createRoom();
    socketManager.onGameStart = () => {
      showPage(gamePage);
      startMultiplayerGame(game);
    };
  } catch (error) {
    document.getElementById('lobby-status')!.textContent = 'Connection failed';
  }
}

function setupLobbyUI(singlePlayer: boolean, remote: boolean) {
  const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
  if (!canvas) return;
  
  const socketManager = SocketManager.getInstance();
  const existingGame = socketManager.getGameInstance();
  if (existingGame && existingGame.gameRunning) {
    console.error('setupLobbyUI called while game is running - this should not happen');
    alert('A game is already running. Please wait for it to finish first.');
    showGamePage();
    return;
  }
  
  const game = new PongGame(canvas, socketManager);
  socketManager.setGameInstance(game);
  game.isSinglePlayer = singlePlayer;
  game.isRemote = remote;

  if (singlePlayer || !remote) {
    startSinglePlayerGame(game, singlePlayer, remote);
    return;
  }

  document.getElementById('create-room-btn')?.addEventListener('click', async () => {
    const statusElement = document.getElementById('lobby-status')!;
    statusElement.textContent = 'Creating room...';
    try {
      const roomId = await socketManager.createRoom();

      if (roomId) {
        statusElement.innerHTML = `Room created! ID: <strong class="neon-text-yellow">${roomId}</strong><br>Waiting for opponent...`;

        socketManager.onGameStart = () => {
          showPage(gamePage);
          startMultiplayerGame(game);
        };
      } else {
        throw new Error('No room ID received');
      }
    } catch (error) {
      console.error('Join room failed:', error);
      statusElement.textContent = 'Failed to join room';
      
      setTimeout(() => {
        showGamePage();
      }, 2000);
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
          showPage(gamePage);
          startMultiplayerGame(game);
        };
      } else {
        throw new Error('Failed to join room');
      }
    } catch (error) {
      console.error('Join room failed:', error);
      statusElement.textContent = 'Failed to join room';
      
      // BEI ERROR ZURÜCK ZUR GAME SELECTION
      setTimeout(() => {
        showGamePage(); // Zurück zur Game-Auswahl
      }, 2000);
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


// TOURNAMENT
function showTournamentLobby(): void {
//   hideAllPages();
  showPage(tournamentLobby);
  resetTournamentUI();
}

// function hideAllPages(): void {
//   document.querySelector('.login-page')?.classList.add('hidden');
//   document.querySelector('.profile-page')?.classList.add('hidden');
//   document.querySelector('.game-page')?.classList.add('hidden');
//   document.querySelector('.newgame-page')?.classList.add('hidden');
//   document.querySelector('.multiplayer-lobby')?.classList.add('hidden');
//   document.querySelector('.tournament-lobby')?.classList.add('hidden');
//   document.querySelector('.options-page')?.classList.add('hidden');
//   document.querySelector('.user-search-page')?.classList.add('hidden');
//   document.querySelector('.user-profile-page')?.classList.add('hidden');
// }

function resetTournamentUI(): void {
  document.getElementById('tournament-status')!.textContent = 'Ready to create or join a tournament';
  const tournamentInput = document.getElementById('tournament-id-input') as HTMLInputElement;
  if (tournamentInput) tournamentInput.value = '';
  document.getElementById('tournament-info')?.classList.add('hidden');
  document.getElementById('tournament-owner-controls')?.classList.add('hidden');
}

async function createTournament(): Promise<void> {
  try {
    document.getElementById('tournament-status')!.textContent = 'Creating tournament...';
    
    const tournamentData = await socketManager.createTournament();
    console.log('Tournament created with data:', tournamentData);

    const roomId = tournamentData.roomId || tournamentData.id || 'Unknown';

    showTournamentInfo(roomId, tournamentData);
    document.getElementById('tournament-status')!.textContent = `Tournament ${roomId} created! Share this ID with others.`;
    
  } catch (error) {
    console.error('Failed to create tournament:', error);
    document.getElementById('tournament-status')!.textContent = 'Failed to create tournament. Please try again.';
  }
}

async function joinTournament(): Promise<void> {
  const tournamentIdInput = document.getElementById('tournament-id-input') as HTMLInputElement;
  const tournamentId = tournamentIdInput.value.trim().toUpperCase();
  
  if (!tournamentId) {
    alert('Please enter a tournament ID');
    return;
  }
  
  if (tournamentId.length < 3) {
    alert('Tournament ID must be at least 3 characters');
    return;
  }
  
  try {
    document.getElementById('tournament-status')!.textContent = `Joining tournament ${tournamentId}...`;

    const tournamentData = await socketManager.joinTournament(tournamentId);
    console.log('Tournament data received:', tournamentData);

    showTournamentInfo(tournamentId, tournamentData);
    document.getElementById('tournament-status')!.textContent = `Joined tournament ${tournamentId}`;

  } catch (error) {
    console.error('Failed to join tournament:', error);
    document.getElementById('tournament-status')!.textContent = 'Failed to join tournament. Check ID and try again.';
  }
}

function showTournamentInfo(tournamentId: string, tournamentData?: any): void {
  document.getElementById('current-tournament-id')!.textContent = tournamentId;
  document.getElementById('tournament-info')?.classList.remove('hidden');
  document.getElementById('tournament-owner-controls')?.classList.remove('hidden');

  if (tournamentData && tournamentData.players) {
    console.log('Using real player data:', tournamentData.players);
    updateTournamentPlayers(tournamentData.players);
  } else if (tournamentData && tournamentData.room && tournamentData.room.players) {
    console.log('Using nested player data:', tournamentData.room.players);
    updateTournamentPlayers(tournamentData.room.players);
  } else {
    return;
  }
  updateTournamentPlayers(tournamentData.players);
}

function updateTournamentPlayers(playersData: any): void {
  console.log('Live update - Tournament players changed:', playersData);
  
  // Verschiedene Server-Datenstrukturen handhaben
  let players = playersData;
  if (playersData && !Array.isArray(playersData)) {
    players = playersData.players || playersData.room?.players || [];
  }
  
  if (!Array.isArray(players)) {
    console.warn('Invalid players data received:', playersData);
    return;
  }
  
  const playersList = document.getElementById('tournament-players-list')!;
  const playerCount = document.getElementById('tournament-player-count')!;
  const startBtn = document.getElementById('start-tournament-btn') as HTMLButtonElement;
  
  playersList.innerHTML = '';
  console.log('Updating tournament players:', players);
  
  players.forEach(player => {
    const playerDiv = document.createElement('div');
    playerDiv.className = 'flex justify-between items-center p-2 bg-gray-800 rounded';

    const nickname = player.nickname ;
    playerDiv.innerHTML = `
      <span class="text-white">${player.nickname}</span>
      <span class="text-xs text-gray-400">Player</span>
    `;
    playersList.appendChild(playerDiv);
  });
  
  playerCount.textContent = `${players.length}/5`;
  
  // Enable start button if enough players and user is owner
  if (startBtn) {
    startBtn.disabled = players.length < 3;
    startBtn.textContent = players.length < 3 
      ? `Start Tournament (Min. 3 players)` 
      : `Start Tournament (${players.length} players)`;
  }
}

async function startTournament(): Promise<void> {
  try {
    document.getElementById('tournament-status')!.textContent = 'Starting tournament...';
    
    const tournamentId = document.getElementById('current-tournament-id')!.textContent;
    
    if (!tournamentId || tournamentId === '-') {
      throw new Error('No tournament ID found');
    }
    
    await socketManager.startTournament(tournamentId);
    
  } catch (error) {
    console.error('Failed to start tournament:', error);
    document.getElementById('tournament-status')!.textContent = 'Failed to start tournament. Please try again.';
  }
}

async function leaveTournament(): Promise<void> {
  if (!confirm('Are you sure you want to leave the tournament?')) {
    return;
  }
  
  try {
    // Echte Socket-Implementierung
    await socketManager.leaveTournament();
    
    resetTournamentUI();
    document.getElementById('tournament-status')!.textContent = 'Left tournament';
    
  } catch (error) {
    console.error('Failed to leave tournament:', error);
  }
}

// Update showTournamentPage function
async function showTournamentPage(): Promise<void> {
  if (!isAuthenticated()) {
    navigateTo('/');
    return;
  }
  showTournamentLobby();
  
  try {
    await socketManager.ensureConnection();
    document.getElementById('tournament-status')!.textContent = 'Connected to server - Ready for tournament';
  } catch (error) {
    console.error('Tournament connection failed:', error);
    document.getElementById('tournament-status')!.textContent = 'Connection failed - tournament unavailable';
  }
}

function handleTournamentMatchStart(data: any): void {
  console.log('[Frontend] Tournament Match Start'); // Debug

//   hideAllPages();
  showPage(gamePage);

  const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
  if (!canvas) {
    console.error('Canvas not found!');
    return;
  }
  canvas.classList.remove('hidden', 'invisible', 'opacity-0');
  canvas.style.display = 'block !important';
  canvas.style.visibility = 'visible !important';

  const game = new PongGame(canvas, socketManager);
  socketManager.setGameInstance(game);

  if (data.owner && data.guest) {
    const statusElement = document.getElementById('tournament-status');
    if (statusElement) {
      statusElement.textContent = `Match: ${data.owner.nickname} vs ${data.guest.nickname}`;
    }
  }

  console.log('Tournament game setup complete, canvas visible');

  socketManager.onGameStart = () => {
    console.log('Tournament game starting!');
    startMultiplayerGame(game);
  };
}

function handleTournamentMatchEnd(data: any): void {
  console.log('Tournament match ended:', data);
  
  // Nur Message zeigen, NICHT navigieren
  const status = document.getElementById('tournament-status');
  if (status) {
    const winnerName = data.winnerName || data.winner;
    const loserName = data.loserName || data.loser;
    const message = data.message || `${winnerName} wins!`;
    
    status.textContent = `Match Result: ${message}`;
  }
  
  setTimeout(() => {
    const status = document.getElementById('tournament-status');
    if (status) {
      status.textContent = 'Waiting for next match...';
    }
  }, 2000);

  // Auf Game-Page bleiben für nächstes Match
  console.log('Match end handled, waiting for next match or tournament end');
}

function handleTournamentEnd(data: any): void {
  console.log('Tournament completely finished:', data);
  
  const status = document.getElementById('tournament-status');
  if (status) {
    const winnerMessage = data.message || `Tournament finished!`;
    const winnerName = data.winnerName || data.winner;
    
    status.textContent = `🏆 ${winnerMessage}`;
    
    // Zusätzliche Winner-Info falls verfügbar
    if (winnerName && typeof winnerName === 'string') {
      status.textContent = `🏆 Tournament Winner: ${winnerName}!`;
    }
  }
  
  // NUR hier zur Tournament-Lobby zurück
  setTimeout(() => {
    // hideAllPages();
    showPage(tournamentLobby);
    resetTournamentUI();
    document.getElementById('tournament-status')!.textContent = 'Tournament completed';
  }, 3000);
}

// To-Do: das gescheit aufräumen und nur importieren
// Globale Funktionen für Socket Events registrieren
(window as any).updateTournamentPlayers = updateTournamentPlayers;
(window as any).handleTournamentMatchStart = handleTournamentMatchStart;
(window as any).handleTournamentMatchEnd = handleTournamentMatchEnd;
(window as any).handleTournamentEnd = handleTournamentEnd;
