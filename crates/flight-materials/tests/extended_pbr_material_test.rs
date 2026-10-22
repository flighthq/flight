use flight_materials::contract::{create_clearcoat_pbr_extension, create_sheen_pbr_extension};
use flight_materials::extended_pbr_material::*;
use flight_materials::*;

mod create_extended_pbr_material {
    use super::*;

    #[test]
    fn creates_with_standard_pbr_base() {
        let m = create_extended_pbr_material();
        assert_eq!(m.kind, EXTENDED_PBR_MATERIAL_KIND);
        assert_eq!(m.standard.base_color, 0xffffffff);
        assert_eq!(m.standard.metallic, 0.0);
        assert_eq!(m.standard.roughness, 1.0);
        assert!(m.extensions.is_empty());
    }

    #[test]
    fn retains_supplied_extension_handles_and_observes_mutations_through_each_alias() {
        let clearcoat = std::sync::Arc::new(std::sync::RwLock::new(PbrExtension::Clearcoat(
            create_clearcoat_pbr_extension(),
        )));
        let sheen = std::sync::Arc::new(std::sync::RwLock::new(PbrExtension::Sheen(
            create_sheen_pbr_extension(),
        )));
        // D23 B: the caller's extension list is assigned after create; each material holds its own
        // list of the same shared extension handles.
        let extensions = vec![clearcoat.clone(), sheen.clone()];
        let mut first = create_extended_pbr_material();
        first.extensions = extensions.clone();
        let mut second = create_extended_pbr_material();
        second.extensions = extensions.clone();
        assert_eq!(first.extensions.len(), 2);
        assert_eq!(second.extensions.len(), 2);
        assert!(std::sync::Arc::ptr_eq(&first.extensions[0], &clearcoat));
        assert!(std::sync::Arc::ptr_eq(&first.extensions[1], &sheen));
        assert!(std::sync::Arc::ptr_eq(&second.extensions[0], &clearcoat));
        assert!(std::sync::Arc::ptr_eq(&second.extensions[1], &sheen));
        {
            let mut alias = first.extensions[0].write().unwrap();
            let PbrExtension::Clearcoat(extension) = &mut *alias else {
                panic!("expected original clearcoat descriptor");
            };
            extension.clearcoat = 0.75;
        }
        {
            let alias = second.extensions[0].read().unwrap();
            let PbrExtension::Clearcoat(extension) = &*alias else {
                panic!("expected original clearcoat descriptor");
            };
            assert_eq!(extension.clearcoat, 0.75);
        }
        {
            let original = clearcoat.read().unwrap();
            let PbrExtension::Clearcoat(extension) = &*original else {
                panic!("expected original clearcoat descriptor");
            };
            assert_eq!(extension.clearcoat, 0.75);
        }
        first.extensions.clear();
        assert_eq!(extensions.len(), 2);
        assert_eq!(second.extensions.len(), 2);
        assert!(std::sync::Arc::ptr_eq(&second.extensions[0], &clearcoat));
    }
}

mod initialize_extended_pbr_material {
    use super::*;

    // D23 (I): the public construction seam of create_extended_pbr_material. It writes the source defaults over an
    // existing allocation and keeps the receiver's entity identity (D12).
    #[test]
    fn writes_the_source_defaults_and_keeps_the_receivers_identity() {
        let mut out = create_extended_pbr_material();
        let id = flight_entity::get_entity_id(&out);
        out.kind = "Changed".to_string();
        out.name = Some("changed".to_string());
        out.alpha_mode = MaterialAlphaMode::Blend;
        out.alpha_cutoff = 0.9;
        out.double_sided = true;
        initialize_extended_pbr_material(&mut out);
        let fresh = create_extended_pbr_material();
        assert_eq!(out.kind, EXTENDED_PBR_MATERIAL_KIND);
        assert_eq!(out.name, None);
        assert_eq!(out.alpha_mode, MaterialAlphaMode::Opaque);
        assert_eq!(out.alpha_cutoff, fresh.alpha_cutoff);
        assert_eq!(out.double_sided, false);
        assert_eq!(flight_entity::get_entity_id(&out), id);
    }
}
