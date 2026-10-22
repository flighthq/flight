use std::sync::{Arc, Mutex};

use flight_effects::{Effect, EffectRef, create_blur_effect};
use flight_effects_wgpu::contract::*;
use flight_entity::Ref;
use flight_render::{RenderTargetDescriptor, RenderTexture};
use flight_render_wgpu::*;

use crate::support::*;

fn descriptor(width: f32, height: f32) -> RenderTargetDescriptor {
    return RenderTargetDescriptor {
        width,
        height,
        format: None,
        color_attachments: None,
        color_formats: None,
        sample_count: None,
        depth: None,
        color_space: None,
    };
}

fn lease(
    state: &WgpuRenderState,
    pool: &mut WgpuRenderTexturePool,
    width: f32,
    height: f32,
) -> Ref<RenderTexture> {
    return acquire_wgpu_render_texture(state, pool, &descriptor(width, height));
}

// Realizes the source so `source-unavailable` is not what is being measured.
fn realize(state: &mut WgpuRenderState, texture: &Ref<RenderTexture>) {
    write_wgpu_render_texture_target(state, &mut texture.write().unwrap(), |_, _| {});
}

// The targets each runner was handed, in call order (the source's `vi.fn()` call records).
fn recorded_runner_dests() -> Arc<Mutex<Vec<Ref<WgpuTextureRenderTarget>>>> {
    static DESTS: std::sync::LazyLock<Arc<Mutex<Vec<Ref<WgpuTextureRenderTarget>>>>> =
        std::sync::LazyLock::new(|| Arc::new(Mutex::new(Vec::new())));
    return DESTS.clone();
}

fn first_runner(context: &mut WgpuEffectContext<'_>, _effect: &dyn Effect) {
    recorded_runner_dests()
        .lock()
        .unwrap()
        .push(context.dest.clone());
}

fn second_runner(context: &mut WgpuEffectContext<'_>, _effect: &dyn Effect) {
    recorded_runner_dests()
        .lock()
        .unwrap()
        .push(context.dest.clone());
}

fn noop_runner(_context: &mut WgpuEffectContext<'_>, _effect: &dyn Effect) {}

fn never_resolvable(_state: &mut WgpuRenderState, _effect: &dyn Effect) -> bool {
    return false;
}

mod apply_wgpu_effects_to_render_texture {
    use super::*;

    #[test]
    fn ping_pongs_an_even_registered_chain_so_the_last_operation_publishes_destination() {
        let mut state = create_wgpu_render_state_for_test(None);
        let mut pool = create_wgpu_render_texture_pool();
        let source = lease(&state, &mut pool, 8.0, 8.0);
        let dest = lease(&state, &mut pool, 8.0, 8.0);
        let scratch = lease(&state, &mut pool, 8.0, 8.0);
        realize(&mut state, &source);
        register_wgpu_effect(&mut state, "acme.First", first_runner, None);
        register_wgpu_effect(&mut state, "acme.Second", second_runner, None);
        recorded_runner_dests().lock().unwrap().clear();

        let applied = apply_wgpu_effects_to_render_texture(
            &mut state,
            &mut pool,
            &source.read().unwrap(),
            &mut dest.write().unwrap(),
            &mut scratch.write().unwrap(),
            &[
                create_test_effect("acme.First"),
                create_test_effect("acme.Second"),
            ],
        );

        assert!(applied);
        let dests = recorded_runner_dests().lock().unwrap().clone();
        assert_eq!(dests.len(), 2);
        let scratch_target =
            get_wgpu_render_texture_target(&mut state, &scratch.read().unwrap()).unwrap();
        let dest_target =
            get_wgpu_render_texture_target(&mut state, &dest.read().unwrap()).unwrap();
        assert!(Arc::ptr_eq(&dests[0], &scratch_target));
        assert!(Arc::ptr_eq(&dests[1], &dest_target));
        assert!(is_wgpu_render_texture_ready(
            &mut state,
            &dest.read().unwrap()
        ));
    }

    #[test]
    fn runs_a_real_multi_pass_blur_with_one_released_raw_scratch_target() {
        let mut state = create_wgpu_render_state_for_test(None);
        let mut pool = create_wgpu_render_texture_pool();
        let source = lease(&state, &mut pool, 16.0, 12.0);
        let dest = lease(&state, &mut pool, 16.0, 12.0);
        let scratch = lease(&state, &mut pool, 16.0, 12.0);
        realize(&mut state, &source);
        register_wgpu_blur_effect(&mut state);
        begin_wgpu_frame(&mut state);
        let blur = create_blur_effect();
        {
            let mut blur = blur.write().unwrap();
            blur.blur_x = Some(2.0);
            blur.blur_y = Some(3.0);
        }
        let blur: EffectRef = blur;

        let applied = apply_wgpu_effects_to_render_texture(
            &mut state,
            &mut pool,
            &source.read().unwrap(),
            &mut dest.write().unwrap(),
            &mut scratch.write().unwrap(),
            &[blur],
        );

        assert!(applied);
        assert!(is_wgpu_render_texture_ready(
            &mut state,
            &dest.read().unwrap()
        ));
        assert_eq!(pool.effect_targets.free.len(), 1);
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn leaves_destination_unpublished_when_no_effect_kind_is_registered() {
        let mut state = create_wgpu_render_state_for_test(None);
        let mut pool = create_wgpu_render_texture_pool();
        let source = lease(&state, &mut pool, 8.0, 8.0);
        let dest = lease(&state, &mut pool, 8.0, 8.0);
        let scratch = lease(&state, &mut pool, 8.0, 8.0);
        realize(&mut state, &source);

        let applied = apply_wgpu_effects_to_render_texture(
            &mut state,
            &mut pool,
            &source.read().unwrap(),
            &mut dest.write().unwrap(),
            &mut scratch.write().unwrap(),
            &[create_test_effect("acme.Missing")],
        );

        assert!(!applied);
        assert!(!is_wgpu_render_texture_ready(
            &mut state,
            &dest.read().unwrap()
        ));
    }
}

mod explain_wgpu_effect_application {
    use super::*;

    #[test]
    fn names_the_unregistered_kinds_and_the_status_as_plain_data_with_no_message_text() {
        let mut state = create_wgpu_render_state_for_test(None);
        let mut pool = create_wgpu_render_texture_pool();
        let source = lease(&state, &mut pool, 8.0, 8.0);
        let dest = lease(&state, &mut pool, 8.0, 8.0);
        realize(&mut state, &source);
        register_wgpu_effect(&mut state, "test.explain-registered", noop_runner, None);

        let explanation = explain_wgpu_effect_application(
            &mut state,
            &source.read().unwrap(),
            &dest.read().unwrap(),
            &[
                create_test_effect("test.explain-registered"),
                create_test_effect("test.explain-missing"),
            ],
        );

        assert_eq!(
            explanation,
            WgpuEffectApplicationExplanation {
                registered_count: 1,
                requested_count: 2,
                status: WgpuEffectApplicationStatus::PartialRegistration,
                unregistered_kinds: vec!["test.explain-missing".to_string()],
                unresolved_indexes: vec![],
            }
        );
    }

    #[test]
    fn names_a_registered_effect_whose_instance_cannot_resolve() {
        let mut state = create_wgpu_render_state_for_test(None);
        let mut pool = create_wgpu_render_texture_pool();
        let source = lease(&state, &mut pool, 8.0, 8.0);
        let dest = lease(&state, &mut pool, 8.0, 8.0);
        realize(&mut state, &source);
        register_wgpu_effect(
            &mut state,
            "test.explain-unresolved",
            noop_runner,
            Some(never_resolvable),
        );

        let explanation = explain_wgpu_effect_application(
            &mut state,
            &source.read().unwrap(),
            &dest.read().unwrap(),
            &[create_test_effect("test.explain-unresolved")],
        );

        assert_eq!(
            explanation,
            WgpuEffectApplicationExplanation {
                registered_count: 1,
                requested_count: 1,
                status: WgpuEffectApplicationStatus::UnresolvedEffects,
                unregistered_kinds: vec![],
                unresolved_indexes: vec![0],
            }
        );
    }
}

mod get_wgpu_effect_application_status_string {
    use super::*;

    #[test]
    fn returns_the_source_string_of_each_status() {
        assert_eq!(
            get_wgpu_effect_application_status_string(WgpuEffectApplicationStatus::Complete),
            "complete"
        );
        assert_eq!(
            get_wgpu_effect_application_status_string(WgpuEffectApplicationStatus::NoEffects),
            "no-effects"
        );
        assert_eq!(
            get_wgpu_effect_application_status_string(
                WgpuEffectApplicationStatus::PartialRegistration
            ),
            "partial-registration"
        );
        assert_eq!(
            get_wgpu_effect_application_status_string(
                WgpuEffectApplicationStatus::PartialResolution
            ),
            "partial-resolution"
        );
        assert_eq!(
            get_wgpu_effect_application_status_string(
                WgpuEffectApplicationStatus::SourceUnavailable
            ),
            "source-unavailable"
        );
        assert_eq!(
            get_wgpu_effect_application_status_string(
                WgpuEffectApplicationStatus::StaleDestination
            ),
            "stale-destination"
        );
        assert_eq!(
            get_wgpu_effect_application_status_string(
                WgpuEffectApplicationStatus::UnregisteredEffects
            ),
            "unregistered-effects"
        );
        assert_eq!(
            get_wgpu_effect_application_status_string(
                WgpuEffectApplicationStatus::UnresolvedEffects
            ),
            "unresolved-effects"
        );
    }
}

mod offscreen_effect_pipeline_snapshots {
    use super::*;

    #[test]
    fn captures_runners_in_each_explicitly_created_immutable_pipeline() {
        let mut screen = create_wgpu_render_state_for_test(None);
        register_wgpu_effect(&mut screen, "acme.First", first_runner, None);
        let snapshot = |screen: &WgpuRenderState| -> WgpuRenderState {
            let options = WgpuRenderStateOptions {
                effects: Some((*get_wgpu_render_state_runtime(screen).registries.effects).clone()),
                format: Some(screen.format),
                ..test_default()
            };
            return create_wgpu_offscreen_render_state_from_device_state(
                &screen.device_state,
                Some(&options),
            );
        };
        let offscreen = snapshot(&screen);
        register_wgpu_effect(&mut screen, "acme.Later", second_runner, None);

        let first: WgpuEffectRunner = first_runner;
        assert!(
            get_wgpu_effect_runner(&offscreen, "acme.First")
                .is_some_and(|runner| std::ptr::fn_addr_eq(runner, first))
        );
        assert!(get_wgpu_effect_runner(&offscreen, "acme.Later").is_none());

        let refreshed = snapshot(&screen);
        let later: WgpuEffectRunner = second_runner;
        assert!(
            get_wgpu_effect_runner(&refreshed, "acme.Later")
                .is_some_and(|runner| std::ptr::fn_addr_eq(runner, later))
        );
    }
}

mod parse_wgpu_effect_application_status {
    use super::*;

    #[test]
    fn parses_each_source_string_and_rejects_others() {
        assert_eq!(
            parse_wgpu_effect_application_status("stale-destination"),
            Some(WgpuEffectApplicationStatus::StaleDestination)
        );
        assert_eq!(
            parse_wgpu_effect_application_status("unresolved-effects"),
            Some(WgpuEffectApplicationStatus::UnresolvedEffects)
        );
        assert_eq!(
            parse_wgpu_effect_application_status("complete"),
            Some(WgpuEffectApplicationStatus::Complete)
        );
        assert_eq!(parse_wgpu_effect_application_status("missing"), None);
    }
}

mod set_wgpu_effect_application_guard {
    use super::*;

    // Clearing must restore the original silence exactly: the seam is the only path by which a
    // dropped chain is observable.
    #[test]
    fn reports_each_failed_application_to_the_installed_guard_and_goes_silent_again_when_cleared() {
        let mut state = create_wgpu_render_state_for_test(None);
        let mut pool = create_wgpu_render_texture_pool();
        let source = lease(&state, &mut pool, 8.0, 8.0);
        let dest = lease(&state, &mut pool, 8.0, 8.0);
        let scratch = lease(&state, &mut pool, 8.0, 8.0);
        realize(&mut state, &source);
        let seen: Arc<Mutex<Vec<WgpuEffectApplicationStatus>>> = Arc::new(Mutex::new(Vec::new()));
        let sink = seen.clone();
        let chain = [create_test_effect("test.seam-missing")];

        set_wgpu_effect_application_guard(
            &mut state,
            Some(Arc::new(
                move |_state: &WgpuRenderState, explanation: &WgpuEffectApplicationExplanation| {
                    sink.lock().unwrap().push(explanation.status);
                },
            )),
        );
        apply_wgpu_effects_to_render_texture(
            &mut state,
            &mut pool,
            &source.read().unwrap(),
            &mut dest.write().unwrap(),
            &mut scratch.write().unwrap(),
            &chain,
        );

        assert_eq!(
            *seen.lock().unwrap(),
            vec![WgpuEffectApplicationStatus::UnregisteredEffects]
        );

        set_wgpu_effect_application_guard(&mut state, None);
        apply_wgpu_effects_to_render_texture(
            &mut state,
            &mut pool,
            &source.read().unwrap(),
            &mut dest.write().unwrap(),
            &mut scratch.write().unwrap(),
            &chain,
        );

        assert_eq!(
            *seen.lock().unwrap(),
            vec![WgpuEffectApplicationStatus::UnregisteredEffects]
        );
    }
}
