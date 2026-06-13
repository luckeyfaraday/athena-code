import { test, expect } from "bun:test"
import { detectInstallMethod, parseLatestVersion } from "../overlay/packages/opencode/src/installation/athena-release"

test("detectInstallMethod recognizes the installer's binary directory", () => {
  expect(detectInstallMethod("/home/user/.local/share/athena-code/bin/athena-code", "linux")).toBe("curl")
  expect(detectInstallMethod("/Users/user/.local/share/athena-code/bin/athena-code", "darwin")).toBe("curl")
})

test("detectInstallMethod recognizes the launcher path when the symlink is not resolved", () => {
  expect(detectInstallMethod("/home/user/.local/bin/athena-code", "linux")).toBe("curl")
})

test("detectInstallMethod reports unknown for unmanaged binaries", () => {
  expect(detectInstallMethod("/usr/local/bin/athena-code", "linux")).toBe("unknown")
  expect(detectInstallMethod("/home/user/home_ai/projects/athena-code/runtime-bin/athena-code", "linux")).toBe(
    "unknown",
  )
})

test("detectInstallMethod recognizes the Windows install root case-insensitively", () => {
  expect(detectInstallMethod("C:\\Users\\user\\AppData\\Local\\AthenaCode\\athena-code.exe", "win32")).toBe("curl")
  expect(detectInstallMethod("C:\\Users\\user\\AppData\\Local\\athenacode\\bin\\athena-code.exe", "win32")).toBe(
    "curl",
  )
  expect(detectInstallMethod("C:\\tools\\athena-code.exe", "win32")).toBe("unknown")
})

test("parseLatestVersion strips the release tag's leading v", () => {
  expect(parseLatestVersion(JSON.stringify({ tag_name: "v0.3.0" }))).toBe("0.3.0")
})

test("parseLatestVersion rejects a release without a tag", () => {
  expect(() => parseLatestVersion(JSON.stringify({ name: "untagged" }))).toThrow("tag_name")
})
