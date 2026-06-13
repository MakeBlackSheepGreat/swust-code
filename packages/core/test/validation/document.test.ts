import { describe, test, expect } from "bun:test"
import { validateDocument, parseMarkdownSections, normalizeSectionTitle } from "../../src/validation/document"

describe("normalizeSectionTitle", () => {
  test("strips bold markers", () => {
    expect(normalizeSectionTitle("**Overview**")).toBe("overview")
  })

  test("converts full-width colon", () => {
    expect(normalizeSectionTitle("Requirements：")).toBe("requirements:")
  })

  test("strips annotation suffixes", () => {
    expect(normalizeSectionTitle("Summary *(optional)*")).toBe("summary")
  })

  test("lowercases", () => {
    expect(normalizeSectionTitle("Technical Context")).toBe("technical context")
  })
})

describe("parseMarkdownSections", () => {
  test("parses flat headings", () => {
    const md = `# Title\n## Section A\nContent A\n## Section B\nContent B`
    const sections = parseMarkdownSections(md)
    expect(sections.length).toBe(1) // # Title
    expect(sections[0].level).toBe(1)
    expect(sections[0].children.length).toBe(2)
    expect(sections[0].children[0].normalizedTitle).toBe("section a")
  })

  test("skips headings inside code fences", () => {
    const md = `# Title\n\`\`\`\n## Not a section\n\`\`\`\n## Real Section`
    const sections = parseMarkdownSections(md)
    expect(sections[0].children.length).toBe(1)
    expect(sections[0].children[0].normalizedTitle).toBe("real section")
  })

  test("handles nested headings", () => {
    const md = `# Title\n## Section\n### Subsection\nContent`
    const sections = parseMarkdownSections(md)
    expect(sections[0].children[0].children.length).toBe(1)
  })
})

describe("validateDocument", () => {
  test("valid spec passes", () => {
    const md = `# Feature Specification: Test
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
Questions here.`
    const result = validateDocument(md, "spec")
    expect(result.valid).toBe(true)
    expect(result.errors.length).toBe(0)
  })

  test("missing section fails", () => {
    const md = `# Feature Specification: Test
## Overview
Description here.`
    const result = validateDocument(md, "spec")
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes("Missing required section"))).toBe(true)
  })

  test("duplicate section fails", () => {
    const md = `# Feature Specification: Test
## Overview
First overview.
## Overview
Duplicate.`
    const result = validateDocument(md, "spec")
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes("Duplicate"))).toBe(true)
  })

  test("unknown document type fails", () => {
    const result = validateDocument("# Test", "unknown")
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain("Unknown document type")
  })

  test("valid design document passes", () => {
    const md = `# Implementation Plan: Test
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
Contracts here.`
    const result = validateDocument(md, "design")
    expect(result.valid).toBe(true)
  })

  test("bilingual aliases work", () => {
    const md = `# Feature Specification: Test
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
Questions here.`
    const result = validateDocument(md, "spec")
    expect(result.valid).toBe(true)
  })
})
