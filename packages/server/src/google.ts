import { createHash } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { GoogleClient } from './ports';

export type { GoogleClient, GoogleIdentity } from './ports';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const JWKS_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/certs';

export const pkceChallenge = (verifier: string) => createHash('sha256').update(verifier).digest('base64url');

/** OpenID Connect authorization-code flow with PKCE. The ID token's signature, audience, issuer and nonce are all checked. */
export function createGoogleClient(
  credentials: { clientId: string; clientSecret: string },
  options: { keys?: JWTVerifyGetKey; fetcher?: typeof fetch } = {},
): GoogleClient {
  const keys = options.keys ?? createRemoteJWKSet(new URL(JWKS_ENDPOINT));
  const fetcher = options.fetcher ?? fetch;

  return {
    authUrl({ state, codeVerifier, nonce, redirectUri }) {
      const params = new URLSearchParams({
        client_id: credentials.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        state,
        nonce,
        code_challenge: pkceChallenge(codeVerifier),
        code_challenge_method: 'S256',
        prompt: 'select_account',
      });
      return `${AUTH_ENDPOINT}?${params}`;
    },

    async exchange({ code, codeVerifier, nonce, redirectUri }) {
      const response = await fetcher(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: credentials.clientId,
          client_secret: credentials.clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
          code_verifier: codeVerifier,
        }),
      });
      if (!response.ok) throw new Error(`Google token exchange failed with status ${response.status}`);
      const tokens = (await response.json()) as { id_token?: string };
      if (!tokens.id_token) throw new Error('Google did not return an ID token');

      const { payload } = await jwtVerify(tokens.id_token, keys, {
        issuer: ['https://accounts.google.com', 'accounts.google.com'],
        audience: credentials.clientId,
      });
      if (payload.nonce !== nonce) throw new Error('Google ID token nonce does not match');
      if (!payload.sub || typeof payload.email !== 'string') throw new Error('Google ID token is missing the account details');

      return {
        sub: payload.sub,
        email: payload.email.toLowerCase(),
        emailVerified: payload.email_verified === true,
        name: typeof payload.name === 'string' && payload.name ? payload.name : payload.email.split('@')[0]!,
        picture: typeof payload.picture === 'string' ? payload.picture : null,
      };
    },
  };
}
