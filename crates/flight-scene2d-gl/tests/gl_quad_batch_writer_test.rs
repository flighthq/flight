use std::num::NonZeroU32;
use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_geometry::create_matrix;
use flight_materials::contract::create_standard_material;
use flight_materials::{Material, Material2D};
use flight_render_gl::{
    GlColorAdjustmentData, GlQuadMaterialRenderer, GlRenderState, GlTextureRealization,
};
use flight_scene2d_gl::*;
use glow::{NativeProgram, NativeTexture};

use crate::gl_test_helper::{
    calls_with, count_calls, create_gl_state, last_call, uniform_location, uniform_location_of,
};

const CT_MODE_NONE: u32 = 0;
const CT_MODE_UNIFORM: u32 = 1;

fn make_texture(name: u32) -> NativeTexture {
    return NativeTexture(NonZeroU32::new(name).unwrap());
}

fn make_material() -> Ref<dyn Material2D> {
    let mut material = create_standard_material();
    material.material_fields_mut().kind = "TestMaterial".to_string();
    return Arc::new(RwLock::new(material));
}

fn renderer() -> &'static dyn GlQuadMaterialRenderer {
    return &STANDARD_GL_QUAD_MATERIAL_RENDERER;
}

fn prepare(
    state: &mut GlRenderState,
    texture: NativeTexture,
    material: Option<&Ref<dyn Material2D>>,
    max_instances: usize,
    smoothing: Option<bool>,
) -> usize {
    return prepare_gl_quad_batch_write(
        state,
        texture,
        false,
        None,
        None,
        material,
        renderer(),
        max_instances,
        smoothing,
    );
}

fn ct(scale: f32) -> GlColorAdjustmentData {
    return GlColorAdjustmentData::ColorScaleBias([scale, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 0.0]);
}

mod bind_gl_quad_batch_base_attributes {
    use super::*;

    #[test]
    fn sets_up_the_corner_and_base_instance_attribute_pointers() {
        let state = create_gl_state();
        ensure_gl_quad_batch_shader(&state);
        bind_gl_quad_batch_base_attributes(&state, 0);
        assert!(count_calls("vertex_attrib_pointer") > 0);
        assert!(count_calls("vertex_attrib_divisor") > 0);
    }
}

mod ensure_gl_quad_batch_shader {
    use super::*;

    #[test]
    fn returns_a_shader_with_a_program_and_attribute_locations() {
        let state = create_gl_state();
        let shader = ensure_gl_quad_batch_shader(&state);
        assert_eq!(shader.loc_corner, 0);
        assert!(shader.loc_world_matrix.is_some());
        assert!(shader.loc_texture.is_some());
        assert!(count_calls("create_program") > 0);
    }

    #[test]
    fn is_idempotent_returns_the_same_shader_on_repeated_calls() {
        let state = create_gl_state();
        let first = ensure_gl_quad_batch_shader(&state);
        let second = ensure_gl_quad_batch_shader(&state);
        assert_eq!(first, second);
        assert_eq!(count_calls("create_program"), 1);
    }
}

mod flush_gl_quad_batch_writer {
    use super::*;

    #[test]
    fn does_nothing_when_batch_count_is_zero() {
        let mut state = create_gl_state();
        flush_gl_quad_batch_writer(&mut state);
        assert_eq!(count_calls("draw_elements_instanced"), 0);
    }

    #[test]
    fn draws_when_instances_are_pending_and_resets_state() {
        let mut state = create_gl_state();
        prepare(&mut state, make_texture(77), None, 1, None);
        state.gl_runtime.borrow_mut().quad_batch_writer_count = 1;
        flush_gl_quad_batch_writer(&mut state);

        let draw = last_call("draw_elements_instanced");
        assert_eq!(draw.integers[1], 6);
        assert_eq!(draw.integers[3], 0);
        assert_eq!(draw.integers[4], 1);
        let runtime = state.gl_runtime.borrow();
        assert_eq!(runtime.quad_batch_writer_count, 0);
        assert!(runtime.quad_batch_writer_texture.is_none());
        assert!(runtime.quad_batch_writer_blend_mode.is_none());
        assert!(runtime.quad_batch_writer_material.is_none());
    }
}

mod pack_gl_quad_batch_material_instance {
    use super::*;

    #[test]
    fn is_a_no_op_when_no_per_instance_material_renderer_is_active() {
        let mut state = create_gl_state();
        state
            .gl_runtime
            .borrow_mut()
            .quad_batch_writer_material_renderer = None;
        pack_gl_quad_batch_material_instance(&mut state, None, 0);
    }
}

mod prepare_gl_quad_batch_write {
    use super::*;

    #[test]
    fn installs_the_pending_draw_flush_seam_on_the_render_state_runtime() {
        let mut state = create_gl_state();
        assert!(state.gl_runtime.borrow().flush_pending_draws.is_none());
        prepare(&mut state, make_texture(77), None, 1, None);
        let flush = state.gl_runtime.borrow().flush_pending_draws.unwrap();
        assert!(std::ptr::fn_addr_eq(
            flush,
            flush_gl_quad_batch_writer as fn(&mut GlRenderState)
        ));
    }

    #[test]
    fn returns_instance_index_0_for_an_empty_batch() {
        let mut state = create_gl_state();
        assert_eq!(prepare(&mut state, make_texture(77), None, 2, None), 0);
    }

    #[test]
    fn flushes_when_texture_changes() {
        let mut state = create_gl_state();
        prepare(&mut state, make_texture(77), None, 1, None);
        state.gl_runtime.borrow_mut().quad_batch_writer_count = 1;

        prepare(&mut state, make_texture(78), None, 1, None);

        assert_eq!(count_calls("draw_elements_instanced"), 1);
        assert_eq!(
            state.gl_runtime.borrow().quad_batch_writer_texture,
            Some(make_texture(78))
        );
    }

    #[test]
    fn flushes_when_material_changes() {
        let mut state = create_gl_state();
        let material_a = make_material();
        let material_b = make_material();
        prepare(&mut state, make_texture(77), Some(&material_a), 1, None);
        state.gl_runtime.borrow_mut().quad_batch_writer_count = 1;

        prepare(&mut state, make_texture(77), Some(&material_b), 1, None);

        assert_eq!(count_calls("draw_elements_instanced"), 1);
        assert!(Arc::ptr_eq(
            state
                .gl_runtime
                .borrow()
                .quad_batch_writer_material
                .as_ref()
                .unwrap(),
            &material_b
        ));
    }

    #[test]
    fn grows_instance_data_when_capacity_is_exceeded() {
        let mut state = create_gl_state();
        let initial_floats = state
            .gl_runtime
            .borrow()
            .quad_batch_writer_instance_data
            .len();

        prepare(
            &mut state,
            make_texture(77),
            None,
            initial_floats + 100,
            None,
        );

        assert!(
            state
                .gl_runtime
                .borrow()
                .quad_batch_writer_instance_data
                .len()
                > initial_floats
        );
    }

    #[test]
    fn flushes_when_per_bitmap_smoothing_changes_on_the_same_texture() {
        let mut state = create_gl_state();
        prepare(&mut state, make_texture(77), None, 1, Some(false));
        state.gl_runtime.borrow_mut().quad_batch_writer_count = 1;

        prepare(&mut state, make_texture(77), None, 1, Some(true));

        assert_eq!(count_calls("draw_elements_instanced"), 1);
        assert_eq!(
            state.gl_runtime.borrow().quad_batch_writer_smoothing,
            Some(true)
        );
    }

    #[test]
    fn keeps_same_smoothing_bitmaps_in_one_batch_no_spurious_flush() {
        let mut state = create_gl_state();
        prepare(&mut state, make_texture(77), None, 1, Some(true));
        state.gl_runtime.borrow_mut().quad_batch_writer_count = 1;
        prepare(&mut state, make_texture(77), None, 1, Some(true));

        assert_eq!(count_calls("draw_elements_instanced"), 0);
    }
}

mod record_gl_quad_batch_color_scale_bias {
    use super::*;

    #[test]
    fn skips_the_tint_draws_untinted_and_records_no_fold_state_when_color_adjustment_is_not_enabled()
     {
        let mut state = create_gl_state();
        prepare(&mut state, make_texture(77), None, 1, None);
        record_gl_quad_batch_color_scale_bias(&mut state, Some(&ct(0.5)), 0);
        state.gl_runtime.borrow_mut().quad_batch_writer_count = 1;
        assert_eq!(
            state
                .gl_runtime
                .borrow()
                .quad_batch_writer_color_scale_bias_mode
                .unwrap_or(CT_MODE_NONE),
            CT_MODE_NONE
        );
        flush_gl_quad_batch_writer(&mut state);
        assert_eq!(count_calls("uniform_4_f32"), 0);
        assert_eq!(count_calls("draw_elements_instanced"), 1);
    }

    #[test]
    fn is_a_no_op_for_an_untinted_instance_whether_or_not_the_fold_is_enabled() {
        let mut state = create_gl_state();
        record_gl_quad_batch_color_scale_bias(&mut state, None, 0);
        assert_eq!(
            state
                .gl_runtime
                .borrow()
                .quad_batch_writer_color_scale_bias_mode
                .unwrap_or(CT_MODE_NONE),
            CT_MODE_NONE
        );
    }

    #[test]
    fn delegates_to_the_installed_fold_when_color_adjustment_is_enabled() {
        let mut state = create_gl_state();
        register_gl_color_adjustment_material_feature(&mut state);
        record_gl_quad_batch_color_scale_bias(&mut state, Some(&ct(0.5)), 0);
        assert_eq!(
            state
                .gl_runtime
                .borrow()
                .quad_batch_writer_color_scale_bias_mode,
            Some(CT_MODE_UNIFORM)
        );
    }
}

mod set_gl_quad_batch_world_and_texture {
    use super::*;

    #[test]
    fn uploads_the_world_matrix_and_texture_unit() {
        let state = create_gl_state();
        set_gl_quad_batch_world_and_texture(
            &state,
            Some(&uniform_location("world")),
            Some(&uniform_location("texture")),
            None,
        );
        assert_eq!(count_calls("uniform_matrix_3_f32"), 1);
        assert_eq!(count_calls("uniform_1_i32"), 1);
    }

    #[test]
    fn uploads_the_currently_bound_compressed_texture_alpha_representation() {
        let state = create_gl_state();
        state
            .context_state
            .runtime_state
            .borrow_mut()
            .current_texture_realization = Some(GlTextureRealization {
            straight_alpha: true,
            texture: make_texture(5),
        });

        set_gl_quad_batch_world_and_texture(
            &state,
            Some(&uniform_location("world")),
            Some(&uniform_location("texture")),
            Some(&uniform_location("straight")),
        );

        let straight = uniform_location_of("straight") as i64;
        assert!(
            calls_with("uniform_1_i32")
                .iter()
                .any(|call| call.integers == vec![straight, 1])
        );
    }
}

mod use_gl_quad_batch_program {
    use super::*;

    #[test]
    fn binds_the_program_and_records_it_as_current() {
        let state = create_gl_state();
        let program = NativeProgram(NonZeroU32::new(42).unwrap());
        use_gl_quad_batch_program(&state, program);
        assert_eq!(last_call("use_program").integers, vec![42]);
        assert_eq!(
            state
                .context_state
                .runtime_state
                .borrow()
                .binding
                .as_ref()
                .map(|binding| binding.program),
            Some(program)
        );
    }
}

mod write_gl_quad_batch_affine_instance {
    use super::*;

    #[test]
    fn packs_pre_scaled_geometry_and_two_affine_uv_axes_into_thirteen_floats() {
        let mut data = [0.0_f32; 13];
        write_gl_quad_batch_affine_instance(
            &mut data,
            0,
            &create_matrix(2.0, 3.0, 4.0, 5.0, 6.0, 7.0),
            10.0,
            20.0,
            0.1,
            0.2,
            0.3,
            0.4,
            0.5,
            0.6,
            0.9,
        );
        assert_eq!(&data[0..6], &[20.0, 30.0, 80.0, 100.0, 6.0, 7.0]);
        for (index, expected) in [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.9].iter().enumerate() {
            // D1 f32 bound (TS: toBeCloseTo 2 digits)
            assert!((data[index + 6] - expected).abs() <= 0.005);
        }
    }
}

mod write_gl_quad_batch_instance {
    use super::*;

    #[test]
    fn maps_an_axis_aligned_uv_rectangle_onto_the_affine_record() {
        let mut data = [0.0_f32; 13];
        write_gl_quad_batch_instance(
            &mut data,
            0,
            &create_matrix(1.0, 0.0, 0.0, 1.0, 2.0, 3.0),
            4.0,
            5.0,
            0.1,
            0.2,
            0.7,
            0.8,
            0.9,
        );
        for (index, expected) in [0.1, 0.2, 0.6, 0.0, 0.0, 0.6, 0.9].iter().enumerate() {
            // D1 f32 bound (TS: toBeCloseTo 2 digits)
            assert!((data[index + 6] - expected).abs() <= 0.005);
        }
    }
}
