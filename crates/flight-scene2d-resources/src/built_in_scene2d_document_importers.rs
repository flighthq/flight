use std::sync::{Arc, RwLock};

use flight_importdiagnostics::{ImportDiagnostic, ImportDiagnosticSeverity};
use flight_path_boolean::PathBooleanKernel;
use flight_scene2d::Node2DRef;
use flight_scene2d_formats::{
    create_scene2d_document_from_rive_document, create_scene2d_from_lottie_document,
    create_scene2d_from_svg_document,
};
use regex::Regex;
use serde_json::Value;

use crate::scene2d_document::create_scene2d_document;
use crate::scene2d_document_importer_registry::register_scene2d_document_importer;
use crate::types::*;

fn decode_text(source: &[u8]) -> String {
    return String::from_utf8_lossy(source).into_owned();
}

fn import_lottie_document(
    source: &[u8],
    _context: &Scene2DDocumentImportContext,
) -> Option<flight_entity::Ref<Scene2DDocument>> {
    let source: Value = serde_json::from_str(&decode_text(source)).ok()?;
    let mut diagnostics: Vec<ImportDiagnostic> = Vec::new();
    let result = create_scene2d_from_lottie_document(&source, Some(&mut diagnostics), None);
    if is_invalid_document(&diagnostics, "lottie.invalid-document") {
        return None;
    }
    let document = create_scene2d_document();
    {
        let mut document = document.write().unwrap();
        document.root = result.root as Node2DRef;
        document.source_kind = Some("lottie".to_string());
    }
    return Some(document);
}

fn import_rive_document(
    path_boolean_kernel: &PathBooleanKernel,
    source: &[u8],
    _context: &Scene2DDocumentImportContext,
) -> Option<flight_entity::Ref<Scene2DDocument>> {
    let mut diagnostics: Vec<ImportDiagnostic> = Vec::new();
    let result = create_scene2d_document_from_rive_document(
        path_boolean_kernel,
        source,
        Some(&mut diagnostics),
    )?;
    let document = create_scene2d_document();
    {
        let mut document = document.write().unwrap();
        document.image_resources = result.image_resources;
        document.root = result.root;
        document.slots = result
            .slots
            .into_iter()
            .map(|slot| Arc::new(RwLock::new(slot)))
            .collect();
        document.source_kind = Some("rive".to_string());
    }
    return Some(document);
}

fn import_svg_document(
    source: &[u8],
    _context: &Scene2DDocumentImportContext,
) -> Option<flight_entity::Ref<Scene2DDocument>> {
    let mut diagnostics: Vec<ImportDiagnostic> = Vec::new();
    let root = create_scene2d_from_svg_document(&decode_text(source), Some(&mut diagnostics), None);
    if is_invalid_document(&diagnostics, "svg.invalid-document") {
        return None;
    }
    let document = create_scene2d_document();
    {
        let mut document = document.write().unwrap();
        document.root = root as Node2DRef;
        document.source_kind = Some("svg".to_string());
    }
    return Some(document);
}

fn is_invalid_document(diagnostics: &[ImportDiagnostic], kind: &str) -> bool {
    return diagnostics.iter().any(|diagnostic| {
        diagnostic.kind == kind && diagnostic.severity == ImportDiagnosticSeverity::Reject
    });
}

fn matches_lottie_document(source: &[u8], context: &Scene2DDocumentImportContext) -> bool {
    if context.mime_type.as_deref() == Some("application/lottie+json") {
        return true;
    }
    let text = decode_text(source);
    let text = text.trim_start();
    return text.starts_with('{') && text.contains("\"layers\"") && text.contains("\"fr\"");
}

fn matches_rive_document(source: &[u8], _context: &Scene2DDocumentImportContext) -> bool {
    return source.len() >= 4
        && source[0] == 0x52
        && source[1] == 0x49
        && source[2] == 0x56
        && source[3] == 0x45;
}

fn matches_svg_document(source: &[u8], context: &Scene2DDocumentImportContext) -> bool {
    if context.mime_type.as_deref() == Some("image/svg+xml") {
        return true;
    }
    let pattern = Regex::new(r"(?i)^(?:<\?xml[^>]*>\s*)?<svg(?:\s|>)").unwrap();
    let text = decode_text(source);
    return pattern.is_match(text.trim_start());
}

pub fn register_lottie_scene2d_document_importer(registry: &mut Scene2DDocumentImporterRegistry) {
    register_scene2d_document_importer(
        registry,
        "lottie".to_string(),
        Arc::new(matches_lottie_document),
        Arc::new(import_lottie_document),
    );
}

pub fn register_rive_scene2d_document_importer(
    path_boolean_kernel: &PathBooleanKernel,
    registry: &mut Scene2DDocumentImporterRegistry,
) {
    let path_boolean_kernel = path_boolean_kernel.clone();
    register_scene2d_document_importer(
        registry,
        "rive".to_string(),
        Arc::new(matches_rive_document),
        Arc::new(move |source, context| {
            import_rive_document(&path_boolean_kernel, source, context)
        }),
    );
}

pub fn register_svg_scene2d_document_importer(registry: &mut Scene2DDocumentImporterRegistry) {
    register_scene2d_document_importer(
        registry,
        "svg".to_string(),
        Arc::new(matches_svg_document),
        Arc::new(import_svg_document),
    );
}
