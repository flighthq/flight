use std::sync::{Arc, RwLock};

use flight_log::{
    LogData, LogLevel, LogValue, add_log_sink, create_log_state, create_memory_log_sink,
    get_memory_log_sink_entries,
};

use super::*;

fn guarded_data(page_index: i32, page_count: usize) -> BitmapFontData {
    let mut data = font_data();
    data.glyphs = vec![glyph(65, 7, 8, Some(page_index))];
    data.pages = (0..page_count).map(|_| Some(page())).collect();
    return data;
}

fn log_fixture() -> (flight_log::LogStateRef, flight_log::MemoryLogSink) {
    let state = Arc::new(RwLock::new(create_log_state()));
    let sink = create_memory_log_sink(4);
    add_log_sink(&state, sink.sink.clone());
    return (state, sink);
}

fn message(data: &LogData) -> &str {
    let LogData::Record(fields) = data else {
        panic!("expected record");
    };
    let Some(LogValue::Str(message)) = fields.get("message") else {
        panic!("expected message");
    };
    return message;
}

mod disable_bitmap_font_guards {
    use super::*;

    #[test]
    fn stops_a_previously_installed_warning() {
        let guards = guard_state();
        let (logs, sink) = log_fixture();
        enable_bitmap_font_guards(&guards, &logs, Arc::new(|| 7.0));
        disable_bitmap_font_guards(&guards);
        create_bitmap_font(&guards, &guarded_data(4, 1));
        assert!(get_memory_log_sink_entries(&sink).is_empty());
    }
}

mod enable_bitmap_font_guards {
    use super::*;

    #[test]
    fn emits_the_exact_once_warning_with_live_time_level_and_channel() {
        let guards = guard_state();
        let (logs, sink) = log_fixture();
        enable_bitmap_font_guards(&guards, &logs, Arc::new(|| 42.5));
        create_bitmap_font(&guards, &guarded_data(4, 1));
        create_bitmap_font(&guards, &guarded_data(8, 1));
        let entries = get_memory_log_sink_entries(&sink);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].level, LogLevel::Warn);
        assert_eq!(entries[0].channel.as_deref(), Some("bitmapfont"));
        assert_eq!(entries[0].timestamp_ms, 42.5);
        assert_eq!(
            message(&entries[0].data),
            "createBitmapFont: U+0041 names page 4, which this font does not have, so it was placed on page 0 and will sample whatever occupies those coordinates there. The font data is wrong, not the atlas — check the page index the exporter wrote."
        );
    }

    #[test]
    fn stays_silent_for_a_page_that_exists() {
        let guards = guard_state();
        let (logs, sink) = log_fixture();
        enable_bitmap_font_guards(&guards, &logs, Arc::new(|| 1.0));
        create_bitmap_font(&guards, &guarded_data(1, 2));
        assert!(get_memory_log_sink_entries(&sink).is_empty());
    }

    #[test]
    fn samples_the_injected_clock_only_when_a_warning_is_emitted() {
        let guards = guard_state();
        let (logs, sink) = log_fixture();
        let samples = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let record = samples.clone();
        enable_bitmap_font_guards(
            &guards,
            &logs,
            Arc::new(move || {
                record.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                return 9.0;
            }),
        );
        create_bitmap_font(&guards, &guarded_data(0, 1));
        create_bitmap_font(&guards, &guarded_data(4, 1));
        assert_eq!(samples.load(std::sync::atomic::Ordering::SeqCst), 1);
        assert_eq!(get_memory_log_sink_entries(&sink).len(), 1);
    }
}
