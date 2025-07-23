import { handleSignup, handleLogin } from "./auth.js";
import { navigateTo } from "./router.js";


// For input security issues I'll use these as I got errors for now it's hashed.
// const validateEmail = (email: string): boolean => {
//   const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,63}$/;
//   return re.test(email.trim());
// };

// const validatePassword = (password: string): boolean => {
//   // for 8 chars and a number.
//   const re = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{8,}$/;
//   return re.test(password);
// };

// const sanitizeInput = (input: string): string => {
//   return input.trim().replace(/\s+/g, ' ');
// };
// Form submits
const setupLoginValidation = () => {
  const form = document.getElementById('loginForm') as HTMLFormElement;
  
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = (document.getElementById('login-email') as HTMLInputElement).value;
    const password = (document.getElementById('login-pw') as HTMLInputElement).value;
    
    // if (!validateEmail(email)) {
    //   alert('enter a valid email');
    //   return;
    // }
    
    // if (!validatePassword(password)) {
    //   alert('At least 8 characters!');
    //   return;
    // }
    
    try {
      await handleLogin({ email, password });
      navigateTo('/profile');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Login failed');
    }
  });
};

const setupSignupValidation = () => {
  const form = document.getElementById('signupForm') as HTMLFormElement;
  
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const nickname = (document.getElementById('signup-nickname') as HTMLInputElement).value;
    const email = (document.getElementById('signup-email') as HTMLInputElement).value;
    const password = (document.getElementById('signup-pw') as HTMLInputElement).value;
    
    if (nickname.length < 3) {
      alert('Nickname should be at least 3 characters!');
      return;
    }
    // if (!validateEmail(email)) {
    //   alert('enter a valid email');
    //   return;
    // }
    
    // if (!validatePassword(password)) {
    //   alert('At least 8 characters!');
    //   return;
    // }

    try {
      await handleSignup({ nickname, email, password });
      navigateTo('/profile');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Signup failed');
    }
  });
};

// Function to handle the toggle between login and signup forms
export function setupAuthToggle() {
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const switchToSignup = document.getElementById('switchToSignup');
    const switchToLogin = document.getElementById('switchToLogin');

    if (!loginForm || !signupForm || !switchToSignup || !switchToLogin) {
      console.warn('Auth toggle elements not found');
      return;
    }

    switchToSignup.addEventListener('click', () => {
        loginForm.classList.add('hidden');
        signupForm.classList.remove('hidden');
        switchToSignup.classList.add('hidden');
        switchToLogin.classList.remove('hidden');
    });

    switchToLogin.addEventListener('click', () => {
        signupForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
        switchToLogin.classList.add('hidden');
        switchToSignup.classList.remove('hidden');
    });

    setupLoginValidation();
    setupSignupValidation();
}