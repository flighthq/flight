use std::sync::{Arc, RwLock};

use flight_log::{
    LogData, LogLevel, LogValue, add_log_sink, create_log_state, create_memory_log_sink,
    get_memory_log_sink_entries, remove_log_sink,
};
use flight_movieclip::contract::*;
use flight_spritesheet::contract::*;

use crate::support::*;

fn capture_log(run: impl FnOnce()) -> Vec<flight_log::LogEntry> {
    let state = Arc::new(RwLock::new(create_log_state()));
    let sink = create_memory_log_sink(8);
    add_log_sink(&state, sink.sink.clone());
    run();
    remove_log_sink(&state, &sink.sink);
    return {
        let mut collected = Vec::new();
        get_memory_log_sink_entries(&mut collected, &sink);
        collected
    };
}

fn clock() -> MovieClipGuardClock {
    return Arc::new(|| 23.0);
}

mod are_movie_clip_guards_enabled {
    use super::*;

    #[test]
    fn reports_whether_the_spritesheet_adapter_diagnostic_is_installed() {
        let mut guards = MovieClipGuardState {
            movie_clip_guards_enabled: false,
            spritesheet_timeline_source_guard: None,
        };
        assert!(!are_movie_clip_guards_enabled(&guards));
        let state = Arc::new(RwLock::new(create_log_state()));
        enable_movie_clip_guards(&mut guards, &state, clock());
        assert!(are_movie_clip_guards_enabled(&guards));
        disable_movie_clip_guards(&mut guards);
        assert!(!are_movie_clip_guards_enabled(&guards));
    }
}

mod disable_movie_clip_guards {
    use super::*;

    #[test]
    fn restores_silent_adaptation_without_changing_the_source() {
        let mut guards = MovieClipGuardState {
            movie_clip_guards_enabled: false,
            spritesheet_timeline_source_guard: None,
        };
        let state = Arc::new(RwLock::new(create_log_state()));
        enable_movie_clip_guards(&mut guards, &state, clock());
        disable_movie_clip_guards(&mut guards);
        let entries = capture_log(|| {
            let sheet = sheet_with_frames(1);
            let animation = create_spritesheet_animation(Some(&SpritesheetAnimationOptions {
                direction: None,
                frame_duration: None,
                frame_durations: None,
                frames: Some(vec![0.0]),
                origin_x: None,
                origin_y: None,
                repeat_count: Some(3),
            }));
            let source = create_spritesheet_timeline_source(&guards, &sheet, &animation);
            assert_eq!(source.read().unwrap().total_frames, 1);
        });
        assert!(entries.is_empty());
    }
}

mod enable_movie_clip_guards {
    use super::*;

    #[test]
    fn warns_once_with_the_authored_repeat_and_variable_timing_loss() {
        let state = Arc::new(RwLock::new(create_log_state()));
        let sink = create_memory_log_sink(8);
        add_log_sink(&state, sink.sink.clone());
        let mut guards = MovieClipGuardState {
            movie_clip_guards_enabled: false,
            spritesheet_timeline_source_guard: None,
        };
        enable_movie_clip_guards(&mut guards, &state, clock());
        let sheet = sheet_with_frames(2);
        let animation = create_spritesheet_animation(Some(&SpritesheetAnimationOptions {
            direction: None,
            frame_duration: None,
            frame_durations: Some(vec![50.0, 150.0]),
            frames: Some(vec![0.0, 1.0]),
            origin_x: None,
            origin_y: None,
            repeat_count: Some(2),
        }));
        create_spritesheet_timeline_source(&guards, &sheet, &animation);
        create_spritesheet_timeline_source(&guards, &sheet, &animation);
        let entries = {
            let mut collected = Vec::new();
            get_memory_log_sink_entries(&mut collected, &sink);
            collected
        };
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].level, LogLevel::Warn);
        assert_eq!(entries[0].channel.as_deref(), Some("movieclip"));
        assert_eq!(entries[0].timestamp_ms, 23.0);
        let LogData::Record(data) = &entries[0].data else {
            panic!("expected a record");
        };
        assert!(matches!(data.get("repeatCount"), Some(LogValue::Int(2))));
        match data.get("unsupportedFields") {
            Some(LogValue::Array(values)) => {
                assert_eq!(values.len(), 2);
                assert!(matches!(&values[0], LogValue::Str(value) if value == "frameDurations"));
                assert!(matches!(&values[1], LogValue::Str(value) if value == "repeatCount"));
            }
            other => panic!("expected an array, got {:?}", other.is_some()),
        }
        match data.get("message") {
            Some(LogValue::Str(message)) => {
                assert!(message.contains("explainSpritesheetTimelineSource"));
            }
            _ => panic!("expected a message"),
        }
    }
}
