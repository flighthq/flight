use std::sync::Arc;

use flight_materials::STANDARD_MATERIAL_KIND;
use flight_materials::material3d::create_material3d;
use flight_render_gl::{
    GlMaterialRenderer, GlMeshMaterialRenderer, GlQuadMaterialRenderer, GlRenderState,
    register_gl_quad_material_renderer, resolve_gl_quad_material_renderer,
};
use flight_scene3d_gl::contract::*;

use crate::gl_test_helper::{make_gl_scene3d_state, make_gl_scene3d_state_with, make_state_options};

const TEST_KIND: &str = "TestMeshMaterial";

fn noop_bind(
    _state: &mut GlRenderState,
    _material: Option<&dyn flight_materials::Material3D>,
    _lights: &flight_lighting::Scene3DLightBlock,
    _camera: &flight_camera::Camera3D,
) {
}

fn noop_draw(
    _state: &mut GlRenderState,
    _proxy: &flight_render::Scene3DRenderProxy,
    _geometry: &flight_meshgeometry::MeshGeometry,
) {
}

static RENDERER: GlMeshMaterialRenderer = GlMeshMaterialRenderer {
    bind: noop_bind,
    draw: noop_draw,
};
static REPLACEMENT: GlMeshMaterialRenderer = GlMeshMaterialRenderer {
    bind: noop_bind,
    draw: noop_draw,
};

struct TestQuadRenderer;

impl GlQuadMaterialRenderer for TestQuadRenderer {
    fn instance_float_count(&self) -> usize {
        return 0;
    }

    fn bind(&self, _state: &mut GlRenderState, _material: Option<&dyn flight_materials::Material2D>) {}
}

static QUAD_RENDERER: TestQuadRenderer = TestQuadRenderer;

fn is_renderer(actual: Option<&'static GlMeshMaterialRenderer>, expected: &'static GlMeshMaterialRenderer) -> bool {
    return actual.is_some_and(|actual| std::ptr::eq(actual, expected));
}

mod get_gl_mesh_material_renderer {
    use super::*;

    #[test]
    fn returns_null_when_nothing_is_registered_for_the_kind() {
        let state = make_gl_scene3d_state();
        assert!(get_gl_mesh_material_renderer(&state, &TEST_KIND.to_string()).is_none());
    }
}

mod register_gl_mesh_material_renderer {
    use super::*;

    #[test]
    fn registers_a_renderer_retrievable_by_kind() {
        let mut state = make_gl_scene3d_state();
        register_gl_mesh_material_renderer(&mut state, TEST_KIND.to_string(), &RENDERER);
        assert!(is_renderer(
            get_gl_mesh_material_renderer(&state, &TEST_KIND.to_string()),
            &RENDERER
        ));
    }

    #[test]
    fn replaces_the_persistent_table_while_an_explicitly_copied_state_retains_its_snapshot() {
        let mut screen = make_gl_scene3d_state();
        register_gl_mesh_material_renderer(&mut screen, TEST_KIND.to_string(), &RENDERER);
        let snapshot = screen.gl_registries.material_renderers.clone();
        let mut options = make_state_options();
        options.gl_registries = screen.gl_registries.clone();
        let derived = make_gl_scene3d_state_with(&options);

        get_gl_scene3d_runtime(&derived);
        register_gl_mesh_material_renderer(&mut screen, TEST_KIND.to_string(), &REPLACEMENT);

        // D17: the derived state shares the snapshot copy-on-write (TS copies the map); either way the
        // later registration on `screen` never reaches it.
        assert!(!Arc::ptr_eq(&screen.gl_registries.material_renderers, &snapshot));
        assert!(matches!(
            snapshot.entries.get(TEST_KIND),
            Some(GlMaterialRenderer::Mesh(entry)) if std::ptr::eq(*entry, &RENDERER)
        ));
        assert!(is_renderer(
            get_gl_mesh_material_renderer(&derived, &TEST_KIND.to_string()),
            &RENDERER
        ));
        assert!(is_renderer(
            get_gl_mesh_material_renderer(&screen, &TEST_KIND.to_string()),
            &REPLACEMENT
        ));
    }
}

mod resolve_gl_mesh_material_renderer {
    use super::*;

    #[test]
    fn returns_null_when_nothing_is_registered_no_built_in_fallback() {
        let state = make_gl_scene3d_state();
        let material = create_material3d(TEST_KIND.to_string());
        assert!(resolve_gl_mesh_material_renderer(&state, None).is_none());
        assert!(resolve_gl_mesh_material_renderer(&state, Some(&material)).is_none());
    }

    #[test]
    fn resolves_by_the_material_kind() {
        let mut state = make_gl_scene3d_state();
        register_gl_mesh_material_renderer(&mut state, TEST_KIND.to_string(), &RENDERER);
        let material = create_material3d(TEST_KIND.to_string());
        assert!(is_renderer(
            resolve_gl_mesh_material_renderer(&state, Some(&material)),
            &RENDERER
        ));
    }

    #[test]
    fn falls_back_to_the_standard_material_kind_renderer() {
        let mut state = make_gl_scene3d_state();
        register_gl_mesh_material_renderer(&mut state, STANDARD_MATERIAL_KIND.to_string(), &RENDERER);
        let material = create_material3d("Other".to_string());
        assert!(is_renderer(
            resolve_gl_mesh_material_renderer(&state, Some(&material)),
            &RENDERER
        ));
        assert!(is_renderer(resolve_gl_mesh_material_renderer(&state, None), &RENDERER));
    }
}

mod shared_material_renderers_storage {
    use super::*;

    const QUAD_KIND: &str = "TestQuadMaterial";
    const MESH_KIND: &str = "TestMeshMaterial";

    #[test]
    fn holds_quad_and_mesh_entries_in_the_same_table() {
        let mut state = make_gl_scene3d_state();
        register_gl_quad_material_renderer(&mut state, QUAD_KIND.to_string(), &QUAD_RENDERER);
        register_gl_mesh_material_renderer(&mut state, MESH_KIND.to_string(), &RENDERER);

        let table = &state.gl_registries.material_renderers;
        assert!(table.entries.contains_key(QUAD_KIND));
        assert!(table.entries.contains_key(MESH_KIND));
    }

    #[test]
    fn typed_resolvers_return_the_correct_protocol_from_shared_storage() {
        let mut state = make_gl_scene3d_state();
        register_gl_quad_material_renderer(&mut state, QUAD_KIND.to_string(), &QUAD_RENDERER);
        register_gl_mesh_material_renderer(&mut state, MESH_KIND.to_string(), &RENDERER);

        let quad_material = create_material3d(QUAD_KIND.to_string());
        let mesh_material = create_material3d(MESH_KIND.to_string());
        let quad = resolve_gl_quad_material_renderer(&mut state, Some(&quad_material)).unwrap();
        assert!(std::ptr::eq(
            quad as *const dyn GlQuadMaterialRenderer as *const (),
            &QUAD_RENDERER as *const TestQuadRenderer as *const ()
        ));
        assert!(is_renderer(
            resolve_gl_mesh_material_renderer(&state, Some(&mesh_material)),
            &RENDERER
        ));
    }

    #[test]
    fn neither_registrar_shadows_the_other_both_entries_survive_in_the_shared_table() {
        let mut state = make_gl_scene3d_state();
        register_gl_quad_material_renderer(&mut state, QUAD_KIND.to_string(), &QUAD_RENDERER);
        register_gl_mesh_material_renderer(&mut state, MESH_KIND.to_string(), &RENDERER);

        let table = &state.gl_registries.material_renderers;
        assert_eq!(table.entries.len(), 2);
        assert!(matches!(table.entries.get(QUAD_KIND), Some(GlMaterialRenderer::Quad(_))));
        assert!(matches!(
            table.entries.get(MESH_KIND),
            Some(GlMaterialRenderer::Mesh(entry)) if std::ptr::eq(*entry, &RENDERER)
        ));
    }
}
