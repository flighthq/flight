use std::any::Any;
use std::future::ready;
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, RwLock, Weak};

use flight_entity::{NonEntityCreateResult, Ref, Unknown, allocate_entity, unknown_from_panic};
use flight_geometry::Vector2;
use flight_host::HostSpawnCapability;
use flight_menu::MenuItemTemplate;
use flight_signals::{
    Signal, SignalSlot, SignalTimerState, clear_signal_timeout, connect_signal, disconnect_signal,
    set_signal_timeout,
};
use flight_stream::{SharedFuture, create_shared_future};

use crate::results::*;
use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use std::future::Future;
    use std::task::{Context, Poll, Waker};

    use flight_geometry::create_vector2;
    use flight_host::ProviderRef;
    use flight_signals::create_signal;

    use super::*;

    fn block_on<F: Future>(future: F) -> F::Output {
        let mut future = Box::pin(future);
        let mut context = Context::from_waker(Waker::noop());
        loop {
            if let Poll::Ready(value) = future.as_mut().poll(&mut context) {
                return value;
            }
        }
    }

    fn ok<T: Send + 'static>(value: T) -> TrayProviderFuture<T> {
        return Box::pin(ready(Ok(value)));
    }

    fn provider() -> ProviderRef {
        return Arc::new(());
    }

    fn lifecycle(live: Arc<Mutex<Vec<Ref<TrayIcon>>>>) -> HostTrayLifecycleCapability {
        let (create, list) = (live.clone(), live);
        return HostTrayLifecycleCapability {
            provider: provider(),
            create: Arc::new(move |tray: &Ref<TrayIcon>, _options: &TrayIconOptions| {
                create.lock().unwrap().push(tray.clone());
                return ok(TrayCreateCapabilityResult::Created);
            }),
            destroy: Arc::new(|_tray: &Ref<TrayIcon>| ok(TrayDestroyCapabilityResult::Destroyed)),
            is_destroyed: Arc::new(|_tray: &Ref<TrayIcon>| false),
            list: Arc::new(move || list.lock().unwrap().clone()),
        };
    }

    fn options() -> TrayIconOptions {
        return TrayIconOptions {
            icon: None,
            icon_template: None,
            signal: None,
            title: None,
            tooltip: None,
        };
    }

    fn animation_state() -> TrayAnimationState {
        let spawn = HostSpawnCapability {
            provider: provider(),
            spawn: Arc::new(|_future: std::pin::Pin<Box<dyn Future<Output = ()> + Send>>| {}),
        };
        let timers = Arc::new(RwLock::new(flight_signals::create_signal_timer_state()));
        return create_tray_animation_state(spawn, timers);
    }

    fn tray() -> Ref<TrayIcon> {
        let host = lifecycle(Arc::new(Mutex::new(Vec::new())));
        let TrayCreateOutcome::Created(created) =
            block_on(create_tray_icon(&host, &options())).outcome
        else {
            panic!("not created");
        };
        return created.tray;
    }

    fn image() -> HostTrayImageCapability {
        return HostTrayImageCapability {
            provider: provider(),
            set: Arc::new(|_tray: &Ref<TrayIcon>, _icon: &str| ok(TrayImageUpdateResult::Updated)),
        };
    }

    fn balloon_options() -> TrayBalloonOptions {
        return TrayBalloonOptions {
            icon: None,
            icon_type: None,
            large_icon: None,
            no_sound: None,
            respect_quiet_time: None,
            text: "t".to_string(),
            title: "f".to_string(),
        };
    }

    fn balloon() -> HostTrayBalloonCapability {
        return HostTrayBalloonCapability {
            provider: provider(),
            display: Arc::new(|_tray: &Ref<TrayIcon>, _options: &TrayBalloonOptions| {
                return ok(TrayBalloonDisplayResult::Displayed);
            }),
            remove: Arc::new(|_tray: &Ref<TrayIcon>| ok(TrayBalloonRemoveResult::BalloonNotActive)),
        };
    }

    fn title() -> HostTrayTitleCapability {
        return HostTrayTitleCapability {
            provider: provider(),
            get: Arc::new(|_tray: &Ref<TrayIcon>| {
                return ok(TrayTitleReadResult::Available(TrayTitleReading {
                    title: "T".to_string(),
                }));
            }),
            set: Arc::new(|_tray: &Ref<TrayIcon>, _title: &str| ok(TrayTitleUpdateResult::Updated)),
        };
    }

    fn tooltip() -> HostTrayTooltipCapability {
        return HostTrayTooltipCapability {
            provider: provider(),
            get: Arc::new(|_tray: &Ref<TrayIcon>| {
                return ok(TrayTooltipReadResult::Available(TrayTooltipReading {
                    tooltip: "P".to_string(),
                }));
            }),
            set: Arc::new(|_tray: &Ref<TrayIcon>, _tooltip: &str| {
                ok(TrayTooltipUpdateResult::Updated)
            }),
        };
    }

    fn attached(result: TrayEventAttachResult) -> bool {
        return matches!(result, TrayEventAttachResult::Attached(_));
    }

    #[test]
    fn host_tray_balloon_capability_display_balloon_matches_display_tray_balloon() {
        let (c, t) = (balloon(), tray());
        let a = block_on(c.display_balloon(&t, &balloon_options()));
        let b = block_on(display_tray_balloon(&c, &t, &balloon_options()));
        assert!(matches!(
            (a, b),
            (
                TrayBalloonDisplayResult::Displayed,
                TrayBalloonDisplayResult::Displayed
            )
        ));
    }

    #[test]
    fn host_tray_balloon_capability_remove_balloon_matches_remove_tray_balloon() {
        let (c, t) = (balloon(), tray());
        let a = block_on(c.remove_balloon(&t));
        let b = block_on(remove_tray_balloon(&c, &t));
        assert!(matches!(
            (a, b),
            (
                TrayBalloonRemoveResult::BalloonNotActive,
                TrayBalloonRemoveResult::BalloonNotActive
            )
        ));
    }

    #[test]
    fn host_tray_balloon_events_capability_on_balloon_event_matches_on_tray_balloon_event() {
        let signal: Signal<TrayBalloonEvent> = create_signal();
        let c = HostTrayBalloonEventsCapability {
            provider: provider(),
            get_signal: Arc::new(move |_tray: &Ref<TrayIcon>| Some(signal.clone())),
        };
        let t = tray();
        let listener: SignalSlot<TrayBalloonEvent> = Arc::new(|_event: &TrayBalloonEvent| {});
        assert!(attached(c.on_balloon_event(&t, listener.clone())));
        assert!(attached(on_tray_balloon_event(&c, &t, listener)));
    }

    #[test]
    fn host_tray_bounds_capability_icon_bounds_matches_get_tray_icon_bounds() {
        let c = HostTrayBoundsCapability {
            provider: provider(),
            get: Arc::new(|_tray: &Ref<TrayIcon>| {
                return ok(TrayBoundsResult::Available(TrayBoundsReading {
                    bounds: flight_geometry::create_rectangle(1.0, 2.0, 3.0, 4.0),
                }));
            }),
        };
        let t = tray();
        let (TrayBoundsResult::Available(a), TrayBoundsResult::Available(b)) = (
            block_on(c.icon_bounds(&t)),
            block_on(get_tray_icon_bounds(&c, &t)),
        ) else {
            panic!("expected bounds");
        };
        assert_eq!(a.bounds, b.bounds);
    }

    #[test]
    fn host_tray_double_click_policy_capability_set_ignore_double_click_events_matches_set_tray_ignore_double_click_events()
     {
        let c = HostTrayDoubleClickPolicyCapability {
            provider: provider(),
            set_ignore: Arc::new(|_tray: &Ref<TrayIcon>, _ignore: bool| {
                return ok(TrayDoubleClickPolicyUpdateResult::Updated);
            }),
        };
        let t = tray();
        assert!(matches!(
            (
                block_on(c.set_ignore_double_click_events(&t, true)),
                block_on(set_tray_ignore_double_click_events(&c, &t, true))
            ),
            (
                TrayDoubleClickPolicyUpdateResult::Updated,
                TrayDoubleClickPolicyUpdateResult::Updated
            )
        ));
    }

    #[test]
    fn host_tray_drop_events_capability_on_drop_matches_on_tray_drop() {
        let signal: Signal<TrayDropEvent> = create_signal();
        let c = HostTrayDropEventsCapability {
            provider: provider(),
            get_signal: Arc::new(move |_tray: &Ref<TrayIcon>| Some(signal.clone())),
        };
        let t = tray();
        let listener: SignalSlot<TrayDropEvent> = Arc::new(|_event: &TrayDropEvent| {});
        assert!(attached(c.on_drop(&t, listener.clone())));
        assert!(attached(on_tray_drop(&c, &t, listener)));
    }

    #[test]
    fn host_tray_image_capability_set_icon_matches_set_tray_icon() {
        let (c, t) = (image(), tray());
        assert!(matches!(
            (
                block_on(c.set_icon(&t, "a")),
                block_on(set_tray_icon(&c, &t, "a"))
            ),
            (
                TrayImageUpdateResult::Updated,
                TrayImageUpdateResult::Updated
            )
        ));
    }

    #[test]
    fn host_tray_image_capability_start_icon_animation_matches_start_tray_icon_animation() {
        let (c, t, state) = (image(), tray(), animation_state());
        let frames = ["a".to_string()];
        let a = block_on(c.start_icon_animation(&state, &t, &frames, 10.0));
        let b = block_on(start_tray_icon_animation(&state, &c, &t, &frames, 10.0));
        assert!(matches!(
            (a, b),
            (
                TrayAnimationStartResult::Started(_),
                TrayAnimationStartResult::Started(_)
            )
        ));
    }

    #[test]
    fn host_tray_interaction_events_capability_on_interaction_matches_on_tray_interaction() {
        let signal: Signal<TrayInteractionEvent> = create_signal();
        let c = HostTrayInteractionEventsCapability {
            provider: provider(),
            get_signal: Arc::new(move |_tray: &Ref<TrayIcon>| Some(signal.clone())),
        };
        let t = tray();
        let listener: SignalSlot<TrayInteractionEvent> =
            Arc::new(|_event: &TrayInteractionEvent| {});
        assert!(attached(c.on_interaction(&t, listener.clone())));
        assert!(attached(on_tray_interaction(&c, &t, listener)));
    }

    #[test]
    fn host_tray_lifecycle_capability_create_icon_matches_create_tray_icon() {
        let live = Arc::new(Mutex::new(Vec::new()));
        let c = lifecycle(live.clone());
        let a = block_on(c.create_icon(&options()));
        let b = block_on(create_tray_icon(&c, &options()));
        assert!(matches!(
            (a.outcome, b.outcome),
            (TrayCreateOutcome::Created(_), TrayCreateOutcome::Created(_))
        ));
        assert_eq!(live.lock().unwrap().len(), 2);
    }

    #[test]
    fn host_tray_lifecycle_capability_icons_matches_get_tray_icons() {
        let c = lifecycle(Arc::new(Mutex::new(Vec::new())));
        block_on(c.create_icon(&options()));
        let (mut a, mut b) = (Vec::new(), Vec::new());
        c.icons(&mut a);
        get_tray_icons(&mut b, &c);
        assert_eq!(a.len(), 1);
        assert!(Arc::ptr_eq(&a[0], &b[0]));
    }

    #[test]
    fn host_tray_menu_capability_set_icon_context_menu_matches_set_tray_icon_context_menu() {
        let c = HostTrayMenuCapability {
            provider: provider(),
            set: Arc::new(|_tray: &Ref<TrayIcon>, _items: &[Ref<MenuItemTemplate>]| {
                return ok(TrayMenuUpdateResult::Updated);
            }),
        };
        let t = tray();
        assert!(matches!(
            (
                block_on(c.set_icon_context_menu(&t, &[])),
                block_on(set_tray_icon_context_menu(&c, &t, &[]))
            ),
            (TrayMenuUpdateResult::Updated, TrayMenuUpdateResult::Updated)
        ));
    }

    #[test]
    fn host_tray_menu_selection_events_capability_on_menu_selection_matches_on_tray_menu_selection()
    {
        let signal: Signal<TrayMenuSelectionEvent> = create_signal();
        let c = HostTrayMenuSelectionEventsCapability {
            provider: provider(),
            get_signal: Arc::new(move |_tray: &Ref<TrayIcon>| Some(signal.clone())),
        };
        let t = tray();
        let listener: SignalSlot<TrayMenuSelectionEvent> =
            Arc::new(|_event: &TrayMenuSelectionEvent| {});
        assert!(attached(c.on_menu_selection(&t, listener.clone())));
        assert!(attached(on_tray_menu_selection(&c, &t, listener)));
    }

    #[test]
    fn host_tray_popup_menu_capability_popup_context_menu_matches_popup_tray_context_menu() {
        let c = HostTrayPopupMenuCapability {
            provider: provider(),
            popup: Arc::new(|_tray: &Ref<TrayIcon>, position: Option<&Vector2>| {
                return ok(match position {
                    Some(_) => TrayPopupMenuResult::Shown,
                    None => TrayPopupMenuResult::MenuNotSet,
                });
            }),
        };
        let (t, at) = (tray(), create_vector2(1.0, 2.0));
        assert!(matches!(
            (
                block_on(c.popup_context_menu(&t, Some(&at))),
                block_on(popup_tray_context_menu(&c, &t, Some(&at)))
            ),
            (TrayPopupMenuResult::Shown, TrayPopupMenuResult::Shown)
        ));
    }

    #[test]
    fn host_tray_pressed_image_capability_set_pressed_icon_matches_set_tray_pressed_icon() {
        let c = HostTrayPressedImageCapability {
            provider: provider(),
            set: Arc::new(|_tray: &Ref<TrayIcon>, _icon: &str| {
                ok(TrayPressedImageUpdateResult::Updated)
            }),
        };
        let t = tray();
        assert!(matches!(
            (
                block_on(c.set_pressed_icon(&t, "p")),
                block_on(set_tray_pressed_icon(&c, &t, "p"))
            ),
            (
                TrayPressedImageUpdateResult::Updated,
                TrayPressedImageUpdateResult::Updated
            )
        ));
    }

    #[test]
    fn host_tray_template_image_capability_set_icon_template_matches_set_tray_icon_template() {
        let c = HostTrayTemplateImageCapability {
            provider: provider(),
            set: Arc::new(|_tray: &Ref<TrayIcon>, _is_template: bool| {
                return ok(TrayTemplateImageUpdateResult::Updated);
            }),
        };
        let t = tray();
        assert!(matches!(
            (
                block_on(c.set_icon_template(&t, true)),
                block_on(set_tray_icon_template(&c, &t, true))
            ),
            (
                TrayTemplateImageUpdateResult::Updated,
                TrayTemplateImageUpdateResult::Updated
            )
        ));
    }

    #[test]
    fn host_tray_title_capability_icon_title_matches_get_tray_icon_title() {
        let (c, t) = (title(), tray());
        let (TrayTitleReadResult::Available(a), TrayTitleReadResult::Available(b)) = (
            block_on(c.icon_title(&t)),
            block_on(get_tray_icon_title(&c, &t)),
        ) else {
            panic!("expected title");
        };
        assert_eq!(a.title, b.title);
    }

    #[test]
    fn host_tray_title_capability_set_icon_title_matches_set_tray_icon_title() {
        let (c, t) = (title(), tray());
        assert!(matches!(
            (
                block_on(c.set_icon_title(&t, "x")),
                block_on(set_tray_icon_title(&c, &t, "x"))
            ),
            (
                TrayTitleUpdateResult::Updated,
                TrayTitleUpdateResult::Updated
            )
        ));
    }

    #[test]
    fn host_tray_tooltip_capability_icon_tooltip_matches_get_tray_icon_tooltip() {
        let (c, t) = (tooltip(), tray());
        let (TrayTooltipReadResult::Available(a), TrayTooltipReadResult::Available(b)) = (
            block_on(c.icon_tooltip(&t)),
            block_on(get_tray_icon_tooltip(&c, &t)),
        ) else {
            panic!("expected tooltip");
        };
        assert_eq!(a.tooltip, b.tooltip);
    }

    #[test]
    fn host_tray_tooltip_capability_set_icon_tooltip_matches_set_tray_icon_tooltip() {
        let (c, t) = (tooltip(), tray());
        assert!(matches!(
            (
                block_on(c.set_icon_tooltip(&t, "x")),
                block_on(set_tray_icon_tooltip(&c, &t, "x"))
            ),
            (
                TrayTooltipUpdateResult::Updated,
                TrayTooltipUpdateResult::Updated
            )
        ));
    }

    #[test]
    fn tray_animation_state_new_matches_create_tray_animation_state() {
        let template = animation_state();
        let a = TrayAnimationState::new(template.spawn.clone(), template.timers.clone());
        let b = create_tray_animation_state(template.spawn.clone(), template.timers.clone());
        assert_eq!(a.guard.is_none(), b.guard.is_none());
        assert!(Arc::ptr_eq(&a.timers, &b.timers));
        assert!(Arc::ptr_eq(&a.spawn.provider, &b.spawn.provider));
    }

    #[test]
    fn tray_animation_state_set_animation_guard_matches_set_tray_animation_guard() {
        let guard: TrayAnimationGuard =
            Arc::new(|_tray: &Ref<TrayIcon>, _frames: i32, _interval_ms: f64| {});
        let (mut a, mut b) = (animation_state(), animation_state());
        a.set_animation_guard(Some(guard.clone()));
        set_tray_animation_guard(&mut b, Some(guard.clone()));
        assert!(Arc::ptr_eq(
            a.guard.as_ref().unwrap(),
            b.guard.as_ref().unwrap()
        ));
    }

    #[test]
    fn tray_icon_methods_destroy_matches_destroy_tray_icon() {
        let (a, b) = (tray(), tray());
        assert!(matches!(
            (block_on(a.destroy()), block_on(destroy_tray_icon(&b))),
            (TrayDestroyResult::Destroyed, TrayDestroyResult::Destroyed)
        ));
    }

    #[test]
    fn tray_icon_methods_is_animating_matches_is_tray_icon_animating() {
        let t = tray();
        assert_eq!(t.is_animating(), is_tray_icon_animating(&t));
        assert!(!t.is_animating());
    }

    #[test]
    fn tray_icon_methods_is_destroyed_matches_is_tray_destroyed() {
        let t = tray();
        block_on(destroy_tray_icon(&t));
        assert_eq!(t.is_destroyed(), is_tray_destroyed(&t));
        assert!(t.is_destroyed());
    }

    #[test]
    fn tray_icon_methods_stop_animation_matches_stop_tray_icon_animation() {
        let t = tray();
        assert!(matches!(
            (t.stop_animation(), stop_tray_icon_animation(&t)),
            (
                TrayAnimationStopResult::AlreadyStopped,
                TrayAnimationStopResult::AlreadyStopped
            )
        ));
    }
}

/// Method sugar on the shared `Ref<TrayIcon>` handle (D18; the FlowStackMethods precedent). Each
/// method delegates to the free function of the same operation.
pub trait TrayIconMethods {
    fn destroy(&self) -> TrayFuture<TrayDestroyResult>;
    fn is_animating(&self) -> bool;
    fn is_destroyed(&self) -> bool;
    fn stop_animation(&self) -> TrayAnimationStopResult;
}

/// One running animation's interval tick (the source's `setInterval` closure state).
// flight-lint: allow(f64) D1: the delay is a millisecond duration on the flight-signals timer clock
struct TrayAnimationTick {
    delay_ms: f64,
    frames: Vec<TrayIconSource>,
    generation: u64,
    host_tray_image: HostTrayImageCapability,
    index: Mutex<usize>,
    spawn: HostSpawnCapability,
    timers: Ref<SignalTimerState>,
    tray: Weak<RwLock<TrayIcon>>,
}

fn create_resolved_write_tail() -> SharedFuture<()> {
    return create_shared_future(Box::pin(async {}));
}

/// Caller-owned animation state with no guard installed (D5): the host's spawn capability drives
/// queued frame writes and `timers` schedules frame ticks (replacing the source's module slot and
/// host `setInterval`).
// flight-lint: allow(conform-extra) D5: caller-owned animation state replaces the TS module-level guard slot and host timer
pub fn create_tray_animation_state(
    spawn: HostSpawnCapability,
    timers: Ref<SignalTimerState>,
) -> NonEntityCreateResult<TrayAnimationState> {
    return TrayAnimationState {
        guard: None,
        spawn,
        timers,
    };
}

/// Creates a tray through the lifecycle provider. The provider is called before this returns, as the
/// source calls it before its first `await`; the tray is published (its runtime installed, pinned to
/// this origin lifecycle provider) only when the provider reports `Created`. A provider rejection
/// becomes `TrayCreateFailed` carrying the error.
pub fn create_tray_icon(
    host_tray_lifecycle: &HostTrayLifecycleCapability,
    options: &TrayIconOptions,
) -> TrayFuture<TrayCreateResult> {
    let tray: Ref<TrayIcon> = Arc::new(RwLock::new(allocate_entity()));
    let pending = match catch_unwind(AssertUnwindSafe(|| {
        (host_tray_lifecycle.create)(&tray, options)
    })) {
        Ok(pending) => pending,
        Err(payload) => {
            let error = unknown_from_panic(payload);
            return Box::pin(async move {
                let mut out: TrayCreateResult = allocate_entity();
                initialize_tray_create_failed_result(&mut out, Some(error));
                return out;
            });
        }
    };
    let lifecycle = host_tray_lifecycle.clone();
    return Box::pin(async move {
        let result = match pending.await {
            Ok(result) => result,
            Err(error) => {
                let mut out: TrayCreateResult = allocate_entity();
                initialize_tray_create_failed_result(&mut out, Some(Some(Arc::new(error))));
                return out;
            }
        };
        let (outcome, error) = match result {
            TrayCreateCapabilityResult::Created => {
                tray.write().unwrap().tray_runtime = Some(TrayRuntime {
                    animation_generation: 0,
                    animation_timer: None,
                    animation_write_tail: create_resolved_write_tail(),
                    destroy_future: None,
                    lifecycle,
                    next_release_id: 0,
                    releases: Vec::new(),
                    state: TrayState::Active,
                });
                let mut out: TrayCreateResult = allocate_entity();
                initialize_tray_create_success_result(&mut out, tray);
                return out;
            }
            TrayCreateCapabilityResult::Cancelled => (TrayCreateFailureOutcome::Cancelled, None),
            TrayCreateCapabilityResult::RuntimeApiUnavailable(TrayFailure { error }) => {
                (TrayCreateFailureOutcome::RuntimeApiUnavailable, error)
            }
            TrayCreateCapabilityResult::InvalidIcon(TrayFailure { error }) => {
                (TrayCreateFailureOutcome::InvalidIcon, error)
            }
            TrayCreateCapabilityResult::TrayCreateFailed(TrayFailure { error }) => {
                (TrayCreateFailureOutcome::TrayCreateFailed, error)
            }
        };
        let mut out: TrayCreateResult = allocate_entity();
        initialize_tray_create_provider_failure_result(&mut out, error, outcome);
        return out;
    });
}

/// Fills a create result with `TrayCreateFailed` (a thrown or rejected provider call).
// flight-lint: allow(conform-params) D9b: the TS `outcome` parameter admits only 'tray-create-failed', which the Rust arm encodes
pub fn initialize_tray_create_failed_result(out: &mut TrayCreateResult, error: Option<Unknown>) {
    out.outcome = TrayCreateOutcome::TrayCreateFailed(TrayFailure { error });
}

/// Fills a create result with the provider's non-created outcome. `Cancelled` carries no error in
/// the source union, so any `error` is not stored for it.
pub fn initialize_tray_create_provider_failure_result(
    out: &mut TrayCreateResult,
    error: Option<Unknown>,
    outcome: TrayCreateFailureOutcome,
) {
    out.outcome = match outcome {
        TrayCreateFailureOutcome::Cancelled => TrayCreateOutcome::Cancelled,
        TrayCreateFailureOutcome::RuntimeApiUnavailable => {
            TrayCreateOutcome::RuntimeApiUnavailable(TrayFailure { error })
        }
        TrayCreateFailureOutcome::InvalidIcon => {
            TrayCreateOutcome::InvalidIcon(TrayFailure { error })
        }
        TrayCreateFailureOutcome::TrayCreateFailed => {
            TrayCreateOutcome::TrayCreateFailed(TrayFailure { error })
        }
    };
}

/// Fills a create result with the published tray.
// flight-lint: allow(conform-params) D9b: the TS `outcome` parameter admits only 'created', which the Rust arm encodes
pub fn initialize_tray_create_success_result(out: &mut TrayCreateResult, tray: Ref<TrayIcon>) {
    out.outcome = TrayCreateOutcome::Created(TrayCreated { tray });
}

fn attach_tray_event<E: 'static>(
    get_signal: &(dyn Fn(&Ref<TrayIcon>) -> Option<Signal<E>> + Send + Sync),
    tray: &Ref<TrayIcon>,
    listener: SignalSlot<E>,
) -> TrayEventAttachResult {
    if !is_tray_active(tray) {
        return TrayEventAttachResult::TrayDestroyed;
    }
    let attached = catch_unwind(AssertUnwindSafe(|| {
        let signal = get_signal(tray)?;
        let slot = connect_signal(&signal, listener, None);
        return Some((signal, slot));
    }));
    let (signal, slot) = match attached {
        Ok(Some(attached)) => attached,
        Ok(None) => return TrayEventAttachResult::TrayDestroyed,
        Err(payload) => {
            return TrayEventAttachResult::SubscriptionFailed(TrayFailure {
                error: Some(unknown_from_panic(payload)),
            });
        }
    };
    let released = Arc::new(AtomicBool::new(false));
    let owner = Arc::downgrade(tray);
    let id = {
        let mut guard = tray.write().unwrap();
        let runtime = guard.tray_runtime.as_mut().unwrap();
        runtime.next_release_id += 1;
        runtime.next_release_id
    };
    let release = TrayEventRelease {
        release: Arc::new(move || {
            if released.load(Ordering::SeqCst) {
                return Box::pin(ready(TrayReleaseResult::AlreadyReleased));
            }
            if let Err(payload) =
                catch_unwind(AssertUnwindSafe(|| disconnect_signal(&signal, slot)))
            {
                return Box::pin(ready(TrayReleaseResult::ReleaseFailed(TrayFailure {
                    error: Some(unknown_from_panic(payload)),
                })));
            }
            released.store(true, Ordering::SeqCst);
            if let Some(tray) = owner.upgrade() {
                if let Some(runtime) = tray.write().unwrap().tray_runtime.as_mut() {
                    runtime.releases.retain(|(entry, _)| *entry != id);
                }
            }
            return Box::pin(ready(TrayReleaseResult::Released));
        }),
    };
    if let Some(runtime) = tray.write().unwrap().tray_runtime.as_mut() {
        runtime.releases.push((id, release.clone()));
    }
    return TrayEventAttachResult::Attached(release);
}

/// Destroys the tray. The first call marks it destroying, stops its animation and snapshots its
/// releases before returning; the returned future then awaits every release in order (attempting
/// all) and the origin lifecycle provider's destroy. Concurrent calls share one settlement (the
/// source's stored `destroyPromise`, a D20 `SharedFuture`), which is cleared when it settles; a
/// `TrayDestroyFailed` leaves the tray partially destroyed and a later call retries the native
/// release. A tray never published, or already destroyed, reports `AlreadyDestroyed`.
pub fn destroy_tray_icon(tray: &Ref<TrayIcon>) -> TrayFuture<TrayDestroyResult> {
    let (lifecycle, releases) = {
        let mut guard = tray.write().unwrap();
        let Some(runtime) = guard.tray_runtime.as_mut() else {
            return Box::pin(ready(TrayDestroyResult::AlreadyDestroyed));
        };
        if runtime.state == TrayState::Destroyed {
            return Box::pin(ready(TrayDestroyResult::AlreadyDestroyed));
        }
        if let Some(pending) = &runtime.destroy_future {
            return Box::pin(pending.clone());
        }
        runtime.state = TrayState::Destroying;
        stop_tray_animation_runtime(runtime);
        let releases: Vec<TrayEventRelease> = runtime
            .releases
            .iter()
            .map(|(_, release)| release.clone())
            .collect();
        (runtime.lifecycle.clone(), releases)
    };
    let owner = tray.clone();
    let pending = create_shared_future(Box::pin(async move {
        for release in releases {
            (release.release)().await;
        }
        let destroyed = match catch_unwind(AssertUnwindSafe(|| (lifecycle.destroy)(&owner))) {
            Ok(pending) => pending
                .await
                .map_err(|error| Some(Arc::new(error) as Arc<dyn Any + Send + Sync>)),
            Err(payload) => Err(unknown_from_panic(payload)),
        };
        let result = match destroyed {
            Ok(TrayDestroyCapabilityResult::Destroyed) => TrayDestroyResult::Destroyed,
            Ok(TrayDestroyCapabilityResult::TrayDestroyFailed(TrayDestroyFailures {
                failures,
            })) => TrayDestroyResult::TrayDestroyFailed(TrayDestroyFailures { failures }),
            Err(error) => TrayDestroyResult::TrayDestroyFailed(TrayDestroyFailures {
                failures: vec![TrayDestroyFailure { error: Some(error) }],
            }),
        };
        if let Some(runtime) = owner.write().unwrap().tray_runtime.as_mut() {
            runtime.state = match result {
                TrayDestroyResult::Destroyed => TrayState::Destroyed,
                _ => TrayState::PartiallyDestroyed,
            };
            runtime.destroy_future = None;
        }
        return result;
    }));
    if let Some(runtime) = tray.write().unwrap().tray_runtime.as_mut() {
        runtime.destroy_future = Some(pending.clone());
    }
    return Box::pin(pending);
}

/// Displays a balloon on an active tray.
pub fn display_tray_balloon(
    host_tray_balloon: &HostTrayBalloonCapability,
    tray: &Ref<TrayIcon>,
    options: &TrayBalloonOptions,
) -> TrayFuture<TrayBalloonDisplayResult> {
    return invoke_update(
        tray,
        TrayBalloonDisplayResult::TrayDestroyed,
        |error| TrayBalloonDisplayResult::BalloonDisplayFailed(TrayFailure { error }),
        || (host_tray_balloon.display)(tray, options),
    );
}
// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS DesktopOsProfile string union; the TS package exports no get_/parse_ free functions
pub fn get_desktop_os_profile_string(value: DesktopOsProfile) -> &'static str {
    return match value {
        DesktopOsProfile::Linux => "linux",
        DesktopOsProfile::MacOs => "macos",
        DesktopOsProfile::Windows => "windows",
    };
}

// The host timer clamp behind the source's `setInterval(callback, intervalMs)` (Node: a delay that is
// not within [1, 2^31 - 1] ms, including NaN, becomes 1 ms).
// flight-lint: allow(f64) D1: the interval is a millisecond duration on the flight-signals timer clock
fn get_tray_animation_delay(interval_ms: f64) -> f64 {
    if (1.0..=2_147_483_647.0).contains(&interval_ms) {
        return interval_ms;
    }
    return 1.0;
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS TrayBalloonEventType string union; the TS package exports no get_/parse_ free functions
pub fn get_tray_balloon_event_type_string(value: TrayBalloonEventType) -> &'static str {
    return match value {
        TrayBalloonEventType::Click => "click",
        TrayBalloonEventType::Close => "close",
        TrayBalloonEventType::Show => "show",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS TrayBalloonIconType string union; the TS package exports no get_/parse_ free functions
pub fn get_tray_balloon_icon_type_string(value: TrayBalloonIconType) -> &'static str {
    return match value {
        TrayBalloonIconType::None => "none",
        TrayBalloonIconType::Info => "info",
        TrayBalloonIconType::Warning => "warning",
        TrayBalloonIconType::Error => "error",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS TrayCreateFailureOutcome string union; the TS package exports no get_/parse_ free functions
pub fn get_tray_create_failure_outcome_string(value: TrayCreateFailureOutcome) -> &'static str {
    return match value {
        TrayCreateFailureOutcome::Cancelled => "cancelled",
        TrayCreateFailureOutcome::RuntimeApiUnavailable => "runtime-api-unavailable",
        TrayCreateFailureOutcome::InvalidIcon => "invalid-icon",
        TrayCreateFailureOutcome::TrayCreateFailed => "tray-create-failed",
    };
}

/// Reads the tray icon bounds.
pub fn get_tray_icon_bounds(
    host_tray_bounds: &HostTrayBoundsCapability,
    tray: &Ref<TrayIcon>,
) -> TrayFuture<TrayBoundsResult> {
    return invoke_update(
        tray,
        TrayBoundsResult::TrayDestroyed,
        |error| TrayBoundsResult::BoundsReadFailed(TrayFailure { error }),
        || (host_tray_bounds.get)(tray),
    );
}

/// Reads the tray title.
pub fn get_tray_icon_title(
    host_tray_title: &HostTrayTitleCapability,
    tray: &Ref<TrayIcon>,
) -> TrayFuture<TrayTitleReadResult> {
    return invoke_update(
        tray,
        TrayTitleReadResult::TrayDestroyed,
        |error| TrayTitleReadResult::TitleReadFailed(TrayFailure { error }),
        || (host_tray_title.get)(tray),
    );
}

/// Reads the tray tooltip.
pub fn get_tray_icon_tooltip(
    host_tray_tooltip: &HostTrayTooltipCapability,
    tray: &Ref<TrayIcon>,
) -> TrayFuture<TrayTooltipReadResult> {
    return invoke_update(
        tray,
        TrayTooltipReadResult::TrayDestroyed,
        |error| TrayTooltipReadResult::TooltipReadFailed(TrayFailure { error }),
        || (host_tray_tooltip.get)(tray),
    );
}

/// The provider's live trays, in its order.
// flight-lint: allow(conform-params) D24 (Principal 21f7557f): the result fills a caller-owned out, cleared first
pub fn get_tray_icons(
    out: &mut Vec<Ref<TrayIcon>>,
    host_tray_lifecycle: &HostTrayLifecycleCapability,
) {
    out.clear();
    out.extend((host_tray_lifecycle.list)());
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS TrayInteractionType string union; the TS package exports no get_/parse_ free functions
pub fn get_tray_interaction_type_string(value: TrayInteractionType) -> &'static str {
    return match value {
        TrayInteractionType::Click => "click",
        TrayInteractionType::DoubleClick => "doubleClick",
        TrayInteractionType::RightClick => "rightClick",
    };
}

fn invoke_update<R: Send + 'static>(
    tray: &Ref<TrayIcon>,
    destroyed: R,
    failure: fn(Option<Unknown>) -> R,
    operation: impl FnOnce() -> TrayProviderFuture<R>,
) -> TrayFuture<R> {
    if !is_tray_active(tray) {
        return Box::pin(ready(destroyed));
    }
    let pending = match catch_unwind(AssertUnwindSafe(operation)) {
        Ok(pending) => pending,
        Err(payload) => return Box::pin(ready(failure(Some(unknown_from_panic(payload))))),
    };
    return Box::pin(async move {
        return match pending.await {
            Ok(result) => result,
            Err(error) => failure(Some(Some(Arc::new(error)))),
        };
    });
}

fn is_tray_active(tray: &Ref<TrayIcon>) -> bool {
    return matches!(
        tray.read()
            .unwrap()
            .tray_runtime
            .as_ref()
            .map(|runtime| runtime.state),
        Some(TrayState::Active)
    );
}

/// Whether the tray is no longer active, or its origin lifecycle provider reports it destroyed. A tray
/// that was never published is not destroyed.
pub fn is_tray_destroyed(tray: &Ref<TrayIcon>) -> bool {
    let (state, lifecycle) = {
        let guard = tray.read().unwrap();
        let Some(runtime) = guard.tray_runtime.as_ref() else {
            return false;
        };
        (runtime.state, runtime.lifecycle.clone())
    };
    return state != TrayState::Active || (lifecycle.is_destroyed)(tray);
}

/// Whether the tray's current animation is running. Matches the source's
/// `getTrayRuntime(tray)?.animationTimer !== null`, which is true for a tray that was never published
/// (`undefined !== null`).
pub fn is_tray_icon_animating(tray: &Ref<TrayIcon>) -> bool {
    return tray
        .read()
        .unwrap()
        .tray_runtime
        .as_ref()
        .is_none_or(|runtime| runtime.animation_timer.is_some());
}

/// Attaches a balloon-event listener on an active tray.
pub fn on_tray_balloon_event(
    host_tray_balloon_events: &HostTrayBalloonEventsCapability,
    tray: &Ref<TrayIcon>,
    listener: SignalSlot<TrayBalloonEvent>,
) -> TrayEventAttachResult {
    return attach_tray_event(&*host_tray_balloon_events.get_signal, tray, listener);
}

/// Attaches a drop listener on an active tray.
pub fn on_tray_drop(
    host_tray_drop_events: &HostTrayDropEventsCapability,
    tray: &Ref<TrayIcon>,
    listener: SignalSlot<TrayDropEvent>,
) -> TrayEventAttachResult {
    return attach_tray_event(&*host_tray_drop_events.get_signal, tray, listener);
}

/// Attaches an interaction listener on an active tray. The release token is shared with the tray, so
/// destroying the tray releases a remaining subscription.
pub fn on_tray_interaction(
    host_tray_interaction_events: &HostTrayInteractionEventsCapability,
    tray: &Ref<TrayIcon>,
    listener: SignalSlot<TrayInteractionEvent>,
) -> TrayEventAttachResult {
    return attach_tray_event(&*host_tray_interaction_events.get_signal, tray, listener);
}

/// Attaches a menu-selection listener on an active tray.
pub fn on_tray_menu_selection(
    host_tray_menu_selection_events: &HostTrayMenuSelectionEventsCapability,
    tray: &Ref<TrayIcon>,
    listener: SignalSlot<TrayMenuSelectionEvent>,
) -> TrayEventAttachResult {
    return attach_tray_event(&*host_tray_menu_selection_events.get_signal, tray, listener);
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS DesktopOsProfile string union; the TS package exports no get_/parse_ free functions
pub fn parse_desktop_os_profile(value: &str) -> Option<DesktopOsProfile> {
    return match value {
        "linux" => Some(DesktopOsProfile::Linux),
        "macos" => Some(DesktopOsProfile::MacOs),
        "windows" => Some(DesktopOsProfile::Windows),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS TrayBalloonEventType string union; the TS package exports no get_/parse_ free functions
pub fn parse_tray_balloon_event_type(value: &str) -> Option<TrayBalloonEventType> {
    return match value {
        "click" => Some(TrayBalloonEventType::Click),
        "close" => Some(TrayBalloonEventType::Close),
        "show" => Some(TrayBalloonEventType::Show),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS TrayBalloonIconType string union; the TS package exports no get_/parse_ free functions
pub fn parse_tray_balloon_icon_type(value: &str) -> Option<TrayBalloonIconType> {
    return match value {
        "none" => Some(TrayBalloonIconType::None),
        "info" => Some(TrayBalloonIconType::Info),
        "warning" => Some(TrayBalloonIconType::Warning),
        "error" => Some(TrayBalloonIconType::Error),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS TrayCreateFailureOutcome string union; the TS package exports no get_/parse_ free functions
pub fn parse_tray_create_failure_outcome(value: &str) -> Option<TrayCreateFailureOutcome> {
    return match value {
        "cancelled" => Some(TrayCreateFailureOutcome::Cancelled),
        "runtime-api-unavailable" => Some(TrayCreateFailureOutcome::RuntimeApiUnavailable),
        "invalid-icon" => Some(TrayCreateFailureOutcome::InvalidIcon),
        "tray-create-failed" => Some(TrayCreateFailureOutcome::TrayCreateFailed),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS TrayInteractionType string union; the TS package exports no get_/parse_ free functions
pub fn parse_tray_interaction_type(value: &str) -> Option<TrayInteractionType> {
    return match value {
        "click" => Some(TrayInteractionType::Click),
        "doubleClick" => Some(TrayInteractionType::DoubleClick),
        "rightClick" => Some(TrayInteractionType::RightClick),
        _ => None,
    };
}

/// Shows the installed context menu, at `position` when given.
pub fn popup_tray_context_menu(
    host_tray_popup_menu: &HostTrayPopupMenuCapability,
    tray: &Ref<TrayIcon>,
    position: Option<&Vector2>,
) -> TrayFuture<TrayPopupMenuResult> {
    return invoke_update(
        tray,
        TrayPopupMenuResult::TrayDestroyed,
        |error| TrayPopupMenuResult::PopupFailed(TrayFailure { error }),
        || (host_tray_popup_menu.popup)(tray, position),
    );
}

fn queue_animation_write(
    host_tray_image: &HostTrayImageCapability,
    tray: &Ref<TrayIcon>,
    generation: u64,
    frame: TrayIconSource,
) -> TrayFuture<TrayImageUpdateResult> {
    let written: Arc<Mutex<Option<TrayImageUpdateResult>>> = Arc::new(Mutex::new(None));
    let slot = written.clone();
    let host_tray_image = host_tray_image.clone();
    let owner = Arc::downgrade(tray);
    let mut guard = tray.write().unwrap();
    let runtime = guard.tray_runtime.as_mut().unwrap();
    let previous = runtime.animation_write_tail.clone();
    let tail = create_shared_future(Box::pin(async move {
        previous.await;
        let Some(tray) = owner.upgrade() else {
            return;
        };
        let current = tray
            .read()
            .unwrap()
            .tray_runtime
            .as_ref()
            .is_some_and(|runtime| {
                runtime.state == TrayState::Active && runtime.animation_generation == generation
            });
        if !current {
            return;
        }
        let result = set_tray_icon(&host_tray_image, &tray, &frame).await;
        *slot.lock().unwrap() = Some(result);
    }));
    runtime.animation_write_tail = tail.clone();
    drop(guard);
    return Box::pin(async move {
        tail.await;
        return written
            .lock()
            .unwrap()
            .take()
            .unwrap_or(TrayImageUpdateResult::TrayDestroyed);
    });
}

/// Removes the active balloon.
pub fn remove_tray_balloon(
    host_tray_balloon: &HostTrayBalloonCapability,
    tray: &Ref<TrayIcon>,
) -> TrayFuture<TrayBalloonRemoveResult> {
    return invoke_update(
        tray,
        TrayBalloonRemoveResult::TrayDestroyed,
        |error| TrayBalloonRemoveResult::BalloonRemoveFailed(TrayFailure { error }),
        || (host_tray_balloon.remove)(tray),
    );
}

fn run_tray_animation_tick(tick: &Arc<TrayAnimationTick>) {
    let Some(tray) = tick.tray.upgrade() else {
        return;
    };
    let index = {
        let mut index = tick.index.lock().unwrap();
        *index = (*index + 1) % tick.frames.len();
        *index
    };
    let write = queue_animation_write(
        &tick.host_tray_image,
        &tray,
        tick.generation,
        tick.frames[index].clone(),
    );
    (tick.spawn.spawn)(Box::pin(async move {
        write.await;
    }));
    schedule_tray_animation_tick(tick);
}

fn schedule_tray_animation_tick(tick: &Arc<TrayAnimationTick>) {
    let next = tick.clone();
    let id = set_signal_timeout(
        &tick.timers,
        tick.delay_ms,
        Arc::new(move || run_tray_animation_tick(&next)),
    );
    let current = tick.tray.upgrade().is_some_and(|tray| {
        let mut guard = tray.write().unwrap();
        let Some(runtime) = guard.tray_runtime.as_mut() else {
            return false;
        };
        if runtime.state != TrayState::Active || runtime.animation_generation != tick.generation {
            return false;
        }
        runtime.animation_timer = Some((tick.timers.clone(), id));
        return true;
    });
    if !current {
        clear_signal_timeout(&tick.timers, id);
    }
}

/// Installs or clears (`None`) the opt-in animation inspection hook on `state`.
// flight-lint: allow(conform-params) D5: caller-owned animation state replaces the TS module-level guard slot
pub fn set_tray_animation_guard(state: &mut TrayAnimationState, guard: Option<TrayAnimationGuard>) {
    state.guard = guard;
}

/// Sets the tray image.
pub fn set_tray_icon(
    host_tray_image: &HostTrayImageCapability,
    tray: &Ref<TrayIcon>,
    icon: &str,
) -> TrayFuture<TrayImageUpdateResult> {
    return invoke_update(
        tray,
        TrayImageUpdateResult::TrayDestroyed,
        |error| TrayImageUpdateResult::ImageUpdateFailed(TrayFailure { error }),
        || (host_tray_image.set)(tray, icon),
    );
}

/// Installs a context menu from shared descriptor handles (passed by identity).
pub fn set_tray_icon_context_menu(
    host_tray_menu: &HostTrayMenuCapability,
    tray: &Ref<TrayIcon>,
    items: &[Ref<MenuItemTemplate>],
) -> TrayFuture<TrayMenuUpdateResult> {
    return invoke_update(
        tray,
        TrayMenuUpdateResult::TrayDestroyed,
        |error| TrayMenuUpdateResult::MenuInstallFailed(TrayFailure { error }),
        || (host_tray_menu.set)(tray, items),
    );
}

/// Sets template-image treatment.
pub fn set_tray_icon_template(
    host_tray_template_image: &HostTrayTemplateImageCapability,
    tray: &Ref<TrayIcon>,
    is_template: bool,
) -> TrayFuture<TrayTemplateImageUpdateResult> {
    return invoke_update(
        tray,
        TrayTemplateImageUpdateResult::TrayDestroyed,
        |error| TrayTemplateImageUpdateResult::TemplateImageUpdateFailed(TrayFailure { error }),
        || (host_tray_template_image.set)(tray, is_template),
    );
}

/// Sets the tray title.
pub fn set_tray_icon_title(
    host_tray_title: &HostTrayTitleCapability,
    tray: &Ref<TrayIcon>,
    title: &str,
) -> TrayFuture<TrayTitleUpdateResult> {
    return invoke_update(
        tray,
        TrayTitleUpdateResult::TrayDestroyed,
        |error| TrayTitleUpdateResult::TitleUpdateFailed(TrayFailure { error }),
        || (host_tray_title.set)(tray, title),
    );
}

/// Sets the tray tooltip.
pub fn set_tray_icon_tooltip(
    host_tray_tooltip: &HostTrayTooltipCapability,
    tray: &Ref<TrayIcon>,
    tooltip: &str,
) -> TrayFuture<TrayTooltipUpdateResult> {
    return invoke_update(
        tray,
        TrayTooltipUpdateResult::TrayDestroyed,
        |error| TrayTooltipUpdateResult::TooltipUpdateFailed(TrayFailure { error }),
        || (host_tray_tooltip.set)(tray, tooltip),
    );
}

/// Sets whether double clicks are ignored.
pub fn set_tray_ignore_double_click_events(
    host_tray_double_click_policy: &HostTrayDoubleClickPolicyCapability,
    tray: &Ref<TrayIcon>,
    ignore: bool,
) -> TrayFuture<TrayDoubleClickPolicyUpdateResult> {
    return invoke_update(
        tray,
        TrayDoubleClickPolicyUpdateResult::TrayDestroyed,
        |error| {
            TrayDoubleClickPolicyUpdateResult::DoubleClickPolicyUpdateFailed(TrayFailure { error })
        },
        || (host_tray_double_click_policy.set_ignore)(tray, ignore),
    );
}

/// Sets the pressed-state image.
pub fn set_tray_pressed_icon(
    host_tray_pressed_image: &HostTrayPressedImageCapability,
    tray: &Ref<TrayIcon>,
    icon: &str,
) -> TrayFuture<TrayPressedImageUpdateResult> {
    return invoke_update(
        tray,
        TrayPressedImageUpdateResult::TrayDestroyed,
        |error| TrayPressedImageUpdateResult::PressedImageUpdateFailed(TrayFailure { error }),
        || (host_tray_pressed_image.set)(tray, icon),
    );
}

/// Starts an icon animation: reports `Empty` for no frames, runs the state's guard, stops any
/// current animation (a new generation), and writes the first frame through the serialized write
/// chain. A first-frame failure is returned; a tray destroyed or re-animated meanwhile reports
/// `TrayDestroyed`. On success the source's `setInterval` becomes a repeating timeout on the state's
/// caller-owned `timers`: each tick advances to the next frame, appends its write to the serialized
/// chain (skipped unless the tray is still active on this generation) and hands the unawaited write
/// to the host `spawn`. The release stops the animation only while it is still the current
/// generation.
///
/// The interval follows the host timer clamp the source relies on (Node `setInterval`): an interval
/// below 1 ms, above 2^31 - 1 ms, or NaN repeats every 1 ms.
// flight-lint: allow(f64) D1: the interval is a millisecond duration
// flight-lint: allow(conform-params) D5: caller-owned animation state replaces the TS module-level guard slot and host timer
pub fn start_tray_icon_animation(
    state: &TrayAnimationState,
    host_tray_image: &HostTrayImageCapability,
    tray: &Ref<TrayIcon>,
    frames: &[TrayIconSource],
    interval_ms: f64,
) -> TrayFuture<TrayAnimationStartResult> {
    if frames.is_empty() {
        return Box::pin(ready(TrayAnimationStartResult::Empty));
    }
    if !is_tray_active(tray) {
        return Box::pin(ready(TrayAnimationStartResult::TrayDestroyed));
    }
    if let Some(guard) = &state.guard {
        guard(tray, frames.len() as i32, interval_ms);
    }
    let generation = {
        let mut guard = tray.write().unwrap();
        let Some(runtime) = guard.tray_runtime.as_mut() else {
            return Box::pin(ready(TrayAnimationStartResult::TrayDestroyed));
        };
        stop_tray_animation_runtime(runtime);
        runtime.animation_generation
    };
    let first = queue_animation_write(host_tray_image, tray, generation, frames[0].clone());
    let owner = tray.clone();
    let tick = Arc::new(TrayAnimationTick {
        delay_ms: get_tray_animation_delay(interval_ms),
        frames: frames.to_vec(),
        generation,
        host_tray_image: host_tray_image.clone(),
        index: Mutex::new(0),
        spawn: state.spawn.clone(),
        timers: state.timers.clone(),
        tray: Arc::downgrade(tray),
    });
    return Box::pin(async move {
        match first.await {
            TrayImageUpdateResult::Updated => {}
            TrayImageUpdateResult::TrayDestroyed => return TrayAnimationStartResult::TrayDestroyed,
            TrayImageUpdateResult::InvalidIcon(TrayFailure { error }) => {
                return TrayAnimationStartResult::InvalidIcon(TrayFailure { error });
            }
            TrayImageUpdateResult::ImageUpdateFailed(TrayFailure { error }) => {
                return TrayAnimationStartResult::ImageUpdateFailed(TrayFailure { error });
            }
        }
        {
            let mut guard = owner.write().unwrap();
            let Some(runtime) = guard.tray_runtime.as_mut() else {
                return TrayAnimationStartResult::TrayDestroyed;
            };
            if runtime.state != TrayState::Active || runtime.animation_generation != generation {
                return TrayAnimationStartResult::TrayDestroyed;
            }
        }
        schedule_tray_animation_tick(&tick);
        let released = Arc::new(AtomicBool::new(false));
        let animated = Arc::downgrade(&owner);
        let release = TrayEventRelease {
            release: Arc::new(move || {
                if released.swap(true, Ordering::SeqCst) {
                    return Box::pin(ready(TrayReleaseResult::AlreadyReleased));
                }
                if let Some(tray) = animated.upgrade() {
                    if let Some(runtime) = tray.write().unwrap().tray_runtime.as_mut() {
                        if runtime.animation_generation == generation {
                            stop_tray_animation_runtime(runtime);
                        }
                    }
                }
                return Box::pin(ready(TrayReleaseResult::Released));
            }),
        };
        return TrayAnimationStartResult::Started(release);
    });
}

fn stop_tray_animation_runtime(runtime: &mut TrayRuntime) {
    runtime.animation_generation += 1;
    if let Some((timers, id)) = runtime.animation_timer.take() {
        clear_signal_timeout(&timers, id);
    }
}

/// Stops the current animation, or reports `AlreadyStopped`.
pub fn stop_tray_icon_animation(tray: &Ref<TrayIcon>) -> TrayAnimationStopResult {
    let mut guard = tray.write().unwrap();
    let Some(runtime) = guard.tray_runtime.as_mut() else {
        return TrayAnimationStopResult::AlreadyStopped;
    };
    if runtime.animation_timer.is_none() {
        return TrayAnimationStopResult::AlreadyStopped;
    }
    stop_tray_animation_runtime(runtime);
    return TrayAnimationStopResult::Stopped;
}

impl HostTrayBalloonCapability {
    pub fn display_balloon(
        &self,
        tray: &Ref<TrayIcon>,
        options: &TrayBalloonOptions,
    ) -> TrayFuture<TrayBalloonDisplayResult> {
        return display_tray_balloon(self, tray, options);
    }

    pub fn remove_balloon(&self, tray: &Ref<TrayIcon>) -> TrayFuture<TrayBalloonRemoveResult> {
        return remove_tray_balloon(self, tray);
    }
}

impl HostTrayBalloonEventsCapability {
    pub fn on_balloon_event(
        &self,
        tray: &Ref<TrayIcon>,
        listener: SignalSlot<TrayBalloonEvent>,
    ) -> TrayEventAttachResult {
        return on_tray_balloon_event(self, tray, listener);
    }
}

impl HostTrayBoundsCapability {
    pub fn icon_bounds(&self, tray: &Ref<TrayIcon>) -> TrayFuture<TrayBoundsResult> {
        return get_tray_icon_bounds(self, tray);
    }
}

impl HostTrayDoubleClickPolicyCapability {
    pub fn set_ignore_double_click_events(
        &self,
        tray: &Ref<TrayIcon>,
        ignore: bool,
    ) -> TrayFuture<TrayDoubleClickPolicyUpdateResult> {
        return set_tray_ignore_double_click_events(self, tray, ignore);
    }
}

impl HostTrayDropEventsCapability {
    pub fn on_drop(
        &self,
        tray: &Ref<TrayIcon>,
        listener: SignalSlot<TrayDropEvent>,
    ) -> TrayEventAttachResult {
        return on_tray_drop(self, tray, listener);
    }
}

impl HostTrayImageCapability {
    pub fn set_icon(&self, tray: &Ref<TrayIcon>, icon: &str) -> TrayFuture<TrayImageUpdateResult> {
        return set_tray_icon(self, tray, icon);
    }

    // flight-lint: allow(f64) D1: the interval is a millisecond duration
    pub fn start_icon_animation(
        &self,
        state: &TrayAnimationState,
        tray: &Ref<TrayIcon>,
        frames: &[TrayIconSource],
        interval_ms: f64,
    ) -> TrayFuture<TrayAnimationStartResult> {
        return start_tray_icon_animation(state, self, tray, frames, interval_ms);
    }
}

impl HostTrayInteractionEventsCapability {
    pub fn on_interaction(
        &self,
        tray: &Ref<TrayIcon>,
        listener: SignalSlot<TrayInteractionEvent>,
    ) -> TrayEventAttachResult {
        return on_tray_interaction(self, tray, listener);
    }
}

impl HostTrayLifecycleCapability {
    pub fn create_icon(&self, options: &TrayIconOptions) -> TrayFuture<TrayCreateResult> {
        return create_tray_icon(self, options);
    }

    pub fn icons(&self, out: &mut Vec<Ref<TrayIcon>>) {
        get_tray_icons(out, self);
    }
}

impl HostTrayMenuCapability {
    pub fn set_icon_context_menu(
        &self,
        tray: &Ref<TrayIcon>,
        items: &[Ref<MenuItemTemplate>],
    ) -> TrayFuture<TrayMenuUpdateResult> {
        return set_tray_icon_context_menu(self, tray, items);
    }
}

impl HostTrayMenuSelectionEventsCapability {
    pub fn on_menu_selection(
        &self,
        tray: &Ref<TrayIcon>,
        listener: SignalSlot<TrayMenuSelectionEvent>,
    ) -> TrayEventAttachResult {
        return on_tray_menu_selection(self, tray, listener);
    }
}

impl HostTrayPopupMenuCapability {
    pub fn popup_context_menu(
        &self,
        tray: &Ref<TrayIcon>,
        position: Option<&Vector2>,
    ) -> TrayFuture<TrayPopupMenuResult> {
        return popup_tray_context_menu(self, tray, position);
    }
}

impl HostTrayPressedImageCapability {
    pub fn set_pressed_icon(
        &self,
        tray: &Ref<TrayIcon>,
        icon: &str,
    ) -> TrayFuture<TrayPressedImageUpdateResult> {
        return set_tray_pressed_icon(self, tray, icon);
    }
}

impl HostTrayTemplateImageCapability {
    pub fn set_icon_template(
        &self,
        tray: &Ref<TrayIcon>,
        is_template: bool,
    ) -> TrayFuture<TrayTemplateImageUpdateResult> {
        return set_tray_icon_template(self, tray, is_template);
    }
}

impl HostTrayTitleCapability {
    pub fn icon_title(&self, tray: &Ref<TrayIcon>) -> TrayFuture<TrayTitleReadResult> {
        return get_tray_icon_title(self, tray);
    }

    pub fn set_icon_title(
        &self,
        tray: &Ref<TrayIcon>,
        title: &str,
    ) -> TrayFuture<TrayTitleUpdateResult> {
        return set_tray_icon_title(self, tray, title);
    }
}

impl HostTrayTooltipCapability {
    pub fn icon_tooltip(&self, tray: &Ref<TrayIcon>) -> TrayFuture<TrayTooltipReadResult> {
        return get_tray_icon_tooltip(self, tray);
    }

    pub fn set_icon_tooltip(
        &self,
        tray: &Ref<TrayIcon>,
        tooltip: &str,
    ) -> TrayFuture<TrayTooltipUpdateResult> {
        return set_tray_icon_tooltip(self, tray, tooltip);
    }
}

impl TrayAnimationState {
    pub fn new(spawn: HostSpawnCapability, timers: Ref<SignalTimerState>) -> Self {
        return create_tray_animation_state(spawn, timers);
    }

    pub fn set_animation_guard(&mut self, guard: Option<TrayAnimationGuard>) {
        set_tray_animation_guard(self, guard);
    }
}

impl TrayIconMethods for Ref<TrayIcon> {
    fn destroy(&self) -> TrayFuture<TrayDestroyResult> {
        return destroy_tray_icon(self);
    }

    fn is_animating(&self) -> bool {
        return is_tray_icon_animating(self);
    }

    fn is_destroyed(&self) -> bool {
        return is_tray_destroyed(self);
    }

    fn stop_animation(&self) -> TrayAnimationStopResult {
        return stop_tray_icon_animation(self);
    }
}
