use crate::scene2d_resource_diagnostics::report_scene2d_resource_failure;
use crate::types::*;

// flight-lint: allow(conform-array) D9 array negotiation: TS Uint8Array maps to the canonical byte slice lane
// flight-lint: allow(conform-params) D5 caller-owned guard state replaces the source module hook
pub fn create_scene2d_document_from_bytes(
    source: &[u8],
    registry: &Scene2DDocumentImporterRegistry,
    context: Option<&Scene2DDocumentImportContext>,
    guard_state: &Scene2DResourceFailureGuardStateRef,
) -> Option<flight_entity::Ref<Scene2DDocument>> {
    let default_context = Scene2DDocumentImportContext::default();
    let context = context.unwrap_or(&default_context);
    for entry in &registry.entries {
        if !(entry.matches)(source, context) {
            continue;
        }
        let document = (entry.import_document)(source, context);
        if let Some(document) = &document {
            let mut document = document.write().unwrap();
            if document.source_kind.is_none() {
                document.source_kind = Some(entry.kind.clone());
            }
        } else {
            report_scene2d_resource_failure(
                guard_state,
                &Scene2DResourceFailureNotice {
                    operation: Scene2DResourceFailureOperation::CreateScene2DDocumentFromBytes,
                    reason: Scene2DResourceFailureReason::DocumentImportFailed,
                    total: 1,
                    unresolved: 1,
                    url: context.url.clone(),
                },
            );
        }
        return document;
    }
    report_scene2d_resource_failure(
        guard_state,
        &Scene2DResourceFailureNotice {
            operation: Scene2DResourceFailureOperation::CreateScene2DDocumentFromBytes,
            reason: Scene2DResourceFailureReason::DocumentImporterMissing,
            total: 1,
            unresolved: 1,
            url: context.url.clone(),
        },
    );
    return None;
}

pub fn create_scene2d_document_importer_registry() -> Scene2DDocumentImporterRegistry {
    return Scene2DDocumentImporterRegistry {
        entries: Vec::new(),
    };
}

pub fn register_scene2d_document_importer(
    registry: &mut Scene2DDocumentImporterRegistry,
    kind: String,
    matches: Scene2DDocumentImporterMatcher,
    import_document: Scene2DDocumentImporter,
) {
    let entry = Scene2DDocumentImporterEntry {
        import_document,
        kind: kind.clone(),
        matches,
    };
    if let Some(index) = registry.entries.iter().position(|entry| entry.kind == kind) {
        registry.entries[index] = entry;
    } else {
        registry.entries.push(entry);
    }
}

pub fn unregister_scene2d_document_importer(
    registry: &mut Scene2DDocumentImporterRegistry,
    kind: &str,
) -> bool {
    let Some(index) = registry.entries.iter().position(|entry| entry.kind == kind) else {
        return false;
    };
    registry.entries.remove(index);
    return true;
}
