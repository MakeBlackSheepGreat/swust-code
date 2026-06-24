# Custom Provider Connections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three custom provider connection types for old OpenAI Chat Completions, new OpenAI Responses, and Anthropic Messages.

**Architecture:** Keep the change inside the existing TUI custom provider wizard. Use a small pure config builder so tests can validate SDK and option mappings without rendering the terminal UI.

**Tech Stack:** Solid TSX TUI components, Bun test, AI SDK provider package names.

---

### Task 1: Connection Mapping Tests

**Covers:** conversation design approval

**Files:**
- Create: `packages/opencode/test/cli/tui/dialog-provider.test.ts`
- Modify: `packages/opencode/src/cli/cmd/tui/component/dialog-provider.tsx`

- [x] **Step 1: Write the failing test**

Test `buildCustomProviderPatch` for three connection values: `openai-compatible`, `openai`, and `anthropic`.

- [x] **Step 2: Run test to verify it fails**

Run: `bun test --timeout 30000 test/cli/tui/dialog-provider.test.ts`

Expected: fail because `buildCustomProviderPatch` is not exported yet.

- [x] **Step 3: Write minimal implementation**

Export the connection list type/value and a `buildCustomProviderPatch` helper, then make `runCustomProviderWizard` call it.

- [x] **Step 4: Run test to verify it passes**

Run: `bun test --timeout 30000 test/cli/tui/dialog-provider.test.ts`

Expected: pass.

- [x] **Step 5: Run typecheck**

Run: `bun typecheck`

Expected: pass or report unrelated pre-existing failures separately.
