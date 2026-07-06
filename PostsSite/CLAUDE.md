# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

PostsSite is a small learning project: a posts/blog feed with a **plain Node.js (`node:http`) backend and no web framework**, and a **React (Vite) frontend**. It is split into two independent Node services that talk to each other over HTTP.

## Architecture

Two separate npm packages, each with its own `package.json` and run independently:

- **`Server/`** — backend API, listens on **port 3000**.
  - `server.js` routes `GET /` and `POST /` to handlers in `routes/posts.js`; everything else is 404. All request handling is wrapped in try/catch → 500. On startup it `await`s `db/init.js` `initDb()` before `listen`, and `process.exit(1)`s if the database is unreachable.
  - `data/store.js` is the persistence layer, backed by **PostgreSQL** (via the `pg` `Pool` in `db/pool.js`). `readPosts()` runs `SELECT ... ORDER BY id`; `addPost()` runs a parameterized `INSERT ... RETURNING` (so `id` comes from the `SERIAL` column, and only `title`/`author`/`content` are persisted — unknown client fields are dropped). Both keep the same async signatures the routes already call.
  - `db/pool.js` builds the connection `Pool` entirely from env vars: `DATABASE_URL` if set, else the standard `PGHOST`/`PGPORT`/`PGUSER`/`PGPASSWORD`/`PGDATABASE`. SSL is enabled when `PGSSLMODE=require` (or `DB_SSL=true`) — off locally, on for Amazon RDS — so moving to RDS is a `.env` change, not a code change.
  - `db/init.js` `initDb()` runs `CREATE TABLE IF NOT EXISTS posts (...)` then seeds the table from `data/posts.json` **only when it is empty** (the seed rows carry no `id` — the `SERIAL` column assigns them in array order, keeping the sequence in sync). It is idempotent, so restarts don't re-seed. `data/posts.json` is now just seed data, not the live store.
  - `sendResponse(res, data, statusCode, contentType)` is the shared response helper used everywhere.

- **`Frontend/`** — a **Vite React app** plus a Node **static server + reverse proxy** on **port 8000** (same origin for both), so the UI and data API share one origin. The migration deliberately kept this proxy architecture (see "Does the architecture change?" below).
  - `server.js` maps `GET /api/posts` and `POST /api/posts` to `routes/proxy.js` (the GET handler is exported as `getPost`, singular), which forwards to the backend at `localhost:3000/`. Backend responses are streamed straight back with `.pipe()`. Backend connection failures return **502**; bad client requests return **400**.
  - Every other `GET` falls through to `routes/static.js` (`serveStatic`), which serves the **Vite build output from `dist/`** (run `npm run build` first): `/` → `index.html`, a small extension→content-type map (note `.js` → `text/javascript`), a path-traversal guard (→ 403), and 404 for missing files. Non-GET requests to unknown URLs are 404. There is no SPA fallback (single page, no client-side router yet).
  - `Frontend/` itself is the Vite project root: root `index.html` (Vite entry), `src/` (React), `public/` (static assets copied verbatim, e.g. the avatar image), `dist/` (build output, gitignored). `server.js` and `routes/` are the **production** static+proxy server.

The two services communicate only via HTTP. In **prod**, the Node server (8000) serves `dist/` and proxies `/api/posts` → backend (3000). In **dev**, Vite's dev server (port 5173) runs the app with HMR and its own `server.proxy` forwards `/api/posts` → backend, rewritten to `/` (`vite.config.js`) — mirroring `routes/proxy.js`, so the Node server is not used in dev. Either way everything is same-origin, so **no CORS headers are needed**.

### React app (`Frontend/src/`)

Function components + hooks (JSX, **no TypeScript**), entry `src/main.jsx` → `<App/>`:

- `api.js` — `getPosts()` and `createPost(post)` (ported unchanged from the old vanilla UI). Both `fetch` `API_BASE + /api/posts` and throw on non-2xx. `API_BASE` is `''` (relative) — same-origin in both dev (Vite proxy) and prod (Node proxy).
- `App.jsx` — owns `posts` state; `useEffect` loads via `getPosts()` on mount; renders `<PostForm>` + `<PostList>`. On create it calls `createPost()` and **prepends** the saved post (server-assigned `id`) so the newest shows on top.
- `components/PostForm.jsx` — controlled create-post form (title/author/content); disables the submit button while awaiting and clears on success.
- `components/PostList.jsx` — the `.posts` masonry container; maps posts to `<PostCard key={post.id}>`.
- `components/PostCard.jsx` — card markup with a local `expanded` state (`useState`) driving Show More/Show Less; uses React `{...}` text nodes (no `innerHTML`).

Styling is **scoped CSS Modules** per component (`*.module.css`, e.g. `Card.module.css`), plus a global `src/index.css` (reset + body font). Posts render in stored order (oldest first); newly created posts are prepended (newest on top). Cards use a CSS multi-column masonry layout.

### Does the architecture change? — No (by design)

The same-origin static-server + reverse-proxy model is exactly what an SPA wants, so it stays. Deployment (an EC2 instance) is unchanged except it gains a `npm run build` step before `npm start`. A future task is to optionally replace the Node static+proxy server with **Nginx** (serve `dist/`, `proxy_pass /api` → backend).

## Commands

Each service is run from its own directory. The backend needs a running PostgreSQL and a `Server/.env` first — copy `Server/.env.example` to `Server/.env`, fill in credentials, and create the database once (`createdb postssite`). The npm scripts load `.env` via Node's native `--env-file` (Node ≥ 20.6). On first boot the table is auto-created and seeded from `data/posts.json`.

```bash
# Backend (port 3000) — needs PostgreSQL + Server/.env
cd Server && npm install
npm run dev      # nodemon --env-file=.env, auto-reload
npm start        # node --env-file=.env server.js

# Frontend — start the backend first
cd Frontend && npm install
npm run dev      # Vite dev server + HMR on port 5173 (proxies /api/posts → backend)
# — or, to run the production build the way it deploys: —
npm run build    # Vite build → dist/
npm start        # node server.js — serves dist/ + proxies on port 8000
```

For day-to-day UI work, run the backend + `npm run dev` and open Vite's URL (**http://localhost:5173**); Vite proxies data calls to the backend. To exercise the deployed setup, `npm run build` then `npm start` and open **http://localhost:8000** (the Node server serves `dist/` and proxies). The backend has **no test suite or linter** and `node` runs its source directly (`"type": "module"`, native ESM); the Frontend now has a Vite **build step** (JSX → bundled assets).

### Manual API checks

```bash
# Backend directly
curl localhost:3000/
curl -X POST localhost:3000/ -H 'Content-Type: application/json' \
  -d '{"title":"T","author":"A","content":"..."}'

# Through the Frontend proxy
curl localhost:8000/api/posts
curl -X POST localhost:8000/api/posts -H 'Content-Type: application/json' \
  -d '{"title":"T","author":"A","content":"..."}'
```

## Conventions

- ESM only (`import`/`export`, `node:` prefixed builtins). The **Server** has no transpilation (`node` runs the source). The **Frontend** is a Vite React app (JSX, transpiled/bundled by Vite); its Node static+proxy server (`server.js`, `routes/`) is plain ESM with no build.
- Server: `pg` is the only runtime dependency, plus `nodemon` (dev); config comes from env vars (`.env`, loaded via `--env-file` — no `dotenv`). Keep the backend dependency-light. Frontend deps are `react`/`react-dom` (runtime) and `vite`/`@vitejs/plugin-react` (dev), as expected for a Vite app.
- Both Node services log every request as `[ISO timestamp] METHOD url`.
