# FLOAT — AI agent coding platform

A Cursor-style agentic IDE that runs entirely in the browser (React 19 + TypeScript + Vite + Tailwind + Zustand + Monaco).

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static bundle in dist/
```

Works offline out of the box with the **Float Demo** agent. Add a Gemini key (Integrations) for real models.

## Feature map (matches the UI)

| UI element | Implementation |
| --- | --- |
| New Chat / chat list / search / count / live "29m ago" | `components/Sidebar.tsx`, `hooks/useNow.ts` — pin, rename (double-click), delete, full-text search |
| Codebase | `components/CodebaseView.tsx` — file tree CRUD, Monaco editor + tabs, live HTML preview, terminal, search & replace, folder/zip import, zip export, GitHub commit & push, **Cmd+K inline AI edit**, **Cmd+L add selection to chat**, diff review of agent edits |
| Automations | `components/AutomationsView.tsx`, `lib/automations.ts`, `hooks/useAutomationScheduler.ts` — manual / interval / daily / on-file-change triggers, run history, Slack notify |
| Integrations | `components/IntegrationsView.tsx`, `lib/integrations.ts` — Gemini, any OpenAI-compatible API, GitHub (PAT: list repos, import, commit), Slack webhook |
| "Cloud Agents require an active session →" | `Modals.tsx › SessionModal` + `lib/sandbox.ts` — Web Worker sandbox with CommonJS/ESM loader, Jest-compatible test runner, POSIX-ish shell |
| Composer | `components/Composer.tsx` — auto-resize, Enter/Shift+Enter, `@` file mentions, `/` commands, uploads, image paste, drag & drop, stop button |
| Auto · High Fast · High | `components/ModelPicker.tsx`, `lib/models.ts › routeAuto` — Agent/Ask mode, per-model choice, reasoning effort, Max mode |
| Agent | `lib/agent/runAgent.ts` (multi-step tool loop, streaming, checkpoints), `lib/agent/tools.ts` (list/read/search/write/edit/delete/run_command), `lib/agent/providers.ts` (Gemini + OpenAI streaming with tool calls), `lib/agent/demo.ts` (offline agent) |
| Review | `lib/changes.ts`, `components/DiffView.tsx` — per-change and bulk Accept / Reject, restore checkpoint, edit & resend, retry |
| Upgrade to Pro | `Modals.tsx › UpgradeModal` — plans, yearly toggle, checkout form (swap the `pay()` body for Stripe) , usage limits enforced in `runAgent` |
| Profile (Free Plan • Light) | theme Light/Dark/System, usage meter, settings (Rules for AI), shortcuts, export/import data, sign out |
| Download the Desktop App | `Modals.tsx › DesktopModal` — OS detection, per-OS links (`DESKTOP_DOWNLOADS`), installable PWA (`public/sw.js`, manifest) |
| Cmd+K palette | `Modals.tsx › CommandPalette` — commands, chats and files |

## Production notes

- API keys live in `localStorage` (client-only). For a hosted product, proxy model calls through your backend instead.
- Point `DESKTOP_DOWNLOADS` in `src/components/Modals.tsx` at your real release artifacts.
- Replace the simulated payment in `UpgradeModal.pay()` with Stripe Checkout.
