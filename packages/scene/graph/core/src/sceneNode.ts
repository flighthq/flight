import type { PartialWithData, SceneNode, SceneNodeData, SceneNodeRuntime } from '@flighthq/types';
import { SceneNodeRuntimeKey } from '@flighthq/types';

import { createSceneNodeRuntime } from './runtime';

export type SceneNodeDataFactory<D extends SceneNodeData> = (obj?: Partial<D>, defaults?: D) => D;
export type SceneNodeRuntimeFactory<K extends symbol> = (
  nodeKind: K,
  // methods?: Partial<SceneNodeRuntime<K>>,
) => SceneNodeRuntime<K>;

export function createSceneNode<K extends symbol, D extends SceneNodeData>(
  nodeKind: K,
  obj?: PartialWithData<SceneNode<K>>,
  createData?: SceneNodeDataFactory<D>,
  createRuntime?: SceneNodeRuntimeFactory<K>,
): SceneNode<K> {
  return {
    children: obj?.children ?? null,
    data: createData !== undefined ? createData(obj?.data as Partial<D>) : null,
    name: obj?.name ?? null,
    parent: obj?.parent ?? null,
    root: obj?.root ?? null,
    visible: obj?.visible ?? true,
    [SceneNodeRuntimeKey]: createRuntime !== undefined ? createRuntime(nodeKind) : createSceneNodeRuntime(nodeKind),
  } as SceneNode<K>;
}
