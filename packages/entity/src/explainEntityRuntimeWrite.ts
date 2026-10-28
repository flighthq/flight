// Generated from crates/flight-entity/src/explain_entity_runtime_write.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { EntityRuntimeWriteExplanation } from './types.ts';
import { EntityRuntimeWriteSlot } from './types.ts';

/**
 * Describes what a guarded direct write means, as plain data. The guard seam reports only
 * which slot was written; this turns that into the remedy, so a caller's reporter can phrase
 * a warning without core owning a message format or a logger.
 */
export function explainEntityRuntimeWrite(slot: EntityRuntimeWriteSlot): EntityRuntimeWriteExplanation {
  if (slot === EntityRuntimeWriteSlot.BindingSlot) {
    return {
      message: String(
        'EntityRuntime.binding was written directly. The write was allowed but is not tracked, so the binding and the runtime can disagree.',
      ),
      slot: slot,
      useInstead: [String('attachEntityBinding'), String('detachEntityBinding')],
    };
  }
  return {
    message: String(
      "An entity's runtime slot was written directly. The write was allowed, but bypassing the helper is how a runtime ends up on the wrong entity.",
    ),
    slot: slot,
    useInstead: [String('attachEntityBinding')],
  };
}
