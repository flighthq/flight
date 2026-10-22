fn shader(
    state: &flight_render_gl::GlRenderState,
) -> std::sync::Arc<flight_render_gl::GlBitmapShader> {
    return flight_render_gl::create_default_gl_bitmap_shader(
        flight_render_gl::compile_default_gl_program(&state.gl).unwrap(),
    );
}

mod get_gl_material_shader {
    use crate::gl_test_helper::make_state;
    use flight_render_gl::{get_gl_material_shader, register_gl_material_shader};
    use std::sync::Arc;

    #[test]
    fn returns_none_for_a_different_kind() {
        let state = make_state();
        register_gl_material_shader(&state, "Tint".into(), super::shader(&state));
        assert!(get_gl_material_shader(&state, &"ColorMatrix".into()).is_none());
    }

    #[test]
    fn returns_none_when_no_material_shader_is_registered() {
        let state = make_state();
        assert!(get_gl_material_shader(&state, &"Tint".into()).is_none());
    }

    #[test]
    fn returns_the_registered_shader_identity() {
        let state = make_state();
        let shader = super::shader(&state);
        register_gl_material_shader(&state, "Tint".into(), shader.clone());
        assert!(Arc::ptr_eq(
            &shader,
            &get_gl_material_shader(&state, &"Tint".into()).unwrap()
        ));
    }
}
mod get_gl_shader {
    use crate::gl_test_helper::{make_proxy, make_state};
    use flight_entity::get_entity_id;
    use flight_render_gl::get_gl_shader;
    use std::sync::Arc;

    #[test]
    fn returns_none_for_a_proxy_without_a_binding() {
        let mut state = make_state();
        let proxy = make_proxy(&mut state);
        assert!(get_gl_shader(&state, &proxy).is_none());
    }

    #[test]
    fn returns_the_shader_bound_to_a_render_proxy() {
        let mut state = make_state();
        let proxy = make_proxy(&mut state);
        let shader = super::shader(&state);
        state
            .gl_runtime
            .borrow_mut()
            .shader_bindings
            .insert(get_entity_id(&proxy.proxy), shader.clone());
        assert!(Arc::ptr_eq(
            &shader,
            &get_gl_shader(&state, &proxy).unwrap()
        ));
    }
}
mod register_gl_material_shader {
    use crate::gl_test_helper::make_state;
    use flight_render_gl::{
        get_gl_material_shader, register_gl_material_shader, resolve_gl_shader,
    };

    #[test]
    fn keeps_registrations_isolated_per_render_state() {
        let state_a = make_state();
        let state_b = make_state();
        register_gl_material_shader(&state_a, "Tint".into(), super::shader(&state_a));
        assert!(get_gl_material_shader(&state_b, &"Tint".into()).is_none());
    }

    #[test]
    fn makes_resolve_return_the_material_shader_for_a_matching_proxy() {
        let mut state = make_state();
        let shader = super::shader(&state);
        register_gl_material_shader(
            &state,
            flight_materials::STANDARD_MATERIAL_KIND.to_string(),
            shader.clone(),
        );
        let mut proxy = crate::gl_test_helper::make_proxy(&mut state);
        let material: flight_entity::Ref<dyn flight_materials::Material2D> = std::sync::Arc::new(
            std::sync::RwLock::new(flight_materials::standard_material::create_standard_material()),
        );
        proxy.proxy.material = Some(material);
        let resolved = resolve_gl_shader(&mut state, &proxy).unwrap();
        assert!(std::sync::Arc::ptr_eq(&resolved, &shader));
    }

    #[test]
    fn makes_the_shader_retrievable_by_material_kind() {
        let state = make_state();
        let shader = super::shader(&state);
        register_gl_material_shader(&state, "Tint".into(), shader.clone());
        assert!(std::sync::Arc::ptr_eq(
            &shader,
            &get_gl_material_shader(&state, &"Tint".into()).unwrap()
        ));
    }

    #[test]
    fn overwrites_a_previous_registration_for_the_same_kind() {
        let state = make_state();
        let first = super::shader(&state);
        let second = super::shader(&state);
        register_gl_material_shader(&state, "Tint".into(), first);
        register_gl_material_shader(&state, "Tint".into(), second.clone());
        assert!(std::sync::Arc::ptr_eq(
            &second,
            &get_gl_material_shader(&state, &"Tint".into()).unwrap()
        ));
    }
}
mod resolve_gl_shader {
    use crate::gl_test_helper::{make_proxy, make_state};
    use flight_render_gl::{resolve_gl_shader, set_gl_shader};

    #[test]
    fn falls_back_to_and_caches_the_default_shader_when_no_binding_resolver_exists() {
        let mut state = make_state();
        let proxy = make_proxy(&mut state);
        let resolved = resolve_gl_shader(&mut state, &proxy).unwrap();
        assert!(std::sync::Arc::ptr_eq(
            &resolved,
            state
                .gl_runtime
                .borrow()
                .default_bitmap_shader
                .as_ref()
                .unwrap()
        ));
    }

    #[test]
    fn returns_the_bound_shader_when_binding_support_is_used() {
        let mut state = make_state();
        let mut proxies = crate::gl_test_helper::make_proxies();
        let node: flight_node::NodeRef = flight_scene2d::create_display_object();
        let shader = super::shader(&state);
        set_gl_shader(&mut state, &mut proxies, &node, Some(shader.clone()));
        let index = proxies.by_uid[&flight_entity::get_entity_id(&*node.read().unwrap())];
        let resolved =
            resolve_gl_shader(&mut state, proxies.entries[index].as_ref().unwrap()).unwrap();
        assert!(std::sync::Arc::ptr_eq(&resolved, &shader));
    }

    #[test]
    fn returns_the_default_shader_when_no_binding_is_set() {
        let mut state = make_state();
        let proxy = make_proxy(&mut state);
        let resolved = resolve_gl_shader(&mut state, &proxy).unwrap();
        assert!(std::sync::Arc::ptr_eq(
            &resolved,
            state
                .gl_runtime
                .borrow()
                .default_bitmap_shader
                .as_ref()
                .unwrap()
        ));
    }
}
mod set_gl_shader {
    use crate::gl_test_helper::{make_proxies, make_state};
    use flight_render_gl::{get_gl_shader, set_gl_shader};
    use std::sync::Arc;

    #[test]
    fn clears_the_binding_when_passed_none() {
        let mut state = make_state();
        let mut proxies = make_proxies();
        let node: flight_node::NodeRef = flight_scene2d::create_display_object();
        let shader = super::shader(&state);
        set_gl_shader(&mut state, &mut proxies, &node, Some(shader.clone()));
        let index = *proxies.by_uid.values().next().unwrap();
        set_gl_shader(&mut state, &mut proxies, &node, None);
        assert!(get_gl_shader(&state, proxies.entries[index].as_ref().unwrap()).is_none());
    }

    #[test]
    fn does_not_leak_a_binding_across_render_states() {
        let mut state_a = make_state();
        let mut state_b = make_state();
        let mut proxies_a = make_proxies();
        let mut proxies_b = make_proxies();
        let node: flight_node::NodeRef = flight_scene2d::create_display_object();
        let shader = super::shader(&state_a);
        set_gl_shader(&mut state_a, &mut proxies_a, &node, Some(shader.clone()));
        let proxy_b =
            flight_render::get_or_create_render_proxy_2d(&mut state_b, &mut proxies_b, &node);
        assert!(get_gl_shader(&state_b, proxy_b).is_none());
        let index_a = *proxies_a.by_uid.values().next().unwrap();
        assert!(Arc::ptr_eq(
            &shader,
            &get_gl_shader(&state_a, proxies_a.entries[index_a].as_ref().unwrap()).unwrap()
        ));
    }

    #[test]
    fn installs_the_per_proxy_binding_entry() {
        let mut state = make_state();
        let mut proxies = make_proxies();
        let node: flight_node::NodeRef = flight_scene2d::create_display_object();
        let shader = super::shader(&state);
        set_gl_shader(&mut state, &mut proxies, &node, Some(shader));
        let index = *proxies.by_uid.values().next().unwrap();
        let proxy = proxies.entries[index].as_ref().unwrap();
        assert!(
            state
                .gl_runtime
                .borrow()
                .shader_bindings
                .contains_key(&flight_entity::get_entity_id(&proxy.proxy))
        );
    }

    #[test]
    fn stores_a_shader_keyed_by_the_per_state_render_proxy() {
        let mut state = make_state();
        let mut proxies = make_proxies();
        let node: flight_node::NodeRef = flight_scene2d::create_display_object();
        let shader = super::shader(&state);
        set_gl_shader(&mut state, &mut proxies, &node, Some(shader.clone()));
        let index = *proxies.by_uid.values().next().unwrap();
        assert!(Arc::ptr_eq(
            &shader,
            &get_gl_shader(&state, proxies.entries[index].as_ref().unwrap()).unwrap()
        ));
    }
}
