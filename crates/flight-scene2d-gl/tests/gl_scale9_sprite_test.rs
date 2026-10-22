use std::cell::RefCell;
use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_geometry::create_rectangle;
use flight_materials::contract::create_standard_material;
use flight_materials::{Material, Material2D, MaterialData};
use flight_node::NodeRef;
use flight_render::{
    BatchFormat, RenderProxies2D, RenderProxy2D, get_or_create_render_proxy_2d,
    prepare_scene_2d_render, register_node_renderer,
};
use flight_render_gl::{
    GlColorAdjustmentData, GlColorAdjustmentMaterialFeature, GlQuadMaterialRenderer, GlRenderState,
    GlRenderStateRuntime, GlShapeMesh, register_gl_bitmap_texture_resolver,
    register_gl_quad_material_renderer,
};
use flight_scene2d::{SCALE9_SPRITE_KIND, Scale9Sprite, create_scale9_sprite};
use flight_scene2d_gl::contract::*;

use crate::gl_test_helper::{calls_with, create_gl_state, make_bitmap_texture, make_proxies};

const INSTANCE_FLOATS: usize = 13;

thread_local! {
    static PACKED: RefCell<Vec<usize>> = const { RefCell::new(Vec::new()) };
    static RECORDED: RefCell<Vec<usize>> = const { RefCell::new(Vec::new()) };
}

struct RecordingMaterialRenderer;

static RECORDING_MATERIAL_RENDERER: RecordingMaterialRenderer = RecordingMaterialRenderer;

impl GlQuadMaterialRenderer for RecordingMaterialRenderer {
    fn instance_float_count(&self) -> usize {
        return 1;
    }

    fn bind(&self, _state: &mut GlRenderState, _material: Option<&dyn Material2D>) {}

    fn pack_instance(
        &self,
        _state: &mut GlRenderState,
        _material_data: Option<&dyn MaterialData>,
        _out: &mut [f32],
        offset: usize,
    ) {
        PACKED.with(|calls| calls.borrow_mut().push(offset));
    }
}

fn record_adjustment(
    _runtime: &mut GlRenderStateRuntime,
    _value: Option<&GlColorAdjustmentData>,
    instance_index: usize,
) {
    RECORDED.with(|calls| calls.borrow_mut().push(instance_index));
}

fn draw_no_meshes(
    _state: &mut GlRenderState,
    _proxy: &RenderProxy2D<GlRenderState>,
    _meshes: &[GlShapeMesh],
) {
}

fn flush_unhandled(_state: &mut GlRenderState, _count: usize) -> bool {
    return false;
}

static RECORDING_FEATURE: GlColorAdjustmentMaterialFeature = GlColorAdjustmentMaterialFeature {
    fragment_shader_chunk: "",
    matrix_fragment_shader_chunk: "",
    draw_shape_meshes: draw_no_meshes,
    flush: flush_unhandled,
    record: record_adjustment,
};

fn create_test_scale9_sprite(width: u32, height: u32) -> Ref<Scale9Sprite> {
    let sprite = create_scale9_sprite(&create_rectangle(10.0, 5.0, 15.0, 10.0));
    sprite.write().unwrap().data.texture = Some(make_bitmap_texture(width, height));
    return sprite;
}

fn prepare_scale9_sprite<'a>(
    state: &mut GlRenderState,
    proxies: &'a mut RenderProxies2D<GlRenderState>,
    source: &NodeRef,
) -> &'a RenderProxy2D<GlRenderState> {
    register_node_renderer(
        state,
        SCALE9_SPRITE_KIND.to_string(),
        &GL_SCALE9_SPRITE_RENDERER,
    );
    prepare_scene_2d_render(state, proxies, source);
    return get_or_create_render_proxy_2d(state, proxies, source);
}

mod draw_gl_scale9_sprite {
    use super::*;

    #[test]
    fn emits_all_nine_stretched_quads_with_matching_texture_segments() {
        let mut state = create_gl_state();
        register_gl_bitmap_texture_resolver(&mut state);
        register_gl_standard_material(&mut state);
        let source = create_test_scale9_sprite(40, 30);
        {
            let mut sprite = source.write().unwrap();
            sprite.x = 7.0;
            sprite.y = 11.0;
            sprite.scale_x = 2.0;
            sprite.scale_y = 3.0;
        }
        let node: NodeRef = source;
        let mut proxies = make_proxies();
        let proxy = prepare_scale9_sprite(&mut state, &mut proxies, &node);

        draw_gl_scale9_sprite(&mut state, proxy);

        let runtime = state.gl_runtime.borrow();
        assert_eq!(runtime.quad_batch_writer_count, 9);
        let expected = [
            [7.0, 11.0, 10.0, 5.0, 0.0, 0.0, 0.25, 1.0 / 6.0],
            [17.0, 11.0, 55.0, 5.0, 0.25, 0.0, 0.625, 1.0 / 6.0],
            [72.0, 11.0, 15.0, 5.0, 0.625, 0.0, 1.0, 1.0 / 6.0],
            [7.0, 16.0, 10.0, 70.0, 0.0, 1.0 / 6.0, 0.25, 0.5],
            [17.0, 16.0, 55.0, 70.0, 0.25, 1.0 / 6.0, 0.625, 0.5],
            [72.0, 16.0, 15.0, 70.0, 0.625, 1.0 / 6.0, 1.0, 0.5],
            [7.0, 86.0, 10.0, 15.0, 0.0, 0.5, 0.25, 1.0],
            [17.0, 86.0, 55.0, 15.0, 0.25, 0.5, 0.625, 1.0],
            [72.0, 86.0, 15.0, 15.0, 0.625, 0.5, 1.0, 1.0],
        ];
        let d = &runtime.quad_batch_writer_instance_data;
        for (index, segment) in expected.iter().enumerate() {
            let base = index * INSTANCE_FLOATS;
            assert_eq!(d[base + 12], 1.0);
            let actual = [
                d[base + 4],
                d[base + 5],
                d[base],
                d[base + 3],
                d[base + 6],
                d[base + 7],
                d[base + 6] + d[base + 8],
                d[base + 7] + d[base + 11],
            ];
            for (value, expected) in actual.iter().zip(segment.iter()) {
                // D1 f32 bound (TS: toBeCloseTo 2 digits)
                assert!(
                    (value - expected).abs() <= 0.005,
                    "segment {index}: {actual:?}"
                );
            }
        }
    }

    // The writer returns an instance index; the float cursor must start at index * stride so a
    // second sprite batched after the first writes its own instances (the TS source seeds the
    // cursor with the bare index, a real bug fixed in Rust).
    #[test]
    fn writes_a_second_sprite_after_the_first_in_a_non_empty_batch() {
        let mut state = create_gl_state();
        register_gl_bitmap_texture_resolver(&mut state);
        register_gl_standard_material(&mut state);
        let first = create_test_scale9_sprite(40, 30);
        {
            let mut sprite = first.write().unwrap();
            sprite.x = 7.0;
            sprite.y = 11.0;
        }
        let texture = first.read().unwrap().data.texture.clone();
        let second = create_test_scale9_sprite(40, 30);
        {
            let mut sprite = second.write().unwrap();
            sprite.data.texture = texture;
            sprite.x = 100.0;
            sprite.y = 200.0;
        }
        let first: NodeRef = first;
        let second: NodeRef = second;
        let mut proxies = make_proxies();
        prepare_scale9_sprite(&mut state, &mut proxies, &first);
        prepare_scale9_sprite(&mut state, &mut proxies, &second);

        let first_proxy = get_or_create_render_proxy_2d(&mut state, &mut proxies, &first);
        draw_gl_scale9_sprite(&mut state, first_proxy);
        let second_proxy = get_or_create_render_proxy_2d(&mut state, &mut proxies, &second);
        draw_gl_scale9_sprite(&mut state, second_proxy);

        let runtime = state.gl_runtime.borrow();
        assert_eq!(runtime.quad_batch_writer_count, 18);
        let d = &runtime.quad_batch_writer_instance_data;
        // The first sprite's instances are intact.
        assert_eq!((d[4], d[5], d[12]), (7.0, 11.0, 1.0));
        assert_eq!(
            (d[INSTANCE_FLOATS + 4], d[INSTANCE_FLOATS + 5]),
            (17.0, 11.0)
        );
        // The second sprite starts at instance 9 with its own top-left slice.
        let base = 9 * INSTANCE_FLOATS;
        assert_eq!(
            (d[base + 4], d[base + 5], d[base + 12]),
            (100.0, 200.0, 1.0)
        );
        assert_eq!((d[base], d[base + 3]), (10.0, 5.0));
    }

    #[test]
    fn records_material_and_color_data_from_index_zero_after_a_texture_change_flush() {
        let mut state = create_gl_state();
        register_gl_bitmap_texture_resolver(&mut state);
        register_gl_quad_material_renderer(
            &mut state,
            "flight.test.Scale9Material".to_string(),
            &RECORDING_MATERIAL_RENDERER,
        );
        state.gl_registries.color_adjustment_feature = Some(&RECORDING_FEATURE);
        let mut material = create_standard_material();
        material.material_fields_mut().kind = "flight.test.Scale9Material".to_string();
        let material: Ref<dyn Material2D> = Arc::new(RwLock::new(material));

        let first = create_test_scale9_sprite(40, 30);
        first.write().unwrap().material = Some(material.clone());
        let second = create_test_scale9_sprite(40, 30);
        second.write().unwrap().material = Some(material);
        let first: NodeRef = first;
        let second: NodeRef = second;
        let mut proxies = make_proxies();
        prepare_scale9_sprite(&mut state, &mut proxies, &first);
        prepare_scale9_sprite(&mut state, &mut proxies, &second);

        let first_proxy = get_or_create_render_proxy_2d(&mut state, &mut proxies, &first);
        draw_gl_scale9_sprite(&mut state, first_proxy);
        assert_eq!(state.gl_runtime.borrow().quad_batch_writer_count, 9);
        PACKED.with(|calls| calls.borrow_mut().clear());
        RECORDED.with(|calls| calls.borrow_mut().clear());

        let second_proxy = get_or_create_render_proxy_2d(&mut state, &mut proxies, &second);
        draw_gl_scale9_sprite(&mut state, second_proxy);

        let draws = calls_with("draw_elements_instanced");
        assert_eq!(draws.len(), 1);
        assert_eq!(draws[0].integers[4], 9);
        assert_eq!(state.gl_runtime.borrow().quad_batch_writer_count, 9);
        assert_eq!(
            PACKED.with(|calls| calls.borrow().clone()),
            (0..9).collect::<Vec<_>>()
        );
        assert_eq!(
            RECORDED.with(|calls| calls.borrow().clone()),
            (0..9).collect::<Vec<_>>()
        );
    }

    #[test]
    fn scale9_sprite_renderer_declares_the_quad_format_identity_hooks_and_dedicated_submit_function()
     {
        assert_eq!(GL_SCALE9_SPRITE_RENDERER.format, Some(BatchFormat::Quad));
        assert!(GL_SCALE9_SPRITE_RENDERER.is_dirty.is_some());
        assert!(std::ptr::fn_addr_eq(
            GL_SCALE9_SPRITE_RENDERER.submit,
            draw_gl_scale9_sprite as fn(&mut GlRenderState, &RenderProxy2D<GlRenderState>)
        ));
    }
}
