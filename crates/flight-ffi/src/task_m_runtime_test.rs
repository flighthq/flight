use std::ffi::{CStr, c_void};
use std::future::ready;
use std::sync::{Arc, Mutex};

struct AsyncResult {
    error: bool,
    value: bool,
}

#[test]
fn callback_collections_and_path_segments_execute_with_bounded_contexts() {
    let curve = unsafe {
        crate::flight_build_particle_color_curve(sample_particle_color, std::ptr::null_mut(), 2)
    };
    assert_eq!(
        unsafe { crate::flight_build_particle_color_curve_result_len(curve) },
        6
    );
    let first = unsafe { crate::flight_build_particle_color_curve_result_get(curve, 0) };
    let last = unsafe { crate::flight_build_particle_color_curve_result_get(curve, 5) };
    assert_eq!(unsafe { *first }, 0.0);
    assert_eq!(unsafe { *last }, 3.0);
    unsafe { crate::flight_build_particle_color_curve_result_free(curve.cast()) };

    let diagnostics = unsafe { crate::flight_create_import_diagnostic_list() };
    assert!(unsafe {
        crate::flight_collect_import_diagnostics(
            diagnostics,
            append_import_diagnostic,
            std::ptr::null_mut(),
        )
    });
    assert_eq!(
        unsafe { crate::flight_get_import_diagnostic_list_length(diagnostics) },
        1
    );
    let kind = unsafe { crate::flight_get_import_diagnostic_list_kind(diagnostics, 0) };
    assert_eq!(
        unsafe { take_string(kind) }.as_deref(),
        Some("parse-warning")
    );
    unsafe { crate::flight_destroy_import_diagnostic_list(diagnostics) };

    let requirements = unsafe {
        crate::flight_collect_scene2d_requirements(collect_requirement, std::ptr::null_mut())
    };
    assert!(!requirements.is_null());
    assert_eq!(unsafe { &*requirements }.requirements.len(), 1);
    assert_eq!(unsafe { &*requirements }.requirements[0].key, "Shape");
    unsafe { crate::flight_free_requirement_set(requirements) };

    let mut path = flight_sdk::create_path(None);
    flight_sdk::append_path_move_to(&mut path, 1.0, 2.0);
    flight_sdk::append_path_line_to(&mut path, 3.0, 4.0);
    flight_sdk::append_path_close(&mut path);
    let mut kinds = Vec::new();
    assert!(unsafe {
        crate::flight_for_each_path_segment(
            &path,
            collect_segment,
            (&mut kinds as *mut Vec<u32>).cast(),
        )
    });
    assert_eq!(kinds, [0_u32, 1, 4]);
}

#[test]
fn lifetime_data_and_nested_optional_channels_preserve_all_states() {
    let audio = unsafe { take_string(crate::flight_detect_audio_mime_type(b"fLaC".as_ptr(), 4)) };
    assert_eq!(audio.as_deref(), Some("audio/flac"));
    let font = unsafe { take_string(crate::flight_detect_font_format(b"wOF2".as_ptr(), 4)) };
    assert_eq!(font.as_deref(), Some("woff2"));
    let video_bytes = [0x1a, 0x45, 0xdf, 0xa3];
    let video = unsafe {
        take_string(crate::flight_detect_video_mime_type(
            video_bytes.as_ptr(),
            video_bytes.len(),
        ))
    };
    assert_eq!(video.as_deref(), Some("video/webm"));

    let parent = unsafe { crate::flight_create_log_context() };
    unsafe { (*parent).channel = Some("parent".to_string()) };
    for (present, channel, expected) in [
        (false, std::ptr::null(), Some("parent")),
        (true, std::ptr::null(), None),
        (true, c"child".as_ptr(), Some("child")),
    ] {
        let fields = unsafe { crate::flight_serialize_log_error(c"value".as_ptr()) };
        let child =
            unsafe { crate::flight_create_child_log_context(parent, fields, present, channel) };
        assert_eq!(unsafe { &*child }.channel.as_deref(), expected);
        unsafe { crate::flight_free_log_context(child) };
    }
    unsafe { crate::flight_free_log_context(parent) };
}

#[test]
// flight-lint: allow(f64) signal callback ABI and frame deltas are defined by the SDK
fn retained_callbacks_have_explicit_signal_and_geolocation_teardown() {
    let signal = flight_sdk::create_signal::<flight_sdk::FrameTick>();
    let mut deltas = Vec::new();
    let disposer = unsafe {
        crate::flight_connect_signal_at_frame_rate(
            (&signal as *const flight_sdk::Signal<flight_sdk::FrameTick>).cast(),
            10.0,
            collect_signal_delta,
            (&mut deltas as *mut Vec<f64>).cast(),
        )
    };
    flight_sdk::emit_signal(&signal, &flight_sdk::FrameTick { delta_time: 40.0 });
    flight_sdk::emit_signal(&signal, &flight_sdk::FrameTick { delta_time: 60.0 });
    assert_eq!(deltas, [100.0]);
    assert!(unsafe { crate::flight_call_disposer(disposer) });
    flight_sdk::emit_signal(&signal, &flight_sdk::FrameTick { delta_time: 100.0 });
    assert_eq!(deltas, [100.0]);
    unsafe { crate::flight_free_disposer(disposer) };

    let host = flight_sdk::HostGeolocationCapability {
        clear_watch: Arc::new(|_| {}),
        get_current_position: Arc::new(|_| Box::pin(ready(None))),
        get_current_position_result: Arc::new(|_| {
            Box::pin(ready(flight_sdk::GeolocationPositionResult {
                position: None,
                reason: None,
            }))
        }),
        is_available: Arc::new(|| true),
        watch_position: Arc::new(|handler, _, on_error| {
            let mut position = flight_sdk::GeolocationPosition::default();
            position.latitude = 51.5;
            handler(&position);
            on_error.unwrap()(flight_sdk::GeolocationErrorReason::Denied);
            return 7;
        }),
        prompt_for_access: None,
    };
    let mut positions = Vec::new();
    let mut errors = Vec::new();
    let id = unsafe {
        crate::flight_watch_geolocation_position(
            &host,
            geolocation_position,
            (&mut positions as *mut Vec<f32>).cast(),
            std::ptr::null(),
            Some(geolocation_error),
            (&mut errors as *mut Vec<u32>).cast(),
        )
    };
    assert_eq!(id, 7);
    assert_eq!(positions, [51.5_f32]);
    assert_eq!(errors, [flight_sdk::GeolocationErrorReason::Denied as u32]);
}

#[test]
fn write_file_atomic_checks_the_data_tag_and_borrows_each_payload_for_provider_copy() {
    let calls = Arc::new(Mutex::new(Vec::new()));
    let record = calls.clone();
    let mut host = empty_file_system();
    host.write_file_atomic = Some(Arc::new(move |path, data, _| {
        let payload = match data {
            flight_sdk::FileAtomicWriteData::Bytes(value) => {
                format!("{path}:bytes:{:?}", value.data)
            }
            flight_sdk::FileAtomicWriteData::Text(value) => {
                format!("{path}:text:{}", value.data)
            }
        };
        record.lock().unwrap().push(payload);
        return Box::pin(ready(Ok(true)));
    }));

    let mut bytes_result = AsyncResult {
        error: false,
        value: false,
    };
    unsafe {
        crate::flight_write_file_atomic(
            &host,
            c"bytes".as_ptr(),
            0,
            [1_u8, 2].as_ptr(),
            2,
            std::ptr::null(),
            settle_bool,
            (&mut bytes_result as *mut AsyncResult).cast(),
        );
    }
    assert!(bytes_result.value);
    assert!(!bytes_result.error);

    let mut text_result = AsyncResult {
        error: false,
        value: false,
    };
    unsafe {
        crate::flight_write_file_atomic(
            &host,
            c"text".as_ptr(),
            1,
            b"hello".as_ptr(),
            5,
            std::ptr::null(),
            settle_bool,
            (&mut text_result as *mut AsyncResult).cast(),
        );
    }
    assert!(text_result.value);
    assert!(!text_result.error);
    assert_eq!(
        *calls.lock().unwrap(),
        ["bytes:bytes:[1, 2]", "text:text:hello"]
    );
}

extern "C" fn append_import_diagnostic(
    _context: *mut c_void,
    list: *mut crate::FfiImportDiagnosticList,
) -> bool {
    return unsafe {
        crate::flight_append_import_diagnostic(
            list,
            1,
            c"parse-warning".as_ptr(),
            c"fixture".as_ptr(),
        )
    };
}

extern "C" fn collect_requirement(
    _context: *mut c_void,
    list: *mut crate::FfiRequirementList,
) -> bool {
    unsafe {
        crate::flight_destroy_requirement_list(list);
        crate::flight_report_requirement(
            list,
            flight_sdk::RequirementFacet::SceneNodeKind as u32,
            c"Shape".as_ptr(),
        );
    }
    return true;
}

// flight-lint: allow(f64) path-segment callback ABI is defined by the SDK
extern "C" fn collect_segment(
    context: *mut c_void,
    kind: u32,
    _a: f64,
    _b: f64,
    _c: f64,
    _d: f64,
    _e: f64,
    _f: f64,
) -> bool {
    unsafe { &mut *(context as *mut Vec<u32>) }.push(kind);
    return true;
}

// flight-lint: allow(f64) signal callback ABI and frame deltas are defined by the SDK
extern "C" fn collect_signal_delta(context: *mut c_void, delta: f64) {
    unsafe { &mut *(context as *mut Vec<f64>) }.push(delta);
}

fn empty_file_system() -> flight_sdk::HostFileSystemCapability {
    return flight_sdk::HostFileSystemCapability {
        provider: Arc::new(()),
        append_text_file: None,
        can_access_file: None,
        copy: None,
        directory_exists: None,
        file_exists: None,
        get_file_system_usage: None,
        make_directory: None,
        open_file_read_stream: None,
        open_file_write_stream: None,
        read_binary_file: None,
        read_binary_file_range: None,
        read_directory: None,
        read_directory_recursive: None,
        read_text_file: None,
        remove_directory: None,
        remove_file: None,
        rename: None,
        stat_file: None,
        write_binary_file: None,
        write_file_atomic: None,
        write_text_file: None,
    };
}

extern "C" fn geolocation_error(context: *mut c_void, reason: u32) {
    unsafe { &mut *(context as *mut Vec<u32>) }.push(reason);
}

extern "C" fn geolocation_position(
    context: *mut c_void,
    position: *const flight_sdk::GeolocationPosition,
) {
    unsafe { &mut *(context as *mut Vec<f32>) }.push(unsafe { (*position).latitude });
}

extern "C" fn sample_particle_color(_context: *mut c_void, value: f32, out: *mut f32) -> bool {
    unsafe {
        *out = value;
        *out.add(1) = value + 1.0;
        *out.add(2) = value + 2.0;
    }
    return true;
}

extern "C" fn settle_bool(context: *mut c_void, value: bool, error: *mut std::ffi::c_char) {
    let result = unsafe { &mut *(context as *mut AsyncResult) };
    result.value = value;
    result.error = !error.is_null();
    unsafe { crate::flight_free_string(error) };
}

unsafe fn take_string(value: *mut std::ffi::c_char) -> Option<String> {
    if value.is_null() {
        return None;
    }
    let text = unsafe { CStr::from_ptr(value) }
        .to_str()
        .unwrap()
        .to_owned();
    unsafe { crate::flight_free_string(value) };
    return Some(text);
}
