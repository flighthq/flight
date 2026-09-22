import type { Kind } from './Entity';
import type { FlightDocumentInteractiveStateExtensionSchema } from './FlightDocumentInteractiveStateExtensionSchema';
import type { FlightDocumentInteractiveStateTransitionSchema } from './FlightDocumentInteractiveStateTransitionSchema';
import type { FlightDocumentNodeSchema } from './FlightDocumentNodeSchema';
import type { FlightDocumentResourceSchema } from './FlightDocumentResourceSchema';
import type { ShapeCommandSchema } from './ShapeCommandSchema';

// Each open family has its own persistent kind map. The maps carry schemas only; live resource
// resolution remains in FlightDocumentResourceResolverRegistry because it is caller/load specific.
export interface FlightDocumentSchemaRegistry {
  interactiveStateExtensionSchemas: ReadonlyMap<Kind, FlightDocumentInteractiveStateExtensionSchema>;
  interactiveStateTransitionSchemas: ReadonlyMap<Kind, FlightDocumentInteractiveStateTransitionSchema>;
  nodeSchemas: ReadonlyMap<Kind, FlightDocumentNodeSchema>;
  resourceSchemas: ReadonlyMap<Kind, FlightDocumentResourceSchema>;
  shapeCommandSchemas: ReadonlyMap<Kind, ShapeCommandSchema>;
}
