# Apple Motion UI — v0.3.0

A dockable After Effects panel that builds Apple-style UI components
procedurally, with a real motion system, animated previews, and a procedural
gradient generator that ships zero image assets.

Everything it builds is a named precomp driven by a **CONTROLLER** layer, so the
output stays editable after it's created: drag Width and the text, icon and
padding re-lay out; drag a spring's Strength and the bounce follows.

0.3 adds the **Gradient** tab: animated or still gradient backgrounds generated
from noise functions and native effect chains, with no bitmap anywhere in the
extension — see [Procedural gradients](#procedural-gradients-gradientforge).

---

## What's new in 0.3

| Area | What landed |
|---|---|
| **Procedural gradients** | A whole tab: three generator modes, 2–8 colour stops, OKLab/HCL blending, seeded reproducibility, seamless loops, and a live canvas preview that renders the same maths the AE build does. Zero assets — see below. |
| **Shared controls** | `js/lib/controls.js` — one control builder for both builders, now with colour swatches. |

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

## Procedural gradients (GradientForge)

The **Gradient** tab generates gradient backgrounds — animated or still — with
one hard rule: **no gradient is ever an asset**. There is no bitmap in this
extension, no baked preview, no imported `.grd` or `.css`, and nothing is
rendered to disk. A gradient is a handful of numbers that get turned into pixels
twice: once by a canvas in the panel, once by a stack of native After Effects
effects. Same parameters, same seed, same picture.

That also means the output is not a black box. What lands in your comp is
solids, stock effects and expressions — every value still draggable afterwards.

### The three modes

| Mode | What it is | How it is built |
|---|---|---|
| **Linear** | Exact geometric ramp, linear or radial. The speed reference. | Gradient Ramp (2 stops) or 4-Color Gradient, anchors on the Angle/Spread axis |
| **Noise Field** | Organic colour fields — fractal turbulence over the ramp. | + Turbulent Displace + Fast Box Blur |
| **Flow Field** | The fluid look: the colour is advected by a second, animated field. | + a hidden Fractal Noise `FIELD` layer driving Displacement Map and CC Vector Blur |

All three share one parameter set — Seed, Scale, Complexity, Warp, Softness,
Grain, Speed, Loop, Angle/Spread — and one colour system.

### Colour

Stops are interpolated in **RGB, HSL, OKLab or HCL** (HCL here is polar OKLab:
hue, chroma, lightness). Perceptual blending happens in the panel, not in
ExtendScript, and for a specific reason: **After Effects blends colour in sRGB.**
So the panel subdivides your 2–8 stops in OKLab or HCL first and hands the host
colours it only has to blend over short distances, where sRGB and OKLab agree to
the eye.

The palette buttons — Analogous, Complementary, Triadic, Monochrome — rebuild
the whole stop list from the first colour, walking lightness and chroma across
the set so it reads as a designed ramp. Under them is a live WCAG contrast
readout: the worst stop against white and against black, so you know before you
build whether text can sit on this without a scrim.

### Motion

`Speed` above zero animates it; `Loop` sets the cycle length. The loop is
**seamless by construction**, not by crossfade: evolution covers a whole number
of revolutions per cycle and Cycle Evolution is switched on with the same
number, so the last frame of the loop is the first frame again, exactly. Set
Speed to 0 and you get a still from the same engine.

`Seed` locks it. Same seed plus same parameters is the same gradient, months
later — which is what makes a client's approved background reproducible.

**Freeze as still** time-remaps the selected gradient layer to a hold at the
playhead: a frozen frame that is still a live, editable comp, not a render.

### What actually gets built

```
GF CONTROLLER    every parameter as a slider or colour control
Grain            adjustment layer · Noise
Warp             adjustment layer · Displacement Map + CC Vector Blur (flow)
                                    Turbulent Displace + Fast Box Blur
Colour Mix       4-Color Gradient for stops 5–8, mixed through…
Mix Matte        …a Fractal Noise luma matte
Colour Base      Gradient Ramp (2 stops, exact) or 4-Color Gradient
FIELD            Fractal Noise, video off — the flow mode's vector source
```

Every effect parameter is an expression pointing at the controller, so Angle,
Speed, Seed and the colours all stay live after the build. Turn **Precomp** off
and the same stack is built straight into the current comp, at the bottom of the
layer order.

### The constraint that shaped this

After Effects has **no scriptable multi-stop gradient**. Colorama's output cycle
and a shape layer's gradient stops are both unreachable from ExtendScript. The
two colour engines that *are* scriptable are Gradient Ramp (2 stops) and
4-Color Gradient (4 anchors) — which is why the panel resamples perceptually
before sending, and why stops 5–8 arrive as a second 4-Color Gradient layer
mixed in through a noise luma matte rather than as more stops on one effect.

### Honest limits

- **Not yet tested inside After Effects.** The panel side is verified in a real
  browser and the ExtendScript side against a mock of AE's object model
  (layers, effect groups, property value types) — enough to prove the build
  logic and every generated expression, not enough to prove render performance
  or that every effect index matches on every AE version. Effect lookups fall
  back from match name to index and every write is guarded, so a mismatch costs
  one parameter, not the build. **Spec step 2 — the performance prototype — is
  the next thing to do**, and Flow mode is where it will hurt: Displacement Map
  plus CC Vector Blur plus Turbulent Displace is the heaviest chain here.
- **Preview fidelity is close, not exact.** The canvas mirrors the chain stage
  for stage — inverse-square anchor blending for 4-Color Gradient, fbm domain
  warp for Turbulent Displace — but AE's noise is not this noise. Treat the
  preview as a faithful sketch of the look, not a frame-accurate proxy. Softness
  is approximated by render scale rather than a real blur.
- **Mesh, Plasma, Metaball and Magnetic modes** (spec §5.1) are not here; the
  MVP is the three modes the roadmap asks for.
- **Trigger Layer** (spec §5.4, driving parameters from another layer's
  brightness or audio) is v1.5 and not started — though every parameter is
  already a controller slider, which is the hard half of it.

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

For a background, open the **Gradient** tab instead: pick a preset or a mode,
set the colours, and hit **Create gradient**.

Every operation is a single undo step.

---

## Architecture

```
CSXS/manifest.xml       panel registration, host versions, geometry
index.html              markup
css/panel.css           AE-native chrome, chips, builder, play button
js/
  lib/cep-bridge.js     evalScript / theme / host info
  lib/controls.js       ← one labelled control per parameter, shared by both builders
  data/tokens.js        ← design tokens: spacing, radius, duration, type, glass, palettes
  data/motion.js        ← the ten presets + spring physics, shared with AE
  data/library.js       ← every component, variant and parameter
  data/previews.js      SVG previews with pv-* hooks for animation
  data/animator.js      Web Animations choreography — plays the entrance on hover
  data/gradients.js     ← gradient maths: colour spaces, seeded RNG, presets, resolve()
  data/gradient-preview.js  canvas renderer — the same gradient, drawn in the panel
  gradient.js           the Gradient tab
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
  gradient/engine.jsx   the native effect chain: solids, effects, expressions
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

Delivered in 0.3, against the procedural gradient spec: zero-asset generation
(§1) ✓ three generator modes — Linear, Noise, Flow (§9 MVP) ✓ RGB/HSL/OKLab/HCL
interpolation (§5.2) ✓ 2–8 colour stops with a palette generator and a contrast
warning (§5.2) ✓ still and animated from one engine (§5.3) ✓ seamless loop and
seed lock (§5.3) ✓ expression-driven parameters on a single controller (§5.4) ✓
editable native output — the "Convert to Editable Layers" promise, except the
output was never anything else (§4). Option B was taken, as the spec recommends
(§6); the open items are listed under
[Honest limits](#honest-limits) above.

Delivered in 0.2: animated component previews (§24) ✓ component builder
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
