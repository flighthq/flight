import type { EntityRuntimeWriteExplanation, EntityRuntimeWriteSlot } from '@flighthq/types/contract';

// Describes what a guarded direct write means, as plain data. The guard seam reports only which slot was
// written; this turns that into the remedy, so a caller's reporter can phrase a warning without core
// owning a message format or a logger. Separately importable, so a build that never diagnoses these
// writes never carries the text.
export function explainEntityRuntimeWrite(slot: EntityRuntimeWriteSlot): EntityRuntimeWriteExplanation {
  if (slot === 'binding-slot') {
    return {
      message:
        'EntityRuntime.binding was written directly. The write was allowed but is not tracked, so the binding and the runtime can disagree.',
      slot,
      useInstead: ['attachEntityBinding', 'detachEntityBinding'],
    };
  }
  return {
    message:
      "An entity's runtime slot was written directly. The write was allowed, but bypassing the helper is how a runtime ends up on the wrong entity.",
    slot,
    useInstead: ['attachEntityBinding'],
  };
}
