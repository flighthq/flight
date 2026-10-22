use flight_materials::contract::{create_clearcoat_pbr_extension, create_sheen_pbr_extension};
use flight_materials::extended_pbr_material::*;
use flight_materials::*;

mod create_extended_pbr_material {
    use super::*;

    #[test]
    fn creates_with_standard_pbr_base() {
        let m = create_extended_pbr_material(None);
        assert_eq!(m.kind, EXTENDED_PBR_MATERIAL_KIND);
        assert_eq!(m.standard.base_color, 0xffffffff);
        assert_eq!(m.standard.metallic, 0.0);
        assert_eq!(m.standard.roughness, 1.0);
        assert!(m.extensions.is_empty());
    }

    #[test]
    fn retains_supplied_extension_handles_and_observes_mutations_through_each_alias() {
        let clearcoat = std::sync::Arc::new(std::sync::RwLock::new(PbrExtension::Clearcoat(
            create_clearcoat_pbr_extension(None),
        )));
        let sheen = std::sync::Arc::new(std::sync::RwLock::new(PbrExtension::Sheen(
            create_sheen_pbr_extension(None),
        )));
        let options = ExtendedPbrMaterialOptions {
            name: None,
            alpha_cutoff: None,
            alpha_mode: None,
            blend_mode: None,
            double_sided: None,
            extensions: Some(vec![clearcoat.clone(), sheen.clone()]),
            standard: None,
        };
        let mut first = create_extended_pbr_material(Some(&options));
        let second = create_extended_pbr_material(Some(&options));
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
        assert_eq!(options.extensions.as_ref().unwrap().len(), 2);
        assert_eq!(second.extensions.len(), 2);
        assert!(std::sync::Arc::ptr_eq(&second.extensions[0], &clearcoat));
    }
}
