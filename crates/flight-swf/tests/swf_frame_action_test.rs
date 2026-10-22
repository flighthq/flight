use std::sync::Arc;

use flight_entity::Ref;
use flight_importdiagnostics::{
    ImportDiagnosticDetailValue, ImportDiagnosticSeverity, collect_import_diagnostics,
};
use flight_movieclip::{
    MovieClip, create_movie_clip, get_movie_clip_current_frame, is_movie_clip_playing,
    play_movie_clip, set_movie_clip_source,
};
use flight_scene2d::Node2DRef;
use flight_swf::contract::*;
use flight_timeline::contract::{TimelineLabel, TimelineSourceOptions, create_timeline_source};

use crate::support::bytes_ref;

mod read_swf_abc_frame_scripts {
    use super::*;

    #[test]
    fn follows_a_compiler_shaped_add_frame_script_call_to_the_method_it_names() {
        let source = build_frame_script_abc(None);
        let scripts = read_swf_abc_frame_scripts(&source, None).unwrap();
        let frames = scripts.get("Main").unwrap();
        let mut frame_numbers: Vec<_> = frames.keys().copied().collect();
        frame_numbers.sort_unstable();
        assert_eq!(frame_numbers, vec![1]);

        let clip = three_frame_clip(Vec::new());
        play_movie_clip(&clip);
        let target: Node2DRef = clip.clone();
        frames.get(&1).unwrap()(&target, 1);
        assert!(!is_movie_clip_playing(&clip));
    }

    #[test]
    fn reports_a_frame_script_whose_body_is_not_a_command_this_importer_obeys() {
        let source = build_frame_script_abc(Some(1));
        let mut diagnostics = Vec::new();
        collect_import_diagnostics(&mut diagnostics, &|sink| {
            assert!(read_swf_abc_frame_scripts(&source, Some(sink)).is_some());
        });

        let dropped: Vec<_> = diagnostics
            .iter()
            .filter(|entry| entry.kind == "swf.abc-frame-script-declined")
            .collect();
        assert_eq!(dropped.len(), 1);
        assert_eq!(dropped[0].severity, ImportDiagnosticSeverity::Drop);
        let detail = dropped[0].detail.as_ref().unwrap();
        assert_eq!(
            detail.get("frame"),
            Some(&ImportDiagnosticDetailValue::Number(1.0))
        );
        assert_eq!(
            detail.get("reason"),
            Some(&ImportDiagnosticDetailValue::String(String::from(
                "commands-declined"
            )))
        );
        assert_eq!(detail.len(), 2);
    }

    #[test]
    fn stays_silent_about_a_frame_script_it_obeys() {
        let source = build_frame_script_abc(None);
        let mut diagnostics = Vec::new();
        collect_import_diagnostics(&mut diagnostics, &|sink| {
            let scripts = read_swf_abc_frame_scripts(&source, Some(sink)).unwrap();
            let mut frame_numbers: Vec<_> = scripts["Main"].keys().copied().collect();
            frame_numbers.sort_unstable();
            assert_eq!(frame_numbers, vec![1]);
        });
        assert!(diagnostics.is_empty());
    }

    #[test]
    fn reports_nothing_for_bytecode_that_is_not_a_readable_container() {
        assert!(read_swf_abc_frame_scripts(&[1, 2, 3], None).is_none());
    }
}

mod read_swf_frame_actions {
    use super::*;

    #[test]
    fn recognizes_a_stop_and_binds_it_to_the_clip_that_runs_it() {
        let script = read_swf_frame_actions(&mut actions(&[0x07])).unwrap();
        let clip = three_frame_clip(Vec::new());
        play_movie_clip(&clip);
        assert!(is_movie_clip_playing(&clip));

        let target: Node2DRef = clip.clone();
        script(&target, 1);
        assert!(!is_movie_clip_playing(&clip));
    }

    #[test]
    fn recognizes_the_goto_then_stop_pair_a_goto_and_stop_compiles_to() {
        let script =
            read_swf_frame_actions(&mut actions(&[0x81, 0x02, 0x00, 0x02, 0x00, 0x07])).unwrap();
        let clip = three_frame_clip(Vec::new());
        let target: Node2DRef = clip.clone();

        script(&target, 1);
        assert_eq!(get_movie_clip_current_frame(&clip), 3);
        assert!(!is_movie_clip_playing(&clip));
    }

    #[test]
    fn recognizes_a_goto_by_label() {
        let script =
            read_swf_frame_actions(&mut actions(&[0x8c, 0x04, 0x00, 0x65, 0x6e, 0x64, 0x00]))
                .unwrap();
        let clip = three_frame_clip(vec![TimelineLabel {
            frame: 3,
            name: String::from("end"),
        }]);
        let target: Node2DRef = clip.clone();

        script(&target, 1);
        assert_eq!(get_movie_clip_current_frame(&clip), 3);
    }

    #[test]
    fn refuses_a_block_that_contains_anything_beyond_playback_commands() {
        assert!(
            read_swf_frame_actions(&mut actions(&[0x96, 0x02, 0x00, 0x08, 0x00, 0x07])).is_none()
        );
        assert!(read_swf_frame_actions(&mut actions(&[0x99, 0x02, 0x00, 0x00, 0x00])).is_none());
    }

    #[test]
    fn reports_nothing_for_an_empty_block_and_one_that_runs_out_mid_action() {
        assert!(read_swf_frame_actions(&mut actions(&[0x00])).is_none());
        assert!(read_swf_frame_actions(&mut actions(&[0x81, 0x02, 0x00])).is_none());
    }

    #[test]
    fn bounds_a_goto_that_points_at_its_own_frame() {
        let script = read_swf_frame_actions(&mut actions(&[0x81, 0x00, 0x00, 0x00, 0x00])).unwrap();
        let clip = three_frame_clip(Vec::new());
        let timeline = clip.read().unwrap().data.timeline.clone().unwrap();
        timeline.write().unwrap().frame_scripts = Some(vec![(1, script.clone())]);
        let target: Node2DRef = clip.clone();

        script(&target, 1);
        assert_eq!(get_movie_clip_current_frame(&clip), 1);
    }
}

fn actions(bytes: &[u8]) -> SwfReader {
    let source = bytes_ref(bytes.to_vec());
    return SwfReader::new(source, 0, bytes.len());
}

fn three_frame_clip(labels: Vec<TimelineLabel>) -> Ref<MovieClip> {
    let source = create_timeline_source(Some(&TimelineSourceOptions {
        total_frames: Some(3),
        frame_rate: Some(24.0),
        labels: Some(Arc::new(labels)),
        cues: None,
        construct_frame: None,
    }));
    let clip = create_movie_clip();
    set_movie_clip_source(&clip, &source);
    return clip;
}
