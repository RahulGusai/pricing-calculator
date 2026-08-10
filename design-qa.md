# Design QA

- Date: 2026-08-10
- Browser: Codex in-app Browser
- Verified route: `http://localhost:5173/documents/sample-draft`
- Browser viewport reported by the page: 1280 x 720 CSS pixels
- Reference: `docs/visuals/revised-option-1.png`
- Implementation captures: `docs/visuals/editor-light.jpg`,
  `docs/visuals/editor-dark.jpg`, `docs/visuals/editor-reading.jpg`, and
  `docs/visuals/editor-light-summary.jpg`

## Comparison history

### Pass 1

The generated reference and live light-mode editor were inspected together. The
implementation matched the target's warm editorial surface, Manrope/Newsreader
hierarchy, forest accent, left register navigation, visible lifecycle state,
compact pricing controls, and restrained 1px dividers.

Two concrete defects were found:

1. At the available 1280px viewport, fixed line-item column widths extended beneath
   the calculation rail. The editor now moves the rail below the document at 1340px
   and uses a tighter desktop column grid. Browser geometry then showed every line
   control contained within the 937px row and no horizontal page overflow.
2. Reading mode's formatted unit prices inherited the editable currency-prefix box.
   The selector now targets only the actual `aria-hidden` prefix, leaving review
   values as clean text.

### Pass 2

Light, dark, and reading captures were inspected after both fixes. Light preserves
the approved paper/ink hierarchy. Dark uses purpose-built surface, text, border, and
accent tokens rather than inversion. Reading removes the sidebar and editing
controls, increases editorial emphasis, preserves document status and totals, and
keeps the appearance switch available as an exit.

The reference uses a wide sticky totals rail. At this browser width the implemented
rail intentionally becomes a full-width audit section below the document; at wider
desktop breakpoints the side rail returns. This is a responsive hierarchy change,
not missing content.

## Interaction checks

- Signed in with the deterministic demo account and reached the protected document
  register.
- Opened the assignment sample and verified `450.00 / 40.00 / 11.50 / 421.50`.
- Changed Widget A from `100.00` to `110.00`; autosave returned
  `470.00 / 42.00 / 12.40 / 440.40`; restored `100.00` and the exact reference total.
- Opened and closed the printable preview with line-level calculations.
- Switched between light, dark, and reading modes and verified persistent mode state.
- Opened a finalized document, confirmed mutation inputs were absent, and duplicated
  it into a new editable draft.
- Ran the inclusive report, filtered to finalized Acme documents, and verified one
  `$1,100.00` result with Beacon excluded.
- Confirmed the hidden second-tenant fixture never appeared in documents or reports.

## Accessibility and diagnostics

- The live DOM exposed named navigation, form inputs, mode buttons with
  `aria-pressed`, status feedback with `aria-live`, a labelled calculation region,
  table semantics, labelled dialogs, and named icon-only actions.
- Keyboard focus styles and reduced-motion rules are defined globally. Add-line has
  a keyboard shortcut, and reordering has keyboard-operated move actions.
- The browser console contained Vite connection/HMR messages and the React DevTools
  development notice only; no runtime errors or warnings were observed.
- The implementation contains no inline SVG artwork, CSS illustration, decorative
  gradient, emoji icon, or placeholder image; visible icons come from Phosphor.

## Automated evidence

- Pricing/API tests cover fixed-point rounding, lifecycle conflicts, ownership
  isolation, duplication, and inclusive reports.
- Editor component tests cover the reference total, autosave/recalculation, reading
  mode, and finalized read-only behavior.
- TypeScript, ESLint, production build, and hosting-worker checks pass in the final
  verification run recorded in the handoff.

final result: passed
