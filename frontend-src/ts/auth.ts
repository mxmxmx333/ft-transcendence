import { navigateTo } from "./router.js";

export async function handleSignup(formData: {
  nickname: string;
  email: string;
  password: string;
}) {
  try {
    const response = await fetch('http://localhost:3000/api/signup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(formData),
    });

    // Response'u bir değişkene atayarak tekrar kullanabiliriz
    const responseClone = response.clone(); // Response'u klonla
    
    if (!response.ok) {
      const errorData = await responseClone.json(); // Klon üzerinden oku
      throw new Error(errorData.error || 'Kayıt işlemi başarısız');
    }

    const data = await responseClone.json(); // Aynı klondan oku
    localStorage.setItem('authToken', data.token);
    return data;
  } catch (error) {
    console.error('Signup error:', error);
    throw error;
  }
}

export async function handleLogin(formData: {
  email: string;
  password: string;
}) {
  try {
    const response = await fetch('http://localhost:3000/api/login', {
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

    localStorage.setItem('authToken', data.token);
    
    // Navbar'ı göster ve profile yönlendir
    document.querySelector('.main-nav')?.classList.remove('hidden');
    navigateTo('/profile');
    
    return data;
  } catch (error) {
    console.error('Login error:', error);
    localStorage.removeItem('authToken');
    document.querySelector('.main-nav')?.classList.add('hidden');
    throw error;
  }
}

export function isAuthenticated(): boolean {
  return !!localStorage.getItem('authToken');
}

export function logout(): void {
  localStorage.removeItem('authToken');
}