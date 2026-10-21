use flight_entity::Ref;
use flight_importdiagnostics::contract::ImportDiagnostic;
use flight_scene2d::contract::DisplayObject;

use crate::svg_clip_handlers::SVG_ALL_CLIP_HANDLERS;
use crate::svg_document::create_scene2d_from_svg_document_with_registry;
use crate::svg_element_handlers::SVG_ALL_ELEMENT_HANDLERS;
use crate::types::*;

pub fn create_scene2d_from_svg_document(
    source: &str,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
    options: Option<&SvgDocumentImportOptions>,
) -> Ref<DisplayObject> {
    let registry = SvgRegistry {
        clip_handlers: options
            .and_then(|options| options.clip_handlers.clone())
            .unwrap_or_else(default_svg_clip_handlers),
        element_handlers: options
            .and_then(|options| options.element_handlers.clone())
            .unwrap_or_else(default_svg_element_handlers),
    };
    return create_scene2d_from_svg_document_with_registry(source, &registry, diagnostics, options);
}

fn default_svg_clip_handlers() -> Vec<SvgClipHandlerEntry> {
    return vec![SvgClipHandlerEntry {
        handle: SVG_ALL_CLIP_HANDLERS[0].clone(),
        kind: SVG_CLIP_KIND_PATH.to_string(),
    }];
}

fn default_svg_element_handlers() -> Vec<SvgElementHandlerEntry> {
    return [
        (SVG_ELEMENT_KIND_CONTAINER, 0),
        (SVG_ELEMENT_KIND_GEOMETRY, 1),
        (SVG_ELEMENT_KIND_IMAGE, 2),
        (SVG_ELEMENT_KIND_TEXT, 3),
        (SVG_ELEMENT_KIND_USE, 4),
    ]
    .into_iter()
    .map(|(kind, index)| SvgElementHandlerEntry {
        handle: SVG_ALL_ELEMENT_HANDLERS[index].clone(),
        kind: kind.to_string(),
    })
    .collect();
}
