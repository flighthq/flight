import type {
  Scene2DDocument,
  Scene2DResourceCoverageCount,
  Scene2DResourceCoverageExplanation,
  Scene2DResourceFailureGuard,
  Scene2DResourceFailureNotice,
} from '@flighthq/types/contract';
import { ResourceResolutionState } from '@flighthq/types/contract';

// Reports document-wide coverage from the live reference states. The query is allocation-only and
// has no logging side effect; call the image/audio reference explainers for an individual failure.
export function explainScene2DResourceCoverage(
  document: Readonly<Scene2DDocument>,
): Scene2DResourceCoverageExplanation {
  const audioResources = countResolved(document.audioResources);
  const imageResources = countResolved(document.imageResources);
  let requiredSlotTotal = 0;
  let requiredSlotResolved = 0;
  for (let i = 0; i < document.slots.length; i++) {
    const slot = document.slots[i];
    if (!slot.required) continue;
    requiredSlotTotal++;
    if (slot.content !== null) requiredSlotResolved++;
  }
  const requiredSlots = { resolved: requiredSlotResolved, total: requiredSlotTotal };
  return {
    audioResources,
    complete:
      audioResources.resolved === audioResources.total &&
      imageResources.resolved === imageResources.total &&
      requiredSlots.resolved === requiredSlots.total,
    imageResources,
    requiredSlots,
  };
}

export function reportScene2DResourceFailure(notice: Readonly<Scene2DResourceFailureNotice>): void {
  _guard?.(notice);
}

// Installs the hook used by the separately imported guard module. Null is the production default.
export function setScene2DResourceFailureGuard(guard: Scene2DResourceFailureGuard | null): void {
  _guard = guard;
}

let _guard: Scene2DResourceFailureGuard | null = null;

function countResolved(references: readonly Readonly<{ readonly state: string }>[]): Scene2DResourceCoverageCount {
  let resolved = 0;
  for (let i = 0; i < references.length; i++) {
    if (references[i].state === ResourceResolutionState.Resolved) resolved++;
  }
  return { resolved, total: references.length };
}
