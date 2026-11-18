use std::collections::HashMap;
use std::ffi::{CStr, CString};
use std::sync::Arc;

use crate::*;

mod owned_ref_return_lifecycle {
    use super::*;

    #[test]
    fn paired_free_releases_exactly_the_returned_arc_owner() {
        let handle = unsafe { flight_create_command_history() };
        assert!(!handle.is_null());
        let history = unsafe {
            &*handle
                .cast::<flight_sdk::Ref<flight_sdk::CommandHistory>>()
                .cast_const()
        };
        assert_eq!(Arc::strong_count(history), 1);

        let observer = Arc::clone(history);
        assert_eq!(Arc::strong_count(&observer), 2);
        unsafe { flight_free_command_history_ref(handle.cast()) };
        assert_eq!(Arc::strong_count(&observer), 1);

        unsafe { flight_free_command_history_ref(std::ptr::null_mut()) };
    }
}

mod flight_build_texture_atlas_region_index {
    use super::*;

    fn take_string(value: *mut std::ffi::c_char) -> String {
        let text = unsafe { CStr::from_ptr(value) }
            .to_str()
            .unwrap()
            .to_string();
        unsafe { flight_free_string(value) };
        return text;
    }

    #[test]
    fn fills_a_registered_map_with_owned_region_refs() {
        let atlas = flight_sdk::create_texture_atlas();
        for name in ["walk", "idle"] {
            flight_sdk::add_texture_atlas_region(
                &mut atlas.write().unwrap(),
                0.0,
                0.0,
                1.0,
                1.0,
                None,
                None,
                Some(name),
            );
        }
        let map = unsafe { flight_create_texture_atlas_region_map() };
        unsafe { flight_build_texture_atlas_region_index(map, &*atlas.read().unwrap()) };
        assert_eq!(
            unsafe { flight_get_texture_atlas_region_map_length(map) },
            2
        );
        assert_eq!(
            take_string(unsafe { flight_get_texture_atlas_region_map_key(map, 0) }),
            "idle"
        );
        assert_eq!(
            take_string(unsafe { flight_get_texture_atlas_region_map_key(map, 1) }),
            "walk"
        );
        assert!(unsafe { flight_get_texture_atlas_region_map_key(map, 2) }.is_null());
        let walk = CString::new("walk").unwrap();
        let region = unsafe { flight_get_texture_atlas_region_map_value(map, walk.as_ptr()) };
        // The region handle is an owned clone that outlives the map.
        unsafe { flight_destroy_texture_atlas_region_map(map) };
        let region_ref =
            unsafe { &*(region as *const flight_sdk::Ref<flight_sdk::TextureAtlasRegion>) };
        assert!(Arc::ptr_eq(region_ref, &atlas.read().unwrap().regions[0]));
        assert_eq!(Arc::strong_count(region_ref), 2);
        unsafe { flight_free_texture_atlas_region_ref(region as *mut _) };
        assert_eq!(Arc::strong_count(&atlas.read().unwrap().regions[0]), 1);
    }

    #[test]
    fn reads_missing_keys_and_null_maps_as_null() {
        let map = unsafe { flight_create_texture_atlas_region_map() };
        let missing = CString::new("missing").unwrap();
        assert!(
            unsafe { flight_get_texture_atlas_region_map_value(map, missing.as_ptr()) }.is_null()
        );
        assert!(
            unsafe { flight_get_texture_atlas_region_map_value(map, std::ptr::null()) }.is_null()
        );
        unsafe { flight_destroy_texture_atlas_region_map(map) };
        assert!(
            unsafe {
                flight_get_texture_atlas_region_map_value(std::ptr::null(), missing.as_ptr())
            }
            .is_null()
        );
        assert_eq!(
            unsafe { flight_get_texture_atlas_region_map_length(std::ptr::null()) },
            0
        );
        unsafe { flight_free_texture_atlas_region_ref(std::ptr::null_mut()) };
    }

    #[test]
    fn treats_another_handle_type_as_no_map() {
        let atlas = flight_sdk::create_texture_atlas();
        let counts = unsafe { flight_create_string_count_map() };
        let foreign = counts as *mut FfiTextureAtlasRegionMap;
        unsafe { flight_build_texture_atlas_region_index(foreign, &*atlas.read().unwrap()) };
        assert_eq!(
            unsafe { flight_get_texture_atlas_region_map_length(foreign) },
            0
        );
        unsafe { flight_destroy_texture_atlas_region_map(foreign) };
        assert_eq!(unsafe { flight_get_string_count_map_length(counts) }, 0);
        unsafe { flight_destroy_string_count_map(counts) };
    }
}

mod flight_call_disposer {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    fn box_disposer(dispose: Arc<dyn Fn() + Send + Sync>) -> *mut FfiDisposer {
        return Box::into_raw(Box::new(FfiDisposer { dispose }));
    }

    #[test]
    fn runs_the_disposer_on_every_call() {
        let calls = Arc::new(AtomicUsize::new(0));
        let counted = calls.clone();
        let disposer = box_disposer(Arc::new(move || {
            counted.fetch_add(1, Ordering::SeqCst);
        }));
        assert!(unsafe { flight_call_disposer(disposer) });
        assert!(unsafe { flight_call_disposer(disposer) });
        assert_eq!(calls.load(Ordering::SeqCst), 2);
        unsafe { flight_free_disposer(disposer) };
        // Freeing releases the captured state without running the disposer.
        assert_eq!(calls.load(Ordering::SeqCst), 2);
        assert_eq!(Arc::strong_count(&calls), 1);
    }

    #[test]
    fn contains_a_panicking_disposer() {
        let disposer = box_disposer(Arc::new(|| panic!("disposer failed")));
        assert!(!unsafe { flight_call_disposer(disposer) });
        unsafe { flight_free_disposer(disposer) };
    }

    #[test]
    fn reads_null_as_no_disposer() {
        assert!(!unsafe { flight_call_disposer(std::ptr::null()) });
        unsafe { flight_free_disposer(std::ptr::null_mut()) };
    }
}

mod flight_collect_rive_core_type_counts {
    use super::*;

    // A version-7 Rive file declaring Shape (3), Path (12) twice and Rectangle (7).
    const RIVE: [u8; 16] = [0x52, 0x49, 0x56, 0x45, 7, 0, 0, 0, 3, 0, 12, 0, 12, 0, 7, 0];

    fn read_key(map: *const FfiU64CountMap, index: usize) -> Option<u64> {
        let mut key = 0u64;
        return unsafe { flight_get_u64_count_map_key(map, index, &mut key) }.then_some(key);
    }

    #[test]
    fn counts_each_core_type_in_ascending_key_order() {
        let map = unsafe { flight_create_u64_count_map() };
        assert!(unsafe {
            flight_collect_rive_core_type_counts(
                map,
                RIVE.as_ptr(),
                RIVE.len(),
                std::ptr::null_mut(),
            )
        });
        assert_eq!(unsafe { flight_get_u64_count_map_length(map) }, 3);
        assert_eq!(
            (0..4).map(|index| read_key(map, index)).collect::<Vec<_>>(),
            [Some(3), Some(7), Some(12), None]
        );
        assert_eq!(unsafe { flight_get_u64_count_map_value(map, 12) }, 2);
        assert_eq!(unsafe { flight_get_u64_count_map_value(map, 3) }, 1);
        assert_eq!(unsafe { flight_get_u64_count_map_value(map, 999) }, -1);
        // A NULL key output still reports presence.
        assert!(unsafe { flight_get_u64_count_map_key(map, 0, std::ptr::null_mut()) });
        unsafe { flight_clear_u64_count_map(map) };
        assert_eq!(unsafe { flight_get_u64_count_map_length(map) }, 0);
        unsafe { flight_destroy_u64_count_map(map) };
    }

    #[test]
    fn reports_an_unreadable_file_through_the_diagnostics_list() {
        let map = unsafe { flight_create_u64_count_map() };
        let list = unsafe { flight_create_import_diagnostic_list() };
        let mut old = RIVE;
        old[4] = 6;
        assert!(!unsafe {
            flight_collect_rive_core_type_counts(map, old.as_ptr(), old.len(), list)
        });
        assert_eq!(unsafe { flight_get_u64_count_map_length(map) }, 0);
        assert!(unsafe { flight_get_import_diagnostic_list_length(list) } > 0);
        unsafe { flight_destroy_import_diagnostic_list(list) };
        unsafe { flight_destroy_u64_count_map(map) };
    }

    #[test]
    fn treats_null_and_another_handle_type_as_no_map() {
        let source = RIVE.as_ptr();
        assert!(!unsafe {
            flight_collect_rive_core_type_counts(
                std::ptr::null_mut(),
                source,
                RIVE.len(),
                std::ptr::null_mut(),
            )
        });
        let strings = unsafe { flight_create_string_count_map() };
        let foreign = strings as *mut FfiU64CountMap;
        assert!(!unsafe {
            flight_collect_rive_core_type_counts(foreign, source, RIVE.len(), std::ptr::null_mut())
        });
        assert_eq!(unsafe { flight_get_u64_count_map_length(foreign) }, 0);
        assert!(read_key(foreign, 0).is_none());
        assert_eq!(unsafe { flight_get_u64_count_map_value(foreign, 3) }, -1);
        unsafe { flight_clear_u64_count_map(foreign) };
        unsafe { flight_destroy_u64_count_map(foreign) };
        assert_eq!(unsafe { flight_get_string_count_map_length(strings) }, 0);
        unsafe { flight_destroy_string_count_map(strings) };
        unsafe { flight_destroy_u64_count_map(std::ptr::null_mut()) };
    }
}

mod flight_collect_svg_counts {
    use super::*;

    fn read_string(value: *mut std::ffi::c_char) -> String {
        let text = unsafe { CStr::from_ptr(value) }
            .to_str()
            .unwrap()
            .to_string();
        unsafe { flight_free_string(value) };
        return text;
    }

    #[test]
    fn collects_into_a_registered_count_map() {
        let source = "<svg><rect/><rect/><circle/></svg>";
        let mut expected = HashMap::new();
        assert!(flight_sdk::collect_svg_counts(&mut expected, source));
        let map = unsafe { flight_create_string_count_map() };
        let svg = CString::new(source).unwrap();
        assert!(unsafe { flight_collect_svg_counts(map, svg.as_ptr()) });
        assert_eq!(
            unsafe { flight_get_string_count_map_length(map) },
            expected.len()
        );
        let mut keys: Vec<&String> = expected.keys().collect();
        keys.sort();
        for (index, key) in keys.iter().enumerate() {
            assert_eq!(
                read_string(unsafe { flight_get_string_count_map_key(map, index) }),
                **key
            );
            let name = CString::new(key.as_str()).unwrap();
            assert_eq!(
                unsafe { flight_get_string_count_map_value(map, name.as_ptr()) },
                expected[*key] as i64
            );
        }
        assert!(unsafe { flight_get_string_count_map_key(map, keys.len()) }.is_null());
        let missing = CString::new("missing").unwrap();
        assert_eq!(
            unsafe { flight_get_string_count_map_value(map, missing.as_ptr()) },
            -1
        );
        unsafe { flight_clear_string_count_map(map) };
        assert_eq!(unsafe { flight_get_string_count_map_length(map) }, 0);
        unsafe { flight_destroy_string_count_map(map) };
    }

    #[test]
    fn treats_null_and_another_handle_type_as_no_map() {
        let svg = CString::new("<svg><rect/></svg>").unwrap();
        assert!(!unsafe { flight_collect_svg_counts(std::ptr::null_mut(), svg.as_ptr()) });
        let list = unsafe { flight_create_import_diagnostic_list() };
        let foreign = list as *mut FfiStringCountMap;
        assert!(!unsafe { flight_collect_svg_counts(foreign, svg.as_ptr()) });
        assert_eq!(unsafe { flight_get_string_count_map_length(foreign) }, 0);
        unsafe { flight_clear_string_count_map(foreign) };
        unsafe { flight_destroy_string_count_map(foreign) };
        assert_eq!(unsafe { flight_get_import_diagnostic_list_length(list) }, 0);
        unsafe { flight_destroy_import_diagnostic_list(list) };
        unsafe { flight_destroy_string_count_map(std::ptr::null_mut()) };
    }
}

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
        unsafe { flight_free_float32_array_ref(again.cast()) };
        unsafe { flight_free_float32_array_ref(data.cast()) };
        unsafe { flight_free_float32_array_ref(channel.cast()) };
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
        unsafe { flight_free_uint8_array_ref(handle.cast()) };
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
        unsafe { flight_free_uint8_array_ref(handle.cast()) };
    }

    #[test]
    fn reads_null_handles_as_empty() {
        let empty = unsafe { flight_create_uint8_array_ref(std::ptr::null(), 0) };
        assert_eq!(unsafe { flight_get_uint8_array_ref_length(empty) }, 0);
        unsafe { flight_free_uint8_array_ref(empty.cast()) };
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
        unsafe { flight_flatten_path_result_free(contours.cast()) };
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
    fn reads_the_reason_and_owned_port_handles() {
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
        assert!(unsafe { flight_get_midi_access_input_ports_result_get(outcome, 1) }.is_null());
        // The handle is an owned clone: it shares the port and outlives the outcome.
        assert_eq!(Arc::strong_count(&port), 3);
        unsafe { flight_get_midi_access_input_ports_result_free(outcome.cast()) };
        let owned = unsafe { &*(handle as *const flight_sdk::Ref<flight_sdk::MidiInputPort>) };
        assert!(Arc::ptr_eq(owned, &port));
        assert_eq!(owned.read().unwrap().id, "input");
        unsafe { flight_free_midi_input_port_ref(handle as *mut _) };
        assert_eq!(Arc::strong_count(&port), 1);
        unsafe { flight_free_midi_input_port_ref(std::ptr::null_mut()) };
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
        unsafe { flight_get_midi_access_input_ports_result_free(absent.cast()) };
        let empty = box_outcome(Some(Vec::new()), flight_sdk::MidiAccessPortsReason::Ok);
        assert!(unsafe { flight_get_midi_access_input_ports_result_has_ports(empty) });
        unsafe { flight_get_midi_access_input_ports_result_free(empty.cast()) };
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

mod flight_get_optional_texture_atlas_list_item {
    use super::*;

    #[test]
    fn reads_owned_page_refs_and_empty_slots() {
        let atlas = flight_sdk::create_texture_atlas();
        let list = unsafe { flight_create_optional_texture_atlas_list() };
        unsafe { ffi_optional_texture_atlas_list_values(list) }
            .unwrap()
            .extend([Some(atlas.clone()), None]);
        assert_eq!(
            unsafe { flight_get_optional_texture_atlas_list_length(list) },
            2
        );
        let page = unsafe { flight_get_optional_texture_atlas_list_item(list, 0) };
        assert!(unsafe { flight_get_optional_texture_atlas_list_item(list, 1) }.is_null());
        assert!(unsafe { flight_get_optional_texture_atlas_list_item(list, 2) }.is_null());
        // The page handle is an owned clone that outlives the list.
        unsafe { flight_destroy_optional_texture_atlas_list(list) };
        let page_ref = unsafe { &*(page as *const flight_sdk::Ref<flight_sdk::TextureAtlas>) };
        assert!(Arc::ptr_eq(page_ref, &atlas));
        unsafe { flight_free_texture_atlas_ref(page as *mut _) };
        assert_eq!(Arc::strong_count(&atlas), 1);
        unsafe { flight_free_texture_atlas_ref(std::ptr::null_mut()) };
    }

    #[test]
    fn get_bitmap_font_pages_skips_null_and_foreign_lists() {
        let font = flight_sdk::create_texture_atlas();
        let handle =
            &font as *const flight_sdk::Ref<flight_sdk::TextureAtlas> as *const std::ffi::c_void;
        // Without a live list the wrapper returns before it reads the font handle.
        unsafe { flight_get_bitmap_font_pages(std::ptr::null_mut(), handle) };
        let counts = unsafe { flight_create_string_count_map() };
        unsafe { flight_get_bitmap_font_pages(counts as *mut FfiOptionalTextureAtlasList, handle) };
        assert_eq!(unsafe { flight_get_string_count_map_length(counts) }, 0);
        unsafe { flight_destroy_string_count_map(counts) };
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
        unsafe { flight_get_timeline_labels_result_free(labels.cast()) };
    }

    #[test]
    fn reads_no_labels_without_a_source() {
        let timeline = flight_sdk::create_timeline(None);
        let handle = &timeline as *const flight_sdk::TimelineRef as *const std::ffi::c_void;
        let labels = unsafe { flight_get_timeline_labels(handle) };
        assert_eq!(unsafe { flight_get_timeline_labels_result_len(labels) }, 0);
        unsafe { flight_get_timeline_labels_result_free(labels.cast()) };
    }
}

mod flight_parse_xml_attributes {
    use super::*;

    fn take_string(value: *mut std::ffi::c_char) -> Option<String> {
        if value.is_null() {
            return None;
        }
        let text = unsafe { CStr::from_ptr(value) }
            .to_str()
            .unwrap()
            .to_string();
        unsafe { flight_free_string(value) };
        return Some(text);
    }

    #[test]
    fn reads_entries_in_order_and_by_key() {
        let attributes = CString::new("width=\"4\" height=\"2\"").unwrap();
        let record = unsafe { flight_parse_xml_attributes(attributes.as_ptr()) };
        assert_eq!(unsafe { flight_parse_xml_attributes_result_len(record) }, 2);
        let entry = |index| {
            (
                take_string(unsafe { flight_parse_xml_attributes_result_get_key(record, index) }),
                take_string(unsafe { flight_parse_xml_attributes_result_get_value(record, index) }),
            )
        };
        assert_eq!(entry(0), (Some("width".to_string()), Some("4".to_string())));
        assert_eq!(
            entry(1),
            (Some("height".to_string()), Some("2".to_string()))
        );
        assert_eq!(entry(2), (None, None));
        let height = CString::new("height").unwrap();
        let value = unsafe { flight_parse_xml_attributes_result_get(record, height.as_ptr()) };
        assert_eq!(take_string(value).as_deref(), Some("2"));
        let missing = CString::new("depth").unwrap();
        assert!(
            unsafe { flight_parse_xml_attributes_result_get(record, missing.as_ptr()) }.is_null()
        );
        unsafe { flight_parse_xml_attributes_result_free(record.cast()) };
        unsafe { flight_parse_xml_attributes_result_free(std::ptr::null_mut()) };
    }
}

mod flight_set_storage_items {
    use super::*;

    // A preferences capability whose `set_item` rejects the key "blocked" with QuotaExceeded.
    fn create_preferences() -> flight_sdk::HostPreferencesCapability {
        return flight_sdk::HostPreferencesCapability {
            clear: Arc::new(|| -> flight_sdk::StorageClearResult { unreachable!() }),
            get_item: Arc::new(|_: &str| -> flight_sdk::StorageGetItemResult { unreachable!() }),
            keys: Arc::new(|| -> flight_sdk::StorageKeysResult { unreachable!() }),
            provider: Arc::new(()),
            remove_item: Arc::new(|_: &str| -> flight_sdk::StorageRemoveItemResult {
                unreachable!()
            }),
            set_item: Arc::new(|key: &str, _: &str| {
                if key == "blocked" {
                    return flight_sdk::StorageMutationOutcome::Err(
                        flight_sdk::StorageMutationErr {
                            reason: flight_sdk::StorageSetItemFailureReason::QuotaExceeded,
                        },
                    );
                }
                return flight_sdk::StorageMutationOutcome::Ok;
            }),
        };
    }

    fn set_items(entries: &[(&str, &str)]) -> *mut flight_sdk::StorageSetItemsResult {
        let preferences = create_preferences();
        let keys: Vec<CString> = entries
            .iter()
            .map(|(key, _)| CString::new(*key).unwrap())
            .collect();
        let values: Vec<CString> = entries
            .iter()
            .map(|(_, value)| CString::new(*value).unwrap())
            .collect();
        let key_ptrs: Vec<*const std::ffi::c_char> = keys.iter().map(|key| key.as_ptr()).collect();
        let value_ptrs: Vec<*const std::ffi::c_char> =
            values.iter().map(|value| value.as_ptr()).collect();
        return unsafe {
            flight_set_storage_items(
                &preferences,
                key_ptrs.as_ptr(),
                value_ptrs.as_ptr(),
                entries.len(),
                std::ptr::null(),
            )
        };
    }

    #[test]
    fn reads_a_completed_batch() {
        let result = set_items(&[("a", "1"), ("b", "2")]);
        assert!(unsafe { flight_is_storage_set_items_result_ok(result) });
        assert_eq!(
            unsafe { flight_get_storage_set_items_result_completed(result) },
            2
        );
        assert!(unsafe { flight_get_storage_set_items_result_failed_key(result) }.is_null());
        assert_eq!(
            unsafe { flight_get_storage_set_items_result_reason(result) },
            -1
        );
        unsafe { flight_free_storage_set_items_result(result) };
    }

    #[test]
    fn reads_the_failing_key_and_reason() {
        let result = set_items(&[("a", "1"), ("blocked", "2"), ("c", "3")]);
        assert!(!unsafe { flight_is_storage_set_items_result_ok(result) });
        assert_eq!(
            unsafe { flight_get_storage_set_items_result_completed(result) },
            1
        );
        let key = unsafe { flight_get_storage_set_items_result_failed_key(result) };
        assert_eq!(unsafe { CStr::from_ptr(key) }.to_str().unwrap(), "blocked");
        unsafe { flight_free_string(key) };
        assert_eq!(
            unsafe { flight_get_storage_set_items_result_reason(result) },
            flight_sdk::StorageSetItemFailureReason::QuotaExceeded as i32
        );
        unsafe { flight_free_storage_set_items_result(result) };
    }

    #[test]
    fn reads_null_as_no_result() {
        let null = std::ptr::null();
        assert!(!unsafe { flight_is_storage_set_items_result_ok(null) });
        assert_eq!(
            unsafe { flight_get_storage_set_items_result_completed(null) },
            0
        );
        assert!(unsafe { flight_get_storage_set_items_result_failed_key(null) }.is_null());
        assert_eq!(
            unsafe { flight_get_storage_set_items_result_reason(null) },
            -1
        );
        unsafe { flight_free_storage_set_items_result(std::ptr::null_mut()) };
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
