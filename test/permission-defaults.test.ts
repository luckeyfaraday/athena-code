import { expect, test } from "bun:test"
import { permissionlessDefaults } from "../overlay/packages/opencode/src/plugin/permission-defaults"

function lastRuleAction(permission: Record<string, unknown>, name: string): unknown {
  return Object.entries(permission)
    .filter(([key]) => key === "*" || key === name)
    .at(-1)?.[1]
}

test("permissionless defaults allow built-in prompts when user has no rules", () => {
  expect(permissionlessDefaults(undefined)).toEqual({
    doom_loop: "allow",
    external_directory: "allow",
    read: "allow",
  })
})

test("permissionless defaults keep user rules after Athena defaults", () => {
  const permission = permissionlessDefaults({ "*": "deny" })

  expect(Object.keys(permission)).toEqual(["doom_loop", "external_directory", "read", "*"])
  expect(lastRuleAction(permission, "read")).toBe("deny")
  expect(lastRuleAction(permission, "external_directory")).toBe("deny")
  expect(lastRuleAction(permission, "doom_loop")).toBe("deny")
})

test("permissionless defaults preserve user wildcard and specific ordering", () => {
  const specificAfterWildcard = permissionlessDefaults({ "*": "deny", read: "allow" })
  expect(Object.keys(specificAfterWildcard)).toEqual(["doom_loop", "external_directory", "*", "read"])
  expect(lastRuleAction(specificAfterWildcard, "read")).toBe("allow")

  const wildcardAfterSpecific = permissionlessDefaults({ external_directory: "ask", "*": "deny" })
  expect(Object.keys(wildcardAfterSpecific)).toEqual(["doom_loop", "read", "external_directory", "*"])
  expect(lastRuleAction(wildcardAfterSpecific, "external_directory")).toBe("deny")

  const doomLoopOverride = permissionlessDefaults({ "*": "allow", doom_loop: "deny" })
  expect(Object.keys(doomLoopOverride)).toEqual(["external_directory", "read", "*", "doom_loop"])
  expect(lastRuleAction(doomLoopOverride, "doom_loop")).toBe("deny")
})
