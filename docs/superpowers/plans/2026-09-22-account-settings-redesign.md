# TakeOne Account Settings Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic Clerk account experience with a monochrome TakeOne settings modal containing Profile, Preferences, Security, and Billing, while persisting creator defaults and applying them safely to a fresh Dashboard composer.

**Architecture:** Keep Clerk responsible for identity, passwords, sessions, and profile data. Add optional preference columns and one authenticated Convex mutation, then mount focused Preferences and Billing React pages through a shared `TakeOneUserButton`. Dashboard consumes normalized preferences once per signed-in user so later user edits are never overwritten.

**Tech Stack:** React 18, TypeScript, Clerk React, Convex, React Router, Tailwind CSS, Vitest, Testing Library.

---

## File Structure

- Create `src/components/account/TakeOneUserButton.tsx`: shared configured Clerk user button and custom-page registration.
- Create `src/components/account/AccountPreferences.tsx`: preference form, dirty state, save state, and accessibility status.
- Create `src/components/account/AccountBilling.tsx`: credit summary, packs, paginated owner history, and Pricing link.
- Create `src/lib/accountPreferences.ts`: frontend preference types, defaults, and normalization.
- Modify `src/lib/clerkTheme.ts`: monochrome account appearance, wording, inline password styling, and hidden danger section.
- Modify `src/lib/convexApi.ts`: typed `users.updatePreferences` function reference.
- Modify `src/components/Header.tsx`, `src/components/Account.tsx`, and `src/pages/Dashboard.tsx`: use the shared user button.
- Modify `src/pages/Dashboard.tsx`: initialize a fresh composer from preferences once per account and honor shortcut/open-in-Studio settings.
- Modify `convex/schema.ts` and `convex/users.ts`: optional preference storage, normalized reads, and authenticated update mutation.
- Create `tests/account-preferences.test.ts`: Convex defaults, validation, authentication, persistence, and isolation.
- Create `tests/account-settings-ui.test.tsx`: custom-page UI behavior, account appearance, shared wrapper, and Billing pagination.
- Modify `tests/ui.test.ts`: Dashboard preference initialization and interaction-fencing regressions.

### Task 1: Persist normalized account preferences

**Files:**
- Modify: `convex/schema.ts`
- Modify: `convex/users.ts`
- Modify: `src/lib/convexApi.ts`
- Create: `src/lib/accountPreferences.ts`
- Create: `tests/account-preferences.test.ts`

- [x] **Step 1: Write failing Convex tests**

Add tests using the repository's `convex-test` harness that assert a legacy user receives:

```ts
expect(result?.preferences).toEqual({
  defaultMode: "generate",
  defaultAspect: "9:16",
  defaultCaptionStyle: "auto",
  openFinishedInStudio: true,
  showShortcutHints: true,
});
```

Also assert `users:updatePreferences` rejects an unauthenticated call, rejects unsupported enum values at validation, persists all five fields for the authenticated user, and leaves a second user's values unchanged.

- [x] **Step 2: Run the preference tests and confirm failure**

Run: `npx vitest run tests/account-preferences.test.ts`

Expected: FAIL because `preferences` and `users:updatePreferences` do not exist.

- [x] **Step 3: Add optional schema fields and shared frontend defaults**

Add these optional validators to the `users` table:

```ts
defaultMode: v.optional(v.union(v.literal("edit"), v.literal("generate"), v.literal("clip"))),
defaultAspect: v.optional(v.union(v.literal("9:16"), v.literal("1:1"), v.literal("16:9"))),
defaultCaptionStyle: v.optional(v.union(
  v.literal("auto"),
  v.literal("clean"),
  v.literal("meme"),
  v.literal("karaoke"),
  v.literal("none"),
)),
openFinishedInStudio: v.optional(v.boolean()),
showShortcutHints: v.optional(v.boolean()),
```

Export the matching `AccountPreferencesValue`, option arrays, `DEFAULT_ACCOUNT_PREFERENCES`, and a defensive `normalizeAccountPreferences` function from `src/lib/accountPreferences.ts`.

- [x] **Step 4: Implement normalized reads and authenticated writes**

In `users.currentUser`, return a nested `preferences` object using the persisted value or the approved default. Add `users.updatePreferences` with literal-union and boolean arguments. Resolve the caller only through `ctx.auth.getUserIdentity()`, find the row by `by_token`, reject missing identity/user with `ConvexError`, patch only the five preference fields, and return the normalized saved object.

Add this function reference:

```ts
updatePreferences: makeFunctionReference<"mutation">("users:updatePreferences"),
```

- [x] **Step 5: Run focused validation**

Run: `npx vitest run tests/account-preferences.test.ts && npx convex codegen --typecheck=enable`

Expected: all preference tests pass and Convex typecheck exits 0.

- [x] **Step 6: Commit the persistence slice**

```bash
git add convex/schema.ts convex/users.ts src/lib/convexApi.ts src/lib/accountPreferences.ts tests/account-preferences.test.ts
git commit -m "feat(account): persist creator preferences"
```

### Task 2: Build the Preferences account page

**Files:**
- Create: `src/components/account/AccountPreferences.tsx`
- Create: `tests/account-settings-ui.test.tsx`

- [x] **Step 1: Write failing UI tests for preference state**

Mock `users.currentUser` and `users.updatePreferences`. Verify the page shows the stored selections, exposes radio-like segmented controls for starting point/aspect/captions, exposes two named switches, disables Save before an edit, sends the exact five-field payload after an edit, announces `Saved`, and retains unsaved selections after a rejected mutation while announcing a retryable error.

- [x] **Step 2: Run the UI test and confirm failure**

Run: `npx vitest run tests/account-settings-ui.test.tsx`

Expected: FAIL because `AccountPreferences` is missing.

- [x] **Step 3: Implement the focused form**

Use `useQuery(api.users.currentUser)` and `useMutation(api.users.updatePreferences)`. Keep `saved`, `draft`, and `saveState` separately. Render:

```tsx
<fieldset aria-label="Starting point">...</fieldset>
<fieldset aria-label="Aspect ratio">...</fieldset>
<label><input type="checkbox" role="switch" /> Open finished videos in Studio</label>
<label><input type="checkbox" role="switch" /> Show keyboard shortcuts</label>
<button disabled={!dirty || saving}>Save preferences</button>
<p role="status" aria-live="polite">{statusMessage}</p>
```

Use only warm white, charcoal, neutral grays, hairline borders, and a restrained dark red for failures. Keep the layout dimensions stable during loading.

- [x] **Step 4: Run UI tests**

Run: `npx vitest run tests/account-settings-ui.test.tsx`

Expected: preference tests pass.

- [x] **Step 5: Commit the page**

```bash
git add src/components/account/AccountPreferences.tsx tests/account-settings-ui.test.tsx
git commit -m "feat(account): add creator preferences page"
```

### Task 3: Build the Billing account page from existing data

**Files:**
- Create: `src/components/account/AccountBilling.tsx`
- Modify: `tests/account-settings-ui.test.tsx`

- [x] **Step 1: Add failing Billing tests**

Mock `users.currentUser`, `credits.getPacks`, and paginated `payments.listHistory`. Assert Billing shows free remaining and purchased credits separately, renders the configured pack names/prices/credits, shows empty and populated history states, renders refund/dispute/action-required states from returned projection data, requests the next page through `loadMore`, and links to `/pricing` rather than calling a checkout mutation.

- [x] **Step 2: Run the Billing tests and confirm failure**

Run: `npx vitest run tests/account-settings-ui.test.tsx -t Billing`

Expected: FAIL because `AccountBilling` is missing.

- [x] **Step 3: Implement the Billing composition**

Use `useQuery` for the account and packs and `usePaginatedQuery(api.payments.listHistory, { accountKey }, { initialNumItems: 10 })` for history. Render compact balance cards, configured packs, durable status labels, a `Load older payments` button while `CanLoadMore`, and:

```tsx
<Link to="/pricing">View plans and buy credits</Link>
```

Do not call `payments.createCheckout`, `payments.resumeCheckout`, reconciliation functions, or Dodo directly from this page.

- [x] **Step 4: Run Billing and existing payment-history tests**

Run: `npx vitest run tests/account-settings-ui.test.tsx tests/payment-history.test.ts`

Expected: all tests pass.

- [x] **Step 5: Commit the Billing page**

```bash
git add src/components/account/AccountBilling.tsx tests/account-settings-ui.test.tsx
git commit -m "feat(account): add billing settings page"
```

### Task 4: Replace the generic Clerk account shell

**Files:**
- Create: `src/components/account/TakeOneUserButton.tsx`
- Modify: `src/lib/clerkTheme.ts`
- Modify: `src/components/Header.tsx`
- Modify: `src/components/Account.tsx`
- Modify: `src/pages/Dashboard.tsx`
- Modify: `tests/account-settings-ui.test.tsx`
- Modify: `tests/ui.test.ts`

- [x] **Step 1: Write failing shared-shell tests**

Extend the Clerk mock so `UserButton.UserProfilePage` records page labels/URLs. Assert the shared wrapper registers built-in account and security routes plus `Preferences` and `Billing` in the approved order, all three application surfaces render `TakeOneUserButton`, `clerkAppearance` contains no case-insensitive `#2563eb`, `blue`, `rgb(37, 99, 235)`, or `hsl(...)` blue token, and the danger profile section is hidden.

- [x] **Step 2: Run the shell tests and confirm failure**

Run: `npx vitest run tests/account-settings-ui.test.tsx tests/ui.test.ts`

Expected: FAIL because the wrapper is missing and the current theme contains blue.

- [x] **Step 3: Implement the shared Clerk wrapper**

Render one `UserButton` with the common `afterSignOutUrl`, `userProfileProps`, and custom pages. Use Clerk's supported built-in page ordering entries and mount:

```tsx
<UserButton.UserProfilePage label="Preferences" url="preferences" labelIcon={<SlidersHorizontal />}>
  <AccountPreferences />
</UserButton.UserProfilePage>
<UserButton.UserProfilePage label="Billing" url="billing" labelIcon={<ReceiptText />}>
  <AccountBilling />
</UserButton.UserProfilePage>
```

Replace direct `UserButton` imports/usages in Header, Account, and Dashboard.

- [x] **Step 4: Make Clerk monochrome and remove account deletion**

Change `colorPrimary` and all active/focus/action selectors to `#151515`. Style inputs, buttons, navigation, cards, password form, and modal surfaces with the approved neutral palette. Set the supported danger profile section selector to `display: none`; keep Clerk password/session behavior intact. Preserve the clarified optional-password wording.

- [x] **Step 5: Run focused tests and scan for blue/em dashes**

Run:

```bash
npx vitest run tests/account-settings-ui.test.tsx tests/ui.test.ts
rg -n -i '#2563eb|blue|rgb\(37, *99, *235\)' src/lib/clerkTheme.ts src/components/account
rg -n '—' src index.html public README.md
```

Expected: tests pass; both searches return no matches.

- [x] **Step 6: Commit the account shell**

```bash
git add src/components/account/TakeOneUserButton.tsx src/lib/clerkTheme.ts src/components/Header.tsx src/components/Account.tsx src/pages/Dashboard.tsx tests/account-settings-ui.test.tsx tests/ui.test.ts
git commit -m "feat(account): redesign Clerk settings shell"
```

### Task 5: Apply preferences to a fresh Dashboard composer safely

**Files:**
- Modify: `src/pages/Dashboard.tsx`
- Modify: `tests/ui.test.ts`

- [x] **Step 1: Write failing initialization regressions**

Add cases that render Dashboard with non-default stored preferences and assert the initial mode/aspect/caption controls reflect them. Rerender with refreshed account data after the user changes a control and assert the user's selection remains. Switch the mocked Clerk user ID and assert the next account initializes once from its own settings. Assert shortcut hints are hidden when disabled and completed jobs navigate automatically only when `openFinishedInStudio` is true.

- [x] **Step 2: Run the Dashboard tests and confirm failure**

Run: `npx vitest run tests/ui.test.ts`

Expected: preference-specific cases fail against hard-coded Dashboard defaults.

- [x] **Step 3: Add one-time account initialization**

Extend the Dashboard `Me` type with `preferences`. Track the last initialized Clerk user ID in a ref. When authenticated data first resolves for a new account, set mode, aspect, and caption style exactly once. Never run that initialization again for query refreshes from the same account. Reset the fence when the Clerk user changes.

Conditionally render keyboard shortcut hints from `showShortcutHints`. At the existing completed-job transition, navigate to Studio only when `openFinishedInStudio` is true; keep the finished result visible on Dashboard when false.

- [x] **Step 4: Run Dashboard regression tests**

Run: `npx vitest run tests/ui.test.ts`

Expected: all Dashboard tests pass.

- [x] **Step 5: Commit Dashboard preference behavior**

```bash
git add src/pages/Dashboard.tsx tests/ui.test.ts
git commit -m "feat(create): apply saved creator defaults"
```

### Task 6: Verify the complete account experience and update the PR

**Files:**
- Modify only if validation exposes a defect in the files above.

- [x] **Step 1: Run complete local validation**

Run:

```bash
npm test -- --run
npm run build
npx convex codegen --typecheck=enable
npm run lint
rg -n '—' src index.html public README.md
```

Expected: full tests/build/typecheck pass, lint has no errors, and the em-dash scan is empty.

- [x] **Step 2: Run production-preview browser acceptance**

Start the production preview on a free localhost port. Verify Profile, Preferences save/reopen, Security Add password through client-side validation without submitting a real password, Billing, modal close/reopen persistence, keyboard navigation, and a narrow viewport. Confirm no blue account state and no delete-account section is visible.

- [x] **Step 3: Inspect and self-review the final diff**

Run:

```bash
git diff origin/codex/dashboard-simplification...HEAD --check
git status --short
```

Expected: no whitespace errors and only intentional source/spec/plan changes.

- [x] **Step 4: Push and inspect PR checks**

```bash
git push origin HEAD:codex/dashboard-simplification
gh pr checks 17 --watch
```

Expected: PR #17 remains ready for review and all configured checks pass. If a check fails because of this change, reproduce it locally, fix it, push, and watch again.
