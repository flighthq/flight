use std::sync::Arc;
use std::sync::atomic::{AtomicU32, Ordering};

use flight_render_wgpu::*;
use flight_signals::connect_signal;

use crate::support::*;

// TS `makeStateOn`: a render state over its own fresh device tier on `native`.
fn make_state_on(native: WgpuNativeDevice) -> WgpuRenderState {
    return create_wgpu_render_state(&create_test_wgpu_device(native), None);
}

// A second state over the SAME device tier, the alias relationship a derived pipeline has.
fn make_alias_of(state: &WgpuRenderState) -> WgpuRenderState {
    return create_wgpu_offscreen_render_state_from_device_state(
        &state.device_state,
        Some(&WgpuRenderStateOptions {
            format: Some(state.format),
            ..test_default()
        }),
    );
}

// TS `settle`: one microtask turn. The loss observer's continuation runs on the host spawn
// capability, and the test host runs it here (Principal 2ec2343a).
fn settle() {
    drain_test_spawned();
}

fn count_emissions(state: &WgpuRenderState) -> Arc<AtomicU32> {
    let emissions = Arc::new(AtomicU32::new(0));
    let counter = emissions.clone();
    connect_signal(
        &enable_wgpu_device_signals(state).on_device_lost,
        Arc::new(move |_info: &WgpuDeviceLostInfo| {
            counter.fetch_add(1, Ordering::SeqCst);
        }),
        None,
    );
    return emissions;
}

fn same_group(a: &WgpuDeviceSignals, b: &WgpuDeviceSignals) -> bool {
    return Arc::ptr_eq(&a.on_device_lost.data, &b.on_device_lost.data);
}

mod create_wgpu_native_device {
    use super::*;

    // The native constructor registers wgpu's own lost callback at construction: Flight's orderly
    // destroy settles the stored promise with `Destroyed`, and the tier built on it records it.
    #[test]
    fn resolves_the_stored_loss_promise_from_wgpus_lost_callback() {
        let base = create_test_native_device_without_features();
        let native =
            create_wgpu_native_device(base.device.clone(), base.queue.clone(), test_host_spawn());
        let state = make_state_on(native.clone());
        native.device.destroy();
        let _ = native.device.poll(wgpu::PollType::wait_indefinitely());
        let info = block_on(get_wgpu_native_device_lost(&native));
        assert_eq!(info.reason, WgpuDeviceLostReason::Destroyed);
        settle();
        assert_eq!(
            get_wgpu_device_loss(&state).map(|loss| loss.reason),
            Some(WgpuDeviceLostReason::Destroyed)
        );
    }
}

mod create_wgpu_native_device_with_loss_hook {
    use super::*;

    #[test]
    fn returns_the_hook_that_settles_the_promise_every_clone_shares() {
        let base = create_test_native_device_without_features();
        let (native, hook) = create_wgpu_native_device_with_loss_hook(
            base.device.clone(),
            base.queue.clone(),
            test_host_spawn(),
        );
        let alias = native.clone();
        resolve_wgpu_device_loss(
            &hook,
            WgpuDeviceLostInfo {
                message: "lost: unknown".to_string(),
                reason: WgpuDeviceLostReason::Unknown,
            },
        );
        assert_eq!(
            block_on(get_wgpu_native_device_lost(&native)).message,
            "lost: unknown"
        );
        assert_eq!(
            block_on(get_wgpu_native_device_lost(&alias)).reason,
            WgpuDeviceLostReason::Unknown
        );
    }
}

mod create_wgpu_offscreen_render_state {
    use super::*;

    #[test]
    fn reports_a_method_tight_device_lost_outcome_instead_of_deriving_on_a_dead_device() {
        let (native, loss) = create_losable_test_native_device();
        let screen = make_state_on(native);
        loss.resolve_lost(WgpuDeviceLostReason::Unknown);
        settle();
        match create_wgpu_offscreen_render_state(&screen) {
            WgpuOffscreenRenderStateResult::DeviceLost(outcome) => {
                assert_eq!(outcome.info.reason, WgpuDeviceLostReason::Unknown);
            }
            WgpuOffscreenRenderStateResult::Ok(_) => panic!("expected a device-lost outcome"),
        }
    }
}

mod dispose_wgpu_device_signals {
    use super::*;

    #[test]
    fn clears_the_group_so_a_later_enable_allocates_a_fresh_one() {
        let (native, _loss) = create_losable_test_native_device();
        let state = make_state_on(native);
        let first = enable_wgpu_device_signals(&state);
        dispose_wgpu_device_signals(&state);
        assert!(!same_group(&enable_wgpu_device_signals(&state), &first));
    }
}

mod enable_wgpu_device_signals {
    use super::*;

    #[test]
    fn is_idempotent_returning_the_same_group_on_every_call() {
        let (native, _loss) = create_losable_test_native_device();
        let state = make_state_on(native);
        assert!(same_group(
            &enable_wgpu_device_signals(&state),
            &enable_wgpu_device_signals(&state)
        ));
    }

    #[test]
    fn shares_one_group_between_two_states_over_one_device() {
        let (native, _loss) = create_losable_test_native_device();
        let screen = make_state_on(native);
        let alias = make_alias_of(&screen);
        assert!(same_group(
            &enable_wgpu_device_signals(&screen),
            &enable_wgpu_device_signals(&alias)
        ));
    }
}

mod get_wgpu_device_loss {
    use super::*;

    // PROBE 1: unexpected loss emits exactly once, asserted with a counter.
    #[test]
    fn emits_on_device_lost_exactly_once_for_an_unexpected_loss() {
        let (native, loss) = create_losable_test_native_device();
        let state = make_state_on(native);
        let emissions = count_emissions(&state);
        loss.resolve_lost(WgpuDeviceLostReason::Unknown);
        settle();
        assert_eq!(emissions.load(Ordering::SeqCst), 1);
        assert_eq!(
            get_wgpu_device_loss(&state).map(|loss| loss.reason),
            Some(WgpuDeviceLostReason::Unknown)
        );
    }

    // PROBE 2: an intentional destroy is NOT a device loss to the caller.
    #[test]
    fn records_an_intentional_destroy_without_emitting_on_device_lost() {
        let (native, loss) = create_losable_test_native_device();
        let state = make_state_on(native);
        let emissions = count_emissions(&state);
        loss.resolve_lost(WgpuDeviceLostReason::Destroyed);
        settle();
        assert_eq!(emissions.load(Ordering::SeqCst), 0);
        assert_eq!(
            get_wgpu_device_loss(&state).map(|loss| loss.reason),
            Some(WgpuDeviceLostReason::Destroyed)
        );
    }

    // PROBE 3: two aliases, one device, one loss. Both report it, and the signal fires once in total
    // rather than once per state.
    #[test]
    fn reports_one_loss_to_every_state_sharing_the_device() {
        let (native, loss) = create_losable_test_native_device();
        let screen = make_state_on(native);
        let alias = make_alias_of(&screen);
        let emissions = count_emissions(&screen);
        loss.resolve_lost(WgpuDeviceLostReason::Unknown);
        settle();
        assert_eq!(emissions.load(Ordering::SeqCst), 1);
        assert!(is_wgpu_device_lost(&screen));
        assert!(is_wgpu_device_lost(&alias));
    }

    // PROBE 4: a state built AFTER the loss sees the terminal fact immediately.
    #[test]
    fn reports_the_terminal_fact_to_a_state_created_after_the_loss() {
        let (native, loss) = create_losable_test_native_device();
        let screen = make_state_on(native);
        loss.resolve_lost(WgpuDeviceLostReason::Unknown);
        settle();
        let late = make_alias_of(&screen);
        assert!(is_wgpu_device_lost(&late));
        assert_eq!(get_wgpu_device_loss(&late), get_wgpu_device_loss(&screen));
    }

    // PROBE 6: the observer attaches during device-tier construction, but `lost` may ALREADY be
    // resolved by then. The resolved promise still reaches the signal group enabled after the state
    // was created, exactly once, when the observer continuation runs.
    #[test]
    fn records_a_loss_that_resolved_before_the_device_tier_was_ever_constructed() {
        let (native, loss) = create_losable_test_native_device();
        loss.resolve_lost(WgpuDeviceLostReason::Unknown);
        let state = make_state_on(native);
        let emissions = count_emissions(&state);
        settle();
        assert_eq!(
            get_wgpu_device_loss(&state).map(|loss| loss.reason),
            Some(WgpuDeviceLostReason::Unknown)
        );
        assert_eq!(emissions.load(Ordering::SeqCst), 1);
        settle();
        assert_eq!(emissions.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn returns_null_while_the_device_is_live() {
        let (native, _loss) = create_losable_test_native_device();
        assert_eq!(get_wgpu_device_loss(&make_state_on(native)), None);
    }

    // TS builds a device with no `lost` member; natively that is a payload whose stored loss promise
    // never resolves.
    #[test]
    fn treats_a_device_with_no_lost_promise_as_live_rather_than_throwing() {
        let state = make_state_on(create_test_native_device_with_no_loss());
        assert!(!is_wgpu_device_lost(&state));
    }
}

mod get_wgpu_native_device_lost {
    use super::*;

    #[test]
    fn returns_the_payloads_one_stored_promise() {
        let (native, loss) = create_losable_test_native_device();
        let first = get_wgpu_native_device_lost(&native);
        let second = get_wgpu_native_device_lost(&native);
        loss.resolve_lost(WgpuDeviceLostReason::Unknown);
        assert_eq!(block_on(first), block_on(second));
    }
}

mod is_wgpu_device_lost {
    use super::*;

    // PROBE 5: no state retention. The observer closes over the device tier weakly and never a
    // state: dropping the state frees the tier while the device's promise is still pending.
    #[test]
    fn does_not_retain_a_render_state_on_the_device_runtime() {
        let (native, loss) = create_losable_test_native_device();
        let state = make_state_on(native);
        enable_wgpu_device_signals(&state);
        let tier = Arc::downgrade(&get_wgpu_render_state_runtime(&state).context);
        drop(state);
        assert!(tier.upgrade().is_none());
        loss.resolve_lost(WgpuDeviceLostReason::Unknown);
    }

    #[test]
    fn is_false_for_a_live_device_and_true_once_lost() {
        let (native, loss) = create_losable_test_native_device();
        let state = make_state_on(native);
        assert!(!is_wgpu_device_lost(&state));
        loss.resolve_lost(WgpuDeviceLostReason::Unknown);
        settle();
        assert!(is_wgpu_device_lost(&state));
    }
}

mod observe_wgpu_device_loss {
    use super::*;

    #[test]
    fn records_the_loss_on_the_runtime_it_was_given() {
        let (native, loss) = create_losable_test_native_device();
        let device_state = create_wgpu_device_state(&create_test_wgpu_device(native));
        let runtime = get_wgpu_device_runtime(&device_state);
        observe_wgpu_device_loss(&runtime);
        loss.resolve_lost(WgpuDeviceLostReason::Unknown);
        settle();
        assert_eq!(
            runtime
                .read()
                .unwrap()
                .lost
                .as_ref()
                .map(|loss| loss.reason),
            Some(WgpuDeviceLostReason::Unknown)
        );
    }

    // The handler is a promise continuation (Principal 2ec2343a): even for a loss that already
    // resolved, nothing is recorded synchronously inside observe or tier construction, only once the
    // host runs the continuation.
    #[test]
    fn runs_its_handler_after_the_current_synchronous_code_even_for_a_resolved_loss() {
        let (native, loss) = create_losable_test_native_device();
        loss.resolve_lost(WgpuDeviceLostReason::Unknown);
        let state = make_state_on(native);
        assert!(!is_wgpu_device_lost(&state));
        settle();
        assert!(is_wgpu_device_lost(&state));
    }

    // Attaching twice must not announce twice: the terminal guard makes "exactly once" a property
    // of the code rather than of the current call graph.
    #[test]
    fn announces_once_even_when_attached_more_than_once_to_the_same_runtime() {
        let (native, loss) = create_losable_test_native_device();
        let state = make_state_on(native);
        let runtime = get_wgpu_render_state_runtime(&state).context.clone();
        let emissions = count_emissions(&state);
        observe_wgpu_device_loss(&runtime);
        observe_wgpu_device_loss(&runtime);
        loss.resolve_lost(WgpuDeviceLostReason::Unknown);
        settle();
        settle();
        assert_eq!(emissions.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn is_a_no_op_for_a_device_that_exposes_no_lost_promise() {
        let device_state = create_wgpu_device_state(&create_test_wgpu_device(
            create_test_native_device_with_no_loss(),
        ));
        let runtime = get_wgpu_device_runtime(&device_state);
        observe_wgpu_device_loss(&runtime);
        assert!(runtime.read().unwrap().lost.is_none());
    }
}

mod resolve_wgpu_device_loss {
    use super::*;

    // The first report wins: a second resolution neither changes the recorded loss nor announces.
    #[test]
    fn settles_once_with_the_first_report() {
        let base = create_test_native_device_without_features();
        let (native, hook) = create_wgpu_native_device_with_loss_hook(
            base.device.clone(),
            base.queue.clone(),
            test_host_spawn(),
        );
        let state = make_state_on(native.clone());
        let emissions = count_emissions(&state);
        let report = |reason| WgpuDeviceLostInfo {
            message: String::new(),
            reason,
        };
        resolve_wgpu_device_loss(&hook, report(WgpuDeviceLostReason::Unknown));
        resolve_wgpu_device_loss(&hook, report(WgpuDeviceLostReason::Destroyed));
        settle();
        assert_eq!(emissions.load(Ordering::SeqCst), 1);
        assert_eq!(
            block_on(get_wgpu_native_device_lost(&native)).reason,
            WgpuDeviceLostReason::Unknown
        );
        assert_eq!(
            get_wgpu_device_loss(&state).map(|loss| loss.reason),
            Some(WgpuDeviceLostReason::Unknown)
        );
    }
}
