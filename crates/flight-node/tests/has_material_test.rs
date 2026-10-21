use std::sync::{Arc, RwLock};

use flight_entity::{Ref, allocate_entity};
use flight_materials::contract::{
    Material2D, MaterialData, MaterialDataFields, create_standard_material,
};
use flight_node::contract::*;

fn material() -> Ref<dyn Material2D> {
    return Arc::new(RwLock::new(create_standard_material(None)));
}

fn material_data() -> Ref<dyn MaterialData> {
    return Arc::new(RwLock::new(allocate_entity::<MaterialDataFields>()));
}

mod init_material_trait {
    use super::*;

    #[test]
    fn defaults_material_and_material_data_to_null() {
        let mut target = HasMaterial {
            material: Some(material()),
            material_data: Some(material_data()),
        };
        init_material_trait(&mut target, None);
        assert!(target.material.is_none());
        assert!(target.material_data.is_none());
    }

    #[test]
    fn applies_material_and_material_data_overrides_and_retains_identity() {
        let expected_material = material();
        let expected_data = material_data();
        let mut target = HasMaterial {
            material: None,
            material_data: None,
        };
        let options = HasMaterialOptions {
            material: Some(expected_material.clone()),
            material_data: Some(expected_data.clone()),
        };
        init_material_trait(&mut target, Some(&options));
        assert!(Arc::ptr_eq(
            target.material.as_ref().expect("material"),
            &expected_material
        ));
        assert!(Arc::ptr_eq(
            target.material_data.as_ref().expect("material data"),
            &expected_data
        ));
    }
}
