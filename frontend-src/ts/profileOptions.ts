// import { navigateTo } from './router.js';

// export class ProfileOptions {
//   private currentAvatar: string = 'default';

//   constructor() {
//     this.initEventListeners();
//   }

//   public init() {
//     this.loadAvatars();
//     this.loadProfileData();
//     this.loadFriends();
//     this.loadFriendRequests(); // Yeni

//   }

//   private initEventListeners() {
//     // Options butonu event listener
//     document.getElementById('options-btn')?.addEventListener('click', () => {
//       navigateTo('/options');
//     });

//     // Back to profile butonu
//     document.getElementById('back-to-profile')?.addEventListener('click', () => {
//       navigateTo('/profile');
//     });

//     // Form submit event
//     document.getElementById('profile-form')?.addEventListener('submit', (e) => {
//       e.preventDefault();
//       this.saveProfileChanges();
//     });
//   }

//   private async loadProfileData() {
//     try {
//       const token = localStorage.getItem('authToken');
//       if (!token) return;

//       const response = await fetch('/api/profile', {
//         headers: {
//           'Authorization': `Bearer ${token}`
//         }
//       });

//       if (response.ok) {
//         const data = await response.json();

//         // Form alanlarını doldur
//         (document.getElementById('options-nickname') as HTMLInputElement).value = data.nickname || '';
//         (document.getElementById('options-status') as HTMLSelectElement).value = data.status || 'online';

//         this.currentAvatar = data.avatar || 'default';
//         this.highlightSelectedAvatar();
//       }
//     } catch (error) {
//       console.error('Failed to load profile data:', error);
//     }
//   }

//   private async loadAvatars() {
//     try {
//       const response = await fetch('/api/profile/avatars');
//       if (response.ok) {
//         const data = await response.json();
//         this.renderAvatars(data.avatars);
//       }
//     } catch (error) {
//       console.error('Failed to load avatars:', error);
//     }
//   }

//   private renderAvatars(avatars: string[]) {
//     const grid = document.getElementById('avatar-grid');
//     if (!grid) return;

//     grid.innerHTML = avatars.map(avatar => `
//       <div class="avatar-item cursor-pointer p-2 rounded-lg border border-gray-700 hover:neon-border-blue transition-all duration-300 ${
//         avatar === this.currentAvatar ? 'neon-border-yellow' : ''
//       }" data-avatar="${avatar}">
//         <img src="../public/imgs/avatars/${avatar}.png" alt="${avatar}"
//              class="w-12 h-12 mx-auto object-cover rounded">
//         <p class="text-center text-xs text-gray-300 mt-1">${avatar}</p>
//       </div>
//     `).join('');

//     // Avatar seçim event listener'ları
//     document.querySelectorAll('.avatar-item').forEach(item => {
//       item.addEventListener('click', () => {
//         const avatar = item.getAttribute('data-avatar');
//         if (avatar) {
//           this.selectAvatar(avatar);
//         }
//       });
//     });
//   }

//   private selectAvatar(avatar: string) {
//     this.currentAvatar = avatar;
//     this.highlightSelectedAvatar();
//     this.updateAvatar(avatar);
//   }

//   private highlightSelectedAvatar() {
//     document.querySelectorAll('.avatar-item').forEach(item => {
//       const avatar = item.getAttribute('data-avatar');
//       if (avatar === this.currentAvatar) {
//         item.classList.add('neon-border-yellow');
//       } else {
//         item.classList.remove('neon-border-yellow');
//       }
//     });
//   }

//   private async updateAvatar(avatar: string) {
//     try {
//       const token = localStorage.getItem('authToken');
//       if (!token) return;

//       const response = await fetch('/api/profile', {
//         method: 'PUT',
//         headers: {
//           'Content-Type': 'application/json',
//           'Authorization': `Bearer ${token}`
//         },
//         body: JSON.stringify({ avatar })
//       });

//       if (!response.ok) {
//         throw new Error('Failed to update avatar');
//       }
//     } catch (error) {
//       console.error('Avatar update failed:', error);
//     }
//   }

//   private async saveProfileChanges() {
//     const nickname = (document.getElementById('options-nickname') as HTMLInputElement).value;
//     const status = (document.getElementById('options-status') as HTMLSelectElement).value;

//     try {
//         const token = localStorage.getItem('authToken');
//         if (!token) return;

//         const response = await fetch('/api/profile', {
//             method: 'PUT',
//             headers: {
//                 'Content-Type': 'application/json',
//                 'Authorization': `Bearer ${token}`
//             },
//             body: JSON.stringify({ nickname, status })
//         });

//         if (response.ok) {
//             console.log('Profile updated successfully!');
//             // navigateTo yerine direkt olarak sayfayı kapat
//             document.querySelector('.options-page')?.classList.add('hidden');
//             document.querySelector('.profile-page')?.classList.remove('hidden');
//         } else {
//             throw new Error('Failed to update profile');
//         }
//     } catch (error) {
//         console.error('Profile update failed:', error);
//         alert('Failed to update profile');
//     }
// }

//   private async loadFriends() {
//     try {
//       const token = localStorage.getItem('authToken');
//       if (!token) return;

//       const response = await fetch('/api/friends', {
//         headers: {
//           'Authorization': `Bearer ${token}`
//         }
//       });

//       if (response.ok) {
//         const data = await response.json();
//         this.renderFriends(data.friends);
//       }
//     } catch (error) {
//       console.error('Failed to load friends:', error);
//     }
//   }

//   private renderFriends(friends: any[]) {
//     const list = document.getElementById('friends-list');
//     if (!list) return;

//     if (friends.length === 0) {
//       list.innerHTML = '<p class="text-gray-400 text-center">No friends yet</p>';
//       return;
//     }

//     list.innerHTML = friends.map(friend => `
//       <div class="friend-item flex items-center justify-between p-3 bg-gray-800 rounded-lg">
//         <div class="flex items-center space-x-3">
//           <img src="/imgs/avatars/${friend.avatar || 'default'}.png" alt="${friend.nickname}"
//                class="w-8 h-8 rounded-full object-cover">
//           <div>
//             <span class="text-gray-300">${friend.nickname}</span>
//             <span class="text-xs block ${this.getStatusColor(friend.status)}">● ${friend.status}</span>
//           </div>
//         </div>
//         <button class="text-red-400 hover:text-red-300 transition-colors duration-300"
//                 onclick="ProfileOptions.removeFriend(${friend.id})">
//           <i class="fas fa-times"></i>
//         </button>
//       </div>
//     `).join('');
//   }

//   private getStatusColor(status: string): string {
//     switch (status) {
//       case 'online': return 'text-green-400';
//       case 'away': return 'text-yellow-400';
//       case 'busy': return 'text-red-400';
//       case 'invisible': return 'text-gray-400';
//       default: return 'text-gray-400';
//     }
//   }

//   public static async removeFriend(friendId: number) {
//     if (!confirm('Are you sure you want to remove this friend?')) {
//       return;
//     }

//     try {
//       const token = localStorage.getItem('authToken');
//       if (!token) return;

//       const response = await fetch(`/api/friends/${friendId}`, {
//         method: 'DELETE',
//         headers: {
//           'Authorization': `Bearer ${token}`
//         }
//       });

//       if (response.ok) {
//         alert('Friend removed successfully');
//         // Sayfayı yenile
//         window.location.reload();
//       } else {
//         throw new Error('Failed to remove friend');
//       }
//     } catch (error) {
//       console.error('Failed to remove friend:', error);
//       alert('Failed to remove friend');
//     }
//   }
//   private async loadFriendRequests() {
//     try {
//         const token = localStorage.getItem('authToken');
//         const response = await fetch('/api/friends/requests', {
//             headers: { 'Authorization': `Bearer ${token}` }
//         });

//         if (response.ok) {
//             const data = await response.json();
//             this.renderFriendRequests(data.requests);
//         }
//     } catch (error) {
//         console.error('Failed to load friend requests:', error);
//     }
// }

// private renderFriendRequests(requests: any[]) {
//     const container = document.getElementById('friend-requests-container');
//     if (!container) return;

//     container.innerHTML = requests.map(request => `
//         <div class="friend-request flex items-center justify-between p-3 bg-gray-800 rounded-lg mb-2">
//             <div class="flex items-center space-x-3">
//                 <img src="/imgs/avatars/${request.avatar || 'default'}.png"
//                      class="w-10 h-10 rounded-full">
//                 <span class="text-gray-300">${request.nickname}</span>
//             </div>
//             <div class="space-x-2">
//                 <button class="px-2 py-1 bg-green-600 rounded accept-request"
//                         data-request-id="${request.friendship_id}">✓</button>
//                 <button class="px-2 py-1 bg-red-600 rounded decline-request"
//                         data-request-id="${request.friendship_id}">✗</button>
//             </div>
//         </div>
//     `).join('');
// }
// }

// // Global erişim için
// declare global {
//   interface Window {
//     ProfileOptions: typeof ProfileOptions;
//   }
// }

// window.ProfileOptions = ProfileOptions;

// profileOptions.ts - Friend request kabul/red sistemi ile güncellenmiş

import { navigateTo, profilePage, showPage } from './router.js';

export class ProfileOptions {
  private currentAvatar: string = 'default';

  constructor() {
    this.initEventListeners();
  }

  public init() {
    this.loadAvatars();
    this.loadProfileData();
    this.loadFriends();
    this.loadFriendRequests(); // Yeni eklendi
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

        // Form alanlarını doldur
        (document.getElementById('options-nickname') as HTMLInputElement).value =
          data.nickname || '';
        (document.getElementById('options-status') as HTMLSelectElement).value =
          data.status || 'online';

        this.currentAvatar = data.avatar || 'default';
        this.highlightSelectedAvatar();
      }
    } catch (error) {
      console.error('Failed to load profile data:', error);
    }
  }

  private async loadAvatars() {
    try {
      const response = await fetch('/api/profile/avatars');
      if (response.ok) {
        const data = await response.json();
        this.renderAvatars(data.avatars);
      }
    } catch (error) {
      console.error('Failed to load avatars:', error);
    }
  }

  private renderAvatars(avatars: string[]) {
    const grid = document.getElementById('avatar-grid');
    if (!grid) return;

    grid.innerHTML = avatars
      .map(
        (avatar) => `
      <div class="avatar-item cursor-pointer p-2 rounded-lg border border-gray-700 hover:neon-border-blue transition-all duration-300 ${
        avatar === this.currentAvatar ? 'neon-border-yellow' : ''
      }" data-avatar="${avatar}">
        <img src="/imgs/avatars/${avatar}.png" alt="${avatar}" 
             class="w-12 h-12 mx-auto object-cover rounded"
             onerror="this.src='/imgs/avatars/default.png'">
        <p class="text-center text-xs text-gray-300 mt-1">${avatar}</p>
      </div>
    `
      )
      .join('');

    // Avatar seçim event listener'ları
    document.querySelectorAll('.avatar-item').forEach((item) => {
      item.addEventListener('click', () => {
        const avatar = item.getAttribute('data-avatar');
        if (avatar) {
          this.selectAvatar(avatar);
        }
      });
    });
  }

  private selectAvatar(avatar: string) {
    this.currentAvatar = avatar;
    this.highlightSelectedAvatar();
    this.updateAvatar(avatar);
  }

  private highlightSelectedAvatar() {
    document.querySelectorAll('.avatar-item').forEach((item) => {
      const avatar = item.getAttribute('data-avatar');
      if (avatar === this.currentAvatar) {
        item.classList.add('neon-border-yellow');
      } else {
        item.classList.remove('neon-border-yellow');
      }
    });
  }

  private async updateAvatar(avatar: string) {
    try {
      const token = localStorage.getItem('authToken');
      if (!token) return;

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
        // document.querySelector('.options-page')?.classList.add('hidden');
        // document.querySelector('.profile-page')?.classList.remove('hidden');
		showPage(profilePage);
      } else {
        throw new Error('Failed to update profile');
      }
    } catch (error) {
      console.error('Profile update failed:', error);
      alert('Failed to update profile');
    }
  }

  private async loadFriends() {
    try {
      const token = localStorage.getItem('authToken');
      if (!token) return;

      const response = await fetch('/api/friends', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        this.renderFriends(data.friends);
      }
    } catch (error) {
      console.error('Failed to load friends:', error);
    }
  }

  private renderFriends(friends: any[]) {
    const list = document.getElementById('friends-list');
    if (!list) return;

    if (friends.length === 0) {
      list.innerHTML = '<p class="text-gray-400 text-center">No friends yet</p>';
      return;
    }

    list.innerHTML = friends
      .map(
        (friend) => `
      <div class="friend-item flex items-center justify-between p-3 bg-gray-800 rounded-lg">
        <div class="flex items-center space-x-3">
          <img src="/imgs/avatars/${friend.avatar || 'default'}.png" alt="${friend.nickname}" 
               class="w-8 h-8 rounded-full object-cover"
               onerror="this.src='/imgs/avatars/default.png'">
          <div>
            <span class="text-gray-300">${friend.nickname}</span>
            <span class="text-xs block ${this.getStatusColor(friend.status)}">● ${friend.status}</span>
          </div>
        </div>
        <button class="text-red-400 hover:text-red-300 transition-colors duration-300 remove-friend-btn" 
                data-friend-id="${friend.id}">
          <i class="fas fa-times"></i>
        </button>
      </div>
    `
      )
      .join('');

    // Remove friend event listeners
    document.querySelectorAll('.remove-friend-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const friendId = (e.target as HTMLElement).getAttribute('data-friend-id');
        if (friendId) {
          await ProfileOptions.removeFriend(parseInt(friendId));
          this.loadFriends(); // Listeyi yenile
        }
      });
    });
  }

  // YENİ: Friend request'leri yükleme
  // private async loadFriendRequests() {
  //   try {
  //       const token = localStorage.getItem('authToken');
  //       if (!token) {
  //           console.error('No auth token for friend requests');
  //           return;
  //       }

  //       console.log('Loading friend requests...');

  //       // Birden fazla endpoint'i deneyelim
  //       const endpoints = [
  //           '/api/friends/requests',
  //           '/api/friends/pending',
  //           '/api/friend-requests',
  //           '/api/friendships/requests'
  //       ];

  //       let requestsData = null;

  //       for (const endpoint of endpoints) {
  //           try {
  //               console.log(`Trying endpoint: ${endpoint}`);

  //               const response = await fetch(endpoint, {
  //                   headers: {
  //                       'Authorization': `Bearer ${token}`,
  //                       'Content-Type': 'application/json'
  //                   }
  //               });

  //               console.log(`${endpoint} response status:`, response.status);

  //               if (response.ok) {
  //                   const data = await response.json();
  //                   console.log(`${endpoint} response data:`, data);
  //                   requestsData = data;
  //                   break;
  //               } else {
  //                   const errorText = await response.text();
  //                   console.log(`${endpoint} error:`, errorText);
  //               }
  //           } catch (endpointError) {
  //               console.log(`${endpoint} network error:`, endpointError);
  //               continue;
  //           }
  //       }

  //       if (requestsData) {
  //           // Farklı response formatlarını handle edelim
  //           let requests = [];
  //           if (requestsData.requests) {
  //               requests = requestsData.requests;
  //           } else if (requestsData.data) {
  //               requests = requestsData.data;
  //           } else if (Array.isArray(requestsData)) {
  //               requests = requestsData;
  //           }

  //           console.log('Processing friend requests:', requests);
  //           this.renderFriendRequests(requests);
  //       } else {
  //           console.log('No friend requests endpoint worked, showing empty state');
  //           this.renderFriendRequests([]);
  //       }

  //   } catch (error) {
  //       console.error('Failed to load friend requests:', error);
  //       this.renderFriendRequests([]);
  //   }
  // }
  private async loadFriendRequests() {
    try {
      const token = localStorage.getItem('authToken');
      if (!token) {
        console.error('No auth token for friend requests');
        return;
      }

      console.log('Loading friend requests from /api/friends/requests');

      const response = await fetch('/api/friends/requests', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      console.log('Friend requests response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('Friend requests data:', data);
        this.renderFriendRequests(data.requests || data);
      } else {
        console.log('Friend requests endpoint failed');
        this.renderFriendRequests([]);
      }
    } catch (error) {
      console.error('Failed to load friend requests:', error);
      this.renderFriendRequests([]);
    }
  }

  // YENİ: Friend request'leri render etme
  private renderFriendRequests(requests: any[]) {
    const container = document.getElementById('friend-requests-container');
    if (!container) {
      console.error('friend-requests-container element not found');
      return;
    }

    console.log('Rendering friend requests:', requests);

    if (!requests || requests.length === 0) {
      container.innerHTML =
        '<p class="text-gray-400 text-center py-4">No pending friend requests</p>';
      return;
    }

    container.innerHTML = requests
      .map((request, index) => {
        console.log(`Processing request ${index}:`, request);

        // Farklı field name'leri handle edelim
        const friendshipId = request.friendship_id || request.id || request.request_id;
        const nickname = request.nickname || request.sender_nickname || request.user_nickname;
        const avatar = request.avatar || request.sender_avatar || 'default';

        if (!friendshipId || !nickname) {
          console.warn('Missing required fields in request:', request);
          return '';
        }

        return `
            <div class="friend-request flex items-center justify-between p-3 bg-gray-800 rounded-lg mb-2 border border-gray-700">
                <div class="flex items-center space-x-3">
                    <img src="/imgs/avatars/${avatar}.png" 
                         class="w-10 h-10 rounded-full border-2 border-gray-600"
                         onerror="this.src='/imgs/avatars/default.png'"
                         alt="${nickname}">
                    <div>
                        <span class="text-gray-300 font-medium">${nickname}</span>
                        <p class="text-xs text-gray-500">wants to be your friend</p>
                    </div>
                </div>
                <div class="flex space-x-2">
                    <button class="px-3 py-1 bg-green-600 rounded hover:bg-green-700 transition-colors accept-request text-white text-sm font-medium" 
                            data-request-id="${friendshipId}"
                            title="Accept friend request">
                        Accept
                    </button>
                    <button class="px-3 py-1 bg-red-600 rounded hover:bg-red-700 transition-colors decline-request text-white text-sm font-medium"
                            data-request-id="${friendshipId}"
                            title="Decline friend request">
                        Decline
                    </button>
                </div>
            </div>
        `;
      })
      .filter((html) => html !== '')
      .join('');

    // Event listener'ları ekle
    this.addFriendRequestEventListeners();
  }

  // YENİ: Friend request event listener'ları
  private addFriendRequestEventListeners() {
    console.log('Adding friend request event listeners');

    // Accept butonları
    document.querySelectorAll('.accept-request').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        console.log('Accept button clicked');
        e.preventDefault();

        const button = e.target as HTMLElement;
        const requestId = button.getAttribute('data-request-id');

        if (!requestId) {
          console.error('No request ID found');
          return;
        }

        console.log('Accepting friend request:', requestId);

        // Button'u disable et
        button.textContent = 'Accepting...';
        button.setAttribute('disabled', 'true');

        const success = await this.respondToFriendRequest(parseInt(requestId), 'accept');
        if (success) {
          console.log('Friend request accepted successfully');
          this.loadFriendRequests(); // Request listesini yenile
          this.loadFriends(); // Friends listesini yenile
        } else {
          // Hata durumunda button'u eski haline çevir
          button.textContent = 'Accept';
          button.removeAttribute('disabled');
        }
      });
    });

    // Decline butonları
    document.querySelectorAll('.decline-request').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        console.log('Decline button clicked');
        e.preventDefault();

        const button = e.target as HTMLElement;
        const requestId = button.getAttribute('data-request-id');

        if (!requestId) {
          console.error('No request ID found');
          return;
        }

        console.log('Declining friend request:', requestId);

        // Button'u disable et
        button.textContent = 'Declining...';
        button.setAttribute('disabled', 'true');

        const success = await this.respondToFriendRequest(parseInt(requestId), 'decline');
        if (success) {
          console.log('Friend request declined successfully');
          this.loadFriendRequests(); // Request listesini yenile
        } else {
          // Hata durumunda button'u eski haline çevir
          button.textContent = 'Decline';
          button.removeAttribute('disabled');
        }
      });
    });
  }

  // YENİ: Friend request'e cevap verme
  private async respondToFriendRequest(
    requestId: number,
    action: 'accept' | 'decline'
  ): Promise<boolean> {
    try {
      const token = localStorage.getItem('authToken');
      if (!token) {
        console.error('No auth token for friend request response');
        alert('Please login again');
        return false;
      }

      console.log(`${action}ing friend request ${requestId}`);
      console.log('Auth token:', token); // Debug için

      const endpoint = `/api/friends/request/${requestId}/${action}`;
      console.log(`Trying ${action} endpoint: ${endpoint}`);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          // Content-Type header'ını SİLİN veya eklemeyin
        },
      });

      console.log(`${endpoint} response status:`, response.status);
      console.log(`${endpoint} response headers:`, response.headers);

      if (response.ok) {
        console.log(`Friend request ${action}ed successfully`);
        return true;
      } else {
        const errorText = await response.text();
        console.log(`${endpoint} error:`, errorText);

        // Token expired veya invalid ise
        if (response.status === 401) {
          localStorage.removeItem('authToken');
          alert('Session expired. Please login again.');
          window.location.reload();
        }

        return false;
      }
    } catch (error) {
      console.error(`Error ${action}ing friend request:`, error);
      return false;
    }
  }

  private getStatusColor(status: string): string {
    switch (status) {
      case 'online':
        return 'text-green-400';
      case 'away':
        return 'text-yellow-400';
      case 'busy':
        return 'text-red-400';
      case 'invisible':
        return 'text-gray-400';
      default:
        return 'text-gray-400';
    }
  }

  public static async removeFriend(friendId: number) {
    if (!confirm('Are you sure you want to remove this friend?')) {
      return;
    }

    try {
      const token = localStorage.getItem('authToken');
      if (!token) return;

      const response = await fetch(`/api/friends/${friendId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        console.log('Friend removed successfully');
        return true;
      } else {
        throw new Error('Failed to remove friend');
      }
    } catch (error) {
      console.error('Failed to remove friend:', error);
      alert('Failed to remove friend');
      return false;
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
