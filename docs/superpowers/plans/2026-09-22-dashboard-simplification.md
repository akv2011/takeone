# Dashboard Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Replace the overloaded TakeOne creation dashboard with a compact, progressively disclosed creation flow.

**Architecture:** Keep Dashboard's current state and mutations, changing only presentation and disclosure state. Add one reusable tooltip primitive, make Telegram and brand-kit content compact, and cover the visible hierarchy and preserved actions with UI tests.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Lucide, Vitest, Testing Library.

---

### Task 1: Accessible tooltips

**Files:** Create `src/components/Tooltip.tsx`; Test `tests/ui.test.ts`

- [x] Add a tooltip wrapper that reveals short help on hover and focus without changing button semantics.
- [x] Verify tooltip copy and accessible button names in jsdom.

### Task 2: Progressive creation dashboard

**Files:** Modify `src/pages/Dashboard.tsx`; Modify `src/components/AssemblyStarter.tsx`; Modify `src/components/TelegramConnect.tsx`; Modify `src/components/BrandKitPanel.tsx`; Test `tests/ui.test.ts`

- [x] Replace the first-use guide with one short heading and director's dock.
- [x] Add collapsed Settings, Assembly and Telegram controls.
- [x] Preserve all existing submission fields and contextual upload/rights controls.
- [x] Remove explanatory paragraphs from the default surface.
- [x] Run targeted UI tests and fix regressions.

### Task 3: Verification

**Files:** No production changes expected.

- [x] Run the full root test suite, build, Convex typecheck and lint.
- [x] Run the app against the development Convex deployment.
- [x] Verify the signed-in dashboard visually at desktop and mobile widths, including delayed stability, tooltip, Settings, Telegram and mode switching.

