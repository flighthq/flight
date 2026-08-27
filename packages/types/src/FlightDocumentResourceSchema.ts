import type { Kind } from './Entity';
import type { FlightDocumentFieldSchema } from './FlightDocumentFieldSchema';

export interface FlightDocumentResourceSchema {
  fields: readonly Readonly<FlightDocumentFieldSchema>[];
  kind: Kind;
}
