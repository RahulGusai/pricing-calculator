# ADR 0004: Evolved Option 1 editorial workspace

- Status: Superseded in part by ADR 0005
- Date: 2026-08-10

## Context

The calculator needs the speed and density of a financial tool without feeling like
a generic admin template. The approved Option 1 exploration offered the strongest
hierarchy and trust cues, but needed a clearer distinction between editing and
finalized-document review.

## Decision

Evolve Option 1 into an editorial financial workspace. Use Manrope for interface and
tabular data, Newsreader selectively for document identity, warm paper-like surfaces,
deep ink neutrals, restrained accent color, and explicit textual state.

Support three modes with semantic purposes:

- light is the default operational editing workspace;
- dark is a functionally equivalent low-glare workspace; and
- reading is a reduced-chrome, non-editable document review presentation.

The same information architecture, component semantics, and status vocabulary carry
across modes. Reading mode removes editing controls as a deliberate review context;
it does not change the draft/finalized lifecycle state.

## Alternatives

A conventional card-heavy SaaS dashboard made the document itself secondary. A
purely editorial layout lacked sufficient density for line-item entry. Treating
reading as a palette-only theme failed to communicate finalized immutability.

## Consequences

The interface can combine calm hierarchy with efficient financial scanning. Every
component and semantic color requires light/dark verification, and reading mode needs
separate interaction tests to prove mutation paths are absent.

## Revisit triggers

Revisit if usability testing shows mode switching obscures document status, if the
editor cannot sustain larger line counts, or if measured contrast/readability targets
cannot be met without simplifying the palette.
