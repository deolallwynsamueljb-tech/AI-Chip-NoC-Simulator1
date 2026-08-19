# AI Workload-Aware Self-Reconfigurable Mesh NoC Simulator

A cycle-accurate Network-on-Chip (mesh router) simulator with a real Node/Express + WebSocket backend
and a React frontend. The backend owns the simulation loop and streams live state to the browser;
nothing is mocked or precomputed - benchmark charts only ever show numbers from a sweep that actually ran.

- `server/` - Express + WebSocket backend. Runs the cycle-accurate NoC engine (`server/src/engine`),
  owns the live tick loop per session, and exposes a real sweep API. Also proxies the AI assistant
  feature to Groq so the API key never reaches the browser.
- `src/` - React/Vite frontend. Renders whatever the backend sends; no local simulation state.
- `shared/types/noc.ts` - types shared by both sides.

## Run locally

**Prerequisites:** Node.js 20+

1. `npm install`
2. Copy `.env.example` to `.env` and fill in `GROQ_API_KEY` (only needed for the AI assistant panel -
   the simulator itself works without it).
3. `npm run dev` - starts the Vite dev server (`:3000`) and the backend (`:8787`) together, with
   `/api` and `/ws` proxied from the frontend to the backend.

## Build & run in production

```
npm run build   # vite build -> dist/, esbuild bundle -> server.js
npm start       # node server.js - serves the API, WebSocket, and the built frontend on one port
```

`PORT` controls which port the combined server listens on (defaults to `8787`).

## Deploying (Render)

This repo includes a `render.yaml` blueprint: a single Node web service running `npm run build` then
`npm start`. In the Render dashboard, "New +" → "Blueprint", point it at this repo, and set the
`GROQ_API_KEY` environment variable (marked `sync: false` in the blueprint so it isn't committed).
