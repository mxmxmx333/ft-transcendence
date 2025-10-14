import { handleSignup, handleLogin, handleSetNickname, handle2FaLogin, handleDisable2Fa, handleEnable2Fa, handleUpdateAccount, handleDeleteAccount } from './auth.js';
import { navigateTo, showAccountPage, showDeleteAccountPage } from './router.js';

// For input security issues I'll use these as I got errors for now it's hashed.
const validateEmail = (email: string): { valid: boolean; error?: string } => {
  const trimmedEmail = email.trim();
  
  if (trimmedEmail.length > 254) {
    return { valid: false, error: 'Email is too long (max 254 characters)' };
  }
  
  const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,63}$/;
  if (!re.test(trimmedEmail)) {
    return { valid: false, error: 'Please enter a valid email address' };
  }
  
  return { valid: true };
};

const validateNickname = (nickname: string): { valid: boolean; error?: string } => {
  const trimmedNickname = nickname.trim();
  
  if (trimmedNickname.length < 3) {
    return { valid: false, error: 'Nickname must be at least 3 characters' };
  }
  
  if (trimmedNickname.length > 20) {
    return { valid: false, error: 'Nickname must be at most 20 characters' };
  }
  
  const re = /^[a-zA-Z0-9_\-.]+$/;
  if (!re.test(trimmedNickname)) {
    return { 
      valid: false, 
      error: 'Nickname can only contain letters, numbers, underscores, dashes, and dots' 
    };
  }
  
  return { valid: true };
};

const validatePassword = (password: string): { valid: boolean; error?: string } => {

  if (password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters' };
  }
  
  if (password.length > 128) {
    return { valid: false, error: 'Password is too long (max 128 characters)' };
  }
  
  const re = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{8,}$/;
  if (!re.test(password)) {
    return { 
      valid: false, 
      error: 'Password must contain at least one uppercase letter, one lowercase letter, and one digit' 
    };
  }
  
  return { valid: true };
};

const sanitizeInput = (input: string): string => {
  return input.trim().replace(/\s+/g, ' ');
};

const setupLoginValidation = () => {
  const form = document.getElementById('loginForm') as HTMLFormElement;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = (document.getElementById('login-email') as HTMLInputElement).value;
    const password = (document.getElementById('login-pw') as HTMLInputElement).value;

    const sEmail = sanitizeInput(email);
    const emailValidation = validateEmail(sEmail);
    if (!emailValidation.valid) {
      alert(emailValidation.error);
      return;
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      alert(passwordValidation.error);
      return;
    }

    try {
      await handleLogin({ email: sEmail, password });
      form.reset();
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
      form.reset();
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
      form.reset();
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
      form.reset();
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

    // Validate email
    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
      alert(emailValidation.error);
      return;
    }

    // Validate new password if provided
    if (new_password) {
      const passwordValidation = validatePassword(new_password);
      if (!passwordValidation.valid) {
        alert(passwordValidation.error);
        return;
      }
    }

    try {
      await handleUpdateAccount({email, current_password, new_password});
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

const setupSignupValidation = () => {
  const form = document.getElementById('signupForm') as HTMLFormElement;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const nickname = (document.getElementById('signup-nickname') as HTMLInputElement).value;
    const email = (document.getElementById('signup-email') as HTMLInputElement).value;
    const password = (document.getElementById('signup-pw') as HTMLInputElement).value;

    // Validate nickname
    const nicknameValidation = validateNickname(nickname);
    if (!nicknameValidation.valid) {
      alert(nicknameValidation.error);
      return;
    }

    // Validate email
    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
      alert(emailValidation.error);
      return;
    }

    // Validate password
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      alert(passwordValidation.error);
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

    // Validate nickname
    const nicknameValidation = validateNickname(nickname);
    if (!nicknameValidation.valid) {
      alert(nicknameValidation.error);
      return;
    }

    try {
      await handleSetNickname({ nickname });
      const socketManager = SocketManager.getInstance();
      await socketManager.ensureConnection();
      initLiveChat(ChatSocketManager.getInstance());
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