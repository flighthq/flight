import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import type { ImportDiagnostic, Node2D, RiveArtboardGraph } from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';

/**
 * Hides every child of a Solo but the one it names active.
 *
 * A Solo is a Node that shows exactly one of its children at a time — the variant switcher behind a
 * character's alternate limbs or a button's states. Without this it still imports as a plain node, so
 * all of its variants draw at once, stacked; that is a visible wrongness rather than a missing
 * feature, which is why it is applied rather than reported.
 *
 * The active child is named by a component index, verified against every Solo in the reference corpus:
 * all 9 resolve to a component whose parent is the Solo itself.
 */
export function applyRiveSolo(
  nodes: readonly (Node2D | null)[],
  artboard: Readonly<RiveArtboardGraph>,
  diagnostics?: ImportDiagnostic[],
): void {
  for (let index = 0; index < artboard.objects.length; index++) {
    if (artboard.objects[index].typeKey !== RIVE_SOLO_TYPE_KEY) continue;

    const active = readRiveSoloActiveIndex(artboard.objects[index]);
    if (active === null || artboard.parentIndices[active] !== index) {
      // Drop, not Skip: solo nodes are supported. The named active child is absent or is not actually
      // a child of this node, so the solo is discarded — their data failed, not our capability.
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Drop,
        'rive.solo-unresolved-active',
        'applyRiveSolo',
      );
      continue;
    }

    for (let child = 0; child < artboard.objects.length; child++) {
      if (child === active || artboard.parentIndices[child] !== index) continue;
      const node = nodes[child];
      if (node !== null && node !== undefined) node.visible = false;
    }
  }
}

function readRiveSoloActiveIndex(object: Readonly<RiveArtboardGraph['objects'][number]>): number | null {
  const property = object.properties.find((candidate) => candidate.key === RIVE_ACTIVE_COMPONENT_ID);
  return typeof property?.value === 'number' ? property.value : null;
}

const RIVE_SOLO_TYPE_KEY = 147;

const RIVE_ACTIVE_COMPONENT_ID = 296;
