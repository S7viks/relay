# Demo script: Chat → Trace → Trust / Models

Prerequisites: Go API on 8080, TS orchestrator on 8787, `.env` with `GAIOL_TS_ORCHESTRATOR_URL` and `GAIOL_USE_TS_ORCHESTRATOR=1`, dashboard `npm run dev` on 5173. See [LOCAL-DEV-STACK.md](LOCAL-DEV-STACK.md).

1. Open `http://localhost:5173/dashboard/chat`.
2. Confirm the top bar shows a green connectivity dot (Go `/health` OK).
3. Enter a short prompt; set strategy to something other than `go_reasoning` (e.g. `balanced`). Send.
4. When the response returns, click the **trace id** link (or copy it).
5. On Trace viewer, expand **metrics_summary** and **timeline_rebuilt**.
6. Open **Trust**; refresh—trust rows appear after ABTC runs with model participation.
7. Open **Models**; search for a model id seen in the trace or trust table.

Optional: **Metrics** → pick a recent id from the chip list → **Load metrics** → link to full trace.
