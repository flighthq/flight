import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { forEachNodeDescendant } from '@flighthq/node/contract';
import type {
  Entity,
  EntityConstruction,
  Node2D,
  Scene2D,
  Scene2DKindUsage,
  ShapeCommandToken,
} from '@flighthq/types/contract';
import { BlendMode } from '@flighthq/types/contract';

export function createScene2DKindUsage(): Scene2DKindUsage & Entity {
  const out = allocateEntity<Scene2DKindUsage & Entity>();
  initializeScene2DKindUsage(out);
  return finishEntity(out);
}

// Clears `out`, then fills it with every kind this scene uses. One walk, no registry, no backend, no
// prose — it reads the fields the scene graph already carries, so it cannot itself be the thing you
// forgot to wire.
//
// This answers only WHAT IS IN THE SCENE. Whether anything is registered to draw it is a question for
// the package that owns the registry: each backend checks its own renderer, material, and shape-command
// registries. Keeping those answers out of here is what lets a scene stay ignorant of rendering.
export function getScene2DKindUsage(out: Scene2DKindUsage, scene: Readonly<Scene2D>): void {
  out.blendModes.length = 0;
  out.materialKinds.length = 0;
  out.nodeKinds.length = 0;
  out.shapeCommandKeys.length = 0;

  const visit = (node: Readonly<Node2D>): void => {
    addScene2DUsedKind(out.nodeKinds, node.kind);
    // An unset node carries null and inherits its parent's mode; Normal is what every backend
    // composites with no registration at all. Reporting either would send a caller looking for a
    // realization it never needs, so only an explicit non-Normal mode counts as used.
    if (node.blendMode !== null && node.blendMode !== BlendMode.Normal) {
      addScene2DUsedKind(out.blendModes, node.blendMode);
    }
    if (node.material !== null) addScene2DUsedKind(out.materialKinds, node.material.kind);
    // Structural, like isMesh: any node family whose data carries a command stream is walked, including
    // a custom kind, without a per-kind table that would drift as families are added. Shape, MorphShape
    // and Scale9Shape all record into the same flat [key, argCount, ...args] buffer.
    const commands = (node.data as Readonly<Partial<{ commands: readonly ShapeCommandToken[] }>> | null)?.commands;
    if (commands === undefined) return;
    let i = 0;
    while (i < commands.length) {
      addScene2DUsedKind(out.shapeCommandKeys, commands[i] as string);
      i += (commands[i + 1] as number) + 2;
    }
  };
  visit(scene.root);
  // forEachNodeDescendant yields Node<Node2DTraits>; the cast restores the trait fields the walk
  // generic drops, which the visitor reads structurally.
  forEachNodeDescendant(scene.root, (node) => visit(node as Readonly<Node2D>));

  out.blendModes.sort();
  out.materialKinds.sort();
  out.nodeKinds.sort();
  out.shapeCommandKeys.sort();
}

// Allocates an empty usage record. Separate from the walk so a caller can reuse one across scenes or
// frames without reallocating four arrays.
export function initializeScene2DKindUsage(out: EntityConstruction<Scene2DKindUsage & Entity>): void {
  out.blendModes = [];
  out.materialKinds = [];
  out.nodeKinds = [];
  out.shapeCommandKeys = [];
}

// Linear scan rather than a Set: these lists are the handful of distinct kinds a document uses, where
// scanning beats allocating four Sets per walk, and it keeps the result a plain array a C port can hold
// without a hash container.
function addScene2DUsedKind(kinds: string[], kind: string): void {
  for (let i = 0; i < kinds.length; i++) {
    if (kinds[i] === kind) return;
  }
  kinds.push(kind);
}
