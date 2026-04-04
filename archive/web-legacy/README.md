# Archived legacy web UI (pre–React dashboard)

This tree preserved the **HTML/JS single-page shell** that previously lived under `web/`:

- `dashboard.html` — embedded sidebar + iframe chat
- `chat.html`, `history.html`, `settings.html`, `profile.html`, `index.html`
- `js/dashboard.js`, `main.js`, `layout.js`, `page-chrome.js`, `models.js`, `history.js`, `ui.js`, `state.js`

**Replacement:** the Vite React app in `dashboard/` is built to `dashboard/dist/` and served by Go at **`/`** (see `serveUnifiedSPA` in `internal/httpserver/handlers.go`).

**Note:** the live repo no longer ships those files under `web/`; they remain only in this archive. Do not restore into `web/` without reconciling routes in `register.go`.
