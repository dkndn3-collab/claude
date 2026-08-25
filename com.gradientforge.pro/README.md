# GradientForge — v0.3.0

A dockable After Effects panel that generates gradient backgrounds — animated or
still — with one hard rule: **no gradient is ever an asset**.

There is no bitmap in this extension, no baked preview, no imported `.grd` or
`.css`, and nothing is rendered to disk. A gradient is a handful of numbers that
get turned into pixels twice: once by a shader in the panel, once by a stack of
native After Effects layers. Same numbers, same seed, same picture.

The output is not a black box either. What lands in your comp is solids, shape
layers, stock effects and expressions — every value still draggable afterwards.

---

## One engine

§5.1 asks for one engine done properly rather than a menu of modes, so there is
exactly one: a **mesh**. Two to five colour points, blended by Gaussian weight
in OKLab, with a low-frequency domain warp bending the field they sit in.
Linear, radial and conic are special cases of this — points locked to an axis,
a centre, an angular ring — and they arrive as presets, not as new code.

### Why it is built this way

§4.5 diagnosed the failure mode of the obvious pipeline, and every decision
here answers one line of it:

| The problem | What this does instead |
|---|---|
| High-frequency noise used as a **colour source** reads as smoke with a filter on it | Noise only ever moves coordinates. It is a domain warp at frequency ~1.15, two samples deep — it never picks a colour |
| A 1D luminance lookup (Colorama-style) bands and leaves dead mid-tones | Colour is mixed **2D spatially** between points. No lookup, no ramp, no luminance channel |
| sRGB interpolation turns blue↔orange into mud | The weighted mean is taken in **OKLab, in linear light**, then encoded back |
| 8-bit output bands on any smooth gradient | The output always carries **at least one LSB of dither** — the floor under the Grain slider |
| Blurring the result to "fix" it makes it more like smoke | Nothing is blurred to fix anything. The field is low-frequency from the start |

The Gaussian core carries an inverse-quadratic tail. A bare Gaussian underflows
far from every point, and where that happens the blend snaps between whichever
floor wins — a visible crease. The tail never reaches zero, so distant areas
fade into each other instead.

### The loop

The warp's sample offset travels a **closed circle** in noise space: at the end
of the cycle the field is exactly back where it started. Each colour point
orbits its home position at a whole harmonic of the loop — one, two or three
turns — so it lands back where it began too. The loop is exact by construction,
with no cross-fade anywhere.

`Motion` scales the orbit **radius**, not the rate. So Motion 0 is a true still
from the same engine, and turning Motion up can never break the loop.

---

## The panel

The canvas is the subject: a large, softly rounded surface with almost no chrome
on it, carrying only the preset name and a line of context. Everything else is
thin glass around it — low-opacity sheets, single hairlines, restrained blur and
a little ambient light rather than shadow.

Four sliders, and that is the whole surface:

| | |
|---|---|
| **Motion** | 0 = still · above 0 = animated, loop guaranteed |
| **Blend** | how far the colours reach into each other |
| **Flow** | how much the shape bends and drifts |
| **Grain** | texture, and the dither that kills banding |

Under them: a palette of 2–5 colour chips with **Shuffle**, and a persistent
action bar. Under **Advanced**: separation, loop length, seed, blend space,
linear blending, precomp on/off, name, and Export still frame. **Copy settings**
puts the parameter set on the clipboard as JSON.

Nothing on a slider label is a technical term — there is a Flow slider, not a
noise-frequency slider.

The chrome is achromatic and stays that way, including the ambient light. The
gradient is the only saturated thing on screen, because a coloured interface
shifts the colour judgement this panel exists to support.

---

## The library

408 palettes from the grading database, plus the six signature sets — 414 in
all. Search by name, mood or tag; filter by the chips; click a card to load it.

**They are still not assets.** A preset here is a name, a palette and a motion
profile: numbers and hex strings, about 46 KB for the whole library. Every card
in the shelf is *rendered* by the same engine the moment it scrolls into view —
there is no thumbnail anywhere in the extension. Tiles paint a few per frame, so
the shelf keeps scrolling while they arrive, and each one is drawn once.

The database's ten **motion profiles** are its vocabulary for movement, and each
resolves to this panel's own controls:

| Profile | Motion · Blend · Flow · Separation |
|---|---|
| `still_minimal` | 3 · 95 · 5 · 5 |
| `soft_dreamy` | 8 · 95 · 20 · 10 |
| `cinematic_slow` | 15 · 85 · 25 · 30 |
| `slow_organic` | 20 · 85 · 35 · 25 |
| `slow_separated` | 18 · 55 · 25 · 65 |
| `medium_flow` | 50 · 70 · 60 · 40 |
| `fast_flow` | 75 · 65 · 80 · 35 |
| `fast_energetic` | 85 · 55 · 85 · 55 |
| `fast_separated` | 90 · 40 · 85 · 80 |
| `neon_active` | 75 · 45 · 85 · 75 |

The loop length follows the speed — a slow move wants a long cycle — and the
seed comes from the row id, so a preset looks the same every time it is opened.

**Separation** arrived with the database and is a real engine parameter, not a
label: it tightens every colour point and thins the weighting tail, so the
palette reads as distinct masses rather than one continuous field. It is the
Metaball end of the same engine. It sits under Advanced, because the surface
keeps its four sliders.

---

## Colour

The panel's weighted mean can be taken in **OKLab**, **HCL** or **linear RGB**.
HCL here is polar OKLab, and it keeps the weighted mean *chroma* rather than
letting opposing hues cancel — which is what dulls a plain Lab mean.

A live WCAG contrast readout sits under the palette: the worst colour against
white and against black, so you know before you build whether text can sit on
this without a scrim.

**What After Effects can and cannot match.** No native effect composites in
OKLab, so the build cannot reproduce that part. What it does get is the exact
colour points and — with **Linear** on — linear-light compositing, which is the
half of §4.5 that actually causes the mud. The blend-space choice is therefore a
preview-side distinction, and the panel says so rather than implying otherwise.
Linear blending is a project-wide After Effects setting, so it is an explicit
switch, never a silent side effect; the result message tells you when a build
turned it on.

---

## What actually gets built

```
GF CONTROLLER   Motion · Blend · Flow · Grain · Separation · Loop · Seed
                + every colour
Grain           adjustment layer · Noise, never below one LSB of dither
Flow            adjustment layer · Turbulent Displace, low frequency
Colour n…1      one soft colour point each: ellipse + Fast Box Blur,
                position driven by a closed-orbit expression
Base            solid · Fill, the first colour under everything
```

Every effect parameter is an expression pointing at the controller, so Motion,
Blend, Flow, Grain, Loop, Seed and the colours all stay live after the build —
drag Blend in the Effect Controls panel and every point re-softens together.
Turn **Precomp** off and the same stack is built straight into the current comp,
at the bottom of the layer order.

**Export still frame** time-remaps the selected gradient layer to a hold at the
playhead: a frozen frame that is still a live, editable comp, not a render.

### How the two renderers line up

The panel's shader is the reference implementation. The build reproduces it with
the pieces After Effects actually has:

| Preview | After Effects |
|---|---|
| Gaussian weight per colour point | ellipse + Fast Box Blur, σ from the same Blend curve |
| normalised weighted average | over composite, first colour as the base |
| domain warp, frequency 1.15 | Turbulent Displace, Size ≈ 0.32 × comp height, Complexity 1 |
| warp offset on a closed circle | the same circle, as an expression on Offset (Turbulence) |
| dither floor of 0.9/255 | Noise at 0.35 % + Grain |

Both take their colour-point placement from `resolve()` in
`js/data/gradients.js`, so a point sits in the same spot in both.

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

**3. Restart After Effects** → `Window ▸ Extensions ▸ GradientForge`.

### Developing without AE

Open `index.html` in a browser — the CEP bridge falls back to a mock host, so
the whole panel and every preview are fully developable without launching After
Effects. `.debug` also exposes CEF DevTools on port 8089.

---

## Using it

1. Open a comp.
2. Click a preset, or set the palette yourself.
3. Move the four sliders. The preview is live — Shuffle until one lands.
4. **Create gradient**.

One undo step removes the whole thing.

---

## Architecture

```
CSXS/manifest.xml         panel registration, host versions, geometry
index.html                markup
css/panel.css             achromatic chrome, presets, palette, sliders
js/
  lib/cep-bridge.js       evalScript / theme / host info
  lib/controls.js         one labelled control per parameter definition
  data/library.js         ← the 408-palette database and its motion profiles
  data/gradients.js       ← colour spaces, seeded RNG, presets, resolve()
  data/gradient-preview.js  the mesh engine as a fragment shader
  app.js                  the panel
jsx/
  host.jsx                #includes everything, in dependency order
  api.jsx                 the one function the panel calls; undo grouping
  core/utils.jsx          comps, colour, expression controls, blur
  engine.jsx              the native layer stack
```

`js/data/gradients.js` is the contract between the two renderers: both read the
same parameter schema, the same colour maths and the same seeded placement.

One WebGL context renders everything — the hero and all six preset tiles — by
drawing into a shared surface and blitting, so the panel costs one context
rather than seven. Without WebGL it falls back to radial blobs on a 2D canvas:
palette and layout still read, the warp does not.

---

## Against the spec

Delivered: zero-asset generation (§1) ✓ one mesh engine, done to the §4.5
diagnosis — noise as warp only, 2D spatial colour mixing, OKLab in linear light,
permanent dither floor, no corrective blur (§5.1) ✓ 2–5 colour points with a
palette generator, Shuffle and a contrast warning (§5.2) ✓ still and animated
from one engine, exact loop by construction, seed lock (§5.3) ✓ every parameter
an expression on one controller (§5.4) ✓ the four-slider preset-first
achromatic panel with Advanced collapsed, Copy settings, Export still frame
(§7) ✓ editable native output — the "Convert to Editable Layers" promise,
except the output was never anything else (§4). Option B, as §6 recommends.

One deliberate departure: §2 ruled a preset library out of scope, on the
grounds that a library means shipping assets. The grading database is not that
— its rows are palettes and motion profiles, so the zero-asset rule (§1) is
untouched and the tiles are all live renders. The reason for the exclusion does
not apply, so the library is in.

### Honest limits

- **Not yet tested inside After Effects.** The panel is verified in a real
  browser — WebGL preview, animation, controls, error paths — and the
  ExtendScript side against a mock of AE's object model (layers, shape groups,
  effect groups, property value types), which proves the build logic and every
  generated expression but not render performance, and not that every effect
  index matches on every AE version. Lookups fall back from match name to index
  and every write is guarded, so a mismatch costs one parameter, not the build.
  **Spec step 2 — the performance prototype — is still the next thing to do.**
  The load is much lighter than the previous architecture (no displacement map,
  no vector blur, one low-frequency Turbulent Displace), but it is unmeasured.
- **The AE composite is an over composite, not a normalised weighted average.**
  Soft points over a base colour read the same way at normal Blend values; at
  very low Blend the topmost point dominates more than the preview shows.
- **OKLab compositing is preview-only**, for the reason given under Colour.
- **Magnetic and Contour** (§5.1 v2.0) need genuinely new code and are not here.
  Linear / Radial / Conic and the Metaball look are parameter restrictions of
  this engine and are not yet shipped as presets.
- **Trigger Layer** (§5.4 / §7 Advanced) is v1.5 and not started — though every
  parameter is already a controller slider, which is the hard half of it.
- **`.zxp` signing** needs an Adobe code-signing certificate; `build-zxp.sh`
  wraps `ZXPSignCmd` once you have one.
- **Windows untested.** No Mac-only paths, but it has not been run there.
- **`backdrop-filter` needs a recent CEF.** On an older CEP runtime the glass
  sheets fall back to their flat translucent fill, which is what the design
  rests on anyway — nothing disappears.
