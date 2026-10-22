use flight_materials::{Material2D, MaterialData};
use flight_render_gl::{GlQuadMaterialRenderer, GlRenderState};

struct Renderer;
impl GlQuadMaterialRenderer for Renderer {
    fn instance_float_count(&self) -> usize {
        4
    }
    fn bind(&self, _state: &mut GlRenderState, _material: Option<&dyn Material2D>) {}
    fn pack_instance(
        &self,
        _state: &mut GlRenderState,
        _data: Option<&dyn MaterialData>,
        out: &mut [f32],
        offset: usize,
    ) {
        out[offset] = 7.0;
    }
}
static RENDERER: Renderer = Renderer;
static REPLACEMENT: Renderer = Renderer;

mod get_gl_quad_material_renderer {
    use super::RENDERER;
    use crate::gl_test_helper::make_state;
    use flight_render_gl::{get_gl_quad_material_renderer, register_gl_quad_material_renderer};

    #[test]
    fn returns_none_when_nothing_is_registered_for_the_kind() {
        let state = make_state();
        assert!(get_gl_quad_material_renderer(&state, &"custom".into()).is_none());
    }

    #[test]
    fn returns_the_registered_exact_static_renderer() {
        let mut state = make_state();
        register_gl_quad_material_renderer(&mut state, "custom".into(), &RENDERER);
        assert!(std::ptr::eq(
            get_gl_quad_material_renderer(&state, &"custom".into()).unwrap(),
            &RENDERER
        ));
    }
}
mod register_gl_quad_material_renderer {
    use super::{RENDERER, REPLACEMENT};
    use crate::gl_test_helper::make_state;
    use flight_render_gl::{get_gl_quad_material_renderer, register_gl_quad_material_renderer};

    #[test]
    fn inserts_into_a_new_registry_snapshot() {
        let mut state = make_state();
        let old = state.gl_registries.material_renderers.clone();
        register_gl_quad_material_renderer(&mut state, "custom".into(), &RENDERER);
        assert!(!std::sync::Arc::ptr_eq(
            &old,
            &state.gl_registries.material_renderers
        ));
        assert!(std::ptr::eq(
            get_gl_quad_material_renderer(&state, &"custom".into()).unwrap(),
            &RENDERER,
        ));
        assert!(old.entries.is_empty());
    }

    #[test]
    fn is_last_write_wins_without_mutating_the_earlier_snapshot() {
        let mut state = make_state();
        register_gl_quad_material_renderer(&mut state, "custom".into(), &RENDERER);
        let earlier = state.gl_registries.material_renderers.clone();
        register_gl_quad_material_renderer(&mut state, "custom".into(), &REPLACEMENT);
        assert!(std::ptr::eq(
            get_gl_quad_material_renderer(&state, &"custom".into()).unwrap(),
            &REPLACEMENT,
        ));
        let flight_render_gl::GlMaterialRenderer::Quad(entry) =
            *earlier.entries.get("custom").unwrap()
        else {
            panic!("expected a quad material renderer entry");
        };
        assert!(std::ptr::eq(
            entry as *const dyn flight_render_gl::GlQuadMaterialRenderer as *const (),
            &RENDERER as *const _ as *const (),
        ));
    }
}
mod resolve_gl_quad_material_renderer {
    use super::RENDERER;
    use crate::gl_test_helper::make_state;
    use flight_render::{
        RenderRegistriesMissStatus, RenderRegistryTable, enable_render_registries_guards,
        explain_render_registries_misses,
    };
    use flight_render_gl::{register_gl_quad_material_renderer, resolve_gl_quad_material_renderer};

    #[test]
    fn records_nothing_once_the_kind_resolves() {
        let mut state = make_state();
        enable_render_registries_guards(&mut state, None);
        register_gl_quad_material_renderer(&mut state, "custom".into(), &RENDERER);
        let material = flight_materials::material::create_material("custom".into());
        assert!(resolve_gl_quad_material_renderer(&mut state, Some(&material)).is_some());
        let explanation = explain_render_registries_misses(&state);
        assert_eq!(explanation.status, RenderRegistriesMissStatus::Complete);
        assert!(explanation.misses.is_empty());
    }

    #[test]
    fn reports_a_kind_that_the_standard_renderer_stands_in_for() {
        let mut state = make_state();
        enable_render_registries_guards(&mut state, None);
        register_gl_quad_material_renderer(
            &mut state,
            flight_materials::STANDARD_MATERIAL_KIND.to_string(),
            &RENDERER,
        );
        let material = flight_materials::material::create_material("Other".into());
        assert!(std::ptr::eq(
            resolve_gl_quad_material_renderer(&mut state, Some(&material)).unwrap(),
            &RENDERER,
        ));
        let explanation = explain_render_registries_misses(&state);
        assert_eq!(explanation.misses.len(), 1);
        assert_eq!(explanation.misses[0].kind, "Other");
        assert_eq!(
            explanation.misses[0].registry,
            RenderRegistryTable::MaterialRenderer
        );
    }

    #[test]
    fn reports_missing_explicit_and_standard_kinds() {
        let mut state = make_state();
        enable_render_registries_guards(&mut state, None);
        let material = flight_materials::material::create_material("custom".into());
        assert!(resolve_gl_quad_material_renderer(&mut state, Some(&material)).is_none());
        assert!(resolve_gl_quad_material_renderer(&mut state, None).is_none());
        let explanation = explain_render_registries_misses(&state);
        assert_eq!(
            explanation.status,
            RenderRegistriesMissStatus::MissesRecorded
        );
        assert_eq!(explanation.misses.len(), 2);
        assert_eq!(explanation.misses[0].kind, "custom");
        assert_eq!(
            explanation.misses[1].kind,
            flight_materials::STANDARD_MATERIAL_KIND
        );
    }

    #[test]
    fn resolves_registered_explicit_and_standard_material_renderers() {
        let mut state = make_state();
        register_gl_quad_material_renderer(&mut state, "custom".into(), &RENDERER);
        let material = flight_materials::material::create_material("custom".into());
        assert!(std::ptr::eq(
            resolve_gl_quad_material_renderer(&mut state, Some(&material)).unwrap(),
            &RENDERER,
        ));
        register_gl_quad_material_renderer(
            &mut state,
            flight_materials::STANDARD_MATERIAL_KIND.to_string(),
            &RENDERER,
        );
        assert!(std::ptr::eq(
            resolve_gl_quad_material_renderer(&mut state, None).unwrap(),
            &RENDERER
        ));
    }

    #[test]
    fn returns_none_without_any_builtin_fallback() {
        let mut state = make_state();
        let material = flight_materials::material::create_material("custom".into());
        assert!(resolve_gl_quad_material_renderer(&mut state, Some(&material)).is_none());
        assert!(resolve_gl_quad_material_renderer(&mut state, None).is_none());
    }
}
