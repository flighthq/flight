use std::any::Any;
use std::future::ready;
use std::panic::{AssertUnwindSafe, catch_unwind, resume_unwind};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, RwLock};

use flight_entity::{FlightError, NonEntityCreateResult, Ref, Unknown, allocate_entity};
use flight_geometry::Vector2;
use flight_menu::MenuItemTemplate;
use flight_signals::{Signal, SignalSlot, connect_signal, disconnect_signal};
use flight_stream::{SharedFuture, create_shared_future};

use crate::results::*;
use crate::types::*;

/// Caller-owned animation state with no guard installed (D5; replaces the source's module slot).
// flight-lint: allow(conform-extra) D5: caller-owned animation state replaces the TS module-level guard slot
pub fn create_tray_animation_state() -> NonEntityCreateResult<TrayAnimationState> {
    return TrayAnimationState { guard: None };
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
            let error = get_tray_thrown_error(payload);
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
                    animation_timer: false,
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
            TrayCreateCapabilityResult::RuntimeApiUnavailable { error } => {
                (TrayCreateFailureOutcome::RuntimeApiUnavailable, error)
            }
            TrayCreateCapabilityResult::InvalidIcon { error } => {
                (TrayCreateFailureOutcome::InvalidIcon, error)
            }
            TrayCreateCapabilityResult::TrayCreateFailed { error } => {
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
    out.outcome = TrayCreateOutcome::TrayCreateFailed { error };
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
            TrayCreateOutcome::RuntimeApiUnavailable { error }
        }
        TrayCreateFailureOutcome::InvalidIcon => TrayCreateOutcome::InvalidIcon { error },
        TrayCreateFailureOutcome::TrayCreateFailed => TrayCreateOutcome::TrayCreateFailed { error },
    };
}

/// Fills a create result with the published tray.
// flight-lint: allow(conform-params) D9b: the TS `outcome` parameter admits only 'created', which the Rust arm encodes
pub fn initialize_tray_create_success_result(out: &mut TrayCreateResult, tray: Ref<TrayIcon>) {
    out.outcome = TrayCreateOutcome::Created { tray };
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
            return TrayEventAttachResult::SubscriptionFailed {
                error: Some(get_tray_thrown_error(payload)),
            };
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
                return Box::pin(ready(TrayReleaseResult::ReleaseFailed {
                    error: Some(get_tray_thrown_error(payload)),
                }));
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
    return TrayEventAttachResult::Attached { release };
}

fn create_resolved_write_tail() -> SharedFuture<()> {
    return create_shared_future(Box::pin(async {}));
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
            Err(payload) => Err(get_tray_thrown_error(payload)),
        };
        let result = match destroyed {
            Ok(TrayDestroyCapabilityResult::Destroyed) => TrayDestroyResult::Destroyed,
            Ok(TrayDestroyCapabilityResult::TrayDestroyFailed { failures }) => {
                TrayDestroyResult::TrayDestroyFailed { failures }
            }
            Err(error) => TrayDestroyResult::TrayDestroyFailed {
                failures: vec![TrayDestroyFailure { error: Some(error) }],
            },
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
        |error| TrayBalloonDisplayResult::BalloonDisplayFailed { error },
        || (host_tray_balloon.display)(tray, options),
    );
}

/// Reads the tray icon bounds.
pub fn get_tray_icon_bounds(
    host_tray_bounds: &HostTrayBoundsCapability,
    tray: &Ref<TrayIcon>,
) -> TrayFuture<TrayBoundsResult> {
    return invoke_update(
        tray,
        TrayBoundsResult::TrayDestroyed,
        |error| TrayBoundsResult::BoundsReadFailed { error },
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
        |error| TrayTitleReadResult::TitleReadFailed { error },
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
        |error| TrayTooltipReadResult::TooltipReadFailed { error },
        || (host_tray_tooltip.get)(tray),
    );
}

/// The provider's live trays, in its order.
pub fn get_tray_icons(host_tray_lifecycle: &HostTrayLifecycleCapability) -> Vec<Ref<TrayIcon>> {
    return (host_tray_lifecycle.list)();
}

// A synchronous provider throw is a Rust panic (D10). Payloads with an exact `unknown` reading are
// caught: a FlightError, an erased `Unknown` (its `None` is the source's `null`), or a panic message
// (`String` / `&'static str`, kept as that type). Any other payload is re-raised unchanged: its
// conversion to `Unknown` awaits a boundary ruling and is never made lossily.
fn get_tray_thrown_error(payload: Box<dyn Any + Send>) -> Unknown {
    let payload = match payload.downcast::<FlightError>() {
        Ok(error) => return Some(Arc::new(*error)),
        Err(payload) => payload,
    };
    let payload = match payload.downcast::<Unknown>() {
        Ok(error) => return *error,
        Err(payload) => payload,
    };
    let payload = match payload.downcast::<String>() {
        Ok(message) => return Some(Arc::new(*message)),
        Err(payload) => payload,
    };
    match payload.downcast::<&'static str>() {
        Ok(message) => return Some(Arc::new(*message)),
        Err(payload) => resume_unwind(payload),
    }
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
        Err(payload) => return Box::pin(ready(failure(Some(get_tray_thrown_error(payload))))),
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
        .is_none_or(|runtime| runtime.animation_timer);
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

/// Shows the installed context menu, at `position` when given.
pub fn popup_tray_context_menu(
    host_tray_popup_menu: &HostTrayPopupMenuCapability,
    tray: &Ref<TrayIcon>,
    position: Option<&Vector2>,
) -> TrayFuture<TrayPopupMenuResult> {
    return invoke_update(
        tray,
        TrayPopupMenuResult::TrayDestroyed,
        |error| TrayPopupMenuResult::PopupFailed { error },
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
        |error| TrayBalloonRemoveResult::BalloonRemoveFailed { error },
        || (host_tray_balloon.remove)(tray),
    );
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
        |error| TrayImageUpdateResult::ImageUpdateFailed { error },
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
        |error| TrayMenuUpdateResult::MenuInstallFailed { error },
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
        |error| TrayTemplateImageUpdateResult::TemplateImageUpdateFailed { error },
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
        |error| TrayTitleUpdateResult::TitleUpdateFailed { error },
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
        |error| TrayTooltipUpdateResult::TooltipUpdateFailed { error },
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
        |error| TrayDoubleClickPolicyUpdateResult::DoubleClickPolicyUpdateFailed { error },
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
        |error| TrayPressedImageUpdateResult::PressedImageUpdateFailed { error },
        || (host_tray_pressed_image.set)(tray, icon),
    );
}

/// Starts an icon animation: reports `Empty` for no frames, runs the state's guard, stops any
/// current animation (a new generation), and writes the first frame through the serialized write
/// chain. A first-frame failure is returned; a tray destroyed or re-animated meanwhile reports
/// `TrayDestroyed`. On success the animation is marked running and the release stops it only while
/// it is still the current generation.
///
/// HELD: the source then advances frames with `setInterval`. How a caller-owned timer drives the
/// queued asynchronous frame writes without an SDK spawn is a pending Principal ruling, so no
/// interval tick is scheduled here and later frames are not written.
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
    return Box::pin(async move {
        match first.await {
            TrayImageUpdateResult::Updated => {}
            TrayImageUpdateResult::TrayDestroyed => return TrayAnimationStartResult::TrayDestroyed,
            TrayImageUpdateResult::InvalidIcon { error } => {
                return TrayAnimationStartResult::InvalidIcon { error };
            }
            TrayImageUpdateResult::ImageUpdateFailed { error } => {
                return TrayAnimationStartResult::ImageUpdateFailed { error };
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
            runtime.animation_timer = true;
        }
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
        return TrayAnimationStartResult::Started { release };
    });
}

fn stop_tray_animation_runtime(runtime: &mut TrayRuntime) {
    runtime.animation_generation += 1;
    runtime.animation_timer = false;
}

/// Stops the current animation, or reports `AlreadyStopped`.
pub fn stop_tray_icon_animation(tray: &Ref<TrayIcon>) -> TrayAnimationStopResult {
    let mut guard = tray.write().unwrap();
    let Some(runtime) = guard.tray_runtime.as_mut() else {
        return TrayAnimationStopResult::AlreadyStopped;
    };
    if !runtime.animation_timer {
        return TrayAnimationStopResult::AlreadyStopped;
    }
    stop_tray_animation_runtime(runtime);
    return TrayAnimationStopResult::Stopped;
}

impl TrayAnimationState {
    pub fn new() -> Self {
        return create_tray_animation_state();
    }
}
// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS DesktopOsProfile string union; the TS package exports no get_/parse_ free functions
pub fn get_desktop_os_profile_string(value: DesktopOsProfile) -> &'static str {
    return match value {
        DesktopOsProfile::Linux => "linux",
        DesktopOsProfile::MacOs => "macos",
        DesktopOsProfile::Windows => "windows",
    };
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

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS TrayBalloonIconType string union; the TS package exports no get_/parse_ free functions
pub fn get_tray_balloon_icon_type_string(value: TrayBalloonIconType) -> &'static str {
    return match value {
        TrayBalloonIconType::None => "none",
        TrayBalloonIconType::Info => "info",
        TrayBalloonIconType::Warning => "warning",
        TrayBalloonIconType::Error => "error",
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

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS TrayInteractionType string union; the TS package exports no get_/parse_ free functions
pub fn get_tray_interaction_type_string(value: TrayInteractionType) -> &'static str {
    return match value {
        TrayInteractionType::Click => "click",
        TrayInteractionType::DoubleClick => "doubleClick",
        TrayInteractionType::RightClick => "rightClick",
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

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS TrayBalloonEventType string union; the TS package exports no get_/parse_ free functions
pub fn get_tray_balloon_event_type_string(value: TrayBalloonEventType) -> &'static str {
    return match value {
        TrayBalloonEventType::Click => "click",
        TrayBalloonEventType::Close => "close",
        TrayBalloonEventType::Show => "show",
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

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS TrayCreateFailureOutcome string union; the TS package exports no get_/parse_ free functions
pub fn get_tray_create_failure_outcome_string(value: TrayCreateFailureOutcome) -> &'static str {
    return match value {
        TrayCreateFailureOutcome::Cancelled => "cancelled",
        TrayCreateFailureOutcome::RuntimeApiUnavailable => "runtime-api-unavailable",
        TrayCreateFailureOutcome::InvalidIcon => "invalid-icon",
        TrayCreateFailureOutcome::TrayCreateFailed => "tray-create-failed",
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
