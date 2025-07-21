import { setupAuthToggle } from './authToggle.js';
import { setupMobileMenu } from './mobilMenu.js';
import { navigateTo } from "./router.js";

// Initialize all frontend functionality
function initializeApp() {
    setupAuthToggle();
    setupMobileMenu();
    
    // Check auth status and redirect if needed
    const currentPath = window.location.pathname;
    const protectedRoutes = ['/profile', '/game', '/tournament'];
    
    if (protectedRoutes.includes(currentPath) && !localStorage.getItem('authToken')) {
        navigateTo('/');
    }
}

// Start the app when DOM is fully loaded
document.addEventListener('DOMContentLoaded', initializeApp);