use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_materials::{Material2D, Material2DFields, MaterialData, TintMaterialData};
use flight_node::NodeRef;
use flight_render::*;

mod update_render_proxy_material {
    use super::*;

    #[test]
    fn material_update_resolves_source_material_and_data() {
        let material: Ref<dyn Material2D> = Arc::new(RwLock::new(crate::support::test_default::<
            Material2DFields,
        >()));
        let material_data: Ref<dyn MaterialData> = Arc::new(RwLock::new(
            crate::support::test_default::<TintMaterialData>(),
        ));
        let typed = flight_scene2d::create_display_object(None);
        {
            let mut source = typed.write().unwrap();
            source.material = Some(material.clone());
            source.material_data = Some(material_data.clone());
        }
        let source: NodeRef = typed;
        let mut state = create_render_state();
        let mut proxy = create_render_proxy(&mut state, &source);
        update_render_proxy_material(&state, &mut proxy, None);
        assert!(Arc::ptr_eq(proxy.material.as_ref().unwrap(), &material));
        assert!(Arc::ptr_eq(
            proxy.material_data.as_ref().unwrap(),
            &material_data
        ));
    }

    #[test]
    fn material_update_resolves_none_without_material_trait() {
        let source: NodeRef = flight_scene3d::publish_node3d(flight_scene3d::create_node3d::<
            flight_scene3d::Node3DFields,
        >(None, None));
        let mut state = create_render_state();
        let mut proxy = create_render_proxy(&mut state, &source);
        update_render_proxy_material(&state, &mut proxy, None);
        assert!(proxy.material.is_none());
        assert!(proxy.material_data.is_none());
    }
}
