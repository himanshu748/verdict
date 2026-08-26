# Verdict design system

## Thesis

- Product truth: A conclusion is trustworthy only when a maintainer can walk backward to the exact run, command and environment that produced it.
- Audience: Open source maintainers and senior engineers who understand CI and distrust opaque agent conclusions.
- Desired feeling: Calm forensic control. Uncertainty is visible and confidence is earned.
- Primary action: Inspect the demo case.
- Visual concept: From contact sheet to case file.
- Primary archetype: Technical instrument.
- Secondary influence: Editorial narrative.
- Page silhouette: An asymmetric opening follows one case from reported uncertainty to reviewable evidence. The product keeps a persistent case spine.
- Type strategy: Space Grotesk for display, body and controls. Space Mono for commands, hashes, rates and run data.
- Material and color language: Warm film-base black, developed amber and evidence paper, with an accessible paper mode for light preference. Fine rules and 2px corners make the interface feel like lab equipment.
- Media strategy: Generated exposure texture supports a real code-native matrix. Claims, controls and evidence remain selectable HTML.
- Signature moment: Matrix cells develop from low exposure as run records arrive. The leading tested condition receives one grease-pencil circle.
- Three cliches to avoid: a centered hero over a floating dashboard, a three-card feature grid and invented customer proof.

## Content hierarchy

The public page follows this order:

1. State the promise and expose a working condition matrix in the first viewport.
2. Show the product contract from GitHub issue to bounded experiment, evidence packet and reviewable verdict.
3. Show how one issue becomes a bounded investigation contract.
4. Trace a selected condition to its command and schema-valid simulated run records.
5. Show that partial, weak, unresolved and not-reproduced outcomes remain honest results.
6. Explain the read-only default and the approval boundary.
7. Invite the visitor to inspect the complete simulated fixture case.

The product case shell follows this order:

1. Contract: repository support, command, signature, matrix, budget and permission mode.
2. Hunter: simulated matrix structure, exposure grid and selected-run evidence.
3. Surgeon: chronology sample, static-diff suspect and a documented suspect range.
4. Insurance: conceptual regression plan and disabled publication controls.
5. Verdict: simulated evidence artifact and approval-gated publication manifest.

If reproduction is not pinned, the case moves directly to a complete partial verdict. Later phases must not look broken or empty.

## Tokens

| Token | Value | Purpose |
|---|---|---|
| Canvas | `oklch(0.14 0.01 70)` / `#0C0805` | Dark page and application background |
| Surface | `oklch(0.19 0.015 70)` | Instrument panels and rails |
| Text | `oklch(0.96 0.01 70)` / `#F6F1EB` | Primary text on dark surfaces |
| Muted | `oklch(0.72 0.02 70)` | Secondary text on dark surfaces |
| Line | `oklch(0.36 0.025 70)` | Borders and quiet dividers |
| Signal | `oklch(0.78 0.15 70)` / `#F4A437` | Confirmed reproduction and developed exposure |
| Active | `oklch(0.68 0.18 45)` | Work in progress and the publication action |
| Clean | `oklch(0.69 0.12 145)` | Verified clean history and post-fix proof only |
| Focus | `oklch(0.76 0.13 235)` | Keyboard focus only |
| Error | `oklch(0.55 0.22 25)` light / `oklch(0.72 0.16 25)` dark | Invalid configuration or execution error |
| Paper | `oklch(0.97 0.012 75)` | Evidence documents and light-mode canvas |
| Paper text | `oklch(0.20 0.015 70)` | Evidence-document text and light-mode foreground |

Body text uses `Text` or `Muted`. `Line` is never used for small text. Exposure intensity does not rely on red or green.

## Typography

- Display: Space Grotesk, 650 to 700 weight, tight tracking and a maximum two-line hero.
- Heading: Space Grotesk, 600 weight.
- Body: Space Grotesk, 400 to 500 weight and a 1.55 line height.
- Label: Space Grotesk, 600 weight, compact size and restrained tracking.
- Data: Space Mono, 400 to 500 weight with tabular numerals.
- Buttons and inputs use explicit UI sizes. Browser-default typography is not accepted.

## Shape and spacing

- Base spacing unit: 4px.
- Primary content width: 1440px maximum.
- Corners: 2px for surfaces, controls and frames. Evidence paper stays square.
- Depth: hierarchy comes from tone, lines and spacing. No drop shadows, glass or glow.
- Navigation height: 72px desktop and 64px mobile.

## Component families

- Navigation: brand, essential anchors and one repository action.
- Buttons: active filled, quiet outlined and text-link variants. Each has hover, focus, pressed and disabled states.
- Exposure frame: condition label, generated texture, outcome word, glyph and observed-run count.
- Evidence inspector: command, environment, commit, signature match and bounded output.
- Status strip: Now, Waiting on and Completed.
- Case phase navigation: Contract, Hunter, Surgeon, Insurance and Verdict.
- Evidence paper: conclusion, tested envelope, history result, proposed regression plan and record references.
- Approval panel: exact repository, branch, file list, manifest hash and action.

Icons use Phosphor at a consistent regular stroke. State is always expressed with a word and a glyph.

## Responsive rules

- The layout supports 360px through 1440px without page overflow.
- At 1180px and above, the landing hero uses a 43/57 split.
- At 1024px, the hero and case workbench reflow to one column to keep all evidence visible.
- At 768px, the matrix remains the primary visual and copy width narrows before the layout stacks.
- Below 768px, the case rail becomes a compact header. Phase navigation moves to a fixed bottom bar.
- Mobile Hunt shows one selected exposure at full width, a horizontal film strip for the remaining conditions and an evidence sheet below.
- Desktop evidence inspectors become bottom sheets on mobile. Touch targets are at least 44px.
- The mobile page is recomposed, not a shrunken desktop dashboard.

## Motion

- New run records develop a frame through opacity over 400ms.
- The promoted-cell circle draws once over 600ms.
- History results resolve from oldest to newest with a short stagger.
- Evidence paper appears only after the reducer reaches a terminal result.
- Motion communicates hierarchy or a state transition. It never simulates progress.
- `prefers-reduced-motion` turns every transition into an immediate state change.

## Interaction states

- Loading: skeleton frames retain the final geometry and state that execution has not completed.
- Empty: explain the supported issue contract and provide an issue URL action.
- Error: show the failed stage, bounded reason and recovery action.
- Unresolved: distinguish build or classification failure from a passing run.
- Partial: preserve completed evidence and stop localization.
- Success: show observed counts and link every claim to its records.
- Approval denied: preserve the evidence and report that no public write occurred.

## Accessibility and shipping gate

- Semantic landmarks, native controls and associated form labels are required.
- Every interaction is keyboard accessible with a 2px `Focus` outline.
- Body and control contrast must meet WCAG AA.
- Color, exposure and motion are never the only state signal.
- The approval action cannot trigger from an unrelated Enter key press.
- Test at 360px, 768px, 1024px and 1440px.
- Inspect light evidence paper and the dark application separately for contrast.
- Do not ship dead buttons, fabricated metrics, placeholder media or claims without evidence.
