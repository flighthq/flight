use std::sync::Arc;

use flight_render::*;

mod emit_render_registry_miss {
    use super::*;

    #[test]
    fn emit_render_registry_miss_dispatches_to_enabled_guards() {
        let mut state = create_render_state(None);
        enable_render_registries_guards(&mut state, None);
        emit_render_registry_miss(
            &mut state,
            RenderRegistryTable::TextureResolver,
            "acme.Texture".to_string(),
        );
        assert_eq!(
            explain_render_registries_misses(&state).misses,
            vec![RenderRegistriesMiss {
                kind: "acme.Texture".to_string(),
                registry: RenderRegistryTable::TextureResolver,
            }]
        );
    }
}

mod enable_render_registry_signals {
    use super::*;

    #[test]
    fn enable_render_registry_signals_allocates_one_state_local_seam() {
        let mut state = create_render_state(None);
        assert!(state.runtime.registry_signals.is_none());
        let first = enable_render_registry_signals(&mut state);
        let attached = state.runtime.registry_signals.as_ref().unwrap();
        assert!(Arc::ptr_eq(
            &first.on_registry_miss.data,
            &attached.on_registry_miss.data
        ));
        let second = enable_render_registry_signals(&mut state);
        assert!(Arc::ptr_eq(
            &first.on_registry_miss.data,
            &second.on_registry_miss.data
        ));
    }
}
