// Compatibility facade: node owns these contracts.
export const NodeKind = 'Node';
export const NullScene3D = Symbol('NullScene3D');
export type {
  Node,
  NodeAny,
  NodeData,
  NodeDataFactory,
  NodeFields,
  NodeFieldsKey,
  NodeOf,
  NodeRuntime,
  NodeRuntimeFactory,
  NodeSignals,
} from '@flighthq/node/contract';
