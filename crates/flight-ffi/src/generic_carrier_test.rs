use std::sync::Arc;

use crate::*;

mod flight_create_audio_resource_from_samples {
    use super::*;

    #[test]
    fn shares_each_channel_buffer_with_the_resource() {
        let samples = [0.25f32, -0.5, 1.0];
        let channel = unsafe { flight_create_float32_array_ref(samples.as_ptr(), samples.len()) };
        let channels = [channel as *const std::ffi::c_void];
        let resource =
            unsafe { flight_create_audio_resource_from_samples(channels.as_ptr(), 1, 8000.0) };
        let data = unsafe { flight_get_audio_resource_channel_data(resource, 0) };
        assert!(!data.is_null());
        let mut read = [0.0f32; 4];
        assert_eq!(
            unsafe { flight_read_float32_array_ref(data, 0, read.as_mut_ptr(), 4) },
            3
        );
        assert_eq!(&read[..3], &samples);
        // The returned handle shares the resource's buffer rather than copying it.
        let louder = [0.75f32];
        assert_eq!(
            unsafe { flight_write_float32_array_ref(data, 1, louder.as_ptr(), 1) },
            1
        );
        let again = unsafe { flight_get_audio_resource_channel_data(resource, 0) };
        assert_eq!(
            unsafe { flight_read_float32_array_ref(again, 1, read.as_mut_ptr(), 1) },
            1
        );
        assert_eq!(read[0], 0.75);
        assert!(unsafe { flight_get_audio_resource_channel_data(resource, 3) }.is_null());
        unsafe { flight_free_float32_array_ref(again) };
        unsafe { flight_free_float32_array_ref(data) };
        unsafe { flight_free_float32_array_ref(channel) };
        unsafe {
            drop(Box::from_raw(
                resource as *mut flight_sdk::Ref<flight_sdk::AudioResource>,
            ))
        };
    }
}

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

mod flight_create_embedded_image_resource_reference {
    use super::*;

    #[test]
    fn clones_the_caller_handle_into_the_reference() {
        let bytes = [7u8, 8];
        let handle = unsafe { flight_create_uint8_array_ref(bytes.as_ptr(), bytes.len()) };
        let reference = unsafe { flight_create_embedded_image_resource_reference(handle) };
        let shared = unsafe { &*(handle as *const flight_sdk::Ref<Box<[u8]>>) };
        assert_eq!(Arc::strong_count(shared), 2);
        unsafe { flight_free_uint8_array_ref(handle) };
        unsafe {
            drop(Box::from_raw(
                reference as *mut flight_sdk::Ref<flight_sdk::EmbeddedImageResourceReference>,
            ))
        };
    }
}

mod flight_create_uint8_array_ref {
    use super::*;

    #[test]
    fn copies_the_values_into_a_new_shared_buffer() {
        let bytes = [1u8, 2, 3];
        let handle = unsafe { flight_create_uint8_array_ref(bytes.as_ptr(), bytes.len()) };
        assert_eq!(unsafe { flight_get_uint8_array_ref_length(handle) }, 3);
        let mut read = [0u8; 2];
        assert_eq!(
            unsafe { flight_read_uint8_array_ref(handle, 1, read.as_mut_ptr(), 8) },
            2
        );
        assert_eq!(read, [2, 3]);
        assert_eq!(
            unsafe { flight_read_uint8_array_ref(handle, 9, read.as_mut_ptr(), 1) },
            0
        );
        assert_eq!(
            unsafe { flight_write_uint8_array_ref(handle, 9, bytes.as_ptr(), 1) },
            0
        );
        unsafe { flight_free_uint8_array_ref(handle) };
    }

    #[test]
    fn reads_null_handles_as_empty() {
        let empty = unsafe { flight_create_uint8_array_ref(std::ptr::null(), 0) };
        assert_eq!(unsafe { flight_get_uint8_array_ref_length(empty) }, 0);
        unsafe { flight_free_uint8_array_ref(empty) };
        assert_eq!(
            unsafe { flight_get_uint8_array_ref_length(std::ptr::null()) },
            0
        );
        let mut read = [0u8; 1];
        assert_eq!(
            unsafe { flight_read_uint8_array_ref(std::ptr::null(), 0, read.as_mut_ptr(), 1) },
            0
        );
        unsafe { flight_free_uint8_array_ref(std::ptr::null_mut()) };
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

mod flight_get_midi_access_input_ports_result {
    use super::*;

    fn box_outcome(
        ports: Option<Vec<flight_sdk::Ref<flight_sdk::MidiInputPort>>>,
        reason: flight_sdk::MidiAccessPortsReason,
    ) -> *mut std::ffi::c_void {
        let outcome = flight_sdk::MidiAccessPortsOutcome { ports, reason };
        return Box::into_raw(Box::new(outcome)) as *mut std::ffi::c_void;
    }

    #[test]
    fn reads_the_reason_and_borrowed_port_handles() {
        let mut port = flight_sdk::MidiInputPort::default();
        port.id = "input".to_string();
        let port = Arc::new(std::sync::RwLock::new(port));
        let outcome = box_outcome(
            Some(vec![port.clone()]),
            flight_sdk::MidiAccessPortsReason::Ok,
        );
        assert_eq!(
            unsafe { flight_get_midi_access_input_ports_result_reason(outcome) },
            flight_sdk::MidiAccessPortsReason::Ok as i32
        );
        assert!(unsafe { flight_get_midi_access_input_ports_result_has_ports(outcome) });
        assert_eq!(
            unsafe { flight_get_midi_access_input_ports_result_len(outcome) },
            1
        );
        let handle = unsafe { flight_get_midi_access_input_ports_result_get(outcome, 0) };
        let borrowed = unsafe { &*(handle as *const flight_sdk::Ref<flight_sdk::MidiInputPort>) };
        assert!(Arc::ptr_eq(borrowed, &port));
        assert!(unsafe { flight_get_midi_access_input_ports_result_get(outcome, 1) }.is_null());
        unsafe { flight_get_midi_access_input_ports_result_free(outcome) };
        // Freeing the outcome releases only its own clone of the port.
        assert_eq!(Arc::strong_count(&port), 1);
    }

    #[test]
    fn tells_an_absent_port_list_from_an_empty_one() {
        let absent = box_outcome(None, flight_sdk::MidiAccessPortsReason::Disposed);
        assert!(!unsafe { flight_get_midi_access_input_ports_result_has_ports(absent) });
        assert_eq!(
            unsafe { flight_get_midi_access_input_ports_result_len(absent) },
            0
        );
        assert_eq!(
            unsafe { flight_get_midi_access_input_ports_result_reason(absent) },
            flight_sdk::MidiAccessPortsReason::Disposed as i32
        );
        unsafe { flight_get_midi_access_input_ports_result_free(absent) };
        let empty = box_outcome(Some(Vec::new()), flight_sdk::MidiAccessPortsReason::Ok);
        assert!(unsafe { flight_get_midi_access_input_ports_result_has_ports(empty) });
        unsafe { flight_get_midi_access_input_ports_result_free(empty) };
    }

    #[test]
    fn reads_null_as_no_outcome() {
        let null = std::ptr::null();
        assert_eq!(
            unsafe { flight_get_midi_access_input_ports_result_reason(null) },
            -1
        );
        assert!(!unsafe { flight_get_midi_access_input_ports_result_has_ports(null) });
        assert!(unsafe { flight_get_midi_access_input_ports_result_get(null, 0) }.is_null());
        unsafe { flight_get_midi_access_input_ports_result_free(std::ptr::null_mut()) };
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
