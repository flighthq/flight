use std::sync::{Arc, Mutex};

use flight_hostcapability::{BackendOperationExplanation, BackendOperationExplanationLayer};
use flight_lifecycle::contract::*;
use flight_signals::{cancel_signal, connect_signal};

struct FakeState {
    state: AppLifecycleState,
    state_listener: Option<LifecycleListener>,
    memory_listener: Option<LifecycleMemoryWarningListener>,
}

/// Mock provider (TS `fakeBackend`): settable state, one state listener and one memory listener.
struct FakeBackend {
    shared: Arc<Mutex<FakeState>>,
    capability: HostLifecycleCapability,
}

impl FakeBackend {
    fn set_state(&self, state: AppLifecycleState) {
        self.shared.lock().unwrap().state = state;
    }

    fn fire(&self) {
        let listener = self.shared.lock().unwrap().state_listener.clone();
        if let Some(listener) = listener {
            listener();
        }
    }

    fn fire_memory(&self, level: AppMemoryPressure) {
        let listener = self.shared.lock().unwrap().memory_listener.clone();
        if let Some(listener) = listener {
            listener(level);
        }
    }
}

fn fake_backend() -> FakeBackend {
    let shared = Arc::new(Mutex::new(FakeState {
        state: AppLifecycleState::Active,
        state_listener: None,
        memory_listener: None,
    }));
    let (s1, s2, s3) = (shared.clone(), shared.clone(), shared.clone());
    let capability = HostLifecycleCapability {
        get_state: Arc::new(move || s1.lock().unwrap().state),
        subscribe: Arc::new(move |listener: LifecycleListener| {
            s2.lock().unwrap().state_listener = Some(listener);
            let s = s2.clone();
            let release: LifecycleUnsubscribe =
                Arc::new(move || s.lock().unwrap().state_listener = None);
            return release;
        }),
        get_launch_kind: None,
        subscribe_memory_warning: Some(Arc::new(
            move |listener: LifecycleMemoryWarningListener| {
                s3.lock().unwrap().memory_listener = Some(listener);
                let s = s3.clone();
                let release: LifecycleUnsubscribe =
                    Arc::new(move || s.lock().unwrap().memory_listener = None);
                return release;
            },
        )),
    };
    return FakeBackend { shared, capability };
}

/// A provider implementing only the required members (TS partial backend: absence declares
/// partial support).
fn bare_capability(state: AppLifecycleState) -> HostLifecycleCapability {
    return HostLifecycleCapability {
        get_state: Arc::new(move || state),
        subscribe: Arc::new(|_listener: LifecycleListener| {
            let release: LifecycleUnsubscribe = Arc::new(|| {});
            return release;
        }),
        get_launch_kind: None,
        subscribe_memory_warning: None,
    };
}

fn counter<T: Send + Sync + 'static>(signal: &flight_signals::Signal<T>) -> Arc<Mutex<usize>> {
    let count = Arc::new(Mutex::new(0));
    let c = count.clone();
    connect_signal(
        signal,
        Arc::new(move |_value: &T| *c.lock().unwrap() += 1),
        None,
    );
    return count;
}

fn read(count: &Arc<Mutex<usize>>) -> usize {
    return *count.lock().unwrap();
}

/// Deterministic stand-in for TS `Math.random()` in the property tests (xorshift64*).
struct Storm(u64);

impl Storm {
    fn next(&mut self, bound: usize) -> usize {
        self.0 ^= self.0 >> 12;
        self.0 ^= self.0 << 25;
        self.0 ^= self.0 >> 27;
        return (self.0.wrapping_mul(0x2545F4914F6CDD1D) >> 33) as usize % bound;
    }

    fn state(&mut self) -> AppLifecycleState {
        return [
            AppLifecycleState::Active,
            AppLifecycleState::Inactive,
            AppLifecycleState::Background,
        ][self.next(3)];
    }
}

mod attach_app_lifecycle {
    use super::*;

    #[test]
    fn emits_on_pause_and_on_state_change_when_leaving_active_for_background() {
        let backend = fake_backend();
        let mut app = create_app_lifecycle();
        let changes = counter(&app.on_state_change);
        let pauses = counter(&app.on_pause);
        attach_app_lifecycle(&backend.capability, &mut app);
        backend.set_state(AppLifecycleState::Background);
        backend.fire();
        assert_eq!(read(&changes), 1);
        assert_eq!(read(&pauses), 1);
    }

    #[test]
    fn emits_on_pause_when_leaving_active_for_inactive() {
        let backend = fake_backend();
        let mut app = create_app_lifecycle();
        let pauses = counter(&app.on_pause);
        attach_app_lifecycle(&backend.capability, &mut app);
        backend.set_state(AppLifecycleState::Inactive);
        backend.fire();
        assert_eq!(read(&pauses), 1);
    }

    #[test]
    fn does_not_double_fire_on_pause_for_inactive_to_background() {
        let backend = fake_backend();
        backend.set_state(AppLifecycleState::Inactive);
        let mut app = create_app_lifecycle();
        let pauses = counter(&app.on_pause);
        attach_app_lifecycle(&backend.capability, &mut app);
        backend.set_state(AppLifecycleState::Background);
        backend.fire();
        assert_eq!(read(&pauses), 0);
    }

    #[test]
    fn emits_on_resume_when_returning_to_active_from_background() {
        let backend = fake_backend();
        backend.set_state(AppLifecycleState::Background);
        let mut app = create_app_lifecycle();
        let resumes = counter(&app.on_resume);
        attach_app_lifecycle(&backend.capability, &mut app);
        backend.set_state(AppLifecycleState::Active);
        backend.fire();
        assert_eq!(read(&resumes), 1);
    }

    #[test]
    fn emits_on_resume_when_returning_to_active_from_inactive() {
        let backend = fake_backend();
        backend.set_state(AppLifecycleState::Inactive);
        let mut app = create_app_lifecycle();
        let resumes = counter(&app.on_resume);
        attach_app_lifecycle(&backend.capability, &mut app);
        backend.set_state(AppLifecycleState::Active);
        backend.fire();
        assert_eq!(read(&resumes), 1);
    }

    #[test]
    fn is_idempotent_re_attaching_tears_down_the_prior_subscription() {
        let backend = fake_backend();
        let mut app = create_app_lifecycle();
        let changes = counter(&app.on_state_change);
        attach_app_lifecycle(&backend.capability, &mut app);
        attach_app_lifecycle(&backend.capability, &mut app);
        backend.set_state(AppLifecycleState::Background);
        backend.fire();
        assert_eq!(read(&changes), 1);
    }

    #[test]
    fn emits_on_save_state_when_leaving_active() {
        let backend = fake_backend();
        let mut app = create_app_lifecycle();
        let saved = Arc::new(Mutex::new(false));
        let flag = saved.clone();
        connect_signal(
            &app.on_save_state,
            Arc::new(move |bag: &AppLifecycleStateBag| {
                flight_entity::set_record_value(
                    &mut bag.write().unwrap(),
                    "key".to_string(),
                    Some(Arc::new("value".to_string())),
                );
                *flag.lock().unwrap() = true;
            }),
            None,
        );
        attach_app_lifecycle(&backend.capability, &mut app);
        backend.set_state(AppLifecycleState::Background);
        backend.fire();
        assert!(*saved.lock().unwrap());
    }

    #[test]
    fn emits_on_restore_state_with_saved_bag_when_returning_to_active() {
        let backend = fake_backend();
        let mut app = create_app_lifecycle();
        connect_signal(
            &app.on_save_state,
            Arc::new(|bag: &AppLifecycleStateBag| {
                flight_entity::set_record_value(
                    &mut bag.write().unwrap(),
                    "x".to_string(),
                    Some(Arc::new(42_i32)),
                )
            }),
            None,
        );
        let restored: Arc<Mutex<Option<AppLifecycleStateBag>>> = Arc::new(Mutex::new(None));
        let sink = restored.clone();
        connect_signal(
            &app.on_restore_state,
            Arc::new(move |bag: &AppLifecycleStateBag| *sink.lock().unwrap() = Some(bag.clone())),
            None,
        );
        attach_app_lifecycle(&backend.capability, &mut app);
        backend.set_state(AppLifecycleState::Background);
        backend.fire();
        backend.set_state(AppLifecycleState::Active);
        backend.fire();
        let restored = restored.lock().unwrap().clone().expect("restored");
        let bag = restored.read().unwrap();
        let x = flight_entity::get_record_value(&bag, "x").and_then(|value| value.as_ref());
        assert_eq!(x.and_then(|value| value.downcast_ref::<i32>()), Some(&42));
    }

    #[test]
    fn restores_the_same_bag_ref_and_saves_into_a_fresh_bag_on_each_pause() {
        let backend = fake_backend();
        let mut app = create_app_lifecycle();
        let saved: Arc<Mutex<Vec<AppLifecycleStateBag>>> = Arc::new(Mutex::new(Vec::new()));
        let restored: Arc<Mutex<Vec<AppLifecycleStateBag>>> = Arc::new(Mutex::new(Vec::new()));
        let (save_sink, restore_sink) = (saved.clone(), restored.clone());
        connect_signal(
            &app.on_save_state,
            Arc::new(move |bag: &AppLifecycleStateBag| save_sink.lock().unwrap().push(bag.clone())),
            None,
        );
        connect_signal(
            &app.on_restore_state,
            Arc::new(move |bag: &AppLifecycleStateBag| {
                restore_sink.lock().unwrap().push(bag.clone())
            }),
            None,
        );
        attach_app_lifecycle(&backend.capability, &mut app);
        for _ in 0..2 {
            backend.set_state(AppLifecycleState::Background);
            backend.fire();
            backend.set_state(AppLifecycleState::Active);
            backend.fire();
        }
        let (saved, restored) = (saved.lock().unwrap(), restored.lock().unwrap());
        assert_eq!((saved.len(), restored.len()), (2, 2));
        assert!(Arc::ptr_eq(&saved[0], &restored[0]));
        assert!(Arc::ptr_eq(&saved[1], &restored[1]));
        assert!(!Arc::ptr_eq(&saved[0], &saved[1]));
    }

    #[test]
    fn subscribes_to_memory_warnings_when_backend_supports_it() {
        let backend = fake_backend();
        let mut app = create_app_lifecycle();
        let levels: Arc<Mutex<Vec<AppMemoryPressure>>> = Arc::new(Mutex::new(Vec::new()));
        let sink = levels.clone();
        connect_signal(
            &app.on_memory_warning,
            Arc::new(move |level: &AppMemoryPressure| sink.lock().unwrap().push(*level)),
            None,
        );
        attach_app_lifecycle(&backend.capability, &mut app);
        backend.fire_memory(AppMemoryPressure::Critical);
        assert_eq!(*levels.lock().unwrap(), vec![AppMemoryPressure::Critical]);
    }

    #[test]
    fn property_on_state_change_fires_exactly_once_per_backend_notification_across_random_storms() {
        let mut storm = Storm(0x9E3779B97F4A7C15);
        for _trial in 0..200 {
            let backend = fake_backend();
            let mut app = create_app_lifecycle();
            let changes = counter(&app.on_state_change);
            attach_app_lifecycle(&backend.capability, &mut app);
            let fire_count = 1 + storm.next(30);
            for _ in 0..fire_count {
                backend.set_state(storm.state());
                backend.fire();
            }
            assert_eq!(read(&changes), fire_count);
            detach_app_lifecycle(&mut app);
        }
    }

    #[test]
    fn property_on_resume_on_pause_collapse_a_random_storm_to_the_minimal_active_boundary_edge_set()
    {
        let mut storm = Storm(0xD1B54A32D192ED03);
        for _trial in 0..200 {
            let backend = fake_backend();
            let start = storm.state();
            backend.set_state(start);
            let mut app = create_app_lifecycle();
            let pauses = counter(&app.on_pause);
            let resumes = counter(&app.on_resume);
            attach_app_lifecycle(&backend.capability, &mut app);
            let mut previous = start;
            let (mut expected_pauses, mut expected_resumes) = (0, 0);
            let fire_count = 1 + storm.next(30);
            for _ in 0..fire_count {
                let next = storm.state();
                backend.set_state(next);
                backend.fire();
                if previous == AppLifecycleState::Active && next != AppLifecycleState::Active {
                    expected_pauses += 1;
                } else if previous != AppLifecycleState::Active && next == AppLifecycleState::Active
                {
                    expected_resumes += 1;
                }
                previous = next;
            }
            assert_eq!(read(&pauses), expected_pauses);
            assert_eq!(read(&resumes), expected_resumes);
            detach_app_lifecycle(&mut app);
        }
    }

    #[test]
    fn property_a_focus_blur_flutter_that_never_leaves_active_emits_no_pause_or_resume() {
        let mut storm = Storm(0x8CB92BA72F3D8DD7);
        for _trial in 0..100 {
            let backend = fake_backend();
            let mut app = create_app_lifecycle();
            let changes = counter(&app.on_state_change);
            let pauses = counter(&app.on_pause);
            let resumes = counter(&app.on_resume);
            attach_app_lifecycle(&backend.capability, &mut app);
            let fire_count = 1 + storm.next(30);
            for _ in 0..fire_count {
                backend.fire();
            }
            assert_eq!(read(&changes), fire_count);
            assert_eq!(read(&pauses), 0);
            assert_eq!(read(&resumes), 0);
            detach_app_lifecycle(&mut app);
        }
    }

    #[test]
    fn property_pause_and_resume_counts_stay_balanced_within_one_across_any_storm() {
        let mut storm = Storm(0xA0761D6478BD642F);
        for _trial in 0..200 {
            let backend = fake_backend();
            backend.set_state(storm.state());
            let mut app = create_app_lifecycle();
            let pauses = counter(&app.on_pause);
            let resumes = counter(&app.on_resume);
            attach_app_lifecycle(&backend.capability, &mut app);
            let fire_count = 1 + storm.next(30);
            for _ in 0..fire_count {
                backend.set_state(storm.state());
                backend.fire();
            }
            assert!(read(&pauses).abs_diff(read(&resumes)) <= 1);
            detach_app_lifecycle(&mut app);
        }
    }

    #[test]
    fn delivers_with_no_lock_held_so_a_slot_may_detach_reentrantly() {
        let backend = fake_backend();
        let app = Arc::new(Mutex::new(create_app_lifecycle()));
        let on_state_change = app.lock().unwrap().on_state_change.clone();
        let target = app.clone();
        connect_signal(
            &on_state_change,
            Arc::new(move |_state: &AppLifecycleState| {
                detach_app_lifecycle(&mut target.lock().unwrap())
            }),
            None,
        );
        let changes = counter(&on_state_change);
        attach_app_lifecycle(&backend.capability, &mut app.lock().unwrap());
        backend.fire();
        backend.fire();
        assert_eq!(read(&changes), 1);
    }
}

mod create_app_lifecycle {
    use super::*;

    #[test]
    fn creates_an_entity_with_all_seven_signals() {
        let app = create_app_lifecycle();
        let _: &dyn flight_entity::Entity = &app;
        let fired = counter(&app.on_back_button);
        flight_signals::emit_signal(&app.on_back_button, &());
        assert_eq!(read(&fired), 1);
        for has in [
            flight_signals::has_signal_slots(&app.on_state_change),
            flight_signals::has_signal_slots(&app.on_resume),
            flight_signals::has_signal_slots(&app.on_pause),
            flight_signals::has_signal_slots(&app.on_memory_warning),
            flight_signals::has_signal_slots(&app.on_save_state),
            flight_signals::has_signal_slots(&app.on_restore_state),
        ] {
            assert!(!has);
        }
    }
}

mod detach_app_lifecycle {
    use super::*;

    #[test]
    fn stops_further_delivery() {
        let backend = fake_backend();
        let mut app = create_app_lifecycle();
        let changes = counter(&app.on_state_change);
        attach_app_lifecycle(&backend.capability, &mut app);
        detach_app_lifecycle(&mut app);
        backend.fire();
        assert_eq!(read(&changes), 0);
    }

    #[test]
    fn is_safe_to_call_when_not_attached() {
        let mut app = create_app_lifecycle();
        detach_app_lifecycle(&mut app);
    }
}

mod dispose_app_lifecycle {
    use super::*;

    #[test]
    fn detaches_the_subscription() {
        let backend = fake_backend();
        let mut app = create_app_lifecycle();
        attach_app_lifecycle(&backend.capability, &mut app);
        dispose_app_lifecycle(&mut app);
        assert!(backend.shared.lock().unwrap().state_listener.is_none());
        assert!(backend.shared.lock().unwrap().memory_listener.is_none());
    }

    #[test]
    fn stops_delivery_after_dispose() {
        let backend = fake_backend();
        let mut app = create_app_lifecycle();
        let changes = counter(&app.on_state_change);
        attach_app_lifecycle(&backend.capability, &mut app);
        dispose_app_lifecycle(&mut app);
        backend.fire();
        assert_eq!(read(&changes), 0);
    }

    #[test]
    fn forgets_the_saved_state_bag() {
        let backend = fake_backend();
        let mut app = create_app_lifecycle();
        let restores = counter(&app.on_restore_state);
        attach_app_lifecycle(&backend.capability, &mut app);
        backend.set_state(AppLifecycleState::Background);
        backend.fire();
        dispose_app_lifecycle(&mut app);
        attach_app_lifecycle(&backend.capability, &mut app);
        backend.set_state(AppLifecycleState::Active);
        backend.fire();
        assert_eq!(read(&restores), 0);
    }
}

mod explain_lifecycle_operation {
    use super::*;

    #[test]
    fn reports_the_host_provider_as_implementing_what_it_provides() {
        assert_eq!(
            explain_lifecycle_operation(&fake_backend().capability, LifecycleOperation::GetState),
            BackendOperationExplanation {
                implemented: true,
                layer: BackendOperationExplanationLayer::Host,
                operation: "getState".to_string(),
            }
        );
    }

    #[test]
    fn reports_an_operation_the_host_provider_omits_as_unimplemented() {
        assert_eq!(
            explain_lifecycle_operation(
                &bare_capability(AppLifecycleState::Active),
                LifecycleOperation::GetLaunchKind
            ),
            BackendOperationExplanation {
                implemented: false,
                layer: BackendOperationExplanationLayer::Sentinel,
                operation: "getLaunchKind".to_string(),
            }
        );
    }

    #[test]
    fn answers_per_host_rather_than_process_wide() {
        let rich = fake_backend();
        let bare = bare_capability(AppLifecycleState::Active);
        assert!(
            explain_lifecycle_operation(
                &rich.capability,
                LifecycleOperation::SubscribeMemoryWarning
            )
            .implemented
        );
        assert!(
            !explain_lifecycle_operation(&bare, LifecycleOperation::SubscribeMemoryWarning)
                .implemented
        );
    }
}

mod get_app_launch_kind {
    use super::*;

    #[test]
    fn returns_warm_when_backend_does_not_implement_get_launch_kind() {
        assert_eq!(
            get_app_launch_kind(&fake_backend().capability),
            AppLaunchKind::Warm
        );
    }

    #[test]
    fn delegates_to_backend_get_launch_kind_when_present() {
        let mut capability = bare_capability(AppLifecycleState::Active);
        capability.get_launch_kind = Some(Arc::new(|| AppLaunchKind::Cold));
        assert_eq!(get_app_launch_kind(&capability), AppLaunchKind::Cold);
    }

    #[test]
    fn reads_the_launch_kind_from_the_host_it_is_given() {
        let mut capability = bare_capability(AppLifecycleState::Active);
        capability.get_launch_kind = Some(Arc::new(|| AppLaunchKind::Warm));
        assert_eq!(get_app_launch_kind(&capability), AppLaunchKind::Warm);
    }
}

mod get_app_launch_kind_string {
    use super::*;

    #[test]
    fn returns_the_exact_ts_strings() {
        assert_eq!(get_app_launch_kind_string(AppLaunchKind::Cold), "cold");
        assert_eq!(get_app_launch_kind_string(AppLaunchKind::Warm), "warm");
    }
}

mod get_app_lifecycle_state {
    use super::*;

    #[test]
    fn reads_from_the_active_backend() {
        let backend = fake_backend();
        backend.set_state(AppLifecycleState::Inactive);
        assert_eq!(
            get_app_lifecycle_state(&backend.capability),
            AppLifecycleState::Inactive
        );
    }

    #[test]
    fn keeps_two_hosts_independent() {
        assert_eq!(
            get_app_lifecycle_state(&bare_capability(AppLifecycleState::Active)),
            AppLifecycleState::Active
        );
        assert_eq!(
            get_app_lifecycle_state(&bare_capability(AppLifecycleState::Inactive)),
            AppLifecycleState::Inactive
        );
        assert_eq!(
            get_app_lifecycle_state(&bare_capability(AppLifecycleState::Background)),
            AppLifecycleState::Background
        );
    }
}

mod get_app_lifecycle_state_string {
    use super::*;

    #[test]
    fn returns_the_exact_ts_strings() {
        assert_eq!(
            get_app_lifecycle_state_string(AppLifecycleState::Active),
            "active"
        );
        assert_eq!(
            get_app_lifecycle_state_string(AppLifecycleState::Inactive),
            "inactive"
        );
        assert_eq!(
            get_app_lifecycle_state_string(AppLifecycleState::Background),
            "background"
        );
    }
}

mod get_app_memory_pressure_string {
    use super::*;

    #[test]
    fn returns_the_exact_ts_strings() {
        assert_eq!(
            get_app_memory_pressure_string(AppMemoryPressure::Normal),
            "normal"
        );
        assert_eq!(
            get_app_memory_pressure_string(AppMemoryPressure::Moderate),
            "moderate"
        );
        assert_eq!(
            get_app_memory_pressure_string(AppMemoryPressure::Critical),
            "critical"
        );
    }
}

mod get_lifecycle_operation_string {
    use super::*;

    #[test]
    fn returns_the_exact_ts_strings() {
        assert_eq!(
            get_lifecycle_operation_string(LifecycleOperation::GetState),
            "getState"
        );
        assert_eq!(
            get_lifecycle_operation_string(LifecycleOperation::Subscribe),
            "subscribe"
        );
        assert_eq!(
            get_lifecycle_operation_string(LifecycleOperation::GetLaunchKind),
            "getLaunchKind"
        );
        assert_eq!(
            get_lifecycle_operation_string(LifecycleOperation::SubscribeMemoryWarning),
            "subscribeMemoryWarning"
        );
    }
}

mod has_lifecycle_operation {
    use super::*;

    #[test]
    fn agrees_with_explain_lifecycle_operation_for_the_same_host() {
        let capability = fake_backend().capability;
        assert_eq!(
            has_lifecycle_operation(&capability, LifecycleOperation::GetState),
            explain_lifecycle_operation(&capability, LifecycleOperation::GetState).implemented
        );
    }

    #[test]
    fn is_false_for_an_operation_the_host_provider_omits() {
        assert!(!has_lifecycle_operation(
            &bare_capability(AppLifecycleState::Active),
            LifecycleOperation::GetLaunchKind
        ));
    }
}

mod initialize_app_lifecycle {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_app_lifecycle() {
        let mut out: AppLifecycle = flight_entity::allocate_entity();
        initialize_app_lifecycle(&mut out);
        assert!(request_app_back(&out));
        assert_eq!(
            format!("{:?}", out),
            format!("{:?}", create_app_lifecycle())
        );
    }
}

mod is_app_active {
    use super::*;

    #[test]
    fn returns_true_when_state_is_active() {
        assert!(is_app_active(&bare_capability(AppLifecycleState::Active)));
    }

    #[test]
    fn returns_false_when_state_is_background() {
        assert!(!is_app_active(&bare_capability(
            AppLifecycleState::Background
        )));
    }

    #[test]
    fn returns_false_when_state_is_inactive() {
        assert!(!is_app_active(&bare_capability(
            AppLifecycleState::Inactive
        )));
    }
}

mod is_app_background {
    use super::*;

    #[test]
    fn returns_true_when_state_is_background() {
        assert!(is_app_background(&bare_capability(
            AppLifecycleState::Background
        )));
    }

    #[test]
    fn returns_false_when_state_is_active() {
        assert!(!is_app_background(&bare_capability(
            AppLifecycleState::Active
        )));
    }
}

mod is_app_inactive {
    use super::*;

    #[test]
    fn returns_true_when_state_is_inactive() {
        assert!(is_app_inactive(&bare_capability(
            AppLifecycleState::Inactive
        )));
    }

    #[test]
    fn returns_false_when_state_is_active() {
        assert!(!is_app_inactive(&bare_capability(
            AppLifecycleState::Active
        )));
    }
}

mod parse_app_launch_kind {
    use super::*;

    #[test]
    fn parses_the_exact_ts_strings() {
        assert_eq!(parse_app_launch_kind("cold"), Some(AppLaunchKind::Cold));
        assert_eq!(parse_app_launch_kind("warm"), Some(AppLaunchKind::Warm));
    }

    #[test]
    fn rejects_other_text_and_wrong_casing() {
        assert_eq!(parse_app_launch_kind("COLD"), None);
        assert_eq!(parse_app_launch_kind(""), None);
    }
}

mod parse_app_lifecycle_state {
    use super::*;

    #[test]
    fn parses_the_exact_ts_strings() {
        assert_eq!(
            parse_app_lifecycle_state("active"),
            Some(AppLifecycleState::Active)
        );
        assert_eq!(
            parse_app_lifecycle_state("inactive"),
            Some(AppLifecycleState::Inactive)
        );
        assert_eq!(
            parse_app_lifecycle_state("background"),
            Some(AppLifecycleState::Background)
        );
    }

    #[test]
    fn rejects_other_text_and_wrong_casing() {
        assert_eq!(parse_app_lifecycle_state("ACTIVE"), None);
        assert_eq!(parse_app_lifecycle_state(""), None);
    }
}

mod parse_app_memory_pressure {
    use super::*;

    #[test]
    fn parses_the_exact_ts_strings() {
        assert_eq!(
            parse_app_memory_pressure("normal"),
            Some(AppMemoryPressure::Normal)
        );
        assert_eq!(
            parse_app_memory_pressure("moderate"),
            Some(AppMemoryPressure::Moderate)
        );
        assert_eq!(
            parse_app_memory_pressure("critical"),
            Some(AppMemoryPressure::Critical)
        );
    }

    #[test]
    fn rejects_other_text_and_wrong_casing() {
        assert_eq!(parse_app_memory_pressure("NORMAL"), None);
        assert_eq!(parse_app_memory_pressure(""), None);
    }
}

mod parse_lifecycle_operation {
    use super::*;

    #[test]
    fn parses_the_exact_ts_strings() {
        assert_eq!(
            parse_lifecycle_operation("getState"),
            Some(LifecycleOperation::GetState)
        );
        assert_eq!(
            parse_lifecycle_operation("subscribe"),
            Some(LifecycleOperation::Subscribe)
        );
        assert_eq!(
            parse_lifecycle_operation("getLaunchKind"),
            Some(LifecycleOperation::GetLaunchKind)
        );
        assert_eq!(
            parse_lifecycle_operation("subscribeMemoryWarning"),
            Some(LifecycleOperation::SubscribeMemoryWarning)
        );
    }

    #[test]
    fn rejects_other_text_and_wrong_casing() {
        assert_eq!(parse_lifecycle_operation("GETSTATE"), None);
        assert_eq!(parse_lifecycle_operation(""), None);
    }
}

mod request_app_back {
    use super::*;

    #[test]
    fn returns_true_when_no_listener_vetoes() {
        assert!(request_app_back(&create_app_lifecycle()));
    }

    #[test]
    fn returns_false_when_a_listener_calls_cancel_signal() {
        let app = create_app_lifecycle();
        let signal = app.on_back_button.clone();
        connect_signal(
            &app.on_back_button,
            Arc::new(move |_: &()| cancel_signal(&signal)),
            None,
        );
        assert!(!request_app_back(&app));
    }

    #[test]
    fn emits_on_back_button() {
        let app = create_app_lifecycle();
        let fired = counter(&app.on_back_button);
        request_app_back(&app);
        assert_eq!(read(&fired), 1);
    }
}
