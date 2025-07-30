import { setupAuthToggle } from './authToggle.js';
import { setupMobileMenu } from './mobilMenu.js';
import { navigateTo } from './router.js';
import './socketManager.js';
function initializeApp() {
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
//# sourceMappingURL=main.js.map