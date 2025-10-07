import { FastifyRequest, FastifyReply } from 'fastify';
import AuthService from './auth.service';
import OAuthService, { OAuthCallbackRequestSchema, OAuthError, OAuthRequestSchema } from './oauth';
import User from './user';
import { frontendUrl } from './server';

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
    private oAuthService: OAuthService,
    fastifyInstance: any
  ) {
    this.fastify = fastifyInstance;
  }

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
      const existingUser = this.authService.getUserByEmail(email);
      if (existingUser) {
        return reply.status(409).send({
          error: 'Bu email zaten kayıtlı',
          email: email,
        });
      }

      // Hashing the pw
      const hashedPassword = await this.fastify.bcrypt.hash(password, 10);

      // We need to expend user's variables.
      const user = this.authService.createUser({
        nickname,
        auth_method: 'local',
        email,
        password_hash: hashedPassword,
        external_id: null,
        totp_secret: null,
        avatar: 'default',
        status: 'online',
      });

      // jwt for each
      const token = await this.signUserInfos(user);

      // status codes have to be correct :/
      return reply.status(201).send({
        success: true,
        token,
        action_required: false,
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
      const user = this.authService.getUserByEmail(email);
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

      this.fastify.log.error(user);
      const token = await this.signUserInfos(user);
      const action_required = user.nickname === null ? 'nickname' : user.totp_secret !== null ? '2fa' : false;

      if (action_required !== false) {
        return reply.send({
          success: true,
          token,
          action_required,
        });
      }

      return reply.send({
        success: true,
        token,
        action_required,
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

  async oAuthLogin(request: FastifyRequest, reply: FastifyReply) {
    const result = await OAuthRequestSchema.safeParseAsync(request.query);

    if (!result.success) {
      return reply.code(400).send(result.error);
    }

    const state = this.oAuthService.generateRandomState(result.data.cli);

    const callbackUrl = frontendUrl + '/oAuthCallback';

    const url = new URL("https://api.intra.42.fr/oauth/authorize");
    url.searchParams.append('client_id', this.oAuthService.oauth_client_id!);
    url.searchParams.append('redirect_uri', callbackUrl);
    url.searchParams.append('scope', 'public');
    url.searchParams.append('state', state);
    url.searchParams.append('response_type', 'code');

    return reply.send({ url: url.toString() });
  }

  async oAuthLoginCallback(request: FastifyRequest, reply: FastifyReply) {
    const result = await OAuthCallbackRequestSchema.safeParseAsync(request.query);

    if (!result.success) {
      return reply.code(400).send(result.error);
    }

    try {
      const { access_token, client_type } = await this.oAuthService.fetchAccessToken(result.data);
      const profileInfos = await this.oAuthService.fetchProfileInfos(access_token);

      const user = this.authService.getUserByExternalId(profileInfos.id);

      if (user) {
        this.authService.updateUserStatus(user.id!, 'online');

        const token = await this.signUserInfos(user);
        const action_required = user.nickname === null ? 'nickname' : false;

        if (action_required !== false) {
          return reply.send({
            success: true,
            token,
            action_required,
          });
        }

        return reply.send({
          success: true,
          token,
          action_required,
          user: {
            id: user.id,
            nickname: user.nickname,
            email: user.email,
            avatar: user.avatar,
            status: 'online',
          },
        });
      }

      const newUser = this.authService.createUser({
        auth_method: 'remote',
        nickname: null,
        email: null,
        password_hash: null,
        external_id: profileInfos.id,
        totp_secret: null,
        avatar: 'default',
        status: 'online',
      });

      const token = await this.signUserInfos(newUser);

      return reply.status(201).send({
        success: true,
        token,
        action_required: 'nickname',
      });
    } catch (error) {
      this.fastify.log.error(error);
      if (error instanceof OAuthError) {
        return reply.code(error.code).send(error.message);
      }

      return reply.code(500).send(error);
    }
  }

  async signUserInfos(user: User) {
      const token = await this.fastify.vAuth.sign({
        sub: user.id?.toString(),
        nickname: user.nickname,
        nickname_required: user.nickname === null,
        totp_required: user.totp_secret !== null,
      });

      return token;
  }

  // ======= NEW PROFILE METHODS =======
  async getProfile(request: FastifyRequest, reply: FastifyReply) {
    try {
      const token = request.headers?.authorization?.split(' ')[1];
      if (!token) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      const extracted = await request.server.vAuth.verify(token);
      let decoded: { id: number; nickname: string } = extracted as any;
      const user = this.authService.getUserById(decoded.id);

      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }

      const gameStats = await this.authService.getUserGameStats(decoded.id);
      const friendsCount = this.authService.getFriends(decoded.id).length;

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
      const token = request.headers?.authorization?.split(' ')[1];
      if (!token) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      const decodedraw = await request.server.vAuth.verify(token);
      const decoded: { id: number; nickname: string } = decodedraw as any;
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
      const token = request.headers?.authorization?.split(' ')[1];
      if (!token) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      const extracted = await request.server.vAuth.verify(token);
      let decoded: { id: number; nickname: string } = extracted as any;
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
      const token = request.headers?.authorization?.split(' ')[1];
      if (!token) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      const extracted = await request.server.vAuth.verify(token);
      let decoded: { id: number; nickname: string } = extracted as any;
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

  async respondToFriendRequestById(
    request: FastifyRequest<{ Params: { id: string }; Body: { action: 'accept' | 'decline' } }>,
    reply: FastifyReply
  ) {
    try {
      console.log('Request headers:', request.headers); // Debug için

      // DÜZELTME: request.headers kontrolü
      const authHeader = request.headers?.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.log('No valid authorization header found');
        return reply.status(401).send({ error: 'No token provided' });
      }

      const token = authHeader.substring(7);
      if (!token) {
        console.log('No token found after Bearer');
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      let decoded: { id: number; nickname: string };
      try {
        const extracted = await request.server.vAuth.verify(token);
        decoded = extracted as any;
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
        message: `Friend request ${action}ed`,
      });
    } catch (error) {
      console.error('Error responding to friend request:', error);
      return reply.status(500).send({ error: 'Failed to respond to friend request' });
    }
  }
  // ============================================

  async updateProfile(request: FastifyRequest<{ Body: UpdateProfileBody }>, reply: FastifyReply) {
    try {
      const token = request.headers?.authorization?.split(' ')[1];
      if (!token) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      const extracted = await request.server.vAuth.verify(token);
      let decoded: { id: number; nickname: string } = extracted as any;
      const { nickname, avatar, status } = request.body;
      let updated = false;

      if (nickname) {
        try {
          const success = this.authService.updateUserNickname(decoded.id, nickname);
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
        const success = this.authService.updateUserAvatar(decoded.id, avatar);
        if (success) updated = true;
      }

      if (status) {
        const validStatuses = ['online', 'away', 'busy', 'invisible'];
        if (!validStatuses.includes(status)) {
          return reply.status(400).send({ error: 'Invalid status' });
        }
        const success = this.authService.updateUserStatus(decoded.id, status);
        if (success) updated = true;
      }

      if (!updated) {
        return reply.status(400).send({ error: 'No valid updates provided' });
      }

      const updatedUser = this.authService.getUserById(decoded.id);
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
  async searchUsers(
    request: FastifyRequest<{ Querystring: SearchUsersQuery }>,
    reply: FastifyReply
  ) {
    try {
      const token = request.headers?.authorization?.split(' ')[1];
      if (!token) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      const extracted = await request.server.vAuth.verify(token);
      let decoded: { id: number; nickname: string } = extracted as any;
      const { q } = request.query;

      if (!q || q.trim().length < 2) {
        return reply.status(400).send({ error: 'Search term must be at least 2 characters' });
      }

      const users = this.authService.searchUsers(q.trim(), decoded.id);
      return reply.send({ users });
    } catch (error) {
      if (error === 'Unauthorized') {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      return reply.status(500).send({ error: 'Search failed' });
    }
  }

  async sendFriendRequest(
    request: FastifyRequest<{ Body: FriendRequestBody }>,
    reply: FastifyReply
  ) {
    try {
      const token = request.headers?.authorization?.split(' ')[1];
      if (!token) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      const extracted = await request.server.vAuth.verify(token);
      let decoded: { id: number; nickname: string } = extracted as any;
      const { targetUserId } = request.body;

      if (!targetUserId || targetUserId === decoded.id) {
        return reply.status(400).send({ error: 'Invalid target user' });
      }

      const success = this.authService.sendFriendRequest(decoded.id, targetUserId);
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

  async respondToFriendRequest(
    request: FastifyRequest<{ Body: FriendResponseBody }>,
    reply: FastifyReply
  ) {
    try {
      const token = request.headers?.authorization?.split(' ')[1];
      if (!token) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      await request.server.vAuth.verify(token);
      const { friendshipId, response } = request.body;

      if (!friendshipId || !['accepted', 'declined'].includes(response)) {
        return reply.status(400).send({ error: 'Invalid request parameters' });
      }

      const success = this.authService.respondToFriendRequest(friendshipId, response);
      if (!success) {
        return reply.status(400).send({ error: 'Failed to respond to friend request' });
      }

      return reply.send({
        success: true,
        message: `Friend request ${response}`,
      });
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to respond to friend request' });
    }
  }

  async getFriends(request: FastifyRequest, reply: FastifyReply) {
    try {
      const token = request.headers?.authorization?.split(' ')[1];
      if (!token) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      const extracted = await request.server.vAuth.verify(token);
      let decoded: { id: number; nickname: string } = extracted as any;
      const friends = this.authService.getFriends(decoded.id);
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

  async removeFriend(
    request: FastifyRequest<{ Params: { friendId: string } }>,
    reply: FastifyReply
  ) {
    try {
      const token = request.headers?.authorization?.split(' ')[1];
      if (!token) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      const extracted = await request.server.vAuth.verify(token);
      let decoded: { id: number; nickname: string } = extracted as any;
      const friendId = parseInt(request.params.friendId);

      if (!friendId || friendId === decoded.id) {
        return reply.status(400).send({ error: 'Invalid friend ID' });
      }

      const success = this.authService.removeFriend(decoded.id, friendId);
      if (!success) {
        return reply.status(400).send({ error: 'Failed to remove friend' });
      }

      return reply.send({ success: true, message: 'Friend removed' });
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to remove friend' });
    }
  }
}
