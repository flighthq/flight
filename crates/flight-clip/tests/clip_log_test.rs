//! flight-compiler: target-native
//!
//! The TypeScript companion exercises the target-native LogData adapter directly. Rust locks the
//! same observable envelope through the public guard that calls it.

use std::sync::{Arc, RwLock};

use flight_log::{
    LogData, LogValue, create_log_state, create_memory_log_sink, get_memory_log_sink_entries,
    set_log_sink,
};

use super::*;

#[test]
fn forwards_structured_clip_warnings() {
    let logs = Arc::new(RwLock::new(create_log_state()));
    let sink = create_memory_log_sink(4);
    set_log_sink(&logs, Some(sink.sink.clone()));
    enable_clip_guards(&logs, Arc::new(|| 7.0));
    let _ = create_clip_region_from_contours(&[vec![0.0, 0.0, 1.0]], PathWinding::NonZero);

    let mut entries = Vec::new();
    get_memory_log_sink_entries(&mut entries, &sink);
    let LogData::Record(data) = &entries[0].data else {
        panic!("clip warning must use structured data");
    };
    assert!(matches!(data.get("message"), Some(LogValue::Str(_))));
    assert_eq!(entries[0].channel.as_deref(), Some("clip"));
    disable_clip_guards();
}
