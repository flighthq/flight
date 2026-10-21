use std::sync::{Arc, Mutex};

use flight_power::*;
use flight_signals::connect_signal;

fn status_host(
    is_charging: bool,
) -> (
    HostPowerStatusCapability,
    HostPowerChangeCapability,
    Arc<dyn Fn() + Send + Sync>,
) {
    let listeners: Arc<Mutex<Vec<PowerChangeListener>>> = Arc::new(Mutex::new(Vec::new()));
    let charging = Arc::new(Mutex::new(is_charging));
    let charging_for_status = charging.clone();
    let status_cap = HostPowerStatusCapability {
        get_status: Arc::new(move |out: &mut PowerStatus| {
            out.is_charging = *charging_for_status.lock().unwrap();
            return out.clone();
        }),
    };
    let listeners_for_subscribe = listeners.clone();
    let change_cap = HostPowerChangeCapability {
        subscribe: Arc::new(move |listener: PowerChangeListener| {
            listeners_for_subscribe.lock().unwrap().push(listener.clone());
            let listeners_for_unsub = listeners_for_subscribe.clone();
            let listener_for_unsub = listener;
            return Arc::new(move || {
                let mut guard = listeners_for_unsub.lock().unwrap();
                guard.retain(|l| !Arc::ptr_eq(l, &listener_for_unsub));
            });
        }),
    };
    let listeners_for_emit = listeners.clone();
    let emit = Arc::new(move || {
        let guard = listeners_for_emit.lock().unwrap();
        for l in guard.iter() {
            l();
        }
    });
    return (status_cap, change_cap, emit);
}

fn charging_host() -> (
    HostPowerStatusCapability,
    HostPowerChangeCapability,
    Arc<Mutex<bool>>,
    Arc<dyn Fn() + Send + Sync>,
) {
    let listeners: Arc<Mutex<Vec<PowerChangeListener>>> = Arc::new(Mutex::new(Vec::new()));
    let charging = Arc::new(Mutex::new(false));
    let charging_for_status = charging.clone();
    let status_cap = HostPowerStatusCapability {
        get_status: Arc::new(move |out: &mut PowerStatus| {
            out.is_charging = *charging_for_status.lock().unwrap();
            return out.clone();
        }),
    };
    let listeners_for_subscribe = listeners.clone();
    let change_cap = HostPowerChangeCapability {
        subscribe: Arc::new(move |listener: PowerChangeListener| {
            listeners_for_subscribe.lock().unwrap().push(listener.clone());
            let listeners_for_unsub = listeners_for_subscribe.clone();
            let listener_for_unsub = listener;
            return Arc::new(move || {
                let mut guard = listeners_for_unsub.lock().unwrap();
                guard.retain(|l| !Arc::ptr_eq(l, &listener_for_unsub));
            });
        }),
    };
    let listeners_for_emit = listeners.clone();
    let emit = Arc::new(move || {
        let guard = listeners_for_emit.lock().unwrap();
        for l in guard.iter() {
            l();
        }
    });
    return (status_cap, change_cap, charging, emit);
}

fn make_provider() -> ProviderRef {
    return Arc::new(()) as ProviderRef;
}

fn make_keep_awake_cap(
    overrides: Option<KeepAwakeOverrides>,
) -> HostPowerKeepAwakeCapability {
    let o = overrides.unwrap_or_else(|| KeepAwakeOverrides {
        acquire: None,
        destroy: None,
        is_active: None,
        provider: None,
        release: None,
    });
    return HostPowerKeepAwakeCapability {
        acquire: o.acquire.unwrap_or_else(|| Arc::new(|_| {
            Box::pin(async { PowerKeepAwakeAcquireResult { reason: PowerKeepAwakeAcquireReason::Ok } })
        })),
        destroy: o.destroy,
        is_active: o.is_active.unwrap_or_else(|| Arc::new(|| false)),
        provider: o.provider.unwrap_or_else(make_provider),
        release: o.release.unwrap_or_else(|| Arc::new(|| {
            Box::pin(async { PowerKeepAwakeReleaseResult { reason: PowerKeepAwakeReleaseReason::Ok } })
        })),
    };
}

struct KeepAwakeOverrides {
    acquire: Option<Arc<dyn Fn(PowerKeepAwakeMode) -> PowerKeepAwakeAcquireFuture + Send + Sync>>,
    destroy: Option<Arc<dyn Fn() + Send + Sync>>,
    is_active: Option<Arc<dyn Fn() -> bool + Send + Sync>>,
    provider: Option<ProviderRef>,
    release: Option<Arc<dyn Fn() -> PowerKeepAwakeReleaseFuture + Send + Sync>>,
}

mod acquire_power_keep_awake {
    use super::*;

    #[test]
    fn forwards_the_mode_and_resolves_the_provider_outcome() {
        let seen = Arc::new(Mutex::new(PowerKeepAwakeMode::PreventDisplaySleep));
        let seen_for_cap = seen.clone();
        let cap = make_keep_awake_cap(Some(KeepAwakeOverrides {
            acquire: Some(Arc::new(move |mode| {
                *seen_for_cap.lock().unwrap() = mode;
                Box::pin(async { PowerKeepAwakeAcquireResult { reason: PowerKeepAwakeAcquireReason::Denied } })
            })),
            destroy: None, is_active: None, provider: None, release: None,
        }));
        let result = crate::block_on(flight_power::acquire_power_keep_awake(&cap, Some(PowerKeepAwakeMode::PreventAppSuspension)));
        assert_eq!(result.reason, PowerKeepAwakeAcquireReason::Denied);
        assert_eq!(*seen.lock().unwrap(), PowerKeepAwakeMode::PreventAppSuspension);
    }

    #[test]
    fn defaults_to_prevent_display_sleep() {
        let seen = Arc::new(Mutex::new(PowerKeepAwakeMode::PreventAppSuspension));
        let seen_for_cap = seen.clone();
        let cap = make_keep_awake_cap(Some(KeepAwakeOverrides {
            acquire: Some(Arc::new(move |mode| {
                *seen_for_cap.lock().unwrap() = mode;
                Box::pin(async { PowerKeepAwakeAcquireResult { reason: PowerKeepAwakeAcquireReason::Ok } })
            })),
            destroy: None, is_active: None, provider: None, release: None,
        }));
        crate::block_on(flight_power::acquire_power_keep_awake(&cap, None));
        assert_eq!(*seen.lock().unwrap(), PowerKeepAwakeMode::PreventDisplaySleep);
    }
}

mod attach_power {
    use super::*;

    #[test]
    fn emits_a_fresh_status_per_event_never_one_shared_buffer() {
        let (status_cap, change_cap, emit) = status_host(false);
        let mut power = create_power();
        enable_power_signals(&mut power);
        let seen: Arc<Mutex<Vec<PowerStatus>>> = Arc::new(Mutex::new(Vec::new()));
        let seen_for_slot = seen.clone();
        connect_signal(
            power.on_change.as_ref().unwrap(),
            Arc::new(move |status: &PowerStatus| {
                seen_for_slot.lock().unwrap().push(status.clone());
            }),
            None,
        );
        flight_power::attach_power(
            Some(&status_cap), Some(&change_cap),
            None, None, None, None,
            &mut power, None,
        );
        emit();
        emit();
        let guard = seen.lock().unwrap();
        assert_eq!(guard.len(), 2);
    }

    #[test]
    fn derives_charging_transitions_from_status_changes() {
        let (status_cap, change_cap, charging, emit) = charging_host();
        let mut power = create_power();
        enable_power_signals(&mut power);
        let charged = Arc::new(Mutex::new(0u32));
        let discharged = Arc::new(Mutex::new(0u32));
        let charged_for_slot = charged.clone();
        connect_signal(
            power.on_charging.as_ref().unwrap(),
            Arc::new(move |_: &()| {
                *charged_for_slot.lock().unwrap() += 1;
            }),
            None,
        );
        let discharged_for_slot = discharged.clone();
        connect_signal(
            power.on_discharging.as_ref().unwrap(),
            Arc::new(move |_: &()| {
                *discharged_for_slot.lock().unwrap() += 1;
            }),
            None,
        );
        flight_power::attach_power(
            Some(&status_cap), Some(&change_cap),
            None, None, None, None,
            &mut power, None,
        );
        *charging.lock().unwrap() = true;
        emit();
        *charging.lock().unwrap() = false;
        emit();
        assert_eq!(*charged.lock().unwrap(), 1);
        assert_eq!(*discharged.lock().unwrap(), 1);
    }

    #[test]
    fn delivers_the_thermal_state_as_the_event_payload() {
        let thermal_listeners: Arc<Mutex<Vec<PowerThermalListener>>> = Arc::new(Mutex::new(Vec::new()));
        let listeners_for_cap = thermal_listeners.clone();
        let thermal_cap = HostPowerThermalCapability {
            get_thermal_state: Arc::new(|| PowerThermalState::Serious),
            subscribe_thermal_state_change: Arc::new(move |listener: PowerThermalListener| {
                listeners_for_cap.lock().unwrap().push(listener.clone());
                let listeners_for_unsub = listeners_for_cap.clone();
                let listener_for_unsub = listener;
                return Arc::new(move || {
                    let mut guard = listeners_for_unsub.lock().unwrap();
                    guard.retain(|l| !Arc::ptr_eq(l, &listener_for_unsub));
                });
            }),
        };
        let mut power = create_power();
        enable_power_signals(&mut power);
        let seen: Arc<Mutex<Vec<PowerThermalState>>> = Arc::new(Mutex::new(Vec::new()));
        let seen_for_slot = seen.clone();
        connect_signal(
            power.on_thermal_state_change.as_ref().unwrap(),
            Arc::new(move |state: &PowerThermalState| {
                seen_for_slot.lock().unwrap().push(*state);
            }),
            None,
        );
        flight_power::attach_power(
            None, None, None, None,
            Some(&thermal_cap), None,
            &mut power, None,
        );
        let guard = thermal_listeners.lock().unwrap();
        for l in guard.iter() {
            l(PowerThermalState::Critical);
        }
        drop(guard);
        let result = seen.lock().unwrap();
        assert_eq!(result.as_slice(), &[PowerThermalState::Critical]);
    }

    #[test]
    fn re_attaching_replaces_its_own_subscription_rather_than_stacking() {
        let (status_cap, change_cap, emit) = status_host(false);
        let mut power = create_power();
        enable_power_signals(&mut power);
        let count = Arc::new(Mutex::new(0u32));
        let count_for_slot = count.clone();
        connect_signal(
            power.on_change.as_ref().unwrap(),
            Arc::new(move |_: &PowerStatus| {
                *count_for_slot.lock().unwrap() += 1;
            }),
            None,
        );
        flight_power::attach_power(
            Some(&status_cap), Some(&change_cap),
            None, None, None, None,
            &mut power, None,
        );
        flight_power::attach_power(
            Some(&status_cap), Some(&change_cap),
            None, None, None, None,
            &mut power, None,
        );
        emit();
        assert_eq!(*count.lock().unwrap(), 1);
    }
}

mod create_power {
    #[test]
    fn allocates_with_inert_signals() {
        let power = flight_power::create_power();
        assert!(power.on_change.is_none());
        assert!(power.on_charging.is_none());
        assert!(power.on_thermal_state_change.is_none());
    }
}

mod create_power_context {
    use super::*;

    #[test]
    fn allocates_a_fresh_context_that_does_not_suppress_any_provider() {
        let destroyed_count = Arc::new(Mutex::new(0u32));
        let count = destroyed_count.clone();
        let cap = make_keep_awake_cap(Some(KeepAwakeOverrides {
            destroy: Some(Arc::new(move || {
                *count.lock().unwrap() += 1;
            })),
            acquire: None, is_active: None, provider: None, release: None,
        }));
        let mut ctx = create_power_context();
        flight_power::destroy_power_keep_awake(&[&cap], &mut ctx);
        assert_eq!(*destroyed_count.lock().unwrap(), 1);
    }
}

mod destroy_power_keep_awake {
    use super::*;

    #[test]
    fn destroys_each_distinct_provider_exactly_once_even_when_aliased() {
        let destroyed = Arc::new(Mutex::new(0u32));
        let destroyed_for_cap = destroyed.clone();
        let shared = make_keep_awake_cap(Some(KeepAwakeOverrides {
            destroy: Some(Arc::new(move || {
                *destroyed_for_cap.lock().unwrap() += 1;
            })),
            acquire: None, is_active: None, provider: None, release: None,
        }));
        let mut ctx = create_power_context();
        flight_power::destroy_power_keep_awake(&[&shared, &shared], &mut ctx);
        assert_eq!(*destroyed.lock().unwrap(), 1);
    }

    #[test]
    fn attempts_every_provider_and_rethrows_the_first_error_after_the_siblings_run() {
        let second_destroyed = Arc::new(Mutex::new(false));
        let second_for_cap = second_destroyed.clone();
        let failing = make_keep_awake_cap(Some(KeepAwakeOverrides {
            destroy: Some(Arc::new(|| {
                panic!("first failed");
            })),
            acquire: None, is_active: None, provider: None, release: None,
        }));
        let healthy = make_keep_awake_cap(Some(KeepAwakeOverrides {
            destroy: Some(Arc::new(move || {
                *second_for_cap.lock().unwrap() = true;
            })),
            acquire: None, is_active: None, provider: None, release: None,
        }));
        let mut ctx = create_power_context();
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            flight_power::destroy_power_keep_awake(&[&failing, &healthy], &mut ctx);
        }));
        assert!(result.is_err());
        assert!(*second_destroyed.lock().unwrap());
    }

    #[test]
    fn cross_call_skips_previously_destroyed_provider() {
        let destroyed_count = Arc::new(Mutex::new(0u32));
        let provider_ref = make_provider();
        let count_for_a = destroyed_count.clone();
        let a = make_keep_awake_cap(Some(KeepAwakeOverrides {
            destroy: Some(Arc::new(move || {
                *count_for_a.lock().unwrap() += 1;
            })),
            provider: Some(provider_ref.clone()),
            acquire: None, is_active: None, release: None,
        }));
        let b = make_keep_awake_cap(Some(KeepAwakeOverrides {
            provider: Some(make_provider()),
            acquire: None, destroy: None, is_active: None, release: None,
        }));
        let mut ctx = create_power_context();
        flight_power::destroy_power_keep_awake(&[&a, &b], &mut ctx);
        assert_eq!(*destroyed_count.lock().unwrap(), 1);
        let c = make_keep_awake_cap(Some(KeepAwakeOverrides {
            destroy: Some(Arc::new(move || {
                panic!("should not be called — already destroyed");
            })),
            provider: Some(provider_ref.clone()),
            acquire: None, is_active: None, release: None,
        }));
        flight_power::destroy_power_keep_awake(&[&c], &mut ctx);
        assert_eq!(*destroyed_count.lock().unwrap(), 1);
    }

    #[test]
    fn failed_provider_remains_retryable() {
        use std::sync::atomic::{AtomicU32, Ordering};
        let attempt = Arc::new(AtomicU32::new(0));
        let attempt_for_cap = attempt.clone();
        let provider_ref = make_provider();
        let cap = make_keep_awake_cap(Some(KeepAwakeOverrides {
            destroy: Some(Arc::new(move || {
                let n = attempt_for_cap.fetch_add(1, Ordering::SeqCst) + 1;
                if n == 1 {
                    panic!("first attempt fails");
                }
            })),
            provider: Some(provider_ref.clone()),
            acquire: None, is_active: None, release: None,
        }));
        let mut ctx = create_power_context();
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            flight_power::destroy_power_keep_awake(&[&cap], &mut ctx);
        }));
        assert_eq!(attempt.load(Ordering::SeqCst), 1);
        flight_power::destroy_power_keep_awake(&[&cap], &mut ctx);
        assert_eq!(attempt.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn distinct_providers_sharing_same_callback_each_destroy() {
        let destroyed_count = Arc::new(Mutex::new(0u32));
        let shared_destroy: Arc<dyn Fn() + Send + Sync> = {
            let count = destroyed_count.clone();
            Arc::new(move || {
                *count.lock().unwrap() += 1;
            })
        };
        let a = make_keep_awake_cap(Some(KeepAwakeOverrides {
            destroy: Some(shared_destroy.clone()),
            provider: Some(make_provider()),
            acquire: None, is_active: None, release: None,
        }));
        let b = make_keep_awake_cap(Some(KeepAwakeOverrides {
            destroy: Some(shared_destroy.clone()),
            provider: Some(make_provider()),
            acquire: None, is_active: None, release: None,
        }));
        let mut ctx = create_power_context();
        flight_power::destroy_power_keep_awake(&[&a, &b], &mut ctx);
        assert_eq!(*destroyed_count.lock().unwrap(), 2);
    }

    #[test]
    fn expired_weak_entry_does_not_suppress_new_provider() {
        let destroyed_count = Arc::new(Mutex::new(0u32));
        let count_for_a = destroyed_count.clone();
        let provider_a = make_provider();
        let a = make_keep_awake_cap(Some(KeepAwakeOverrides {
            destroy: Some(Arc::new(move || {
                *count_for_a.lock().unwrap() += 1;
            })),
            provider: Some(provider_a.clone()),
            acquire: None, is_active: None, release: None,
        }));
        let mut ctx = create_power_context();
        flight_power::destroy_power_keep_awake(&[&a], &mut ctx);
        assert_eq!(*destroyed_count.lock().unwrap(), 1);
        drop(a);
        drop(provider_a);
        let count_for_b = destroyed_count.clone();
        let b = make_keep_awake_cap(Some(KeepAwakeOverrides {
            destroy: Some(Arc::new(move || {
                *count_for_b.lock().unwrap() += 1;
            })),
            provider: Some(make_provider()),
            acquire: None, is_active: None, release: None,
        }));
        flight_power::destroy_power_keep_awake(&[&b], &mut ctx);
        assert_eq!(*destroyed_count.lock().unwrap(), 2);
    }
}

mod detach_power {
    use super::*;

    #[test]
    fn stops_delivery_and_is_safe_when_never_attached() {
        let (status_cap, change_cap, emit) = status_host(false);
        let mut power = create_power();
        enable_power_signals(&mut power);
        let count = Arc::new(Mutex::new(0u32));
        let count_for_slot = count.clone();
        connect_signal(
            power.on_change.as_ref().unwrap(),
            Arc::new(move |_: &PowerStatus| {
                *count_for_slot.lock().unwrap() += 1;
            }),
            None,
        );
        flight_power::attach_power(
            Some(&status_cap), Some(&change_cap),
            None, None, None, None,
            &mut power, None,
        );
        flight_power::detach_power(&mut power);
        emit();
        assert_eq!(*count.lock().unwrap(), 0);
        let mut fresh = create_power();
        flight_power::detach_power(&mut fresh);
    }

    #[test]
    fn runs_every_teardown_even_when_one_throws() {
        let unlock_torn_down = Arc::new(Mutex::new(false));
        let unlock_for_cap = unlock_torn_down.clone();
        let session_lock_cap = HostPowerSessionLockCapability {
            subscribe_lock: Arc::new(|_listener| {
                return Arc::new(|| {
                    panic!("lock teardown failed");
                });
            }),
            subscribe_unlock: Arc::new(move |_listener| {
                let unlock_clone = unlock_for_cap.clone();
                return Arc::new(move || {
                    *unlock_clone.lock().unwrap() = true;
                });
            }),
        };
        let mut power = create_power();
        flight_power::attach_power(
            None, None,
            Some(&session_lock_cap),
            None, None, None,
            &mut power, None,
        );
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            flight_power::detach_power(&mut power);
        }));
        assert!(result.is_err());
        assert!(*unlock_torn_down.lock().unwrap());
    }

    #[test]
    fn ends_only_its_own_subscriptions() {
        let (status_cap, change_cap, emit) = status_host(false);
        let mut kept = create_power();
        let mut dropped = create_power();
        enable_power_signals(&mut kept);
        let count = Arc::new(Mutex::new(0u32));
        let count_for_slot = count.clone();
        connect_signal(
            kept.on_change.as_ref().unwrap(),
            Arc::new(move |_: &PowerStatus| {
                *count_for_slot.lock().unwrap() += 1;
            }),
            None,
        );
        flight_power::attach_power(
            Some(&status_cap), Some(&change_cap),
            None, None, None, None,
            &mut kept, None,
        );
        flight_power::attach_power(
            Some(&status_cap), Some(&change_cap),
            None, None, None, None,
            &mut dropped, None,
        );
        flight_power::detach_power(&mut dropped);
        emit();
        assert_eq!(*count.lock().unwrap(), 1);
    }
}

mod dispose_power {
    use super::*;

    #[test]
    fn detaches_and_clears_the_entity_signals() {
        let (status_cap, change_cap, emit) = status_host(false);
        let mut power = create_power();
        enable_power_signals(&mut power);
        let count = Arc::new(Mutex::new(0u32));
        let count_for_slot = count.clone();
        connect_signal(
            power.on_change.as_ref().unwrap(),
            Arc::new(move |_: &PowerStatus| {
                *count_for_slot.lock().unwrap() += 1;
            }),
            None,
        );
        flight_power::attach_power(
            Some(&status_cap), Some(&change_cap),
            None, None, None, None,
            &mut power, None,
        );
        flight_power::dispose_power(&mut power);
        emit();
        assert_eq!(*count.lock().unwrap(), 0);
    }
}

mod enable_power_signals {
    use super::*;

    #[test]
    fn allocates_every_signal_and_is_idempotent() {
        let mut power = create_power();
        flight_power::enable_power_signals(&mut power);
        let first_on_change = power.on_change.clone();
        flight_power::enable_power_signals(&mut power);
        assert!(power.on_change.is_some());
        assert!(power.on_suspend.is_some());
        assert!(power.on_unlock_screen.is_some());
        assert!(Arc::ptr_eq(
            &first_on_change.unwrap().data,
            &power.on_change.as_ref().unwrap().data,
        ));
    }
}

mod get_power_battery_health {
    use super::*;

    #[test]
    fn fills_and_returns_the_caller_owned_out_parameter() {
        let cap = HostPowerBatteryHealthCapability {
            get_battery_health: Arc::new(|out: &mut PowerBatteryHealth| {
                out.cycle_count = 12;
                return out.clone();
            }),
        };
        let mut out = make_power_battery_health();
        let result = flight_power::get_power_battery_health(&cap, &mut out);
        assert_eq!(result.cycle_count, 12);
        assert_eq!(out.cycle_count, 12);
    }
}

mod get_power_battery_health_state_string {
    use super::*;

    #[test]
    fn round_trips_all_variants() {
        assert_eq!(flight_power::get_power_battery_health_state_string(PowerBatteryHealthState::Good), "Good");
        assert_eq!(flight_power::get_power_battery_health_state_string(PowerBatteryHealthState::Fair), "Fair");
        assert_eq!(flight_power::get_power_battery_health_state_string(PowerBatteryHealthState::Poor), "Poor");
        assert_eq!(flight_power::get_power_battery_health_state_string(PowerBatteryHealthState::Unknown), "Unknown");
    }
}

mod get_power_idle_polling_interval_ms {
    use flight_power::*;

    #[test]
    fn reports_the_configured_interval() {
        let mut ctx = create_power_context();
        assert_eq!(flight_power::get_power_idle_polling_interval_ms(&ctx), 5000.0);
        set_power_idle_polling_interval_ms(&mut ctx, 1234.0);
        assert_eq!(flight_power::get_power_idle_polling_interval_ms(&ctx), 1234.0);
    }

    #[test]
    fn independent_contexts_do_not_affect_each_other() {
        let mut ctx_a = create_power_context();
        let ctx_b = create_power_context();
        set_power_idle_polling_interval_ms(&mut ctx_a, 9999.0);
        assert_eq!(flight_power::get_power_idle_polling_interval_ms(&ctx_a), 9999.0);
        assert_eq!(flight_power::get_power_idle_polling_interval_ms(&ctx_b), 5000.0);
    }
}

mod get_power_idle_state_string {
    use super::*;

    #[test]
    fn round_trips_all_variants() {
        assert_eq!(flight_power::get_power_idle_state_string(PowerIdleState::Active), "Active");
        assert_eq!(flight_power::get_power_idle_state_string(PowerIdleState::Idle), "Idle");
        assert_eq!(flight_power::get_power_idle_state_string(PowerIdleState::Unknown), "Unknown");
    }
}

mod get_power_keep_awake_acquire_reason_string {
    use super::*;

    #[test]
    fn round_trips_all_variants() {
        assert_eq!(flight_power::get_power_keep_awake_acquire_reason_string(PowerKeepAwakeAcquireReason::Ok), "ok");
        assert_eq!(flight_power::get_power_keep_awake_acquire_reason_string(PowerKeepAwakeAcquireReason::Unavailable), "unavailable");
        assert_eq!(flight_power::get_power_keep_awake_acquire_reason_string(PowerKeepAwakeAcquireReason::Denied), "denied");
        assert_eq!(flight_power::get_power_keep_awake_acquire_reason_string(PowerKeepAwakeAcquireReason::Failed), "failed");
    }
}

mod get_power_keep_awake_mode_string {
    use super::*;

    #[test]
    fn round_trips_all_variants() {
        assert_eq!(flight_power::get_power_keep_awake_mode_string(PowerKeepAwakeMode::PreventDisplaySleep), "PreventDisplaySleep");
        assert_eq!(flight_power::get_power_keep_awake_mode_string(PowerKeepAwakeMode::PreventAppSuspension), "PreventAppSuspension");
    }
}

mod get_power_keep_awake_release_reason_string {
    use super::*;

    #[test]
    fn round_trips_all_variants() {
        assert_eq!(flight_power::get_power_keep_awake_release_reason_string(PowerKeepAwakeReleaseReason::Ok), "ok");
        assert_eq!(flight_power::get_power_keep_awake_release_reason_string(PowerKeepAwakeReleaseReason::Inactive), "inactive");
        assert_eq!(flight_power::get_power_keep_awake_release_reason_string(PowerKeepAwakeReleaseReason::Failed), "failed");
    }
}

mod get_power_status {
    use super::*;

    #[test]
    fn fills_the_caller_owned_out_parameter() {
        let cap = HostPowerStatusCapability {
            get_status: Arc::new(|out: &mut PowerStatus| {
                out.is_charging = true;
                return out.clone();
            }),
        };
        let mut out = make_power_status();
        let result = flight_power::get_power_status(&cap, &mut out);
        assert!(result.is_charging);
        assert!(out.is_charging);
    }
}

mod get_power_system_idle_state {
    use super::*;

    #[test]
    fn forwards_the_threshold() {
        let seen = Arc::new(Mutex::new(-1.0f32));
        let seen_for_cap = seen.clone();
        let cap = HostPowerIdleCapability {
            get_idle_state: Arc::new(move |t| {
                *seen_for_cap.lock().unwrap() = t;
                return PowerIdleState::Idle;
            }),
            get_idle_time_seconds: Arc::new(|| 0.0),
        };
        assert_eq!(flight_power::get_power_system_idle_state(&cap, 90.0), PowerIdleState::Idle);
        assert_eq!(*seen.lock().unwrap(), 90.0);
    }
}

mod get_power_system_idle_time {
    use super::*;

    #[test]
    fn returns_the_provider_value() {
        let cap = HostPowerIdleCapability {
            get_idle_state: Arc::new(|_| PowerIdleState::Active),
            get_idle_time_seconds: Arc::new(|| 42.0),
        };
        assert_eq!(flight_power::get_power_system_idle_time(&cap), 42.0);
    }
}

mod get_power_thermal_state {
    use super::*;

    #[test]
    fn returns_the_provider_value() {
        let cap = HostPowerThermalCapability {
            get_thermal_state: Arc::new(|| PowerThermalState::Fair),
            subscribe_thermal_state_change: Arc::new(|_| Arc::new(|| {})),
        };
        assert_eq!(flight_power::get_power_thermal_state(&cap), PowerThermalState::Fair);
    }
}

mod get_power_thermal_state_string {
    use super::*;

    #[test]
    fn round_trips_all_variants() {
        assert_eq!(flight_power::get_power_thermal_state_string(PowerThermalState::Nominal), "Nominal");
        assert_eq!(flight_power::get_power_thermal_state_string(PowerThermalState::Fair), "Fair");
        assert_eq!(flight_power::get_power_thermal_state_string(PowerThermalState::Serious), "Serious");
        assert_eq!(flight_power::get_power_thermal_state_string(PowerThermalState::Critical), "Critical");
        assert_eq!(flight_power::get_power_thermal_state_string(PowerThermalState::Unknown), "Unknown");
    }
}

mod initialize_power {
    use flight_power::*;

    #[test]
    fn resets_signals_to_none() {
        let mut power = create_power();
        enable_power_signals(&mut power);
        assert!(power.on_change.is_some());
        flight_power::contract::initialize_power(&mut power);
        assert!(power.on_change.is_none());
    }
}

mod is_power_keep_awake_active {
    use super::*;

    #[test]
    fn reports_the_provider_state() {
        let cap = make_keep_awake_cap(Some(KeepAwakeOverrides {
            is_active: Some(Arc::new(|| true)),
            acquire: None, destroy: None, provider: None, release: None,
        }));
        assert!(flight_power::is_power_keep_awake_active(&cap));
    }
}

mod make_power_battery_health {
    use super::*;

    #[test]
    fn carries_the_complete_unknown_encoding() {
        let h = flight_power::make_power_battery_health();
        assert_eq!(h.capacity_wear_level, -1.0);
        assert_eq!(h.cycle_count, -1);
        assert_eq!(h.health_state, PowerBatteryHealthState::Unknown);
        assert_eq!(h.temperature_celsius, -1.0);
        assert_eq!(h.voltage, -1.0);
    }
}

mod make_power_status {
    use super::*;

    #[test]
    fn carries_the_complete_unknown_encoding() {
        let s = flight_power::make_power_status();
        assert_eq!(s.battery_level, -1.0);
        assert_eq!(s.charging_time, -1.0);
        assert_eq!(s.discharging_time, -1.0);
        assert_eq!(s.thermal_state, PowerThermalState::Unknown);
        assert!(!s.is_charging);
    }

    #[test]
    fn allocates_a_distinct_value_per_call() {
        let a = flight_power::make_power_status();
        let b = flight_power::make_power_status();
        let a_ptr = &a as *const _ as usize;
        let b_ptr = &b as *const _ as usize;
        assert_ne!(a_ptr, b_ptr);
    }
}

mod parse_power_battery_health_state {
    use super::*;

    #[test]
    fn round_trips_all_variants() {
        assert_eq!(flight_power::parse_power_battery_health_state("Good"), Some(PowerBatteryHealthState::Good));
        assert_eq!(flight_power::parse_power_battery_health_state("Unknown"), Some(PowerBatteryHealthState::Unknown));
    }

    #[test]
    fn rejects_unknown_string() {
        assert_eq!(flight_power::parse_power_battery_health_state("bogus"), None);
    }
}

mod parse_power_idle_state {
    use super::*;

    #[test]
    fn round_trips_all_variants() {
        assert_eq!(flight_power::parse_power_idle_state("Active"), Some(PowerIdleState::Active));
        assert_eq!(flight_power::parse_power_idle_state("Idle"), Some(PowerIdleState::Idle));
    }

    #[test]
    fn rejects_unknown_string() {
        assert_eq!(flight_power::parse_power_idle_state("bogus"), None);
    }
}

mod parse_power_keep_awake_acquire_reason {
    use super::*;

    #[test]
    fn round_trips_all_variants() {
        assert_eq!(flight_power::parse_power_keep_awake_acquire_reason("ok"), Some(PowerKeepAwakeAcquireReason::Ok));
        assert_eq!(flight_power::parse_power_keep_awake_acquire_reason("denied"), Some(PowerKeepAwakeAcquireReason::Denied));
    }

    #[test]
    fn rejects_unknown_string() {
        assert_eq!(flight_power::parse_power_keep_awake_acquire_reason("bogus"), None);
    }
}

mod parse_power_keep_awake_mode {
    use super::*;

    #[test]
    fn round_trips_all_variants() {
        assert_eq!(flight_power::parse_power_keep_awake_mode("PreventDisplaySleep"), Some(PowerKeepAwakeMode::PreventDisplaySleep));
        assert_eq!(flight_power::parse_power_keep_awake_mode("PreventAppSuspension"), Some(PowerKeepAwakeMode::PreventAppSuspension));
    }

    #[test]
    fn rejects_unknown_string() {
        assert_eq!(flight_power::parse_power_keep_awake_mode("bogus"), None);
    }
}

mod parse_power_keep_awake_release_reason {
    use super::*;

    #[test]
    fn round_trips_all_variants() {
        assert_eq!(flight_power::parse_power_keep_awake_release_reason("ok"), Some(PowerKeepAwakeReleaseReason::Ok));
        assert_eq!(flight_power::parse_power_keep_awake_release_reason("inactive"), Some(PowerKeepAwakeReleaseReason::Inactive));
    }

    #[test]
    fn rejects_unknown_string() {
        assert_eq!(flight_power::parse_power_keep_awake_release_reason("bogus"), None);
    }
}

mod parse_power_thermal_state {
    use super::*;

    #[test]
    fn round_trips_all_variants() {
        assert_eq!(flight_power::parse_power_thermal_state("Nominal"), Some(PowerThermalState::Nominal));
        assert_eq!(flight_power::parse_power_thermal_state("Critical"), Some(PowerThermalState::Critical));
    }

    #[test]
    fn rejects_unknown_string() {
        assert_eq!(flight_power::parse_power_thermal_state("bogus"), None);
    }
}

mod release_power_keep_awake {
    use super::*;

    #[test]
    fn resolves_the_provider_outcome() {
        let cap = make_keep_awake_cap(Some(KeepAwakeOverrides {
            release: Some(Arc::new(|| {
                Box::pin(async { PowerKeepAwakeReleaseResult { reason: PowerKeepAwakeReleaseReason::Inactive } })
            })),
            acquire: None, destroy: None, is_active: None, provider: None,
        }));
        let result = crate::block_on(flight_power::release_power_keep_awake(&cap));
        assert_eq!(result.reason, PowerKeepAwakeReleaseReason::Inactive);
    }
}

mod set_power_idle_polling_interval_ms {
    use flight_power::*;

    #[test]
    fn clamps_a_non_positive_interval_to_1ms() {
        let mut ctx = create_power_context();
        flight_power::set_power_idle_polling_interval_ms(&mut ctx, 0.0);
        assert_eq!(get_power_idle_polling_interval_ms(&ctx), 1.0);
    }
}
