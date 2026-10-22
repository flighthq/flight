use std::sync::{Arc, Mutex, RwLock};

use flight_entity::{Record, allocate_entity};
use flight_host::{BackendOperationExplanation, BackendOperationExplanationLayer};
use flight_signals::{create_signal, emit_signal};

use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use flight_signals::{cancel_signal, connect_signal, has_signal_slots};

    use super::*;

    /// A provider in `state` whose subscribe and memory-warning releases bump `releases`.
    fn capability(
        state: AppLifecycleState,
        releases: Arc<Mutex<usize>>,
    ) -> HostLifecycleCapability {
        let on_memory_release = releases.clone();
        return HostLifecycleCapability {
            get_state: Arc::new(move || state),
            subscribe: Arc::new(move |_listener: LifecycleListener| {
                let releases = releases.clone();
                let release: LifecycleUnsubscribe =
                    Arc::new(move || *releases.lock().unwrap() += 1);
                return release;
            }),
            get_launch_kind: Some(Arc::new(|| AppLaunchKind::Cold)),
            subscribe_memory_warning: Some(Arc::new(
                move |_listener: LifecycleMemoryWarningListener| {
                    let releases = on_memory_release.clone();
                    let release: LifecycleUnsubscribe =
                        Arc::new(move || *releases.lock().unwrap() += 1);
                    return release;
                },
            )),
        };
    }

    fn quiet(state: AppLifecycleState) -> HostLifecycleCapability {
        return capability(state, Arc::new(Mutex::new(0)));
    }

    #[test]
    fn app_lifecycle_new_matches_create_app_lifecycle() {
        assert_eq!(
            format!("{:?}", AppLifecycle::new()),
            format!("{:?}", create_app_lifecycle())
        );
    }

    #[test]
    fn app_lifecycle_detach_matches_detach_app_lifecycle() {
        let (ra, rb) = (Arc::new(Mutex::new(0)), Arc::new(Mutex::new(0)));
        let mut a = create_app_lifecycle();
        let mut b = create_app_lifecycle();
        attach_app_lifecycle(&capability(AppLifecycleState::Active, ra.clone()), &mut a);
        attach_app_lifecycle(&capability(AppLifecycleState::Active, rb.clone()), &mut b);
        a.detach();
        detach_app_lifecycle(&mut b);
        assert_eq!(*ra.lock().unwrap(), *rb.lock().unwrap());
        assert_eq!(*ra.lock().unwrap(), 2);
        assert_eq!(format!("{:?}", a), format!("{:?}", b));
    }

    #[test]
    fn app_lifecycle_dispose_matches_dispose_app_lifecycle() {
        let (ra, rb) = (Arc::new(Mutex::new(0)), Arc::new(Mutex::new(0)));
        let mut a = create_app_lifecycle();
        let mut b = create_app_lifecycle();
        attach_app_lifecycle(&capability(AppLifecycleState::Active, ra.clone()), &mut a);
        attach_app_lifecycle(&capability(AppLifecycleState::Active, rb.clone()), &mut b);
        a.dispose();
        dispose_app_lifecycle(&mut b);
        assert_eq!(*ra.lock().unwrap(), *rb.lock().unwrap());
        assert_eq!(format!("{:?}", a), format!("{:?}", b));
    }

    #[test]
    fn app_lifecycle_request_back_matches_request_app_back() {
        let a = create_app_lifecycle();
        let b = create_app_lifecycle();
        let (sa, sb) = (a.on_back_button.clone(), b.on_back_button.clone());
        connect_signal(
            &a.on_back_button,
            Arc::new(move |_: &()| cancel_signal(&sa)),
            None,
        );
        connect_signal(
            &b.on_back_button,
            Arc::new(move |_: &()| cancel_signal(&sb)),
            None,
        );
        assert_eq!(a.request_back(), request_app_back(&b));
        assert!(!a.request_back());
    }

    #[test]
    fn host_lifecycle_capability_app_launch_kind_matches_get_app_launch_kind() {
        let c = quiet(AppLifecycleState::Active);
        assert_eq!(c.app_launch_kind(), get_app_launch_kind(&c));
        assert_eq!(c.app_launch_kind(), AppLaunchKind::Cold);
    }

    #[test]
    fn host_lifecycle_capability_app_state_matches_get_app_lifecycle_state() {
        let c = quiet(AppLifecycleState::Background);
        assert_eq!(c.app_state(), get_app_lifecycle_state(&c));
        assert_eq!(c.app_state(), AppLifecycleState::Background);
    }

    #[test]
    fn host_lifecycle_capability_attach_app_matches_attach_app_lifecycle() {
        let c = quiet(AppLifecycleState::Active);
        let mut a = create_app_lifecycle();
        let mut b = create_app_lifecycle();
        c.attach_app(&mut a);
        attach_app_lifecycle(&c, &mut b);
        assert_eq!(format!("{:?}", a), format!("{:?}", b));
        assert!(a.subscription.is_some());
        assert!(!has_signal_slots(&a.on_state_change));
    }

    #[test]
    fn host_lifecycle_capability_explain_operation_matches_explain_lifecycle_operation() {
        let c = quiet(AppLifecycleState::Active);
        assert_eq!(
            c.explain_operation(LifecycleOperation::GetLaunchKind),
            explain_lifecycle_operation(&c, LifecycleOperation::GetLaunchKind)
        );
        assert!(
            c.explain_operation(LifecycleOperation::GetLaunchKind)
                .implemented
        );
    }

    #[test]
    fn host_lifecycle_capability_has_operation_matches_has_lifecycle_operation() {
        let c = quiet(AppLifecycleState::Active);
        assert_eq!(
            c.has_operation(LifecycleOperation::SubscribeMemoryWarning),
            has_lifecycle_operation(&c, LifecycleOperation::SubscribeMemoryWarning)
        );
        assert!(c.has_operation(LifecycleOperation::SubscribeMemoryWarning));
    }

    #[test]
    fn host_lifecycle_capability_is_app_active_matches_is_app_active() {
        let c = quiet(AppLifecycleState::Active);
        assert_eq!(c.is_app_active(), is_app_active(&c));
        assert!(c.is_app_active());
    }

    #[test]
    fn host_lifecycle_capability_is_app_background_matches_is_app_background() {
        let c = quiet(AppLifecycleState::Background);
        assert_eq!(c.is_app_background(), is_app_background(&c));
        assert!(c.is_app_background());
    }

    #[test]
    fn host_lifecycle_capability_is_app_inactive_matches_is_app_inactive() {
        let c = quiet(AppLifecycleState::Inactive);
        assert_eq!(c.is_app_inactive(), is_app_inactive(&c));
        assert!(c.is_app_inactive());
    }
}

pub fn create_app_lifecycle() -> AppLifecycle {
    let mut out: AppLifecycle = allocate_entity();
    initialize_app_lifecycle(&mut out);
    return out;
}

/// The construction initializer of `create_app_lifecycle`: seven inert signals, no subscription, no
/// saved bag.
pub fn initialize_app_lifecycle(out: &mut AppLifecycle) {
    out.on_state_change = create_signal();
    out.on_resume = create_signal();
    out.on_pause = create_signal();
    out.on_back_button = create_signal();
    out.on_memory_warning = create_signal();
    out.on_save_state = create_signal();
    out.on_restore_state = create_signal();
    out.subscription = None;
    out.saved_state = Arc::new(Mutex::new(None));
}

/// Begins delivering lifecycle changes to `app`'s signals by subscribing to the supplied provider. On
/// each change it reads the current state and emits `on_state_change` (raw, not deduped: one emit per
/// provider notification), then the deduped edges: `on_resume` (plus `on_restore_state` with the bag
/// saved on the last pause, if any) when entering `Active`, and `on_pause` (plus `on_save_state` with
/// a fresh bag, then kept for restore) when leaving `Active`. `Inactive` <-> `Background` fires
/// neither. A prior subscription is torn down first. No lock is held while any signal emits.
pub fn attach_app_lifecycle(host_lifecycle: &HostLifecycleCapability, app: &mut AppLifecycle) {
    detach_app_lifecycle(app);
    let backend = host_lifecycle.clone();
    let previous = Arc::new(Mutex::new((backend.get_state)()));
    let on_state_change = app.on_state_change.clone();
    let on_resume = app.on_resume.clone();
    let on_pause = app.on_pause.clone();
    let on_save_state = app.on_save_state.clone();
    let on_restore_state = app.on_restore_state.clone();
    let saved_state = app.saved_state.clone();
    let state_backend = backend.clone();
    let listener: LifecycleListener = Arc::new(move || {
        let state = (state_backend.get_state)();
        let was = *previous.lock().unwrap();
        emit_signal(&on_state_change, &state);
        if state == AppLifecycleState::Active && was != AppLifecycleState::Active {
            emit_signal(&on_resume, &());
            let saved = saved_state.lock().unwrap().clone();
            if let Some(saved) = saved {
                emit_signal(&on_restore_state, &saved);
            }
        } else if state != AppLifecycleState::Active && was == AppLifecycleState::Active {
            emit_signal(&on_pause, &());
            let bag: AppLifecycleStateBag = Arc::new(RwLock::new(Record::default()));
            emit_signal(&on_save_state, &bag);
            *saved_state.lock().unwrap() = Some(bag);
        }
        *previous.lock().unwrap() = state;
    });
    let unsubscribe_state = (backend.subscribe)(listener);

    let unsubscribe_memory =
        backend
            .subscribe_memory_warning
            .as_ref()
            .map(|subscribe_memory_warning| {
                let on_memory_warning = app.on_memory_warning.clone();
                let memory_listener: LifecycleMemoryWarningListener =
                    Arc::new(move |level: AppMemoryPressure| {
                        emit_signal(&on_memory_warning, &level)
                    });
                return subscribe_memory_warning(memory_listener);
            });

    app.subscription = Some(Arc::new(move || {
        unsubscribe_state();
        if let Some(unsubscribe_memory) = &unsubscribe_memory {
            unsubscribe_memory();
        }
    }));
}

/// Stops delivery to `app` and forgets its subscription. Safe to call when not attached. The release
/// is taken out of the entity before it runs, so a re-entrant detach is a no-op.
pub fn detach_app_lifecycle(app: &mut AppLifecycle) {
    let Some(unsubscribe) = app.subscription.take() else {
        return;
    };
    unsubscribe();
}

/// Detaches `app` from its provider and forgets its saved state bag.
pub fn dispose_app_lifecycle(app: &mut AppLifecycle) {
    detach_app_lifecycle(app);
    *app.saved_state.lock().unwrap() = None;
}

/// Reports whether the supplied provider implements `operation`. An optional member the provider
/// omits is reported as the sentinel layer, so callers can distinguish absence from a real
/// operation; required members are always implemented.
pub fn explain_lifecycle_operation(
    host_lifecycle: &HostLifecycleCapability,
    operation: LifecycleOperation,
) -> BackendOperationExplanation {
    let implemented = match operation {
        LifecycleOperation::GetState | LifecycleOperation::Subscribe => true,
        LifecycleOperation::GetLaunchKind => host_lifecycle.get_launch_kind.is_some(),
        LifecycleOperation::SubscribeMemoryWarning => {
            host_lifecycle.subscribe_memory_warning.is_some()
        }
    };
    return BackendOperationExplanation {
        implemented,
        layer: if implemented {
            BackendOperationExplanationLayer::Host
        } else {
            BackendOperationExplanationLayer::Sentinel
        },
        operation: get_lifecycle_operation_string(operation).to_string(),
    };
}

/// The launch kind from the provider, or `Warm` as the safe fallback when it omits
/// `get_launch_kind`.
pub fn get_app_launch_kind(host_lifecycle: &HostLifecycleCapability) -> AppLaunchKind {
    return match &host_lifecycle.get_launch_kind {
        Some(get_launch_kind) => get_launch_kind(),
        None => AppLaunchKind::Warm,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS AppLaunchKind string union; the TS package exports no get_/parse_ free functions
pub fn get_app_launch_kind_string(value: AppLaunchKind) -> &'static str {
    return match value {
        AppLaunchKind::Cold => "cold",
        AppLaunchKind::Warm => "warm",
    };
}

pub fn get_app_lifecycle_state(host_lifecycle: &HostLifecycleCapability) -> AppLifecycleState {
    return (host_lifecycle.get_state)();
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS AppLifecycleState string union; the TS package exports no get_/parse_ free functions
pub fn get_app_lifecycle_state_string(value: AppLifecycleState) -> &'static str {
    return match value {
        AppLifecycleState::Active => "active",
        AppLifecycleState::Inactive => "inactive",
        AppLifecycleState::Background => "background",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS AppMemoryPressure string union; the TS package exports no get_/parse_ free functions
pub fn get_app_memory_pressure_string(value: AppMemoryPressure) -> &'static str {
    return match value {
        AppMemoryPressure::Normal => "normal",
        AppMemoryPressure::Moderate => "moderate",
        AppMemoryPressure::Critical => "critical",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS LifecycleOperation string union; the TS package exports no get_/parse_ free functions
pub fn get_lifecycle_operation_string(value: LifecycleOperation) -> &'static str {
    return match value {
        LifecycleOperation::GetState => "getState",
        LifecycleOperation::Subscribe => "subscribe",
        LifecycleOperation::GetLaunchKind => "getLaunchKind",
        LifecycleOperation::SubscribeMemoryWarning => "subscribeMemoryWarning",
    };
}

/// Whether the supplied provider implements `operation`.
pub fn has_lifecycle_operation(
    host_lifecycle: &HostLifecycleCapability,
    operation: LifecycleOperation,
) -> bool {
    return explain_lifecycle_operation(host_lifecycle, operation).implemented;
}

pub fn is_app_active(host_lifecycle: &HostLifecycleCapability) -> bool {
    return (host_lifecycle.get_state)() == AppLifecycleState::Active;
}

pub fn is_app_background(host_lifecycle: &HostLifecycleCapability) -> bool {
    return (host_lifecycle.get_state)() == AppLifecycleState::Background;
}

pub fn is_app_inactive(host_lifecycle: &HostLifecycleCapability) -> bool {
    return (host_lifecycle.get_state)() == AppLifecycleState::Inactive;
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS AppLaunchKind string union; the TS package exports no get_/parse_ free functions
pub fn parse_app_launch_kind(value: &str) -> Option<AppLaunchKind> {
    return match value {
        "cold" => Some(AppLaunchKind::Cold),
        "warm" => Some(AppLaunchKind::Warm),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS AppLifecycleState string union; the TS package exports no get_/parse_ free functions
pub fn parse_app_lifecycle_state(value: &str) -> Option<AppLifecycleState> {
    return match value {
        "active" => Some(AppLifecycleState::Active),
        "inactive" => Some(AppLifecycleState::Inactive),
        "background" => Some(AppLifecycleState::Background),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS AppMemoryPressure string union; the TS package exports no get_/parse_ free functions
pub fn parse_app_memory_pressure(value: &str) -> Option<AppMemoryPressure> {
    return match value {
        "normal" => Some(AppMemoryPressure::Normal),
        "moderate" => Some(AppMemoryPressure::Moderate),
        "critical" => Some(AppMemoryPressure::Critical),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS LifecycleOperation string union; the TS package exports no get_/parse_ free functions
pub fn parse_lifecycle_operation(value: &str) -> Option<LifecycleOperation> {
    return match value {
        "getState" => Some(LifecycleOperation::GetState),
        "subscribe" => Some(LifecycleOperation::Subscribe),
        "getLaunchKind" => Some(LifecycleOperation::GetLaunchKind),
        "subscribeMemoryWarning" => Some(LifecycleOperation::SubscribeMemoryWarning),
        _ => None,
    };
}

/// Emits `on_back_button` and returns whether the back action may proceed: false when a listener
/// vetoed by calling `cancel_signal(&app.on_back_button)`, true otherwise.
pub fn request_app_back(app: &AppLifecycle) -> bool {
    emit_signal(&app.on_back_button, &());
    let cancelled = app
        .on_back_button
        .data
        .read()
        .unwrap()
        .as_ref()
        .map(|data| data.cancelled);
    return cancelled != Some(true);
}

impl AppLifecycle {
    pub fn new() -> Self {
        return create_app_lifecycle();
    }

    pub fn detach(&mut self) {
        detach_app_lifecycle(self);
    }

    pub fn dispose(&mut self) {
        dispose_app_lifecycle(self);
    }

    pub fn request_back(&self) -> bool {
        return request_app_back(self);
    }
}

impl HostLifecycleCapability {
    pub fn app_launch_kind(&self) -> AppLaunchKind {
        return get_app_launch_kind(self);
    }

    pub fn app_state(&self) -> AppLifecycleState {
        return get_app_lifecycle_state(self);
    }

    pub fn attach_app(&self, app: &mut AppLifecycle) {
        attach_app_lifecycle(self, app);
    }

    pub fn explain_operation(&self, operation: LifecycleOperation) -> BackendOperationExplanation {
        return explain_lifecycle_operation(self, operation);
    }

    pub fn has_operation(&self, operation: LifecycleOperation) -> bool {
        return has_lifecycle_operation(self, operation);
    }

    pub fn is_app_active(&self) -> bool {
        return is_app_active(self);
    }

    pub fn is_app_background(&self) -> bool {
        return is_app_background(self);
    }

    pub fn is_app_inactive(&self) -> bool {
        return is_app_inactive(self);
    }
}
