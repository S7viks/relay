# `web/` (deprecated static UI)

The browser UI now ships as a single Vite React SPA from [`dashboard/`](../dashboard/), built to `dashboard/dist/` and served by the Go server at `/` (assets at `/assets/*`).

Older HTML/CSS/JS that lived here was removed in favor of that SPA. Archived copies of the pre-React shell remain under [`archive/web-legacy/`](../archive/web-legacy/).
