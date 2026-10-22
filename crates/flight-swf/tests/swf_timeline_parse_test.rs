use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, RwLock};

use crate::support::{create_tag, create_test_parse_state, join_bytes, reader, uint16};
use flight_entity::Ref;
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
};
use flight_swf::contract::*;
use flight_timeline::contract::{TimelineCue, create_timeline_playback_cue};

fn diagnostic_state() -> (SwfTagParseState, Ref<Vec<ImportDiagnostic>>) {
    let diagnostics = Arc::new(RwLock::new(Vec::new()));
    let mut state = create_test_parse_state();
    state.diagnostics = Some(diagnostics.clone());
    return (state, diagnostics);
}

fn place(depth: u16, character_id: u16) -> Vec<u8> {
    return create_tag(
        TAG_PLACE,
        &join_bytes(&[&uint16(depth), &uint16(character_id)]),
    );
}

fn placing_handler() -> SwfTagHandlerRef {
    return Arc::new(SwfTagHandler {
        finish_timeline: None,
        instantiate: None,
        parse: Arc::new(|body, _tag, _state, timeline, _diagnostics| {
            let depth = u32::from(body.read_uint16());
            let character_id = u32::from(body.read_uint16());
            let placement = SwfTagPlacement {
                advanced_blend_mode: None,
                alpha: 1.0,
                blend_mode: String::from("normal"),
                character_id,
                clip_depth: 0,
                color_adjustments: None,
                color_transform_adjustments: None,
                depth,
                direct_linkage: None,
                effects: Arc::new(Vec::new()),
                filter_adjustments: Arc::new(Vec::new()),
                matrix: SwfTagMatrix {
                    a: 1.0,
                    b: 0.0,
                    c: 0.0,
                    d: 1.0,
                    tx: 0.0,
                    ty: 0.0,
                },
                name: None,
                ratio: 0.0,
            };
            let mut placements = timeline.placements.write().unwrap();
            if let Some((_, existing)) = placements.iter_mut().find(|(key, _)| *key == depth) {
                *existing = placement;
            } else {
                placements.push((depth, placement));
            }
            return true;
        }),
        resolve: None,
        tags: vec![TAG_PLACE],
    });
}

fn read(tags: &[Vec<u8>]) -> Option<SwfTimeline> {
    let handler = placing_handler();
    let mut state = create_test_parse_state();
    state.dispatch = expand_swf_tag_handler_dispatch(&[handler.clone()]);
    state.handlers = vec![handler];
    return read_swf_timeline(
        &mut reader(join_bytes(
            &tags.iter().map(Vec::as_slice).collect::<Vec<_>>(),
        )),
        &mut state,
    );
}

fn control_and_placement_state() -> SwfTagParseState {
    let handlers = SWF_CONTROL_TAG_FAMILY
        .iter()
        .chain(SWF_PLACEMENT_TAG_FAMILY.iter())
        .cloned()
        .collect::<Vec<_>>();
    return create_swf_test_parse_state(Some(expand_swf_tag_handler_dispatch(&handlers)));
}

mod add_swf_timeline_label {
    use super::*;

    #[test]
    fn appends_the_given_pair() {
        let mut labels = Vec::new();
        add_swf_timeline_label(&mut labels, 3, "intro");
        assert_eq!(labels.len(), 1);
        assert_eq!(labels[0].frame, 3);
        assert_eq!(labels[0].name, "intro");
    }

    #[test]
    fn ignores_an_empty_name_and_an_exact_repeat() {
        let mut labels = Vec::new();
        add_swf_timeline_label(&mut labels, 3, "");
        add_swf_timeline_label(&mut labels, 3, "intro");
        add_swf_timeline_label(&mut labels, 3, "intro");
        assert_eq!(labels.len(), 1);
    }

    #[test]
    fn preserves_other_names_and_frames() {
        let mut labels = Vec::new();
        add_swf_timeline_label(&mut labels, 3, "intro");
        add_swf_timeline_label(&mut labels, 3, "start");
        add_swf_timeline_label(&mut labels, 9, "intro");
        assert_eq!(labels.len(), 3);
    }
}

mod read_swf_timeline {
    use super::*;

    #[test]
    fn calls_each_distinct_dispatched_finisher_once() {
        let calls = Arc::new(AtomicUsize::new(0));
        let callback_calls = calls.clone();
        let handler = Arc::new(SwfTagHandler {
            finish_timeline: Some(Arc::new(move |_state, _timeline| {
                callback_calls.fetch_add(1, Ordering::SeqCst);
            })),
            instantiate: None,
            parse: Arc::new(|_body, _tag, _state, _timeline, _diagnostics| true),
            resolve: None,
            tags: vec![9, 43],
        });
        let mut state = create_test_parse_state();
        state.dispatch = expand_swf_tag_handler_dispatch(&[handler.clone()]);
        let bytes = join_bytes(&[
            &create_tag(9, &[]),
            &create_tag(43, &[]),
            &create_tag(TAG_END, &[]),
        ]);
        assert!(read_swf_timeline(&mut reader(bytes), &mut state).is_some());
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn does_not_call_a_finisher_for_a_family_overridden_out_of_the_dispatch() {
        let calls = Arc::new(AtomicUsize::new(0));
        let callback_calls = calls.clone();
        let overridden = Arc::new(SwfTagHandler {
            finish_timeline: Some(Arc::new(move |_state, _timeline| {
                callback_calls.fetch_add(1, Ordering::SeqCst);
            })),
            instantiate: None,
            parse: Arc::new(|_body, _tag, _state, _timeline, _diagnostics| true),
            resolve: None,
            tags: vec![9],
        });
        let replacement = Arc::new(SwfTagHandler {
            finish_timeline: None,
            instantiate: None,
            parse: Arc::new(|_body, _tag, _state, _timeline, _diagnostics| true),
            resolve: None,
            tags: vec![9],
        });
        let mut state = create_test_parse_state();
        state.dispatch =
            expand_swf_tag_handler_dispatch(&[overridden.clone(), replacement.clone()]);
        state.handlers = vec![overridden, replacement];
        let bytes = join_bytes(&[&create_tag(9, &[]), &create_tag(TAG_END, &[])]);
        assert!(read_swf_timeline(&mut reader(bytes), &mut state).is_some());
        assert_eq!(calls.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn runs_the_sound_finisher_from_a_dispatch_only_state() {
        let dispatch = expand_swf_tag_handler_dispatch(&SWF_SOUND_TAG_FAMILY);
        let mut state = create_swf_test_parse_state(Some(dispatch));
        assert!(state.handlers.is_empty());
        let bytes = join_bytes(&[
            &create_tag(18, &[0, 0x20, 1, 0]),
            &create_tag(19, &[0, 0, 0, 0, 0xaa]),
            &create_tag(TAG_END, &[]),
        ]);
        let timeline = read_swf_timeline(&mut reader(bytes), &mut state).unwrap();
        assert_eq!(timeline.cues.len(), 1);
        assert_eq!(state.stream_sounds.len(), 1);
    }

    #[test]
    fn runs_multiple_finishers_in_dispatch_first_encounter_order() {
        let calls = Arc::new(RwLock::new(Vec::new()));
        let first_calls = calls.clone();
        let first = Arc::new(SwfTagHandler {
            finish_timeline: Some(Arc::new(move |_state, _timeline| {
                first_calls.write().unwrap().push("first");
            })),
            instantiate: None,
            parse: Arc::new(|_body, _tag, _state, _timeline, _diagnostics| true),
            resolve: None,
            tags: vec![20],
        });
        let second_calls = calls.clone();
        let second = Arc::new(SwfTagHandler {
            finish_timeline: Some(Arc::new(move |_state, _timeline| {
                second_calls.write().unwrap().push("second");
            })),
            instantiate: None,
            parse: Arc::new(|_body, _tag, _state, _timeline, _diagnostics| true),
            resolve: None,
            tags: vec![10],
        });
        let dispatch = expand_swf_tag_handler_dispatch(&[first, second]);
        let mut state = create_swf_test_parse_state(Some(dispatch));
        let bytes = create_tag(TAG_END, &[]);
        assert!(read_swf_timeline(&mut reader(bytes), &mut state).is_some());
        assert_eq!(calls.read().unwrap().as_slice(), ["first", "second"]);
    }

    #[test]
    fn distinguishes_declined_known_and_unknown_tags() {
        let (mut state, diagnostics) = diagnostic_state();
        let bytes = join_bytes(&[
            &create_tag(61, &[1, 2]),
            &create_tag(82, &[3, 4]),
            &create_tag(100, &[5, 6]),
            &create_tag(TAG_END, &[]),
        ]);
        assert!(read_swf_timeline(&mut reader(bytes), &mut state).is_some());
        let diagnostics = diagnostics.read().unwrap();
        assert_eq!(diagnostics.len(), 3);
        assert_eq!(diagnostics[0].kind, "swf.video-frame-payload");
        assert_eq!(diagnostics[1].kind, "swf.tag-handler-unregistered");
        assert_eq!(diagnostics[2].kind, "swf.tag-unknown");
        assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Skip);
        assert_eq!(diagnostics[2].severity, ImportDiagnosticSeverity::Skip);
        assert_eq!(
            diagnostics[0].detail.as_ref().unwrap().get("capability"),
            Some(&ImportDiagnosticDetailValue::String(String::from(
                "swf.video.video-frame"
            )))
        );
        let unknown_detail = diagnostics[2].detail.as_ref().unwrap();
        assert_eq!(unknown_detail.len(), 1);
        assert_eq!(
            unknown_detail.get("tag"),
            Some(&ImportDiagnosticDetailValue::Number(100.0))
        );
    }

    #[test]
    fn drops_a_real_scene_table_label_past_the_last_frame_and_reports_its_count() {
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let mut state = control_and_placement_state();
        state.diagnostics = Some(diagnostics.clone());
        let scene_label = create_tag(86, &join_bytes(&[&[1, 0], b"scene\0", &[1, 40], b"late\0"]));
        let bytes = join_bytes(&[
            &create_tag(TAG_SHOW_FRAME, &[]),
            &scene_label,
            &create_tag(TAG_END, &[]),
        ]);
        let timeline = read_swf_timeline(&mut reader(bytes), &mut state).unwrap();
        assert!(timeline.labels.is_empty());
        let diagnostics = diagnostics.read().unwrap();
        assert_eq!(diagnostics.len(), 2);
        assert_eq!(diagnostics[0].kind, "swf.scene-names");
        assert_eq!(diagnostics[1].kind, "swf.label-past-last-frame");
        let detail = diagnostics[1].detail.as_ref().unwrap();
        assert_eq!(
            detail.get("dropped"),
            Some(&ImportDiagnosticDetailValue::Number(1.0))
        );
        assert_eq!(
            detail.get("frames"),
            Some(&ImportDiagnosticDetailValue::Number(1.0))
        );
    }

    #[test]
    fn sorts_a_reachable_frame_label_by_frame() {
        let mut state = control_and_placement_state();
        let bytes = join_bytes(&[
            &create_tag(TAG_SHOW_FRAME, &[]),
            &create_tag(43, b"second\0"),
            &create_tag(TAG_SHOW_FRAME, &[]),
            &create_tag(TAG_END, &[]),
        ]);
        let timeline = read_swf_timeline(&mut reader(bytes), &mut state).unwrap();
        assert_eq!(
            timeline
                .labels
                .iter()
                .map(|label| label.frame)
                .collect::<Vec<_>>(),
            vec![2]
        );
    }

    #[test]
    fn drops_and_reports_entries_past_the_last_frame() {
        let handler = Arc::new(SwfTagHandler {
            finish_timeline: None,
            instantiate: None,
            parse: Arc::new(|_body, tag, _state, timeline, _diagnostics| {
                if tag == 9 {
                    add_swf_timeline_label(&mut timeline.labels, 4, "late");
                } else {
                    let cue = create_timeline_playback_cue();
                    cue.write().unwrap().fields.frame = 3;
                    let cue: Ref<dyn TimelineCue> = cue;
                    timeline.cues.push(cue);
                }
                return true;
            }),
            resolve: None,
            tags: vec![9, 43],
        });
        let (mut state, diagnostics) = diagnostic_state();
        state.dispatch = expand_swf_tag_handler_dispatch(&[handler.clone()]);
        state.handlers = vec![handler];
        let bytes = join_bytes(&[
            &create_tag(TAG_SHOW_FRAME, &[]),
            &create_tag(9, &[]),
            &create_tag(43, &[]),
            &create_tag(TAG_END, &[]),
        ]);
        let timeline = read_swf_timeline(&mut reader(bytes), &mut state).unwrap();
        assert!(timeline.labels.is_empty());
        assert!(timeline.cues.is_empty());
        let diagnostics = diagnostics.read().unwrap();
        assert_eq!(diagnostics.len(), 2);
        assert_eq!(diagnostics[0].kind, "swf.label-past-last-frame");
        assert_eq!(diagnostics[1].kind, "swf.cue-past-last-frame");
    }

    #[test]
    fn gives_a_stream_without_show_frame_one_aliased_snapshot() {
        let observed = Arc::new(RwLock::new(None));
        let captured = observed.clone();
        let handler = Arc::new(SwfTagHandler {
            finish_timeline: Some(Arc::new(move |_state, timeline| {
                *captured.write().unwrap() = Some(timeline.placements.clone());
            })),
            instantiate: None,
            parse: Arc::new(|_body, _tag, _state, _timeline, _diagnostics| true),
            resolve: None,
            tags: vec![9],
        });
        let mut state = create_test_parse_state();
        state.dispatch = expand_swf_tag_handler_dispatch(&[handler.clone()]);
        state.handlers = vec![handler];
        let bytes = join_bytes(&[&create_tag(9, &[]), &create_tag(TAG_END, &[])]);
        let timeline = read_swf_timeline(&mut reader(bytes), &mut state).unwrap();
        assert_eq!(timeline.frames.len(), 1);
        let observed = observed.read().unwrap();
        assert!(Arc::ptr_eq(
            timeline.frames.first().unwrap(),
            observed.as_ref().unwrap()
        ));
    }

    #[test]
    fn keeps_tag_alignment_after_an_unclaimed_payload() {
        let handler = placing_handler();
        let mut state = create_test_parse_state();
        state.dispatch = expand_swf_tag_handler_dispatch(&[handler.clone()]);
        state.handlers = vec![handler];
        let bytes = join_bytes(&[
            &create_tag(100, &[0xff; 120]),
            &place(1, 7),
            &create_tag(TAG_SHOW_FRAME, &[]),
            &create_tag(TAG_END, &[]),
        ]);
        let timeline = read_swf_timeline(&mut reader(bytes), &mut state).unwrap();
        let frame = timeline.frames[0].read().unwrap();
        assert_eq!(frame.len(), 1);
        assert_eq!(frame[0].0, 1);
        assert_eq!(frame[0].1.character_id, 7);
    }

    #[test]
    fn reports_exactly_one_unknown_tag_diagnostic() {
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let mut state = control_and_placement_state();
        state.diagnostics = Some(diagnostics.clone());
        let bytes = join_bytes(&[&create_tag(100, &[1, 2, 3]), &create_tag(TAG_END, &[])]);
        assert!(read_swf_timeline(&mut reader(bytes), &mut state).is_some());
        let diagnostics = diagnostics.read().unwrap();
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].kind, "swf.tag-unknown");
        assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Skip);
        let detail = diagnostics[0].detail.as_ref().unwrap();
        assert_eq!(detail.len(), 1);
        assert_eq!(
            detail.get("tag"),
            Some(&ImportDiagnosticDetailValue::Number(100.0))
        );
    }

    #[test]
    fn refuses_a_body_declared_past_the_stream() {
        let mut state = create_test_parse_state();
        let bytes = join_bytes(&[&uint16((9 << 6) | 0x3f), &[64, 0, 0, 0]]);
        assert!(read_swf_timeline(&mut reader(bytes), &mut state).is_none());
    }

    #[test]
    fn refuses_a_handler_rejection() {
        let handler = Arc::new(SwfTagHandler {
            finish_timeline: None,
            instantiate: None,
            parse: Arc::new(|_body, _tag, _state, _timeline, _diagnostics| false),
            resolve: None,
            tags: vec![9],
        });
        let mut state = create_test_parse_state();
        state.dispatch = expand_swf_tag_handler_dispatch(&[handler.clone()]);
        state.handlers = vec![handler];
        let bytes = join_bytes(&[&create_tag(9, &[]), &create_tag(TAG_END, &[])]);
        assert!(read_swf_timeline(&mut reader(bytes), &mut state).is_none());
    }

    #[test]
    fn refuses_when_the_shared_frame_entry_budget_is_exhausted() {
        let handler = placing_handler();
        let mut state = create_test_parse_state();
        state.dispatch = expand_swf_tag_handler_dispatch(&[handler.clone()]);
        state.handlers = vec![handler];
        state.remaining_frame_entries = 1;
        let bytes = join_bytes(&[
            &place(1, 7),
            &create_tag(TAG_SHOW_FRAME, &[]),
            &create_tag(TAG_END, &[]),
        ]);
        assert!(read_swf_timeline(&mut reader(bytes), &mut state).is_none());
    }

    #[test]
    fn snapshots_each_show_frame_in_placement_order() {
        let timeline = read(&[
            place(1, 7),
            create_tag(TAG_SHOW_FRAME, &[]),
            place(2, 8),
            create_tag(TAG_SHOW_FRAME, &[]),
            create_tag(TAG_END, &[]),
        ])
        .unwrap();
        assert_eq!(timeline.frames.len(), 2);
        let first = timeline.frames[0].read().unwrap();
        assert_eq!(first.len(), 1);
        assert_eq!(first[0].0, 1);
        let second = timeline.frames[1].read().unwrap();
        assert_eq!(second.len(), 2);
        assert_eq!(second[0].0, 1);
        assert_eq!(second[1].0, 2);
    }

    #[test]
    fn stops_at_end_and_accepts_a_bounded_stream_without_end() {
        let ended = read(&[
            create_tag(TAG_SHOW_FRAME, &[]),
            create_tag(TAG_END, &[]),
            create_tag(TAG_SHOW_FRAME, &[]),
        ])
        .unwrap();
        assert_eq!(ended.frames.len(), 1);
        let bounded = read(&[place(1, 7), create_tag(TAG_SHOW_FRAME, &[])]).unwrap();
        assert_eq!(bounded.frames.len(), 1);
    }
}

const TAG_END: u32 = 0;
const TAG_PLACE: u32 = 26;
const TAG_SHOW_FRAME: u32 = 1;
