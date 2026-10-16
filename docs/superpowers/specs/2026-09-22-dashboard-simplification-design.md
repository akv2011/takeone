# Dashboard simplification design

## Goal

Make `/create` immediately understandable: choose a task, describe it, and run it. Preserve all generation, upload, clipping, assembly, branding, caption, aspect-ratio, Telegram and billing behavior.

## Interface

- Replace the large first-use guide and billing paragraph with a short `Create a video` heading.
- Use a compact director's dock with three explicit modes: Create, Edit and YouTube clip. Each control has an icon, accessible name and hover/focus tooltip.
- Keep the prompt and one mode-specific primary action visible.
- Put format, video source, captions and brand kit inside a collapsed Settings panel.
- Put assembly and Telegram beside Settings as compact tools. Their existing workflows open only when requested.
- Keep upload and rights confirmation contextual to Edit and YouTube clip.
- Keep errors and submission status visible because they require action.

## Visual direction

Retain TakeOne's off-white, black and electric-blue palette. Use the dock as the single signature element: a precise row of film-tool controls attached to the prompt card. Reduce nested cards, paragraphs and uppercase labels. Motion is limited to tooltip and disclosure transitions and respects reduced-motion settings.

## Accessibility and responsive behavior

Tooltips appear on hover and keyboard focus. Buttons retain visible short labels where meaning would otherwise rely on an icon, plus `aria-label` attributes. Disclosures expose `aria-expanded` and `aria-controls`. On narrow screens, the dock wraps without hiding controls.

## Acceptance

- No first-use card grid or long billing/Telegram explanation is visible by default.
- Create, Edit and YouTube clip remain selectable.
- Settings preserve all existing payload fields.
- Assembly and Telegram remain reachable in one click.
- Keyboard submission, account failures, billing failures and job history behave as before.

