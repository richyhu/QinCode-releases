import { createServer } from 'http';
import { createHash, randomBytes } from 'crypto';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { readCredentials, writeCredentials } from './credentials.js';

// Resolve callback HTML paths.
// In SEA mode, HTML files are extracted to a temp directory and QINCODE_HTML_DIR is set.
const htmlDir = process.env.QINCODE_HTML_DIR || join(fileURLToPath(new URL('.', import.meta.url)), '../..');
const CALLBACK_HTML_PATH = join(htmlDir, 'login-callback.html');
const FAIL_HTML_PATH = join(htmlDir, 'login-fail.html');

export const OAUTH_CONFIG = {
  authBase: 'https://unified.huruiqi.my',
  clientId: '8a01197534f85c6f3c4fe850',
  clientSecret: 'e6d49c4721abc67d7d34d33b63e982e6b85d902c0c09f0fff98b964e94ba66dc',
  scope: 'openid profile email',
};

function generateCodeVerifier(): string {
  return randomBytes(32).toString('hex');
}

function generateCodeChallenge(verifier: string): string {
  return createHash('sha256')
    .update(verifier)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function generateState(): string {
  return randomBytes(16).toString('hex');
}

/** Start local HTTP callback server, open browser, wait for code, exchange tokens */
export async function loginOAuth(openBrowser: (url: string) => Promise<void>): Promise<{
  uid: string;
  username: string;
  accessToken: string;
  refreshToken: string;
}> {
  const port = 49299;
  const redirectUri = `http://127.0.0.1:${port}/callback`;
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = generateState();

  const params = new URLSearchParams({
    client_id: OAUTH_CONFIG.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: OAUTH_CONFIG.scope,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  const authUrl = `${OAUTH_CONFIG.authBase}/authorize?${params}`;

  // Wait for callback
  const { code, returnedState } = await new Promise<{ code: string; returnedState: string }>(
    (resolve, reject) => {
      const server = createServer(async (req, res) => {
        try {
          const url = new URL(req.url!, `http://127.0.0.1:${port}`);
          const code = url.searchParams.get('code');
          const returnedState = url.searchParams.get('state') || '';
          if (code) {
            let html: string
            try {
              html = await readFile(CALLBACK_HTML_PATH, 'utf-8')
            } catch {
              html = '<html><body style="font-family:sans-serif;text-align:center;padding:60px"><h2>✅ 登录成功！</h2><p>可以关闭此窗口，回到终端继续使用 QinCode。</p></body></html>'
            }
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(html);
            server.close();
            resolve({ code, returnedState });
          } else {
            let failHtml: string
            try {
              failHtml = await readFile(FAIL_HTML_PATH, 'utf-8')
            } catch {
              failHtml = '<html><body style="font-family:sans-serif;text-align:center;padding:60px"><h2>❌ 登录失败</h2><p>未收到授权码，请关闭此窗口重试。</p></body></html>'
            }
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(failHtml);
            server.close();
            reject(new Error('No code in callback'));
          }
        } catch (err) {
          server.close();
          reject(err);
        }
      });

      server.listen(port, '127.0.0.1', () => {
        openBrowser(authUrl).catch(reject);
      });

      server.on('error', reject);
      // 5 minute timeout
      setTimeout(() => {
        server.close();
        reject(new Error('登录超时（5分钟），请重试'));
      }, 5 * 60 * 1000);
    },
  );

  if (returnedState !== state) throw new Error('OAuth state mismatch，可能存在安全风险');

  // Exchange code for tokens
  const tokenResponse = await fetch(`${OAUTH_CONFIG.authBase}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: OAUTH_CONFIG.clientId,
      client_secret: OAUTH_CONFIG.clientSecret,
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  });

  if (!tokenResponse.ok) {
    const err = await tokenResponse.text();
    throw new Error(`Token exchange failed: ${err}`);
  }

  const tokens: any = await tokenResponse.json();

  const userInfoResponse = await fetch(`${OAUTH_CONFIG.authBase}/userinfo`, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (!userInfoResponse.ok) throw new Error('Failed to fetch user info');
  const userInfo: any = await userInfoResponse.json();

  const uid = userInfo.sub || userInfo.id || '';
  const username = userInfo.username || userInfo.display_name || userInfo.name || 'User';

  return { uid, username, accessToken: tokens.access_token, refreshToken: tokens.refresh_token };
}

export async function refreshAccessToken(): Promise<string | null> {
  const creds = await readCredentials();
  if (!creds?.refreshToken) return null;

  try {
    const response = await fetch(`${OAUTH_CONFIG.authBase}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: OAUTH_CONFIG.clientId,
        client_secret: OAUTH_CONFIG.clientSecret,
        refresh_token: creds.refreshToken,
      }),
    });

    if (!response.ok) return null;
    const tokens: any = await response.json();

    await writeCredentials({
      ...creds,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || creds.refreshToken,
    });

    return tokens.access_token;
  } catch {
    return null;
  }
}

export async function logoutOAuth(): Promise<void> {
  const { credentialsPath } = await import('./credentials.js');
  const { unlink } = await import('fs/promises');
  try {
    await unlink(credentialsPath());
  } catch {
    // already gone
  }
}
