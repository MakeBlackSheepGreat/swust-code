import { describe, expect, test } from "bun:test"
import path from "path"
import { splitDisplayPath } from "../../../src/cli/cmd/tui/routes/session/sidebar-path"

describe("splitDisplayPath", () => {
  test("splits slash paths", () => {
    expect(splitDisplayPath("~/projects/app")).toEqual({
      parent: ["~", "projects"].join(path.sep),
      name: "app",
    })
  })

  test("splits Windows paths", () => {
    expect(splitDisplayPath("C:\\Users\\me\\project")).toEqual({
      parent: ["C:", "Users", "me"].join(path.sep),
      name: "project",
    })
  })

  test("does not invent a parent for a single segment", () => {
    expect(splitDisplayPath("project")).toEqual({
      parent: "",
      name: "project",
    })
  })
})
