use std::sync::Arc;

use crate::*;

mod flight_get_timeline_labels {
    use super::*;

    #[test]
    fn reads_an_owned_copy_of_the_shared_labels() {
        let source = flight_sdk::create_timeline_source(None);
        source.write().unwrap().labels = Arc::new(vec![flight_sdk::TimelineLabel {
            frame: 3,
            name: "intro".to_string(),
        }]);
        let timeline = flight_sdk::create_timeline(Some(&flight_sdk::TimelineOptions {
            source: Some(source.clone()),
            ..Default::default()
        }));
        let handle = &timeline as *const flight_sdk::TimelineRef as *const std::ffi::c_void;
        let labels = unsafe { flight_get_timeline_labels(handle) };
        // Replacing the shared list after the call leaves the returned copy unchanged.
        source.write().unwrap().labels = Arc::new(Vec::new());
        assert_eq!(unsafe { flight_get_timeline_labels_result_len(labels) }, 1);
        let label = unsafe { &*flight_get_timeline_labels_result_get(labels, 0) };
        assert_eq!((label.frame, label.name.as_str()), (3, "intro"));
        assert!(unsafe { flight_get_timeline_labels_result_get(labels, 1) }.is_null());
        unsafe { flight_get_timeline_labels_result_free(labels) };
    }

    #[test]
    fn reads_no_labels_without_a_source() {
        let timeline = flight_sdk::create_timeline(None);
        let handle = &timeline as *const flight_sdk::TimelineRef as *const std::ffi::c_void;
        let labels = unsafe { flight_get_timeline_labels(handle) };
        assert_eq!(unsafe { flight_get_timeline_labels_result_len(labels) }, 0);
        unsafe { flight_get_timeline_labels_result_free(labels) };
    }
}
