use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, RwLock};

use flight_log::{
    LogData, LogStateRef, LogValue, create_log_state, create_memory_log_sink,
    get_memory_log_sink_entries, set_log_sink,
};
use flight_path::PathWinding;

use super::*;

fn logger() -> (LogStateRef, flight_log::MemoryLogSink) {
    let state = Arc::new(RwLock::new(create_log_state()));
    let sink = create_memory_log_sink(16);
    set_log_sink(&state, Some(sink.sink.clone()));
    return (state, sink);
}

fn message(entry: &flight_log::LogEntry) -> String {
    let LogData::Record(record) = &entry.data else {
        return String::new();
    };
    let Some(LogValue::Str(message)) = record.get("message") else {
        return String::new();
    };
    return message.clone();
}

mod disable_clip_guards {
    use super::*;

    #[test]
    fn uninstalls_all_three_diagnostics() {
        let mut state = create_clip_region_state();
        let (logs, sink) = logger();
        enable_clip_guards(&mut state, &logs, Arc::new(|| 1.0));
        disable_clip_guards(&mut state);
        let region = acquire_clip_region(&mut state);
        release_clip_region(&mut state, &region);
        release_clip_region(&mut state, &region);
        let _ = clip_region_contains_point(&state, &region, 0.0, 0.0);
        let _ =
            create_clip_region_from_contours(&state, &[vec![0.0, 0.0, 1.0]], PathWinding::NonZero);
        assert!(get_memory_log_sink_entries(&sink).is_empty());
    }
}

mod enable_clip_guards {
    use super::*;

    #[test]
    fn reports_exact_once_keys_messages_channel_level_and_live_timestamps() {
        let ticks = Arc::new(AtomicUsize::new(0));
        let captured = ticks.clone();
        let clock = Arc::new(move || captured.fetch_add(1, Ordering::SeqCst) as f64 + 10.0);
        let mut state = create_clip_region_state();
        let (logs, sink) = logger();
        enable_clip_guards(&mut state, &logs, clock);

        let invalid = vec![vec![0.0, 0.0, 1.0]];
        let _ = create_clip_region_from_contours(&state, &invalid, PathWinding::NonZero);
        let _ = create_clip_region_from_contours(&state, &invalid, PathWinding::NonZero);

        let region = acquire_clip_region(&mut state);
        release_clip_region(&mut state, &region);
        release_clip_region(&mut state, &region);
        let _ = clip_region_contains_point(&state, &region, 0.0, 0.0);

        let entries = get_memory_log_sink_entries(&sink);
        assert_eq!(entries.len(), 3);
        assert!(
            entries
                .iter()
                .all(|entry| entry.channel.as_deref() == Some("clip"))
        );
        assert_eq!(entries[0].timestamp_ms, 10.0);
        assert_eq!(entries[1].timestamp_ms, 12.0);
        assert_eq!(entries[2].timestamp_ms, 13.0);
        assert_eq!(
            message(&entries[0]),
            "createClipRegionFromContours: contour 0 has 3 coordinates (odd-coordinate-count). Contours require at least three complete x/y pairs."
        );
        assert!(message(&entries[1]).starts_with("releaseClipRegion: this region is already"));
        assert!(message(&entries[2]).starts_with("A released ClipRegion was used"));
    }
}
