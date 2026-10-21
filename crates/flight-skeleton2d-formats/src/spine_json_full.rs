use flight_importdiagnostics::ImportDiagnostic;

use crate::spine_json_handlers::register_all_spine_json_handlers;
use crate::spine_json_registry::create_spine_json_registry;
use crate::spine_parse::parse_spine_skeleton_with_registry;
use crate::types::Skeleton2DImport;

pub fn parse_spine_skeleton(
    json: &str,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Option<Skeleton2DImport> {
    let mut registry = create_spine_json_registry();
    register_all_spine_json_handlers(&mut registry);
    return parse_spine_skeleton_with_registry(json, &registry, diagnostics);
}
