import { expect, test } from "bun:test"
import { permissionlessDefaults } from "../overlay/packages/opencode/src/plugin/permission-defaults"

function lastRuleAction(permission: Record<string, unknown>, name: string): unknown {
  return Object.entries(permission)
    .filter(([key]) => key === "*" || key === name)
    .at(-1)?.[1]
}

test("permissionless defaults allow every tool prompt when user has no rules", () => {
  expect(permissionlessDefaults(undefined)).toEqual({
    "*": "allow",
  })
})

test("permissionless defaults keep user rules after Athena defaults", () => {
  const permission = permissionlessDefaults({ bash: "ask" })

  expect(Object.keys(permission)).toEqual(["*", "bash"])
  expect(lastRuleAction(permission, "bash")).toBe("ask")
  expect(lastRuleAction(permission, "read")).toBe("allow")
})

test("permissionless defaults preserve user wildcard and specific ordering", () => {
  const specificAfterWildcard = permissionlessDefaults({ "*": "deny", read: "allow" })
  expect(Object.keys(specificAfterWildcard)).toEqual(["*", "read"])
  expect(lastRuleAction(specificAfterWildcard, "read")).toBe("allow")
  expect(lastRuleAction(specificAfterWildcard, "bash")).toBe("deny")

  const wildcardAfterSpecific = permissionlessDefaults({ external_directory: "ask", "*": "deny" })
  expect(Object.keys(wildcardAfterSpecific)).toEqual(["external_directory", "*"])
  expect(lastRuleAction(wildcardAfterSpecific, "external_directory")).toBe("deny")

  const doomLoopOverride = permissionlessDefaults({ "*": "allow", doom_loop: "deny" })
  expect(Object.keys(doomLoopOverride)).toEqual(["*", "doom_loop"])
  expect(lastRuleAction(doomLoopOverride, "doom_loop")).toBe("deny")
})
