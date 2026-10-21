use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, RwLock};

use flight_glyphatlas::contract::*;
use flight_log::{
    LogData, LogLevel, LogValue, add_log_sink, create_log_state, create_memory_log_sink,
    get_memory_log_sink_entries,
};

use crate::support::{atlas_options, backend_producing, null_backend};

mod disable_glyph_atlas_guards {
    use super::*;

    #[test]
    fn stops_guard_reporting_for_later_lookups() {
        let atlas = create_glyph_atlas(&atlas_options(null_backend(), 64, 64));
        let log = Arc::new(RwLock::new(create_log_state()));
        let sink = create_memory_log_sink(8);
        add_log_sink(&log, sink.sink.clone());
        enable_glyph_atlas_guards(&atlas, &log, Arc::new(|| 1.0));
        disable_glyph_atlas_guards(&atlas);
        get_glyph_atlas_entry(&atlas, 65);
        assert!(get_memory_log_sink_entries(&sink).is_empty());
    }
}

mod enable_glyph_atlas_guards {
    use super::*;

    #[test]
    fn samples_the_live_clock_and_warns_once_for_rasterizer_null() {
        let atlas = create_glyph_atlas(&atlas_options(null_backend(), 64, 64));
        let log = Arc::new(RwLock::new(create_log_state()));
        let sink = create_memory_log_sink(8);
        add_log_sink(&log, sink.sink.clone());
        let now = Arc::new(AtomicU32::new(10));
        let clock_now = now.clone();
        enable_glyph_atlas_guards(
            &atlas,
            &log,
            Arc::new(move || f64::from(clock_now.load(Ordering::SeqCst))),
        );
        now.store(50, Ordering::SeqCst);
        get_glyph_atlas_entry(&atlas, 0x41);
        now.store(90, Ordering::SeqCst);
        get_glyph_atlas_entry(&atlas, 0x42);
        let entries = get_memory_log_sink_entries(&sink);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].timestamp_ms, 50.0);
        assert_eq!(entries[0].level, LogLevel::Warn);
        assert_eq!(entries[0].channel.as_deref(), Some("glyphatlas"));
        let message = message(&entries[0].data);
        assert!(message.contains("rasterizer produced nothing"));
        assert!(message.contains("U+0041"));
    }

    #[test]
    fn says_nothing_for_a_successful_lookup() {
        let atlas = create_glyph_atlas(&atlas_options(backend_producing(8, 8), 64, 64));
        let log = Arc::new(RwLock::new(create_log_state()));
        let sink = create_memory_log_sink(8);
        add_log_sink(&log, sink.sink.clone());
        enable_glyph_atlas_guards(&atlas, &log, Arc::new(|| 1.0));
        get_glyph_atlas_entry(&atlas, 65);
        assert!(get_memory_log_sink_entries(&sink).is_empty());
    }

    #[test]
    fn stays_silent_during_the_first_repacks_needed_to_settle() {
        let mut options = atlas_options(backend_producing(8, 8), 32, 32);
        options.padding = Some(1);
        let atlas = create_glyph_atlas(&options);
        let log = Arc::new(RwLock::new(create_log_state()));
        let sink = create_memory_log_sink(8);
        add_log_sink(&log, sink.sink.clone());
        enable_glyph_atlas_guards(&atlas, &log, Arc::new(|| 1.0));
        for codepoint in 65..76 {
            get_glyph_atlas_entry(&atlas, codepoint);
        }
        assert_eq!(get_glyph_atlas_layout_version(&atlas), 2);
        assert!(get_memory_log_sink_entries(&sink).is_empty());
    }

    #[test]
    fn warns_distinctly_when_a_glyph_is_larger_than_the_atlas() {
        let atlas = create_glyph_atlas(&atlas_options(backend_producing(200, 8), 64, 64));
        let log = Arc::new(RwLock::new(create_log_state()));
        let sink = create_memory_log_sink(8);
        add_log_sink(&log, sink.sink.clone());
        enable_glyph_atlas_guards(&atlas, &log, Arc::new(|| 1.0));
        get_glyph_atlas_entry(&atlas, 65);
        let entries = get_memory_log_sink_entries(&sink);
        assert_eq!(entries.len(), 1);
        let message = message(&entries[0].data);
        assert!(message.contains("larger than the atlas"));
        assert!(!message.contains("rasterizer produced nothing"));
    }

    #[test]
    fn warns_once_repack_count_reaches_the_thrashing_threshold() {
        let mut options = atlas_options(backend_producing(8, 8), 32, 32);
        options.padding = Some(1);
        let atlas = create_glyph_atlas(&options);
        let log = Arc::new(RwLock::new(create_log_state()));
        let sink = create_memory_log_sink(8);
        add_log_sink(&log, sink.sink.clone());
        enable_glyph_atlas_guards(&atlas, &log, Arc::new(|| 7.0));
        for codepoint in 65..90 {
            get_glyph_atlas_entry(&atlas, codepoint);
        }
        let entries = get_memory_log_sink_entries(&sink);
        assert_eq!(entries.len(), 1);
        let message = message(&entries[0].data);
        assert!(message.contains("working set does not fit"));
        assert!(message.contains("refreshBitmapTextGlyphLayout"));
    }

    fn message(data: &LogData) -> String {
        let LogData::Record(fields) = data else {
            panic!("expected guard record");
        };
        let Some(LogValue::Str(message)) = fields.get("message") else {
            panic!("expected message field");
        };
        return message.clone();
    }
}
