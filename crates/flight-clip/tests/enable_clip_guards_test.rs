//! flight-compiler: string-union PathWinding
//! flight-compiler: nullable-options

use std::sync::{Arc, RwLock};

use super::*;
use flight_log::{
    create_log_state, create_memory_log_sink, get_memory_log_sink_entries, set_log_sink,
};

mod disable_clip_guards {
    use super::*;

    #[test]
    fn uninstalls_all_three_diagnostics() {
        let logs = Arc::new(RwLock::new(create_log_state()));
        let sink = create_memory_log_sink(16);
        set_log_sink(&logs, Some(sink.sink.clone()));
        enable_clip_guards(&logs, Arc::new(|| 1.0));
        disable_clip_guards();
        let region = acquire_clip_region();
        release_clip_region(&region);
        release_clip_region(&region);
        let _ = clip_region_contains_point(&region, 0.0, 0.0);
        let _ = create_clip_region_from_contours(&[vec![0.0, 0.0, 1.0]], PathWinding::NonZero);
        let mut entries = Vec::new();
        get_memory_log_sink_entries(&mut entries, &sink);
        assert!(entries.is_empty());
        let _ = acquire_clip_region();
        let _ = acquire_clip_region();
    }
}

mod enable_clip_guards {
    use super::*;

    #[test]
    fn reports_each_lifecycle_diagnostic_once() {
        let logs = Arc::new(RwLock::new(create_log_state()));
        let sink = create_memory_log_sink(16);
        set_log_sink(&logs, Some(sink.sink.clone()));
        enable_clip_guards(&logs, Arc::new(|| 10.0));

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
        disable_clip_guards();
        let _ = acquire_clip_region();
        let _ = acquire_clip_region();
    }
}
