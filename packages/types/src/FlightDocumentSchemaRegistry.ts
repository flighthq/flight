import type { Kind } from './Entity.ts';
import type { FlightDocumentInteractiveStateExtensionSchema } from './FlightDocumentInteractiveStateExtensionSchema.ts';
import type { FlightDocumentInteractiveStateTransitionSchema } from './FlightDocumentInteractiveStateTransitionSchema.ts';
import type { FlightDocumentNodeSchema } from './FlightDocumentNodeSchema.ts';
import type { FlightDocumentResourceSchema } from './FlightDocumentResourceSchema.ts';
import type { ShapeCommandSchema } from './ShapeCommandSchema.ts';

// Each open family has its own persistent kind map. The maps carry schemas only; live resource
// resolution remains in FlightDocumentResourceResolverRegistry because it is caller/load specific.
export interface FlightDocumentSchemaRegistry {
  interactiveStateExtensionSchemas: ReadonlyMap<Kind, FlightDocumentInteractiveStateExtensionSchema>;
  interactiveStateTransitionSchemas: ReadonlyMap<Kind, FlightDocumentInteractiveStateTransitionSchema>;
  nodeSchemas: ReadonlyMap<Kind, FlightDocumentNodeSchema>;
  resourceSchemas: ReadonlyMap<Kind, FlightDocumentResourceSchema>;
  shapeCommandSchemas: ReadonlyMap<Kind, ShapeCommandSchema>;
}
