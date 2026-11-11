# CMZ MCP Server (`cmz-mcp`)

Standalone Model Context Protocol (MCP) server for ConnectMasjid (`cmz-backend`).

## Real-Time Browser Authorization (No Token Copy-Pasting Required!)

Just like Notion, Slack, and GitHub integrations, `cmz-mcp` supports **real-time OAuth 2.0 PKCE browser authorization**:

1. On first run (or when invoking `cmz_authorize`), the MCP server opens your browser to the ConnectMasjid authorization page:
   - **Production**: `https://rest.cmzapp.com`
   - **Staging**: `https://rest.staging.cmzapp.com`
2. You click **"Authorize & Connect"**.
3. The browser automatically sends the authorization code back to your local client, exchanges it for secure tokens with PKCE validation, and saves credentials in `~/.cmz/auth.json`.
4. Subsequent requests refresh automatically in the background.

*(Optional fallback: You can still manually provide `CMZ_AUTH_TOKEN` in environment variables if running in headless/CI environments).*

## Subscription Requirement

**MCP access is restricted to paid users with the Community Package (`cmz_community`).**

Each tool invocation validates the target entity's active subscription entitlements via `cmz-backend` (`entityEntitlements`). If the entity is on the free tier (`cmz_core`) or lacks an active `cmz_community` package, the tool returns:
```
SUBSCRIPTION_REQUIRED: MCP access is restricted to paid users with an active CMZ Community Package (cmz_community).
```

## Capabilities

The server provides prayer timing, schedule management, and authentication tools:

1. **`cmz_authorize`**: Launch real-time browser OAuth authentication to connect to ConnectMasjid without manually entering tokens.
2. **`cmz_logout`**: Sign out and clear stored local credentials.
3. **`get_prayer_timings`**: Query prayer timings for a specified masjid over a date range. Converts integer minutes from midnight to readable 12-hour/24-hour formats alongside raw data.
4. **`update_prayer_timings`**: Create or update prayer timings for a masjid on single or multiple days. Accepts human-readable time strings (e.g. `"05:30 AM"`, `"18:45"`) or integer minutes from midnight. Automatically synchronizes with cmz-backend (including push notifications and TV display SSE updates).
5. **`delete_prayer_timings`**: Delete prayer timings for a masjid within a date range.
6. **`get_calculation_methods`**: Fetch calculated prayer times across all supported calculation methods (ISNA, MWL, Umm al-Qura, Karachi, etc.) for a coordinate and date.
7. **`extract_timings_from_file`**: Extract structured timetables from a local timetable document or image (PDF, CSV, Excel, PNG, JPG, DOCX) via the backend AI extractor endpoint.

## Setup & Running

### 1. Build the server
```bash
npm install
npm run build
```

### 2. Configure Environment (Optional)
Copy `.env.example` to `.env`:
```env
# Choose environment: "production" (rest.cmzapp.com) or "staging" (rest.staging.cmzapp.com)
CMZ_ENV=production

# Or set explicit URL (e.g. for local dev)
# CMZ_BACKEND_URL=http://localhost:8080
```

### 3. Run Tests
```bash
npm test
```

### 4. Client Configuration

#### In Warp:
Navigate to **Settings > AI > MCP Servers** and add:
- **Name**: `cmz-mcp`
- **Command**: `node`
- **Arguments**: `/Volumes/Drive/Codes/BETA/cmz-mcp/dist/index.js`
- **Environment Variables**:
  - `CMZ_ENV`: `production` *(or `staging`)*

#### In Claude Desktop (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "cmz-mcp": {
      "command": "node",
      "args": ["/Volumes/Drive/Codes/BETA/cmz-mcp/dist/index.js"],
      "env": {
        "CMZ_ENV": "production"
      }
    }
  }
}
```
