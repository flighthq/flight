import type { Entity, EntityRuntime, EntityRuntimeKey } from './Entity';
import type { WorldNodeSignals } from './WorldNodeSignals';

export interface WorldNode extends Entity {
  [EntityRuntimeKey]: WorldNodeRuntime | undefined;
  enabled: boolean;
  kind: symbol;
  name: string | null;
}

export interface WorldNodeRuntime extends EntityRuntime {
  children: WorldNode[] | null;
  localTransformID: number;
  parent: WorldNode | null;
  worldNodeSignals: WorldNodeSignals;
  worldTransformID: number;
  worldTransformUsingLocalTransformID: number;
  worldTransformUsingParentTransformID: number;
}

export const NullWorld: unique symbol = Symbol('NullWorld');
export const WorldNodeKind: unique symbol = Symbol('WorldNode');
