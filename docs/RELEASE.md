# Private pilot release

Use Node 24, `npm ci`, copy `.env.example` to `.env`, and `npm run dev`.
Example mode uses fixed fictional ideas, scores, and an interactive checklist. It makes no provider calls. Run `npm test` and `npm run build` before release.

For live generation set IDEA_LAB_DEMO=0, a random access key of at least 24 characters, and ANTHROPIC_API_KEY. Set APP_ORIGIN to the exact frontend origin. Keep keys on the server. Production requires HTTPS; serve the built frontend and proxy `/api` to the loopback API on the same origin. Bind publicly only behind an authenticated, TLS reverse proxy. This is a shared private pilot, not individual user/tenant authorization.

Keep IDEA_LAB_DATABASE on durable local disk, with one deployment sharing the database. Reservations are atomic and survive restarts: 20 calls/hour per connecting IP, 200/day overall; failed/abandoned calls still consume reservations. Multiple independent instances would each have a budget and are unsupported. Forwarded client IP headers are not trusted: a proxy shares one conservative IP budget. Back up the database while stopped and test restoration before customer use. Access-key rotation invalidates sessions. Do not expose this shared-key pilot as a public subscription service.

Generated previews use an opaque-origin sandbox, without forms, popups or top navigation privileges. A prepended CSP blocks fetch/connections and external resource loads. A generated document can still navigate its own frame; this is not a guarantee that arbitrary HTML cannot cause network traffic. Treat exports as untrusted artifacts and review before opening independently. Exported JSON does not auto-run HTML.

Session/index updates use one IndexedDB transaction, retain 25 sessions, and read old localStorage records for compatibility. Storage failures are visible. Sessions remain browser-local; exports are the backup path. A new brainstorm receives a fresh ID, and history/reset/build actions are guarded while a run is active. Rankings reject unknown/duplicate/missing IDs. Timeout/truncation errors do not retry paid calls automatically.

Demo rehearsal: brainstorm, compare ranks, build the winner, add/remove a task, export, start another brainstorm, reopen the earlier session. Rehearse failure with the API stopped and with browser storage disabled. Before a paid offer, add per-user durable storage and identity-based budgets, measure cost/completion and repeat use, and validate demand with a narrow founder-assisted pilot.

Rollback: stop server, restore previous release and quota database together. Preserve browser exports; older code cannot read new IndexedDB history.
