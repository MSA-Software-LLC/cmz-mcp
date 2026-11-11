import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { AddressInfo } from "node:net";

import {
  generatePKCE,
  exchangeCodeForTokens,
  refreshAccessToken,
} from "./oauth.js";
import {
  saveStoredTokens,
  loadStoredTokens,
  getValidAccessToken,
  clearStoredTokens,
} from "./store.js";

test("PKCE Generation", () => {
  const pkce = generatePKCE();

  assert.ok(pkce.verifier.length >= 43);
  assert.ok(pkce.challenge.length >= 43);

  // Verify challenge is Base64URL(SHA256(verifier))
  const expectedChallenge = crypto
    .createHash("sha256")
    .update(pkce.verifier)
    .digest("base64url");

  assert.strictEqual(pkce.challenge, expectedChallenge);
});

test("Token Storage and Expiration Handling", async () => {
  const testDir = path.join(os.tmpdir(), `cmz-test-auth-${Date.now()}`);
  const testFile = path.join(testDir, "auth.json");
  process.env.CMZ_AUTH_FILE = testFile;

  try {
    // 1. Initial state: no tokens
    const empty = await loadStoredTokens();
    assert.strictEqual(empty, null);

    // 2. Save tokens
    const initialTokens = {
      accessToken: "access-token-123",
      refreshToken: "refresh-token-456",
      tokenType: "Bearer",
      expiresIn: 3600,
      obtainedAt: Date.now(),
    };
    await saveStoredTokens(initialTokens);

    const loaded = await loadStoredTokens();
    assert.ok(loaded);
    assert.strictEqual(loaded.accessToken, "access-token-123");
    assert.strictEqual(loaded.refreshToken, "refresh-token-456");

    // 3. Valid access token returned without refresh
    const valid = await getValidAccessToken("http://mock-backend");
    assert.strictEqual(valid, "access-token-123");

    // 4. Clear tokens
    await clearStoredTokens();
    const afterClear = await loadStoredTokens();
    assert.strictEqual(afterClear, null);
  } finally {
    delete process.env.CMZ_AUTH_FILE;
    await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("OAuth Token Exchange and Refresh over HTTP", async () => {
  const testState = {
    receivedExchangeBody: null as { code?: string; code_verifier?: string; grant_type?: string } | null,
    receivedRefreshBody: null as { grant_type?: string; refresh_token?: string } | null,
  };

  const mockServer = http.createServer(async (req, res) => {
    let bodyText = "";
    for await (const chunk of req) {
      bodyText += chunk;
    }

    if (req.url === "/v3/auth/oauth/token") {
      const parsed = JSON.parse(bodyText);
      if (parsed.grant_type === "authorization_code") {
        testState.receivedExchangeBody = parsed;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            access_token: "new-access-token-abc",
            refresh_token: "new-refresh-token-xyz",
            token_type: "Bearer",
            expires_in: 3600,
          })
        );
        return;
      }

      if (parsed.grant_type === "refresh_token") {
        testState.receivedRefreshBody = parsed;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            access_token: "refreshed-access-token-999",
            refresh_token: "refreshed-refresh-token-999",
            token_type: "Bearer",
            expires_in: 3600,
          })
        );
        return;
      }
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const port = (mockServer.address() as AddressInfo).port;
  const mockUrl = `http://127.0.0.1:${port}`;

  try {
    // Test code exchange
    const tokens = await exchangeCodeForTokens(
      mockUrl,
      "auth-code-123",
      "verifier-secret-abc",
      "http://127.0.0.1:3000/callback"
    );

    assert.strictEqual(tokens.accessToken, "new-access-token-abc");
    assert.strictEqual(tokens.refreshToken, "new-refresh-token-xyz");
    assert.strictEqual(testState.receivedExchangeBody?.code, "auth-code-123");
    assert.strictEqual(testState.receivedExchangeBody?.code_verifier, "verifier-secret-abc");

    // Test token refresh
    const refreshed = await refreshAccessToken(mockUrl, "refresh-token-xyz");
    assert.strictEqual(refreshed.accessToken, "refreshed-access-token-999");
    assert.strictEqual(testState.receivedRefreshBody?.grant_type, "refresh_token");
    assert.strictEqual(testState.receivedRefreshBody?.refresh_token, "refresh-token-xyz");
  } finally {
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  }
});
