/**
 * host.jsx — loaded once by CEP, declared as ScriptPath in CSXS/manifest.xml.
 *
 * Order matters: utils defines the primitives, geometry defines the three
 * sources Create builds from, the engine builds on both, and api.jsx exposes
 * the one function the panel calls.
 */

#include "core/utils.jsx"
#include "geometry.jsx"
#include "engine.jsx"
#include "api.jsx"

GF.version = '0.9.0';
