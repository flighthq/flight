use std::collections::HashMap;
use std::ffi::{CStr, CString, c_void};

struct ColorCallbackContext {
    calls: usize,
}

// flight-lint: allow(f64) callback state mirrors the FrameTick millisecond delta ABI
struct SignalCallbackContext {
    calls: usize,
    last_delta: f64,
}

#[test]
fn collection_callback_writes_an_owned_result_with_one_paired_free() {
    let mut context = ColorCallbackContext { calls: 0 };
    let result = unsafe {
        crate::flight_build_particle_color_curve(
            sample_color,
            std::ptr::from_mut(&mut context).cast::<c_void>(),
            2,
        )
    };
    assert!(!result.is_null());
    assert_eq!(context.calls, 2);
    assert_eq!(
        unsafe { crate::flight_build_particle_color_curve_result_len(result.cast()) },
        6
    );
    let last = unsafe { crate::flight_build_particle_color_curve_result_get(result.cast(), 5) };
    assert_eq!(unsafe { *last }, 3.0);
    assert!(unsafe {
        crate::flight_build_particle_color_curve_result_get(result.cast(), 6).is_null()
    });
    unsafe { crate::flight_build_particle_color_curve_result_free(result) };
}

#[test]
fn lifetime_byte_carrier_borrows_the_bounded_input_and_returns_owned_text() {
    let wav = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45];
    let mime = unsafe { crate::flight_detect_audio_mime_type(wav.as_ptr(), wav.len()) };
    assert!(!mime.is_null());
    assert_eq!(unsafe { CStr::from_ptr(mime) }.to_bytes(), b"audio/wav");
    unsafe { crate::flight_free_string(mime) };

    let missing = unsafe { crate::flight_detect_audio_mime_type(std::ptr::null(), 0) };
    assert!(missing.is_null());
}

#[test]
fn nested_optional_string_preserves_all_three_states() {
    let mut parent = flight_sdk::create_log_context();
    parent.channel = Some("parent".to_string());

    let inherited = unsafe {
        crate::flight_create_child_log_context(
            &parent,
            Box::into_raw(Box::new(HashMap::new())),
            false,
            std::ptr::null(),
        )
    };
    assert_eq!(unsafe { &*inherited }.channel.as_deref(), Some("parent"));
    unsafe { crate::flight_free_log_context(inherited) };

    let cleared = unsafe {
        crate::flight_create_child_log_context(
            &parent,
            Box::into_raw(Box::new(HashMap::new())),
            true,
            std::ptr::null(),
        )
    };
    assert_eq!(unsafe { &*cleared }.channel, None);
    unsafe { crate::flight_free_log_context(cleared) };

    let child_channel = CString::new("child").unwrap();
    let replaced = unsafe {
        crate::flight_create_child_log_context(
            &parent,
            Box::into_raw(Box::new(HashMap::new())),
            true,
            child_channel.as_ptr(),
        )
    };
    assert_eq!(unsafe { &*replaced }.channel.as_deref(), Some("child"));
    unsafe { crate::flight_free_log_context(replaced) };
}

// flight-lint: allow(f64) callback signature mirrors the FrameTick millisecond delta ABI
extern "C" fn receive_frame(context: *mut c_void, delta: f64) {
    let context = unsafe { &mut *context.cast::<SignalCallbackContext>() };
    context.calls += 1;
    context.last_delta = delta;
}

#[test]
fn returned_disposer_invokes_disconnects_and_frees_independently() {
    let source: flight_sdk::Signal<flight_sdk::FrameTick> = flight_sdk::create_signal();
    let mut context = SignalCallbackContext {
        calls: 0,
        last_delta: 0.0,
    };
    let disposer = unsafe {
        crate::flight_connect_signal_at_frame_rate(
            &source,
            10.0,
            receive_frame,
            std::ptr::from_mut(&mut context).cast::<c_void>(),
        )
    };
    assert!(!disposer.is_null());

    flight_sdk::emit_signal(&source, &flight_sdk::FrameTick { delta_time: 100.0 });
    assert_eq!(context.calls, 1);
    assert_eq!(context.last_delta, 100.0);

    assert!(unsafe { crate::flight_call_disposer(disposer) });
    flight_sdk::emit_signal(&source, &flight_sdk::FrameTick { delta_time: 100.0 });
    assert_eq!(
        context.calls, 1,
        "the invoked disposer disconnected the slot"
    );
    unsafe { crate::flight_free_disposer(disposer) };
}

extern "C" fn sample_color(context: *mut c_void, t: f32, out_rgb: *mut f32) -> bool {
    let context = unsafe { &mut *context.cast::<ColorCallbackContext>() };
    context.calls += 1;
    let out = unsafe { std::slice::from_raw_parts_mut(out_rgb, 3) };
    out.copy_from_slice(&[t, t + 1.0, t + 2.0]);
    return true;
}
