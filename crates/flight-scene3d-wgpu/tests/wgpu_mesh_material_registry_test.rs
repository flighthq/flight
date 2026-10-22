use flight_camera::Camera3D;
use flight_entity::Ref;
use flight_lighting::Scene3DLightBlock;
use flight_materials::contract::create_standard_pbr_material;
use flight_materials::{Material, STANDARD_MATERIAL_KIND, STANDARD_PBR_MATERIAL_KIND};
use flight_meshgeometry::MeshGeometry;
use flight_render::Scene3DRenderProxy;
use flight_render_wgpu::*;
use flight_scene3d_wgpu::contract::*;

use crate::support::*;

fn bind_nothing(
    _state: &mut WgpuRenderState,
    _material: Option<&dyn Material>,
    _lights: &Ref<Scene3DLightBlock>,
    _camera: &Camera3D,
) {
}

fn draw_nothing(
    _state: &mut WgpuRenderState,
    _proxy: &Scene3DRenderProxy,
    _geometry: &MeshGeometry,
) {
}

static RENDERER: WgpuMeshMaterialRenderer = WgpuMeshMaterialRenderer {
    bind: bind_nothing,
    draw: draw_nothing,
};

static REPLACEMENT: WgpuMeshMaterialRenderer = WgpuMeshMaterialRenderer {
    bind: bind_nothing,
    draw: draw_nothing,
};

static FALLBACK: WgpuMeshMaterialRenderer = WgpuMeshMaterialRenderer {
    bind: bind_nothing,
    draw: draw_nothing,
};

fn quad_module(_state: &mut WgpuRenderState) -> wgpu::ShaderModule {
    panic!("the quad renderer is never compiled here");
}

fn quad_renderer() -> WgpuQuadMaterialRenderer {
    return WgpuQuadMaterialRenderer {
        instance_float_count: 0,
        get_shader_module: quad_module,
        pack_instance: None,
    };
}

fn is_renderer(
    value: Option<&'static WgpuMeshMaterialRenderer>,
    expected: &'static WgpuMeshMaterialRenderer,
) -> bool {
    return value.is_some_and(|value| std::ptr::eq(value, expected));
}

const QUAD_KIND: &str = "TestQuadMaterial";
const MESH_KIND: &str = "TestMeshMaterial";

fn make_material(kind: &str) -> flight_materials::Material3DFields {
    return flight_materials::material3d::create_material3d(kind.to_string());
}

mod get_wgpu_mesh_material_renderer {
    use super::*;

    #[test]
    fn returns_a_registered_renderer_by_kind_else_null() {
        let mut test = make_wgpu_scene3d_state(None);
        assert!(get_wgpu_mesh_material_renderer(&test.state, STANDARD_PBR_MATERIAL_KIND).is_none());
        register_wgpu_mesh_material_renderer(
            &mut test.state,
            STANDARD_PBR_MATERIAL_KIND.to_string(),
            &RENDERER,
        );
        assert!(is_renderer(
            get_wgpu_mesh_material_renderer(&test.state, STANDARD_PBR_MATERIAL_KIND),
            &RENDERER
        ));
    }
}

mod register_wgpu_mesh_material_renderer {
    use super::*;

    #[test]
    fn registers_a_renderer_in_the_scene_wgpu_3d_registry() {
        let mut test = make_wgpu_scene3d_state(None);
        register_wgpu_mesh_material_renderer(
            &mut test.state,
            STANDARD_PBR_MATERIAL_KIND.to_string(),
            &RENDERER,
        );
        assert!(is_renderer(
            get_wgpu_mesh_material_renderer(&test.state, STANDARD_PBR_MATERIAL_KIND),
            &RENDERER
        ));
    }

    #[test]
    fn replaces_the_persistent_table_while_an_explicit_pipeline_state_retains_its_snapshot() {
        let mut screen = make_wgpu_scene3d_state(None);
        register_wgpu_mesh_material_renderer(
            &mut screen.state,
            STANDARD_PBR_MATERIAL_KIND.to_string(),
            &RENDERER,
        );
        let snapshot = get_wgpu_render_state_runtime(&screen.state)
            .registries
            .material_renderers
            .clone();
        let mut derived = make_wgpu_scene3d_state(Some(WgpuRenderStateOptions {
            material_renderers: Some((*snapshot).clone()),
            ..test_default()
        }));

        get_wgpu_scene3d_runtime(&mut derived.state);
        register_wgpu_mesh_material_renderer(
            &mut screen.state,
            STANDARD_PBR_MATERIAL_KIND.to_string(),
            &REPLACEMENT,
        );

        assert!(!std::sync::Arc::ptr_eq(
            &get_wgpu_render_state_runtime(&derived.state)
                .registries
                .material_renderers,
            &snapshot
        ));
        assert!(!std::sync::Arc::ptr_eq(
            &get_wgpu_render_state_runtime(&screen.state)
                .registries
                .material_renderers,
            &snapshot
        ));
        assert!(matches!(
            snapshot.entries.get(STANDARD_PBR_MATERIAL_KIND),
            Some(WgpuMaterialRenderer::Mesh(renderer)) if std::ptr::eq(*renderer, &RENDERER)
        ));
        assert!(is_renderer(
            get_wgpu_mesh_material_renderer(&derived.state, STANDARD_PBR_MATERIAL_KIND),
            &RENDERER
        ));
        assert!(is_renderer(
            get_wgpu_mesh_material_renderer(&screen.state, STANDARD_PBR_MATERIAL_KIND),
            &REPLACEMENT
        ));
    }
}

mod resolve_wgpu_mesh_material_renderer {
    use super::*;

    #[test]
    fn resolves_by_the_material_kind() {
        let mut test = make_wgpu_scene3d_state(None);
        register_wgpu_mesh_material_renderer(
            &mut test.state,
            STANDARD_PBR_MATERIAL_KIND.to_string(),
            &RENDERER,
        );
        let material = create_standard_pbr_material();
        assert!(is_renderer(
            resolve_wgpu_mesh_material_renderer(&test.state, Some(&material)),
            &RENDERER
        ));
    }

    #[test]
    fn falls_back_to_standard_material_kind_for_an_unregistered_kind_or_null_material() {
        let mut test = make_wgpu_scene3d_state(None);
        register_wgpu_mesh_material_renderer(
            &mut test.state,
            STANDARD_MATERIAL_KIND.to_string(),
            &FALLBACK,
        );
        let material = create_standard_pbr_material();
        assert!(is_renderer(
            resolve_wgpu_mesh_material_renderer(&test.state, Some(&material)),
            &FALLBACK
        ));
        assert!(is_renderer(
            resolve_wgpu_mesh_material_renderer(&test.state, None),
            &FALLBACK
        ));
    }

    #[test]
    fn returns_null_when_neither_the_kind_nor_the_default_is_registered() {
        let test = make_wgpu_scene3d_state(None);
        let material = create_standard_pbr_material();
        assert!(resolve_wgpu_mesh_material_renderer(&test.state, Some(&material)).is_none());
    }
}

mod shared_material_renderers_storage {
    use super::*;

    #[test]
    fn holds_quad_and_mesh_entries_in_the_same_table() {
        let mut test = make_wgpu_scene3d_state(None);
        register_wgpu_quad_material_renderer(
            &mut test.state,
            QUAD_KIND.to_string(),
            quad_renderer(),
        );
        register_wgpu_mesh_material_renderer(&mut test.state, MESH_KIND.to_string(), &RENDERER);

        let table = &get_wgpu_render_state_runtime(&test.state)
            .registries
            .material_renderers;
        assert!(table.entries.contains_key(QUAD_KIND));
        assert!(table.entries.contains_key(MESH_KIND));
    }

    #[test]
    fn typed_resolvers_return_the_correct_protocol_from_shared_storage() {
        let mut test = make_wgpu_scene3d_state(None);
        register_wgpu_quad_material_renderer(
            &mut test.state,
            QUAD_KIND.to_string(),
            quad_renderer(),
        );
        register_wgpu_mesh_material_renderer(&mut test.state, MESH_KIND.to_string(), &RENDERER);

        let quad = make_material(QUAD_KIND);
        assert!(resolve_wgpu_quad_material_renderer(&mut test.state, Some(&quad)).is_some());
        let mesh = make_material(MESH_KIND);
        assert!(is_renderer(
            resolve_wgpu_mesh_material_renderer(&test.state, Some(&mesh)),
            &RENDERER
        ));
    }

    #[test]
    fn neither_registrar_shadows_the_other_both_entries_survive_in_the_shared_table() {
        let mut test = make_wgpu_scene3d_state(None);
        register_wgpu_quad_material_renderer(
            &mut test.state,
            QUAD_KIND.to_string(),
            quad_renderer(),
        );
        register_wgpu_mesh_material_renderer(&mut test.state, MESH_KIND.to_string(), &RENDERER);

        let table = &get_wgpu_render_state_runtime(&test.state)
            .registries
            .material_renderers;
        assert_eq!(table.entries.len(), 2);
        assert!(matches!(
            table.entries.get(QUAD_KIND),
            Some(WgpuMaterialRenderer::Quad(_))
        ));
        assert!(matches!(
            table.entries.get(MESH_KIND),
            Some(WgpuMaterialRenderer::Mesh(renderer)) if std::ptr::eq(*renderer, &RENDERER)
        ));
    }
}
