# TakeOne Account Settings Redesign

**Date:** 2026-09-22
**Status:** Approved design
**Reference:** `.superpowers/brainstorm/53636-1790067453/content/account-combined-final.html`

## Problem

The current account modal exposes Clerk's default Profile and Security pages with visual treatment that does not match TakeOne. The active states introduced a blue accent, the password editor looks like a generic card placed inside another settings page, and the Security page repeats “Delete account” as both a section label and an action. Users also have no account-level place to choose recurring video defaults or inspect billing activity.

## Approved Direction

Keep the existing modal size, left sidebar, close behavior, Profile page, and Clerk-backed account security. Use a monochrome TakeOne treatment throughout the account modal. Add two useful pages so the sidebar contains, in order:

1. Profile
2. Preferences
3. Security
4. Billing

The account experience uses warm white, charcoal, neutral gray, hairline borders, and restrained monospace labels. It contains no blue foregrounds, backgrounds, borders, focus rings, or active states. Personality comes from filmmaker language, compact segmented controls, and precise typography rather than decorative color.

## Page Behavior

### Profile

Retain Clerk's supported profile controls for avatar, display name, email addresses, and connected Google account. Restyle the page to match the approved monochrome system. Do not duplicate profile data in Convex.

### Preferences

Add a custom Clerk profile page titled **Preferences**. It stores account-level defaults for:

- Starting point: Create, Edit, or YouTube
- Aspect ratio: 9:16, 1:1, or 16:9
- Caption style: Automatic, Clean, Bold pop, Pop-in, or None
- Open finished videos in Studio: on or off
- Show keyboard shortcuts: on or off

The page explains that these are starting values and can still be changed for an individual video. The save button is disabled until a value changes. A successful save updates the local form immediately and shows a quiet “Saved” status. Reloading the page or signing in on another device returns the saved values.

The Create dashboard reads these preferences only when initializing a fresh composer. It must not replace edits the user already made on the current page, change an in-flight submission, or affect queued jobs.

### Security

Retain Clerk's account security implementation for connected sign-in methods, password mutation, validation, device sessions, and sign-out operations. This preserves Clerk's security boundaries and avoids recreating sensitive authentication logic.

The page must:

- Explain that Google is connected and a password is optional.
- Label the action **Add password** for accounts without one.
- Render password entry as a calm inline panel inside the Security content area.
- Use the same field, border, typography, and button language as the rest of the account modal.
- Keep password visibility controls, confirmation validation, password rules, the other-device sign-out option, and Cancel.
- Remove the complete delete-account section from the rendered settings experience, including both its label and action.

TakeOne will not implement its own password storage, password verification, or session invalidation.

### Billing

Add a custom Clerk profile page titled **Billing**. It shows:

- Current free generations and purchased-credit balance
- Available credit packs using the existing configured pack data
- Paginated payment history using the existing owner-scoped payment query
- Existing payment states, refund amounts, dispute-review states, and eligible checkout resume actions
- A link to the full Pricing page for checkout

The settings modal will not add a second payment implementation. Checkout, resume, reconciliation, and fulfillment continue through the existing Dodo and Convex paths. If checkout remains disabled by merchant configuration, Billing shows balances and history while purchase actions remain unavailable with concise explanatory text.

## Component Structure

- `TakeOneUserButton` becomes the shared wrapper used by Dashboard, Header, and Account surfaces.
- The wrapper configures the common Clerk appearance and mounts the Preferences and Billing profile pages once.
- `AccountPreferences` owns preference loading, dirty state, validation, saving, and accessible status messages.
- `AccountBilling` composes existing credit-pack and payment-history data without duplicating payment rules.
- `clerkTheme` owns monochrome appearance and account wording. It hides Clerk's danger section and styles the password action panel.
- Convex `users` stores optional preference fields so existing rows require no data migration.

Each component must remain independently testable and must not depend on Dashboard-local state.

## Data Model and API

Add optional fields to each Convex user row:

- `defaultMode`: `edit | generate | clip`
- `defaultAspect`: `9:16 | 1:1 | 16:9`
- `defaultCaptionStyle`: `auto | clean | meme | karaoke | none`
- `openFinishedInStudio`: boolean
- `showShortcutHints`: boolean

`users.currentUser` returns normalized defaults when fields are absent. Existing users receive:

- Create
- 9:16
- Automatic captions
- Open finished videos in Studio
- Show shortcut hints

Add an authenticated `users.updatePreferences` mutation. It accepts only the supported enums and booleans, looks up the current identity's row, and rejects unauthenticated or missing-user requests. The mutation does not accept a user ID or account key from the browser.

Dashboard initializes its composer from `currentUser.preferences` once per authenticated account lifecycle. It must preserve explicit user interaction after initialization.

## Visual System

- Background: warm white `#f5f4f0` and white content surfaces
- Primary text and actions: charcoal `#151515`
- Secondary text: neutral gray
- Borders: low-contrast neutral gray
- Active navigation: charcoal background with white text
- Focus: visible charcoal outline with spacing from the control
- No blue tokens in any Clerk account component, custom account page, hover state, active state, focus state, or validation state
- Error states use text plus an icon and restrained dark red only where needed for comprehension

The sidebar remains visually stable while page content changes. On narrow screens it follows Clerk's supported responsive navigation rather than forcing a desktop sidebar.

## Error and Loading States

- Preferences uses a compact loading state that preserves the final layout dimensions.
- Save failures keep the user's unsaved selections and display a specific retryable message.
- An auth loss disables save and asks the user to sign in again.
- Billing distinguishes loading, empty history, disabled checkout, and provider action required.
- Payment refresh/resume failures use existing durable payment state and never fabricate a successful purchase.
- Clerk remains responsible for password validation and security errors; TakeOne only restyles and clarifies them.

## Accessibility

- Sidebar pages remain keyboard navigable through Clerk's profile navigation.
- Segmented controls expose one selected value and readable labels.
- Switches expose their state and have full text labels.
- Save results use an accessible status region.
- Password fields retain labels, autocomplete behavior, visibility controls, validation feedback, and keyboard operation.
- Monochrome states meet contrast requirements without relying on color alone.

## Validation

Automated coverage must verify:

- Preference defaults for legacy user rows
- Authentication and enum validation in `updatePreferences`
- Per-user isolation and persistence
- Dashboard initialization without overwriting subsequent user interaction
- Dirty, saving, saved, and failed-save preference states
- Billing owner scoping and existing history pagination behavior
- All application surfaces use the shared configured user button
- The Clerk danger section is absent and account appearance contains no blue token

Run the full root tests, frontend production build, Convex typecheck, lint, and existing CI. Browser acceptance must cover Profile, Preferences, Security password setup through validation without saving a real password, Billing, modal close/reopen persistence, keyboard navigation, and a narrow viewport.

## Scope Boundaries

- No public creator profile or public bio in this release.
- No custom password backend or replacement authentication provider.
- No account deletion workflow in the settings UI.
- No new Dodo checkout or payment-accounting path.
- No global site-theme selector.
- No production deployment or checkout enablement as part of implementation validation.
