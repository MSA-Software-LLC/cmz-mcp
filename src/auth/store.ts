import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { OAuthTokens, refreshAccessToken } from "./oauth.js";

const DEFAULT_AUTH_DIR = path.join(os.homedir(), ".cmz");
const DEFAULT_AUTH_FILE = path.join(DEFAULT_AUTH_DIR, "auth.json");

export function getAuthFilePath(): string {
  return process.env.CMZ_AUTH_FILE || DEFAULT_AUTH_FILE;
}

/**
 * Loads stored OAuth tokens from ~/.cmz/auth.json if present.
 */
export async function loadStoredTokens(): Promise<OAuthTokens | null> {
  const filePath = getAuthFilePath();
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const data = JSON.parse(raw) as OAuthTokens;
    if (data.accessToken) {
      return data;
    }
  } catch {
    // File not found or unparseable
  }
  return null;
}

/**
 * Saves OAuth tokens securely to ~/.cmz/auth.json.
 */
export async function saveStoredTokens(tokens: OAuthTokens): Promise<void> {
  const filePath = getAuthFilePath();
  const dir = path.dirname(filePath);

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(tokens, null, 2), {
    mode: 0o600, // Read/write only for owner
  });
}

/**
 * Deletes stored authentication credentials.
 */
export async function clearStoredTokens(): Promise<void> {
  const filePath = getAuthFilePath();
  try {
    await fs.unlink(filePath);
  } catch {
    // Ignore if already deleted
  }
}

/**
 * Retrieves a valid access token. If the current token is close to expiry
 * and a refresh token is available, it performs a silent refresh.
 */
export async function getValidAccessToken(backendUrl: string): Promise<string | null> {
  const stored = await loadStoredTokens();
  if (!stored) {
    return null;
  }

  const now = Date.now();
  const expiresAt = stored.obtainedAt + (stored.expiresIn || 86400) * 1000;
  // Refresh if less than 60 seconds remain
  const isExpiringSoon = now >= expiresAt - 60000;

  if (isExpiringSoon && stored.refreshToken) {
    try {
      console.error("Refreshing expired access token...");
      const refreshed = await refreshAccessToken(backendUrl, stored.refreshToken);
      await saveStoredTokens(refreshed);
      return refreshed.accessToken;
    } catch (err) {
      console.error("Failed to refresh token:", err);
      // Fall through to try using the current token or require re-auth
    }
  }

  return stored.accessToken;
}
