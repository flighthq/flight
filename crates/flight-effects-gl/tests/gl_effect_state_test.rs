use std::sync::{Arc, Mutex};

use flight_effects_gl::contract::EffectOperation;

use crate::make_effect;

fn chain(kind: &str) -> Vec<EffectOperation> {
    return vec![EffectOperation::Effect(make_effect(kind))];
}

mod begin_gl_effect_pass {
    use flight_effects_gl::contract::begin_gl_effect_pass;
    use flight_entity::get_entity_id;
    use flight_render_gl::end_gl_render_pass;
    use flight_texture::RenderTargetColorSpace;

    use crate::gl_test_helper::make_state;
    use crate::make_pipeline;

    #[test]
    fn is_a_function() {
        let mut state = make_state();
        let mut pipeline = make_pipeline(&state);
        let pass = begin_gl_effect_pass(&mut state, &mut pipeline, None, None).unwrap();
        let scene = pipeline.scene_target.as_ref().unwrap();
        assert_eq!((scene.axes.width, scene.axes.height), (640, 480));
        assert_eq!(scene.axes.color_space, RenderTargetColorSpace::Srgb);
        end_gl_render_pass(&state, &pass).unwrap();
    }

    #[test]
    fn redeclares_the_explicit_color_space_on_a_reused_scene_target() {
        let mut state = make_state();
        let mut pipeline = make_pipeline(&state);
        let pass = begin_gl_effect_pass(&mut state, &mut pipeline, None, None).unwrap();
        let target_id = get_entity_id(pipeline.scene_target.as_ref().unwrap());
        end_gl_render_pass(&state, &pass).unwrap();
        let pass = begin_gl_effect_pass(
            &mut state,
            &mut pipeline,
            None,
            Some(RenderTargetColorSpace::Linear),
        )
        .unwrap();
        let target = pipeline.scene_target.as_ref().unwrap();
        assert_eq!(get_entity_id(target), target_id);
        assert_eq!(target.axes.color_space, RenderTargetColorSpace::Linear);
        end_gl_render_pass(&state, &pass).unwrap();
    }
}

mod create_gl_effect_state {
    use flight_effects_gl::contract::{EffectStateOptions, create_gl_effect_state};
    use flight_render::RenderTargetFormat;

    use crate::gl_test_helper::make_state;

    #[test]
    fn is_a_function() {
        let state = make_state();
        let options = EffectStateOptions {
            depth: None,
            format: Some(RenderTargetFormat::Rgba16F),
            sample_count: None,
        };
        let pipeline = create_gl_effect_state(&state, Some(&options));
        assert_eq!(pipeline.options, options);
        assert!(pipeline.scene_target.is_none());
        assert!(pipeline.pool.free.is_empty());
        assert!(pipeline.lut_texture.texture.is_none());
        assert!(pipeline.velocity_texture.is_none());
    }
}

mod destroy_gl_effect_state {
    use flight_effects_gl::contract::{begin_gl_effect_pass, destroy_gl_effect_state};
    use flight_render_gl::end_gl_render_pass;

    use crate::gl_test_helper::make_state;
    use crate::make_pipeline;

    #[test]
    fn is_a_function() {
        let mut state = make_state();
        let mut pipeline = make_pipeline(&state);
        let pass = begin_gl_effect_pass(&mut state, &mut pipeline, None, None).unwrap();
        end_gl_render_pass(&state, &pass).unwrap();
        destroy_gl_effect_state(&state, &mut pipeline);
        assert!(pipeline.scene_target.is_none());
        assert!(pipeline.lut_texture.texture.is_none());
        assert!(pipeline.lut_cache.signature.is_none());
    }
}

mod end_gl_effect_pass {
    use flight_effects_gl::contract::{begin_gl_effect_pass, end_gl_effect_pass};

    use crate::gl_test_helper::{clear_calls, draws, make_state};
    use crate::make_pipeline;

    #[test]
    fn is_a_function() {
        let mut state = make_state();
        let mut pipeline = make_pipeline(&state);
        let pass = begin_gl_effect_pass(&mut state, &mut pipeline, None, None).unwrap();
        clear_calls();
        end_gl_effect_pass(&mut state, &pass, &mut pipeline, &[]).unwrap();
        // An empty chain still presents the scene to the default framebuffer.
        let recorded = draws();
        assert_eq!(recorded.len(), 1);
        assert_eq!(recorded[0].framebuffer, 0);
    }
}

mod set_gl_effect_state_skip_guard {
    use flight_effects_gl::contract::{
        begin_gl_effect_pass, end_gl_effect_pass, set_gl_effect_state_skip_guard,
    };

    use super::*;
    use crate::gl_test_helper::make_state;
    use crate::make_pipeline;

    #[test]
    fn reports_every_effect_kind_the_pass_drops_and_goes_silent_again_when_cleared() {
        let mut state = make_state();
        let mut pipeline = make_pipeline(&state);
        let dropped = Arc::new(Mutex::new(Vec::<String>::new()));
        let sink = Arc::clone(&dropped);
        let operations = chain("test.pipeline-skip-seam");

        set_gl_effect_state_skip_guard(
            &state,
            Some(Arc::new(move |_state, kind| {
                sink.lock().unwrap().push(kind.to_string())
            })),
        );
        let pass = begin_gl_effect_pass(&mut state, &mut pipeline, None, None).unwrap();
        end_gl_effect_pass(&mut state, &pass, &mut pipeline, &operations).unwrap();
        assert_eq!(
            *dropped.lock().unwrap(),
            vec!["test.pipeline-skip-seam".to_string()]
        );

        set_gl_effect_state_skip_guard(&state, None);
        let pass = begin_gl_effect_pass(&mut state, &mut pipeline, None, None).unwrap();
        end_gl_effect_pass(&mut state, &pass, &mut pipeline, &operations).unwrap();
        assert_eq!(
            *dropped.lock().unwrap(),
            vec!["test.pipeline-skip-seam".to_string()]
        );
    }
}

mod set_gl_effect_velocity_texture {
    use flight_effects_gl::contract::set_gl_effect_velocity_texture;
    use flight_render_gl::create_gl_texture;

    use crate::gl_test_helper::make_state;
    use crate::make_pipeline;

    #[test]
    fn is_a_function() {
        let state = make_state();
        let mut pipeline = make_pipeline(&state);
        let texture = create_gl_texture(&state).unwrap();
        set_gl_effect_velocity_texture(&mut pipeline, Some(texture));
        assert_eq!(pipeline.velocity_texture, Some(texture));
        set_gl_effect_velocity_texture(&mut pipeline, None);
        assert!(pipeline.velocity_texture.is_none());
    }
}
