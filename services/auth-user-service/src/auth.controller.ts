import { FastifyRequest, FastifyReply } from 'fastify';
import AuthService from './auth.service';
import OAuthService, { OAuthCallbackRequestSchema, OAuthClientTypes, OAuthError } from './oauth';
import User from './user';
import { OAUTH_REDIRECT_URL, liveChatUpstream } from './server';
import z, { ZodError } from 'zod';
import * as OTPAuth from "otpauth";

interface SignupBody {
  nickname: string;
  email: string;
  password: string;
}

export const Nickname = z.string().min(3).max(20).regex(/^[a-zA-Z0-9_\-\.]+$/);
const Email = z.email().max(254);
const Password = z.string().min(8).max(128).regex(/^(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{8,}$/);

const SignupSchema = z.object({
  nickname: Nickname,
  email: Email,
  password: Password
});

interface LoginBody {
  email: string;
  password: string;
}

const LoginSchema = z.object({
  email: Email,
  password: Password
});

interface UpdateProfileBody {
  nickname?: string;
  avatar?: string;
  status?: string;
}

// interface FriendRequestBody {
//   targetUserId: number;
// }

// interface FriendResponseBody {
//   friendshipId: number;
//   response: 'accepted' | 'declined';
// }

// interface SearchUsersQuery {
//   q: string;
// }

const Login2FaRequestSchema = z.object({
  totp_code: z.string().length(6),
});

const UpdateAccountRequestSchema = z.object({
  email: Email,
  current_password: Password,
  new_password: Password.nullable(),
});

const DeleteAccountRequestSchema = z.object({
  password: Password.nullable(),
});

export default class AuthController {
  private fastify: any;
  private totp_secrets_tmp: Map<number, string>;
  constructor(
    private authService: AuthService,
    private oAuthService: OAuthService,
    fastifyInstance: any
  ) {
    this.fastify = fastifyInstance;
    this.totp_secrets_tmp = new Map();
  }

  // ======= EXISTING AUTH METHODS =======
  async signup(request: FastifyRequest<{ Body: SignupBody }>, reply: FastifyReply) {
    try {
      const { nickname, email, password } = await SignupSchema.parseAsync(request.body);

      const existingUser = this.authService.getUserByEmail(email);
      if (existingUser) {
        return reply.status(409).send({
          error: 'This email already exist',
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
      if (error instanceof ZodError) {
        return reply.status(400).send({
          error: 'Bad request',
        });
      }
      return reply.status(400).send({
        error: 'Nickname or email already in use'
      });
    }
  }

  async login(
    request: FastifyRequest<{ Body: { email: string; password: string } }>,
    reply: FastifyReply
  ) {
    try {
      const { email, password } = await LoginSchema.parseAsync(request.body);
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
      const action_required =
        user.nickname === null ? 'nickname' : user.totp_secret !== null ? '2fa' : false;

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
      if (error instanceof ZodError) {
        return reply.status(400).send({
          error: 'Bad request',
        });
      }
      return reply.status(401).send({
        error: 'Login failed'
      });
    }
  }

  async login2Fa(request: FastifyRequest, reply: FastifyReply) {
    try {
      const token = request.headers?.authorization?.split(' ')[1];
      if (!token) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const result = await Login2FaRequestSchema.parseAsync(request.body);

      const { sub, totp_required } = await request.server.vAuth.verify(token);
      if (!totp_required) {
        return reply.status(400).send({error: 'No TOTP needed' });
      }

      const user = this.authService.getUserById(Number(sub));
      if (!user) {
        return reply.status(404).send({error: 'User not found'});
      }
      if (!user.totp_secret) {
        return reply.status(403).send({error: 'User doesn\'t have 2FA enabled'});
      }

      const totp = new OTPAuth.TOTP({secret: user.totp_secret});

      const delta = totp.validate({token: result.totp_code, window: 1});
      if (delta === null) {
        return reply.status(401).send({error: 'Invalid 2FA Code'});
      }

      // Update user status to online
      this.authService.updateUserStatus(user.id!, 'online');
      const signToken = await this.signUserInfos(user, true);

      return reply.send({
        success: true,
        token: signToken,
        action_required: false,
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
      if (error instanceof ZodError) {
        return reply.status(400).send({
          error: 'Bad request',
        });
      }
      return reply.status(401).send({
        error: '2FA verification failed'
      });
    }
  }

  async enable2Fa(request: FastifyRequest<{Body: {totp_code: string}}>, reply: FastifyReply) {
    try {
      const token = request.headers?.authorization?.split(' ')[1];
      if (!token) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      if (!request.body.totp_code) {
        return reply.status(400).send({ error: 'Missing totp code' });
      }

      const { sub } = await request.server.vAuth.verify(token);

      const user = this.authService.getUserById(Number(sub));
      if (!user || !user.id) {
        return reply.status(404).send({error: 'User not found'});
      }
      if (user.totp_secret) {
        return reply.status(400).send({error: '2FA already enabled'});
      }

      const secret = this.totp_secrets_tmp.get(user.id);
      if (!secret) {
        return reply.status(400).send({error: 'Secret missing'});
      }

      const totp = new OTPAuth.TOTP({secret});
      let delta = totp.validate({token: request.body.totp_code, window: 1});

      if (delta === null) {
        return reply.status(401).send({error: 'Invalid TOTP code'});
      }

      this.totp_secrets_tmp.delete(user.id);
      this.authService.enable2Fa(user.id, secret);

      return reply.send({success: true});
    } catch (error) {
      this.fastify.log.error(error);
      return reply.status(400).send({
        error: 'Failed to enable 2FA'
      });
    }
  }

  async disable2Fa(request: FastifyRequest<{Body: {totp_code: string}}>, reply: FastifyReply) {
    try {
      const token = request.headers?.authorization?.split(' ')[1];
      if (!token) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      if (!request.body.totp_code) {
        return reply.status(400).send({ error: 'Missing totp code' });
      }

      const { sub } = await request.server.vAuth.verify(token);

      const user = this.authService.getUserById(Number(sub));
      if (!user || !user.id) {
        return reply.status(404).send({error: 'User not found'});
      }
      if (!user.totp_secret) {
        return reply.status(400).send({error: '2FA already disabled'});
      }

      const totp = new OTPAuth.TOTP({secret: user.totp_secret});
      const delta = totp.validate({token: request.body.totp_code, window: 1});

      if (delta === null) {
        return reply.status(401).send({error: 'Invalid TOTP code'});
      }

      this.authService.disable2Fa(user.id);

      return reply.send({success: true});
    } catch (error) {
      this.fastify.log.error(error);
      return reply.status(400).send({
        error: 'Failed to disable 2FA'
      });
    }
  }

  async getAccountInfos(request: FastifyRequest, reply: FastifyReply) {
    try {
      const token = request.headers?.authorization?.split(' ')[1];
      if (!token) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const { sub, totp_required } = await request.server.vAuth.verify(token);
      if (totp_required) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const user = this.authService.getUserById(Number(sub));
      if (!user || !user.id) {
        return reply.status(404).send({error: 'User not found'});
      }

      let totp = null;
      if (user.totp_secret === null) {
        totp = new OTPAuth.TOTP({issuer: "ft_transcendence", label: user.nickname!});
        this.totp_secrets_tmp.set(user.id, totp.secret.base32);
      }

      return reply.send({
        success: true,
        auth_method: user.auth_method,
        email: user.email,
        totp_enabled: user.totp_secret !== null,
        enable_totp_uri: totp ? totp.toString() : null,
      });
    } catch (error) {
      this.fastify.log.error(error);
      return reply.status(400).send({
        error: 'Failed to get account information'
      });
    }
  }

  async updateAccountInfos(request: FastifyRequest, reply: FastifyReply) {
    try {
      const result = await UpdateAccountRequestSchema.parseAsync(request.body);

      const token = request.headers?.authorization?.split(' ')[1];
      if (!token) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const { sub, totp_required } = await request.server.vAuth.verify(token);
      if (totp_required) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const user = this.authService.getUserById(Number(sub));
      if (!user || !user.id) {
        return reply.status(404).send({error: 'User not found'});
      }

      let hashedPassword = await this.fastify.bcrypt.hash(result.current_password, 10);
      if (!await this.fastify.bcrypt.compare(result.current_password, user.password_hash)) {
        return reply.status(401).send({error: 'Invalid password'});
      }

      if (result.new_password) {
        hashedPassword = await this.fastify.bcrypt.hash(result.new_password, 10);
      }

      if (this.authService.updateAccount(Number(sub), result.email, hashedPassword)) {
        return reply.send({success: true});
      }
      return reply.status(409).send({error: 'E-Mail already in use'});
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send({error: 'Invalid request'});
      }
      this.fastify.log.error(error);
      return reply.status(400).send({
        error: 'Failed to update account'
      });
    }
  }

  async deleteAccount(request: FastifyRequest, reply: FastifyReply) {
    try {
      const result = await DeleteAccountRequestSchema.parseAsync(request.body);

      const token = request.headers?.authorization?.split(' ')[1];
      if (!token) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const { sub, totp_required } = await request.server.vAuth.verify(token);
      if (totp_required) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const user = this.authService.getUserById(Number(sub));
      if (!user || !user.id) {
        return reply.status(404).send({ error: 'User not found' });
      }

      if (user.auth_method === 'local') {
        if (!result.password) {
          return reply.status(401).send({ error: 'Missing password' });
        }
        if (!await this.fastify.bcrypt.compare(result.password, user.password_hash)) {
          return reply.status(401).send({ error: 'Invalid password' });
        }
        if (user.totp_secret !== null) {
          return reply.status(401).send({error: 'You need to disable 2FA first!'});
        }
      }
      this.authService.deleteAccount(Number(sub));
      const response = await fetch(`${liveChatUpstream}/auth/info/update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: Number(sub),
          nickname: null,
          avatar: null,
        }),
      });

      if (!response.ok) {
        throw new Error("Unable to inform livechat about user deletion");
      }
      return reply.send({success: true});
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send({error: 'Invalid request'});
      }
      this.fastify.log.error(error);
      return reply.status(400).send({
        error: 'Failed to delete account'
      });
    }
  }

  async oAuthLogin(request: FastifyRequest<{Querystring: {cli_port?: number}}>, reply: FastifyReply) {
    const { cli_port } = request.query;

    const state = this.oAuthService.generateRandomState(cli_port);

    const callbackUrl = OAUTH_REDIRECT_URL + '/oAuthCallback';

    const url = new URL('https://api.intra.42.fr/oauth/authorize');
    url.searchParams.append('client_id', this.oAuthService.oauth_client_id!);
    url.searchParams.append('redirect_uri', callbackUrl);
    url.searchParams.append('scope', 'public');
    url.searchParams.append('state', state);
    url.searchParams.append('response_type', 'code');

    return reply.send({ url: url.toString() });
  }

  async oAuthLoginCallback(request: FastifyRequest, reply: FastifyReply) {
    try {
      const result = await OAuthCallbackRequestSchema.parseAsync(request.query);
      const { access_token, client } = await this.oAuthService.fetchAccessToken(result);
      const profileInfos = await this.oAuthService.fetchProfileInfos(access_token);

      const user = this.authService.getUserByExternalId(profileInfos.id);

      const cli_redirect = client.type === OAuthClientTypes.Cli ? client.cli_port : false;
      if (user) {
        this.authService.updateUserStatus(user.id!, 'online');

        const token = await this.signUserInfos(user);
        const action_required = user.nickname === null ? 'nickname' : false;

        if (action_required !== false) {
          return reply.send({
            success: true,
            token,
            action_required,
            cli_redirect
          });
        }

        return reply.send({
          success: true,
          token,
          action_required,
          cli_redirect,
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
        cli_redirect,
        user: {
          id: newUser.id,
          nickname: newUser.nickname,
          email: newUser.email,
          avatar: newUser.avatar,
          status: 'online',
        },
      });
    } catch (error) {
      this.fastify.log.error(error);
      if (error instanceof ZodError) {
        return reply.code(400).send('Invalid request');
      }
      if (error instanceof OAuthError) {
        return reply.code(error.code).send(error.message);
      }

      return reply.code(400).send(error);
    }
  }

  async signUserInfos(user: User, totp_success?: boolean) {
    const token = await this.fastify.vAuth.sign({
      sub: user.id?.toString(),
      nickname: user.nickname,
      nickname_required: user.nickname === null,
      totp_required: totp_success ? false : user.totp_secret !== null,
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
      const decoded = extracted as { sub: string; nickname: string };
      const userId = parseInt(decoded.sub);

      const user = this.authService.getUserById(userId);
      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }

      const gameStats = await this.authService.getUserGameStats(userId);

      console.log('🔍 getProfile - user avatar:', user.avatar);

      // ✅ Avatar URL'sini doğru şekilde oluştur
      let avatarUrl = user.avatar || 'default';

      // Eğer custom avatar ise, dosya uzantısını ekle
      if (avatarUrl.startsWith('custom_')) {
        // Frontend'in erişebileceği URL formatı
        avatarUrl = `/uploads/avatars/${avatarUrl}.jpg`; // Veya gerçek uzantıyı kontrol et
      }

      return reply.send({
        id: user.id,
        nickname: user.nickname,
        email: user.email,
        avatar: avatarUrl,
        status: user.status,
        gameStatistics: gameStats,
      });
    } catch (err) {
      console.error('Get profile error:', err);
      return reply.status(401).send({ error: 'Unauthorized' });
    }
  }
  async getGameStatistics(request: FastifyRequest, reply: FastifyReply) {
    const userId = (request.headers['req-user'] as string) || null;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
    try {
      const user = this.authService.getUserById(parseInt(userId));
      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }

      const gameStats = await this.authService.getUserGameStats(parseInt(userId));
      const body = {
        games_played: gameStats.games_played,
        average_score: gameStats.average_score,
        win_rate: gameStats.win_rate,
      };
      return reply.send(body);
    } catch (err) {
      console.error('Get game statistics error:', err);
      return reply.status(400).send({ error: 'Failed to get statistics' });
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
      return reply.status(400).send({ error: 'User not found' });
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
      return reply.status(400).send({ error: 'User not found' });
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
      return reply.status(400).send({ error: 'Failed to get friend requests' });
    }
  }

  // ============================================

  async updateProfile(request: FastifyRequest<{ Body: UpdateProfileBody }>, reply: FastifyReply) {
    try {
      let token = request.headers?.authorization?.split(' ')[1];
      if (!token) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const extracted = await request.server.vAuth.verify(token);
      const decoded = extracted as any;
      const userId = decoded.id || parseInt(decoded.sub);

      if (!userId || isNaN(userId)) {
        return reply.status(400).send({ error: 'Invalid user ID' });
      }

      const { nickname, avatar, status } = request.body;
      // Normalize avatar input (accept key or URL)
      let avatarKey = avatar;
      if (avatarKey && (avatarKey.startsWith('/') || /^https?:\/\//i.test(avatarKey))) {
        const base = avatarKey.split('/').pop() || avatarKey;
        avatarKey = base.replace(/\.(jpe?g|png|gif|webp|avif)$/i, '');
      }
      let updated = false;

      if (nickname) {
        try {
          const success = this.authService.updateUserNickname(userId, nickname);
          if (!success) {
            return reply.status(400).send({ error: 'Failed to update nickname' });
          }
          updated = true;
        } catch (error: any) {
          if (error.message === 'Nickname already exists') {
            return reply.status(409).send({ error: 'Nickname already exists' });
          }
          return reply.status(400).send({ error: 'Invalid nickname format' });
        }
      }

      if (avatarKey) {
        const availableAvatars = this.authService.getAvailableAvatars(userId);
        if (!availableAvatars.includes(avatarKey)) {
          return reply.status(400).send({ error: 'Invalid avatar selection' });
        }
        const success = this.authService.updateUserAvatar(userId, avatarKey);
        if (success) updated = true;
      }

      if (status) {
        const validStatuses = ['online', 'away', 'busy', 'invisible'];
        if (!validStatuses.includes(status)) {
          return reply.status(400).send({ error: 'Invalid status' });
        }
        const success = this.authService.updateUserStatus(userId, status);
        if (success) updated = true;
      }

      if (!updated) {
        return reply.status(400).send({ error: 'No valid updates provided' });
      }

      const updatedUser = await this.authService.getUserById(userId);
      const newToken = await this.fastify.vAuth.sign({
        sub: updatedUser!.id?.toString(),
        nickname: nickname || updatedUser!.nickname,
        nickname_required: updatedUser!.nickname === null,
        totp_required: updatedUser!.totp_secret !== null,
      });
      if (newToken) {
        this.fastify.log.info('🔄 Token refreshed on profile update');
        token = newToken;
      }

      try {
        const response = await fetch(`${liveChatUpstream}/auth/info/update`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: Number(updatedUser!.id),
            nickname: updatedUser!.nickname,
            avatar: updatedUser!.avatar,
          }),
        });
        if (!response.ok) {
          this.fastify.log.warn('Unable to inform livechat about user update');
        }
      } catch (error) {
        this.fastify.log.warn('Live chat service temporarily unavailable');
      }

      return reply.send({
        success: true,
        token,
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
      return reply.status(400).send({ error: 'Profile update failed' });
    }
  }

  async getAvailableAvatars(request: FastifyRequest, reply: FastifyReply) {
    try {
      const token = request.headers?.authorization?.split(' ')[1];
      if (!token) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const extracted = await request.server.vAuth.verify(token);
      const decoded = extracted as any;
      const userId = decoded.id || parseInt(decoded.sub);

      // ✅ Kullanıcıya özel avatarları getir
      const avatars = this.authService.getAvailableAvatars(userId);
      return reply.send({ avatars });
    } catch (error) {
      return reply.status(400).send({ error: 'Failed to get avatars' });
    }
  }
  // ======= FRIEND SYSTEM METHODS =======

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
      return reply.status(400).send({ error: 'Failed to get friends' });
    }
  }

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
      return reply.status(400).send({ error: 'Failed to remove friend' });
    }
  }

  // TESTING
  async uploadAvatar(request: any, reply: FastifyReply) {
    try {
      const token = request.headers?.authorization?.split(' ')[1];
      if (!token) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const extracted = await request.server.vAuth.verify(token);
      const decoded = extracted as any;
      const userId = decoded.id || parseInt(decoded.sub);

      // ✅ DÜZELTME: fastify-multipart'ın doğru kullanımı
      const data = await request.file();
      if (!data) {
        return reply.status(400).send({ error: 'No file uploaded' });
      }

      // Dosya tipi kontrolü
      const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedMimeTypes.includes(data.mimetype)) {
        return reply.status(400).send({
          error: 'Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.',
        });
      }

      // Dosya boyutu kontrolü
      const fileBuffer = await data.toBuffer();
      const maxSize = 5 * 1024 * 1024;
      if (fileBuffer.length > maxSize) {
        return reply.status(400).send({
          error: 'File too large. Maximum size is 5MB.',
        });
      }

      // Avatar'ı işle ve kaydet
      const avatarUrl = await this.authService.processAndSaveAvatar(
        userId,
        fileBuffer,
        data.mimetype
      );

      return reply.send({
        success: true,
        avatar: avatarUrl,
        message: 'Avatar uploaded successfully',
      });
    } catch (error) {
      console.error('Avatar upload error:', error);
      return reply.status(400).send({ error: 'Failed to upload avatar' });
    }
  }
  async deleteCustomAvatar(request: FastifyRequest, reply: FastifyReply) {
    try {
      const token = request.headers?.authorization?.split(' ')[1];
      if (!token) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const extracted = await request.server.vAuth.verify(token);
      const decoded = extracted as any;
      const userId = decoded.id || parseInt(decoded.sub);

      const success = await this.authService.deleteUserAvatar(userId);

      if (success) {
        return reply.send({
          success: true,
          message: 'Avatar deleted successfully',
          avatar: 'default',
        });
      } else {
        return reply.status(400).send({ error: 'Failed to delete avatar' });
      }
    } catch (error) {
      console.error('Avatar delete error:', error);
      return reply.status(400).send({ error: 'Failed to delete avatar' });
    }
  }
}
