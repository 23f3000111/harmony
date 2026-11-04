/**
 * The shapes the app depends on, kept free of Node-only imports so the same app code
 * can also run inside a browser for the GitHub Pages demo.
 */

export interface Env {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  appUrl: string;
  secureCookies: boolean;
  databaseUrl?: string;
  dataDir: string;
  demoMode: boolean;
  google: { clientId: string; clientSecret: string } | null;
  smtpUrl?: string;
  mailFrom: string;
  trustProxy: boolean;
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  /** False means nothing leaves the server and messages only go to the log. */
  enabled: boolean;
  send(message: MailMessage): Promise<void>;
}

export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture: string | null;
}

export interface GoogleClient {
  authUrl(options: { state: string; codeVerifier: string; nonce: string; redirectUri: string }): string;
  exchange(options: { code: string; codeVerifier: string; nonce: string; redirectUri: string }): Promise<GoogleIdentity>;
}
