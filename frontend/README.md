# Deskflow frontend

Deskflow is the React 19 and Vite 8 frontend for the repository's IT help desk
and asset management backend. The codebase intentionally uses plain JavaScript
and JSX. Styling uses Tailwind CSS 4 through its official Vite plugin and a
CSS-first semantic theme in `src/styles/tailwind.css`.

## Local setup

Requirements:

- Node.js 24 and npm.
- The backend configured and running at `http://127.0.0.1:5000`.
- MongoDB with transactions enabled, as documented in
  [`../backend/OPERATIONS.md`](../backend/OPERATIONS.md).
- `AUTH_ALLOWED_ORIGINS` on the backend must include
  `http://127.0.0.1:5173`. The checked-in backend `.env.example` already does.

Install and start the frontend:

```powershell
cd frontend
npm install
Copy-Item .env.example .env.local
npm run dev
```

The public defaults are `VITE_API_BASE_URL=/api/v1` and
`VITE_APP_NAME=Deskflow`. Only public browser configuration belongs in a
`VITE_*` variable; never add credentials, CSRF values, storage paths, or other
secrets.

Vite serves the app at `http://127.0.0.1:5173` and proxies `/api` to the
verified backend development origin, `http://127.0.0.1:5000`. With both
processes running, this read-only check should return the backend health
envelope through the proxy:

```powershell
Invoke-WebRequest http://127.0.0.1:5173/api/v1/health -UseBasicParsing
```

Production should keep the built frontend and `/api/v1` under one browser
origin. The full credentialed HTTP client is intentionally deferred to Step 4.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Vite development mode |
| `npm run lint` | Run ESLint |
| `npm test` | Run Vitest once in jsdom |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run test:e2e` | Run Playwright browser tests |
| `npm run build` | Create the production bundle |
| `npm run preview` | Preview the production bundle |

After a fresh install, run `npx playwright install chromium` once before the
browser test command.

## Development component gallery

While `npm run dev` is running, open
`http://127.0.0.1:5173/dev/components` to review the Deskflow Blue tokens,
controls, tables, states, dialogs, conflict feedback, and toasts. All gallery
records are labelled synthetic fixtures. The route is development-only and is
not registered in a production build.

## Current scope

Steps 2 and 3 supply the application bootstrap, shared query client, router
metadata, root error boundary, public environment validation, Deskflow Blue
tokens, reusable UI/feedback components, and the test harness. The root page
remains an explicitly public, non-sensitive foundation placeholder.
Authentication/permission guards, the HTTP client, the responsive application
shell, and business features remain unregistered until their roadmap steps.
