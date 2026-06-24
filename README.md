# Athena Code

**Athena Code is an open-source terminal AI coding agent with persistent memory,
automatic context recall, and searchable history across coding sessions.**

[![CI](https://github.com/luckeyfaraday/athena-code/actions/workflows/ci.yml/badge.svg)](https://github.com/luckeyfaraday/athena-code/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/luckeyfaraday/athena-code)](https://github.com/luckeyfaraday/athena-code/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platforms: Linux, macOS, Windows](https://img.shields.io/badge/platforms-Linux%20%7C%20macOS%20%7C%20Windows-lightgrey.svg)](#platform-support)

Athena Code is a memory-focused fork of
[OpenCode](https://github.com/anomalyco/opencode). It gives an AI coding agent
local, durable memory; freezes relevant context for a session; recalls related
facts for each turn; and indexes prior conversations for later search.

> **Project status:** early development. Native release builds are produced for
> Linux, macOS, and Windows on x64 and ARM64. macOS and Windows binaries are not
> yet code-signed.

## Demo

A short look at the Athena Code terminal UI:

https://github.com/user-attachments/assets/aa539aa8-8bf3-4392-8790-463f70453dbe

## Why Athena Code?

Most coding agents start each session without durable knowledge of your
preferences, architecture decisions, or previous work. Athena Code adds a
local-first memory layer directly to the agent loop:

- **Persistent AI memory:** save stable facts, preferences, decisions, and
  workflow notes for future sessions.
- **Automatic contextual recall:** retrieve relevant memories for the current
  request without sending the entire memory store on every turn.
- **Cross-session, cross-agent search:** index and search previous
  conversations with SQLite FTS5 — Athena Code's own, plus local Claude Code,
  Codex, opencode, and Hermes session stores when present.
- **Frozen session context:** build one deterministic memory snapshot per
  session and reuse it across tool calls.
- **Native memory tools:** expose `memory_write`, `memory_read`, and
  `session_recall` to the model.
- **Local agent orchestration:** spawn and coordinate Claude Code, Codex,
  opencode, and Hermes as subagents (headless or in visible terminals), and take
  over a recalled session in place — all from agent tools.
- **Local-first storage:** memory and recall data stay in local files by
  default; the memory hot path requires no Athena backend service.
- **Open agent loop:** built on the open-source OpenCode terminal coding agent.

## Quick Start

### Linux and macOS

Install the latest build for the current operating system and architecture:

```bash
curl -fsSL https://raw.githubusercontent.com/luckeyfaraday/athena-code/main/scripts/install.sh | bash
```

The installer verifies the release checksum, copies the executable to
`~/.local/share/athena-code/bin/athena-code`, and creates
`~/.local/bin/athena-code`. The installed command does not depend on a cloned
repository.

Install a specific version:

```bash
curl -fsSL https://raw.githubusercontent.com/luckeyfaraday/athena-code/main/scripts/install.sh |
  bash -s -- --version v0.2.1
```

See [GitHub Releases](https://github.com/luckeyfaraday/athena-code/releases)
for available versions, archives, checksums, and release notes.

### Windows

Run in PowerShell:

```powershell
irm https://raw.githubusercontent.com/luckeyfaraday/athena-code/main/scripts/install.ps1 | iex
```

The installer verifies the release checksum, installs
`athena-code.exe` under `%LOCALAPPDATA%\AthenaCode`, and adds its `bin`
directory to your user `PATH`.

### Updating

Installed builds update themselves. On startup Athena Code checks the latest
GitHub release in the background and shows an update prompt inside the app;
accepting it downloads, verifies, and installs the new version (restart to run
it). You can also update from the command line at any time:

```bash
athena-code upgrade            # latest release
athena-code upgrade v0.2.1     # specific version
```

Set `"autoupdate": false` in the global config to disable the startup check,
or `"autoupdate": "notify"` to be notified without ever auto-installing.

### Build from source

Requirements:

- A supported Linux, macOS, or Windows host
- Git
- Node.js with `npx`
- At least 5 GB of free temporary disk space
- Visual Studio 2022 Build Tools with **Desktop development with C++** on
  Windows

```bash
git clone https://github.com/luckeyfaraday/athena-code.git
cd athena-code
./scripts/build.sh
```

The build checks out the pinned OpenCode revision, applies Athena Code's patch
and source overlay, installs dependencies, and writes the executable to
`runtime-bin/<platform>-<architecture>/`.

Install a local Linux or macOS build by passing its generated path:

```bash
./scripts/install.sh --from-file ./runtime-bin/linux-x64/athena-code
```

On Windows:

```powershell
.\scripts\install.ps1 -FromFile .\runtime-bin\windows-x64\athena-code.exe
```

## Usage

Start the interactive terminal UI in the current project:

```bash
athena-code
```

Run a one-shot coding task:

```bash
athena-code run "explain this repository and identify the highest-risk module"
```

Save and inspect durable memories:

```bash
athena-code memory add "Use pnpm for this organization"
athena-code memory list
```

Resume a session:

```bash
athena-code --session SESSION_ID
```

Use `athena-code --help` for the complete command reference.

## How Memory Works

Athena Code separates memory by lifecycle so relevant context is available
without rebuilding or resending everything continuously.

| Layer | Purpose | Lifecycle |
|---|---|---|
| Global memory | Stable user facts, preferences, and decisions | Persists across projects and sessions |
| Project memory | Repository-specific facts and context | Stored inside the project |
| Frozen snapshot | Bounded memory context for one agent session | Built once and reused byte-for-byte |
| Turn recall | Memories relevant to the current request | Recomputed once per user turn |
| Session index | Searchable excerpts from previous conversations across local agents (Athena Code, Claude Code, Codex, opencode, Hermes) | Indexed locally with SQLite FTS5, rescanned incrementally in the background |

Memory locations:

- Global memory: `~/.athena-code/memory/entries.jsonl`
- Project memory: `<project>/.context-workspace/memory/entries.jsonl`
- Global cross-project session search index: `~/.athena-code/context/sessions.db`

Set `ATHENA_CODE_HOME` to change the global Athena Code data directory.

Athena Code tells the model to treat recalled text as background data rather
than as newer instructions. Do not store passwords, API keys, private keys, or
other secrets in agent memory.

## Agent Tools

Beyond the memory layer, Athena Code exposes a set of native tools to the model
so it can manage memory, search history, and coordinate other local agents:

| Tool | Purpose |
|---|---|
| `memory_write` | Save a durable global memory for future sessions |
| `memory_read` | Read back stored memories |
| `session_recall` | Retrieve relevant excerpts from indexed past sessions |
| `agent_spawn` | Spawn Claude Code, Codex, opencode, or Hermes as a subagent (headless, or in a visible terminal window) |
| `agent_list` | List local agents spawned by this process |
| `agent_message` | Send a follow-up message to a spawned agent |
| `agent_output` | Read captured stdout/stderr from a headless agent |
| `agent_wait` | Wait for a one-shot agent to finish and return its output |
| `agent_stop` | Stop a headless agent or close a visible agent's terminal window |
| `agent_takeover` | Swap the current terminal to drive a spawned agent in place |
| `session_takeover` | Resume a recalled `{ agent, session_id }` in place, like selecting it from `/find-sessions` |

Inside the terminal UI, the `/find-sessions` command opens the cross-agent
session search dialog backed by the local session index.

### Multi-agent workflows

Athena Code can search, resume, and delegate across the coding agents already
on your machine:

1. **Recall** — `session_recall` or `/find-sessions` searches indexed sessions
   from every local agent.
2. **Take over** — `session_takeover` resumes a past session in this terminal;
   `agent_takeover` does the same for a live spawn.
3. **Delegate** — `agent_spawn` hands a subtask to Claude Code, Codex,
   opencode, or Hermes; `agent_wait` returns the result.

Example: *"Find where we fixed JWT refresh in Claude last week, pick it up
here, then have Codex write tests for it."*

### Permissions

By default Athena Code runs permissionless: tool-call permission prompts are
bypassed so the agent loop runs uninterrupted. User-defined permission rules in
your config still take precedence, so you can add rules to require approval for
specific tools or commands.

## Architecture

This repository maintains a reproducible fork rather than vendoring the entire
upstream source tree:

```text
OpenCode pinned revision
        +
patches/opencode-athena.patch
        +
overlay/packages/opencode/...
        =
runtime-bin/<platform>-<architecture>/athena-code
```

Key directories:

| Path | Contents |
|---|---|
| `overlay/` | Athena-owned memory, recall, tools, and TUI source |
| `patches/` | Integration and branding changes applied to OpenCode |
| `scripts/build.sh` | Reproducible source build |
| `scripts/install.sh` | Linux and macOS installer |
| `scripts/install.ps1` | Windows PowerShell installer |
| `test/` | Memory, recall, snapshot, and session-index tests |
| `docs/` | Technical design documentation |

## Development

Run the focused test suite:

```bash
npx --yes bun@1.3.14 test test
```

Build the complete executable:

```bash
./scripts/build.sh
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the development workflow and pull
request expectations.

## Platform Support

| Platform | Status |
|---|---|
| Linux x64 | Native release build |
| Linux ARM64 | Native release build |
| macOS Apple Silicon | Native release build; unsigned |
| macOS Intel | Native release build; unsigned |
| Windows x64 | Native release build; unsigned |
| Windows ARM64 | Native release build; unsigned |

Platform support describes Athena Code packaging, not every platform supported
by upstream OpenCode.

Unsigned macOS builds may require confirmation in **System Settings > Privacy &
Security** on first launch. Windows SmartScreen may also warn about an
unrecognized publisher. Code signing and macOS notarization are planned release
hardening work.

## FAQ

### Is Athena Code the same as OpenCode?

No. Athena Code is an independent, memory-focused fork built from a pinned
OpenCode revision. It retains OpenCode's terminal coding-agent foundation and
adds Athena-owned persistent memory, context snapshots, recall, session search,
tools, branding, tests, and release packaging.

### Does Athena Code require the Athena desktop application?

No. Athena Code builds and runs as a standalone terminal application. It can
also be launched by Athena or another terminal workspace manager.

### Is memory uploaded to a server?

Athena Code's native memory store, snapshots, and session index are local by
default. Model requests still go to whichever AI provider you configure through
the underlying OpenCode provider system.

### Can Athena Code remember information across repositories?

Yes. Global memories under `~/.athena-code` are available across folders.
Project memories and indexed session history remain scoped to their project.

### How is this different from adding instructions to `AGENTS.md`?

`AGENTS.md` is best for repository instructions that should always be loaded.
Athena Code memory is designed for durable facts and selective retrieval:
relevant entries are recalled for a request while unrelated entries remain out
of the prompt.

## Project Policies

- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Support](SUPPORT.md)
- [Code of conduct](CODE_OF_CONDUCT.md)
- [License](LICENSE)
- [Third-party notices](THIRD_PARTY_NOTICES.md)

## License and Attribution

Athena Code is available under the [MIT License](LICENSE). It is derived from
[OpenCode](https://github.com/anomalyco/opencode), which is also MIT licensed.
See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for upstream attribution.

Athena Code is an independent project and is not affiliated with or endorsed by
the OpenCode maintainers.
