# Athena Code

**Athena Code is an open-source terminal AI coding agent with persistent memory,
automatic context recall, and searchable history across coding sessions.**

[![CI](https://github.com/luckeyfaraday/athena-code/actions/workflows/ci.yml/badge.svg)](https://github.com/luckeyfaraday/athena-code/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platform: Linux x86_64](https://img.shields.io/badge/platform-Linux%20x86__64-lightgrey.svg)](#platform-support)

Athena Code is a memory-focused fork of
[OpenCode](https://github.com/anomalyco/opencode). It gives an AI coding agent
local, durable memory; freezes relevant context for a session; recalls related
facts for each turn; and indexes prior conversations for later search.

> **Project status:** early development. Linux x86_64 is the first supported
> platform. The source, build system, tests, and release automation are public;
> use a published GitHub release when one is available, or build from source.

## Why Athena Code?

Most coding agents start each session without durable knowledge of your
preferences, architecture decisions, or previous work. Athena Code adds a
local-first memory layer directly to the agent loop:

- **Persistent AI memory:** save stable facts, preferences, decisions, and
  workflow notes for future sessions.
- **Automatic contextual recall:** retrieve relevant memories for the current
  request without sending the entire memory store on every turn.
- **Cross-session search:** index and search previous Athena Code conversations
  with SQLite FTS5.
- **Frozen session context:** build one deterministic memory snapshot per
  session and reuse it across tool calls.
- **Native agent tools:** expose `memory_write`, `memory_read`, and
  `session_recall` to the model.
- **Local-first storage:** memory and recall data stay in local files by
  default; the memory hot path requires no Athena backend service.
- **Open agent loop:** built on the open-source OpenCode terminal coding agent.

## Quick Start

### Install a release

When a release is available, install the latest Linux x86_64 build:

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
  bash -s -- --version v0.1.0
```

See [GitHub Releases](https://github.com/luckeyfaraday/athena-code/releases)
for available versions, archives, checksums, and release notes.

### Build from source

Requirements:

- Linux x86_64
- Git
- Node.js with `npx`
- At least 5 GB of free temporary disk space

```bash
git clone https://github.com/luckeyfaraday/athena-code.git
cd athena-code
./scripts/build.sh
./runtime-bin/linux-x64/athena-code
```

The build checks out the pinned OpenCode revision, applies Athena Code's patch
and source overlay, installs dependencies, and writes the executable to
`runtime-bin/linux-x64/athena-code`.

To install your local build:

```bash
./scripts/install.sh --from-file ./runtime-bin/linux-x64/athena-code
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
| Session index | Searchable excerpts from previous conversations | Indexed locally with SQLite FTS5 |

Memory locations:

- Global memory: `~/.athena-code/memory/entries.jsonl`
- Project memory: `<project>/.context-workspace/memory/entries.jsonl`
- Session search index: `<project>/.context-workspace/context/sessions.db`

Set `ATHENA_CODE_HOME` to change the global Athena Code data directory.

Athena Code tells the model to treat recalled text as background data rather
than as newer instructions. Do not store passwords, API keys, private keys, or
other secrets in agent memory.

For the design rationale, see
[Athena Turn-Ownership Memory Design](docs/athena-turn-ownership-design.md).

## Architecture

This repository maintains a reproducible fork rather than vendoring the entire
upstream source tree:

```text
OpenCode pinned revision
        +
patches/opencode-branding.patch
        +
overlay/packages/opencode/...
        =
runtime-bin/linux-x64/athena-code
```

Key directories:

| Path | Contents |
|---|---|
| `overlay/` | Athena-owned memory, recall, tools, and TUI source |
| `patches/` | Integration and branding changes applied to OpenCode |
| `scripts/build.sh` | Reproducible source build |
| `scripts/install.sh` | Release and local-build installer |
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
| Linux x86_64 | Supported build and release target |
| Linux ARM64 | Not yet packaged |
| macOS | Not yet supported |
| Windows | Not yet supported |

Platform support describes Athena Code packaging, not every platform supported
by upstream OpenCode.

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
