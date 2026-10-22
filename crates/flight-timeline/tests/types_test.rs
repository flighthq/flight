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

mod create_timeline_cue_registry {
    use super::*;

    #[test]
    fn creates_empty_registry() {
        let reg = create_timeline_cue_registry();
        let guard = reg.read().unwrap();
        assert!(guard.entries.is_empty());
    }
}

mod create_timeline_goto_cue {
    use super::*;

    #[test]
    fn creates_with_default_fields() {
        let cue = create_timeline_goto_cue();
        let guard = cue.read().unwrap();
        assert_eq!(guard.fields.frame, 0);
        assert_eq!(guard.fields.kind, TIMELINE_GOTO_CUE_KIND);
        assert_eq!(guard.target_frame, None);
        assert_eq!(guard.target_label, None);
    }

    #[test]
    fn caller_assigns_fields_after_create() {
        let cue = create_timeline_goto_cue();
        {
            let mut guard = cue.write().unwrap();
            guard.fields.frame = 5;
            guard.target_frame = Some(10);
            guard.target_label = Some("loop_start".to_string());
        }
        let guard = cue.read().unwrap();
        assert_eq!(guard.fields.frame, 5);
        assert_eq!(guard.target_frame, Some(10));
        assert_eq!(guard.target_label.as_deref(), Some("loop_start"));
    }
}

mod create_timeline_playback_cue {
    use super::*;

    #[test]
    fn creates_with_default_fields() {
        let cue = create_timeline_playback_cue();
        let guard = cue.read().unwrap();
        assert_eq!(guard.fields.frame, 0);
        assert_eq!(guard.fields.kind, "");
    }

    #[test]
    fn caller_assigns_fields_after_create() {
        let cue = create_timeline_playback_cue();
        {
            let mut guard = cue.write().unwrap();
            guard.fields.frame = 12;
            guard.fields.kind = "stop".to_string();
        }
        let guard = cue.read().unwrap();
        assert_eq!(guard.fields.frame, 12);
        assert_eq!(guard.fields.kind, "stop");
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

mod initialize_timeline_cue_registry {
    use super::*;
    use flight_entity::get_entity_id;
    use std::sync::Arc;

    #[test]
    fn reinitialize_clears_entries_and_preserves_id() {
        let reg = create_timeline_cue_registry();
        let id_before;
        {
            let mut guard = reg.write().unwrap();
            id_before = get_entity_id(&*guard);
            guard.entries.push(TimelineCueHandlerEntry {
                dispatch_on_seek: false,
                handle: Arc::new(|_timeline, _cue, _cause| {}),
                kind: "test".to_string(),
            });
        }
        {
            let guard = reg.read().unwrap();
            assert_eq!(guard.entries.len(), 1);
        }
        {
            let mut guard = reg.write().unwrap();
            initialize_timeline_cue_registry(&mut guard);
        }
        let guard = reg.read().unwrap();
        assert!(guard.entries.is_empty(), "entries cleared by reinitialize");
        assert_eq!(
            get_entity_id(&*guard),
            id_before,
            "entity ID survives reinitialize"
        );
    }
}

mod initialize_timeline_goto_cue {
    use super::*;
    use flight_entity::{
        attach_entity_binding, get_entity_binding_as, get_entity_id, get_entity_uid, set_entity_uid,
    };

    #[test]
    fn reinitialize_preserves_entity_id_binding_and_uid() {
        let cue = create_timeline_goto_cue();
        let (id_before, uid_before);
        {
            let mut guard = cue.write().unwrap();
            guard.fields.frame = 3;
            guard.target_frame = Some(7);
            attach_entity_binding(&mut *guard, Box::new(42u32));
            set_entity_uid(&mut *guard, "cue-abc".to_string());
            id_before = get_entity_id(&*guard);
            uid_before = get_entity_uid(&mut *guard);
        }
        {
            let mut guard = cue.write().unwrap();
            initialize_timeline_goto_cue(&mut guard);
        }
        let mut guard = cue.write().unwrap();
        assert_eq!(
            get_entity_id(&*guard),
            id_before,
            "entity ID survives reinitialize"
        );
        assert_eq!(
            get_entity_uid(&mut *guard),
            uid_before,
            "UID survives reinitialize"
        );
        assert_eq!(
            get_entity_binding_as::<u32, _>(&*guard),
            Some(&42u32),
            "binding survives reinitialize"
        );
        assert_eq!(guard.fields.frame, 0, "frame reset to default");
        assert_eq!(guard.target_frame, None, "target_frame reset to default");
        assert_eq!(guard.target_label, None, "target_label reset to default");
    }
}

mod initialize_timeline_playback_cue {
    use super::*;
    use flight_entity::{
        attach_entity_binding, get_entity_binding_as, get_entity_id, get_entity_uid, set_entity_uid,
    };

    #[test]
    fn reinitialize_preserves_entity_id_binding_and_uid() {
        let cue = create_timeline_playback_cue();
        let (id_before, uid_before);
        {
            let mut guard = cue.write().unwrap();
            guard.fields.frame = 8;
            guard.fields.kind = "play".to_string();
            attach_entity_binding(&mut *guard, Box::new(99u32));
            set_entity_uid(&mut *guard, "cue-xyz".to_string());
            id_before = get_entity_id(&*guard);
            uid_before = get_entity_uid(&mut *guard);
        }
        {
            let mut guard = cue.write().unwrap();
            initialize_timeline_playback_cue(&mut guard);
        }
        let mut guard = cue.write().unwrap();
        assert_eq!(
            get_entity_id(&*guard),
            id_before,
            "entity ID survives reinitialize"
        );
        assert_eq!(
            get_entity_uid(&mut *guard),
            uid_before,
            "UID survives reinitialize"
        );
        assert_eq!(
            get_entity_binding_as::<u32, _>(&*guard),
            Some(&99u32),
            "binding survives reinitialize"
        );
        assert_eq!(guard.fields.frame, 0, "frame reset to default");
        assert_eq!(guard.fields.kind, "", "kind reset to default");
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
