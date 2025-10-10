import { navigateTo } from './router';

export class ProfileOptions {
  private currentAvatar: string = 'default';

  constructor() {
    this.initEventListeners();
  }

  public init() {
    this.loadAvatars();
    this.loadProfileData();
    // Friend related functions removed
  }

  private initEventListeners() {
    // Options butonu event listener
    document.getElementById('options-btn')?.addEventListener('click', () => {
      navigateTo('/options');
    });

    // Back to profile butonu
    document.getElementById('back-to-profile')?.addEventListener('click', () => {
      navigateTo('/profile');
    });

    // Form submit event
    document.getElementById('profile-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveProfileChanges();
    });
  }

  private async loadProfileData() {
    try {
      const token = localStorage.getItem('authToken');
      if (!token) return;

      const response = await fetch('/api/profile', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();

        console.log('📦 Backend data received, avatar:', data.avatar);

        // ✅ CRITICAL FIX: currentAvatar'ı backend'den gelen veriyle güncelle
        if (data.avatar) {
          this.currentAvatar = data.avatar;
          console.log('✅ currentAvatar updated to:', this.currentAvatar);
        }

        // Form alanlarını doldur
        (document.getElementById('options-nickname') as HTMLInputElement).value =
          data.nickname || '';
        (document.getElementById('options-status') as HTMLSelectElement).value =
          data.status || 'online';

        // Profil sayfasındaki bilgileri güncelle
        this.updateProfileDisplay(data);

        // ✅ Avatar grid'ini güncelle
        this.highlightSelectedAvatar();
      }
    } catch (error) {
      console.error('Failed to load profile data:', error);
    }
  }

  private updateOptionsPageAvatar(avatar: string) {
    const optionsAvatar = document.querySelector(
      '.options-page .avatar-item.neon-border-yellow img'
    ) as HTMLImageElement;
    if (optionsAvatar) {
      optionsAvatar.src = `/imgs/avatars/${avatar}.png`;
      optionsAvatar.onerror = () => {
        optionsAvatar.src = '/imgs/avatars/default.png';
      };
    }
  }

  private updateProfileDisplay(profileData: any) {
    const avatarElement = document.getElementById('profile-avatar-img') as HTMLImageElement;
    if (avatarElement && profileData.avatar) {
      const avatarUrl = this.getAvatarUrl(profileData.avatar); // I assign it to a variable to get correct avatar ex. name it was hard coded before.
      avatarElement.src = avatarUrl;
      avatarElement.onerror = () => {
        avatarElement.src = '/imgs/avatars/default.png';
      };
    }

    // Diğer profil bilgileri...
    const nicknameElement = document.getElementById('profile-nickname');
    const emailElement = document.getElementById('profile-email');
    const statusElement = document.getElementById('profile-status');
    const gameStatsElement = document.getElementById('profile-gamestatistics');
    const friendsElement = document.getElementById('profile-friends');

    if (nicknameElement) nicknameElement.textContent = profileData.nickname || 'N/A';
    if (emailElement) emailElement.textContent = profileData.email || 'N/A';
    if (statusElement) statusElement.textContent = profileData.status || 'online';

    if (gameStatsElement) {
      gameStatsElement.textContent = profileData.gameStatistics
        ? `Played: ${profileData.gameStatistics.games_played || 0}, Won: ${profileData.gameStatistics.games_won || 0}`
        : 'No games played';
    }

    if (friendsElement) {
      friendsElement.textContent =
        profileData.friendsCount !== undefined ? profileData.friendsCount.toString() : '0';
    }
  }

  private async loadAvatars() {
    try {
      console.log('🔄 Loading avatars...');
      const token = localStorage.getItem('authToken');

      const response = await fetch('/api/profile/avatars', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        console.log('📦 Avatars received:', data.avatars);
        console.log('🎯 Rendering with currentAvatar:', this.currentAvatar);
        this.renderAvatars(data.avatars);
      }
    } catch (error) {
      console.error('Failed to load avatars:', error);
    }
  }

  private getAvatarUrl(avatar: string): string {
    console.log('🔗 getAvatarUrl called with:', avatar);

    let url: string;

    if (!avatar || avatar === 'default' || avatar === 'default1') {
      url = `/imgs/avatars/${avatar || 'default'}.png`;
    } else if (avatar.startsWith('custom_')) {
      const hasExtension = /\.(jpg|png|gif|webp)$/i.test(avatar);
      url = hasExtension ? `/uploads/avatars/${avatar}` : `/uploads/avatars/${avatar}.jpg`;
    } else {
      url = `/imgs/avatars/${avatar}.png`;
    }

    // ✅ Cache busting için timestamp ekle
    const timestamp = new Date().getTime();
    return `${url}?t=${timestamp}`;
  }
  private renderAvatars(avatars: string[]) {
    const grid = document.getElementById('avatar-grid');
    if (!grid) return;

    console.log('🎨 Rendering avatars. Current:', this.currentAvatar);

    grid.innerHTML = avatars
      .map((avatar) => {
        if (avatar === 'upload') {
          return `
            <div class="avatar-item cursor-pointer p-2 rounded-lg border-2 border-gray-700 transition-all duration-300" 
                 data-avatar="upload">
              <div class="w-12 h-12 mx-auto bg-gray-800 rounded flex items-center justify-center border-2 border-dashed border-green-400">
                <i class="fas fa-upload text-green-400 text-lg"></i>
              </div>
              <p class="text-center text-xs text-gray-300 mt-1">Upload</p>
            </div>
          `;
        }

        const isCustomAvatar = avatar.startsWith('custom_');
        const avatarSrc = this.getAvatarUrl(avatar); // ✅ getAvatarUrl kullan
        const isSelected = avatar === this.currentAvatar;

        console.log('🖼️ Rendering avatar:', avatar, 'URL:', avatarSrc, 'Selected:', isSelected);

        return `
          <div class="avatar-item cursor-pointer p-2 rounded-lg border-2 transition-all duration-300 ${
            isSelected ? 'border-yellow-400 shadow-lg shadow-yellow-400/50' : 'border-gray-700'
          }" data-avatar="${avatar}">
            <div class="relative">
              <img src="${avatarSrc}" alt="${avatar}" 
                   class="w-12 h-12 mx-auto object-cover rounded"
                   onerror="console.error('Failed to load:', this.src); this.src='/imgs/avatars/default.png'">
              ${
                isCustomAvatar
                  ? `
                <button class="delete-custom-avatar absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center hover:bg-red-600"
                        data-avatar="${avatar}">
                  ×
                </button>
              `
                  : ''
              }
            </div>
            <p class="text-center text-xs text-gray-300 mt-1">${this.getAvatarDisplayName(avatar)}</p>
          </div>
        `;
      })
      .join('');

    this.addAvatarEventListeners();
  }

  // ✅ EVENT LISTENER METODU EKLE
  private addAvatarEventListeners() {
    document.querySelectorAll('.avatar-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;

        // Delete butonuna tıklandıysa
        if (target.classList.contains('delete-custom-avatar')) {
          e.stopPropagation();
          const avatar = target.getAttribute('data-avatar');
          if (avatar) {
            this.deleteCustomAvatar(avatar);
          }
          return;
        }

        const avatarItem = target.closest('.avatar-item') as HTMLElement;
        const avatar = avatarItem?.getAttribute('data-avatar');

        if (avatar === 'upload') {
          this.triggerFileUpload();
        } else if (avatar) {
          this.selectAvatar(avatar);
        }
      });
    });
  }

  private triggerFileUpload() {
    let fileInput = document.getElementById('avatar-file-input') as HTMLInputElement;

    if (!fileInput) {
      fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.id = 'avatar-file-input';
      fileInput.accept = 'image/jpeg,image/png,image/gif,image/webp';
      fileInput.style.display = 'none';
      document.body.appendChild(fileInput);

      fileInput.addEventListener('change', (e) => {
        this.handleFileUpload(e);
      });
    }

    fileInput.click();
  }

  private async handleFileUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];

    if (!this.validateFile(file)) {
      return;
    }

    try {
      const token = localStorage.getItem('authToken');
      if (!token) return;

      this.showUploadProgress();

      const formData = new FormData();
      formData.append('avatar', file);

      const response = await fetch('/api/profile/avatar/upload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (response.ok) {
        const result = await response.json();
        console.log('✅ Avatar uploaded successfully:', result);

        // ✅ CRITICAL FIX: Upload sonrası currentAvatar'ı güncelle
        if (result.avatar) {
          this.currentAvatar = result.avatar;
        }

        // ✅ Tüm verileri yenile
        await this.loadAvatars();
        await this.loadProfileData(); // Bu artık currentAvatar'ı da güncelleyecek

        this.hideUploadProgress();
        this.showNotification('Avatar uploaded successfully!', 'success');
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }
    } catch (error) {
      console.error('❌ Avatar upload failed:', error);
      this.hideUploadProgress();
      this.showNotification('Failed to upload avatar: ' + error, 'error');
    } finally {
      input.value = '';
    }
  }

  private async deleteCustomAvatar(avatarUrl: string) {
    if (!confirm('Are you sure you want to delete this custom avatar?')) {
      return;
    }

    try {
      const token = localStorage.getItem('authToken');
      if (!token) return;

      // ✅ Content-Type header'ını KALDIR veya body gönder
      const response = await fetch('/api/profile/avatar', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          // ❌ 'Content-Type': 'application/json', // BU SATIRI KALDIR
        },
        // ✅ VEYA boş body gönder
        // body: JSON.stringify({})
      });

      if (response.ok) {
        this.showNotification('Avatar deleted successfully!', 'success');
        await this.loadAvatars();
        await this.loadProfileData();
      } else {
        throw new Error('Failed to delete avatar');
      }
    } catch (error) {
      console.error('Avatar delete failed:', error);
      this.showNotification('Failed to delete avatar', 'error');
    }
  }
  private validateFile(file: File): boolean {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const maxSize = 5 * 1024 * 1024; // 5MB

    if (!allowedTypes.includes(file.type)) {
      this.showNotification('Please select a valid image file (JPEG, PNG, GIF, WebP)', 'error');
      return false;
    }

    if (file.size > maxSize) {
      this.showNotification('File size must be less than 5MB', 'error');
      return false;
    }

    return true;
  }

  private showUploadProgress() {
    // Basit progress göstergesi
    const progress = document.createElement('div');
    progress.id = 'upload-progress';
    progress.className = 'fixed top-4 right-4 bg-blue-600 text-white px-4 py-2 rounded-lg';
    progress.textContent = 'Uploading avatar...';
    document.body.appendChild(progress);
  }

  private hideUploadProgress() {
    const progress = document.getElementById('upload-progress');
    if (progress) {
      progress.remove();
    }
  }

  private showNotification(message: string, type: 'success' | 'error') {
    // Basit notification sistemi - daha iyi bir sistem için kütüphane kullanabilirsiniz
    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 px-4 py-2 rounded-lg ${
      type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
    }`;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.remove();
    }, 3000);
  }

  private getCustomAvatarUrl(avatarUrl: string): string {
    return `/uploads/avatars/${avatarUrl}`;
  }

  private getAvatarDisplayName(avatar: string): string {
    if (avatar === 'upload') return 'Upload';
    if (avatar.startsWith('custom_')) return 'Custom';
    return avatar.charAt(0).toUpperCase() + avatar.slice(1);
  }

  private async selectAvatar(avatar: string) {
    console.log('🎯 Selecting avatar:', avatar);

    this.currentAvatar = avatar;

    // ✅ Sadece görsel güncelleme yap
    this.highlightSelectedAvatar();

    // ✅ Backend'e gönder
    await this.updateAvatar(avatar);

    // ❌ loadAvatars() ÇAĞIRMA - sonsuz döngü yaratır!
    // await this.loadAvatars();

    console.log('✅ Avatar selection complete');
  }
  private highlightSelectedAvatar() {
    console.log('🎨 highlightSelectedAvatar - currentAvatar:', this.currentAvatar);

    document.querySelectorAll('.avatar-item').forEach((item) => {
      const avatar = item.getAttribute('data-avatar');
      const isSelected = avatar === this.currentAvatar;

      // ✅ Data attribute'u güncelle
      item.setAttribute('data-selected', isSelected.toString());

      // ✅ CSS class'larını güncelle
      if (isSelected) {
        item.classList.add('border-yellow-400', 'shadow-lg', 'shadow-yellow-400/50');
        item.classList.remove('border-gray-700');
      } else {
        item.classList.remove('border-yellow-400', 'shadow-lg', 'shadow-yellow-400/50');
        item.classList.add('border-gray-700');
      }
    });
  }

  private async updateAvatar(avatar: string) {
    try {
      const token = localStorage.getItem('authToken');
      if (!token) return;

      console.log('📡 Sending avatar update to backend:', avatar);

      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ avatar }),
      });

      if (!response.ok) {
        throw new Error('Failed to update avatar');
      }

      console.log('✅ Backend avatar update successful');
    } catch (error) {
      console.error('Avatar update failed:', error);
    }
  }

  private async saveProfileChanges() {
    const nickname = (document.getElementById('options-nickname') as HTMLInputElement).value;
    const status = (document.getElementById('options-status') as HTMLSelectElement).value;

    try {
      const token = localStorage.getItem('authToken');
      if (!token) return;

      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ nickname, status }),
      });

      if (response.ok) {
        console.log('Profile updated successfully!');

        // ✅ currentAvatar ile profil görselini güncelle
        this.updateProfileDisplay({
          nickname: nickname,
          status: status,
          avatar: this.currentAvatar, // ✅ EN ÖNEMLİ SATIR
          email: 'user@example.com', // Mevcut email veya boş bırakın
          gameStatistics: { games_played: 0, games_won: 0 },
          friendsCount: 0,
        });

        // ✅ Profil sayfasına dön
        document.querySelector('.options-page')?.classList.add('hidden');
        document.querySelector('.profile-page')?.classList.remove('hidden');

        console.log('✅ Profile page updated with avatar:', this.currentAvatar);
      }
    } catch (error) {
      console.error('Profile update failed:', error);
    }
  }
}

// Global erişim için
declare global {
  interface Window {
    ProfileOptions: typeof ProfileOptions;
  }
}

window.ProfileOptions = ProfileOptions;
