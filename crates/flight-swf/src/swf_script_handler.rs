use std::collections::HashMap;
use std::sync::{Arc, LazyLock, RwLock};

use flight_importdiagnostics::{
    ImportDiagnosticDetailValue, ImportDiagnosticSeverity, report_import_diagnostic,
};
use flight_timeline::FrameScript;

use crate::{
    SwfAbcBlob, SwfPendingInitAction, SwfReader, SwfTagHandler, SwfTagHandlerRef, SwfTagParseState,
    SwfTagTimelineState, SwfTimeline, read_swf_abc_frame_scripts, read_swf_frame_actions,
};

pub static SWF_SCRIPT_HANDLER: LazyLock<SwfTagHandlerRef> = LazyLock::new(|| {
    Arc::new(SwfTagHandler {
        finish_timeline: None,
        instantiate: None,
        parse: Arc::new(|body, tag, state, timeline, _diagnostics| {
            if tag == TAG_DO_ABC || tag == TAG_DO_ABC_ANONYMOUS {
                state.abc_blobs.push(SwfAbcBlob {
                    bytes: read_swf_abc_payload(body, tag == TAG_DO_ABC),
                    named: tag == TAG_DO_ABC,
                });
                return true;
            }
            if tag == TAG_DO_INIT_ACTION {
                return read_swf_init_action(body, state);
            }
            return read_swf_do_action(body, state, timeline);
        }),
        resolve: Some(Arc::new(|state, timeline| {
            append_swf_abc_frame_scripts(state, timeline);
            for pending in state.pending_init_actions.clone() {
                if let Some(sprite) = state.sprites.get_mut(&pending.character_id)
                    && !sprite.actions.iter().any(|(frame, _)| *frame == 1)
                {
                    set_swf_frame_action(&mut sprite.actions, 1, pending.script);
                }
            }
        })),
        tags: vec![
            TAG_DO_ABC,
            TAG_DO_ABC_ANONYMOUS,
            TAG_DO_ACTION,
            TAG_DO_INIT_ACTION,
        ],
    })
});

// flight-lint: allow(hashmap-iteration) class and frame bindings have unique lookup keys, so the independent writes commute
fn append_swf_abc_frame_scripts(state: &mut SwfTagParseState, timeline: &mut SwfTimeline) {
    if state.abc_blobs.is_empty() {
        return;
    }
    let characters_by_class: HashMap<String, u32> = state
        .linkages
        .iter()
        .map(|(character_id, class_name)| (class_name.clone(), *character_id))
        .collect();

    for blob in state.abc_blobs.clone() {
        let by_class = {
            let bytes = blob.bytes.read().unwrap();
            match &state.diagnostics {
                Some(diagnostics) => {
                    read_swf_abc_frame_scripts(&bytes, Some(&mut diagnostics.write().unwrap()))
                }
                None => read_swf_abc_frame_scripts(&bytes, None),
            }
        };
        let Some(by_class) = by_class else {
            report_swf_abc_unreadable(state, blob.named);
            continue;
        };
        for (class_name, frames) in by_class {
            let Some(character_id) = characters_by_class.get(&class_name).copied() else {
                continue;
            };
            let actions = if character_id == 0 {
                Some(&mut timeline.actions)
            } else {
                state
                    .sprites
                    .get_mut(&character_id)
                    .map(|target| &mut target.actions)
            };
            let Some(actions) = actions else {
                continue;
            };
            for (frame, script) in frames {
                set_swf_frame_action(actions, frame, script);
            }
        }
    }
}

fn read_swf_abc_payload(
    body: &SwfReader,
    has_name: bool,
) -> flight_entity::Ref<Box<flight_entity::Uint8Array>> {
    let source = body.source.read().unwrap();
    let start = if has_name {
        let mut start = body.pos.saturating_add(4).min(body.end);
        while start < body.end && source[start] != 0 {
            start += 1;
        }
        start.saturating_add(1).min(body.end)
    } else {
        body.pos
    };
    return Arc::new(RwLock::new(
        source[start..body.end].to_vec().into_boxed_slice(),
    ));
}

fn read_swf_do_action(
    body: &SwfReader,
    state: &SwfTagParseState,
    timeline: &mut SwfTagTimelineState,
) -> bool {
    let mut reader = SwfReader::new(body.source.clone(), body.pos, body.end);
    let frame = timeline.frames.len() as i32 + 1;
    if let Some(script) = read_swf_frame_actions(&mut reader) {
        set_swf_frame_action(&mut timeline.actions, frame, script);
    } else {
        report_swf_declined_frame_script(state, "swf.script.do-action", frame, None);
    }
    return true;
}

fn read_swf_init_action(body: &mut SwfReader, state: &mut SwfTagParseState) -> bool {
    let sprite_id = u32::from(body.read_uint16());
    let mut reader = SwfReader::new(body.source.clone(), body.pos, body.end);
    if let Some(script) = read_swf_frame_actions(&mut reader) {
        state.pending_init_actions.push(SwfPendingInitAction {
            character_id: sprite_id,
            script,
        });
    } else {
        report_swf_declined_frame_script(state, "swf.script.do-init-action", 0, Some(sprite_id));
    }
    return true;
}

fn report_swf_abc_unreadable(state: &SwfTagParseState, named: bool) {
    let Some(diagnostics) = &state.diagnostics else {
        return;
    };
    let mut detail = HashMap::new();
    detail.insert(
        String::from("capability"),
        ImportDiagnosticDetailValue::String(String::from(if named {
            "swf.script.do-abc"
        } else {
            "swf.script.do-abc-anonymous"
        })),
    );
    report_import_diagnostic(
        Some(&mut diagnostics.write().unwrap()),
        ImportDiagnosticSeverity::Drop,
        "swf.abc-frame-scripts-unreadable",
        "appendSwfAbcFrameScripts",
        Some(detail),
    );
}

fn report_swf_declined_frame_script(
    state: &SwfTagParseState,
    capability: &str,
    frame: i32,
    character_id: Option<u32>,
) {
    let Some(diagnostics) = &state.diagnostics else {
        return;
    };
    let mut detail = HashMap::new();
    detail.insert(
        String::from("capability"),
        ImportDiagnosticDetailValue::String(capability.to_string()),
    );
    if let Some(character_id) = character_id {
        detail.insert(
            String::from("characterId"),
            ImportDiagnosticDetailValue::Number(character_id as f32),
        );
    } else {
        detail.insert(
            String::from("frame"),
            ImportDiagnosticDetailValue::Number(frame as f32),
        );
    }
    report_import_diagnostic(
        Some(&mut diagnostics.write().unwrap()),
        ImportDiagnosticSeverity::Skip,
        "swf.frame-script-declined",
        "readSwfTimeline",
        Some(detail),
    );
}

fn set_swf_frame_action(actions: &mut Vec<(i32, FrameScript)>, frame: i32, script: FrameScript) {
    if let Some((_, existing)) = actions
        .iter_mut()
        .find(|(existing_frame, _)| *existing_frame == frame)
    {
        *existing = script;
    } else {
        actions.push((frame, script));
    }
}

const TAG_DO_ABC: u32 = 82;
const TAG_DO_ABC_ANONYMOUS: u32 = 72;
const TAG_DO_ACTION: u32 = 12;
const TAG_DO_INIT_ACTION: u32 = 59;
