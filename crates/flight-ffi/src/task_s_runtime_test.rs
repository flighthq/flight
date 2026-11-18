//! Executable Task S constructor/callback/context/ownership round trips.

use std::ffi::{CString, c_void};
use std::ptr;
use std::sync::Arc;
use std::sync::atomic::{AtomicPtr, AtomicU64, AtomicUsize, Ordering};

#[derive(Default)]
struct DeviceContext {
    calls: AtomicUsize,
    refreshes: AtomicUsize,
}

unsafe fn device_context(context: *mut c_void) -> &'static DeviceContext {
    return unsafe { &*context.cast::<DeviceContext>() };
}

unsafe extern "C" fn device_get_capabilities(context: *mut c_void, out: *mut c_void) {
    let context = unsafe { device_context(context) };
    context.calls.fetch_add(1, Ordering::SeqCst);
    let out = unsafe { &mut *out.cast::<flight_sdk::DeviceCapabilities>() };
    out.has_keyboard = true;
    out.has_mouse = true;
}

unsafe extern "C" fn device_get_display_metrics(context: *mut c_void, out: *mut c_void) {
    let context = unsafe { device_context(context) };
    context.calls.fetch_add(1, Ordering::SeqCst);
    let out = unsafe { &mut *out.cast::<flight_sdk::DeviceDisplayMetrics>() };
    out.pixel_ratio = 2.0;
}

unsafe extern "C" fn device_get_id(context: *mut c_void) -> *mut std::ffi::c_char {
    let context = unsafe { device_context(context) };
    context.calls.fetch_add(1, Ordering::SeqCst);
    return CString::new("task-s-device").unwrap().into_raw();
}

unsafe extern "C" fn device_get_info(context: *mut c_void, _out: *mut c_void) {
    let context = unsafe { device_context(context) };
    context.calls.fetch_add(1, Ordering::SeqCst);
}

unsafe extern "C" fn device_get_safe_area_insets(context: *mut c_void, out: *mut c_void) {
    let context = unsafe { device_context(context) };
    context.calls.fetch_add(1, Ordering::SeqCst);
    let out = unsafe { &mut *out.cast::<flight_sdk::SafeAreaInsets>() };
    out.top = 11.0;
    out.bottom = 22.0;
}

unsafe extern "C" fn device_refresh(context: *mut c_void) {
    let context = unsafe { device_context(context) };
    context.calls.fetch_add(1, Ordering::SeqCst);
    context.refreshes.fetch_add(1, Ordering::SeqCst);
}

fn create_device(
    context: *mut c_void,
    refresh: Option<unsafe extern "C" fn(*mut c_void)>,
) -> *mut flight_sdk::HostDeviceCapability {
    return unsafe {
        crate::flight_create_host_device_capability(
            context,
            Some(device_get_capabilities),
            Some(device_get_display_metrics),
            Some(device_get_id),
            Some(device_get_info),
            Some(device_get_safe_area_insets),
            refresh,
        )
    };
}

#[test]
fn device_constructor_round_trips_out_string_optional_context_thread_and_free() {
    let context = Box::new(DeviceContext::default());
    let context_ptr = ptr::from_ref(context.as_ref()).cast_mut().cast::<c_void>();

    let rejected = unsafe {
        crate::flight_create_host_device_capability(
            context_ptr,
            None,
            Some(device_get_display_metrics),
            Some(device_get_id),
            Some(device_get_info),
            Some(device_get_safe_area_insets),
            None,
        )
    };
    assert!(
        rejected.is_null(),
        "a required NULL callback must reject construction"
    );
    assert_eq!(context.calls.load(Ordering::SeqCst), 0);

    let capability = create_device(context_ptr, None);
    assert!(!capability.is_null());
    let capability_ref = unsafe { &*capability };

    let mut flags = flight_sdk::create_device_capabilities();
    flight_sdk::get_device_capabilities(&mut flags, capability_ref);
    assert!(flags.has_keyboard && flags.has_mouse && !flags.has_stylus);
    assert_eq!(flight_sdk::get_device_id(capability_ref), "task-s-device");

    let mut insets = flight_sdk::create_safe_area_insets();
    flight_sdk::get_safe_area_insets(&mut insets, capability_ref);
    assert_eq!((insets.top, insets.bottom), (11.0, 22.0));
    flight_sdk::refresh_device_info(capability_ref);
    assert_eq!(
        context.refreshes.load(Ordering::SeqCst),
        0,
        "optional NULL maps to None"
    );

    let threaded = capability_ref.clone();
    let id = std::thread::spawn(move || flight_sdk::get_device_id(&threaded))
        .join()
        .unwrap();
    assert_eq!(id, "task-s-device");

    unsafe { crate::flight_free_host_device_capability(capability) };
    context.calls.fetch_add(1, Ordering::SeqCst);
    assert_eq!(
        context.calls.load(Ordering::SeqCst),
        5,
        "free never frees caller context"
    );

    let with_refresh = create_device(context_ptr, Some(device_refresh));
    flight_sdk::refresh_device_info(unsafe { &*with_refresh });
    assert_eq!(
        context.refreshes.load(Ordering::SeqCst),
        1,
        "optional Some invokes once"
    );
    unsafe { crate::flight_free_host_device_capability(with_refresh) };
}

#[derive(Default)]
struct TimerContext {
    callback: AtomicPtr<crate::FfiHostCallback>,
    delay_bits: AtomicU64,
    cancels: AtomicUsize,
}

unsafe extern "C" fn timer_cancel(context: *mut c_void) {
    let context = unsafe { &*context.cast::<TimerContext>() };
    context.cancels.fetch_add(1, Ordering::SeqCst);
}

unsafe extern "C" fn timer_schedule(
    context: *mut c_void,
    delay: f64,
    callback: *mut crate::FfiHostCallback,
) -> *mut crate::FfiDisposer {
    let timer = unsafe { &*context.cast::<TimerContext>() };
    timer.callback.store(callback, Ordering::SeqCst);
    timer.delay_bits.store(delay.to_bits(), Ordering::SeqCst);
    return unsafe { crate::flight_create_disposer(context, Some(timer_cancel)) };
}

unsafe extern "C" fn timer_now(_context: *mut c_void) -> f64 {
    return 42.5;
}

#[test]
fn timer_constructor_retains_nested_callback_until_disposer_free() {
    let timer = Box::new(TimerContext::default());
    let context = ptr::from_ref(timer.as_ref()).cast_mut().cast::<c_void>();
    let rejected = unsafe {
        crate::flight_create_host_timer_capability(
            context,
            None,
            Some(timer_schedule),
            Some(timer_now),
        )
    };
    assert!(rejected.is_null());

    let capability = unsafe {
        crate::flight_create_host_timer_capability(
            context,
            Some(timer_schedule),
            Some(timer_schedule),
            Some(timer_now),
        )
    };
    assert!(!capability.is_null());
    let capability_ref = unsafe { &*capability };
    assert_eq!((capability_ref.now_ms)(), 42.5);

    let nested_calls = Arc::new(AtomicUsize::new(0));
    let nested_recording = nested_calls.clone();
    let handle = (capability_ref.set_timeout)(
        12.75,
        Arc::new(move || {
            nested_recording.fetch_add(1, Ordering::SeqCst);
        }),
    );
    assert_eq!(
        f64::from_bits(timer.delay_bits.load(Ordering::SeqCst)),
        12.75
    );

    unsafe { crate::flight_free_host_timer_capability(capability) };
    let callback = timer.callback.load(Ordering::SeqCst);
    assert!(unsafe { crate::flight_call_host_callback_void(callback) });
    assert_eq!(nested_calls.load(Ordering::SeqCst), 1);
    (handle.cancel)();
    assert_eq!(timer.cancels.load(Ordering::SeqCst), 1);
}

#[test]
fn constructors_intern_provider_identity_by_stable_context_value() {
    let first_context = Box::new(DeviceContext::default());
    let first_context_ptr = ptr::from_ref(first_context.as_ref())
        .cast_mut()
        .cast::<c_void>();
    let second_context = Box::new(DeviceContext::default());
    let second_context_ptr = ptr::from_ref(second_context.as_ref())
        .cast_mut()
        .cast::<c_void>();

    let device = create_device(first_context_ptr, None);
    let timer = unsafe {
        crate::flight_create_host_timer_capability(
            first_context_ptr,
            Some(timer_schedule),
            Some(timer_schedule),
            Some(timer_now),
        )
    };
    let distinct_device = create_device(second_context_ptr, None);
    assert!(Arc::ptr_eq(
        &unsafe { &*device }.provider,
        &unsafe { &*timer }.provider
    ));
    assert!(!Arc::ptr_eq(
        &unsafe { &*device }.provider,
        &unsafe { &*distinct_device }.provider
    ));

    let retained_provider = unsafe { &*device }.provider.clone();
    unsafe {
        crate::flight_free_host_device_capability(device);
        crate::flight_free_host_timer_capability(timer);
    }
    let recreated = create_device(first_context_ptr, None);
    assert!(Arc::ptr_eq(
        &retained_provider,
        &unsafe { &*recreated }.provider
    ));

    unsafe {
        crate::flight_free_host_device_capability(recreated);
        crate::flight_free_host_device_capability(distinct_device);
    }
}
