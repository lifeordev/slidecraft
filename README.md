# SlideCraft

A desktop app (Windows & macOS) for building presentations with Claude Code.

SlideCraft checks that Claude Code is installed and authenticated, then gives you
a clean workspace per presentation. Each presentation is a real folder on disk.
Drop in your assets, describe the deck you want, and Claude builds it — every
session is primed with the context that you're making a presentation.

## How it works

- **Setup wizard** — detects the `claude` binary (resolving its absolute path,
  since GUI apps inherit a stripped `PATH`). If it's missing, it runs the
  official installer in an embedded terminal; for auth it runs
  `claude setup-token` so you sign in with your Claude **Pro/Max subscription**
  (no API key needed).
- **Projects** — each project is a folder under `Documents/SlideCraft/<name>`
  containing an `assets/` directory and a seeded `CLAUDE.md` that frames the
  session as "we're building a presentation."
- **Chat** — a custom UI over `claude`'s streaming JSON interface
  (`--print --input-format stream-json --output-format stream-json`). One
  long-lived `claude` process runs per open project; the conversation resumes
  across app restarts via the stored session id.
- **Assets** — drag files anywhere onto the chat to copy them into the
  project's `assets/` folder.
- **Terminal** — an embedded terminal (xterm + PTY) for auth/install and for
  power users who want raw `claude` access in the project folder.

## Architecture

```
src/
  shared/types.ts        Types shared across main / preload / renderer
  main/                  Electron main process
    index.ts             App lifecycle + window
    env.ts               PATH rebuild + claude binary resolution
    claude.ts            Detect / version / auth status / install command
    projects.ts          Create + list projects, copy assets, persist session id
    session.ts           One streaming `claude` process per project, ndjson parse
    terminal.ts          PTY manager (@lydell/node-pty, prebuilt N-API)
    ipc.ts               IPC handlers + event broadcasting
  preload/index.ts       contextBridge API (window.api)
  renderer/src/          React UI (setup wizard, sidebar, chat, assets, terminal)
```

The terminal uses [`@lydell/node-pty`](https://www.npmjs.com/package/@lydell/node-pty),
which ships prebuilt N-API binaries per platform — no native compilation and no
`electron-rebuild` step (N-API is ABI-stable across Node and Electron).

## Develop

```bash
npm install        # installs deps + prebuilt pty binaries (no compiler needed)
npm run dev        # launch the app with hot reload
npm run typecheck  # type-check main + renderer
```

> Requires the `claude` CLI to be installable/installed and a Claude
> subscription to sign in. The app guides you through both on first run.

## Package

```bash
npm run pack:mac   # build a macOS .dmg / .zip   (run on macOS)
npm run pack:win   # build a Windows NSIS installer (run on Windows)
npm run pack       # build for the current platform
```

Output is written to `release/`.

## Notes

- Sessions run with `--permission-mode bypassPermissions` so Claude can build the
  deck (write files, run conversions, fetch references) without interactive
  prompts. Work is confined to the project folder. Change this in
  `src/main/session.ts` if you want stricter permissions.
- Slides are authored as Marp-flavored Markdown (`slides.md`) and rendered to a
  self-contained `deck.html` on request — see the seeded `CLAUDE.md` in each
  project, which you can edit to change the house style.
- `SLIDECRAFT_SMOKE=1 electron ./out/main/index.js` runs a headless self-test
  that loads the full module/IPC graph and exits (used for CI).
