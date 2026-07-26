# Jiaming · Chinese Baby Names

Jiaming is a local-first Chinese baby-naming application with traceable literary sources. It combines an interlinked wiki, original corpus files, and a read-only Codex Agent that verifies quotations by finding, grepping, and reading local knowledge files before suggesting names.

## Highlights

- Chinese surnames, one- or two-character given names, literary preferences, exclusions, favorites, and export.
- A local wiki plus classical Chinese corpora.
- A file-native knowledge interface based on `rg`, `grep`, `find`, and OS-native read commands; no MCP server or custom query wrapper.
- Two configurations on the same Codex Agent runtime:
  - Codex subscription through a logged-in Codex CLI; no API key required.
  - A third-party OpenAI Responses-compatible provider configured through Codex CLI.
- Windows and macOS launchers.
- No third-party runtime packages; Node.js 22.13+ is required.

## Requirements

- Git for cloning and updates.
- Node.js 22.13 or newer.
- The latest Codex CLI in both subscription and third-party modes.
- A ChatGPT/Codex login for subscription mode, or a Responses-compatible endpoint with tool calling and structured outputs for third-party mode.

Clone and check the environment:

```bash
git clone https://github.com/hanjf12/JiaMing.git
cd JiaMing
npm install -g @openai/codex@latest
codex login
npm run doctor
```

The application itself has no npm dependencies, so `npm install` is not required. Codex CLI is a user-level Agent runtime and should be installed globally. See the [complete Chinese installation guide](docs/installation.zh-CN.md) and the official [Codex CLI](https://developers.openai.com/codex/cli) and [authentication](https://developers.openai.com/codex/auth) documentation.

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

The repository does not redistribute large upstream corpora. Run `npm run corpus:sync` to fetch supported public sources; the Agent searches those source files directly. If the Agent is unavailable, the application reports the error instead of generating a fallback answer. Do not add copyrighted modern texts unless you have the right to use them.

The Agent starts from `knowledge/llms.txt`, searches the Markdown wiki, and verifies exact quotations in the sharded upstream JSON files. See the [file knowledge guide](knowledge/README.md) and [design research](docs/file-native-llm-wiki.zh-CN.md).

## Development

```bash
npm test
npm run wiki:lint
npm run check
```

Code is licensed under the [MIT License](LICENSE). Corpus content retains its upstream license or rights status; see [NOTICE.md](NOTICE.md).
