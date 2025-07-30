var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { navigateTo } from './router.js';
export function handleSignup(formData) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const response = yield fetch('/api/signup', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData),
            });
            const responseClone = response.clone();
            if (!response.ok) {
                const errorData = yield responseClone.json();
                throw new Error(errorData.error || 'Authentication failed');
            }
            const data = yield responseClone.json();
            localStorage.setItem('authToken', data.token);
            return data;
        }
        catch (error) {
            console.error('Signup error:', error);
            throw error;
        }
    });
}
export function handleLogin(formData) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        try {
            const response = yield fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData),
            });
            if (!response.ok) {
                const errorData = yield response.json();
                const errorMessage = errorData.message || errorData.error || 'Login failed';
                throw new Error(errorMessage);
            }
            const data = yield response.json();
            if (!data.token) {
                throw new Error('Authentication token not received');
            }
            localStorage.setItem('authToken', data.token);
            // Re-show the nav-bar (I know I shoud crate a function that adds and removes hidden from classlists later on.)
            (_a = document.querySelector('.main-nav')) === null || _a === void 0 ? void 0 : _a.classList.remove('hidden');
            navigateTo('/profile');
            return data;
        }
        catch (error) {
            console.error('Login error:', error);
            localStorage.removeItem('authToken');
            (_b = document.querySelector('.main-nav')) === null || _b === void 0 ? void 0 : _b.classList.add('hidden');
            throw error;
        }
    });
}
export function isAuthenticated() {
    return !!localStorage.getItem('authToken');
}
export function logout() {
    localStorage.removeItem('authToken');
}
//# sourceMappingURL=auth.js.map