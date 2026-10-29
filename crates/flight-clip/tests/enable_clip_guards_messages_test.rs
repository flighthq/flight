//! flight-compiler: rust-only
//!
//! Rust locks the exact diagnostic envelope. The generated guard tests exercise the same three
//! callbacks in TypeScript without importing log implementation-only representation types.

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, RwLock};

use flight_log::{
    LogData, LogEntry, LogLevel, LogValue, create_log_state, create_memory_log_sink,
    get_memory_log_sink_entries, set_log_sink,
};

use super::*;

fn message(entry: &LogEntry) -> &str {
    let LogData::Record(data) = &entry.data else {
        panic!("clip guard diagnostics must use structured log data");
    };
    let Some(LogValue::Str(message)) = data.get("message") else {
        panic!("clip guard diagnostics must provide a string message");
    };
    return message;
}

#[test]
fn reports_exact_messages_channel_level_and_live_timestamps_once() {
    let ticks = Arc::new(AtomicUsize::new(0));
    let captured = ticks.clone();
    let clock = Arc::new(move || captured.fetch_add(1, Ordering::SeqCst) as f64 + 10.0);
    let logs = Arc::new(RwLock::new(create_log_state()));
    let sink = create_memory_log_sink(16);
    set_log_sink(&logs, Some(sink.sink.clone()));
    enable_clip_guards(&logs, clock);

    let invalid = vec![vec![0.0, 0.0, 1.0]];
    let _ = create_clip_region_from_contours(&invalid, PathWinding::NonZero);
    let _ = create_clip_region_from_contours(&invalid, PathWinding::NonZero);
    let region = acquire_clip_region();
    release_clip_region(&region);
    release_clip_region(&region);
    let _ = clip_region_contains_point(&region, 0.0, 0.0);

    let mut entries = Vec::new();
    get_memory_log_sink_entries(&mut entries, &sink);
    assert_eq!(entries.len(), 3);
    assert!(entries.iter().all(|entry| entry.level == LogLevel::Warn));
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
    assert_eq!(
        message(&entries[1]),
        "releaseClipRegion: this region is already in the pool, so it is being released twice. Two later acquireClipRegion calls will hand back the same object and the clips will alias each other. Every acquireClipRegion pairs with exactly one releaseClipRegion, and the region must not be used after release."
    );
    assert_eq!(
        message(&entries[2]),
        "A released ClipRegion was used while it was still in the pool. Do not retain or access a region after releaseClipRegion; acquire a new region before use."
    );

    disable_clip_guards();
    let _ = acquire_clip_region();
    let _ = acquire_clip_region();
}
