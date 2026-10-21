use flight_timeline::contract::*;

mod create_timeline_cue_fields {
    use super::*;

    #[test]
    fn initializes_the_shared_fields_of_a_custom_cue_kind() {
        let fields = create_timeline_cue_fields(3, "acme.Cue");
        assert_eq!(fields.frame, 3);
        assert_eq!(fields.kind, "acme.Cue");
    }
}

mod create_timeline_signals {
    use super::*;
    use flight_signals::emit_signal;

    #[test]
    fn creates_every_lifecycle_signal_group_member() {
        let signals = create_timeline_signals();
        emit_signal(&signals.on_complete, &());
        emit_signal(&signals.on_loop, &());
        emit_signal(
            &signals.on_enter_frame,
            &TimelineFrameEvent {
                frame: 1,
                previous_frame: -1,
            },
        );
        emit_signal(
            &signals.on_exit_frame,
            &TimelineFrameEvent {
                frame: 1,
                previous_frame: -1,
            },
        );
        emit_signal(
            &signals.on_frame_constructed,
            &TimelineFrameEvent {
                frame: 1,
                previous_frame: -1,
            },
        );
    }
}

mod get_timeline_frame_entry_cause_string {
    use super::*;

    #[test]
    fn maps_each_entry_cause_to_its_source_name() {
        assert_eq!(
            get_timeline_frame_entry_cause_string(TimelineFrameEntryCause::Advance),
            "Advance"
        );
        assert_eq!(
            get_timeline_frame_entry_cause_string(TimelineFrameEntryCause::Seek),
            "Seek"
        );
    }
}

mod get_timeline_play_mode_string {
    use super::*;

    #[test]
    fn maps_each_play_mode_to_its_source_name() {
        assert_eq!(
            get_timeline_play_mode_string(TimelinePlayMode::Loop),
            "loop"
        );
        assert_eq!(
            get_timeline_play_mode_string(TimelinePlayMode::Once),
            "once"
        );
    }
}

mod parse_timeline_frame_entry_cause {
    use super::*;

    #[test]
    fn parses_the_source_names_and_rejects_anything_else() {
        assert_eq!(
            parse_timeline_frame_entry_cause("Advance"),
            Some(TimelineFrameEntryCause::Advance)
        );
        assert_eq!(
            parse_timeline_frame_entry_cause("Seek"),
            Some(TimelineFrameEntryCause::Seek)
        );
        assert_eq!(parse_timeline_frame_entry_cause("advance"), None);
        assert_eq!(parse_timeline_frame_entry_cause(""), None);
    }
}

mod parse_timeline_play_mode {
    use super::*;

    #[test]
    fn parses_the_source_names_and_rejects_anything_else() {
        assert_eq!(
            parse_timeline_play_mode("loop"),
            Some(TimelinePlayMode::Loop)
        );
        assert_eq!(
            parse_timeline_play_mode("once"),
            Some(TimelinePlayMode::Once)
        );
        assert_eq!(parse_timeline_play_mode("Loop"), None);
        assert_eq!(parse_timeline_play_mode(""), None);
    }
}
