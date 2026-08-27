import type { Kind } from './Entity';
import type { FlightDocumentFields } from './FlightDocumentFieldSchema';
import type { FlightDocumentFieldSchema } from './FlightDocumentFieldSchema';
import type { NodeAny } from './Node';

// Resolved live resources keyed by the names authored in one document. It is deliberately open-ended:
// a vendor resource kind may resolve to its own value without widening a closed SDK union.
export type FlightDocumentResourceLookup = Readonly<Record<string, unknown>>;

export type FlightDocumentNodeFactory = (
  fields: Readonly<FlightDocumentFields>,
  resources: FlightDocumentResourceLookup,
) => NodeAny | null;

export type FlightDocumentNodeFieldWriter = (
  out: FlightDocumentFields,
  source: Readonly<NodeAny>,
  resources: FlightDocumentResourceLookup,
) => boolean;

// A caller-registered bridge between one open node kind and the normalized document fields. The
// writer returns false when the source node is not applicable to this schema and otherwise fills out.
export interface FlightDocumentNodeSchema {
  createNode: FlightDocumentNodeFactory;
  fields: readonly Readonly<FlightDocumentFieldSchema>[];
  kind: Kind;
  writeNodeFields: FlightDocumentNodeFieldWriter;
}
