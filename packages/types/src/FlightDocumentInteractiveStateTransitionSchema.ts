import type { Kind } from './Entity.ts';
import type { FlightDocumentFieldSchema, FlightDocumentFields } from './FlightDocumentFieldSchema.ts';
import type { NodeInteractiveStateTransition } from './NodeInteractiveStateBinding.ts';

export interface FlightDocumentInteractiveStateTransitionSchema {
  createTransition: (fields: Readonly<FlightDocumentFields>) => NodeInteractiveStateTransition | null;
  fields: readonly Readonly<FlightDocumentFieldSchema>[];
  kind: Kind;
}
