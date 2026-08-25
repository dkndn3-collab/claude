# GradientForge — v0.1.0

A dockable After Effects panel that generates gradient backgrounds — animated or
still — with one hard rule: **no gradient is ever an asset**.

There is no bitmap in this extension, no baked preview, no imported `.grd` or
`.css`, and nothing is rendered to disk. A gradient is a handful of numbers that
get turned into pixels twice: once by a canvas in the panel, once by a stack of
native After Effects effects. Same parameters, same seed, same picture.

That also means the output is not a black box. What lands in your comp is solids,
stock effects and expressions — every value still draggable afterwards.

---

## The three modes

| Mode | What it is | How it is built |
|---|---|---|
| **Linear** | Exact geometric ramp, linear or radial. The speed reference. | Gradient Ramp (2 stops) or 4-Color Gradient, anchors on the Angle/Spread axis |
| **Noise Field** | Organic colour fields — fractal turbulence over the ramp. | + Turbulent Displace + Fast Box Blur |
| **Flow Field** | The fluid look: the colour is advected by a second, animated field. | + a hidden Fractal Noise `FIELD` layer driving Displacement Map and CC Vector Blur |

All three share one parameter set — Seed, Scale, Complexity, Warp, Softness,
Grain, Speed, Loop, Angle/Spread — and one colour system.

Eleven presets ship with it. They are parameter sets, not pictures: each one
costs zero bytes and redraws itself when the panel opens.

---

## Colour

Stops are interpolated in **RGB, HSL, OKLab or HCL** (HCL here is polar OKLab:
hue, chroma, lightness). Perceptual blending happens in the panel, not in
ExtendScript, and for a specific reason: **After Effects blends colour in sRGB.**
So the panel subdivides your 2–8 stops in OKLab or HCL first and hands the host
colours it only has to blend over short distances, where sRGB and OKLab agree to
the eye.

The palette buttons — Analogous, Complementary, Triadic, Monochrome — rebuild the
whole stop list from the first colour, walking lightness and chroma across the
set so it reads as a designed ramp. Under them is a live WCAG contrast readout:
the worst stop against white and against black, so you know before you build
whether text can sit on this without a scrim.

---

## Motion

`Speed` above zero animates it; `Loop` sets the cycle length. The loop is
**seamless by construction**, not by crossfade: evolution covers a whole number
of revolutions per cycle and Cycle Evolution is switched on with the same number,
so the last frame of the loop is the first frame again, exactly. Set Speed to 0
and you get a still from the same engine.

`Seed` locks it. Same seed plus same parameters is the same gradient, months
later — which is what makes a client's approved background reproducible.

**Freeze as still** time-remaps the selected gradient layer to a hold at the
playhead: a frozen frame that is still a live, editable comp, not a render.

---

## What actually gets built

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
before sending, and why stops 5–8 arrive as a second 4-Color Gradient layer mixed
in through a noise luma matte rather than as more stops on one effect.

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

Open `index.html` in a browser — the CEP bridge falls back to a mock host, so the
whole panel and every preview are fully developable without launching After
Effects. `.debug` also exposes CEF DevTools on port 8089.

---

## Using it

1. Open a comp.
2. Pick a preset, or set Mode and the colour stops yourself.
3. Tune the generator. The preview is live — Shuffle seed until one lands.
4. **Create gradient**.

One undo step removes the whole thing.

---

## Architecture

```
CSXS/manifest.xml         panel registration, host versions, geometry
index.html                markup
css/panel.css             AE-native chrome, presets, stops, the gradient UI
js/
  lib/cep-bridge.js       evalScript / theme / host info
  lib/controls.js         one labelled control per parameter definition
  data/gradients.js       ← colour spaces, seeded RNG, presets, resolve()
  data/gradient-preview.js  canvas renderer — the same gradient, drawn here
  app.js                  the panel
jsx/
  host.jsx                #includes everything, in dependency order
  api.jsx                 the one function the panel calls; undo grouping
  core/utils.jsx          comps, colour, expression controls, blur
  engine.jsx              the native effect chain: solids, effects, expressions
```

`js/data/gradients.js` is the contract between the two renderers: both the canvas
preview and the AE build read the same parameter schema, the same colour maths
and the same seeded RNG, so what you preview is what gets built.

---

## Against the spec

Delivered: zero-asset generation (§1) ✓ three generator modes — Linear, Noise,
Flow (§9 MVP) ✓ RGB/HSL/OKLab/HCL interpolation (§5.2) ✓ 2–8 colour stops with a
palette generator and a contrast warning (§5.2) ✓ still and animated from one
engine (§5.3) ✓ seamless loop and seed lock (§5.3) ✓ expression-driven parameters
on a single controller (§5.4) ✓ editable native output — the "Convert to Editable
Layers" promise, except the output was never anything else (§4). Option B was
taken, as the spec recommends (§6).

### Honest limits

- **Not yet tested inside After Effects.** The panel side is verified in a real
  browser and the ExtendScript side against a mock of AE's object model (layers,
  effect groups, property value types) — enough to prove the build logic and
  every generated expression, not enough to prove render performance or that
  every effect index matches on every AE version. Effect lookups fall back from
  match name to index and every write is guarded, so a mismatch costs one
  parameter, not the build. **Spec step 2 — the performance prototype — is the
  next thing to do**, and Flow mode is where it will hurt: Displacement Map plus
  CC Vector Blur plus Turbulent Displace is the heaviest chain here.
- **Preview fidelity is close, not exact.** The canvas mirrors the chain stage
  for stage — inverse-square anchor blending for 4-Color Gradient, fbm domain
  warp for Turbulent Displace — but AE's noise is not this noise. Treat the
  preview as a faithful sketch of the look, not a frame-accurate proxy. Softness
  is approximated by render scale rather than a real blur.
- **Mesh, Plasma, Metaball and Magnetic modes** (spec §5.1) are not here; this is
  the three modes the roadmap asks for in the MVP.
- **Trigger Layer** (spec §5.4, driving parameters from another layer's
  brightness or audio) is v1.5 and not started — though every parameter is
  already a controller slider, which is the hard half of it.
- **`.zxp` signing.** Needs an Adobe code-signing certificate; `build-zxp.sh`
  wraps `ZXPSignCmd` once you have one.
- **Windows untested.** No Mac-only paths, but it hasn't been run there.
