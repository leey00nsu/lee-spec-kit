// Backward-compatible re-export. The implementation now lives under
// src/integrations/codex/bootstrap.ts to keep tool-specific integration out of
// the workflow core.
export {
  LEE_SPEC_KIT_CODEX_BOOTSTRAP_BEGIN,
  LEE_SPEC_KIT_CODEX_BOOTSTRAP_END,
  getCodexHome,
  getCodexConfigPath,
  hasLeeSpecKitCodexBootstrap,
  upsertLeeSpecKitCodexBootstrap,
  removeLeeSpecKitCodexBootstrap,
} from '../integrations/codex/bootstrap.js';
