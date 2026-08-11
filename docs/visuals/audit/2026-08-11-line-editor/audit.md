# Line editor alignment and focus audit

- Date: 2026-08-11
- Surface: editable pricing-document line editor
- Browser: Codex in-app Browser
- Viewports: 1440 x 1024, 1024 x 900, 768 x 900, and 360 x 800 CSS pixels
- Goal: align headers and row content, restore deliberate row spacing, remove the
  Columns control, and ensure background autosave never steals focus.

## Steps and health

1. **Original populated editor — failed.**
   `01-before.png` confirms the two-line Item header sat above the other labels, the
   first item editor had only about 6px below the header divider, numeric labels did
   not share their row controls' horizontal centers, and Columns remained visible.
2. **Invalid new-line focus flow — passed after correction.**
   A new line was created, its item name was cleared, and focus was moved to the
   document title. After more than 1.5 seconds, the title retained focus, the item
   group reported `focus-within: false`, its neutral border remained visible, the
   inline validation error appeared, and no invalid PATCH was sent. The repaired
   state is captured in `06-focus-after-autosave.png`.
3. **Valid title and description flow — passed.**
   A new line was created, its item name and description were populated, and the
   Customer field was selected. After autosave completed, the Customer field remained
   active, the item group returned to its neutral border, and the save state reached
   `Saved just now`. The temporary line was then deleted and the three-line fixture
   restored.
4. **Desktop alignment — passed.**
   `02-after-desktop.png` shows one vertically centered header row. Browser geometry
   measured a 0px spread across all header centerlines, exact header-to-cell center
   matches for every grid track, and a 12px gap from the header divider to the first
   item editor. Columns is absent and the page has no horizontal overflow.
5. **Responsive layouts — passed.**
   `03-after-1024.png` retains the aligned table and 12px first-row inset without
   overflow. `04-after-768.png` and `05-after-360.png` switch to labelled line cards,
   keep the description visible, hide the desktop header, and report no horizontal
   overflow.

## Findings

### Strengths

- The same eight-track grid now supplies both header and row centers on desktop.
- Item and description remain grouped without sacrificing a clear 12px row inset.
- Background validation reports errors without moving the user's focus.
- The responsive card layout remains intact at tablet and mobile widths.

### Closed risks

- The Item/Description header is no longer a two-line outlier.
- Line total no longer shrinks to the right edge of its track.
- The 850ms autosave no longer invokes React Hook Form's focus-moving invalid-submit
  behavior.
- The redundant Columns disclosure and its non-functional checkboxes are removed.

### Evidence limits

- Screenshot evidence supports visual alignment and responsive reflow, while browser
  active-element and computed-style checks support focus behavior. This is not a
  claim of complete WCAG conformance.

## Automated evidence

- Vitest: 5 files and 35 tests passed.
- TypeScript: passed.
- ESLint: passed.
- Production build: passed.
- Sites worker contract: 4 tests passed.
- `git diff --check`: passed.

final result: passed
