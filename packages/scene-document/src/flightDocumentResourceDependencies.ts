import type {
  FlightDocument,
  FlightDocumentResourceDescriptor,
  FlightDocumentSchemaRegistry,
} from '@flighthq/types/contract';

// The resource table is the document's direct dependency list. This query verifies that every declared
// kind has an authored schema, but deliberately does not interpret fields as graph edges or resolve any
// live resource: traversal and loading policy belong to their callers.
export function getFlightDocumentResourceDependencies(
  document: Readonly<FlightDocument>,
  schemas: Readonly<FlightDocumentSchemaRegistry>,
): readonly Readonly<FlightDocumentResourceDescriptor>[] | null {
  for (const descriptor of document.resources) {
    if (!schemas.resourceSchemas.has(descriptor.kind)) return null;
  }
  return document.resources;
}
