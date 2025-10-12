import '../css/style.css';

import './auth';
import './authToggle';
import './mobilMenu';
import './multiPlayerGame';
import { ProfileOptions } from './profileOptions';
import './router';
import './socketManager';
import { setupAuthToggle } from './authToggle';
import { setupMobileMenu } from './mobilMenu';
import { manageNavbar, navigateTo } from './router.js';
import './LiveChat/chatElements';
import './LiveChat/chatSocketManager';
import './LiveChat/liveChat';
import './LiveChat/liveChatRS';

function initializeApp() {
  manageNavbar();
  setupAuthToggle();
  setupMobileMenu();
  // Checking auth status and redirect if needed
  const currentPath = window.location.pathname;
const protectedRoutes = [
  '/profile', 
  '/game', 
  '/tournament',
  '/livechat',
  '/statistics',
  '/account',
  '/options'
];
  if (currentPath === '/' && localStorage.getItem('authToken')) {
    navigateTo('/profile');
    return;
  }

  if (protectedRoutes.includes(currentPath) && !localStorage.getItem('authToken')) {
    navigateTo('/');
  }
}

document.addEventListener('DOMContentLoaded', initializeApp);
