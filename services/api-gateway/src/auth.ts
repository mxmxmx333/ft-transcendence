import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import * as crypto from 'crypto';
import { parseDurationToSec } from './parseTimeUnits';
dotenv.config();

type CoreClaims = {
  sub: string; // Subject (user ID)
  nickname: string; // User's nickname
};

const authPlugin: FastifyPluginAsync = async (fastify) => {
  const jwtExpiration = process.env.JWT_EXPIRATION || '2h';
  const clockTolerance = parseDurationToSec(process.env.CLOCK_TOLERANCE || '30');
  const vaultAddress = process.env.VAULT_ADDR || 'http://localhost:8200';
  const keyName = process.env.KEY_NAME || 'jwt-issuer';
  const jwtIssuer = process.env.JWT_ISSUER || 'Auth-User-Service';
  const { vClient } = fastify;
  const vRequest = vClient.vRequest;
  let pubKeys: Map<string, string> = new Map(); // kid -> PEM
  let latestKid: string | null = null;

  async function sign(payload: CoreClaims): Promise<string> {
    if (!payload?.sub || typeof payload.sub !== 'string' || !payload.sub.trim()) {
      throw new Error('Invalid subject (sub) claim');
    }
    if (!payload.nickname || typeof payload.nickname !== 'string' || !payload.nickname.trim()) {
      throw new Error('Invalid nickname claim');
    }
    const { latestKid: kid } = await fetchPublicKeys();
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + parseDurationToSec(jwtExpiration);
    const header = { alg: 'ES256', typ: 'JWT', kid };
    const claims = { ...payload, iat, exp, iss: jwtIssuer };

    const encHeader = Buffer.from(JSON.stringify(header), 'utf8').toString('base64url');
    const encPayload = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
    const signingInput = `${encHeader}.${encPayload}`;

    const body = {
      input: Buffer.from(signingInput, 'utf8').toString('base64'),
      key_version: Number(kid),
      signature_algorithm: 'ecdsa',
      hash_algorithm: 'sha2-256',
      marshaling_algorithm: 'jws',
    };

    const res = await vRequest(`${vaultAddress}/v1/transit/sign/${keyName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`Vault sign request failed: ${res.status} ${await res.text()}`);
    }

    const data: any = await res.json();
    const sigField = data?.data?.signature;
    if (typeof sigField !== 'string') {
      throw new Error('Invalid signature from Vault');
    }

    const parts = sigField.split(':'); // ["vault","v<nr>","<base64>"]
    if (parts.length !== 3 || !/^v\d+$/.test(parts[1])) {
      throw new Error('Unexpected signature format from Vault');
    }
    const returnedKid = parts[1].slice(1); // "<nr>" ohne 'v'

    if (returnedKid !== latestKid) {
      fastify.log.warn({ latestKid, returnedKid }, 'kid mismatch after sign');
    }

    const signatureBase64 = parts[2];
    const signatureBase64Url = Buffer.from(signatureBase64, 'base64').toString('base64url');
    return `${encHeader}.${encPayload}.${signatureBase64Url}`;
  }

  async function verify<T = CoreClaims>(token: string): Promise<T> {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('invalid token format');
    }
    const [b64Header, b64Payload, b64Signature] = parts;

    let header: any, payload: any;
    try {
      header = JSON.parse(Buffer.from(b64Header, 'base64url').toString('utf8'));
      payload = JSON.parse(Buffer.from(b64Payload, 'base64url').toString('utf8'));
    } catch (err) {
      throw new Error('invalid token JSON');
    }
    if (header.alg !== 'ES256' || header.typ !== 'JWT' || typeof header.kid !== 'string') {
      throw new Error('invalid token header');
    }
    const tokenkid = header.kid;
    if (typeof tokenkid !== 'string' || !tokenkid.trim()) {
      throw new Error('Missing token kid');
    }
    let pem = pubKeys.get(tokenkid);
    if (!pem) {
      await fetchPublicKeys();
      pem = pubKeys.get(tokenkid);
      if (!pem) throw new Error('Public key not found for kid');
    }

    const dataToVerify = `${b64Header}.${b64Payload}`;
    const signature = Buffer.from(b64Signature, 'base64url');
    const ok = crypto.verify(
      'sha256',
      Buffer.from(dataToVerify, 'utf8'),
      { key: pem, dsaEncoding: 'ieee-p1363' },
      signature
    );
    if (!ok) {
      throw new Error('signature verification failed');
    }

    const now = Math.floor(Date.now() / 1000);

    if (typeof payload.iat !== 'number') throw new Error('missing in token: iat claim');
    if (typeof payload.sub !== 'string' || !payload.sub.trim())
      throw new Error('missing in token: sub claim');
    if (typeof payload.nickname !== 'string') throw new Error('missing in token: nickname claim');
    if (typeof payload.exp !== 'number') throw new Error('missing in token: exp claim');
    if (typeof payload.iss !== 'string') throw new Error('missing in token: iss claim');

    if (payload.iss !== jwtIssuer) throw new Error('token: invalid issuer');
    if (now + clockTolerance < payload.iat) throw new Error('token: used before issued');
    if (now - clockTolerance >= payload.exp) throw new Error('token: expired');
    return payload as T;
  }
  // --- Types (Antwort von /v1/transit/keys/<key>) ---
  type TransitKeysResponse = {
    data?: {
      latest_version?: number;
      keys?: Record<string, { public_key?: string }>;
    };
  };

  let fetchingKeysInFlight: Promise<void> | null = null;
  async function fetchPublicKeys(): Promise<{ latestKid: string; count: number }> {
    if (fetchingKeysInFlight) {
      await fetchingKeysInFlight;
      if (!latestKid) throw new Error('no latest key version available after fetch');
      return { latestKid, count: pubKeys.size };
    }

    fetchingKeysInFlight = (async () => {
      const res = await vRequest(`${vaultAddress}/v1/transit/keys/${keyName}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (!res.ok) {
        throw new Error(`transit/keys read failed: ${res.status} ${await res.text()}`);
      }

      const json = (await res.json()) as TransitKeysResponse;
      const lv = json?.data?.latest_version;
      const keys = json?.data?.keys;

      if (typeof lv !== 'number' || !keys) {
        throw new Error('malformed transit/keys response (missing keys/latest_version)');
      }

      const next = new Map<string, string>();
      for (const [ver, obj] of Object.entries(keys)) {
        if (typeof obj?.public_key === 'string') {
          next.set(ver, obj.public_key);
        }
      }
      if (next.size === 0) {
        throw new Error('no public keys returned by transit');
      }

      pubKeys = next;
      latestKid = String(lv);
    })().finally(() => {
      fetchingKeysInFlight = null;
    });
    await fetchingKeysInFlight;

    if (!latestKid) throw new Error('no latest key version available after fetch');
    return { latestKid, count: pubKeys.size };
  }

  fastify.decorate('vAuth', {
    sign,
    verify,
    fetchPublicKeys,
  });
  fastify.decorate('bcrypt', bcrypt);
};

declare module 'fastify' {
  interface FastifyInstance {
    vAuth: {
      sign: (payload: CoreClaims) => Promise<string>;
      verify: (token: string) => Promise<CoreClaims>;
      fetchPublicKeys: () => Promise<{ latestKid: string; count: number }>;
    };
    bcrypt: typeof bcrypt;
  }
}

export default fp(authPlugin, {
  name: 'vAuth',
  dependencies: ['vaultClient'],
});
