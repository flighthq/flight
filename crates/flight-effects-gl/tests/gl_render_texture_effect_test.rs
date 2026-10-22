use std::cell::RefCell;

use flight_effects::{Effect, EffectValue};
use flight_effects_gl::contract::GlEffectContext;
use flight_render_gl::GlRenderState;

thread_local! {
    static DESTS: RefCell<Vec<(String, u32)>> = const { RefCell::new(Vec::new()) };
    static PIXEL: RefCell<[u8; 4]> = const { RefCell::new([0; 4]) };
    static CLEARS_SEEN: RefCell<usize> = const { RefCell::new(0) };
}

fn record_first(ctx: &mut GlEffectContext<'_>, _effect: &dyn Effect) -> Result<(), String> {
    DESTS.with(|dests| {
        dests
            .borrow_mut()
            .push(("first".to_string(), ctx.dest.framebuffer.0.get()))
    });
    return Ok(());
}

fn record_second(ctx: &mut GlEffectContext<'_>, _effect: &dyn Effect) -> Result<(), String> {
    DESTS.with(|dests| {
        dests
            .borrow_mut()
            .push(("second".to_string(), ctx.dest.framebuffer.0.get()))
    });
    return Ok(());
}

fn noop_runner(_ctx: &mut GlEffectContext<'_>, _effect: &dyn Effect) -> Result<(), String> {
    return Ok(());
}

fn never_resolvable(_state: &mut GlRenderState, _effect: &dyn Effect) -> bool {
    return false;
}

fn resolves_present_shader_key(_state: &mut GlRenderState, effect: &dyn Effect) -> bool {
    return effect.get_effect_field("shaderKey") == Some(EffectValue::Text("present".to_string()));
}

fn composite_premultiplied_pixel(destination: [u8; 4], source: [u8; 4]) -> [u8; 4] {
    let mut result = [0_u8; 4];
    let destination_scale = 1.0 - source[3] as f32 / 255.0;
    for channel in 0..4 {
        result[channel] = (source[channel] as f32 + destination[channel] as f32 * destination_scale)
            .round() as u8;
    }
    return result;
}

/// Composites a constant source pixel into the shared destination pixel, first resetting it when
/// the caller cleared the destination since the last frame (observed through the mock's clears).
fn constant_frame_runner(
    _ctx: &mut GlEffectContext<'_>,
    _effect: &dyn Effect,
) -> Result<(), String> {
    let clears = crate::gl_test_helper::calls_named("clear_buffer_f32");
    let cleared = CLEARS_SEEN.with(|seen| {
        let mut seen = seen.borrow_mut();
        let cleared = clears > *seen;
        *seen = clears;
        cleared
    });
    PIXEL.with(|pixel| {
        let mut pixel = pixel.borrow_mut();
        if cleared {
            *pixel = [0; 4];
        }
        *pixel = composite_premultiplied_pixel(*pixel, [64, 32, 16, 128]);
    });
    return Ok(());
}

mod apply_gl_effects_to_render_texture {
    use flight_effects_gl::contract::{apply_gl_effects_to_render_texture, register_gl_effect};
    use flight_render_gl::{
        clear_gl_render_texture, create_gl_render_texture_pool, get_gl_render_texture_target,
        is_gl_render_texture_ready,
    };

    use super::*;
    use crate::gl_test_helper::make_state;
    use crate::{lease_render_texture, make_effects, publish_render_texture};

    #[test]
    fn ping_pongs_registered_effects_so_an_even_chain_still_finishes_in_the_destination_lease() {
        let mut state = make_state();
        let mut pool = create_gl_render_texture_pool();
        let mut source = lease_render_texture(&state, &mut pool, 8.0, 8.0);
        let mut dest = lease_render_texture(&state, &mut pool, 8.0, 8.0);
        let mut scratch = lease_render_texture(&state, &mut pool, 8.0, 8.0);
        publish_render_texture(&mut state, &mut source);
        register_gl_effect(&mut state, "acme.First", record_first, None);
        register_gl_effect(&mut state, "acme.Second", record_second, None);
        DESTS.with(|dests| dests.borrow_mut().clear());

        let effects = make_effects(&["acme.First", "acme.Second"]);
        assert!(
            apply_gl_effects_to_render_texture(
                &mut state,
                &mut pool,
                &source,
                &mut dest,
                &mut scratch,
                &effects
            )
            .unwrap()
        );

        let calls = DESTS.with(|dests| dests.borrow().clone());
        assert_eq!(calls.len(), 2);
        let scratch_framebuffer = get_gl_render_texture_target(&mut state, &scratch)
            .unwrap()
            .borrow()
            .target
            .framebuffer
            .0
            .get();
        let dest_framebuffer = get_gl_render_texture_target(&mut state, &dest)
            .unwrap()
            .borrow()
            .target
            .framebuffer
            .0
            .get();
        assert_eq!(calls[0], ("first".to_string(), scratch_framebuffer));
        assert_eq!(calls[1], ("second".to_string(), dest_framebuffer));
        assert!(is_gl_render_texture_ready(&mut state, &dest));
    }

    #[test]
    fn leaves_the_destination_unpublished_when_no_effect_kind_is_registered() {
        let mut state = make_state();
        let mut pool = create_gl_render_texture_pool();
        let mut source = lease_render_texture(&state, &mut pool, 8.0, 8.0);
        let mut dest = lease_render_texture(&state, &mut pool, 8.0, 8.0);
        let mut scratch = lease_render_texture(&state, &mut pool, 8.0, 8.0);
        publish_render_texture(&mut state, &mut source);
        let effects = make_effects(&["acme.Missing"]);
        assert!(
            !apply_gl_effects_to_render_texture(
                &mut state,
                &mut pool,
                &source,
                &mut dest,
                &mut scratch,
                &effects
            )
            .unwrap()
        );
        assert!(!is_gl_render_texture_ready(&mut state, &dest));
    }

    #[test]
    fn is_byte_stable_across_constant_input_frames_only_when_reused_destinations_are_cleared() {
        let mut state = make_state();
        let mut pool = create_gl_render_texture_pool();
        let mut source = lease_render_texture(&state, &mut pool, 1.0, 1.0);
        let mut dest = lease_render_texture(&state, &mut pool, 1.0, 1.0);
        let mut scratch = lease_render_texture(&state, &mut pool, 1.0, 1.0);
        register_gl_effect(
            &mut state,
            "test.constant-frame",
            constant_frame_runner,
            None,
        );
        publish_render_texture(&mut state, &mut source);
        let effects = make_effects(&["test.constant-frame"]);
        PIXEL.with(|pixel| *pixel.borrow_mut() = [0; 4]);
        CLEARS_SEEN.with(|seen| {
            *seen.borrow_mut() = crate::gl_test_helper::calls_named("clear_buffer_f32")
        });

        let mut cleared_frames = Vec::new();
        for _ in 0..4 {
            clear_gl_render_texture(&mut state, &mut dest).unwrap();
            assert!(
                apply_gl_effects_to_render_texture(
                    &mut state,
                    &mut pool,
                    &source,
                    &mut dest,
                    &mut scratch,
                    &effects
                )
                .unwrap()
            );
            cleared_frames.push(PIXEL.with(|pixel| *pixel.borrow()));
        }

        PIXEL.with(|pixel| *pixel.borrow_mut() = [0; 4]);
        CLEARS_SEEN.with(|seen| {
            *seen.borrow_mut() = crate::gl_test_helper::calls_named("clear_buffer_f32")
        });
        let mut accumulated_frames = Vec::new();
        for _ in 0..4 {
            assert!(
                apply_gl_effects_to_render_texture(
                    &mut state,
                    &mut pool,
                    &source,
                    &mut dest,
                    &mut scratch,
                    &effects
                )
                .unwrap()
            );
            accumulated_frames.push(PIXEL.with(|pixel| *pixel.borrow()));
        }

        assert_eq!(cleared_frames, vec![[64, 32, 16, 128]; 4]);
        assert_eq!(
            accumulated_frames,
            vec![
                [64, 32, 16, 128],
                [96, 48, 24, 192],
                [112, 56, 28, 224],
                [120, 60, 30, 240]
            ]
        );
    }
}

mod explain_gl_effect_application {
    use flight_effects_gl::contract::{
        GlEffectApplicationExplanation, GlEffectApplicationStatus, explain_gl_effect_application,
        register_gl_effect,
    };

    use super::*;
    use crate::gl_test_helper::make_state;
    use crate::{make_effect_with_field, make_effects};

    #[test]
    fn separates_an_empty_chain_from_one_whose_effects_are_all_unregistered() {
        let mut state = make_state();
        assert_eq!(
            explain_gl_effect_application(&mut state, &[], true, None).status,
            GlEffectApplicationStatus::NoEffects
        );
        assert_eq!(
            explain_gl_effect_application(
                &mut state,
                &make_effects(&["test.explain-a"]),
                true,
                None
            )
            .status,
            GlEffectApplicationStatus::UnregisteredEffects
        );
    }

    #[test]
    fn reports_partial_registration_the_case_that_succeeds_while_dropping_effects() {
        let mut state = make_state();
        register_gl_effect(&mut state, "test.explain-b", noop_runner, None);
        let explanation = explain_gl_effect_application(
            &mut state,
            &make_effects(&["test.explain-b", "test.explain-c"]),
            true,
            None,
        );
        assert_eq!(
            explanation,
            GlEffectApplicationExplanation {
                registered_count: 1,
                requested_count: 2,
                status: GlEffectApplicationStatus::PartialRegistration,
                unregistered_kinds: vec!["test.explain-c".to_string()],
                unresolved_indexes: vec![],
            }
        );
    }

    #[test]
    fn blames_an_unrealized_source_ahead_of_registration_since_it_explains_a_false_return_either_way()
     {
        let mut state = make_state();
        register_gl_effect(&mut state, "test.explain-d", noop_runner, None);
        assert_eq!(
            explain_gl_effect_application(
                &mut state,
                &make_effects(&["test.explain-d"]),
                false,
                None
            )
            .status,
            GlEffectApplicationStatus::SourceUnavailable
        );
    }

    #[test]
    fn reports_a_fully_registered_chain_as_complete() {
        let mut state = make_state();
        register_gl_effect(&mut state, "test.explain-e", noop_runner, None);
        assert_eq!(
            explain_gl_effect_application(
                &mut state,
                &make_effects(&["test.explain-e"]),
                true,
                None
            )
            .status,
            GlEffectApplicationStatus::Complete
        );
    }

    #[test]
    fn reports_an_effect_whose_runner_cannot_resolve_it_which_passes_through_rather_than_dropping()
    {
        let mut state = make_state();
        register_gl_effect(
            &mut state,
            "test.explain-h",
            noop_runner,
            Some(never_resolvable),
        );
        let explanation = explain_gl_effect_application(
            &mut state,
            &make_effects(&["test.explain-h"]),
            true,
            None,
        );
        assert_eq!(
            explanation.status,
            GlEffectApplicationStatus::UnresolvedEffects
        );
        assert_eq!(explanation.registered_count, 1);
        assert!(explanation.unregistered_kinds.is_empty());
        assert_eq!(explanation.unresolved_indexes, vec![0]);
    }

    #[test]
    fn distinguishes_two_effects_of_the_same_kind_one_resolvable_and_one_not() {
        let mut state = make_state();
        register_gl_effect(
            &mut state,
            "test.explain-i",
            noop_runner,
            Some(resolves_present_shader_key),
        );
        let chain = vec![
            make_effect_with_field(
                "test.explain-i",
                "shaderKey",
                EffectValue::Text("present".to_string()),
            ),
            make_effect_with_field(
                "test.explain-i",
                "shaderKey",
                EffectValue::Text("absent".to_string()),
            ),
        ];
        let explanation = explain_gl_effect_application(&mut state, &chain, true, None);
        assert_eq!(
            explanation.status,
            GlEffectApplicationStatus::PartialResolution
        );
        assert_eq!(explanation.unresolved_indexes, vec![1]);
        assert_eq!(explanation.registered_count, 2);
    }

    #[test]
    fn blames_registration_ahead_of_resolution_while_still_naming_the_passthroughs() {
        let mut state = make_state();
        register_gl_effect(
            &mut state,
            "test.explain-j",
            noop_runner,
            Some(never_resolvable),
        );
        let explanation = explain_gl_effect_application(
            &mut state,
            &make_effects(&["test.explain-j", "test.explain-k"]),
            true,
            None,
        );
        assert_eq!(
            explanation.status,
            GlEffectApplicationStatus::PartialRegistration
        );
        assert_eq!(explanation.unresolved_indexes, vec![0]);
    }

    #[test]
    fn reports_a_ready_destination_as_stale_when_a_failed_call_cannot_replace_it() {
        let mut state = make_state();
        assert_eq!(
            explain_gl_effect_application(
                &mut state,
                &make_effects(&["test.explain-f"]),
                true,
                Some(true)
            )
            .status,
            GlEffectApplicationStatus::StaleDestination
        );
        register_gl_effect(&mut state, "test.explain-g", noop_runner, None);
        assert_eq!(
            explain_gl_effect_application(
                &mut state,
                &make_effects(&["test.explain-g"]),
                false,
                Some(true)
            )
            .status,
            GlEffectApplicationStatus::StaleDestination
        );
    }
}

mod get_gl_effect_application_status_string {
    use flight_effects_gl::contract::{
        GlEffectApplicationStatus, get_gl_effect_application_status_string,
    };

    #[test]
    fn returns_the_ts_string_literal_for_each_status() {
        assert_eq!(
            get_gl_effect_application_status_string(GlEffectApplicationStatus::Complete),
            "complete"
        );
        assert_eq!(
            get_gl_effect_application_status_string(GlEffectApplicationStatus::NoEffects),
            "no-effects"
        );
        assert_eq!(
            get_gl_effect_application_status_string(GlEffectApplicationStatus::StaleDestination),
            "stale-destination"
        );
        assert_eq!(
            get_gl_effect_application_status_string(GlEffectApplicationStatus::UnresolvedEffects),
            "unresolved-effects"
        );
    }
}

mod offscreen_effect_registration_snapshots {
    use flight_effects_gl::contract::register_gl_effect;

    use super::*;
    use crate::gl_test_helper::make_state;

    #[test]
    fn captures_registered_runners_in_a_rebuilt_pipeline_without_observing_later_replacements() {
        use flight_effects_gl::contract::{GlEffectRunner, get_gl_effect_runner};

        let mut screen = make_state();
        register_gl_effect(&mut screen, "acme.First", record_first, None);
        let offscreen = crate::derive_render_state(&screen);
        register_gl_effect(&mut screen, "acme.Later", record_second, None);

        let first = get_gl_effect_runner(&offscreen, "acme.First").unwrap();
        assert!(std::ptr::fn_addr_eq(first, record_first as GlEffectRunner));
        assert!(get_gl_effect_runner(&offscreen, "acme.Later").is_none());

        let rebuilt = crate::derive_render_state(&screen);
        let later = get_gl_effect_runner(&rebuilt, "acme.Later").unwrap();
        assert!(std::ptr::fn_addr_eq(later, record_second as GlEffectRunner));
    }
}

mod parse_gl_effect_application_status {
    use flight_effects_gl::contract::{
        GlEffectApplicationStatus, get_gl_effect_application_status_string,
        parse_gl_effect_application_status,
    };

    #[test]
    fn round_trips_every_status_and_rejects_unknown_strings() {
        for status in [
            GlEffectApplicationStatus::Complete,
            GlEffectApplicationStatus::NoEffects,
            GlEffectApplicationStatus::PartialRegistration,
            GlEffectApplicationStatus::PartialResolution,
            GlEffectApplicationStatus::SourceUnavailable,
            GlEffectApplicationStatus::StaleDestination,
            GlEffectApplicationStatus::UnregisteredEffects,
            GlEffectApplicationStatus::UnresolvedEffects,
        ] {
            assert_eq!(
                parse_gl_effect_application_status(get_gl_effect_application_status_string(status)),
                Some(status)
            );
        }
        assert_eq!(parse_gl_effect_application_status("done"), None);
    }
}

mod set_gl_effect_application_guard {
    use std::sync::{Arc, Mutex};

    use flight_effects_gl::contract::{
        apply_gl_effects_to_render_texture, get_gl_effect_application_status_string,
        set_gl_effect_application_guard,
    };
    use flight_render_gl::create_gl_render_texture_pool;

    use crate::gl_test_helper::make_state;
    use crate::{lease_render_texture, make_effects, publish_render_texture};

    #[test]
    fn reports_only_the_sentinel_outcomes_and_stops_once_cleared() {
        let mut state = make_state();
        let seen = Arc::new(Mutex::new(Vec::<String>::new()));
        let sink = Arc::clone(&seen);
        set_gl_effect_application_guard(
            &state,
            Some(Arc::new(move |_state, explanation| {
                sink.lock()
                    .unwrap()
                    .push(get_gl_effect_application_status_string(explanation.status).to_string());
            })),
        );
        let mut pool = create_gl_render_texture_pool();
        let mut source = lease_render_texture(&state, &mut pool, 8.0, 8.0);
        let mut dest = lease_render_texture(&state, &mut pool, 8.0, 8.0);
        let mut scratch = lease_render_texture(&state, &mut pool, 8.0, 8.0);
        publish_render_texture(&mut state, &mut source);

        apply_gl_effects_to_render_texture(
            &mut state,
            &mut pool,
            &source,
            &mut dest,
            &mut scratch,
            &make_effects(&["test.guard-a"]),
        )
        .unwrap();
        apply_gl_effects_to_render_texture(
            &mut state,
            &mut pool,
            &source,
            &mut dest,
            &mut scratch,
            &[],
        )
        .unwrap();
        assert_eq!(
            *seen.lock().unwrap(),
            vec!["unregistered-effects".to_string()]
        );

        set_gl_effect_application_guard(&state, None);
        apply_gl_effects_to_render_texture(
            &mut state,
            &mut pool,
            &source,
            &mut dest,
            &mut scratch,
            &make_effects(&["test.guard-b"]),
        )
        .unwrap();
        assert_eq!(
            *seen.lock().unwrap(),
            vec!["unregistered-effects".to_string()]
        );
    }

    #[test]
    fn reports_a_previously_published_destination_as_stale_when_no_runner_can_replace_it() {
        let mut state = make_state();
        let seen = Arc::new(Mutex::new(Vec::<String>::new()));
        let sink = Arc::clone(&seen);
        set_gl_effect_application_guard(
            &state,
            Some(Arc::new(move |_state, explanation| {
                sink.lock()
                    .unwrap()
                    .push(get_gl_effect_application_status_string(explanation.status).to_string());
            })),
        );
        let mut pool = create_gl_render_texture_pool();
        let mut source = lease_render_texture(&state, &mut pool, 8.0, 8.0);
        let mut dest = lease_render_texture(&state, &mut pool, 8.0, 8.0);
        let mut scratch = lease_render_texture(&state, &mut pool, 8.0, 8.0);
        publish_render_texture(&mut state, &mut source);
        publish_render_texture(&mut state, &mut dest);

        assert!(
            !apply_gl_effects_to_render_texture(
                &mut state,
                &mut pool,
                &source,
                &mut dest,
                &mut scratch,
                &make_effects(&["test.guard-stale"]),
            )
            .unwrap()
        );
        assert_eq!(*seen.lock().unwrap(), vec!["stale-destination".to_string()]);
    }
}
