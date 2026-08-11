# Design QA

- Date: 2026-08-11
- Browser: Codex in-app Browser
- Verified route: `http://localhost:5173/documents/{local-qa-document-id}`
- Source visual truth:
  `/Users/rahul/.codex/generated_images/019fe880-1347-7c32-bb6c-dcb022329b57/exec-4e942f75-1b17-4120-b22c-0d8cfbf5181f.png`
- Browser-rendered implementation:
  `docs/visuals/audit/2026-08-11-line-editor/02-after-desktop.png`
- Full-view comparison: `docs/visuals/qa/editor-option1-comparison-1440.png`
- Focused line-editor comparison:
  `docs/visuals/qa/editor-option1-lines-comparison.png`
- Additional implementation evidence:
  `docs/visuals/audit/2026-08-11-line-editor/03-after-1024.png`,
  `docs/visuals/audit/2026-08-11-line-editor/04-after-768.png`, and
  `docs/visuals/audit/2026-08-11-line-editor/05-after-360.png`

## Normalization and state

- Source pixels: 1487 x 1058.
- Implementation pixels: 1440 x 1024 for the desktop light and dark captures.
- CSS viewport: 1440 x 1024; the page reported device pixel ratio 2, while the
  in-app capture emitted one output pixel per CSS pixel.
- Density normalization: the source was scaled to 1440 x 1024 before the full-view
  comparison. The two line-editor crops were each normalized to 900 x 450 and
  stacked in one 900 x 900 comparison image.
- State: editable Light-mode draft, item-name field focused, three populated lines,
  and FastAPI-returned totals of `450.00 / 40.00 / 11.50 / 421.50`.
- Responsive captures use the same saved draft at 1024, 768, and 360 CSS pixels.

## Comparison history

### Pass 1 — blocked

- [P1] Unit-price and discount controls wrapped onto two visual rows.
  - Location: desktop line editor, `.money-input` and `.discount-input`.
  - Evidence: the first browser capture showed currency/type prefixes above their
    values, producing broken 88px rows that did not match the selected ledger.
  - Impact: financial columns were harder to scan and the editor looked visibly
    malformed.
  - Fix: changed both compound controls to explicit two-track CSS grids and placed
    validation messages on a separate full-width grid row.

### Pass 2 — passed

- Post-fix evidence: `docs/visuals/qa/editor-option1-populated-1440.png` and
  `docs/visuals/qa/editor-option1-lines-comparison.png` show each prefix, value,
  suffix, and line total on one aligned row.
- Browser geometry confirmed the first money, discount, and tax controls are each
  exactly 44px high; the 1440px page has `scrollWidth === clientWidth`.
- The focused item group has a visible 1px bottom border, a complete focus ring, and
  no later sibling painting over it.
- No actionable P0, P1, or P2 differences remain.

## Required fidelity surfaces

### Fonts and typography

- Source Sans 3 Variable is loaded locally for navigation, metadata, form controls,
  labels, and tabular data. Source Serif 4 Variable is limited to the document title
  and grand-total emphasis.
- Operational text is 15–16px, labels are 12–13px, controls are 44px high, and the
  desktop title is capped at 34px (30px on small screens and 28px at 430px).
- Weight, line height, tabular numerals, truncation, and hierarchy match the selected
  direction. The title no longer uses the earlier 44–58px scale.

### Spacing and layout rhythm

- The 240px desktop sidebar, compact 80px command bar, bounded editor, and 332px
  sticky summary reproduce the selected composition at 1440px.
- At narrower widths the summary becomes a bordered, max-width in-flow card with
  side margins. It never becomes a full-bleed bottom rectangle and does not overlap
  the document surface.
- Browser geometry showed no horizontal page overflow at 1440, 1024, 768, or 360
  CSS pixels. Mobile line items become single-column field groups rather than a
  squeezed table.

### Colors and visual tokens

- Light mode uses warm ivory/off-white surfaces, ink neutrals, and restrained forest
  green. Dark mode uses independent low-glare surface, border, text, and semantic
  accent tokens rather than inversion.
- Status, focus, validation, destructive actions, and saved state remain distinguishable
  by text/icon/shape as well as color.

### Image quality and asset fidelity

- The selected screen contains no raster imagery that needs reproduction.
- Visible UI icons use the existing Phosphor icon library consistently. The workspace
  and account initials remain semantic text avatars, matching the selected product
  context rather than substituting a fake logo asset.
- No inline SVG art, handcrafted SVG, CSS illustration, gradient decoration, emoji
  icon, or placeholder image was introduced.

### Copy and content

- The implementation keeps the selected document terminology and uses real API data.
- The generated option's illustrative line values were internally inconsistent with
  its displayed grand total; the implementation intentionally uses the assignment's
  exact server-calculated `421.50` fixture instead of copying that inconsistency.
- `Server calculated` remains explicit beside the total. Description stays visible as
  part of the permanent Item / description column; the redundant Columns menu has
  been removed.

## Interaction, responsive, and accessibility checks

- Created a local account and draft against FastAPI, entered three lines, and observed
  the exact `421.50` returned total.
- Entered tax percentages directly, then attempted a third fractional digit; the
  field remained `5.00`, proving the extra digit never entered form state.
- Verified the 850ms autosave reached `Saved just now` after the authoritative PATCH.
- Opened and closed Preview, opened and cancelled Finalize confirmation, and switched
  between Light and Dark modes.
- Verified the appearance controls remain icon-only, named, pressed-state aware, and
  reachable in the mobile bottom navigation.
- Verified named navigation, labelled fields, labelled dialogs, table semantics,
  `aria-live` save feedback, icon-only accessible names, visible focus, and no
  horizontal overflow at the required breakpoints.
- Browser console errors/warnings checked after the interaction pass: none.

## Automated evidence

- Vitest: 5 files, 35 tests passed, including decimal-entry blocking, manual tax,
  non-focus-stealing autosave validation, finalized read-only behavior, and mode
  migration.
- TypeScript: passed.
- ESLint: passed.
- Production Vite/Sites-compatible build: passed.
- Sites worker contract: 4 tests passed.
- FastAPI: 26 tests passed under explicit test/local service settings. The first
  unisolated run inherited developer `.env` values, so the recorded pass uses
  deterministic test environment overrides without changing local configuration.

final result: passed
