import { describe, expect, test } from "bun:test"
import { normalizeSectionTitle, parseMarkdownSections, validateDocument } from "../../src/tool/document-validation"

describe("normalizeSectionTitle", () => {
  test("normalizes common markdown heading forms", () => {
    expect(normalizeSectionTitle("**Overview**")).toBe("overview")
    expect(normalizeSectionTitle("Requirements：")).toBe("requirements:")
    expect(normalizeSectionTitle("Summary *(optional)*")).toBe("summary")
    expect(normalizeSectionTitle("Technical Context")).toBe("technical context")
  })
})

describe("parseMarkdownSections", () => {
  test("parses nested headings", () => {
    const sections = parseMarkdownSections("# Title\n## Section A\nContent A\n## Section B\nContent B")

    expect(sections).toHaveLength(1)
    expect(sections[0].level).toBe(1)
    expect(sections[0].children).toHaveLength(2)
    expect(sections[0].children[0].normalizedTitle).toBe("section a")
  })

  test("ignores headings inside code fences", () => {
    const sections = parseMarkdownSections("# Title\n```\n## Not a section\n```\n## Real Section")

    expect(sections[0].children).toHaveLength(1)
    expect(sections[0].children[0].normalizedTitle).toBe("real section")
  })

  test("records child sections", () => {
    const sections = parseMarkdownSections("# Title\n## Section\n### Subsection\nContent")

    expect(sections[0].children[0].children).toHaveLength(1)
  })
})

describe("validateDocument", () => {
  test("accepts a valid spec document", () => {
    const result = validateDocument(
      `# Feature Specification: Test
## Overview
Description here.
## User Scenarios & Testing
Scenarios here.
## Requirements
Requirements here.
## Success Criteria
Criteria here.
## Assumptions
Assumptions here.
## Open Questions
Questions here.`,
      "spec",
    )

    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  test("rejects missing and duplicate required sections", () => {
    const missing = validateDocument("# Feature Specification: Test\n## Overview\nDescription here.", "spec")
    expect(missing.valid).toBe(false)
    expect(missing.errors.some((error) => error.includes("Missing required section"))).toBe(true)

    const duplicate = validateDocument(
      "# Feature Specification: Test\n## Overview\nFirst overview.\n## Overview\nDuplicate.",
      "spec",
    )
    expect(duplicate.valid).toBe(false)
    expect(duplicate.errors.some((error) => error.includes("Duplicate"))).toBe(true)
  })

  test("rejects unknown document types", () => {
    const result = validateDocument("# Test", "unknown")

    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain("Unknown document type")
  })

  test("accepts a valid design document", () => {
    const result = validateDocument(
      `# Implementation Plan: Test
## Summary
Summary here.
## Technical Context
Context here.
## Project Structure
Structure here.
## Research & Decisions
Decisions here.
## Data Model
Model here.
## Contracts & Interfaces
Contracts here.`,
      "design",
    )

    expect(result.valid).toBe(true)
  })

  test("matches bilingual section aliases", () => {
    const result = validateDocument(
      `# Feature Specification: Test
## 概述
Description here.
## User Scenarios & Testing
Scenarios here.
## 需求
Requirements here.
## Success Criteria
Criteria here.
## 假设
Assumptions here.
## Open Questions
Questions here.`,
      "spec",
    )

    expect(result.valid).toBe(true)
  })
})
