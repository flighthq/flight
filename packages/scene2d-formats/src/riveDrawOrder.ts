import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import {
  applyNodeOrderList,
  createNodeOrderList,
  disposeNodeOrderList,
  getNodeParent,
  setNodeOrderListEntryAbove,
  setNodeOrderListEntryBelow,
  setNodeOrderListFromNodeChildren,
} from '@flighthq/node/contract';
import type {
  DisplayObject,
  ImportDiagnostic,
  Node2D,
  Node2DTraits,
  NodeOrderList,
  RiveArtboardGraph,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';

/**
 * Applies the artboard's draw rules, which override hierarchy order for the nodes they govern.
 *
 * A `DrawRules` is parented to the node it governs and names a `DrawTarget`, which in turn names the
 * drawable to sit beside and whether to land before or after it. That is exactly the shape of
 * `setNodeOrderListEntryBelow` / `Above`, so a rule needs no interpretation beyond resolving its two
 * ids.
 *
 * Ordering is a permutation **within one parent**, so a rule whose governed node and target drawable
 * are not siblings cannot be honored without reparenting — which would move the node out of the group
 * whose alpha, blend, and clip it composites under. Those are reported as fidelity loss rather than
 * approximated, and they are the minority: across the 41-file reference corpus, of 61 rules 33 are
 * honored, 13 cross a parent boundary, and 15 name an end that is not a display node. Sibling-ness is
 * a fact about the *display* tree, not the component tree — the two disagree, because a component
 * whose parent is not itself a display node reparents up to the nearest one.
 */
export function applyRiveDrawOrder(
  nodes: readonly (Node2D | null)[],
  artboard: Readonly<RiveArtboardGraph>,
  root: DisplayObject,
  diagnostics?: ImportDiagnostic[],
): void {
  const lists = new Map<Node2D, NodeOrderList<Node2DTraits>>();
  for (let index = 0; index < artboard.objects.length; index++) {
    const object = artboard.objects[index];
    if (object.typeKey !== RIVE_DRAW_RULES_TYPE_KEY) continue;

    const governed = resolveRiveDrawNode(nodes, artboard.parentIndices[index]);
    const target = resolveRiveDrawTarget(nodes, artboard, readRiveDrawId(object, RIVE_DRAW_TARGET_ID));
    if (governed === null || target === null) {
      // Drop, not Skip: draw rules are supported. A reference in the file points at nothing, so the
      // rule is discarded — their data failed, not our capability.
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Drop,
        'rive.draw-rule-unresolved',
        'applyRiveDrawOrder',
      );
      continue;
    }

    const parent = getNodeParent(governed) as Node2D | null;
    if (parent === null || parent !== getNodeParent(target.node)) {
      // Honoring this would mean reparenting the governed node out of its compositing group.
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Drop,
        'rive.draw-rule-crosses-parent',
        'applyRiveDrawOrder',
      );
      continue;
    }

    let list = lists.get(parent);
    if (list === undefined) {
      list = createNodeOrderList<Node2DTraits>();
      setNodeOrderListFromNodeChildren(list, parent);
      lists.set(parent, list);
    }
    if (target.isAbove) setNodeOrderListEntryAbove(list, governed, target.node);
    else setNodeOrderListEntryBelow(list, governed, target.node);
  }

  for (const [parent, list] of lists) {
    applyNodeOrderList(parent === root ? root : parent, list);
    disposeNodeOrderList(list);
  }
}

function readRiveDrawId(object: Readonly<RiveArtboardGraph['objects'][number]>, key: number): number | null {
  const property = object.properties.find((candidate) => candidate.key === key);
  return typeof property?.value === 'number' ? property.value : null;
}

function resolveRiveDrawNode(nodes: readonly (Node2D | null)[], index: number | undefined): Node2D | null {
  return index === undefined ? null : (nodes[index] ?? null);
}

// A rule names a DrawTarget, not a drawable — the target is the indirection that carries the
// placement side, so both hops must land before the rule means anything.
function resolveRiveDrawTarget(
  nodes: readonly (Node2D | null)[],
  artboard: Readonly<RiveArtboardGraph>,
  targetIndex: number | null,
): { isAbove: boolean; node: Node2D } | null {
  if (targetIndex === null) return null;
  const target = artboard.objects[targetIndex];
  if (target === undefined || target.typeKey !== RIVE_DRAW_TARGET_TYPE_KEY) return null;
  const drawable = resolveRiveDrawNode(nodes, readRiveDrawId(target, RIVE_DRAWABLE_ID) ?? undefined);
  if (drawable === null) return null;
  return { isAbove: readRiveDrawId(target, RIVE_PLACEMENT_VALUE) === RIVE_PLACEMENT_AFTER, node: drawable };
}

const RIVE_DRAW_TARGET_TYPE_KEY = 48;
const RIVE_DRAW_RULES_TYPE_KEY = 49;

const RIVE_DRAWABLE_ID = 119;
const RIVE_PLACEMENT_VALUE = 120;
const RIVE_DRAW_TARGET_ID = 121;

// Rive's placement enum: 0 places the governed node before the target, 1 after it.
const RIVE_PLACEMENT_AFTER = 1;
