import { OAUTH_REDIRECT_URL } from './server';
import { z } from 'zod';

export enum OAuthClientTypes {
  Website,
  Cli,
}

interface OAuthClient {
  type: OAuthClientTypes;
  cli_port: number | null;
}

export default class OAuthService {
  private states: Map<string, OAuthClient>;
  public oauth_client_id = process.env.OAUTH_CLIENT_ID_42;
  private oauth_client_secret = process.env.OAUTH_CLIENT_SECRET_42;

  constructor() {
    this.states = new Map<string, OAuthClient>();
  }

  generateRandomState(cli_port?: number) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const length = 32;

    let result = '';
    for (let i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length));
    }


    const type = cli_port !== undefined ? OAuthClientTypes.Cli : OAuthClientTypes.Website;
    const port = cli_port !== undefined ? cli_port : null;

    this.states.set(result, {type, cli_port: port});

    return result;
  }

  envVariablesConfigured(): boolean {
    if (
      !this.oauth_client_id ||
      !this.oauth_client_secret ||
      this.oauth_client_id == 'placeholder_client_id' ||
      this.oauth_client_secret == 'placeholder_client_secret'
    ) {
      return false;
    }

    return true;
  }

  async fetchAccessToken(data: OAuthCallbackRequest) {
    if ('error' in data) {
      throw new OAuthError(400, data.error);
    }

    const client = this.states.get(data.state);
    if (client === undefined) {
      throw new OAuthError(400, 'Invalid state received from OAuth callback');
    }
    this.states.delete(data.state);

    const callbackUrl = OAUTH_REDIRECT_URL + '/oAuthCallback';

    const response = await fetch('https://api.intra.42.fr/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: this.oauth_client_id,
        client_secret: this.oauth_client_secret,
        code: data.code,
        redirect_uri: callbackUrl,
        state: data.state,
      }),
    });

    if (!response.ok) {
      throw new OAuthError(502, 'Unable to fetch token from 42');
    }

    const accessTokenResult = await OAuthAccessTokenSchema.safeParseAsync(await response.json());
    if (!accessTokenResult.success) {
      throw new OAuthError(
        424,
        'Invalid response when trying to fetch access token from 42: ' + accessTokenResult.error
      );
    }

    return { access_token: accessTokenResult.data.access_token, client };
  }

  async fetchProfileInfos(access_token: string) {
    const response = await fetch('https://api.intra.42.fr/v2/me', {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer ' + access_token,
      },
    });

    if (!response.ok) {
      throw new OAuthError(502, 'Unable to fetch profile info');
    }

    const result = await ProfileInfoResponseSchema.safeParseAsync(await response.json());
    if (!result.success) {
      throw new OAuthError(
        424,
        'Invalid data received when trying to fetch profile info from 42: ' + result.error
      );
    }

    return result.data;
  }
}

const OAuthCallbackSuccessSchema = z.object({
  code: z.string().nonempty(),
  state: z.string().nonempty(),
});

const OAuthCallbackErrorSchema = z.object({
  error: z.string().nonempty(),
  error_description: z.string().optional(),
  state: z.string().nonempty(),
});

export const OAuthCallbackRequestSchema = z.union([
  OAuthCallbackSuccessSchema,
  OAuthCallbackErrorSchema,
]);

type OAuthCallbackRequest = z.infer<typeof OAuthCallbackRequestSchema>;

const OAuthAccessTokenSchema = z.object({
  access_token: z.string().nonempty(),
});

const ProfileInfoResponseSchema = z.object({
  id: z.number().nonnegative(),
});

export class OAuthError extends Error {
  code: number;

  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}
