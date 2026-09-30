# Idea Lab

A four-agent brainstorming desk: **Scout** and **Strategist** pitch software/app
ideas for any sector (or a topic you give them), **Skeptic** ranks them by
build-worthiness, and **Architect** builds a small working prototype of
whichever idea you pick. Sessions autosave in the browser so you can revisit
and keep building on past topics.

## Project layout

```
idea-lab/
├── src/
│   ├── App.jsx          # all four-agent UI + orchestration logic
│   ├── main.jsx         # React entry point
│   ├── index.css        # page background
│   └── lib/
│       ├── callAgent.js # client -> local proxy -> Anthropic API
│       └── storage.js   # localStorage-backed session persistence
├── server/
│   └── index.js         # Express proxy holding the API key server-side
├── index.html
├── vite.config.js
└── package.json
```

Why a server at all? Calling the Anthropic API straight from the browser
means shipping your API key to every visitor. `server/index.js` is a small
Express proxy that keeps `ANTHROPIC_API_KEY` server-side; the browser only
ever talks to `/api/agent` on localhost, which Vite proxies through to the
Express server on port 3001.

## Setup

```bash
npm install
cp .env.example .env     # then add your real ANTHROPIC_API_KEY
npm run dev               # runs the Vite dev server (5173) + Express proxy (3001) together
```

Open http://localhost:5173.

## Extending this with Claude Code

This is meant to be a starting scaffold, not a finished product. Things worth
asking Claude Code to do next:

- **Swap `localStorage` for a real backend.** `src/lib/storage.js` is the only
  place persistence lives — point it at SQLite/Postgres/a JSON file via the
  Express server instead, and sessions survive across browsers/devices.
- **Add more agents or change the pipeline.** Each agent is just a
  `system` prompt + JSON schema in `App.jsx` (`runBrainstorm`, `runBuild`).
  A "Designer" agent that critiques the Architect's prototype, or a second
  build pass that iterates on feedback, would slot in the same way.
- **Raise the prototype's token budget further.** The Architect's build call
  requests 4000 tokens (`callAgent.js` defaults to 1500 for the other
  agents); `server/index.js` has no ceiling of its own, so bump the number
  passed from `App.jsx` if a prototype is still getting cut off.
- **Deploy it.** `npm run build` produces a static `dist/` for the frontend;
  the Express proxy needs to run somewhere too (a small Node host, a
  serverless function, etc.) — anywhere that can keep the API key secret.

## Notes

- Model used server-side: `claude-sonnet-4-6`.
- The Architect's prototypes are self-contained HTML/CSS/JS (no external
  dependencies), rendered in a sandboxed `<iframe>` in the Preview tab, with
  a raw source view in the Code tab.

## Demo and private pilot release

See [docs/RELEASE.md](docs/RELEASE.md) for the current setup and release limits. Node 24 is required. Default example mode makes no paid calls. Live mode requires the server-side provider key **and** a private-pilot access key; all POST requests require the configured exact origin. Generated previews no longer receive same-origin permission. Sessions are browser-local; export important results.
