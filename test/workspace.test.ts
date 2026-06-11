import { test, expect } from "bun:test"
import { normalizeWorktree } from "../overlay/packages/opencode/src/plugin/workspace"

test("normalizeWorktree falls back to the directory for the non-git sentinel", () => {
  expect(normalizeWorktree({ worktree: "/", directory: "/home/user/notes" })).toBe("/home/user/notes")
})

test("normalizeWorktree keeps a real worktree root", () => {
  expect(normalizeWorktree({ worktree: "/home/user/repo", directory: "/home/user/repo/src" })).toBe("/home/user/repo")
})
