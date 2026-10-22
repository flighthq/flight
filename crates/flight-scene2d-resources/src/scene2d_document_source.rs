use flight_stream::create_abort_controller;

use crate::scene2d_document_importer_registry::create_scene2d_document_from_bytes;
use crate::scene2d_resource_diagnostics::report_scene2d_resource_failure;
use crate::types::*;

// flight-lint: allow(conform-params) D5 caller-owned guard state replaces the source module hook
pub async fn load_scene2d_document_from_url(
    url: String,
    registry: &Scene2DDocumentImporterRegistry,
    fetch_document: &Scene2DDocumentFetcher,
    options: Option<&Scene2DDocumentLoadOptions>,
    guard_state: &Scene2DResourceFailureGuardStateRef,
) -> Option<flight_entity::Ref<Scene2DDocument>> {
    let default_signal = create_abort_controller().signal;
    let signal = options
        .and_then(|options| options.signal.clone())
        .unwrap_or(default_signal);
    let progress = options.and_then(|options| options.progress.clone());
    let source = fetch_document(url.clone(), signal, progress).await;
    let Some(source) = source else {
        report_scene2d_resource_failure(
            guard_state,
            &Scene2DResourceFailureNotice {
                operation: Scene2DResourceFailureOperation::LoadScene2DDocumentFromUrl,
                reason: Scene2DResourceFailureReason::DocumentFetchFailed,
                total: 1,
                unresolved: 1,
                url: Some(url),
            },
        );
        return None;
    };
    let context = Scene2DDocumentImportContext {
        mime_type: options.and_then(|options| options.mime_type.clone()),
        url: Some(url),
    };
    let source = source.read().unwrap();
    return create_scene2d_document_from_bytes(&source, registry, Some(&context), guard_state);
}
