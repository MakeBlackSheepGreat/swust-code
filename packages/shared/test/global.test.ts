import { describe, expect, test } from "bun:test"
import path from "path"
import { resolveSwustCodeHome } from "@swust-code/shared/global"

describe("resolveSwustCodeHome", () => {
  test("with SWUST_CODE_HOME set, resolves 4 subdirs under root", () => {
    const result = resolveSwustCodeHome({
      SWUST_CODE_HOME: "/tmp/profile-a",
    })
    expect(result.mode).toBe("swust-code_home")
    expect(result.root).toBe("/tmp/profile-a")
    expect(result.config).toBe(path.join("/tmp/profile-a", "config"))
    expect(result.data).toBe(path.join("/tmp/profile-a", "data"))
    expect(result.state).toBe(path.join("/tmp/profile-a", "state"))
    expect(result.cache).toBe(path.join("/tmp/profile-a", "cache"))
  })

  test("without SWUST_CODE_HOME, falls through to xdg mode", () => {
    const result = resolveSwustCodeHome({})
    expect(result.mode).toBe("xdg")
    expect(result.root).toBeUndefined()
    // xdg paths end with "/swust-code"
    expect(result.config.endsWith(path.join("", "swust-code"))).toBe(true)
    expect(result.data.endsWith(path.join("", "swust-code"))).toBe(true)
    expect(result.state.endsWith(path.join("", "swust-code"))).toBe(true)
    expect(result.cache.endsWith(path.join("", "swust-code"))).toBe(true)
  })

  test("empty SWUST_CODE_HOME string is treated as unset (xdg mode)", () => {
    const result = resolveSwustCodeHome({ SWUST_CODE_HOME: "" })
    expect(result.mode).toBe("xdg")
  })

  test("relative SWUST_CODE_HOME path throws with clear error", () => {
    expect(() => resolveSwustCodeHome({ SWUST_CODE_HOME: "./foo" })).toThrow(
      /SWUST_CODE_HOME must be an absolute path/,
    )
    expect(() => resolveSwustCodeHome({ SWUST_CODE_HOME: "foo/bar" })).toThrow(
      /SWUST_CODE_HOME must be an absolute path/,
    )
  })

  test("tilde-prefixed SWUST_CODE_HOME throws (not treated as absolute)", () => {
    expect(() => resolveSwustCodeHome({ SWUST_CODE_HOME: "~/profiles/a" })).toThrow(
      /SWUST_CODE_HOME must be an absolute path/,
    )
  })

  test("error message includes the offending value", () => {
    expect(() => resolveSwustCodeHome({ SWUST_CODE_HOME: "./relative" })).toThrow(
      /\.\/relative/,
    )
  })
})
