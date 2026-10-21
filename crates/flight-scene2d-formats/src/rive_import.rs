use flight_entity::Uint8Array;
use flight_importdiagnostics::ImportDiagnostic;
use flight_path_boolean::PathBooleanKernel;

use crate::rive_handlers::register_all_rive_handlers;
use crate::rive_import_registry::create_rive_import_registry;
use crate::rive_scene2d::create_rive_document_import_result;
use crate::types::RiveDocumentImportResult;

// flight-lint: allow(conform-array) D9 array negotiation: TS Readonly<Uint8Array> maps to the canonical byte slice lane
pub fn create_scene2d_from_rive_document(
    path_boolean_kernel: &PathBooleanKernel,
    source: &Uint8Array,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> RiveDocumentImportResult {
    let mut registry = create_rive_import_registry();
    register_all_rive_handlers(path_boolean_kernel, &mut registry);
    return create_rive_document_import_result(&registry, source, diagnostics);
}
