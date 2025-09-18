import '../css/style.css';

import './auth';
import './authToggle';
import './mobilMenu';
import './multiPlayerGame';
import { ProfileOptions } from './profileOptions.js';
import './router';
import './socketManager';
import { setupAuthToggle } from './authToggle';
import { setupMobileMenu } from './mobilMenu';
import { manageNavbar, navigateTo } from './router';

function initializeApp() {
  manageNavbar();
  setupAuthToggle();
  setupMobileMenu();
  // Checking auth status and redirect if needed
  const currentPath = window.location.pathname;
  const protectedRoutes = ['/profile', '/game', '/tournament'];

  if (protectedRoutes.includes(currentPath) && !localStorage.getItem('authToken')) {
    navigateTo('/');
  }
}

document.addEventListener('DOMContentLoaded', initializeApp);
