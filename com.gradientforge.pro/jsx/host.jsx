/**
 * host.jsx — loaded once by CEP, declared as ScriptPath in CSXS/manifest.xml.
 *
 * Order matters: utils defines the primitives, the engine builds on them, and
 * api.jsx exposes the one function the panel calls.
 */

#include "core/utils.jsx"
#include "engine.jsx"
#include "api.jsx"

GF.version = '0.3.0';
