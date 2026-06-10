# Contributing to Athena Code

Athena Code welcomes focused bug fixes, tests, documentation improvements, and
well-scoped memory or recall enhancements.

## Before You Start

- Search existing issues and pull requests.
- Open a feature request before implementing a large behavioral change.
- Keep changes within Athena Code's overlay-and-patch architecture.
- Never commit credentials, private memory data, generated session indexes, or
  build artifacts.

## Development Setup

Requirements:

- Linux x86_64
- Git
- Node.js with `npx`
- At least 5 GB of free temporary disk space for a full build

Clone and test:

```bash
git clone https://github.com/luckeyfaraday/athena-code.git
cd athena-code
npx --yes bun@1.3.14 test test
```

Build the executable:

```bash
./scripts/build.sh
```

Local builds report version `0.0.0-dev`. Set `ATHENA_CODE_VERSION` when testing
version-specific packaging:

```bash
ATHENA_CODE_VERSION=0.1.0 ./scripts/build.sh
```

The build clones the pinned OpenCode revision into
`${ATHENA_OPENCODE_SOURCE:-/tmp/athena-opencode-source}`. Set
`ATHENA_TUI_KEEP_SOURCE=1` to retain that checkout for iterative development.

## Repository Model

Athena Code does not vendor the complete OpenCode repository.

- Put Athena-owned source files under `overlay/`.
- Put changes to existing upstream files in
  `patches/opencode-branding.patch`.
- Keep the OpenCode revision pinned in `scripts/build.sh`.
- Add focused tests under `test/`.

If the upstream revision changes, verify that the patch still applies, run the
test suite, and complete a full build.

## Pull Requests

Pull requests should:

- explain the user-visible problem and the chosen solution;
- include tests for changed behavior;
- pass `npx --yes bun@1.3.14 test test`;
- pass a full build when integration or patch files change;
- update public documentation when commands, storage, or behavior change;
- avoid unrelated formatting or refactoring.

By contributing, you agree that your contribution is licensed under this
repository's MIT License.
