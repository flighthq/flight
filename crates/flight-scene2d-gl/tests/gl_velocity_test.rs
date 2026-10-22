use std::rc::Rc;

use flight_entity::{Ref, get_entity_id};
use flight_node::NodeRef;
use flight_particleemitter::contract::{create_particle_emitter_2d, reserve_particle_emitter_2d};
use flight_quadbatch::{QUAD_BATCH_KIND, QuadTransformType, create_quad_batch, get_quad_batch_runtime};
use flight_render::RenderTargetFormat;
use flight_render_gl::{GlRenderStateOptions, create_gl_render_state};
use flight_scene2d_gl::*;
use flight_textureatlas::{TextureAtlas, add_texture_atlas_region, create_texture_atlas};
use flight_velocity::{begin_velocity_frame, contribute_velocity, create_velocity_field};
use glow::HasContext;

use crate::gl_test_helper::{calls_with, count_calls, create_gl_state, display_node, last_call, snapshot};

fn region_atlas(size: f32) -> Ref<TextureAtlas> {
    let atlas = create_texture_atlas();
    add_texture_atlas_region(&mut atlas.write().unwrap(), 0.0, 0.0, size, size, None, None, None);
    return atlas;
}

fn kind_of(node: &NodeRef) -> String {
    return node.read().unwrap().node_fields().kind.clone();
}

fn writer_addr(writer: GlVelocityWriter) -> usize {
    return writer as usize;
}

mod create_gl_velocity_target {
    use super::*;

    #[test]
    fn allocates_an_rgba16f_target_at_the_requested_size() {
        let state = create_gl_state();
        let target = create_gl_velocity_target(&state, 128.0, 64.0);
        // The mock context reports no float color-buffer extension, so the effective axes may
        // downgrade; the request carries the source's rgba16f.
        assert_eq!(target.requested_axes.format, RenderTargetFormat::Rgba16F);
        assert_eq!(target.axes.width, 128);
        assert_eq!(target.axes.height, 64);
    }
}

mod draw_gl_velocity_quad {
    use super::*;

    #[test]
    fn maps_a_device_pixel_rect_into_clip_space_and_scales_velocity_by_the_pixel_ratio() {
        let mut state = create_gl_state();
        let field = create_velocity_field();
        let mut ctx = GlVelocityContext {
            state: &mut state,
            field: &field,
            width: 100.0,
            height: 50.0,
            pixel_ratio: 2.0,
        };

        draw_gl_velocity_quad(&mut ctx, 25.0, 10.0, 50.0, 25.0, 3.0, -1.0);

        assert_eq!(last_call("uniform_4_f32").floats, vec![-0.5, 0.6, 1.0, -1.0]);
        assert_eq!(last_call("uniform_2_f32").floats, vec![6.0, -2.0]);
        assert_eq!(count_calls("draw_arrays"), 1);
    }
}

mod get_gl_velocity_writer {
    use super::*;

    #[test]
    fn returns_null_for_an_unregistered_kind() {
        let state = create_gl_state();
        assert!(get_gl_velocity_writer(&state, &"unregistered".to_string()).is_none());
    }
}

fn call_writer(writer: GlVelocityWriter, node: &NodeRef, velocity: Option<(f32, f32)>) {
    let mut state = create_gl_state();
    let mut field = create_velocity_field();
    begin_velocity_frame(&mut field);
    if let Some((x, y)) = velocity {
        contribute_velocity(&mut field, get_entity_id(&*node.read().unwrap()), x, y);
    }
    let mut ctx = GlVelocityContext {
        state: &mut state,
        field: &field,
        width: 128.0,
        height: 64.0,
        pixel_ratio: 1.0,
    };
    writer(&mut ctx, node);
}

mod gl_node2d_velocity_writer {
    use super::*;

    #[test]
    fn is_a_velocity_writer_function() {
        let node = display_node();
        gl_node2d_velocity_writer_direct(&node);
        assert_eq!(count_calls("draw_arrays"), 1);
    }

    fn gl_node2d_velocity_writer_direct(node: &NodeRef) {
        let mut state = create_gl_state();
        let mut field = create_velocity_field();
        begin_velocity_frame(&mut field);
        contribute_velocity(&mut field, get_entity_id(&*node.read().unwrap()), 1.0, 1.0);
        let mut ctx = GlVelocityContext {
            state: &mut state,
            field: &field,
            width: 128.0,
            height: 64.0,
            pixel_ratio: 1.0,
        };
        gl_node2d_velocity_writer(&mut ctx, node);
    }

    #[test]
    fn covers_the_node_world_bounds_with_its_field_velocity() {
        let mut state = create_gl_state();
        let target = create_gl_velocity_target(&state, 128.0, 64.0);
        let root = display_node();
        register_gl_velocity_writer(&mut state, kind_of(&root), gl_node2d_velocity_writer);
        let mut field = create_velocity_field();
        begin_velocity_frame(&mut field);
        contribute_velocity(&mut field, get_entity_id(&*root.read().unwrap()), 3.0, -2.0);

        render_gl_velocity(&mut state, &root, &field, &target);

        assert_eq!(last_call("uniform_2_f32").floats, vec![3.0, -2.0]);
    }
}

mod gl_particle_emitter2d_velocity_writer {
    use super::*;

    #[test]
    fn is_a_velocity_writer_function() {
        let node: NodeRef = create_particle_emitter_2d();
        call_writer(gl_particle_emitter2d_velocity_writer, &node, None);
        let mut state = create_gl_state();
        let field = create_velocity_field();
        let mut ctx = GlVelocityContext {
            state: &mut state,
            field: &field,
            width: 1.0,
            height: 1.0,
            pixel_ratio: 1.0,
        };
        gl_particle_emitter2d_velocity_writer(&mut ctx, &node);
        assert_eq!(count_calls("draw_arrays"), 0);
    }

    #[test]
    fn emits_per_particle_velocity_for_an_emitter_with_a_velocities_array_without_throwing() {
        let mut state = create_gl_state();
        let target = create_gl_velocity_target(&state, 128.0, 64.0);
        let emitter = create_particle_emitter_2d();
        reserve_particle_emitter_2d(&emitter, 2);
        {
            let mut emitter = emitter.write().unwrap();
            emitter.data.atlas = Some(region_atlas(16.0));
            emitter.data.particle_count = 2;
            emitter.data.ids[0] = 0;
            emitter.data.ids[1] = 0;
            emitter.data.transforms[..8]
                .copy_from_slice(&[10.0, 10.0, 0.0, 1.0, 40.0, 20.0, 0.0, 1.0]);
            emitter.data.velocities[..4].copy_from_slice(&[3.0, -2.0, -1.0, 4.0]);
        }
        let node: NodeRef = emitter;
        register_gl_velocity_writer(&mut state, kind_of(&node), gl_particle_emitter2d_velocity_writer);
        let mut field = create_velocity_field();
        begin_velocity_frame(&mut field);

        render_gl_velocity(&mut state, &node, &field, &target);

        assert_eq!(count_calls("draw_arrays"), 2);
    }
}

mod gl_quad_batch_velocity_writer {
    use super::*;

    #[test]
    fn is_a_velocity_writer_function() {
        let node: NodeRef = create_quad_batch();
        call_writer(gl_quad_batch_velocity_writer, &node, Some((2.0, 1.0)));
        assert_eq!(count_calls("draw_arrays"), 1);
        let mut state = create_gl_state();
        let field = create_velocity_field();
        let mut ctx = GlVelocityContext {
            state: &mut state,
            field: &field,
            width: 1.0,
            height: 1.0,
            pixel_ratio: 1.0,
        };
        gl_quad_batch_velocity_writer(&mut ctx, &node);
        assert_eq!(count_calls("draw_arrays"), 0);
    }

    #[test]
    fn emits_per_instance_velocity_for_a_batch_with_an_instance_velocities_array_without_throwing() {
        let mut state = create_gl_state();
        let target = create_gl_velocity_target(&state, 128.0, 64.0);
        let batch = create_quad_batch();
        {
            let mut batch = batch.write().unwrap();
            batch.data.atlas = Some(region_atlas(32.0));
            batch.data.ids = vec![0, 0];
            batch.data.instance_count = 2;
            batch.data.transforms = vec![0.0, 0.0, 40.0, 10.0];
            batch.data.transform_type = QuadTransformType::Vector2;
            // The batch owns its per-instance velocity (NOT the VelocityField).
            get_quad_batch_runtime(&batch).write().unwrap().instance_velocities =
                Some(vec![3.0, -2.0, -1.0, 4.0]);
        }
        let node: NodeRef = batch;
        register_gl_velocity_writer(&mut state, QUAD_BATCH_KIND.to_string(), gl_quad_batch_velocity_writer);
        let mut field = create_velocity_field();
        begin_velocity_frame(&mut field);

        render_gl_velocity(&mut state, &node, &field, &target);

        assert_eq!(count_calls("draw_arrays"), 2);
    }

    #[test]
    fn falls_back_to_coarse_batch_velocity_when_no_instance_velocities_array_is_present() {
        let mut state = create_gl_state();
        let target = create_gl_velocity_target(&state, 128.0, 64.0);
        let batch = create_quad_batch();
        {
            let mut batch = batch.write().unwrap();
            batch.data.atlas = Some(region_atlas(32.0));
            batch.data.ids = vec![0];
            batch.data.instance_count = 1;
            batch.data.transforms = vec![0.0, 0.0];
        }
        let node: NodeRef = batch;
        register_gl_velocity_writer(&mut state, QUAD_BATCH_KIND.to_string(), gl_quad_batch_velocity_writer);
        let mut field = create_velocity_field();
        begin_velocity_frame(&mut field);
        contribute_velocity(&mut field, get_entity_id(&*node.read().unwrap()), 5.0, 1.0);

        render_gl_velocity(&mut state, &node, &field, &target);

        assert_eq!(last_call("uniform_2_f32").floats, vec![5.0, 1.0]);
    }
}

mod register_gl_velocity_writer {
    use super::*;

    fn replacement(_ctx: &mut GlVelocityContext<'_>, _node: &NodeRef) {}

    #[test]
    fn registers_a_writer_dispatched_by_kind() {
        let mut state = create_gl_state();
        let root = display_node();
        register_gl_velocity_writer(&mut state, kind_of(&root), gl_node2d_velocity_writer);
        assert_eq!(
            get_gl_velocity_writer(&state, &kind_of(&root)).map(writer_addr),
            Some(writer_addr(gl_node2d_velocity_writer))
        );
    }

    #[test]
    fn replaces_persistent_snapshots_and_preserves_a_derived_pipeline_snapshot() {
        let mut state = create_gl_state();
        let kind = "acme.Velocity".to_string();
        let before = state.gl_registries.velocity_writers.clone();

        register_gl_velocity_writer(&mut state, kind.clone(), gl_node2d_velocity_writer);
        let registered = state.gl_registries.velocity_writers.clone();
        let mut options = crate::gl_test_helper::test_default::<GlRenderStateOptions>();
        options.gl_registries = state.gl_registries.clone();
        let offscreen = create_gl_render_state(Rc::clone(&state.context_state), Some(&options));
        register_gl_velocity_writer(&mut state, kind.clone(), replacement);

        assert!(!std::sync::Arc::ptr_eq(&registered, &before));
        assert!(!before.entries.contains_key(&kind));
        assert_eq!(
            get_gl_velocity_writer(&state, &kind).map(writer_addr),
            Some(writer_addr(replacement))
        );
        assert_eq!(
            get_gl_velocity_writer(&offscreen, &kind).map(writer_addr),
            Some(writer_addr(gl_node2d_velocity_writer))
        );
    }
}

mod render_gl_velocity {
    use super::*;

    #[test]
    fn leaves_the_blend_enable_bit_viewport_and_clear_colour_as_it_found_them() {
        let mut state = create_gl_state();
        // SAFETY: test GL calls on the mock context's thread.
        unsafe {
            state.gl.enable(glow::BLEND);
            state.gl.viewport(7, 8, 320, 240);
            state.gl.clear_color(0.25, 0.5, 0.75, 1.0);
        }
        let target = create_gl_velocity_target(&state, 128.0, 64.0);
        let root = display_node();
        register_gl_velocity_writer(&mut state, kind_of(&root), gl_node2d_velocity_writer);
        let mut field = create_velocity_field();
        begin_velocity_frame(&mut field);
        contribute_velocity(&mut field, get_entity_id(&*root.read().unwrap()), 3.0, -2.0);

        render_gl_velocity(&mut state, &root, &field, &target);

        let mock = snapshot();
        assert!(mock.enabled.contains(&glow::BLEND));
        assert_eq!(mock.viewport, [7, 8, 320, 240]);
        assert_eq!(mock.clear_color, [0.25, 0.5, 0.75, 1.0]);
        let last_program = last_call("use_program").integers[0];
        assert_eq!(
            state
                .context_state
                .runtime_state
                .borrow()
                .binding
                .as_ref()
                .map(|binding| i64::from(binding.program.0.get())),
            Some(last_program)
        );
    }

    #[test]
    fn dispatches_the_registered_writer_for_a_moving_node_without_throwing() {
        let mut state = create_gl_state();
        let target = create_gl_velocity_target(&state, 128.0, 64.0);
        let root = display_node();
        register_gl_velocity_writer(&mut state, kind_of(&root), gl_node2d_velocity_writer);
        let mut field = create_velocity_field();
        begin_velocity_frame(&mut field);
        contribute_velocity(&mut field, get_entity_id(&*root.read().unwrap()), 3.0, -2.0);

        render_gl_velocity(&mut state, &root, &field, &target);

        assert_eq!(count_calls("draw_arrays"), 1);
    }

    #[test]
    fn runs_without_throwing_when_no_writer_is_registered() {
        let mut state = create_gl_state();
        let target = create_gl_velocity_target(&state, 128.0, 64.0);
        let root = display_node();
        let mut field = create_velocity_field();
        begin_velocity_frame(&mut field);

        render_gl_velocity(&mut state, &root, &field, &target);

        assert!(calls_with("draw_arrays").is_empty());
    }
}
