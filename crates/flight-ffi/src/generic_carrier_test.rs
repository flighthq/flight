use std::sync::Arc;

use crate::*;

mod flight_create_clip_region_from_contours {
    use super::*;

    #[test]
    fn copies_each_contour_for_the_call() {
        let square = [0.0f64, 0.0, 10.0, 0.0, 10.0, 10.0, 0.0, 10.0];
        let lists = [square.as_ptr() as *const std::ffi::c_void];
        let lengths = [square.len()];
        let region = unsafe {
            flight_create_clip_region_from_contours(lists.as_ptr(), lengths.as_ptr(), 1, 0)
        };
        assert!(unsafe { flight_clip_region_contains_point(region, 5.0, 5.0) });
        assert!(!unsafe { flight_clip_region_contains_point(region, 15.0, 5.0) });
        unsafe {
            drop(Box::from_raw(
                region as *mut flight_sdk::Ref<flight_sdk::ClipRegion>,
            ))
        };
    }

    #[test]
    fn reads_null_arrays_as_no_contours() {
        let region = unsafe {
            flight_create_clip_region_from_contours(std::ptr::null(), std::ptr::null(), 0, 0)
        };
        assert!(!unsafe { flight_clip_region_contains_point(region, 0.0, 0.0) });
        unsafe {
            drop(Box::from_raw(
                region as *mut flight_sdk::Ref<flight_sdk::ClipRegion>,
            ))
        };
    }
}

mod flight_flatten_path {
    use super::*;

    #[test]
    fn reads_each_flattened_contour() {
        let mut path = flight_sdk::create_path(None);
        flight_sdk::append_path_rectangle(&mut path, 0.0, 0.0, 4.0, 2.0);
        let contours = unsafe { flight_flatten_path(&path, f64::NAN) };
        assert_eq!(unsafe { flight_flatten_path_result_len(contours) }, 1);
        let length = unsafe { flight_flatten_path_result_get_len(contours, 0) };
        let points = unsafe { flight_flatten_path_result_get(contours, 0) };
        let points = unsafe { std::slice::from_raw_parts(points, length) };
        assert_eq!(points, flight_sdk::flatten_path(&path, None)[0].as_slice());
        assert!(unsafe { flight_flatten_path_result_get(contours, 1) }.is_null());
        assert_eq!(
            unsafe { flight_flatten_path_result_get_len(contours, 1) },
            0
        );
        unsafe { flight_flatten_path_result_free(contours) };
    }

    #[test]
    fn reads_null_results_as_empty() {
        assert_eq!(
            unsafe { flight_flatten_path_result_len(std::ptr::null()) },
            0
        );
        assert!(unsafe { flight_flatten_path_result_get(std::ptr::null(), 0) }.is_null());
        unsafe { flight_flatten_path_result_free(std::ptr::null_mut()) };
    }
}

mod flight_fuse_color_matrices {
    use super::*;

    #[test]
    fn composes_every_borrowed_matrix() {
        let mut scale = flight_sdk::create_identity_color_matrix();
        scale[0] = 0.5;
        let matrices = [
            &scale as *const [f32; 20] as *const std::ffi::c_void,
            &scale as *const [f32; 20] as *const std::ffi::c_void,
        ];
        let fused = unsafe { flight_fuse_color_matrices(matrices.as_ptr(), 2) };
        assert_eq!(
            unsafe { *fused },
            flight_sdk::fuse_color_matrices(&[&scale, &scale])
        );
        unsafe { flight_free_f32_array_20(fused) };
    }

    #[test]
    fn reads_an_empty_array_as_identity() {
        let fused = unsafe { flight_fuse_color_matrices(std::ptr::null(), 0) };
        assert_eq!(
            unsafe { *fused },
            flight_sdk::create_identity_color_matrix()
        );
        unsafe { flight_free_f32_array_20(fused) };
        unsafe { flight_free_f32_array_20(std::ptr::null_mut()) };
    }
}

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

mod flight_split_bitmap_channels {
    use super::*;

    #[test]
    fn writes_one_owned_bitmap_per_channel() {
        let source = unsafe { flight_create_bitmap(1, 1, 0x11223344) };
        let mut channels = [std::ptr::null_mut(); 4];
        unsafe { flight_split_bitmap_channels(source, channels.as_mut_ptr()) };
        let expected = flight_sdk::split_bitmap_channels(unsafe { &*source });
        for (channel, expected) in channels.iter().zip(&expected) {
            assert!(!channel.is_null());
            let bitmap = unsafe { &*(*channel as *const flight_sdk::Bitmap) };
            assert_eq!(bitmap.data, expected.data);
            unsafe { flight_free_bitmap(*channel as *mut flight_sdk::Bitmap) };
        }
        unsafe { flight_free_bitmap(source) };
    }

    #[test]
    fn drops_the_channels_without_an_output_array() {
        let source = unsafe { flight_create_bitmap(1, 1, 0) };
        unsafe { flight_split_bitmap_channels(source, std::ptr::null_mut()) };
        unsafe { flight_free_bitmap(source) };
    }
}
