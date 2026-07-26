# Jiaming · Chinese Baby Names

Jiaming is a local-first Chinese baby-naming application with traceable literary sources. It combines an interlinked wiki, a full-text corpus index, and a read-only Codex Agent that verifies quotations through a local shell CLI before suggesting names.

## Highlights

- Chinese surnames, one- or two-character given names, literary preferences, exclusions, favorites, and export.
- A local wiki plus classical Chinese corpora.
- One shell-only knowledge interface: `node scripts/knowledge.mjs ...`; no MCP server.
- Two configurations on the same Codex Agent runtime:
  - Codex subscription through a logged-in Codex CLI; no API key required.
  - A third-party OpenAI Responses-compatible provider configured through Codex CLI.
- Windows and macOS launchers.
- No third-party runtime packages; Node.js 22.13+ is required.

## Run

On Windows, double-click `start-windows.bat`. On macOS:

```bash
chmod +x start-macos.command
./start-macos.command
```

Or run:

```bash
node src/server.mjs
```

Open <http://127.0.0.1:4318/>.

Copy `config.example.json` to `config.local.json` and `.env.example` to `.env`, then select either `codex` or `third-party`. Both modes require Codex CLI; third-party endpoints must implement the Responses API and tool calling. See the [Chinese configuration guide](docs/configuration.zh-CN.md) for all options.

The repository does not redistribute large upstream corpora or generated SQLite files. Run `npm run corpus:sync` to fetch supported public sources and build a local index. Do not add copyrighted modern texts unless you have the right to use them.

## Development

```bash
npm test
npm run wiki:lint
npm run check
```

Code is licensed under the [MIT License](LICENSE). Corpus content retains its upstream license or rights status; see [NOTICE.md](NOTICE.md).
