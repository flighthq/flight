use flight_importdiagnostics::ImportDiagnostic;

use crate::spine_binary_handlers::register_all_spine_binary_handlers;
use crate::spine_binary_parse::parse_spine_skeleton_binary_with_registry;
use crate::spine_binary_registry::create_spine_binary_registry;
use crate::types::Skeleton2DImport;

pub fn parse_spine_skeleton_binary(
    bytes: &[u8],
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Option<Skeleton2DImport> {
    let mut registry = create_spine_binary_registry();
    register_all_spine_binary_handlers(&mut registry);
    return parse_spine_skeleton_binary_with_registry(bytes, &registry, diagnostics);
}
