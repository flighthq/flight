use std::future::{Future, ready};
use std::pin::Pin;
use std::sync::{Arc, Mutex, RwLock};

use flight_entity::{
    CaughtPanic, FlightError, FlightErrorKind, Ref, allocate_entity, get_caught_panic_payload,
};
use flight_geometry::{create_rectangle, create_vector2};
use flight_hostcapability::{HostSpawnCapability, ProviderRef};
use flight_menu::MenuItemTemplate;
use flight_signals::{
    Signal, SignalSlot, SignalTimerState, advance_signal_timers, create_signal,
    create_signal_timer_state, emit_signal,
};
use flight_tray::contract::*;

use crate::block_on;

type Keyed<E> = Vec<(Ref<TrayIcon>, Signal<E>)>;

struct TestState {
    balloon_events: Keyed<TrayBalloonEvent>,
    destroy_calls: usize,
    destroy_failures: i32,
    destroyed: Vec<Ref<TrayIcon>>,
    drop_events: Keyed<TrayDropEvent>,
    images: Vec<String>,
    interaction_events: Keyed<TrayInteractionEvent>,
    live: Vec<Ref<TrayIcon>>,
    menu_selection_events: Keyed<TrayMenuSelectionEvent>,
    title: String,
    tooltip: String,
}

struct TestHost {
    balloon: HostTrayBalloonCapability,
    balloon_events: HostTrayBalloonEventsCapability,
    bounds: HostTrayBoundsCapability,
    double_click_policy: HostTrayDoubleClickPolicyCapability,
    drop_events: HostTrayDropEventsCapability,
    image: HostTrayImageCapability,
    interaction_events: HostTrayInteractionEventsCapability,
    lifecycle: HostTrayLifecycleCapability,
    menu: HostTrayMenuCapability,
    menu_selection_events: HostTrayMenuSelectionEventsCapability,
    popup_menu: HostTrayPopupMenuCapability,
    pressed_image: HostTrayPressedImageCapability,
    template_image: HostTrayTemplateImageCapability,
    title: HostTrayTitleCapability,
    tooltip: HostTrayTooltipCapability,
}

fn ok<T: Send + 'static>(value: T) -> TrayProviderFuture<T> {
    return Box::pin(ready(Ok(value)));
}

fn rejected<T: Send + 'static>(message: &str) -> TrayProviderFuture<T> {
    return Box::pin(ready(Err(FlightError {
        kind: FlightErrorKind::Error,
        message: message.to_string(),
    })));
}

fn signal_for<E>(entries: &Keyed<E>, tray: &Ref<TrayIcon>) -> Option<Signal<E>> {
    return entries
        .iter()
        .find(|(key, _)| Arc::ptr_eq(key, tray))
        .map(|(_, signal)| signal.clone());
}

fn test_host() -> (TestHost, Arc<Mutex<TestState>>) {
    let state = Arc::new(Mutex::new(TestState {
        balloon_events: Vec::new(),
        destroy_calls: 0,
        destroy_failures: 0,
        destroyed: Vec::new(),
        drop_events: Vec::new(),
        images: Vec::new(),
        interaction_events: Vec::new(),
        live: Vec::new(),
        menu_selection_events: Vec::new(),
        title: String::new(),
        tooltip: String::new(),
    }));
    let provider: ProviderRef = Arc::new(());
    let (s1, s2, s3, s4) = (state.clone(), state.clone(), state.clone(), state.clone());
    let lifecycle = HostTrayLifecycleCapability {
        provider: provider.clone(),
        create: Arc::new(move |tray: &Ref<TrayIcon>, _options: &TrayIconOptions| {
            let mut s = s1.lock().unwrap();
            s.live.push(tray.clone());
            s.balloon_events.push((tray.clone(), create_signal()));
            s.drop_events.push((tray.clone(), create_signal()));
            s.interaction_events.push((tray.clone(), create_signal()));
            s.menu_selection_events
                .push((tray.clone(), create_signal()));
            return ok(TrayCreateCapabilityResult::Created);
        }),
        destroy: Arc::new(move |tray: &Ref<TrayIcon>| {
            let mut s = s2.lock().unwrap();
            s.destroy_calls += 1;
            s.destroy_failures -= 1;
            if s.destroy_failures >= 0 {
                return ok(TrayDestroyCapabilityResult::TrayDestroyFailed(
                    TrayDestroyFailures {
                        failures: vec![TrayDestroyFailure { error: None }],
                    },
                ));
            }
            s.destroyed.push(tray.clone());
            s.live.retain(|item| !Arc::ptr_eq(item, tray));
            return ok(TrayDestroyCapabilityResult::Destroyed);
        }),
        is_destroyed: Arc::new(move |tray: &Ref<TrayIcon>| {
            return s3
                .lock()
                .unwrap()
                .destroyed
                .iter()
                .any(|item| Arc::ptr_eq(item, tray));
        }),
        list: Arc::new(move || s4.lock().unwrap().live.clone()),
    };
    let (s5, s6, s7, s8, s9) = (
        state.clone(),
        state.clone(),
        state.clone(),
        state.clone(),
        state.clone(),
    );
    let (s10, s11, s12, s13) = (state.clone(), state.clone(), state.clone(), state.clone());
    let host = TestHost {
        balloon: HostTrayBalloonCapability {
            provider: provider.clone(),
            display: Arc::new(|_tray: &Ref<TrayIcon>, _options: &TrayBalloonOptions| {
                return ok(TrayBalloonDisplayResult::Displayed);
            }),
            remove: Arc::new(|_tray: &Ref<TrayIcon>| ok(TrayBalloonRemoveResult::Removed)),
        },
        balloon_events: HostTrayBalloonEventsCapability {
            provider: provider.clone(),
            get_signal: Arc::new(move |tray: &Ref<TrayIcon>| {
                signal_for(&s10.lock().unwrap().balloon_events, tray)
            }),
        },
        bounds: HostTrayBoundsCapability {
            provider: provider.clone(),
            get: Arc::new(|_tray: &Ref<TrayIcon>| {
                return ok(TrayBoundsResult::Available(TrayBoundsReading {
                    bounds: create_rectangle(3.0, 4.0, 1.0, 2.0),
                }));
            }),
        },
        double_click_policy: HostTrayDoubleClickPolicyCapability {
            provider: provider.clone(),
            set_ignore: Arc::new(|_tray: &Ref<TrayIcon>, _ignore: bool| {
                return ok(TrayDoubleClickPolicyUpdateResult::Updated);
            }),
        },
        drop_events: HostTrayDropEventsCapability {
            provider: provider.clone(),
            get_signal: Arc::new(move |tray: &Ref<TrayIcon>| {
                signal_for(&s11.lock().unwrap().drop_events, tray)
            }),
        },
        image: HostTrayImageCapability {
            provider: provider.clone(),
            set: Arc::new(move |_tray: &Ref<TrayIcon>, icon: &str| {
                s5.lock().unwrap().images.push(icon.to_string());
                return ok(TrayImageUpdateResult::Updated);
            }),
        },
        interaction_events: HostTrayInteractionEventsCapability {
            provider: provider.clone(),
            get_signal: Arc::new(move |tray: &Ref<TrayIcon>| {
                return signal_for(&s12.lock().unwrap().interaction_events, tray);
            }),
        },
        lifecycle,
        menu: HostTrayMenuCapability {
            provider: provider.clone(),
            set: Arc::new(|_tray: &Ref<TrayIcon>, _items: &[Ref<MenuItemTemplate>]| {
                return ok(TrayMenuUpdateResult::Updated);
            }),
        },
        menu_selection_events: HostTrayMenuSelectionEventsCapability {
            provider: provider.clone(),
            get_signal: Arc::new(move |tray: &Ref<TrayIcon>| {
                return signal_for(&s13.lock().unwrap().menu_selection_events, tray);
            }),
        },
        popup_menu: HostTrayPopupMenuCapability {
            provider: provider.clone(),
            popup: Arc::new(
                |_tray: &Ref<TrayIcon>, _position: Option<&flight_geometry::Vector2>| {
                    return ok(TrayPopupMenuResult::Shown);
                },
            ),
        },
        pressed_image: HostTrayPressedImageCapability {
            provider: provider.clone(),
            set: Arc::new(|_tray: &Ref<TrayIcon>, _icon: &str| {
                ok(TrayPressedImageUpdateResult::Updated)
            }),
        },
        template_image: HostTrayTemplateImageCapability {
            provider: provider.clone(),
            set: Arc::new(|_tray: &Ref<TrayIcon>, _is_template: bool| {
                return ok(TrayTemplateImageUpdateResult::Updated);
            }),
        },
        title: HostTrayTitleCapability {
            provider: provider.clone(),
            get: Arc::new(move |_tray: &Ref<TrayIcon>| {
                return ok(TrayTitleReadResult::Available(TrayTitleReading {
                    title: s6.lock().unwrap().title.clone(),
                }));
            }),
            set: Arc::new(move |_tray: &Ref<TrayIcon>, title: &str| {
                s7.lock().unwrap().title = title.to_string();
                return ok(TrayTitleUpdateResult::Updated);
            }),
        },
        tooltip: HostTrayTooltipCapability {
            provider,
            get: Arc::new(move |_tray: &Ref<TrayIcon>| {
                return ok(TrayTooltipReadResult::Available(TrayTooltipReading {
                    tooltip: s8.lock().unwrap().tooltip.clone(),
                }));
            }),
            set: Arc::new(move |_tray: &Ref<TrayIcon>, tooltip: &str| {
                s9.lock().unwrap().tooltip = tooltip.to_string();
                return ok(TrayTooltipUpdateResult::Updated);
            }),
        },
    };
    return (host, state);
}

fn no_options() -> TrayIconOptions {
    return TrayIconOptions {
        icon: None,
        icon_template: None,
        signal: None,
        title: None,
        tooltip: None,
    };
}

fn acquire(host: &TestHost) -> Ref<TrayIcon> {
    let result = block_on(create_tray_icon(&host.lifecycle, &no_options()));
    let TrayCreateOutcome::Created(TrayCreated { tray }) = result.outcome else {
        panic!("not created: {:?}", result.outcome);
    };
    return tray;
}

fn unpublished_tray() -> Ref<TrayIcon> {
    return Arc::new(RwLock::new(allocate_entity()));
}

fn balloon(text: &str) -> TrayBalloonOptions {
    return TrayBalloonOptions {
        icon: None,
        icon_type: None,
        large_icon: None,
        no_sound: None,
        respect_quiet_time: None,
        text: text.to_string(),
        title: "Flight".to_string(),
    };
}

fn click() -> TrayInteractionEvent {
    return TrayInteractionEvent {
        alt_key: false,
        bounds: None,
        ctrl_key: false,
        meta_key: false,
        position: None,
        shift_key: false,
        type_: TrayInteractionType::Click,
    };
}

fn counter<E>() -> (SignalSlot<E>, Arc<Mutex<usize>>) {
    let calls = Arc::new(Mutex::new(0));
    let seen = calls.clone();
    let slot: SignalSlot<E> = Arc::new(move |_event: &E| *seen.lock().unwrap() += 1);
    return (slot, calls);
}

fn release(token: &TrayEventRelease) -> TrayReleaseResult {
    return block_on((token.release)());
}

type Spawned = Arc<Mutex<Vec<Pin<Box<dyn Future<Output = ()> + Send>>>>>;

/// A caller-owned animation clock plus a test spawner: spawned writes queue until `drain` drives
/// them to completion in spawn order, as a host executor would.
struct Animation {
    spawned: Spawned,
    state: TrayAnimationState,
    timers: Ref<SignalTimerState>,
}

fn animation() -> Animation {
    let spawned: Spawned = Arc::new(Mutex::new(Vec::new()));
    let queue = spawned.clone();
    let spawn = HostSpawnCapability {
        provider: Arc::new(()),
        spawn: Arc::new(move |future: Pin<Box<dyn Future<Output = ()> + Send>>| {
            queue.lock().unwrap().push(future);
        }),
    };
    let timers = Arc::new(RwLock::new(create_signal_timer_state()));
    return Animation {
        spawned,
        state: create_tray_animation_state(spawn, timers.clone()),
        timers,
    };
}

fn anim() -> TrayAnimationState {
    return animation().state;
}

fn drain(spawned: &Spawned) -> usize {
    let mut count = 0;
    loop {
        let next = {
            let mut queue = spawned.lock().unwrap();
            if queue.is_empty() {
                None
            } else {
                Some(queue.remove(0))
            }
        };
        let Some(future) = next else {
            return count;
        };
        block_on(future);
        count += 1;
    }
}

fn frames(names: &[&str]) -> Vec<String> {
    return names.iter().map(|name| name.to_string()).collect();
}

mod create_tray_animation_state {
    use super::*;

    #[test]
    fn starts_with_no_guard_installed() {
        let animation = animation();
        assert!(animation.state.guard.is_none());
        assert!(Arc::ptr_eq(&animation.state.timers, &animation.timers));
    }
}

mod create_tray_icon {
    use super::*;

    #[test]
    fn publishes_only_after_provider_acquisition() {
        let (host, state) = test_host();
        let pending = create_tray_icon(&host.lifecycle, &no_options());
        assert_eq!(state.lock().unwrap().live.len(), 1);
        let result = block_on(pending);
        let TrayCreateOutcome::Created(TrayCreated { tray }) = result.outcome else {
            panic!("not created");
        };
        assert!(Arc::ptr_eq(&tray, &state.lock().unwrap().live[0]));
        assert!(!is_tray_destroyed(&tray));
    }

    #[test]
    fn passes_the_provider_failure_through_without_publishing() {
        let (mut host, _state) = test_host();
        let seen: Arc<Mutex<Option<Ref<TrayIcon>>>> = Arc::new(Mutex::new(None));
        let keep = seen.clone();
        host.lifecycle.create =
            Arc::new(move |tray: &Ref<TrayIcon>, _options: &TrayIconOptions| {
                *keep.lock().unwrap() = Some(tray.clone());
                return ok(TrayCreateCapabilityResult::InvalidIcon(TrayFailure {
                    error: Some(Some(Arc::new("bad".to_string()))),
                }));
            });
        let result = block_on(create_tray_icon(&host.lifecycle, &no_options()));
        let TrayCreateOutcome::InvalidIcon(TrayFailure {
            error: Some(Some(error)),
        }) = result.outcome
        else {
            panic!("expected invalid-icon with error");
        };
        assert_eq!(error.downcast_ref::<String>().unwrap(), "bad");
        let tray = seen.lock().unwrap().clone().unwrap();
        assert!(!is_tray_destroyed(&tray));
        assert!(matches!(
            block_on(destroy_tray_icon(&tray)),
            TrayDestroyResult::AlreadyDestroyed
        ));
    }

    #[test]
    fn keeps_an_absent_error_distinct_from_null() {
        let (mut host, _state) = test_host();
        host.lifecycle.create = Arc::new(|_tray: &Ref<TrayIcon>, _options: &TrayIconOptions| {
            return ok(TrayCreateCapabilityResult::RuntimeApiUnavailable(
                TrayFailure { error: Some(None) },
            ));
        });
        let result = block_on(create_tray_icon(&host.lifecycle, &no_options()));
        assert!(matches!(
            result.outcome,
            TrayCreateOutcome::RuntimeApiUnavailable(TrayFailure { error: Some(None) })
        ));
        host.lifecycle.create = Arc::new(|_tray: &Ref<TrayIcon>, _options: &TrayIconOptions| {
            return ok(TrayCreateCapabilityResult::TrayCreateFailed(TrayFailure {
                error: None,
            }));
        });
        let result = block_on(create_tray_icon(&host.lifecycle, &no_options()));
        assert!(matches!(
            result.outcome,
            TrayCreateOutcome::TrayCreateFailed(TrayFailure { error: None })
        ));
    }

    #[test]
    fn maps_a_provider_rejection_to_tray_create_failed_with_its_error() {
        let (mut host, _state) = test_host();
        host.lifecycle.create =
            Arc::new(|_tray: &Ref<TrayIcon>, _options: &TrayIconOptions| rejected("denied"));
        let result = block_on(create_tray_icon(&host.lifecycle, &no_options()));
        let TrayCreateOutcome::TrayCreateFailed(TrayFailure {
            error: Some(Some(error)),
        }) = result.outcome
        else {
            panic!("expected tray-create-failed");
        };
        assert_eq!(
            error.downcast_ref::<FlightError>().unwrap().message,
            "denied"
        );
    }

    #[test]
    fn maps_a_synchronous_flight_error_throw_to_tray_create_failed() {
        let (mut host, _state) = test_host();
        host.lifecycle.create = Arc::new(|_tray: &Ref<TrayIcon>, _options: &TrayIconOptions| {
            std::panic::panic_any(FlightError {
                kind: FlightErrorKind::Error,
                message: "thrown".to_string(),
            });
        });
        let result = block_on(create_tray_icon(&host.lifecycle, &no_options()));
        let TrayCreateOutcome::TrayCreateFailed(TrayFailure {
            error: Some(Some(error)),
        }) = result.outcome
        else {
            panic!("expected tray-create-failed");
        };
        assert_eq!(
            error.downcast_ref::<FlightError>().unwrap().message,
            "thrown"
        );
    }

    #[test]
    fn retains_an_arbitrary_synchronous_throw_losslessly() {
        let (mut host, _state) = test_host();
        host.lifecycle.create = Arc::new(|_tray: &Ref<TrayIcon>, _options: &TrayIconOptions| {
            std::panic::panic_any("native".to_string());
        });
        let result = block_on(create_tray_icon(&host.lifecycle, &no_options()));
        let TrayCreateOutcome::TrayCreateFailed(TrayFailure {
            error: Some(Some(error)),
        }) = result.outcome
        else {
            panic!("expected tray-create-failed");
        };
        let caught = error.downcast_ref::<CaughtPanic>().expect("a caught panic");
        assert_eq!(
            get_caught_panic_payload(caught)
                .downcast_ref::<String>()
                .unwrap(),
            "native"
        );
    }

    #[test]
    fn reports_cancelled_without_an_error() {
        let (mut host, _state) = test_host();
        host.lifecycle.create = Arc::new(|_tray: &Ref<TrayIcon>, _options: &TrayIconOptions| {
            return ok(TrayCreateCapabilityResult::Cancelled);
        });
        let result = block_on(create_tray_icon(&host.lifecycle, &no_options()));
        assert!(matches!(result.outcome, TrayCreateOutcome::Cancelled));
    }
}

mod destroy_tray_icon {
    use super::*;

    #[test]
    fn retries_only_a_failed_native_release_and_is_idempotent_after_success() {
        let (host, state) = test_host();
        state.lock().unwrap().destroy_failures = 1;
        let tray = acquire(&host);
        assert!(matches!(
            block_on(destroy_tray_icon(&tray)),
            TrayDestroyResult::TrayDestroyFailed(..)
        ));
        assert!(is_tray_destroyed(&tray));
        assert!(matches!(
            block_on(destroy_tray_icon(&tray)),
            TrayDestroyResult::Destroyed
        ));
        assert!(matches!(
            block_on(destroy_tray_icon(&tray)),
            TrayDestroyResult::AlreadyDestroyed
        ));
        assert_eq!(state.lock().unwrap().destroy_calls, 2);
    }

    #[test]
    fn shares_one_settlement_between_concurrent_calls() {
        let (host, state) = test_host();
        let tray = acquire(&host);
        let first = destroy_tray_icon(&tray);
        let second = destroy_tray_icon(&tray);
        assert!(matches!(block_on(second), TrayDestroyResult::Destroyed));
        assert!(matches!(block_on(first), TrayDestroyResult::Destroyed));
        assert_eq!(state.lock().unwrap().destroy_calls, 1);
    }

    #[test]
    fn marks_the_tray_destroying_before_it_settles() {
        let (host, _state) = test_host();
        let tray = acquire(&host);
        let pending = destroy_tray_icon(&tray);
        assert!(is_tray_destroyed(&tray));
        assert!(matches!(
            block_on(set_tray_icon(&host.image, &tray, "late")),
            TrayImageUpdateResult::TrayDestroyed
        ));
        block_on(pending);
    }

    #[test]
    fn keeps_the_origin_lifecycle_provider() {
        let (mut host, _state) = test_host();
        let tray = acquire(&host);
        host.lifecycle.destroy = Arc::new(|_tray: &Ref<TrayIcon>| rejected("busy"));
        assert!(matches!(
            block_on(destroy_tray_icon(&tray)),
            TrayDestroyResult::Destroyed
        ));
    }

    #[test]
    fn maps_a_rejected_native_destroy_to_a_native_resource_failure() {
        let (mut host, _state) = test_host();
        host.lifecycle.destroy = Arc::new(|_tray: &Ref<TrayIcon>| rejected("busy"));
        let tray = acquire(&host);
        let TrayDestroyResult::TrayDestroyFailed(TrayDestroyFailures { failures }) =
            block_on(destroy_tray_icon(&tray))
        else {
            panic!("expected tray-destroy-failed");
        };
        assert_eq!(failures.len(), 1);
        let Some(Some(error)) = &failures[0].error else {
            panic!("expected the rejection error");
        };
        assert_eq!(error.downcast_ref::<FlightError>().unwrap().message, "busy");
        assert!(is_tray_destroyed(&tray));
    }

    #[test]
    fn releases_every_remaining_subscription_and_settles_their_tokens() {
        let (host, state) = test_host();
        let tray = acquire(&host);
        let (first, first_calls) = counter::<TrayInteractionEvent>();
        let (second, second_calls) = counter::<TrayInteractionEvent>();
        let TrayEventAttachResult::Attached(first_release) =
            on_tray_interaction(&host.interaction_events, &tray, first)
        else {
            panic!("not attached");
        };
        on_tray_interaction(&host.interaction_events, &tray, second);
        block_on(destroy_tray_icon(&tray));
        let signal = signal_for(&state.lock().unwrap().interaction_events, &tray).unwrap();
        emit_signal(&signal, &click());
        assert_eq!(*first_calls.lock().unwrap(), 0);
        assert_eq!(*second_calls.lock().unwrap(), 0);
        assert!(matches!(
            release(&first_release),
            TrayReleaseResult::AlreadyReleased
        ));
    }

    #[test]
    fn reports_already_destroyed_for_an_unpublished_tray() {
        assert!(matches!(
            block_on(destroy_tray_icon(&unpublished_tray())),
            TrayDestroyResult::AlreadyDestroyed
        ));
    }
}

mod display_tray_balloon {
    use super::*;

    #[test]
    fn owns_balloon_display_on_the_tray_entity() {
        let (host, _state) = test_host();
        let tray = acquire(&host);
        assert!(matches!(
            block_on(display_tray_balloon(&host.balloon, &tray, &balloon("Done"))),
            TrayBalloonDisplayResult::Displayed
        ));
    }

    #[test]
    fn maps_a_rejection_to_balloon_display_failed() {
        let (mut host, _state) = test_host();
        let tray = acquire(&host);
        host.balloon.display =
            Arc::new(|_tray: &Ref<TrayIcon>, _options: &TrayBalloonOptions| rejected("no"));
        assert!(matches!(
            block_on(display_tray_balloon(&host.balloon, &tray, &balloon("Done"))),
            TrayBalloonDisplayResult::BalloonDisplayFailed(TrayFailure {
                error: Some(Some(_))
            })
        ));
    }
}

mod get_desktop_os_profile_string {
    use super::*;

    #[test]
    fn returns_the_source_spelling() {
        assert_eq!(
            get_desktop_os_profile_string(DesktopOsProfile::MacOs),
            "macos"
        );
    }
}

mod get_tray_balloon_event_type_string {
    use super::*;

    #[test]
    fn returns_the_source_spelling() {
        assert_eq!(
            get_tray_balloon_event_type_string(TrayBalloonEventType::Show),
            "show"
        );
    }
}

mod get_tray_balloon_icon_type_string {
    use super::*;

    #[test]
    fn returns_the_source_spelling() {
        assert_eq!(
            get_tray_balloon_icon_type_string(TrayBalloonIconType::Warning),
            "warning"
        );
    }
}

mod get_tray_create_failure_outcome_string {
    use super::*;

    #[test]
    fn returns_the_source_spelling() {
        assert_eq!(
            get_tray_create_failure_outcome_string(TrayCreateFailureOutcome::RuntimeApiUnavailable),
            "runtime-api-unavailable"
        );
    }
}

mod get_tray_icon_bounds {
    use super::*;

    #[test]
    fn returns_provider_bounds() {
        let (host, _state) = test_host();
        let TrayBoundsResult::Available(TrayBoundsReading { bounds }) =
            block_on(get_tray_icon_bounds(&host.bounds, &acquire(&host)))
        else {
            panic!("expected bounds");
        };
        assert_eq!(bounds.width, 1.0);
    }
}

mod get_tray_icon_title {
    use super::*;

    #[test]
    fn reads_the_title() {
        let (host, _state) = test_host();
        let tray = acquire(&host);
        block_on(set_tray_icon_title(&host.title, &tray, "Flight"));
        let TrayTitleReadResult::Available(TrayTitleReading { title }) =
            block_on(get_tray_icon_title(&host.title, &tray))
        else {
            panic!("expected title");
        };
        assert_eq!(title, "Flight");
    }
}

mod get_tray_icon_tooltip {
    use super::*;

    #[test]
    fn reads_the_tooltip() {
        let (host, _state) = test_host();
        let tray = acquire(&host);
        block_on(set_tray_icon_tooltip(&host.tooltip, &tray, "Ready"));
        let TrayTooltipReadResult::Available(TrayTooltipReading { tooltip }) =
            block_on(get_tray_icon_tooltip(&host.tooltip, &tray))
        else {
            panic!("expected tooltip");
        };
        assert_eq!(tooltip, "Ready");
    }
}

mod get_tray_icons {
    use super::*;

    #[test]
    fn preserves_acquisition_order() {
        let (host, _state) = test_host();
        let first = acquire(&host);
        let second = acquire(&host);
        let icons = get_tray_icons(&host.lifecycle);
        assert_eq!(icons.len(), 2);
        assert!(Arc::ptr_eq(&icons[0], &first));
        assert!(Arc::ptr_eq(&icons[1], &second));
    }
}

mod get_tray_interaction_type_string {
    use super::*;

    #[test]
    fn returns_the_source_spelling() {
        assert_eq!(
            get_tray_interaction_type_string(TrayInteractionType::DoubleClick),
            "doubleClick"
        );
    }
}

mod initialize_tray_create_failed_result {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_the_failed_create_result() {
        let mut out: TrayCreateResult = allocate_entity();
        initialize_tray_create_failed_result(&mut out, Some(None));
        assert!(matches!(
            out.outcome,
            TrayCreateOutcome::TrayCreateFailed(TrayFailure { error: Some(None) })
        ));
    }
}

mod initialize_tray_create_provider_failure_result {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_the_provider_failure_result() {
        let mut out: TrayCreateResult = allocate_entity();
        initialize_tray_create_provider_failure_result(
            &mut out,
            None,
            TrayCreateFailureOutcome::InvalidIcon,
        );
        assert!(matches!(
            out.outcome,
            TrayCreateOutcome::InvalidIcon(TrayFailure { error: None })
        ));
    }
}

mod initialize_tray_create_success_result {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_the_success_result() {
        let tray = unpublished_tray();
        let mut out: TrayCreateResult = allocate_entity();
        initialize_tray_create_success_result(&mut out, tray.clone());
        let TrayCreateOutcome::Created(TrayCreated { tray: created }) = out.outcome else {
            panic!("expected created");
        };
        assert!(Arc::ptr_eq(&created, &tray));
    }
}

mod is_tray_destroyed {
    use super::*;

    #[test]
    fn does_not_treat_an_unknown_tray_as_destroyed() {
        assert!(!is_tray_destroyed(&unpublished_tray()));
    }

    #[test]
    fn tracks_the_pinned_lifecycle() {
        let (host, _state) = test_host();
        let tray = acquire(&host);
        assert!(!is_tray_destroyed(&tray));
        block_on(destroy_tray_icon(&tray));
        assert!(is_tray_destroyed(&tray));
    }

    #[test]
    fn asks_the_origin_provider_while_active() {
        let (host, state) = test_host();
        let tray = acquire(&host);
        state.lock().unwrap().destroyed.push(tray.clone());
        assert!(is_tray_destroyed(&tray));
    }
}

mod is_tray_icon_animating {
    use super::*;

    #[test]
    fn tracks_the_current_animation_generation() {
        let (host, _state) = test_host();
        let tray = acquire(&host);
        block_on(start_tray_icon_animation(
            &anim(),
            &host.image,
            &tray,
            &["a".to_string()],
            10.0,
        ));
        assert!(is_tray_icon_animating(&tray));
        stop_tray_icon_animation(&tray);
        assert!(!is_tray_icon_animating(&tray));
    }

    #[test]
    fn reports_true_for_an_unpublished_tray_as_the_source_does() {
        assert!(is_tray_icon_animating(&unpublished_tray()));
    }
}

mod on_tray_balloon_event {
    use super::*;

    #[test]
    fn delivers_balloon_lifecycle_independently() {
        let (host, state) = test_host();
        let tray = acquire(&host);
        let seen: Arc<Mutex<Vec<TrayBalloonEventType>>> = Arc::new(Mutex::new(Vec::new()));
        let keep = seen.clone();
        let listener: SignalSlot<TrayBalloonEvent> =
            Arc::new(move |event: &TrayBalloonEvent| keep.lock().unwrap().push(event.type_));
        assert!(matches!(
            on_tray_balloon_event(&host.balloon_events, &tray, listener),
            TrayEventAttachResult::Attached(..)
        ));
        let signal = signal_for(&state.lock().unwrap().balloon_events, &tray).unwrap();
        emit_signal(
            &signal,
            &TrayBalloonEvent {
                type_: TrayBalloonEventType::Show,
            },
        );
        assert_eq!(*seen.lock().unwrap(), vec![TrayBalloonEventType::Show]);
    }
}

mod on_tray_drop {
    use super::*;

    #[test]
    fn delivers_drop_data_independently() {
        let (host, state) = test_host();
        let tray = acquire(&host);
        let seen: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
        let keep = seen.clone();
        let listener: SignalSlot<TrayDropEvent> = Arc::new(move |event: &TrayDropEvent| {
            if let TrayDropEvent::Files(TrayDropFiles { files }) = event {
                keep.lock().unwrap().extend(files.iter().cloned());
            }
        });
        assert!(matches!(
            on_tray_drop(&host.drop_events, &tray, listener),
            TrayEventAttachResult::Attached(..)
        ));
        let signal = signal_for(&state.lock().unwrap().drop_events, &tray).unwrap();
        emit_signal(
            &signal,
            &TrayDropEvent::Files(TrayDropFiles {
                files: vec!["a".to_string()],
            }),
        );
        assert_eq!(*seen.lock().unwrap(), vec!["a".to_string()]);
    }
}

mod on_tray_interaction {
    use super::*;

    #[test]
    fn releases_once_and_destroy_releases_a_remaining_subscription() {
        let (host, state) = test_host();
        let tray = acquire(&host);
        let (listener, calls) = counter::<TrayInteractionEvent>();
        let TrayEventAttachResult::Attached(token) =
            on_tray_interaction(&host.interaction_events, &tray, listener)
        else {
            panic!("not attached");
        };
        let signal = signal_for(&state.lock().unwrap().interaction_events, &tray).unwrap();
        emit_signal(&signal, &click());
        assert_eq!(*calls.lock().unwrap(), 1);
        assert!(matches!(release(&token), TrayReleaseResult::Released));
        assert!(matches!(
            release(&token.clone()),
            TrayReleaseResult::AlreadyReleased
        ));
        let (destroy_released, destroy_calls) = counter::<TrayInteractionEvent>();
        on_tray_interaction(&host.interaction_events, &tray, destroy_released);
        block_on(destroy_tray_icon(&tray));
        emit_signal(&signal, &click());
        assert_eq!(*destroy_calls.lock().unwrap(), 0);
        assert_eq!(*calls.lock().unwrap(), 1);
    }

    #[test]
    fn reports_tray_destroyed_for_a_null_signal_or_inactive_tray() {
        let (mut host, _state) = test_host();
        let tray = acquire(&host);
        let (listener, _calls) = counter::<TrayInteractionEvent>();
        assert!(matches!(
            on_tray_interaction(
                &host.interaction_events,
                &unpublished_tray(),
                listener.clone()
            ),
            TrayEventAttachResult::TrayDestroyed
        ));
        host.interaction_events.get_signal = Arc::new(|_tray: &Ref<TrayIcon>| None);
        assert!(matches!(
            on_tray_interaction(&host.interaction_events, &tray, listener),
            TrayEventAttachResult::TrayDestroyed
        ));
    }

    #[test]
    fn maps_a_synchronous_get_signal_throw_to_subscription_failed() {
        let (mut host, _state) = test_host();
        let tray = acquire(&host);
        host.interaction_events.get_signal = Arc::new(|_tray: &Ref<TrayIcon>| panic!("detached"));
        let (listener, _calls) = counter::<TrayInteractionEvent>();
        let TrayEventAttachResult::SubscriptionFailed(TrayFailure {
            error: Some(Some(error)),
        }) = on_tray_interaction(&host.interaction_events, &tray, listener)
        else {
            panic!("expected subscription-failed");
        };
        let caught = error.downcast_ref::<CaughtPanic>().expect("a caught panic");
        assert_eq!(
            *get_caught_panic_payload(caught)
                .downcast_ref::<&'static str>()
                .unwrap(),
            "detached"
        );
    }

    #[test]
    fn retains_an_arbitrary_thrown_payload_losslessly() {
        let (mut host, _state) = test_host();
        let tray = acquire(&host);
        host.interaction_events.get_signal =
            Arc::new(|_tray: &Ref<TrayIcon>| std::panic::panic_any(7_u8));
        let (listener, _calls) = counter::<TrayInteractionEvent>();
        let TrayEventAttachResult::SubscriptionFailed(TrayFailure {
            error: Some(Some(error)),
        }) = on_tray_interaction(&host.interaction_events, &tray, listener)
        else {
            panic!("expected subscription-failed");
        };
        let caught = error.downcast_ref::<CaughtPanic>().expect("a caught panic");
        assert_eq!(
            *get_caught_panic_payload(caught)
                .downcast_ref::<u8>()
                .unwrap(),
            7
        );
    }

    #[test]
    fn keeps_a_thrown_flight_error_as_itself() {
        let (mut host, _state) = test_host();
        let tray = acquire(&host);
        host.interaction_events.get_signal = Arc::new(|_tray: &Ref<TrayIcon>| {
            std::panic::panic_any(FlightError {
                kind: FlightErrorKind::TypeError,
                message: "gone".to_string(),
            })
        });
        let (listener, _calls) = counter::<TrayInteractionEvent>();
        let TrayEventAttachResult::SubscriptionFailed(TrayFailure {
            error: Some(Some(error)),
        }) = on_tray_interaction(&host.interaction_events, &tray, listener)
        else {
            panic!("expected subscription-failed");
        };
        assert_eq!(
            error.downcast_ref::<FlightError>().unwrap().kind,
            FlightErrorKind::TypeError
        );
    }
}

mod on_tray_menu_selection {
    use super::*;

    #[test]
    fn delivers_a_per_tray_menu_id() {
        let (host, state) = test_host();
        let tray = acquire(&host);
        let seen: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
        let keep = seen.clone();
        let listener: SignalSlot<TrayMenuSelectionEvent> =
            Arc::new(move |event: &TrayMenuSelectionEvent| {
                keep.lock().unwrap().push(event.id.clone())
            });
        assert!(matches!(
            on_tray_menu_selection(&host.menu_selection_events, &tray, listener),
            TrayEventAttachResult::Attached(..)
        ));
        let signal = signal_for(&state.lock().unwrap().menu_selection_events, &tray).unwrap();
        emit_signal(
            &signal,
            &TrayMenuSelectionEvent {
                id: "open".to_string(),
            },
        );
        assert_eq!(*seen.lock().unwrap(), vec!["open".to_string()]);
    }
}

mod parse_desktop_os_profile {
    use super::*;

    #[test]
    fn round_trips_the_source_spelling() {
        assert_eq!(
            parse_desktop_os_profile("windows"),
            Some(DesktopOsProfile::Windows)
        );
        assert_eq!(parse_desktop_os_profile("Windows"), None);
    }
}

mod parse_tray_balloon_event_type {
    use super::*;

    #[test]
    fn round_trips_the_source_spelling() {
        assert_eq!(
            parse_tray_balloon_event_type("close"),
            Some(TrayBalloonEventType::Close)
        );
        assert_eq!(parse_tray_balloon_event_type("hide"), None);
    }
}

mod parse_tray_balloon_icon_type {
    use super::*;

    #[test]
    fn round_trips_the_source_spelling() {
        assert_eq!(
            parse_tray_balloon_icon_type("none"),
            Some(TrayBalloonIconType::None)
        );
        assert_eq!(parse_tray_balloon_icon_type("fatal"), None);
    }
}

mod parse_tray_create_failure_outcome {
    use super::*;

    #[test]
    fn round_trips_the_source_spelling() {
        assert_eq!(
            parse_tray_create_failure_outcome("cancelled"),
            Some(TrayCreateFailureOutcome::Cancelled)
        );
        assert_eq!(parse_tray_create_failure_outcome("created"), None);
    }
}

mod parse_tray_interaction_type {
    use super::*;

    #[test]
    fn round_trips_the_source_spelling() {
        assert_eq!(
            parse_tray_interaction_type("rightClick"),
            Some(TrayInteractionType::RightClick)
        );
        assert_eq!(parse_tray_interaction_type("right-click"), None);
    }
}

mod popup_tray_context_menu {
    use super::*;

    #[test]
    fn shows_the_installed_menu() {
        let (host, _state) = test_host();
        let position = create_vector2(1.0, 2.0);
        assert!(matches!(
            block_on(popup_tray_context_menu(
                &host.popup_menu,
                &acquire(&host),
                Some(&position)
            )),
            TrayPopupMenuResult::Shown
        ));
    }
}

mod remove_tray_balloon {
    use super::*;

    #[test]
    fn owns_balloon_removal_on_the_tray_entity() {
        let (host, _state) = test_host();
        let tray = acquire(&host);
        block_on(display_tray_balloon(&host.balloon, &tray, &balloon("Done")));
        assert!(matches!(
            block_on(remove_tray_balloon(&host.balloon, &tray)),
            TrayBalloonRemoveResult::Removed
        ));
    }
}

mod set_tray_animation_guard {
    use super::*;

    #[test]
    fn installs_and_clears_the_opt_in_animation_inspection_hook() {
        let seen: Arc<Mutex<Vec<(bool, i32, f64)>>> = Arc::new(Mutex::new(Vec::new()));
        let (host, _state) = test_host();
        let tray = acquire(&host);
        let keep = seen.clone();
        let expected = tray.clone();
        let mut state = anim();
        set_tray_animation_guard(
            &mut state,
            Some(Arc::new(
                move |tray: &Ref<TrayIcon>, frames: i32, interval_ms: f64| {
                    keep.lock()
                        .unwrap()
                        .push((Arc::ptr_eq(tray, &expected), frames, interval_ms));
                },
            )),
        );
        let started = block_on(start_tray_icon_animation(
            &state,
            &host.image,
            &tray,
            &["a".to_string()],
            12.0,
        ));
        assert_eq!(*seen.lock().unwrap(), vec![(true, 1, 12.0)]);
        if let TrayAnimationStartResult::Started(token) = started {
            release(&token);
        }
        set_tray_animation_guard(&mut state, None);
        assert!(state.guard.is_none());
    }
}

mod set_tray_icon {
    use super::*;

    #[test]
    fn uses_the_direct_image_provider() {
        let (host, state) = test_host();
        assert!(matches!(
            block_on(set_tray_icon(&host.image, &acquire(&host), "icon")),
            TrayImageUpdateResult::Updated
        ));
        assert_eq!(state.lock().unwrap().images, vec!["icon".to_string()]);
    }

    #[test]
    fn reports_tray_destroyed_without_calling_the_provider() {
        let (host, state) = test_host();
        let tray = acquire(&host);
        block_on(destroy_tray_icon(&tray));
        assert!(matches!(
            block_on(set_tray_icon(&host.image, &tray, "icon")),
            TrayImageUpdateResult::TrayDestroyed
        ));
        assert!(state.lock().unwrap().images.is_empty());
    }

    #[test]
    fn maps_a_synchronous_provider_throw_to_image_update_failed() {
        let (mut host, _state) = test_host();
        let tray = acquire(&host);
        host.image.set =
            Arc::new(|_tray: &Ref<TrayIcon>, _icon: &str| std::panic::panic_any(3_i32));
        let TrayImageUpdateResult::ImageUpdateFailed(TrayFailure {
            error: Some(Some(error)),
        }) = block_on(set_tray_icon(&host.image, &tray, "icon"))
        else {
            panic!("expected image-update-failed");
        };
        let caught = error.downcast_ref::<CaughtPanic>().expect("a caught panic");
        assert_eq!(
            *get_caught_panic_payload(caught)
                .downcast_ref::<i32>()
                .unwrap(),
            3
        );
    }

    #[test]
    fn maps_a_rejection_to_image_update_failed() {
        let (mut host, _state) = test_host();
        let tray = acquire(&host);
        host.image.set = Arc::new(|_tray: &Ref<TrayIcon>, _icon: &str| rejected("decode"));
        assert!(matches!(
            block_on(set_tray_icon(&host.image, &tray, "icon")),
            TrayImageUpdateResult::ImageUpdateFailed(TrayFailure {
                error: Some(Some(_))
            })
        ));
    }
}

mod set_tray_icon_context_menu {
    use super::*;

    #[test]
    fn installs_a_plain_descriptor_by_identity() {
        let (mut host, _state) = test_host();
        let item: Ref<MenuItemTemplate> = Arc::new(RwLock::new(MenuItemTemplate {
            id: Some("quit".to_string()),
            label: Some("Quit".to_string()),
            type_: None,
            role: None,
            accelerator: None,
            enabled: None,
            checked: None,
            visible: None,
            sublabel: None,
            tool_tip: None,
            submenu: None,
        }));
        let seen: Arc<Mutex<Vec<Ref<MenuItemTemplate>>>> = Arc::new(Mutex::new(Vec::new()));
        let keep = seen.clone();
        host.menu.set = Arc::new(
            move |_tray: &Ref<TrayIcon>, items: &[Ref<MenuItemTemplate>]| {
                keep.lock().unwrap().extend(items.iter().cloned());
                return ok(TrayMenuUpdateResult::Updated);
            },
        );
        assert!(matches!(
            block_on(set_tray_icon_context_menu(
                &host.menu,
                &acquire(&host),
                &[item.clone()]
            )),
            TrayMenuUpdateResult::Updated
        ));
        assert!(Arc::ptr_eq(&seen.lock().unwrap()[0], &item));
    }
}

mod set_tray_icon_template {
    use super::*;

    #[test]
    fn updates_template_treatment() {
        let (host, _state) = test_host();
        assert!(matches!(
            block_on(set_tray_icon_template(
                &host.template_image,
                &acquire(&host),
                true
            )),
            TrayTemplateImageUpdateResult::Updated
        ));
    }
}

mod set_tray_icon_title {
    use super::*;

    #[test]
    fn updates_the_title() {
        let (host, _state) = test_host();
        let tray = acquire(&host);
        assert!(matches!(
            block_on(set_tray_icon_title(&host.title, &tray, "Flight")),
            TrayTitleUpdateResult::Updated
        ));
    }
}

mod set_tray_icon_tooltip {
    use super::*;

    #[test]
    fn updates_the_tooltip() {
        let (host, _state) = test_host();
        let tray = acquire(&host);
        assert!(matches!(
            block_on(set_tray_icon_tooltip(&host.tooltip, &tray, "Ready")),
            TrayTooltipUpdateResult::Updated
        ));
    }
}

mod set_tray_ignore_double_click_events {
    use super::*;

    #[test]
    fn updates_the_policy() {
        let (host, _state) = test_host();
        assert!(matches!(
            block_on(set_tray_ignore_double_click_events(
                &host.double_click_policy,
                &acquire(&host),
                true
            )),
            TrayDoubleClickPolicyUpdateResult::Updated
        ));
    }
}

mod set_tray_pressed_icon {
    use super::*;

    #[test]
    fn updates_the_pressed_icon() {
        let (host, _state) = test_host();
        assert!(matches!(
            block_on(set_tray_pressed_icon(
                &host.pressed_image,
                &acquire(&host),
                "pressed"
            )),
            TrayPressedImageUpdateResult::Updated
        ));
    }
}

mod start_tray_icon_animation {
    use super::*;

    #[test]
    fn writes_through_the_direct_image_provider() {
        let (host, state) = test_host();
        let tray = acquire(&host);
        let animation = animation();
        let result = block_on(start_tray_icon_animation(
            &animation.state,
            &host.image,
            &tray,
            &frames(&["a", "b"]),
            10.0,
        ));
        let TrayAnimationStartResult::Started(token) = result else {
            panic!("not started");
        };
        advance_signal_timers(&animation.timers, 10.0);
        drain(&animation.spawned);
        assert_eq!(state.lock().unwrap().images, frames(&["a", "b"]));
        release(&token);
    }

    #[test]
    fn cycles_frames_one_spawned_serialized_write_per_tick() {
        let (host, state) = test_host();
        let tray = acquire(&host);
        let animation = animation();
        block_on(start_tray_icon_animation(
            &animation.state,
            &host.image,
            &tray,
            &frames(&["a", "b", "c"]),
            10.0,
        ));
        advance_signal_timers(&animation.timers, 9.0);
        assert_eq!(animation.spawned.lock().unwrap().len(), 0);
        advance_signal_timers(&animation.timers, 30.0);
        assert_eq!(animation.spawned.lock().unwrap().len(), 3);
        assert!(is_tray_icon_animating(&tray));
        assert_eq!(drain(&animation.spawned), 3);
        assert_eq!(state.lock().unwrap().images, frames(&["a", "b", "c", "a"]));
    }

    #[test]
    fn serializes_tick_writes_behind_a_pending_write() {
        let (host, state) = test_host();
        let tray = acquire(&host);
        let animation = animation();
        block_on(start_tray_icon_animation(
            &animation.state,
            &host.image,
            &tray,
            &frames(&["a", "b", "c"]),
            10.0,
        ));
        advance_signal_timers(&animation.timers, 20.0);
        // Drive the later write first: the chain still runs the earlier frame before it.
        let mut queued: Vec<_> = animation.spawned.lock().unwrap().drain(..).collect();
        let later = queued.pop().unwrap();
        let earlier = queued.pop().unwrap();
        block_on(later);
        assert_eq!(state.lock().unwrap().images, frames(&["a", "b", "c"]));
        block_on(earlier);
        assert_eq!(state.lock().unwrap().images, frames(&["a", "b", "c"]));
    }

    #[test]
    fn skips_a_queued_write_of_a_stale_generation() {
        let (host, state) = test_host();
        let tray = acquire(&host);
        let animation = animation();
        block_on(start_tray_icon_animation(
            &animation.state,
            &host.image,
            &tray,
            &frames(&["a", "b"]),
            10.0,
        ));
        advance_signal_timers(&animation.timers, 10.0);
        assert!(matches!(
            stop_tray_icon_animation(&tray),
            TrayAnimationStopResult::Stopped
        ));
        assert_eq!(drain(&animation.spawned), 1);
        assert_eq!(state.lock().unwrap().images, frames(&["a"]));
    }

    #[test]
    fn stop_release_and_destroy_clear_the_pending_tick() {
        let (host, state) = test_host();
        let animation = animation();
        let stopped = acquire(&host);
        block_on(start_tray_icon_animation(
            &animation.state,
            &host.image,
            &stopped,
            &frames(&["a", "b"]),
            10.0,
        ));
        stop_tray_icon_animation(&stopped);
        let released = acquire(&host);
        let TrayAnimationStartResult::Started(token) = block_on(start_tray_icon_animation(
            &animation.state,
            &host.image,
            &released,
            &frames(&["c", "d"]),
            10.0,
        )) else {
            panic!("not started");
        };
        release(&token);
        let destroyed = acquire(&host);
        block_on(start_tray_icon_animation(
            &animation.state,
            &host.image,
            &destroyed,
            &frames(&["e", "f"]),
            10.0,
        ));
        block_on(destroy_tray_icon(&destroyed));
        assert!(animation.timers.read().unwrap().timers.is_empty());
        advance_signal_timers(&animation.timers, 100.0);
        assert_eq!(drain(&animation.spawned), 0);
        assert_eq!(state.lock().unwrap().images, frames(&["a", "c", "e"]));
    }

    #[test]
    fn restarting_replaces_the_previous_interval() {
        let (host, state) = test_host();
        let tray = acquire(&host);
        let animation = animation();
        block_on(start_tray_icon_animation(
            &animation.state,
            &host.image,
            &tray,
            &frames(&["a", "b"]),
            10.0,
        ));
        block_on(start_tray_icon_animation(
            &animation.state,
            &host.image,
            &tray,
            &frames(&["x", "y"]),
            10.0,
        ));
        assert_eq!(animation.timers.read().unwrap().timers.len(), 1);
        advance_signal_timers(&animation.timers, 10.0);
        drain(&animation.spawned);
        assert_eq!(state.lock().unwrap().images, frames(&["a", "x", "y"]));
    }

    #[test]
    fn repeats_a_non_positive_or_nan_interval_every_millisecond() {
        for interval in [0.0, -5.0, f64::NAN] {
            let (host, state) = test_host();
            let tray = acquire(&host);
            let animation = animation();
            block_on(start_tray_icon_animation(
                &animation.state,
                &host.image,
                &tray,
                &frames(&["a", "b"]),
                interval,
            ));
            advance_signal_timers(&animation.timers, 3.0);
            assert_eq!(drain(&animation.spawned), 3);
            assert_eq!(state.lock().unwrap().images, frames(&["a", "b", "a", "b"]));
        }
    }

    #[test]
    fn reports_empty_before_checking_the_tray() {
        let (host, _state) = test_host();
        assert!(matches!(
            block_on(start_tray_icon_animation(
                &anim(),
                &host.image,
                &unpublished_tray(),
                &[],
                10.0
            )),
            TrayAnimationStartResult::Empty
        ));
    }

    #[test]
    fn returns_a_first_frame_failure() {
        let (mut host, _state) = test_host();
        let tray = acquire(&host);
        host.image.set = Arc::new(|_tray: &Ref<TrayIcon>, _icon: &str| {
            return ok(TrayImageUpdateResult::InvalidIcon(TrayFailure {
                error: None,
            }));
        });
        assert!(matches!(
            block_on(start_tray_icon_animation(
                &anim(),
                &host.image,
                &tray,
                &["a".to_string()],
                10.0
            )),
            TrayAnimationStartResult::InvalidIcon(TrayFailure { error: None })
        ));
        assert!(!is_tray_icon_animating(&tray));
    }

    #[test]
    fn a_superseded_start_reports_tray_destroyed_and_its_release_leaves_the_new_generation() {
        let (host, state) = test_host();
        let tray = acquire(&host);
        let first =
            start_tray_icon_animation(&anim(), &host.image, &tray, &["a".to_string()], 10.0);
        let second =
            start_tray_icon_animation(&anim(), &host.image, &tray, &["b".to_string()], 10.0);
        assert!(matches!(
            block_on(first),
            TrayAnimationStartResult::TrayDestroyed
        ));
        let TrayAnimationStartResult::Started(token) = block_on(second) else {
            panic!("not started");
        };
        // The superseded first write is skipped by the generation guard; writes stay serialized.
        assert_eq!(state.lock().unwrap().images, vec!["b".to_string()]);
        assert!(is_tray_icon_animating(&tray));
        release(&token);
        assert!(!is_tray_icon_animating(&tray));
    }

    #[test]
    fn destroy_stops_the_animation() {
        let (host, _state) = test_host();
        let tray = acquire(&host);
        block_on(start_tray_icon_animation(
            &anim(),
            &host.image,
            &tray,
            &["a".to_string()],
            10.0,
        ));
        block_on(destroy_tray_icon(&tray));
        assert!(!is_tray_icon_animating(&tray));
    }
}

mod stop_tray_icon_animation {
    use super::*;

    #[test]
    fn stops_only_the_current_generation() {
        let (host, _state) = test_host();
        let tray = acquire(&host);
        block_on(start_tray_icon_animation(
            &anim(),
            &host.image,
            &tray,
            &["a".to_string()],
            10.0,
        ));
        assert!(matches!(
            stop_tray_icon_animation(&tray),
            TrayAnimationStopResult::Stopped
        ));
        assert!(matches!(
            stop_tray_icon_animation(&tray),
            TrayAnimationStopResult::AlreadyStopped
        ));
    }
}
