# Apple Motion UI — v0.1.0

A dockable After Effects panel that builds Apple-style UI components procedurally.
This is **Phase 1** of the spec: extension shell, dockable panel, search, component
browser, and working component generation — plus a first pass at the motion engine
so the output is actually animatable on day one.

Everything it builds is a named precomp with a **CONTROLLER** layer. Layout is driven
by expressions off that controller, so a card stays editable after it's created:
drag Width and the text, icon and padding re-lay out.

---

## What's in the box

| Tab | Contents |
|---|---|
| **Components** | Glass card, Notification banner, Toggle switch |
| **Motion** | Apple ease, Spring, Smooth spring, Overshoot, Bounce, Elastic, Fade up, Scale in, Blur in, Slide in |
| **Actions** | Add glass, Add shadow, Center, Stagger, Precompose |

One search box filters all three and jumps to whichever tab has hits.

---

## Install (development)

**1. Turn on unsigned extensions.** Adobe blocks unsigned panels by default.

macOS — run once per CSXS version:
```bash
for v in 9 10 11 12; do
  defaults write com.adobe.CSXS.$v PlayerDebugMode 1
done
killall cfprefsd
```

Windows — in `regedit`, for each of `HKEY_CURRENT_USER/Software/Adobe/CSXS.9`
through `CSXS.12`, add a **String** value `PlayerDebugMode` = `1`.

**2. Copy the folder into the CEP extensions directory.**

```
macOS    ~/Library/Application Support/Adobe/CEP/extensions/
Windows  %APPDATA%\Adobe\CEP\extensions\
```

Or use the helper:

```bash
./install.sh          # copies
./install.sh --link   # symlinks instead, so edits are live
```

**3. Restart After Effects** → `Window ▸ Extensions ▸ Apple Motion UI`.
Dock it wherever you like.

### Debugging

The `.debug` file exposes CEF on port 8088. With the panel open, visit
`http://localhost:8088` in Chrome for full DevTools. `console.log` from the panel
lands there; ExtendScript errors come back through the panel's status bar.

You can also just open `index.html` in a browser — the CEP bridge falls back to a
mock host, so the UI and previews are fully developable without launching AE.

---

## Using it

1. Open a comp. (Nothing will build without one — the status bar will say so.)
2. Click a component tile. The sheet slides up with its parameters.
3. Adjust. The preview redraws from the same values that get sent to AE.
4. **Create**. The component appears centred in your comp and selected.
5. Switch to **Motion**, click a preset — it applies to the selection.

Every operation is a single undo step.

### The controller

Select the generated precomp, press `U`, or open the precomp and look at the
CONTROLLER layer. Its Effect Controls hold everything:

```
CARD                    CONTROLLER
 ├── Value               ├── Width
 ├── Subtitle            ├── Height
 ├── Title               ├── Radius
 ├── Icon                ├── Padding
 ├── Highlight           ├── Blur
 ├── Tint                ├── Shadow
 ├── Glass Matte         └── Accent
 ├── Glass Blur
 └── Shadow
```

### How the glass works

It's not a translucent fill. An **adjustment layer** blurs whatever is behind the
component, an **alpha matte** clips that blur to the component's rounded shape, and
a tint plus a hairline edge light sit on top.

For the blur to reach the layers *underneath* the precomp, the generator switches
**Collapse Transformations** on for the precomp layer. Two consequences worth
knowing:

- Don't turn it off, or the glass will look like flat grey.
- Blend modes and 3D on that layer behave differently under collapse. Precompose it
  again if you need those.

If you want glass on something you built yourself, select it and use
**Actions ▸ Add glass** — same construction, applied to your layer's alpha.

### How the springs work

Spring presets write a short keyframe pair and hand the settle to an expression:

```js
amp = 0.12; freq = 2.8; decay = 5.5;
// ... reacts to the velocity coming out of the last keyframe
```

So the bounce stays tunable afterwards — change `amp` and `decay` on the layer,
or move the keyframes, and the settle follows. Nothing is baked.

---

## Architecture

```
CSXS/manifest.xml       panel registration, host versions, geometry
index.html              markup
css/panel.css           AE-native chrome, one accent, no framework
js/
  lib/cep-bridge.js     evalScript / theme / host info (replaces CSInterface.js)
  data/library.js       ← every component, parameter and preset is defined here
  data/previews.js      SVG previews, drawn from the same parameters
  app.js               browser, search, parameter sheet, host calls
jsx/
  host.jsx              #includes everything, in dependency order
  api.jsx               the one function the panel calls; undo grouping
  core/tokens.jsx       palettes, glass presets, type scale
  core/utils.jsx        comps, colour, controls, shapes, text, mattes, easing
  core/glass.jsx        blur + matte + tint + highlight stack
  core/motion.jsx       easing, spring expressions, entry animations, stagger
  core/actions.jsx      selection-based quick actions
  components/           card.jsx, notification.jsx, toggle.jsx
```

The panel never hardcodes a component. It renders whatever is in `library.js`,
and `api.jsx` looks up `AMUI.Components[type]` by name.

### Adding a component

Two files, no engine changes:

1. **`js/data/library.js`** — add an entry with a `params` array. The parameter
   sheet builds itself from the types (`number`, `text`, `bool`, `select`), and
   `showIf` hides a field when another parameter is off.
2. **`jsx/components/yours.jsx`** — export `AMUI.Components.yours = { create: fn }`,
   then `#include` it in `host.jsx`.

Optionally add a renderer in `js/data/previews.js` so the tile shows the real thing.

Two rules that keep the output editable:

- Put every dimension on the CONTROLLER as a slider, and drive layout from it with
  expressions. No baked pixel coordinates.
- Size the component comp with slack around the artwork (the generators use
  `width + 400`), so sliding Width up doesn't clip.

### Localisation note

Property lookups use numeric indices (`fx.property(1)`) rather than English names
wherever a matchName isn't available, so the generators work on non-English
installs of After Effects.

---

## Known limits in v0.1

- **Fonts.** Text targets SF Pro and falls back to whatever AE substitutes. Bundle
  or require the font before shipping — Apple's licence allows use, not
  redistribution inside a paid product without checking terms.
- **No personal library yet.** Nothing persists between sessions (Phase 6).
- **No `.zxp`.** Signing needs an Adobe-issued code-signing certificate. Once you
  have one, `build-zxp.sh` wraps `ZXPSignCmd`.
- **Windows untested.** The code has no Mac-only paths, but it hasn't been run
  there. That's an open question in the spec anyway.
- **Motion presets are entry animations.** Stagger, follow-through, path reveal and
  the preset browser with hover previews are Phase 2.

---

## Against the spec

Delivered from Phase 1: extension shell ✓ dockable panel ✓ search ✓ UI component
browser ✓ basic component creation ✓ — plus smart layer system (§5.5), component
builder (§5.6), procedural responsive design (§5.7), glass system (§5.8),
typography (§5.9) and colour (§5.10) tokens, quick actions (§5.14), command search
(§5.15), and an early cut of the motion engine (§5.4, nominally Phase 2).

Not here, by design: personal library, drag and drop, keyboard shortcuts, hover
video previews, settings, maps, the rest of the iOS set — and data visualization,
which stays deferred per §15.
