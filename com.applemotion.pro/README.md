# Apple Motion UI — v0.2.0

A dockable After Effects panel that builds Apple-style UI components
procedurally, with a real motion system and animated previews.

Everything it builds is a named precomp driven by a **CONTROLLER** layer, so the
output stays editable after it's created: drag Width and the text, icon and
padding re-lay out; drag a spring's Strength and the bounce follows.

This release is the **component-quality** iteration (spec §24–§30): a shared
component/variant architecture, a centralized design-token system, an animation
preset engine, and — the headline — **animated previews you can watch before you
create anything**.

---

## What's new in 0.2

| Area | What landed |
|---|---|
| **Animated previews (§24)** | Hover any component tile and it plays its *actual* entrance — the card springs up, the notification drops in, the chart builds its bars, the toggle flips. Same physics the AE layer gets. |
| **Motion presets (§4)** | Ten presets — Apple / Soft / Smooth Ease, Fast Out, Soft In, Spring, Gentle / Strong Spring, Snappy, Elastic — each described by the full parameter set: Duration, Delay, Stagger, Easing, Spring Strength, Damping, Mass, Overshoot, Direction, Amplitude. |
| **Component builder (§25)** | The sheet is now Variant · Style · Content · Animation, with a live hero preview and a **Preview** button that plays the chosen animation before you commit. |
| **Variants (§26)** | One shared generator per component, variants are data. Card ×8, Button ×7, Notification ×7, plus Toggle, Chart, Progress, Badge — 36 variant configurations, no duplicated code. |
| **Design tokens (§27)** | Centralized spacing / radius / duration scales, a full type scale, seven glass materials, five elevation levels and ten palettes — one source of truth shared by the SVG preview and the AE output. |
| **Procedural charts (§30)** | Bar / line / area charts generated from a seed and animated with real Scale-Y and Trim-Paths — a live, editable composition, not baked frames. |
| **Default font** | Pick a default font in the builder; it's saved and used for every component you create. |

---

## The motion system

Every preset is the same ten parameters. Eased presets ride a cubic-bezier;
spring presets turn **Strength / Damping / Mass** into the coefficients of a real
damped oscillator:

```
ω = √(strength / mass)      freq = ω / 2π      decay = damping · ω
```

Those coefficients drive both the SVG preview (sampled in `js/data/motion.js`)
and the expression written onto the layer (`jsx/core/motion.jsx`), so what you
preview is what you get. The spring settle is an expression, not baked keyframes,
so **Overshoot**, **Damping** and the keyframe times all stay tunable afterward.

**Direction** and **Amplitude** choose the entrance: up / down / left / right
translate in from that side by `amplitude` px; `scale` grows from a smaller size;
`fade` is opacity only. **Delay** and **Stagger** offset the start — Stagger
spreads multiple selected layers.

Apply a preset two ways: open the **Motion** tab and click one to animate the
current selection, or set it per component in the builder's Animation section.

---

## Components

| Component | Category | Variants |
|---|---|---|
| **Glass Card** | Core UI | Basic · Glass · Dark · Light · Minimal · Elevated · Compact · Large |
| **Button** | Core UI | Primary · Secondary · Glass · Ghost · Icon · Pill · Floating |
| **Badge** | Core UI | Pill · Square · Glass · Success · Error · Warning |
| **Chart** | Data | Bars · Line · Area |
| **Progress** | Data | Bar · Ring |
| **Notification** | System UI | Minimal · Glass · System · Dark · Success · Error · Warning |
| **Toggle Switch** | System UI | Default · Large · Labelled |

The category chips above the grid filter by area; one search box still filters
name, category and tag across all three tabs.

---

## Install (development)

**1. Turn on unsigned extensions.**

macOS:
```bash
for v in 9 10 11 12; do defaults write com.adobe.CSXS.$v PlayerDebugMode 1; done
killall cfprefsd
```
Windows — in `regedit`, add String `PlayerDebugMode` = `1` under
`HKEY_CURRENT_USER/Software/Adobe/CSXS.9` … `CSXS.12`.

**2. Copy (or symlink) the folder** into the CEP extensions directory:
```
macOS    ~/Library/Application Support/Adobe/CEP/extensions/
Windows  %APPDATA%\Adobe\CEP\extensions\
```
```bash
./install.sh          # copies
./install.sh --link   # symlinks, so edits are live
```

**3. Restart After Effects** → `Window ▸ Extensions ▸ Apple Motion UI`.

### Developing without AE

Open `index.html` in a browser — the CEP bridge falls back to a mock host, so
the whole panel, the animated previews and the builder are fully developable
without launching After Effects. `.debug` also exposes CEF DevTools on port 8088.

---

## Using it

1. Open a comp. (Nothing builds without one — the status bar says so.)
2. **Hover** a tile to watch its entrance animation.
3. **Click** it to open the builder. Pick a Variant, adjust Style and Content,
   choose an Animation preset and tune its parameters. Hit **Preview** to replay.
4. **Create** — the component appears centred, selected, animated, and editable.

Every operation is a single undo step.

---

## Architecture

```
CSXS/manifest.xml       panel registration, host versions, geometry
index.html              markup
css/panel.css           AE-native chrome, chips, builder, play button
js/
  lib/cep-bridge.js     evalScript / theme / host info
  data/tokens.js        ← design tokens: spacing, radius, duration, type, glass, palettes
  data/motion.js        ← the ten presets + spring physics, shared with AE
  data/library.js       ← every component, variant and parameter
  data/previews.js      SVG previews with pv-* hooks for animation
  data/animator.js      Web Animations choreography — plays the entrance on hover
  app.js                browser, builder, hover previews, host calls
jsx/
  host.jsx              #includes everything, in dependency order
  api.jsx               the one function the panel calls; undo grouping; default font
  core/tokens.jsx       mirror of tokens.js on the AE side
  core/utils.jsx        comps, colour, controls, shapes, text, mattes, easing
  core/glass.jsx        blur + saturation + matte + tint + highlight stack
  core/motion.jsx       spring physics, entry animations, stagger (mirror of motion.js)
  core/actions.jsx      selection-based quick actions
  components/           card · notification · toggle · button · chart · progress · badge
```

### Adding a component

1. **`js/data/library.js`** — one entry with `params` (each tagged
   `group: 'content'|'style'|'variant'`) and an optional `variants` list. The
   builder lays itself out from that.
2. **`js/data/previews.js`** — a renderer that marks animatable parts with
   `pv-root` / `pv-item` / `pv-bar` etc.
3. **`jsx/components/yours.jsx`** — export `AMUI.Components.yours.create(p)`, drive
   layout from the CONTROLLER, and call `AMUI.Motion.animateLayer(layer, comp, p.anim)`.
   `#include` it in `host.jsx`.

### How the glass works

Not a translucent fill: an adjustment layer blurs *and lifts the saturation of*
whatever sits behind the component, an alpha matte clips that to the rounded
shape, and a tint plus a hairline edge light sit on top. The precomp is set to
Collapse Transformations so the blur reaches the layers underneath — don't turn
that off. `Actions ▸ Add glass` applies the same stack to your own layer.

---

## Against the spec

Delivered this iteration: animated component previews (§24) ✓ component builder
with variant/style/content/animation and preview-before-apply (§25) ✓ shared
variant architecture (§26) ✓ centralized design tokens (§27) ✓ the full ten-
parameter motion model with ten presets (§4) ✓ procedural charts (§30) ✓
saved default font ✓ multiple glass materials ✓ search by name/category/tag ✓.

Still open, and honest about it:

- **Component count.** Seven base components across 36 variant configurations,
  all fully built — short of the §30 target of 50 distinct components. The
  architecture is built to scale to that (variants and previews are data); the
  remaining iOS/fintech/media/social sets are the next pass.
- **Personal library.** Saving components to a searchable personal library
  (§30) isn't wired yet — only the default font persists so far.
- **`.zxp` signing.** Needs an Adobe code-signing certificate; `build-zxp.sh`
  wraps `ZXPSignCmd` once you have one.
- **Fonts.** Text targets the chosen family and falls back to whatever AE
  substitutes; bundle or require the font before shipping.
- **Windows untested.** No Mac-only paths, but it hasn't been run there.
- **Preview fidelity.** The hover/builder previews approximate spring overshoot
  with sampled keyframes; on very old CEF runtimes without the Web Animations
  API the previews render static and everything else still works.
