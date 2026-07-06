# PostsSite

A small posts/blog feed with a **plain Node.js (`node:http`) backend and no web
framework**, and a **React (Vite) frontend**. It's a learning project focused on
understanding how a front end, a proxy/static server, and a data API fit
together — keeping the backend framework-free and dependency-light while using a
mainstream toolchain (Vite/React) for the UI.

## Architecture

The app is split into two independent Node services that talk to each other
only over HTTP. Each has its own `package.json` and is run separately.

```
# Production
Browser  ──HTTP──►  Frontend (:8000)  ──HTTP──►  Server (:3000)  ──►  PostgreSQL
            serves dist/ + reverse proxy          data API

# Development
Browser  ──HTTP──►  Vite dev server (:5173)  ──proxy──►  Server (:3000)  ──►  PostgreSQL
            React app + HMR                             data API
```

In production the Node Frontend serves the built React app (`dist/`) and proxies
data calls to the backend. In development you run Vite instead (HMR), and Vite's
own dev proxy forwards data calls to the backend. Either way the UI and API are
same origin, so **no CORS is needed**.

### `Server/` — backend API (port 3000)

- `server.js` routes `GET /` and `POST /` to handlers in `routes/posts.js`;
  anything else is a 404. All request handling is wrapped in try/catch → 500.
  On startup it initializes the database (`db/init.js`) before listening and
  exits if the DB is unreachable.
- `data/store.js` is the persistence layer, backed by **PostgreSQL** through the
  `pg` pool in `db/pool.js`. `readPosts` runs `SELECT ... ORDER BY id`; `addPost`
  runs a parameterized `INSERT ... RETURNING`, so the `id` comes from a `SERIAL`
  column and only `title`/`author`/`content` are stored.
- `db/pool.js` reads all connection config from env vars (`DATABASE_URL`, or the
  standard `PG*` vars), with optional SSL — so the same code runs against local
  Postgres and Amazon RDS. `db/init.js` creates the `posts` table if needed and
  seeds it from `data/posts.json` once, only when the table is empty.

### `Frontend/` — React app + reverse proxy (port 8000)

`Frontend/` is a **Vite React app** (JSX, no TypeScript) together with a Node
**static server + reverse proxy** used in production:

- `server.js` proxies `GET`/`POST /api/posts` to the backend at `localhost:3000/`
  via `routes/proxy.js`, streaming responses straight back. A backend that's down
  returns **502**; a bad client request returns **400**.
- Every other `GET` is served by `routes/static.js` from the **Vite build
  output (`dist/`)** (`/` → `index.html`, an extension→content-type map, a
  path-traversal guard, and 404 for missing files).
- `vite.config.js` — in development, Vite's dev server (port 5173) runs the app
  with HMR and its own proxy forwards `/api/posts` to the backend, so the Node
  server isn't used while developing.

### React app (`Frontend/src/`)

Function components + hooks, entry `src/main.jsx` → `<App/>`:

- `api.js` — `getPosts()` and `createPost(post)` against `/api/posts`
  (relative, same-origin in both dev and prod).
- `App.jsx` — holds `posts` state, loads them on mount, and prepends newly
  created posts (newest on top).
- `components/` — `PostForm` (controlled create-post form), `PostList` (masonry
  container), `PostCard` (a card with a local expand/collapse state). Text is
  rendered as React nodes, never `innerHTML`.
- Styling is **scoped CSS Modules** per component, plus a global `src/index.css`.

## Running it

Run each service from its own directory. **Start the backend first** in both
environments.

### One-time setup

The backend needs a running **PostgreSQL** and a `Server/.env`:

```bash
cd Server
cp .env.example .env      # then fill in your credentials
createdb postssite        # create the database
npm install               # backend deps

cd ../Frontend && npm install   # frontend deps
```

The table is created and seeded automatically on the backend's first boot.

### Development (with HMR)

Vite serves the React app with hot-reload and proxies data calls to the backend.

```bash
# Terminal 1 — Backend (port 3000)
cd Server && npm run dev        # nodemon --env-file=.env (auto-reload)

# Terminal 2 — Frontend (Vite dev server, port 5173)
cd Frontend && npm run dev      # vite + HMR
```

Then open **http://localhost:5173**.

### Production (the way it deploys)

Build the React app, then run the Node Frontend server, which serves the build
(`dist/`) and proxies data calls — everything on one origin.

```bash
# Terminal 1 — Backend (port 3000)
cd Server && npm start          # node --env-file=.env server.js

# Terminal 2 — Frontend (port 8000)
cd Frontend
npm run build                   # vite build → dist/
npm start                       # node server.js — serves dist/ + proxy
```

Then open **http://localhost:8000**. (Redeploying after a UI change means
re-running `npm run build`.)

### Manual API checks

```bash
# Backend directly
curl localhost:3000/
curl -X POST localhost:3000/ -H 'Content-Type: application/json' \
  -d '{"title":"T","author":"A","content":"..."}'

# Through the Frontend proxy (use :8000 in prod, :5173 in dev)
curl localhost:8000/api/posts
curl -X POST localhost:8000/api/posts -H 'Content-Type: application/json' \
  -d '{"title":"T","author":"A","content":"..."}'
```

## Current status

Working end to end:

- ✅ Backend API: list and create posts, persisted in **PostgreSQL**.
- ✅ **React (Vite) frontend** with a create-post form and expand/collapse cards.
- ✅ Reverse proxy from the Frontend to the backend — the whole app runs from a
  single origin (port 8000 in prod, Vite's dev proxy in dev), so **no CORS**.
- ✅ UI renders posts from the API and can create new ones (newest on top).
- ✅ DB config is env-driven and RDS-ready (local → Amazon RDS is a `.env` change).

It's a learning project: the **backend** has no test suite or linter and `node`
runs its source directly (ESM, `"type": "module"`), with `pg` as the only runtime
dependency. The **frontend** uses the standard Vite build step (JSX → bundled
assets).

## History

The frontend started as a **vanilla-JS app** — hand-written ES modules under
`Frontend/public/app/` that built the DOM imperatively (`document.createElement`,
`textContent`) and were served as static files, with no build step. It was
migrated to **React (Vite)** to practice a mainstream frontend toolchain; the
same-origin static-server + reverse-proxy architecture was deliberately kept, so
the migration only added a build step (`npm run build`) to the deployment. See
the `feat(Frontend): rebuild UI as a React app (Vite)` commit in the git history.

## Conventions

- ESM only (`import`/`export`, `node:`-prefixed builtins). The backend has no
  transpilation; the frontend is a Vite React app (JSX, bundled by Vite).
- Backend kept dependency-light on purpose: `pg` is the only runtime dependency,
  and config is loaded from `.env` via Node's native `--env-file` (no `dotenv`).
  Frontend deps are `react`/`react-dom` + `vite` (as expected for a Vite app).
- Both Node services log every request as `[ISO timestamp] METHOD url`.
