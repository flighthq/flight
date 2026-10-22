use std::panic::{AssertUnwindSafe, catch_unwind};

use flight_entity::{FlightError, get_entity_id};
use flight_node::NodeRef;
use flight_quadbatch::{QUAD_BATCH_KIND, QuadTransformType, get_quad_batch_runtime};
use flight_render_wgpu::*;
use flight_scene2d::DISPLAY_OBJECT_KIND;
use flight_scene2d_wgpu::contract::*;
use flight_textureatlas::TextureAtlasRotation;
use flight_velocity::{begin_velocity_frame, contribute_velocity, create_velocity_field};

use crate::support::*;

fn velocity_writes(
    records: &std::sync::Arc<std::sync::Mutex<Vec<WgpuCommandRecord>>>,
) -> Vec<Vec<f32>> {
    return recorded_buffer_writes(records)
        .into_iter()
        .filter(|write| write.data.len() == 32)
        .map(|write| bytes_to_f32(&write.data))
        .collect();
}

mod create_wgpu_velocity_target {
    use super::*;

    #[test]
    fn allocates_an_rgba16float_target_at_the_requested_size() {
        let state = create_wgpu_render_state_for_test(None);
        let target = create_wgpu_velocity_target(&state, 128.0, 64.0);
        assert_eq!(target.format, wgpu::TextureFormat::Rgba16Float);
        assert_eq!(target.width, 128);
        assert_eq!(target.height, 64);
    }
}

mod draw_wgpu_velocity_quad {
    use super::*;

    #[test]
    fn is_a_no_op_outside_an_active_velocity_pass() {
        let mut state = create_wgpu_render_state_for_test(None);
        let records = record_test_commands(&get_wgpu_render_state_native_device(&state));
        let field = create_velocity_field();
        let mut ctx = WgpuVelocityContext {
            state: &mut state,
            field: &field,
            width: 128.0,
            height: 64.0,
            pixel_ratio: 1.0,
        };
        draw_wgpu_velocity_quad(&mut ctx, 0.0, 0.0, 10.0, 10.0, 1.0, 0.0);
        assert!(velocity_writes(&records).is_empty());
    }
}

mod get_wgpu_velocity_writer {
    use super::*;

    #[test]
    fn returns_none_for_an_unregistered_kind() {
        let state = create_wgpu_render_state_for_test(None);
        assert!(get_wgpu_velocity_writer(&state, &"unregistered".to_string()).is_none());
    }
}

mod register_wgpu_velocity_writer {
    use super::*;

    fn replacement(_ctx: &mut WgpuVelocityContext<'_>, _node: &NodeRef) {}

    #[test]
    fn registers_a_writer_dispatched_by_kind() {
        let mut state = create_wgpu_render_state_for_test(None);
        register_wgpu_velocity_writer(
            &mut state,
            DISPLAY_OBJECT_KIND.to_string(),
            wgpu_node2d_velocity_writer,
        );
        assert!(std::ptr::fn_addr_eq(
            get_wgpu_velocity_writer(&state, &DISPLAY_OBJECT_KIND.to_string()).unwrap(),
            wgpu_node2d_velocity_writer as WgpuVelocityWriter
        ));
    }

    #[test]
    fn replaces_persistent_snapshots_and_preserves_a_derived_pipeline_snapshot() {
        let mut state = create_wgpu_render_state_for_test(None);
        let kind = "acme.Velocity".to_string();
        let before = get_wgpu_render_state_runtime(&state)
            .registries
            .velocity_writers
            .clone();

        register_wgpu_velocity_writer(&mut state, kind.clone(), wgpu_node2d_velocity_writer);
        let registered = get_wgpu_render_state_runtime(&state)
            .registries
            .velocity_writers
            .clone();
        let WgpuOffscreenRenderStateResult::Ok(offscreen) =
            create_wgpu_offscreen_render_state(&state)
        else {
            panic!("a live device derives an offscreen state");
        };
        register_wgpu_velocity_writer(&mut state, kind.clone(), replacement);

        assert!(!std::sync::Arc::ptr_eq(&registered, &before));
        assert!(!before.entries.contains_key(&kind));
        assert!(std::ptr::fn_addr_eq(
            get_wgpu_velocity_writer(&state, &kind).unwrap(),
            replacement as WgpuVelocityWriter
        ));
        assert!(std::ptr::fn_addr_eq(
            get_wgpu_velocity_writer(&offscreen.state, &kind).unwrap(),
            wgpu_node2d_velocity_writer as WgpuVelocityWriter
        ));
    }
}

mod render_wgpu_velocity {
    use super::*;

    #[test]
    fn dispatches_the_registered_writer_for_a_moving_node() {
        let mut state = create_wgpu_render_state_for_test(None);
        let target = create_wgpu_velocity_target(&state, 128.0, 64.0);
        let root: NodeRef = flight_scene2d::create_display_object();
        register_wgpu_velocity_writer(
            &mut state,
            DISPLAY_OBJECT_KIND.to_string(),
            wgpu_node2d_velocity_writer,
        );
        let mut field = create_velocity_field();
        begin_velocity_frame(&mut field);
        contribute_velocity(&mut field, get_entity_id(&*root.read().unwrap()), 3.0, -2.0);
        open_test_screen_pass(&mut state);
        let records = record_test_commands(&get_wgpu_render_state_native_device(&state));

        render_wgpu_velocity(&mut state, &root, &field, &target);

        let writes = velocity_writes(&records);
        assert_eq!(writes.len(), 1);
        assert_eq!(&writes[0][4..6], &[3.0, -2.0]);
        // The caller's pass is resumed with its pixels intact.
        assert!(get_wgpu_render_state_runtime(&state).render_pass.is_some());
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn panics_when_no_command_encoder_is_open() {
        let mut state = create_wgpu_render_state_for_test(None);
        let target = create_wgpu_velocity_target(&state, 128.0, 64.0);
        let root: NodeRef = flight_scene2d::create_display_object();
        let mut field = create_velocity_field();
        begin_velocity_frame(&mut field);

        let error = catch_unwind(AssertUnwindSafe(|| {
            render_wgpu_velocity(&mut state, &root, &field, &target);
        }))
        .unwrap_err();
        let error = error.downcast_ref::<FlightError>().unwrap();
        assert!(error.message.contains("command encoder"));
    }
}

mod wgpu_node2d_velocity_writer {
    use super::*;

    #[test]
    fn draws_nothing_when_called_outside_a_velocity_pass() {
        let mut state = create_wgpu_render_state_for_test(None);
        let records = record_test_commands(&get_wgpu_render_state_native_device(&state));
        let root: NodeRef = flight_scene2d::create_display_object();
        let mut field = create_velocity_field();
        begin_velocity_frame(&mut field);
        contribute_velocity(&mut field, get_entity_id(&*root.read().unwrap()), 3.0, -2.0);
        let mut ctx = WgpuVelocityContext {
            state: &mut state,
            field: &field,
            width: 128.0,
            height: 64.0,
            pixel_ratio: 1.0,
        };
        wgpu_node2d_velocity_writer(&mut ctx, &root);
        assert!(velocity_writes(&records).is_empty());
    }

    #[test]
    fn skips_a_node_at_rest() {
        let mut state = create_wgpu_render_state_for_test(None);
        let target = create_wgpu_velocity_target(&state, 128.0, 64.0);
        let root: NodeRef = flight_scene2d::create_display_object();
        register_wgpu_velocity_writer(
            &mut state,
            DISPLAY_OBJECT_KIND.to_string(),
            wgpu_node2d_velocity_writer,
        );
        let mut field = create_velocity_field();
        begin_velocity_frame(&mut field);
        open_test_screen_pass(&mut state);
        let records = record_test_commands(&get_wgpu_render_state_native_device(&state));

        render_wgpu_velocity(&mut state, &root, &field, &target);

        assert!(velocity_writes(&records).is_empty());
        submit_wgpu_frame(&mut state);
    }
}

mod wgpu_particle_emitter2d_velocity_writer {
    use super::*;

    #[test]
    fn skips_an_emitter_without_an_atlas() {
        let mut state = create_wgpu_render_state_for_test(None);
        let records = record_test_commands(&get_wgpu_render_state_native_device(&state));
        let emitter: NodeRef = flight_particleemitter::create_particle_emitter_2d();
        let field = create_velocity_field();
        let mut ctx = WgpuVelocityContext {
            state: &mut state,
            field: &field,
            width: 128.0,
            height: 64.0,
            pixel_ratio: 1.0,
        };
        wgpu_particle_emitter2d_velocity_writer(&mut ctx, &emitter);
        assert!(velocity_writes(&records).is_empty());
    }

    #[test]
    fn emits_per_particle_velocity_for_an_emitter_with_a_velocities_array() {
        let mut state = create_wgpu_render_state_for_test(None);
        let target = create_wgpu_velocity_target(&state, 128.0, 64.0);
        let emitter = flight_particleemitter::create_particle_emitter_2d();
        flight_particleemitter::reserve_particle_emitter_2d(&emitter, 2);
        {
            let mut emitter = emitter.write().unwrap();
            emitter.data.atlas = Some(create_test_atlas(
                16,
                16,
                &[(0.0, 0.0, 16.0, 16.0, TextureAtlasRotation::None)],
            ));
            emitter.data.particle_count = 2;
            emitter.data.ids[0] = 0;
            emitter.data.ids[1] = 0;
            emitter.data.transforms[..8]
                .copy_from_slice(&[10.0, 10.0, 0.0, 1.0, 40.0, 20.0, 0.0, 1.0]);
            emitter.data.velocities[..4].copy_from_slice(&[3.0, -2.0, -1.0, 4.0]);
        }
        let node: NodeRef = emitter;
        let kind = node.read().unwrap().node_fields().kind.clone();
        register_wgpu_velocity_writer(&mut state, kind, wgpu_particle_emitter2d_velocity_writer);
        let mut field = create_velocity_field();
        begin_velocity_frame(&mut field);
        open_test_screen_pass(&mut state);
        let records = record_test_commands(&get_wgpu_render_state_native_device(&state));

        render_wgpu_velocity(&mut state, &node, &field, &target);

        let writes = velocity_writes(&records);
        assert_eq!(writes.len(), 2);
        assert_eq!(&writes[0][4..6], &[3.0, -2.0]);
        assert_eq!(&writes[1][4..6], &[-1.0, 4.0]);
        submit_wgpu_frame(&mut state);
    }
}

mod wgpu_quad_batch_velocity_writer {
    use super::*;

    #[test]
    fn falls_back_to_the_coarse_node_velocity_without_per_instance_velocities() {
        let mut state = create_wgpu_render_state_for_test(None);
        let records = record_test_commands(&get_wgpu_render_state_native_device(&state));
        let batch: NodeRef = flight_quadbatch::create_quad_batch();
        let field = create_velocity_field();
        let mut ctx = WgpuVelocityContext {
            state: &mut state,
            field: &field,
            width: 128.0,
            height: 64.0,
            pixel_ratio: 1.0,
        };
        // At rest in the field and outside a pass: the coarse fallback draws nothing.
        wgpu_quad_batch_velocity_writer(&mut ctx, &batch);
        assert!(velocity_writes(&records).is_empty());
    }

    #[test]
    fn emits_per_instance_velocity_for_a_batch_with_an_instance_velocities_array() {
        let mut state = create_wgpu_render_state_for_test(None);
        let target = create_wgpu_velocity_target(&state, 128.0, 64.0);
        let batch = flight_quadbatch::create_quad_batch();
        {
            let mut batch = batch.write().unwrap();
            batch.data.atlas = Some(create_test_atlas(
                32,
                32,
                &[(0.0, 0.0, 32.0, 32.0, TextureAtlasRotation::None)],
            ));
            batch.data.ids = vec![0, 0];
            batch.data.instance_count = 2;
            batch.data.transforms = vec![0.0, 0.0, 40.0, 10.0];
            batch.data.transform_type = QuadTransformType::Vector2;
            get_quad_batch_runtime(&batch)
                .write()
                .unwrap()
                .instance_velocities = Some(vec![3.0, -2.0, -1.0, 4.0]);
        }
        register_wgpu_velocity_writer(
            &mut state,
            QUAD_BATCH_KIND.to_string(),
            wgpu_quad_batch_velocity_writer,
        );
        let node: NodeRef = batch;
        let mut field = create_velocity_field();
        begin_velocity_frame(&mut field);
        open_test_screen_pass(&mut state);
        let records = record_test_commands(&get_wgpu_render_state_native_device(&state));

        render_wgpu_velocity(&mut state, &node, &field, &target);

        let writes = velocity_writes(&records);
        assert_eq!(writes.len(), 2);
        // The second instance sits at (40, 10) on a 128x64 target: clip x0 = 40/128*2-1.
        assert!((writes[1][0] - (40.0 / 128.0 * 2.0 - 1.0)).abs() < 1e-6);
        assert_eq!(&writes[1][4..6], &[-1.0, 4.0]);
        submit_wgpu_frame(&mut state);
    }
}
