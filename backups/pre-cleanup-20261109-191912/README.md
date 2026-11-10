# WORKER HUB (Phase 1 + 2)

Mobile-first dark glassmorphism dashboard + local Node/SQLite backend, built for Termux.

## Run (Termux)
    npm install
    npm run gen-key        # creates .env with the credential-encryption key (back it up!)
    npm run build
    npm start              # http://127.0.0.1:8787

Development (two Termux sessions): `npm run dev:server` and `npm run dev:web` (http://127.0.0.1:5173).

## What is real in this phase
- SQLite database with migrations (data/worker-hub.db), 5 platform entries (names only, connectors NOT implemented).
- Platforms CRUD, API Manager (AES-256-GCM encrypted, write-only credentials), reachability check (no auth verification).
- AI provider config + real connection test (Ollama /api/tags, OpenAI-compatible /v1/models).
- Worker settings persistence. Worker status is always STOPPED: the engine is Phase 5.
- Withdrawal methods (masked data only), backups via VACUUM INTO.

## What is simulated
Everything marked DEMO (Settings > Mock mode). Never real money, never real tasks.

## Security assumptions
Single local operator; server bound to 127.0.0.1; restricted CORS; optional X-Access-Token; secrets never returned by the API and never logged;
.env is git-ignored. Do not expose the server to a network without a token and HTTPS.

## Next phase
Phase 3: read each platform's official documentation, then implement the connector interface/registry and real adapters.
