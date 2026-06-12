# AI Usage · Übersicht Widget

**English** | [简体中文](README.zh-CN.md)

<p align="center"><img src="screenshot.png" alt="AI Usage widget screenshot" width="362"></p>

A macOS desktop widget for [Übersicht](https://tracesof.net/uebersicht/) that shows your
**Claude Code** (and optionally **OpenAI Codex CLI**) usage at a glance — powered by local
CLI tools (default: [`ccusage`](https://github.com/ryoppippi/ccusage), which reads the JSONL
logs under `~/.claude`). **Everything runs locally: no network requests, no credentials.**

> Note: this shows **Claude Code / Codex CLI** usage, whose logs live on your machine.
> It is *not* the chat quota of claude.ai / chatgpt.com web apps (there is no local data for those).

## Features

- Current 5-hour window usage / limit with reset countdown
- Four-stage color-coded progress bar (green → yellow → orange → red), Bauhaus style
- Daily / weekly / monthly stats with mini progress bars
- Expandable daily bar chart (last 30 days) with per-model breakdown on hover
- Light / dark theme follows the system appearance
- Draggable card, position persisted; manual refresh button
- Shows the currently logged-in account (read from local config, read-only)

## Requirements

- [Übersicht](https://tracesof.net/uebersicht/)
- `node` / `npx` (to run ccusage)
- `python3`

## Install

1. Put the `ai-usage.widget/` folder (containing `index.jsx` and `fetch-usage.py`) into
   `~/Library/Application Support/Übersicht/widgets/`
2. Verify ccusage works on its own first:
   ```bash
   npx ccusage@latest blocks --active --json
   ```
   If it prints JSON, you are good. If `npx` is slow every time, install globally
   (`npm i -g ccusage`) and change `command` in `fetch-usage.py` to
   `["ccusage", "blocks", "--active", "--json"]`.

## Configuration (`CONFIG` at the top of `fetch-usage.py`)

- `plan`: badge text in the card's top-right corner (free text, e.g. your plan name).
- `metric`: `cost` (USD) or `tokens` (in Mtok).
- `cost_limit` / `token_limit`: progress-bar ceiling (warning line) — tune to your own feel;
  the bar shows current 5-hour-window usage / limit, and `endTime` is the window reset time
  (countdown at the bottom).
- `stats_limits`: unofficial daily / weekly / monthly reference quotas used to compute
  remaining amounts and percentages — rough estimates, adjust to your own usage.
- **Codex (ChatGPT side)**: ccusage also supports OpenAI Codex CLI local logs.
  Run `npx ccusage@latest --help` to find the Codex subcommands and fill them into
  `chatgpt.command`. Leave it empty if unused and the card shows "not configured".
- `NPX`: absolute path to `npx` (Homebrew default: `/opt/homebrew/bin/npx`). If your node
  lives elsewhere, check with `which npx` and update it.

## Use a different command

Any local command that outputs JSON works: replace `command`, set `parser` to `paths`,
and use dot-paths to tell the widget where to read values:

```python
"command": ["my-tool", "--json"],
"parser": "paths",
"paths": {"used": "data.used", "limit": "data.limit", "reset": "data.resets_at"},
"unit": "msgs",
```

## Troubleshooting

- Stuck on "loading" or the card says "command not found": Übersicht's PATH is missing
  node/npx. `index.jsx` already launches via the login shell (`/bin/zsh -lc`); if your node
  comes from nvm or similar, make sure `which npx` works in a login shell, or put an
  absolute path in `command`.
- "Command timed out": the first `npx` download is slow — wait one cycle or install
  ccusage globally.
- To inspect the script output directly:
  ```bash
  python3 ~/Library/Application\ Support/Übersicht/widgets/ai-usage.widget/fetch-usage.py
  ```

## License

[Apache-2.0](LICENSE)
