import type { FlightDocumentNodeSchema } from './FlightDocumentNodeSchema';
import type { FlightDocumentResourceSchema } from './FlightDocumentResourceSchema';
import type { KeyedTable } from './RegistryTable';
import type { ShapeCommandSchema } from './ShapeCommandSchema';

// Each open family has its own persistent KeyedTable. The tables carry schemas only; live resource
// resolution remains in FlightDocumentResourceResolverRegistry because it is caller/load specific.
export interface FlightDocumentSchemaRegistry {
  nodeSchemas: KeyedTable<FlightDocumentNodeSchema>;
  resourceSchemas: KeyedTable<FlightDocumentResourceSchema>;
  shapeCommandSchemas: KeyedTable<ShapeCommandSchema>;
}
