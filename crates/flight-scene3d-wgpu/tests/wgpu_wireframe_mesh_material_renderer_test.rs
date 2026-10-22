use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, RwLock};

use flight_materials::contract::create_wireframe_material;
use flight_materials::{MaterialAlphaMode, WIREFRAME_MATERIAL_KIND};
use flight_meshgeometry::create_box_mesh_geometry;
use flight_render_wgpu::{WgpuRenderState, WgpuSkinningAdapter};
use flight_scene3d_wgpu::contract::*;

use crate::support::*;

static SKIN_GROUP_CALLS: AtomicU32 = AtomicU32::new(0);

fn counting_mesh_draw_bind_group(
    state: &mut WgpuRenderState,
    joint_matrices: &[f32],
    normal_matrices: &[f32],
) -> wgpu::BindGroup {
    SKIN_GROUP_CALLS.fetch_add(1, Ordering::SeqCst);
    return ensure_wgpu_skin_mesh_draw_bind_group(state, joint_matrices, normal_matrices);
}

// The source's spread of the adapter with a counting mesh-draw group.
static COUNTING_ADAPTER: WgpuSkinningAdapter = WgpuSkinningAdapter {
    get_mesh_draw_bind_group: counting_mesh_draw_bind_group,
    ..WGPU_SKINNING_ADAPTER
};

fn make_proxy() -> flight_render::Scene3DRenderProxy {
    let geometry = create_box_mesh_geometry(None, None, None);
    return make_test_proxy_for(&geometry, share_test_material(create_wireframe_material()));
}

fn bind_proxy_material(test: &mut WgpuScene3DTestState, proxy: &flight_render::Scene3DRenderProxy) {
    let material = proxy.material.read().unwrap();
    bind_test_renderer(
        &mut test.state,
        &WGPU_WIREFRAME_MESH_MATERIAL_RENDERER,
        Some(&*material as &dyn flight_materials::Material),
    );
}

mod register_wgpu_wireframe_material {
    use super::*;

    #[test]
    fn installs_the_renderer_for_wireframe_material_kind() {
        let mut test = make_wgpu_scene3d_state(None);
        register_wgpu_wireframe_material(&mut test.state);
        assert!(is_same_renderer(
            get_wgpu_mesh_material_renderer(&test.state, WIREFRAME_MATERIAL_KIND),
            &WGPU_WIREFRAME_MESH_MATERIAL_RENDERER
        ));
    }
}

mod wgpu_wireframe_mesh_material_renderer {
    use super::*;

    #[test]
    fn bind_selects_a_line_list_pipeline_and_uploads_the_color() {
        let mut test = make_wgpu_scene3d_state(None);
        let material = create_wireframe_material();
        bind_test_renderer(
            &mut test.state,
            &WGPU_WIREFRAME_MESH_MATERIAL_RENDERER,
            Some(&material),
        );
        assert!(test.count("setPipeline") > 0);
        assert!(test.count("writeBuffer") > 0);
        assert_eq!(
            test.pipelines()[0].primitive.topology,
            wgpu::PrimitiveTopology::LineList
        );
    }

    #[test]
    fn bind_selects_the_alpha_mask_pipeline_for_a_masked_material() {
        let mut test = make_wgpu_scene3d_state(None);
        let mut material = create_wireframe_material();
        material.alpha_cutoff = 0.25;
        material.alpha_mode = MaterialAlphaMode::Mask;
        bind_test_renderer(
            &mut test.state,
            &WGPU_WIREFRAME_MESH_MATERIAL_RENDERER,
            Some(&material),
        );
        assert!(
            get_wgpu_scene3d_runtime(&mut test.state)
                .pipeline_cache
                .keys()
                .any(|key| key.contains("|mask|"))
        );
    }

    #[test]
    fn draw_issues_a_line_list_indexed_draw_over_the_doubled_subset_range() {
        let mut test = make_wgpu_scene3d_state(None);
        let proxy = make_proxy();
        bind_proxy_material(&mut test, &proxy);
        (WGPU_WIREFRAME_MESH_MATERIAL_RENDERER.draw)(
            &mut test.state,
            &proxy,
            &create_box_mesh_geometry(None, None, None),
        );
        let draws = test.draws_indexed();
        assert_eq!(draws.len(), 1);
        assert_eq!(draws[0].index_count, proxy.subset.index_count * 2);
    }

    #[test]
    fn draw_binds_the_palette_backed_group_selected_by_a_skinned_pipeline() {
        let mut test = make_wgpu_scene3d_state(None);
        {
            let runtime = get_wgpu_scene3d_runtime(&mut test.state);
            runtime.skinning_adapter = Some(&COUNTING_ADAPTER);
            runtime.active_skinned_run = true;
        }
        let mut proxy = make_proxy();
        proxy.joint_matrices = Some(Arc::new(RwLock::new(vec![0.0_f32; 16].into_boxed_slice())));
        proxy.normal_matrices = Some(Arc::new(RwLock::new(vec![0.0_f32; 12].into_boxed_slice())));
        let before = SKIN_GROUP_CALLS.load(Ordering::SeqCst);

        bind_proxy_material(&mut test, &proxy);
        (WGPU_WIREFRAME_MESH_MATERIAL_RENDERER.draw)(
            &mut test.state,
            &proxy,
            &create_box_mesh_geometry(None, None, None),
        );

        assert_eq!(SKIN_GROUP_CALLS.load(Ordering::SeqCst) - before, 1);
        let skin_group = get_wgpu_scene3d_runtime(&mut test.state)
            .skin_mesh_draw_bind_group
            .clone()
            .unwrap();
        assert!(
            test.set_bind_groups()
                .iter()
                .any(|set| set.index == 1 && set.bind_group == skin_group)
        );
    }

    #[test]
    fn draw_is_a_no_op_when_bind_has_not_selected_a_pipeline() {
        let mut test = make_wgpu_scene3d_state(None);
        (WGPU_WIREFRAME_MESH_MATERIAL_RENDERER.draw)(
            &mut test.state,
            &make_proxy(),
            &create_box_mesh_geometry(None, None, None),
        );
        assert_eq!(test.count("drawIndexed"), 0);
    }
}
