// Non-git projects set worktree to the "/" sentinel (see
// project/instance-context.ts); use the project directory instead so
// per-workspace files like .context-workspace/memory/entries.jsonl resolve
// next to the code. Both the plugin factory input and the tool execute
// context carry the worktree/directory pair, so this works for either.
export function normalizeWorktree(input: { worktree: string; directory: string }): string {
  return input.worktree === "/" ? input.directory : input.worktree
}
