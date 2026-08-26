# GradientForge — v0.4.0

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

**The weights are normalised by the largest of them, not by their sum.** This
is the whole of the black-hole fix, and it is worth stating plainly because the
symptom looked like a colour bug and was not:

> `exp(-q)` reaches exactly 0.0 in float once `q` passes ~88. Push Blend down
> and Separation up and every weight underflows together; `sum(w)` reaches
> zero, and a guard like `max(sum, 1e-5)` then scales the numerator toward
> black. The soft curved edge of each hole was the isocontour where the
> underflow began.

Dividing numerator and denominator by the largest weight leaves the mean
identical — they scale together — but makes the largest weight exactly 1.0, so
`sum(w) >= 1` always and no epsilon is needed anywhere. Softmax stabilisation,
applied to the whole weight rather than only its Gaussian half. Measured on the
old arithmetic: at `q = 73` it darkened the result by 44 %, at `q = 400` by
98 %; the new one is flat.

Three more guards stop the other route to a black pixel. Out-of-gamut OKLab maps
to negative linear light, a negative through `pow()` on the way to sRGB comes
back NaN, and NaN renders black — and in a 32-bit float comp it travels down the
whole pipeline rather than stopping at the layer. So linear light is clamped at
the OKLab→RGB exit, again at the sRGB encode, and once more at the very end with
the `x != x` test, since this GLSL level has no `isnan`.

### The loop

The warp's sample offset travels a **closed circle** in noise space: at the end
of the cycle the field is exactly back where it started. Each colour point
orbits its home position at a whole harmonic of the loop — one, two or three
turns — so it lands back where it began too. The loop is exact by construction,
with no cross-fade anywhere.

`Motion` scales the orbit **radius**, not the rate. So Motion 0 is a true still
from the same engine, and turning Motion up can never break the loop.

### Where the colour points go

Home positions are spread **evenly** around the circle from one seeded rotation,
not drawn independently: independent angles let two points land on top of each
other, and then one colour becomes a blob sitting in a field of the other. With
a dark first colour — which most of the database's two-colour rows have — that
blob reads as a hole in the middle of the frame.

How far out they sit depends on how many there are. Two colours want to read as
a **sweep**, so their homes go outside the frame and the frame shows the
transition between them; five want to sit inside it. The falloff widens to
match, or the middle of a two-colour frame would belong to neither point.

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

394 palettes from the grading database, plus the six signature sets — 400 in
all. Search by name, mood or tag; filter by the chips; click a card to load it.
Fourteen source rows were left out: their two colours are within a hair of each
other in OKLab (`#000004` → `#000000` and the like), so they have no visible
transition and could only ever render as a flat field.

**They are still not assets.** A preset here is a name, a palette and a motion
profile: numbers and hex strings, about 45 KB for the whole library. Every card
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

## Geometry modes

A second generator, and it is **one** feature with three geometry sources
rather than three features: shape, curve and text all reduce to a signed
distance field, and the colour pipeline downstream never learns which one drew
it.

```
geometry source  →  raster  →  seed  →  jump flood  →  SDF  →  coordinate  →  colour
   (3 variants)                (one pipeline)                 (2 axes)      (unchanged)
```

| Mode | Geometry | Controls |
|---|---|---|
| **Curve** | A **mask path from the timeline**, picked in Path ▾ | **Spread** sets the falloff distance, not a rendered stroke; **Offset** moves the edge it is measured from |
| **Letter** | **A layer from the timeline** — its alpha is the shape | **Depth** and **Softness** give it volume; **Style** picks Surface or Refract |

**Shape was removed in v0.4.** It generated its own rectangles and ellipses
inside the plugin, and After Effects already makes those better with a mask —
so it asked the user to work in the wrong place. Curve covers the same ground
with geometry the user drew. Two modes were doing one job and the weaker one
went; the SDF pipeline it was built on carries Curve and Letter unchanged.

### Two axes, one slider

Every geometry exposes two scalars, and **Direction** blends between them:

- **across** (`d`) — the normalised signed distance. Colour flows perpendicular
  to the outline: the Contour behaviour.
- **along** (`t`) — arc length round a shape, start-to-end along a curve,
  position across the text.

One slider covers the whole useful range, which is why it is not two checkboxes.

### How the field is built

- **Jump flooding** on the GPU: 9 ping-pong passes for a 512-wide field, each
  looking at nine neighbours a halving step apart. A CPU transform would be
  correct and far too slow to stay interactive.
- Seeds are placed **sub-pixel**, nudged along the coverage gradient to where
  coverage would be exactly 0.5. An open curve has no interior to seed from, so
  its hairline centreline stands in as the boundary.
- `t` is not computed in the shader: it is **painted next to the outline** when
  the geometry is rasterised, each segment carrying a gradient from its own
  start to its own end, and the flood then hands every pixel the `t` of the
  outline point it belongs to. The glyph id rides along the same way, which is
  what makes per-letter offsets possible.
- The field is rebuilt **only when the geometry changes**. Animation never
  rebuilds it — the warp moves the sample coordinate, not the shape.
- Encoding is WebGL1-safe, no float textures: 16-bit distance in R,G, `t` in B,
  glyph id in A.
- The colour pipeline is untouched: same warp, same closed-circle loop, same
  dither, palette walked in OKLab in linear light.

### Curve reads the timeline

**The pen tool was removed in v0.6.** After Effects already has a mask tool,
with snapping, keyframes and every editing habit the user already has; a second
one inside the panel asked them to draw in the wrong place and then produced a
path nothing else in the project could see.

Instead, **Path ▾** lists every mask path in the comp, by layer and mask name.
Whatever is selected in the timeline is the default; picking another needs no
selection at all. Both halves resolve the choice the same way — the panel sends
the id it drew, so the build can never land on a different curve than the one on
screen, even if the selection moved in between.

The path comes back in comp space over frame height, with After Effects' own
**in and out tangents kept separate**. A mask point with a corner on one side
and a curve on the other is ordinary, and the pen's one-symmetric-handle model
would have quietly redrawn it. The points are re-read on every tick while the
Curve tab is open, so editing the mask in After Effects repaints the preview
with no click in the panel.

**Closure is read, never asked.** A closed path has an interior, so it mattes as
a filled region and its cyclic `t` is **mirrored** — `t` and `1-t` give the same
colour, and the seam disappears without needing the first and last colour to
match. An open path has no interior, so it is stroked and `t` runs end to end.
There is no Fill toggle and no Seam menu any more: both were the user restating
something the path already knew, and getting it wrong was silent.

**Offset** slides the boundary the ramp is measured from — in for positive, out
for negative. Natively that is a Simple Choker on the matte; in the preview it
is a constant added to the signed distance. Same control, same units.

One gap, stated plainly: **Direction is preview-only in the native build.** The
matte gives the shape and the mesh gives the colour, and getting a true `d`/`t`
ramp into After Effects needs a scriptable multi-stop gradient, which — see
*Limits* — it does not have. Spread, Offset and closure all reach the build.

### Letter has volume

The Letter tab does not author anything either. It takes **a layer**, not a text
layer — the pipeline only ever reads an alpha channel, so a shape layer or a
masked solid works exactly as well, and that is what the code calls it. A text
layer is the case it is for, and it is the only one that can hand the preview
its actual words, family and size, which it does: the preview sets the type that
is really in the comp instead of a placeholder the user had to type twice.

Volume comes out of two stock effects and nothing else:

```
GF MATTE — Letter    the alpha, filled white, CRISP — an alpha matte
GRADIENT — …         the colour field · CC Glass  (+ Displacement Map in Refract)
GF HEIGHT — Letter   the alpha, filled white, blurred by Softness · switched off
```

The height field is the layer's own alpha blurred by **Softness** — flat in the
middle of a stroke, falling off across its edge, so its slope is steepest
exactly where the edge is. That is the whole trick: CC Glass differentiates that
field into surface normals internally, and the bevel comes from the normals.

- **Surface** — the normals *light* the gradient. Diffuse and specular, so the
  edges catch and the middle stays flat. Embossed type.
- **Refract** — the normals *push* it. Displacement Map for the broad bend, CC
  Glass for the sharp lip. Type cut out of glass.

**Depth** drives both, and it scales the *slope*, not the height, so turning it
up sharpens the bevel instead of inflating the glyph. The height layer is
switched off: After Effects reads a map layer whether or not it is visible, and
a white slab of type on top of the gradient is not what anyone asked for.

The preview reproduces this rather than approximating it — the SDF already *is*
a height field, so the same normals fall out of it by sampling, which is the
same derivative CC Glass takes. One detail is worth stating because getting it
wrong makes the whole feature invisible: the shading is **normalised so a flat
surface comes out at exactly 1.0**. Without that the light points mostly at the
viewer, every flat pixel is already fully lit, and tilting the edges has almost
nothing left to give. Normalised, a flat interior keeps the colour it had and
only the slopes move — up on the lit side, down on the other. That contrast is
the volume. Measured: the edges shift 2.7 % of luminance against flat type,
peaking at 56/255, and **28×** more than the areas away from them.

The preview also composites through the glyph coverage over a neutral ground,
because that is what the build does with its track matte — a full-frame ramp
would have been showing something the comp never renders.

**Per letter is deferred.** It chose between one ramp per glyph and one ramp
across the word; the run now always reads as one gradient, and the volume
pipeline was the part worth shipping first.

### Verified

Measured against an analytic circle over 21,888 samples: **max error 0.7 px,
mean 0.37 px, sign 100 % correct** on a 512 × 384 field. Frame 0 and frame
`loopSeconds` are identical in all three modes (0–1 LSB, and that is the
time-seeded dither). At Grain 0 the 95th-percentile run of identical pixels
along a scanline is 2–4 px in every mode. Direction 0 and 100 differ by 83/255
in both geometry modes. Thirty animated frames rebuild the field zero times.
Across 420 Blend × Separation combinations on five palettes, and every one of
the 400 library presets at two points in its loop, no pixel is darker than the
darkest colour in its own palette.

Known and inherent: where a pixel is equidistant from two distant parts of an
outline — the medial axis — `t` jumps, and at high **Direction** that shows as a
crease. It is the same artefact every nearest-point contour gradient has,
including proGradient's.

### One Create, three sources

**Create gradient** does not know which tab is open. It asks the active tab for
its geometry, and builds:

```
geometry = activeSource().getGeometry()
if (!geometry.isValid) → show geometry.reason, stop
applyGradient(geometry, readSharedParams())
```

Each source answers for itself — Mesh has no geometry and is valid whenever a
comp is open; Curve wants a mask path in the timeline; Letter wants a layer. Validity is the *host's* call (`jsx/geometry.jsx` probes the real
selection on a 1.5 s timer), so the disabled button and the refused build can
never disagree: they quote the same sentence. A blocked **Create** prints its
reason under the button rather than only in a tooltip, and pressing it never
silently builds something else.

The colour field is identical in all three: same points, same orbits, same
loop. What Curve and Letter add is a **track matte** built from the user's own
layer — a duplicate with native effects on it, never a rasterised copy. Curve
fills a closed mask or strokes an open one (the one native way to get pixels out
of an open path); Letter uses the layer's alpha. The user's own layer is never
modified — every one of these is a duplicate. Curve's edge is then blurred by
live **Spread** and **Offset** sliders on the matte, which is what turns the
outline into a ramp; Letter's stays crisp, because its volume lives inside the
shape rather than on its silhouette.

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
  data/sdf.js             ← geometry raster → seeds → jump flood → SDF texture
  data/gradients.js       ← colour spaces, seeded RNG, presets, resolve()
  data/gradient-preview.js  the mesh engine as a fragment shader
  app.js                  the panel
jsx/
  host.jsx                #includes everything, in dependency order
  api.jsx                 the one function the panel calls; undo grouping
  core/utils.jsx          comps, colour, expression controls, blur, selection
  geometry.jsx            the three sources: probe · read · matte
  engine.jsx              the colour field, and what each source does with it
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
- **Direction is preview-only in the native build.** The matte gives the shape
  and the mesh gives the colour; a true `d`/`t` ramp in After Effects needs a
  scriptable multi-stop gradient, which — see below — it does not have. Spread,
  Offset, closure, Depth, Softness and Style all reach the build.
- **Per letter is deferred**, as above.
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
