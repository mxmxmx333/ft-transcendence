import { navigateTo } from './router.js';
import { SocketManager } from './socketManager.js';
import { ChatSocketManager } from './LiveChat/chatSocketManager.js';
import { initLiveChat } from './LiveChat/liveChat.js';

export async function handleSignup(formData: {
  nickname: string;
  email: string;
  password: string;
}) {
  try {
    const response = await fetch('/api/signup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(formData),
    });

    const responseClone = response.clone();

    if (!response.ok) {
      const errorData = await responseClone.json();
      throw new Error(errorData.error || 'Authentication failed');
    }

    const data = await responseClone.json();
    localStorage.setItem('authToken', data.token);
    initLiveChat(ChatSocketManager.getInstance());
    return data;
  } catch (error) {
    console.error('Signup error:', error);
    throw error;
  }
}

export async function handleLogin(formData: { email: string; password: string }) {
  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(formData),
    });

    if (!response.ok) {
      const errorData = await response.json();
      const errorMessage = errorData.message || errorData.error || 'Login failed';
      throw new Error(errorMessage);
    }

    const data = await response.json();

    if (!data.token) {
      throw new Error('Authentication token not received');
    }

    if (data.action_required === '2fa') {
      localStorage.setItem('preAuthToken', data.token);
      navigateTo('/2fa');
      return data;
    }

    localStorage.setItem('authToken', data.token);

    // Re-show the nav-bar (I know I shoud crate a function that adds and removes hidden from classlists later on.)
    document.querySelector('.main-nav')?.classList.remove('hidden');

    try {
      const socketManager = SocketManager.getInstance();
      await socketManager.ensureConnection();
      console.log('Socket connected after login');
    } catch (socketError) {
      console.error('Socket connection error after login:', socketError);
    }

    navigateTo('/profile');
    initLiveChat(ChatSocketManager.getInstance());
    return data;
  } catch (error) {
    console.error('Login error:', error);
    localStorage.removeItem('authToken');
    document.querySelector('.main-nav')?.classList.add('hidden');
    throw error;
  }
}

export async function handle2FaLogin(formData: {totp_code: string }) {
  try {
    const preAuthToken = localStorage.getItem('preAuthToken');

    if (!preAuthToken) {
      throw new Error('Missing preAuthToken');
    }

    const response = await fetch('/api/auth/2fa/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + preAuthToken,
      },
      body: JSON.stringify(formData),
    });

    if (!response.ok) {
      const errorData = await response.json();
      const errorMessage = errorData.message || errorData.error || '2fa verification failed';
      throw new Error(errorMessage);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error);
    }

    if (!data.token) {
      throw new Error('Authentication token not received');
    }

    localStorage.setItem('authToken', data.token);
    localStorage.removeItem('preAuthToken');

    navigateTo('/profile');
  } catch (error) {
    console.error('Handle2FaLogin error:', error);
    document.querySelector('.main-nav')?.classList.add('hidden');
    throw error;
  }
}

export async function handleEnable2Fa(formData: { totp_code: string}) {
  try {
    const authToken = localStorage.getItem('authToken');

    if (!authToken) {
      throw new Error('Missing authToken');
    }

    const response = await fetch('/api/auth/2fa/enable', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + authToken,
      },
      body: JSON.stringify(formData),
    });

    if (!response.ok) {
      const errorData = await response.json();
      const errorMessage = errorData.message || errorData.error || '2fa enable failed';
      throw new Error(errorMessage);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error);
    }

    navigateTo('/account');
  } catch (error) {
    console.error('HandleEnable2Fa error:', error);
    throw error;
  }
}

export async function handleDisable2Fa(formData: { totp_code: string}) {
  try {
    const authToken = localStorage.getItem('authToken');

    if (!authToken) {
      throw new Error('Missing authToken');
    }

    const response = await fetch('/api/auth/2fa/disable', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + authToken,
      },
      body: JSON.stringify(formData),
    });

    if (!response.ok) {
      const errorData = await response.json();
      const errorMessage = errorData.message || errorData.error || '2fa disable failed';
      throw new Error(errorMessage);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error);
    }

    navigateTo('/account');
  } catch (error) {
    console.error('HandleDisable2Fa error:', error);
    throw error;
  }
}

export async function handleUpdateAccount(formData: { email: string, current_password: string, new_password: string | null}) {
  try {
    const authToken = localStorage.getItem('authToken');

    if (!authToken) {
      throw new Error('Missing authToken');
    }

    const response = await fetch('/api/account/update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + authToken,
      },
      body: JSON.stringify(formData),
    });

    if (!response.ok) {
      const errorData = await response.json();
      const errorMessage = errorData.message || errorData.error || 'Updating account failed';
      throw new Error(errorMessage);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error);
    }
  } catch (error) {
    console.error('HandleUpdateAccount error:', error);
    throw error;
  }
}

export async function handleDeleteAccount(formData: { password: string | null}) {
  try {
    const authToken = localStorage.getItem('authToken');

    if (!authToken) {
      throw new Error('Missing authToken');
    }

    const response = await fetch('/api/account/delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + authToken,
      },
      body: JSON.stringify(formData),
    });

    if (!response.ok) {
      const errorData = await response.json();
      const errorMessage = errorData.message || errorData.error || 'Deleting account failed';
      throw new Error(errorMessage);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error);
    }
  } catch (error) {
    console.error('HandleDeleteAccount error:', error);
    throw error;
  }
}

export async function handleSetNickname(formData: { nickname: string }) {
  try {
    const preAuthToken = localStorage.getItem('preAuthToken');

    if (!preAuthToken) {
      throw new Error('Missing preAuthToken');
    }

    const response = await fetch('/api/profile/set-nickname', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + preAuthToken,
      },
      body: JSON.stringify(formData),
    });

    if (!response.ok) {
      const errorData = await response.json();
      const errorMessage = errorData.message || errorData.error || 'Setting nickname failed';
      throw new Error(errorMessage);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error);
    }

    if (!data.token) {
      throw new Error('Authentication token not received');
    }

    localStorage.setItem('authToken', data.token);
    localStorage.removeItem('preAuthToken');

    navigateTo('/profile');
  } catch (error) {
    console.error('SetNickname error:', error);
    document.querySelector('.main-nav')?.classList.add('hidden');
    throw error;
  }
}

export function isAuthenticated(): boolean {
  return !!localStorage.getItem('authToken');
}

export function isPreAuthenticated(): boolean {
  return !!localStorage.getItem('preAuthToken');
}

export function logout(): void {
  localStorage.removeItem('authToken');
  document.querySelector('.main-nav')?.classList.add('hidden');
}
