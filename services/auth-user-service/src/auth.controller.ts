import { FastifyRequest, FastifyReply } from 'fastify';
import AuthService from './auth.service';

interface SignupBody {
  nickname: string;
  email: string;
  password: string;
}

interface LoginBody {
  email: string;
  password: string;
}

interface UpdateProfileBody {
  nickname?: string;
  avatar?: string;
  status?: string;
}

interface FriendRequestBody {
  targetUserId: number;
}

interface FriendResponseBody {
  friendshipId: number;
  response: 'accepted' | 'declined';
}

interface SearchUsersQuery {
  q: string;
}

export default class AuthController {
  private fastify: any;
  constructor(
    private authService: AuthService,
    fastifyInstance: any
  ) { this.fastify = fastifyInstance;}

  // ======= EXISTING AUTH METHODS =======
  async signup(request: FastifyRequest<{ Body: SignupBody }>, reply: FastifyReply) {
    const { nickname, email, password } = request.body;

    try {
      // Validations
      if (!nickname || !email || !password) {
        return reply.status(400).send({
          error: 'Tüm alanlar zorunludur',
          details: ['nickname', 'email', 'password'],
        });
      }
      const existingUser = await this.authService.getUserByEmail(email);
      if (existingUser) {
        return reply.status(409).send({
          error: 'Bu email zaten kayıtlı',
          email: email,
        });
      }

      // Hashing the pw
      const hashedPassword = await this.fastify.bcrypt.hash(password, 10);

      // We need to expend user's variables.
      const user = await this.authService.createUser({
        nickname,
        email,
        password_hash: hashedPassword,
        avatar: 'default',
        status: 'online'
      });

      // jwt for each
      const token = this.fastify.jwt.sign({
        nickname: user.nickname,
        id: user.id,
        email: user.email,
      });

      // status codes have to be correct :/
      return reply.status(201).send({
        success: true,
        token,
        user: {
          id: user.id,
          nickname: user.nickname,
          email: user.email,
          avatar: user.avatar,
          status: user.status,
        },
      });
    } catch (error) {
      console.error('Signup error:', error);
      return reply.status(500).send({
        error: 'Network error',
        details: error,
      });
    }
  }

  async login(
    request: FastifyRequest<{ Body: { email: string; password: string } }>,
    reply: FastifyReply
  ) {
    const { email, password } = request.body;

    try {
      const user = await this.authService.getUserByEmail(email);
      if (!user) {
        return reply.status(401).send({
          error: 'Invalid credentials',
          message: 'Email or password is incorrect',
        });
      }

      const validPassword = await this.fastify.bcrypt.compare(password, user.password_hash);
      if (!validPassword) {
        return reply.status(401).send({
          error: 'Invalid credentials',
          message: 'Email or password is incorrect',
        });
      }

      // Update user status to online
      this.authService.updateUserStatus(user.id!, 'online');

      const token = this.fastify.jwt.sign({
        nickname: user.nickname,
        id: user.id,
        email: user.email,
      });

      return reply.send({
        success: true,
        token,
        user: {
          id: user.id,
          nickname: user.nickname,
          email: user.email,
          avatar: user.avatar,
          status: 'online',
        },
      });
    } catch (error) {
      this.fastify.log.error(error);
      return reply.status(500).send({
        error: 'Internal server error',
        details: error,
      });
    }
  }

  // ======= NEW PROFILE METHODS =======
  async getProfile(request: FastifyRequest, reply: FastifyReply) {
    try {
      const decoded = await request.jwtVerify<{ id: number }>();
      const user = await this.authService.getUserById(decoded.id);
      
      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }

      const gameStats = await this.authService.getUserGameStats(decoded.id);
      const friendsCount = await this.authService.getFriends(decoded.id).length;

      return reply.send({
        id: user.id,
        nickname: user.nickname,
        email: user.email,
        avatar: user.avatar,
        status: user.status,
        gameStatistics: gameStats,
        friendsCount: friendsCount,
      });
    } catch (err) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
  }

  // === NEW METHODS PLS DONT DELETE THERE ARE STILL BUGS
async getUserById(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const decoded = await request.jwtVerify<{ id: number }>();
    const userId = parseInt(request.params.id);

    if (isNaN(userId)) {
      return reply.status(400).send({ error: 'Invalid user ID' });
    }

    const userProfile = this.authService.getUserProfile(userId, decoded.id);
    
    if (!userProfile) {
      return reply.status(404).send({ error: 'User not found' });
    }

    return reply.send(userProfile);
  } catch (error) {
    console.error('Error getting user profile:', error);
    return reply.status(500).send({ error: 'Internal server error' });
  }
}
async getUserByIdAlt(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const decoded = await request.jwtVerify<{ id: number }>();
    const userId = parseInt(request.params.id);

    if (isNaN(userId)) {
      return reply.status(400).send({ error: 'Invalid user ID' });
    }

    const userProfile = this.authService.getUserProfile(userId, decoded.id);
    
    if (!userProfile) {
      return reply.status(404).send({ error: 'User not found' });
    }

    return reply.send(userProfile);
  } catch (error) {
    console.error('Error getting user profile:', error);
    return reply.status(500).send({ error: 'Internal server error' });
  }
}
async getFriendRequests(request: FastifyRequest, reply: FastifyReply) {
  try {
    const decoded = await request.jwtVerify<{ id: number }>();
    const requests = this.authService.getFriendRequests(decoded.id);
    
    return reply.send({ requests });
  } catch (error) {
    console.error('Error getting friend requests:', error);
    return reply.status(500).send({ error: 'Internal server error' });
  }
}

// Friend request'e cevap verme
// async respondToFriendRequestById(request: FastifyRequest<{ Params: { id: string }, Body: { action: 'accept' | 'decline' } }>, reply: FastifyReply) {
//   try {
//     const decoded = await request.jwtVerify<{ id: number }>();
//     const friendshipId = parseInt(request.params.id);
//     const { action } = request.body;

//     if (isNaN(friendshipId) || !['accept', 'decline'].includes(action)) {
//       return reply.status(400).send({ error: 'Invalid request parameters' });
//     }

//     // Önce friend request'in bu kullanıcıya ait olduğunu kontrol et
//     const requests = this.authService.getFriendRequests(decoded.id);
//     const targetRequest = requests.find((req: any) => req.friendship_id === friendshipId);
    
//     if (!targetRequest) {
//       return reply.status(404).send({ error: 'Friend request not found' });
//     }

//     const responseType = action === 'accept' ? 'accepted' : 'declined';
//     const success = this.authService.respondToFriendRequest(friendshipId, responseType);
    
//     if (!success) {
//       return reply.status(400).send({ error: 'Failed to respond to friend request' });
//     }

//     return reply.send({ 
//       success: true, 
//       message: `Friend request ${action}ed` 
//     });
//   } catch (error) {
//     console.error('Error responding to friend request:', error);
//     return reply.status(500).send({ error: 'Failed to respond to friend request' });
//   }
// }

async respondToFriendRequestById(request: FastifyRequest<{ Params: { id: string }, Body: { action: 'accept' | 'decline' } }>, reply: FastifyReply) {
  try {
    console.log('Request headers:', request.headers); // Debug için
    
    // DÜZELTME: request.headers kontrolü
    const authHeader = request.headers?.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('No valid authorization header found');
      return reply.status(401).send({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    let decoded: any;
    
    try {
      decoded = this.fastify.jwt.verify(token);
    } catch (jwtError) {
      console.error('JWT verification error:', jwtError);
      return reply.status(401).send({ error: 'Invalid token' });
    }

    const userId = decoded.id;
    console.log('Decoded user ID:', userId);

    const friendshipId = parseInt(request.params.id);
    
    // DÜZELTME: Body'den action'ı almak yerine URL parametresinden al
    let action: 'accept' | 'decline';
    
    // URL'den action'ı al (örneğin: /api/friends/request/1/accept)
    const urlPath = request.url;
    if (urlPath.includes('/accept')) {
      action = 'accept';
    } else if (urlPath.includes('/decline')) {
      action = 'decline';
    } else {
      // Veya body'den al (eğer gönderilmişse)
      action = request.body?.action;
    }

    console.log('Friendship ID:', friendshipId, 'Action:', action);

    if (isNaN(friendshipId) || !['accept', 'decline'].includes(action)) {
      return reply.status(400).send({ error: 'Invalid request parameters' });
    }

    // Önce friend request'in bu kullanıcıya ait olduğunu kontrol et
    const requests = this.authService.getFriendRequests(userId);
    console.log('Friend requests for user:', requests);
    
    const targetRequest = requests.find((req: any) => req.friendship_id === friendshipId);
    
    if (!targetRequest) {
      return reply.status(404).send({ error: 'Friend request not found' });
    }

    const responseType = action === 'accept' ? 'accepted' : 'declined';
    console.log('Response type:', responseType);
    
    const success = this.authService.respondToFriendRequest(friendshipId, responseType);
    
    if (!success) {
      return reply.status(400).send({ error: 'Failed to respond to friend request' });
    }

    return reply.send({ 
      success: true, 
      message: `Friend request ${action}ed` 
    });
  } catch (error) {
    console.error('Error responding to friend request:', error);
    return reply.status(500).send({ error: 'Failed to respond to friend request' });
  }
}
// ============================================

  async updateProfile(request: FastifyRequest<{ Body: UpdateProfileBody }>, reply: FastifyReply) {
    try {
      const decoded = await request.jwtVerify<{ id: number }>();
      const { nickname, avatar, status } = request.body;
      let updated = false;

      if (nickname) {
        try {
          const success = await this.authService.updateUserNickname(decoded.id, nickname);
          if (!success) {
            return reply.status(400).send({ error: 'Failed to update nickname' });
          }
          updated = true;
        } catch (error: any) {
          if (error.message === 'Nickname already exists') {
            return reply.status(409).send({ error: 'Nickname already exists' });
          }
          throw error;
        }
      }

      if (avatar) {
        const availableAvatars = this.authService.getAvailableAvatars();
        if (!availableAvatars.includes(avatar)) {
          return reply.status(400).send({ error: 'Invalid avatar selection' });
        }
        const success = await this.authService.updateUserAvatar(decoded.id, avatar);
        if (success) updated = true;
      }

      if (status) {
        const validStatuses = ['online', 'away', 'busy', 'invisible'];
        if (!validStatuses.includes(status)) {
          return reply.status(400).send({ error: 'Invalid status' });
        }
        const success = await this.authService.updateUserStatus(decoded.id, status);
        if (success) updated = true;
      }

      if (!updated) {
        return reply.status(400).send({ error: 'No valid updates provided' });
      }

      const updatedUser = await this.authService.getUserById(decoded.id);
      return reply.send({
        success: true,
        user: {
          id: updatedUser!.id,
          nickname: updatedUser!.nickname,
          email: updatedUser!.email,
          avatar: updatedUser!.avatar,
          status: updatedUser!.status,
        },
      });
    } catch (error) {
      this.fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  }

  async getAvailableAvatars(request: FastifyRequest, reply: FastifyReply) {
    try {
      const avatars = this.authService.getAvailableAvatars();
      return reply.send({ avatars });
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to get avatars' });
    }
  }

  // ======= FRIEND SYSTEM METHODS =======
  async searchUsers(request: FastifyRequest<{ Querystring: SearchUsersQuery }>, reply: FastifyReply) {
    try {
      const decoded = await request.jwtVerify<{ id: number }>();
      const { q } = request.query;

      if (!q || q.trim().length < 2) {
        return reply.status(400).send({ error: 'Search term must be at least 2 characters' });
      }

      const users = await this.authService.searchUsers(q.trim(), decoded.id);
      return reply.send({ users });
    } catch (error) {
      if (error  === 'Unauthorized') {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      return reply.status(500).send({ error: 'Search failed' });
    }
  }

  async sendFriendRequest(request: FastifyRequest<{ Body: FriendRequestBody }>, reply: FastifyReply) {
    try {
      const decoded = await request.jwtVerify<{ id: number }>();
      const { targetUserId } = request.body;

      if (!targetUserId || targetUserId === decoded.id) {
        return reply.status(400).send({ error: 'Invalid target user' });
      }

      const success = await this.authService.sendFriendRequest(decoded.id, targetUserId);
      if (!success) {
        return reply.status(400).send({ error: 'Failed to send friend request' });
      }

      return reply.send({ success: true, message: 'Friend request sent' });
    } catch (error: any) {
      if (error.message.includes('already exists')) {
        return reply.status(409).send({ error: 'Friend relationship already exists' });
      }
      return reply.status(500).send({ error: 'Failed to send friend request' });
    }
  }

  async respondToFriendRequest(request: FastifyRequest<{ Body: FriendResponseBody }>, reply: FastifyReply) {
    try {
      await request.jwtVerify<{ id: number }>();
      const { friendshipId, response } = request.body;

      if (!friendshipId || !['accepted', 'declined'].includes(response)) {
        return reply.status(400).send({ error: 'Invalid request parameters' });
      }

      const success = await this.authService.respondToFriendRequest(friendshipId, response);
      if (!success) {
        return reply.status(400).send({ error: 'Failed to respond to friend request' });
      }

      return reply.send({ 
        success: true, 
        message: `Friend request ${response}` 
      });
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to respond to friend request' });
    }
  }

  async getFriends(request: FastifyRequest, reply: FastifyReply) {
    try {
      const decoded = await request.jwtVerify<{ id: number }>();
      const friends = await this.authService.getFriends(decoded.id);
      return reply.send({ friends });
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to get friends' });
    }
  }

  // async getFriendRequests(request: FastifyRequest, reply: FastifyReply) {
  //   try {
  //     const decoded = await request.jwtVerify<{ id: number }>();
  //     const requests = await this.authService.getFriendRequests(decoded.id);
  //     return reply.send({ requests });
  //   } catch (error) {
  //     return reply.status(500).send({ error: 'Failed to get friend requests' });
  //   }
  // }

  async removeFriend(request: FastifyRequest<{ Params: { friendId: string } }>, reply: FastifyReply) {
    try {
      const decoded = await request.jwtVerify<{ id: number }>();
      const friendId = parseInt(request.params.friendId);

      if (!friendId || friendId === decoded.id) {
        return reply.status(400).send({ error: 'Invalid friend ID' });
      }

      const success = await this.authService.removeFriend(decoded.id, friendId);
      if (!success) {
        return reply.status(400).send({ error: 'Failed to remove friend' });
      }

      return reply.send({ success: true, message: 'Friend removed' });
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to remove friend' });
    }
  }
}