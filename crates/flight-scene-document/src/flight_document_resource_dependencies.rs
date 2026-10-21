//! The document's direct resource dependency list (TS `flightDocumentResourceDependencies.ts`).

use crate::types::*;

/// Returns the declared resources when every kind has a registered schema, else `None` (TS
/// `getFlightDocumentResourceDependencies`). Fields are not interpreted as graph edges and nothing
/// is resolved: traversal and loading policy belong to callers.
pub fn get_flight_document_resource_dependencies<'a>(
    document: &'a FlightDocument,
    schemas: &FlightDocumentSchemaRegistry,
) -> Option<&'a [FlightDocumentResourceDescriptor]> {
    for descriptor in &document.resources {
        if !schemas
            .resource_schemas
            .entries
            .contains_key(&descriptor.kind)
        {
            return None;
        }
    }
    return Some(&document.resources);
}
