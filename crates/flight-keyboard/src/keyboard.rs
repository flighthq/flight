use std::sync::{Arc, Mutex};

use flight_entity::allocate_entity;
use flight_signals::{create_signal, emit_signal};

use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use std::future::Future;
    use std::sync::{Arc, Mutex};
    use std::task::{Context, Poll, Waker};

    use flight_signals::has_signal_slots;

    use super::*;

    fn block_on<F: Future>(future: F) -> F::Output {
        let mut future = Box::pin(future);
        let mut context = Context::from_waker(Waker::noop());
        loop {
            match future.as_mut().poll(&mut context) {
                Poll::Ready(value) => return value,
                Poll::Pending => std::thread::yield_now(),
            }
        }
    }

    fn change_capability(releases: Arc<Mutex<usize>>) -> HostSoftKeyboardChangeCapability {
        return HostSoftKeyboardChangeCapability {
            subscribe: Arc::new(move |_listener| {
                let releases = releases.clone();
                return Box::pin(async move {
                    Ok(SoftKeyboardChangeSubscription {
                        result: SoftKeyboardAttachResult::Ok,
                        unsubscribe: Some(Arc::new(move || *releases.lock().unwrap() += 1)),
                    })
                });
            }),
        };
    }

    fn info_capability() -> HostSoftKeyboardInfoCapability {
        return HostSoftKeyboardInfoCapability {
            get_info: Arc::new(|out| {
                *out = SoftKeyboardInfo {
                    visible: true,
                    height: 240.0,
                    x: 1.0,
                    y: 2.0,
                    width: 320.0,
                }
            }),
        };
    }

    fn setter_future(result: SoftKeyboardSetterResult) -> SoftKeyboardSetterFuture {
        return Box::pin(async move { Ok(result) });
    }

    fn visibility_capability() -> HostSoftKeyboardVisibilityCapability {
        return HostSoftKeyboardVisibilityCapability {
            hide: Arc::new(|| {
                Box::pin(async { Ok(SoftKeyboardVisibilityResult::OperationFailed) })
            }),
            show: Arc::new(|| Box::pin(async { Ok(SoftKeyboardVisibilityResult::Ok) })),
        };
    }

    #[test]
    fn host_soft_keyboard_accessory_bar_capability_set_visible_matches_free_function() {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let captured = seen.clone();
        let capability = HostSoftKeyboardAccessoryBarCapability {
            set_accessory_bar_visible: Arc::new(move |visible| {
                captured.lock().unwrap().push(visible);
                return setter_future(SoftKeyboardSetterResult::Ok);
            }),
        };
        let via_method = block_on(capability.set_visible(true));
        let via_free = block_on(set_soft_keyboard_accessory_bar_visible(&capability, false));
        assert_eq!(via_method, via_free);
        assert_eq!(*seen.lock().unwrap(), vec![true, false]);
    }

    #[test]
    fn host_soft_keyboard_change_capability_attach_matches_free_function() {
        let releases = Arc::new(Mutex::new(0));
        let change = change_capability(releases);
        let info = info_capability();
        let mut a = create_soft_keyboard();
        let mut b = create_soft_keyboard();
        let via_method = block_on(change.attach(&info, &mut a));
        let via_free = block_on(attach_soft_keyboard(&change, &info, &mut b));
        assert_eq!(via_method, via_free);
        assert_eq!(format!("{a:?}"), format!("{b:?}"));
    }

    #[test]
    fn host_soft_keyboard_info_capability_height_matches_free_function() {
        let capability = info_capability();
        assert_eq!(capability.height(), get_soft_keyboard_height(&capability));
        assert_eq!(capability.height(), 240.0);
    }

    #[test]
    fn host_soft_keyboard_info_capability_info_matches_free_function() {
        let capability = info_capability();
        let mut a = SoftKeyboardInfo::default();
        let mut b = SoftKeyboardInfo::default();
        capability.info(&mut a);
        get_soft_keyboard_info(&mut b, &capability);
        assert_eq!(a, b);
        assert_eq!(a.width, 320.0);
    }

    #[test]
    fn host_soft_keyboard_info_capability_is_visible_matches_free_function() {
        let capability = info_capability();
        assert_eq!(
            capability.is_visible(),
            is_soft_keyboard_visible(&capability)
        );
        assert!(capability.is_visible());
    }

    #[test]
    fn host_soft_keyboard_resize_mode_write_capability_set_mode_matches_free_function() {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let captured = seen.clone();
        let capability = HostSoftKeyboardResizeModeWriteCapability {
            set_resize_mode: Arc::new(move |mode| {
                captured.lock().unwrap().push(mode);
                return setter_future(SoftKeyboardSetterResult::Ok);
            }),
        };
        let via_method = block_on(capability.set_mode(SOFT_KEYBOARD_RESIZE_BODY_KIND.to_string()));
        let via_free = block_on(set_soft_keyboard_resize_mode(
            &capability,
            SOFT_KEYBOARD_RESIZE_NONE_KIND.to_string(),
        ));
        assert_eq!(via_method, via_free);
        assert_eq!(
            *seen.lock().unwrap(),
            vec![
                SOFT_KEYBOARD_RESIZE_BODY_KIND.to_string(),
                SOFT_KEYBOARD_RESIZE_NONE_KIND.to_string(),
            ]
        );
    }

    #[test]
    fn host_soft_keyboard_scroll_assist_capability_set_enabled_matches_free_function() {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let captured = seen.clone();
        let capability = HostSoftKeyboardScrollAssistCapability {
            set_scroll_assist_enabled: Arc::new(move |enabled| {
                captured.lock().unwrap().push(enabled);
                return setter_future(SoftKeyboardSetterResult::OperationUnavailable);
            }),
        };
        let via_method = block_on(capability.set_enabled(true));
        let via_free = block_on(set_soft_keyboard_scroll_assist_enabled(&capability, false));
        assert_eq!(via_method, via_free);
        assert_eq!(*seen.lock().unwrap(), vec![true, false]);
    }

    #[test]
    fn host_soft_keyboard_style_capability_set_style_matches_free_function() {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let captured = seen.clone();
        let capability = HostSoftKeyboardStyleCapability {
            set_style: Arc::new(move |style| {
                captured.lock().unwrap().push(style);
                return setter_future(SoftKeyboardSetterResult::Ok);
            }),
        };
        let via_method = block_on(capability.set_style(SOFT_KEYBOARD_STYLE_DARK_KIND.to_string()));
        let via_free = block_on(set_soft_keyboard_style(
            &capability,
            SOFT_KEYBOARD_STYLE_DEFAULT_KIND.to_string(),
        ));
        assert_eq!(via_method, via_free);
        assert_eq!(
            *seen.lock().unwrap(),
            vec![
                SOFT_KEYBOARD_STYLE_DARK_KIND.to_string(),
                SOFT_KEYBOARD_STYLE_DEFAULT_KIND.to_string(),
            ]
        );
    }

    #[test]
    fn host_soft_keyboard_visibility_capability_hide_matches_free_function() {
        let capability = visibility_capability();
        assert_eq!(
            block_on(capability.hide()),
            block_on(hide_soft_keyboard(&capability))
        );
        assert_eq!(
            block_on(capability.hide()),
            Ok(SoftKeyboardVisibilityResult::OperationFailed)
        );
    }

    #[test]
    fn host_soft_keyboard_visibility_capability_show_matches_free_function() {
        let capability = visibility_capability();
        assert_eq!(
            block_on(capability.show()),
            block_on(show_soft_keyboard(&capability))
        );
        assert_eq!(
            block_on(capability.show()),
            Ok(SoftKeyboardVisibilityResult::Ok)
        );
    }

    #[test]
    fn soft_keyboard_detach_matches_free_function() {
        let (ca, cb) = (Arc::new(Mutex::new(0)), Arc::new(Mutex::new(0)));
        let mut a = create_soft_keyboard();
        let mut b = create_soft_keyboard();
        block_on(attach_soft_keyboard(
            &change_capability(ca.clone()),
            &info_capability(),
            &mut a,
        ))
        .unwrap();
        block_on(attach_soft_keyboard(
            &change_capability(cb.clone()),
            &info_capability(),
            &mut b,
        ))
        .unwrap();
        a.detach();
        detach_soft_keyboard(&mut b);
        assert_eq!(*ca.lock().unwrap(), *cb.lock().unwrap());
        assert_eq!(*ca.lock().unwrap(), 1);
    }

    #[test]
    fn soft_keyboard_dispose_matches_free_function() {
        let (ca, cb) = (Arc::new(Mutex::new(0)), Arc::new(Mutex::new(0)));
        let mut a = create_soft_keyboard();
        let mut b = create_soft_keyboard();
        block_on(attach_soft_keyboard(
            &change_capability(ca.clone()),
            &info_capability(),
            &mut a,
        ))
        .unwrap();
        block_on(attach_soft_keyboard(
            &change_capability(cb.clone()),
            &info_capability(),
            &mut b,
        ))
        .unwrap();
        a.dispose();
        dispose_soft_keyboard(&mut b);
        assert_eq!(*ca.lock().unwrap(), *cb.lock().unwrap());
        assert_eq!(*ca.lock().unwrap(), 1);
    }

    #[test]
    fn soft_keyboard_new_matches_create_soft_keyboard() {
        let a = SoftKeyboard::new();
        let b = create_soft_keyboard();
        assert_eq!(format!("{a:?}"), format!("{b:?}"));
        assert!(!has_signal_slots(&a.on_show));
    }
}

enum SoftKeyboardTransition {
    Hide,
    Resize(f32),
    Show(f32),
}

pub fn create_soft_keyboard() -> SoftKeyboard {
    let mut out: SoftKeyboard = allocate_entity();
    initialize_soft_keyboard(&mut out);
    return out;
}

/// The construction initializer of `create_soft_keyboard`: three fresh signal identities. Like the
/// source initializer, it does not mutate a pre-existing subscription entry.
pub fn initialize_soft_keyboard(out: &mut SoftKeyboard) {
    out.on_hide = create_signal();
    out.on_resize = create_signal();
    out.on_show = create_signal();
}

/// Acquires raw changes after releasing any prior subscription. A rejected provider Promise is
/// passed through as `Err`; `AcquisitionFailed` is the provider's resolved result. The current
/// height is sampled before subscribe, exactly as the source does. A listener may therefore fire
/// during acquisition. The mutable keyboard borrow intentionally lasts across await; unlike JS,
/// safe Rust cannot concurrently attach or detach that same value while acquisition is pending.
pub async fn attach_soft_keyboard(
    host_soft_keyboard_change: &HostSoftKeyboardChangeCapability,
    host_soft_keyboard_info: &HostSoftKeyboardInfoCapability,
    keyboard: &mut SoftKeyboard,
) -> SoftKeyboardAttachOperationResult {
    detach_soft_keyboard(keyboard);
    let change = host_soft_keyboard_change;
    let info = host_soft_keyboard_info.clone();
    let mut initial = soft_keyboard_info_out();
    (info.get_info)(&mut initial);
    let previous_height = Arc::new(Mutex::new(initial.height));
    let listener_previous_height = previous_height.clone();
    let on_hide = keyboard.on_hide.clone();
    let on_resize = keyboard.on_resize.clone();
    let on_show = keyboard.on_show.clone();
    let listener: SoftKeyboardChangeListener = Arc::new(move || {
        let mut now_info = soft_keyboard_info_out();
        (info.get_info)(&mut now_info);
        let now_height = now_info.height;
        let transition = {
            let mut previous_height = listener_previous_height.lock().unwrap();
            let was_visible = *previous_height > 0.0;
            let now_visible = now_height > 0.0;
            if now_visible && !was_visible {
                *previous_height = now_height;
                Some(SoftKeyboardTransition::Show(now_height))
            } else if !now_visible && was_visible {
                *previous_height = 0.0;
                Some(SoftKeyboardTransition::Hide)
            } else if now_visible && now_height != *previous_height {
                *previous_height = now_height;
                Some(SoftKeyboardTransition::Resize(now_height))
            } else {
                None
            }
        };
        match transition {
            Some(SoftKeyboardTransition::Hide) => emit_signal(&on_hide, &()),
            Some(SoftKeyboardTransition::Resize(height)) => emit_signal(&on_resize, &height),
            Some(SoftKeyboardTransition::Show(height)) => emit_signal(&on_show, &height),
            None => {}
        }
    });
    let subscription = (change.subscribe)(listener).await?;
    if subscription.result != SoftKeyboardAttachResult::Ok {
        return Ok(subscription.result);
    }
    keyboard.subscription = Some(subscription.unsubscribe);
    return Ok(SoftKeyboardAttachResult::Ok);
}

/// Invokes the exact retained release and deletes the entry only after that callback returns. A
/// malformed successful provider that supplied null reaches the same deferred failure point as the
/// source non-null assertion: detach panics and retains the entry.
pub fn detach_soft_keyboard(keyboard: &mut SoftKeyboard) {
    let Some(subscription) = keyboard.subscription.as_ref() else {
        return;
    };
    let unsubscribe = subscription
        .as_ref()
        .expect("successful soft-keyboard subscription must provide unsubscribe");
    unsubscribe();
    keyboard.subscription = None;
}

pub fn dispose_soft_keyboard(keyboard: &mut SoftKeyboard) {
    detach_soft_keyboard(keyboard);
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS SoftKeyboardAttachResult string union; the TS package exports constants instead of conversion functions
pub fn get_soft_keyboard_attach_result_string(value: SoftKeyboardAttachResult) -> &'static str {
    return match value {
        SoftKeyboardAttachResult::Ok => "ok",
        SoftKeyboardAttachResult::AcquisitionFailed => "acquisition-failed",
    };
}

pub fn get_soft_keyboard_height(host_soft_keyboard_info: &HostSoftKeyboardInfoCapability) -> f32 {
    let mut out = soft_keyboard_info_out();
    (host_soft_keyboard_info.get_info)(&mut out);
    return out.height;
}

/// Writes the current keyboard snapshot into the caller-owned output.
// flight-lint: allow(conform-params) D9b: TS takes `out` last and returns it; Rust takes `out` first and returns nothing
pub fn get_soft_keyboard_info(
    out: &mut SoftKeyboardInfo,
    host_soft_keyboard_info: &HostSoftKeyboardInfoCapability,
) {
    (host_soft_keyboard_info.get_info)(out);
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS SoftKeyboardSetterResult string union; the TS package exports constants instead of conversion functions
pub fn get_soft_keyboard_setter_result_string(value: SoftKeyboardSetterResult) -> &'static str {
    return match value {
        SoftKeyboardSetterResult::Ok => "ok",
        SoftKeyboardSetterResult::OperationUnavailable => "operation-unavailable",
        SoftKeyboardSetterResult::OperationFailed => "operation-failed",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS SoftKeyboardVisibilityResult string union; the TS package exports constants instead of conversion functions
pub fn get_soft_keyboard_visibility_result_string(
    value: SoftKeyboardVisibilityResult,
) -> &'static str {
    return match value {
        SoftKeyboardVisibilityResult::Ok => "ok",
        SoftKeyboardVisibilityResult::OperationFailed => "operation-failed",
    };
}

pub async fn hide_soft_keyboard(
    host_soft_keyboard_visibility: &HostSoftKeyboardVisibilityCapability,
) -> SoftKeyboardVisibilityOperationResult {
    return (host_soft_keyboard_visibility.hide)().await;
}

pub fn is_soft_keyboard_visible(host_soft_keyboard_info: &HostSoftKeyboardInfoCapability) -> bool {
    let mut out = soft_keyboard_info_out();
    (host_soft_keyboard_info.get_info)(&mut out);
    return out.visible;
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS SoftKeyboardAttachResult string union; the TS package exports constants instead of conversion functions
pub fn parse_soft_keyboard_attach_result(value: &str) -> Option<SoftKeyboardAttachResult> {
    return match value {
        "ok" => Some(SoftKeyboardAttachResult::Ok),
        "acquisition-failed" => Some(SoftKeyboardAttachResult::AcquisitionFailed),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS SoftKeyboardSetterResult string union; the TS package exports constants instead of conversion functions
pub fn parse_soft_keyboard_setter_result(value: &str) -> Option<SoftKeyboardSetterResult> {
    return match value {
        "ok" => Some(SoftKeyboardSetterResult::Ok),
        "operation-unavailable" => Some(SoftKeyboardSetterResult::OperationUnavailable),
        "operation-failed" => Some(SoftKeyboardSetterResult::OperationFailed),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS SoftKeyboardVisibilityResult string union; the TS package exports constants instead of conversion functions
pub fn parse_soft_keyboard_visibility_result(value: &str) -> Option<SoftKeyboardVisibilityResult> {
    return match value {
        "ok" => Some(SoftKeyboardVisibilityResult::Ok),
        "operation-failed" => Some(SoftKeyboardVisibilityResult::OperationFailed),
        _ => None,
    };
}

pub async fn set_soft_keyboard_accessory_bar_visible(
    host_soft_keyboard_accessory_bar: &HostSoftKeyboardAccessoryBarCapability,
    visible: bool,
) -> SoftKeyboardSetterOperationResult {
    return (host_soft_keyboard_accessory_bar.set_accessory_bar_visible)(visible).await;
}

pub async fn set_soft_keyboard_resize_mode(
    host_soft_keyboard_resize_mode_write: &HostSoftKeyboardResizeModeWriteCapability,
    mode: SoftKeyboardResizeMode,
) -> SoftKeyboardSetterOperationResult {
    return (host_soft_keyboard_resize_mode_write.set_resize_mode)(mode).await;
}

pub async fn set_soft_keyboard_scroll_assist_enabled(
    host_soft_keyboard_scroll_assist: &HostSoftKeyboardScrollAssistCapability,
    enabled: bool,
) -> SoftKeyboardSetterOperationResult {
    return (host_soft_keyboard_scroll_assist.set_scroll_assist_enabled)(enabled).await;
}

pub async fn set_soft_keyboard_style(
    host_soft_keyboard_style: &HostSoftKeyboardStyleCapability,
    style: SoftKeyboardStyleKind,
) -> SoftKeyboardSetterOperationResult {
    return (host_soft_keyboard_style.set_style)(style).await;
}

pub async fn show_soft_keyboard(
    host_soft_keyboard_visibility: &HostSoftKeyboardVisibilityCapability,
) -> SoftKeyboardVisibilityOperationResult {
    return (host_soft_keyboard_visibility.show)().await;
}

fn soft_keyboard_info_out() -> SoftKeyboardInfo {
    return SoftKeyboardInfo {
        visible: false,
        height: 0.0,
        x: 0.0,
        y: 0.0,
        width: 0.0,
    };
}

impl SoftKeyboard {
    pub fn new() -> Self {
        return create_soft_keyboard();
    }

    pub fn detach(&mut self) {
        detach_soft_keyboard(self);
    }

    pub fn dispose(&mut self) {
        dispose_soft_keyboard(self);
    }
}

impl HostSoftKeyboardAccessoryBarCapability {
    pub async fn set_visible(&self, visible: bool) -> SoftKeyboardSetterOperationResult {
        return set_soft_keyboard_accessory_bar_visible(self, visible).await;
    }
}

impl HostSoftKeyboardChangeCapability {
    pub async fn attach(
        &self,
        host_soft_keyboard_info: &HostSoftKeyboardInfoCapability,
        keyboard: &mut SoftKeyboard,
    ) -> SoftKeyboardAttachOperationResult {
        return attach_soft_keyboard(self, host_soft_keyboard_info, keyboard).await;
    }
}

impl HostSoftKeyboardInfoCapability {
    pub fn height(&self) -> f32 {
        return get_soft_keyboard_height(self);
    }

    pub fn info(&self, out: &mut SoftKeyboardInfo) {
        get_soft_keyboard_info(out, self);
    }

    pub fn is_visible(&self) -> bool {
        return is_soft_keyboard_visible(self);
    }
}

impl HostSoftKeyboardResizeModeWriteCapability {
    pub async fn set_mode(
        &self,
        mode: SoftKeyboardResizeMode,
    ) -> SoftKeyboardSetterOperationResult {
        return set_soft_keyboard_resize_mode(self, mode).await;
    }
}

impl HostSoftKeyboardScrollAssistCapability {
    pub async fn set_enabled(&self, enabled: bool) -> SoftKeyboardSetterOperationResult {
        return set_soft_keyboard_scroll_assist_enabled(self, enabled).await;
    }
}

impl HostSoftKeyboardStyleCapability {
    pub async fn set_style(
        &self,
        style: SoftKeyboardStyleKind,
    ) -> SoftKeyboardSetterOperationResult {
        return set_soft_keyboard_style(self, style).await;
    }
}

impl HostSoftKeyboardVisibilityCapability {
    pub async fn hide(&self) -> SoftKeyboardVisibilityOperationResult {
        return hide_soft_keyboard(self).await;
    }

    pub async fn show(&self) -> SoftKeyboardVisibilityOperationResult {
        return show_soft_keyboard(self).await;
    }
}
