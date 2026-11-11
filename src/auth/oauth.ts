import crypto from "node:crypto";
import http from "node:http";
import { AddressInfo } from "node:net";
import { exec } from "node:child_process";

export interface PKCEPair {
  verifier: string;
  challenge: string;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  expiresIn: number;
  obtainedAt: number;
}

/**
 * Generates an RFC 7636 compliant PKCE code_verifier and S256 code_challenge.
 */
export function generatePKCE(): PKCEPair {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

/**
 * Opens a URL in the user's default browser.
 */
export function openBrowser(url: string): void {
  const platform = process.platform;
  let command: string;

  if (platform === "darwin") {
    command = `open "${url}"`;
  } else if (platform === "win32") {
    command = `start "" "${url}"`;
  } else {
    command = `xdg-open "${url}"`;
  }

  exec(command, (err) => {
    if (err) {
      console.error(`Please open this URL in your browser to authorize: ${url}`);
    }
  });
}

/**
 * Starts a local HTTP server on a random port, opens the browser to cmz-backend's
 * OAuth authorize endpoint, captures the callback with the authorization code,
 * and exchanges it for access and refresh tokens.
 */
export async function startOAuthFlow(
  backendUrl: string,
  timeoutMs: number = 120000
): Promise<OAuthTokens> {
  const normalizedBackend = backendUrl.replace(/\/+$/, "");
  const pkce = generatePKCE();
  const state = crypto.randomBytes(16).toString("hex");

  return new Promise((resolve, reject) => {
    let timer: NodeJS.Timeout;

    const server = http.createServer(async (req, res) => {
      try {
        const reqUrl = new URL(req.url || "", `http://${req.headers.host}`);
        if (reqUrl.pathname !== "/callback") {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Not Found");
          return;
        }

        const receivedState = reqUrl.searchParams.get("state");
        const code = reqUrl.searchParams.get("code");
        const error = reqUrl.searchParams.get("error");

        if (error) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(`<html><body style="font-family: sans-serif; text-align: center; padding: 40px;">
            <h2 style="color: #ef4444;">Authorization Denied</h2>
            <p>${error}</p>
          </body></html>`);
          cleanup();
          reject(new Error(`OAuth error: ${error}`));
          return;
        }

        if (!code || receivedState !== state) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(`<html><body style="font-family: sans-serif; text-align: center; padding: 40px;">
            <h2 style="color: #ef4444;">Invalid Callback State</h2>
            <p>State parameter mismatch or missing code.</p>
          </body></html>`);
          cleanup();
          reject(new Error("State verification failed or missing authorization code."));
          return;
        }

        // Return a clean success page to the user's browser
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>ConnectMasjid - Authorized</title>
  <style>
    body { background: #0f172a; color: #f8fafc; font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 40px; text-align: center; max-width: 400px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
    h2 { color: #38bdf8; margin-bottom: 12px; }
    p { color: #94a3b8; font-size: 15px; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <h2>✓ Authorization Successful!</h2>
    <p>ConnectMasjid MCP has been authorized. You can close this tab and return to Warp or your assistant.</p>
  </div>
</body>
</html>`);

        cleanup();

        // Exchange code for tokens
        const redirectUri = `http://127.0.0.1:${port}/callback`;
        const tokens = await exchangeCodeForTokens(normalizedBackend, code, pkce.verifier, redirectUri);
        resolve(tokens);
      } catch (err) {
        cleanup();
        reject(err);
      }
    });

    const cleanup = () => {
      clearTimeout(timer);
      server.close();
    };

    timer = setTimeout(() => {
      cleanup();
      reject(new Error("OAuth authorization timed out after 2 minutes."));
    }, timeoutMs);

    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      const redirectUri = `http://127.0.0.1:${port}/callback`;

      const authorizeUrl = new URL(`${normalizedBackend}/v3/auth/oauth/authorize`);
      authorizeUrl.searchParams.set("client_id", "cmz-mcp");
      authorizeUrl.searchParams.set("redirect_uri", redirectUri);
      authorizeUrl.searchParams.set("response_type", "code");
      authorizeUrl.searchParams.set("code_challenge", pkce.challenge);
      authorizeUrl.searchParams.set("code_challenge_method", "S256");
      authorizeUrl.searchParams.set("state", state);

      console.error(`Opening browser for ConnectMasjid authorization...`);
      openBrowser(authorizeUrl.toString());
    });

    const port = (server.address() as AddressInfo)?.port;
  });
}

/**
 * Exchanges authorization code and PKCE code_verifier for access and refresh tokens.
 */
export async function exchangeCodeForTokens(
  backendUrl: string,
  code: string,
  codeVerifier: string,
  redirectUri: string
): Promise<OAuthTokens> {
  const tokenEndpoint = `${backendUrl}/v3/auth/oauth/token`;
  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: "cmz-mcp",
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token exchange failed with HTTP ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    token_type: string;
    expires_in: number;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    tokenType: data.token_type || "Bearer",
    expiresIn: data.expires_in || 86400,
    obtainedAt: Date.now(),
  };
}

/**
 * Refreshes an expired access token using the stored refresh token.
 */
export async function refreshAccessToken(
  backendUrl: string,
  refreshToken: string
): Promise<OAuthTokens> {
  const tokenEndpoint = `${backendUrl}/v3/auth/oauth/token`;
  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token refresh failed with HTTP ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    token_type: string;
    expires_in: number;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    tokenType: data.token_type || "Bearer",
    expiresIn: data.expires_in || 86400,
    obtainedAt: Date.now(),
  };
}
