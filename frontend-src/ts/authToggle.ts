import { handleSignup, handleLogin, handleSetNickname, handle2FaLogin, handleDisable2Fa, handleEnable2Fa, handleUpdateAccount, handleDeleteAccount } from './auth.js';
import { navigateTo, showAccountPage, showDeleteAccountPage } from './router.js';

// For input security issues I'll use these as I got errors for now it's hashed.
const validateEmail = (email: string): boolean => {
  const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,63}$/;
  return re.test(email.trim());
};

const validateNickname = (nickname: string): boolean => {
  const re = /^[a-zA-Z0-9_\-\.]+$/;
  return re.test(nickname);
}

const validatePassword = (password: string): boolean => {
  // for 8 chars and a number.
  const re = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{8,}$/;
  return re.test(password);
};

const sanitizeInput = (input: string): string => {
  return input.trim().replace(/\s+/g, ' ');
};
// Form submits
const setupLoginValidation = () => {
  const form = document.getElementById('loginForm') as HTMLFormElement;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = (document.getElementById('login-email') as HTMLInputElement).value;
    const password = (document.getElementById('login-pw') as HTMLInputElement).value;

    if (!validateEmail(email)) {
      alert('enter a valid email');
      return;
    }

    if (!validatePassword(password)) {
      alert('Password must contain at least 8 characters and include at least one lower case and upper case letter and a digit.');
      return;
    }

    try {
      await handleLogin({ email, password });
      navigateTo('/profile');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Login failed');
    }
  });
};

const setup2FaLoginValidation = () => {
  const form = document.getElementById('totp-form') as HTMLFormElement;

  form.addEventListener('submit', async(e) => {
    e.preventDefault();

    const totp_code = (document.getElementById('totp-field') as HTMLInputElement).value;

    if (!/^\d{6}$/.test(totp_code)) {
      alert('2FA Code must consist of exactly 6 digits!');
      return;
    }

    try {
      await handle2FaLogin({ totp_code });
      navigateTo('/profile');
    } catch (error) {
      alert(error instanceof Error ? error.message : '2Fa validation failed');
    }
  });
}

const setupEnableTotpFormValidation = () => {
  const form = document.getElementById('enable-totp-form') as HTMLFormElement;

  form.addEventListener('submit', async(e) => {
    e.preventDefault();

    const totp_code = (document.getElementById('enable-totp-code') as HTMLInputElement).value;

    if (!/^\d{6}$/.test(totp_code)) {
      alert('2FA Code must consist of exactly 6 digits!');
      return;
    }

    try {
      await handleEnable2Fa({ totp_code });
      showAccountPage();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Enabling 2Fa failed');
    }
  });
}

const setupDisableTotpFormValidation = () => {
  const form = document.getElementById('disable-totp-form') as HTMLFormElement;

  form.addEventListener('submit', async(e) => {
    e.preventDefault();

    const totp_code = (document.getElementById('current-totp') as HTMLInputElement).value;

    if (!/^\d{6}$/.test(totp_code)) {
      alert('2FA Code must consist of exactly 6 digits!');
      return;
    }

    try {
      await handleDisable2Fa({ totp_code });
      showAccountPage();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Disabling 2Fa failed');
    }
  });
}

const setupAccountUpdateFormValidation = () => {
  const form = document.getElementById('account-form') as HTMLFormElement;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = (document.getElementById('settings-email') as HTMLInputElement).value;
    const current_password = (document.getElementById('current-password') as HTMLInputElement).value;

    if (!email || !current_password) {
      return alert('Email and current password cannot be empty');
    }

    const new_password_field  = (document.getElementById('new-password') as HTMLInputElement);

    const new_password = new_password_field.value ? new_password_field.value : null;

    try {
      await handleUpdateAccount({email,current_password, new_password});
      alert('Successfully updated Account info');
      showAccountPage();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Updating Account failed');
    }
  });
}

const setupAccountDeleteFormValidation = () => {
  document.getElementById('delete-account-button-local')?.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('delete-confirm-password')?.classList.remove('hidden');
    showDeleteAccountPage();
  });

  document.getElementById('delete-account-button-remote')?.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('delete-confirm-password')?.classList.add('hidden');
    showDeleteAccountPage();
  });

  document.getElementById('delete-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const password_field = document.getElementById('delete-confirm-password') as HTMLInputElement;
    const password = password_field?.value ? password_field.value : null;

    try {
      await handleDeleteAccount({password});
      localStorage.removeItem('authToken');
      alert('Account successfully deleted');
      navigateTo('/');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Deleting Account failed');
    }
  });

  document.getElementById('back-to-account')?.addEventListener('click', (e) => {
    e.preventDefault();
    showAccountPage();
  });
}

// Sadece authToggle.ts'teki setupSignupValidation'ı güncelle:
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

    if (!validateNickname(nickname)) {
      alert('Nickname can only contain letters, numbers, underscores, dashes, and dots.');
      return;
    }

    if (!validatePassword(password)) {
      alert('Password must contain at least 8 characters and include at least one lower case and upper case letter and a digit.');
      return;
    }

    try {
      await handleSignup({ nickname, email, password });
      
      // ✅ SUCCESS MESAJI
      alert('🎉 Signup successful! You can now login with your email and password.');
      
      // ✅ FORMU TEMİZLE
      form.reset();
      
      // ✅ OPSİYONEL: Otomatik login formuna geç
      const switchToLogin = document.getElementById('switchToLogin');
      if (switchToLogin) {
        switchToLogin.click();
      }
      
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Signup failed');
    }
  });
};

const setupSetNicknameValidation = () => {
  const form = document.getElementById('nicknameForm') as HTMLFormElement;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const nickname = (document.getElementById('nickname-field') as HTMLInputElement).value;

    if (nickname.length < 3) {
      alert('Nickname should be at least 3 characters!');
      return;
    }

    try {
      await handleSetNickname({ nickname });
      navigateTo('/profile');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Setting nickname failed');
    }
  });
};

// Function to handle the toggle between login and signup forms
export function setupAuthToggle() {
  const loginForm = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');
  const switchToSignup = document.getElementById('switchToSignup');
  const switchToLogin = document.getElementById('switchToLogin');
  document.querySelector('.main-nav')?.classList.add('hidden');

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
  setupSetNicknameValidation();
  setup2FaLoginValidation();
  setupEnableTotpFormValidation();
  setupDisableTotpFormValidation();
  setupAccountUpdateFormValidation();
  setupAccountDeleteFormValidation();
}
