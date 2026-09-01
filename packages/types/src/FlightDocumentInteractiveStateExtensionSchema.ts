import type { Kind } from './Entity';
import type { FlightDocumentFieldSchema } from './FlightDocumentFieldSchema';
import type { NodeAny } from './Node';
import type { NodeInteractiveStateExtensionRuntime } from './NodeInteractiveStateBinding';

export interface FlightDocumentInteractiveStateExtensionSchema {
  createExtension: (node: NodeAny, fieldNames: readonly string[]) => NodeInteractiveStateExtensionRuntime | null;
  fields: readonly Readonly<FlightDocumentFieldSchema>[];
  isSupported: (node: Readonly<NodeAny>) => boolean;
  kind: Kind;
}
