# Archived legacy web UI (pre–React dashboard)

This tree preserved the **HTML/JS single-page shell** that previously lived under `web/`:

- `dashboard.html` — embedded sidebar + iframe chat
- `chat.html`, `history.html`, `settings.html`, `profile.html`, `index.html`
- `js/dashboard.js`, `main.js`, `layout.js`, `page-chrome.js`, `models.js`, `history.js`, `ui.js`, `state.js`

**Replacement:** the Vite React app in `dashboard/` is built to `dashboard/dist/` and served by Go at `/dashboard/` (see `serveReactDashboardSPA` in `internal/httpserver/handlers.go`).

**Still active under `web/`:** landing, auth pages (`login`, `signup`, `reset-password`, `terms`), `reasoning.html` + `reasoning-bundle.js`, shared `css/styles.css`, and slim auth scripts (`api.js`, `auth.js`, `auth-shim.js`, `utils.js`, `gaiol-api-config.js`).

Do not restore these files into `web/` without reconciling routes in `register.go`.
