# Athena Code

Standalone Athena Code runtime: an opencode fork with Athena memory, branding,
and UX changes.

This folder is the development root for the fork. The desktop app can launch or
embed Athena Code later, but the fork should build and run on its own.

## Build

```bash
./scripts/build.sh
```

The build:

1. checks out the pinned opencode revision,
2. applies `patches/opencode-branding.patch`,
3. overlays `overlay/`, and
4. writes `runtime-bin/linux-x64/athena-code`.

## Test

```bash
npx --yes bun@1.3.14 test test
```

## Run

```bash
./runtime-bin/linux-x64/athena-code
```

Useful commands:

```bash
./runtime-bin/linux-x64/athena-code run "your task"
./runtime-bin/linux-x64/athena-code memory add "remember this global fact"
./runtime-bin/linux-x64/athena-code memory list
```
