import type { Kind } from './Entity.ts';
import type { FlightDocumentFieldSchema } from './FlightDocumentFieldSchema.ts';
import type { NodeAny } from './Node.ts';
import type { NodeInteractiveStateExtensionRuntime } from './NodeInteractiveStateBinding.ts';

export interface FlightDocumentInteractiveStateExtensionSchema {
  createExtension: (node: NodeAny, fieldNames: readonly string[]) => NodeInteractiveStateExtensionRuntime | null;
  fields: readonly Readonly<FlightDocumentFieldSchema>[];
  isSupported: (node: Readonly<NodeAny>) => boolean;
  kind: Kind;
}
