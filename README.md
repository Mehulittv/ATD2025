# ATD Sonata - Fusion Starter

A production-ready full-stack React (Vite) + Express template. Single dev server powers both client and API.

## Prerequisites

- Node.js 18+ (recommended 18.18+ or 20+)
- pnpm (https://pnpm.io/installation)

## Install

```bash
pnpm install
```

## Development (hot reload)

```bash
pnpm dev
```

- App runs at: http://localhost:8080/
- API routes are mounted under /api (e.g., GET /api/ping)

## Build

```bash
pnpm build
```

- Client build outputs to dist/spa
- Server build outputs to dist/server

## Production Run

```bash
pnpm start
```

- Starts the compiled Express server (serves client and API)

## Tests

```bash
pnpm test
```

## TypeCheck

```bash
pnpm typecheck
```

## Useful Notes

- File uploads are stored under server/uploads (monthly Excel files)
- Temporary media URLs for WhatsApp are served under /i/:id(.ext) with TTL

### Optional Environment Variables

- MEDIA_SIGN_KEY: HMAC key for temp media links (default: dev-secret)
- MEDIA_URL_TTL_MS: Expiration for temp links (default: 300000)
- MEDIA_PUBLIC_BASE: Override host used in generated URLs (e.g., https://your-domain.com)

## Project Structure (high level)

```
client/         React SPA (pages, components, hooks)
server/         Express API (routes, uploads, temp media)
shared/         Shared TypeScript types
```
