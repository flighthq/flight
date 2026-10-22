use std::collections::{HashMap, HashSet};
use std::sync::{Arc, LazyLock, RwLock};

use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
    report_import_diagnostic,
};
use flight_scene2d::Node2DRef;

use crate::{
    SwfEditTextFactory, SwfFontNameResolver, SwfReader, SwfTagHandler, SwfTagHandlerInstantiation,
    SwfTagHandlerRef, SwfTagParseResult, SwfTagParseState, SwfTagRectangle,
    apply_swf_authored_bounds, read_swf_bounded_definition_header, read_swf_edit_text_factory,
};

pub static SWF_EDIT_TEXT_HANDLER: LazyLock<SwfTagHandlerRef> = LazyLock::new(|| {
    Arc::new(SwfTagHandler {
        finish_timeline: None,
        instantiate: Some(SwfTagHandlerInstantiation {
            create_placement_node: Some(Arc::new(|parsed, character_id, bounds, diagnostics| {
                let create = parsed.state.edit_texts.get(&character_id)?;
                return Some(create_swf_edit_text_target(
                    create,
                    parsed,
                    bounds,
                    diagnostics,
                ));
            })),
            create_resources: None,
            has_placement_content: Some(Arc::new(|parsed, character_id| {
                parsed.state.edit_texts.contains_key(&character_id)
            })),
        }),
        parse: Arc::new(|body, _tag, state, _timeline, _diagnostics| {
            let character_id = read_swf_bounded_definition_header(body, state, false);
            if character_id == 0 {
                return false;
            }
            let mut reader = SwfReader::new(body.source.clone(), body.pos, body.end);
            let bounds = state.character_bounds.get(&character_id);
            let factory = read_swf_edit_text_factory(
                &mut reader,
                bounds.map_or(0.0, |bounds| bounds.width),
                bounds.map_or(0.0, |bounds| bounds.height),
            );
            if let Some(factory) = factory {
                state.edit_texts.insert(character_id, factory);
            } else {
                report_swf_edit_text_unparseable(state, character_id);
            }
            return true;
        }),
        resolve: None,
        tags: vec![TAG_DEFINE_EDIT_TEXT],
    })
});

fn create_swf_edit_text_target(
    create: &SwfEditTextFactory,
    parsed: &SwfTagParseResult,
    bounds: Option<&SwfTagRectangle>,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Node2DRef {
    let font_names = parsed.state.font_names.clone();
    let unresolved = Arc::new(RwLock::new(HashSet::new()));
    let emitted = Arc::new(RwLock::new(Vec::new()));
    let resolver: SwfFontNameResolver = Arc::new({
        let unresolved = unresolved.clone();
        let emitted = emitted.clone();
        move |font_id| {
            if let Some(name) = font_names.get(&font_id) {
                return name.clone();
            }
            if unresolved.write().unwrap().insert(font_id) {
                let mut detail = HashMap::new();
                detail.insert(
                    String::from("capability"),
                    ImportDiagnosticDetailValue::String(String::from("swf.text.define-edit-text")),
                );
                detail.insert(
                    String::from("fontId"),
                    ImportDiagnosticDetailValue::Number(font_id as f32),
                );
                report_import_diagnostic(
                    Some(&mut emitted.write().unwrap()),
                    ImportDiagnosticSeverity::Drop,
                    "swf.edit-text-font-name-unresolved",
                    "createSwfEditTextTarget",
                    Some(detail),
                );
            }
            return String::new();
        }
    });
    let node = create(&resolver);
    if let Some(diagnostics) = diagnostics {
        diagnostics.extend(emitted.read().unwrap().iter().cloned());
    }
    let target: Node2DRef = node;
    apply_swf_authored_bounds(&parsed.state.node_state, &target, bounds);
    return target;
}

fn report_swf_edit_text_unparseable(state: &SwfTagParseState, character_id: u32) {
    let Some(diagnostics) = &state.diagnostics else {
        return;
    };
    let mut detail = HashMap::new();
    detail.insert(
        String::from("capability"),
        ImportDiagnosticDetailValue::String(String::from("swf.text.define-edit-text")),
    );
    detail.insert(
        String::from("characterId"),
        ImportDiagnosticDetailValue::Number(character_id as f32),
    );
    report_import_diagnostic(
        Some(&mut diagnostics.write().unwrap()),
        ImportDiagnosticSeverity::Drop,
        "swf.edit-text-unparseable",
        "readSwfBoundedDefinition",
        Some(detail),
    );
}

const TAG_DEFINE_EDIT_TEXT: u32 = 37;
