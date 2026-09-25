import type { Kind } from './Entity.ts';
import type { FlightDocumentFieldSchema } from './FlightDocumentFieldSchema.ts';

export interface FlightDocumentResourceSchema {
  fields: readonly Readonly<FlightDocumentFieldSchema>[];
  kind: Kind;
}
