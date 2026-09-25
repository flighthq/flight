import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';
import type {
  DisplayObject,
  ImportDiagnostic,
  Node2D,
  RiveArtboardGraph,
  RiveArtboardImportContext,
  RiveCoreObject,
  RiveImportRegistry,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';

import { registerRiveCoreObjectHandler } from './riveImportRegistry.ts';

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

/** A Solo is an ordinary container until the pass below hides the children it does not name. */
export function importRiveSoloComponent(context: RiveArtboardImportContext, index: number): DisplayObject | null {
  return createDisplayObject({ name: readRiveSoloName(context.artboard.objects[index]) });
}

/**
 * Registers `Solo`, the node that shows one of its children at a time.
 *
 * Hiding runs as a pass because the active child is named by component index and may be read after
 * the Solo itself. Without this the node still imports, and every variant draws at once.
 */
export function registerRiveSoloHandlers(registry: RiveImportRegistry): void {
  registerRiveCoreObjectHandler(registry, RIVE_SOLO_TYPE_KEY, {
    applyArtboard: (context) => applyRiveSolo(context.nodes, context.artboard, context.diagnostics),
    importComponent: importRiveSoloComponent,
  });
}

function readRiveSoloName(source: Readonly<RiveCoreObject>): string {
  const property = source.properties.find((candidate) => candidate.key === RIVE_NAME);
  return property === undefined || typeof property.value !== 'string' ? '' : property.value;
}

function readRiveSoloActiveIndex(object: Readonly<RiveArtboardGraph['objects'][number]>): number | null {
  const property = object.properties.find((candidate) => candidate.key === RIVE_ACTIVE_COMPONENT_ID);
  return typeof property?.value === 'number' ? property.value : null;
}

const RIVE_SOLO_TYPE_KEY = 147;

const RIVE_NAME = 4;
const RIVE_ACTIVE_COMPONENT_ID = 296;
