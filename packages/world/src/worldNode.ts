import { createEntity, createEntityRuntime, getEntityRuntime } from '@flighthq/entity';
import { createSignal } from '@flighthq/signals';
import type { WorldNode, WorldNodeRuntime, WorldNodeSignals } from '@flighthq/types';
import { EntityRuntimeKey, WorldNodeKind } from '@flighthq/types';

export type { WorldNode, WorldNodeRuntime, WorldNodeSignals } from '@flighthq/types';
export { NullWorld, WorldNodeKind } from '@flighthq/types';

export function createWorldNode(
  kind: symbol = WorldNodeKind,
  obj?: Readonly<Partial<Pick<WorldNode, 'enabled' | 'name'>>>,
): WorldNode {
  const out = createEntity({} as WorldNode);
  out[EntityRuntimeKey] = createWorldNodeRuntime();
  out.enabled = obj?.enabled ?? true;
  out.kind = kind;
  out.name = obj?.name ?? null;
  return out;
}

export function createWorldNodeRuntime(): WorldNodeRuntime {
  const out = createEntityRuntime() as WorldNodeRuntime;
  out.children = null;
  out.localTransformID = 0;
  out.parent = null;
  out.worldNodeSignals = createWorldNodeSignals();
  out.worldTransformID = 0;
  out.worldTransformUsingLocalTransformID = -1;
  out.worldTransformUsingParentTransformID = -1;
  return out;
}

export function createWorldNodeSignals(): WorldNodeSignals {
  return {
    onChildAdded: createSignal(),
    onChildRemoved: createSignal(),
    onChildrenChanged: createSignal(),
    onChildrenOrderChanged: createSignal(),
    onParentChanged: createSignal(),
  };
}

export function getWorldNodeRuntime(source: Readonly<WorldNode>): WorldNodeRuntime {
  return getEntityRuntime(source) as WorldNodeRuntime;
}

export function getWorldNodeSignals(source: WorldNode): WorldNodeSignals {
  return getWorldNodeRuntime(source).worldNodeSignals;
}

export function invalidateNodeLocalTransform(target: WorldNode): void {
  const runtime = getWorldNodeRuntime(target);
  runtime.localTransformID = (runtime.localTransformID + 1) >>> 0;
}

export function invalidateNodeParentReference(target: WorldNode): void {
  getWorldNodeRuntime(target).worldTransformUsingParentTransformID = -1;
}
