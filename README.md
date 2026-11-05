# CMZ MCP Server (`cmz-mcp`)

Standalone Model Context Protocol (MCP) server for ConnectMasjid (`cmz-backend`).

## Capabilities

The server currently provides prayer timing and schedule tools via MCP:

1. **`get_prayer_timings`**: Query prayer timings for a specified masjid over a date range. Converts integer minutes from midnight to readable 12-hour/24-hour formats alongside raw data.
2. **`update_prayer_timings`**: Create or update prayer timings for a masjid on single or multiple days. Accepts human-readable time strings (e.g. `"05:30 AM"`, `"18:45"`) or integer minutes from midnight. Automatically synchronizes with cmz-backend (including push notifications and TV display SSE updates).
3. **`delete_prayer_timings`**: Delete prayer timings for a masjid within a date range.
4. **`get_calculation_methods`**: Fetch calculated prayer times across all supported calculation methods (ISNA, MWL, Umm al-Qura, Karachi, etc.) for a coordinate and date.
5. **`extract_timings_from_file`**: Extract structured timetables from a local timetable document or image (PDF, CSV, Excel, PNG, JPG, DOCX) via the backend AI extractor endpoint.

## Setup & Running

### 1. Build the server
```bash
npm install
npm run build
```

### 2. Configure Environment
Copy `.env.example` to `.env`:
```env
CMZ_BACKEND_URL=http://localhost:8080
CMZ_AUTH_TOKEN=your_jwt_auth_token_here
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
  - `CMZ_BACKEND_URL`: `http://localhost:8080`
  - `CMZ_AUTH_TOKEN`: `<your-bearer-token>`

#### In Claude Desktop (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "cmz-mcp": {
      "command": "node",
      "args": ["/Volumes/Drive/Codes/BETA/cmz-mcp/dist/index.js"],
      "env": {
        "CMZ_BACKEND_URL": "http://localhost:8080",
        "CMZ_AUTH_TOKEN": "your_jwt_auth_token_here"
      }
    }
  }
}
```
