# Tailr Proxy

A lightweight Go HTTP proxy that sits between the Tailr Chrome extension and external APIs (Anthropic, Tavily, YouTube). API keys live server-side only — the extension never touches them.

## Architecture

```
Chrome Extension
    │
    │  X-Team-Token: <shared-secret>
    ▼
Tailr Proxy (this server)
    ├── POST /api/proxy/anthropic/*  →  https://api.anthropic.com
    ├── POST /api/proxy/tavily/*     →  https://api.tavily.com
    └── GET  /api/proxy/youtube/*   →  https://www.googleapis.com/youtube/v3
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `TEAM_API_KEY` | Yes | Shared secret the Chrome extension sends in `X-Team-Token` |
| `ANTHROPIC_API_KEY` | Yes | Your Anthropic API key |
| `TAVILY_API_KEY` | Yes | Your Tavily API key |
| `YOUTUBE_API_KEY` | No | YouTube Data API v3 key |
| `PORT` | No | Port to listen on (default: `8080`) |
| `LOG_LEVEL` | No | Set to `debug` for verbose token/URL logging |

## Running Locally

```bash
cd proxy

export TEAM_API_KEY=your-shared-team-secret
export ANTHROPIC_API_KEY=sk-ant-...
export TAVILY_API_KEY=tvly-...
export YOUTUBE_API_KEY=AIza...

go run api.go
# Server starts on :8080
```

## Building

```bash
go build -o tailr-proxy .
./tailr-proxy
```

## Endpoints

### `POST /api/proxy/anthropic/*`
Proxies to `https://api.anthropic.com`. Full path is preserved.

```bash
curl -X POST http://localhost:8080/api/proxy/anthropic/v1/messages \
  -H "X-Team-Token: your-shared-team-secret" \
  -H "Content-Type: application/json" \
  -H "anthropic-version: 2023-06-01" \
  -d '{"model":"claude-sonnet-4-6","max_tokens":100,"messages":[{"role":"user","content":"Hello"}]}'
```

### `POST /api/proxy/tavily/*`
Proxies to `https://api.tavily.com`. Injects `api_key` into the JSON body.

```bash
curl -X POST http://localhost:8080/api/proxy/tavily/search \
  -H "X-Team-Token: your-shared-team-secret" \
  -H "Content-Type: application/json" \
  -d '{"query":"Applied Intuition 2025","max_results":5}'
```

### `GET /api/proxy/youtube/*`
Proxies to `https://www.googleapis.com/youtube/v3`. Appends the real `key` query param.

```bash
curl "http://localhost:8080/api/proxy/youtube/search?part=snippet&q=Qasar+Younis&maxResults=3&type=video" \
  -H "X-Team-Token: your-shared-team-secret"
```

### `GET /health`
Returns `{"status":"ok"}`. No auth required.

---

## Updating the Chrome Extension

After deploying this proxy, update `chrome-extension/popup.js` to route all API calls through the proxy instead of calling external APIs directly.

### 1. Set your backend URL and team token

At the top of `popup.js`, replace the direct API calls with the proxy base URL. The team token should be stored in `chrome.storage.local` alongside the existing keys — add a field for it in `options.html`.

**In `options.html`**, add a new field:
```html
<div class="field">
  <label>Team Token</label>
  <input type="password" id="team-token" placeholder="your-shared-team-secret" />
  <div class="hint">Provided by your team admin. Required to use the proxy.</div>
</div>
```

**In `options.js`**, save and load `teamToken` alongside the existing keys:
```js
chrome.storage.local.get(['anthropicKey', 'tavilyKey', 'youtubeKey', 'teamToken'], ...)
chrome.storage.local.set({ anthropicKey, tavilyKey, youtubeKey, teamToken }, ...)
```

### 2. Replace the `callClaude` function in `popup.js`

**Before (direct):**
```js
async function callClaude({ system, user, maxTokens = 512 }) {
  const keys = await getKeys();
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    headers: {
      'x-api-key': keys.anthropicKey,
      'anthropic-dangerous-direct-browser-access': 'true',
      ...
    },
    ...
  });
}
```

**After (via proxy):**
```js
const PROXY_BASE = 'https://your-proxy.fly.dev'; // your deployed URL

async function callClaude({ system, user, maxTokens = 512 }) {
  const keys = await getKeys();
  const res = await fetch(`${PROXY_BASE}/api/proxy/anthropic/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'X-Team-Token': keys.teamToken,    // ← replaces x-api-key
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  ...
}
```

### 3. Replace the `tavilySearch` function

```js
async function tavilySearch(query) {
  const keys = await getKeys();
  const res = await fetch(`${PROXY_BASE}/api/proxy/tavily/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Team-Token': keys.teamToken,    // ← replaces api_key in body
    },
    body: JSON.stringify({ query, max_results: 5, search_depth: 'basic' }),
    // Note: do NOT include api_key — the proxy injects it server-side
  });
  ...
}
```

### 4. Replace the `youtubeSearch` function

```js
async function youtubeSearch(query) {
  const keys = await getKeys();
  const params = new URLSearchParams({
    part: 'snippet', q: query, maxResults: '3', type: 'video',
    // Note: do NOT include key= — the proxy injects it server-side
  });
  const res = await fetch(`${PROXY_BASE}/api/proxy/youtube/search?${params}`, {
    headers: { 'X-Team-Token': keys.teamToken },
  });
  ...
}
```

### 5. Remove API key fields from `options.html`

Once everyone is on the proxy, the `anthropicKey`, `tavilyKey`, and `youtubeKey` fields in the options page are no longer needed. Only `teamToken` (the shared secret) needs to be stored per-user.

### 6. Update `manifest.json` host permissions

Remove the direct API origins and add only your proxy domain:

```json
"host_permissions": [
  "https://www.linkedin.com/*",
  "https://your-proxy.fly.dev/*"
]
```

---

## Deploying

### Fly.io (recommended — free tier available)

```bash
cd proxy
fly launch          # creates fly.toml
fly secrets set TEAM_API_KEY=... ANTHROPIC_API_KEY=... TAVILY_API_KEY=... YOUTUBE_API_KEY=...
fly deploy
```

### Railway / Render

Set the environment variables in the dashboard and point the build command to `go build -o server . && ./server`.

### Docker

```dockerfile
FROM golang:1.22-alpine AS build
WORKDIR /app
COPY . .
RUN go build -o proxy .

FROM alpine:latest
COPY --from=build /app/proxy /proxy
EXPOSE 8080
CMD ["/proxy"]
```
