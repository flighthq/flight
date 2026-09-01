import type { Kind } from './Entity';
import type { FlightDocumentFieldSchema, FlightDocumentFields } from './FlightDocumentFieldSchema';
import type { NodeInteractiveStateTransition } from './NodeInteractiveStateBinding';

export interface FlightDocumentInteractiveStateTransitionSchema {
  createTransition: (fields: Readonly<FlightDocumentFields>) => NodeInteractiveStateTransition | null;
  fields: readonly Readonly<FlightDocumentFieldSchema>[];
  kind: Kind;
}
