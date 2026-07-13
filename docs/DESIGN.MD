---
name: GraphLoom
colors:
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#393939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1c1b1b'
  surface-container: '#201f1f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353534'
  on-surface: '#e5e2e1'
  on-surface-variant: '#c4c7c8'
  outline: '#8e9192'
  outline-variant: '#444748'
  primary: '#fdfdfc'
  on-primary: '#2f3131'
  primary-container: '#e0e0e0'
  secondary: '#c8c6c5'
  on-secondary: '#313030'
  error: '#ffb4ab'
  on-error: '#690005'
  background: '#131313'
  on-background: '#e5e2e1'
  surface-variant: '#353534'
typography:
  headline-lg:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Space Grotesk
    fontSize: 24px
    fontWeight: '500'
    lineHeight: '1.3'
  headline-sm:
    fontFamily: Space Grotesk
    fontSize: 18px
    fontWeight: '500'
    lineHeight: '1.4'
  body-lg:
    fontFamily: JetBrains Mono
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '400'
    lineHeight: '1.5'
  label-caps:
    fontFamily: Space Grotesk
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1'
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  node-padding: 12px
  gutter: 16px
  panel-margin: 24px
  container-gap: 8px
---

## Scope note — read this before applying anything below

This spec covers exactly **four real surfaces** in the actual GraphLoom playground: the top bar, the node canvas (and its four node card types), the code pane, and the drift banner / diff view. It does **not** cover — and nothing below should be used to justify building — a Workspace/Explorer/Terminal nav, a Library sidebar of draggable assets, file tabs, breadcrumbs, a Properties/Inspector panel, a Logic Editor, an Execution Output console, a Deploy button, user avatars, or a memory usage meter. Those came from an earlier Stitch exploration that imagined a larger IDE-and-runtime product. GraphLoom is a two-pane sync demo, not an IDE. If anything below seems to imply one of those excluded elements, ignore that implication and default to what actually exists in the app.

## Brand & Style
The design system is engineered for technical precision and high-density information management. It targets software engineers evaluating a synchronization engine — a reliable, distraction-free environment, not a marketing surface.

The aesthetic is **Industrial Minimalism**: technical schematics and high-end hardware interfaces. Structural clarity through a rigid, bordered layout rather than depth through shadows. No decorative flourishes — every visual element serves the node-to-code synchronization workflow.

## Colors
Warm monochrome foundation for long-duration reading. Deep charcoal background, soft off-white text — high legibility without harsh contrast.

Accent colors are strictly functional and desaturated, mapped to node types and port data types:
- **INPUT**: Muted Blue `#5C7C99`
- **FETCH**: Muted Purple `#7D6B91`
- **TRANSFORM**: Muted Amber `#B58B5C`
- **OUTPUT**: Muted Green `#6B8E6D`
- **Port/data types**: same family — String: Blue, Number: Amber, Object: Purple, Boolean: a desaturated red, Array: a desaturated teal (pick one consistent with the palette above, don't introduce a new hue family)

## Typography
Dual-font strategy. **Space Grotesk** for structural UI — top bar label, node headers, section labels, the conflict banner's heading. **JetBrains Mono** for everything data-rich — node body text, port labels, and the entire code pane.

Monospace ensures vertical alignment stays legible for scanning variable names and logic flows. Headings use tight letter-spacing for a compact, engineered look — never loose or airy.

## Layout & Spacing (real GraphLoom layout, not the Stitch IDE mockup)

The actual layout is a **two-pane split**:
- A thin top bar (product name left, sync status indicator right)
- **Left pane (~60% width): the node canvas** — React Flow, with the four node types, edges, and a minimap
- **Right pane (~40% width): the code editor** — Monaco, showing generated TypeScript
- A **non-blocking drift banner** that can appear (not a separate page — an overlay/inset element that doesn't cover the canvas or code pane) when a conflict is detected, containing the diff view

4px base grid for spacing. Nodes snap to an 8px grid on the canvas. Edges are 1px lines. Margins between the top bar, panes, and viewport edge stay a consistent 16px (`gutter` token). No sidebars, no breadcrumbs, no file tabs — there's exactly one file being synced, showing it as a tab implies multi-file support that doesn't exist.

## Elevation & Depth
Depth via **tonal layering and borders**, not shadows.
- **Level 0 (canvas):** base layer, `surface-container-lowest`.
- **Level 1 (panes/banner):** raised off the canvas with a 1px border (`outline-variant`) and a slightly lighter fill (`surface-container-low`).
- **Level 2 (nodes, conflict entries):** highest tier, sharp 1px border (`outline-variant`).

Selected/active states: a 1px solid border using `on-surface` (the primary text color) — "lifting" without a drop shadow.

## Shapes
"Softened Industrial." Nodes, panes, and buttons use `rounded.lg` (1rem / ~16px — adjust to the smaller end, ~10px, if 16px reads too soft against the sharp borders; test both against a real screenshot). Small utility elements (chips, port markers, toggle buttons) use `rounded.sm` (4px) for a sharper, more precise feel.

## Components

### Nodes
Header with a 2px top border in the node's semantic accent color (per the Colors section), body in `body-md`/`code-sm`. Background `surface-container-low`, border `outline-variant`. Input ports on the left, output ports on the right, each a small colored dot matching its `PortType`.

### Buttons
- **Primary** (e.g. "Keep Graph"/"Keep Code" in the conflict banner): solid `primary` fill, `on-primary` text, no border.
- **Secondary**: transparent fill, 1px `outline-variant` border, `on-surface` text.
- **Ghost** (canvas zoom controls, minor toggles): no fill or border, text/icon color only.

### Inputs & Fields
Background `surface-container-lowest`, border `outline-variant`. On focus, border shifts to the relevant semantic accent (e.g. Muted Blue for a string-typed field). Typography always `code-sm`.

### Connections (edges)
1px dashed lines. During an active sync, the dashes animate in a slow, continuous crawl — this is the one place ambient motion is appropriate, since it's communicating real state ("data is flowing"), not decoration.

### Chips / Badges
Node-type labels (INPUT/FETCH/TRANSFORM/OUTPUT) and port-type indicators: small, `rounded.sm` containers, low-opacity fill of the semantic accent color, 11px monospaced uppercase text.

### Diff view (extends the above, specific to the conflict banner)
Unified diff style — removed lines get a low-opacity wash of a desaturated red background with a `-` prefix, added lines a low-opacity wash of the TRANSFORM/amber or a distinct desaturated green, unchanged lines neutral (`on-surface-variant`, no background). Uses `code-sm` throughout. Truncation affordance ("View Full / Collapse") styled as a Ghost button.