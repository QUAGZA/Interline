# Interline V2 accessibility notes

Verification target for the application chrome (not the editorial landing animation system). Playwright: `frontend/tests/e2e/accessibility.spec.ts`.

## Keyboard

- Primary nav (Markets, Public desk, Dashboard, network, account) is reachable with Tab in DOM order.
- Financial actions (Supply, Borrow, Repay, Withdraw, Liquidate) are real buttons/links, not click-only `div`s.
- Dialogs (connect, transaction review) trap focus and return it to the opener on close (Radix Dialog).
- Escape closes the topmost overlay.

## Motion

- `prefers-reduced-motion: reduce` disables scramble / split-flap / noise-driven motion on **financial** controls and tables.
- Landing editorial motion may remain on `/` only; application routes should not scramble balances or APYs.

## Viewport

- 320px width: no horizontal clip of primary actions; market/position tables collapse to cards; mobile menu is labeled (not icon-only).
- Sticky header is a single bar — no overlapping fixed chrome covering focusable controls.

## Names and status

- Buttons expose an accessible name (visible text or `aria-label`).
- Transaction status is per-tx, not a single global live region that overwrites a previous operation.
- Oracle/indexer failure is announced as unknown/stale, never as `$0`.

## Automated checks

Axe (wcag2a / wcag2aa) on `/`, `/markets`, `/desk`, `/dashboard` in disconnected state, plus 320px `/markets`. Color contrast on orange accent vs background can fail editorial pages; application tables should not rely on color alone for health (use the contract `liquidatable` boolean plus text).
