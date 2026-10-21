use flight_importdiagnostics::ImportDiagnostic;

use crate::dragon_bones_handlers::register_all_dragon_bones_handlers;
use crate::dragon_bones_parse::parse_dragon_bones_skeleton_with_registry;
use crate::dragon_bones_registry::create_dragon_bones_registry;
use crate::types::Skeleton2DImport;

pub fn parse_dragon_bones_skeleton(
    json: &str,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Option<Skeleton2DImport> {
    let mut registry = create_dragon_bones_registry();
    register_all_dragon_bones_handlers(&mut registry);
    return parse_dragon_bones_skeleton_with_registry(json, &registry, diagnostics);
}
