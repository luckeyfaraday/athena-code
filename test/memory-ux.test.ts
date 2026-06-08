import { test, expect } from "bun:test"
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync } from "node:fs"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { addMemory, listMemory, readMemoryFacts, resolveMemoryWorkspace, writeMemoryFact } from "../overlay/packages/opencode/src/session/memory/actions"
import { computeMemoryStatus, formatMemoryStatus, statusPath, writeMemoryStatus } from "../overlay/packages/opencode/src/session/memory/status"
import { appendProjectMemory, readGlobalMemoryEntries } from "../overlay/packages/opencode/src/session/memory/store"
import { recallResult } from "../overlay/packages/opencode/src/session/memory/recall"

function workspace(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

function memoryHome(prefix: string): string {
  const dir = workspace(prefix)
  process.env.ATHENA_CODE_HOME = dir
  return dir
}

test("memory_write helper saves durable facts through the native store", () => {
  memoryHome("athhome-tool-")
  const ws = workspace("athmemtool-")
  const entry = writeMemoryFact(ws, "remember the release checklist lives in docs/release.md")
  expect(entry?.source).toBe("agent")
  expect(readGlobalMemoryEntries().map((item) => item.text)).toEqual([
    "remember the release checklist lives in docs/release.md",
  ])
  expect(writeMemoryFact(ws, "remember the release checklist lives in docs/release.md")).toBeNull()
})

test("memory written in one folder recalls from another folder", () => {
  memoryHome("athhome-global-")
  const sourceWs = workspace("athmemsource-")
  const otherWs = workspace("athmemother-")
  writeMemoryFact(sourceWs, "Alan's cat is orange")

  const recalled = recallResult(otherWs, "what color is my cat")
  expect(recalled.count).toBe(1)
  expect(recalled.text).toContain("Alan's cat is orange")
})

test("memory_read helper searches global memory from another folder", () => {
  memoryHome("athhome-read-")
  const sourceWs = workspace("athmemreadsource-")
  const otherWs = workspace("athmemreadother-")
  writeMemoryFact(sourceWs, "Alan's cat is orange")
  writeMemoryFact(sourceWs, "the release checklist lives in docs/release.md")

  const result = readMemoryFacts(otherWs, "what color is my cat")
  expect(result.empty_store).toBe(false)
  expect(result.total).toBe(2)
  expect(result.entries.map((entry) => entry.text)).toEqual(["Alan's cat is orange"])
})

test("memory_read helper reports empty store and no-match states explicitly", () => {
  memoryHome("athhome-readempty-")
  const ws = workspace("athmemreadempty-")
  const empty = readMemoryFacts(ws, "cat")
  expect(empty.empty_store).toBe(true)
  expect(empty.total).toBe(0)
  expect(empty.entries).toEqual([])

  writeMemoryFact(ws, "the build uses bun")
  const missing = readMemoryFacts(ws, "cat")
  expect(missing.empty_store).toBe(false)
  expect(missing.total).toBe(1)
  expect(missing.entries).toEqual([])
})

test("memory_read helper lists recent memories when query is empty", () => {
  memoryHome("athhome-readlist-")
  const ws = workspace("athmemreadlist-")
  writeMemoryFact(ws, "first durable fact")
  writeMemoryFact(ws, "second durable fact")

  const result = readMemoryFacts(ws, "")
  expect(result.empty_store).toBe(false)
  expect(result.total).toBe(2)
  expect(result.entries.map((entry) => entry.text)).toContain("first durable fact")
  expect(result.entries.map((entry) => entry.text)).toContain("second durable fact")
})

test("memory status exposes loaded and recalled counts", () => {
  memoryHome("athhome-status-")
  const ws = workspace("athmemstatus-")
  writeMemoryFact(ws, "deploys require running bun test first")
  writeMemoryFact(ws, "design reviews happen on thursday")
  appendProjectMemory(ws, "release notes live in docs/release.md")
  const status = computeMemoryStatus(ws, "what is required for deploys")
  expect(status.loaded).toBe(3)
  expect(status.recalled).toBe(1)
  expect(status.empty_store).toBe(false)
  expect(formatMemoryStatus(status)).toBe("loaded 3 memories · recalled 1 this turn")
})

test("memory status has an explicit empty-store signal and writes status json", () => {
  memoryHome("athhome-empty-")
  const ws = workspace("athmemempty-")
  const status = writeMemoryStatus(ws, "anything")
  expect(status.loaded).toBe(0)
  expect(status.recalled).toBe(0)
  expect(status.empty_store).toBe(true)
  expect(formatMemoryStatus(status)).toBe("memory empty")
  expect(existsSync(statusPath(ws))).toBe(true)
})

test("memory CLI helpers add and list durable memories", () => {
  memoryHome("athhome-cli-")
  const ws = workspace("athmemcli-")
  const entry = addMemory(ws, "the local dev server runs on port 5173")
  expect(entry?.source).toBe("cli")
  expect(addMemory(ws, "the local dev server runs on port 5173")).toBeNull()
  expect(listMemory(ws).map((item) => item.text)).toEqual(["the local dev server runs on port 5173"])
})

test("memory CLI workspace resolver uses the git root from subdirectories", () => {
  memoryHome("athhome-git-")
  const ws = workspace("athmemgit-")
  spawnSync("git", ["init", "-q"], { cwd: ws })
  const nested = join(ws, "packages", "app")
  mkdirSync(nested, { recursive: true })

  const resolved = resolveMemoryWorkspace(nested)
  expect(resolved).toBe(ws)
  addMemory(resolved, "subdirectory cli writes land at the git root")

  expect(listMemory(ws).map((item) => item.text)).toEqual(["subdirectory cli writes land at the git root"])
})
