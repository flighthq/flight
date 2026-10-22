use std::collections::HashMap;
use std::sync::{Arc, LazyLock};

use flight_importdiagnostics::{
    ImportDiagnosticDetailValue, ImportDiagnosticSeverity, report_import_diagnostic,
};

use crate::{
    SwfPendingText, SwfReader, SwfTagHandler, SwfTagHandlerRef, SwfTagParseState,
    create_swf_text_shape, read_swf_bounded_definition_header, read_swf_matrix,
};

pub static SWF_STATIC_TEXT_HANDLER: LazyLock<SwfTagHandlerRef> = LazyLock::new(|| {
    Arc::new(SwfTagHandler {
        finish_timeline: None,
        instantiate: None,
        parse: Arc::new(|body, tag, state, _timeline, _diagnostics| {
            let character_id = read_swf_bounded_definition_header(body, state, false);
            if character_id == 0 {
                return false;
            }
            let mut reader = SwfReader::new(body.source.clone(), body.pos, body.end);
            read_swf_matrix(&mut reader);
            if reader.valid {
                state.pending_texts.push(SwfPendingText {
                    character_id,
                    end: body.end,
                    source: body.source.clone(),
                    start: reader.pos,
                    version: if tag == TAG_DEFINE_TEXT { 1 } else { 2 },
                });
            }
            return true;
        }),
        resolve: Some(Arc::new(|state, _timeline| {
            append_swf_pending_text_shapes(state);
        })),
        tags: vec![TAG_DEFINE_TEXT, TAG_DEFINE_TEXT_2],
    })
});

fn append_swf_pending_text_shapes(state: &mut SwfTagParseState) {
    for pending in state.pending_texts.clone() {
        let shape = create_swf_text_shape(
            &mut SwfReader::new(pending.source, pending.start, pending.end),
            pending.version,
            &state.font_outline_sources,
        );
        let Some(shape) = shape else {
            report_swf_text_shape_uncomposable(state, pending.character_id, pending.version);
            continue;
        };
        state.shapes.insert(pending.character_id, shape);
    }
}

fn report_swf_text_shape_uncomposable(state: &SwfTagParseState, character_id: u32, version: u32) {
    let Some(diagnostics) = &state.diagnostics else {
        return;
    };
    let mut detail = HashMap::new();
    detail.insert(
        String::from("capability"),
        ImportDiagnosticDetailValue::String(String::from(if version == 2 {
            "swf.text.define-text-2"
        } else {
            "swf.text.define-text"
        })),
    );
    detail.insert(
        String::from("characterId"),
        ImportDiagnosticDetailValue::Number(character_id as f32),
    );
    report_import_diagnostic(
        Some(&mut diagnostics.write().unwrap()),
        ImportDiagnosticSeverity::Drop,
        "swf.text-shape-uncomposable",
        "appendSwfPendingTextShapes",
        Some(detail),
    );
}

const TAG_DEFINE_TEXT: u32 = 11;
const TAG_DEFINE_TEXT_2: u32 = 33;
