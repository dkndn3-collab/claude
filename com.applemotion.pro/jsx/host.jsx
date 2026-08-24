/**
 * host.jsx — loaded once by CEP, declared as ScriptPath in CSXS/manifest.xml.
 *
 * Order matters: tokens and utils define the primitives, glass and motion build
 * on them, components build on all three, and api.jsx exposes the one function
 * the panel calls.
 */

#include "core/tokens.jsx"
#include "core/utils.jsx"
#include "core/glass.jsx"
#include "core/motion.jsx"
#include "core/actions.jsx"

#include "components/card.jsx"
#include "components/notification.jsx"
#include "components/toggle.jsx"
#include "components/button.jsx"
#include "components/chart.jsx"
#include "components/progress.jsx"
#include "components/badge.jsx"

#include "api.jsx"

AMUI.version = '0.2.0';
