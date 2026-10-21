use flight_materials::classic_materials::create_phong_material;
use flight_materials::material::*;
use flight_materials::standard_material::create_standard_material;
use flight_materials::{Material, MaterialFields};

mod clone_material {
    use super::*;

    #[test]
    fn returns_a_new_object_with_the_same_kind() {
        let original = create_material("TestMaterial".to_string());
        let cloned = clone_material(&original);
        assert_eq!(cloned.kind, "TestMaterial");
    }

    #[test]
    fn carries_the_authored_name_onto_the_clone() {
        let mut original = create_material("TestMaterial".to_string());
        original.name = Some("canopy".to_string());
        assert_eq!(clone_material(&original).name.as_deref(), Some("canopy"));
    }
}

mod copy_material {
    use super::*;

    #[test]
    fn copies_fields_from_source_to_out() {
        let source = create_material("TestMaterial".to_string());
        let mut out = create_material("Other".to_string());
        copy_material(&mut out, &source);
        assert_eq!(out.kind, "TestMaterial");
    }

    #[test]
    fn is_noop_when_out_is_source() {
        let mut m = create_material("TestMaterial".to_string());
        let src = m.clone();
        copy_material(&mut m, &src);
        assert_eq!(m.kind, "TestMaterial");
    }
}

mod create_material {
    use super::*;

    #[test]
    fn creates_material_carrying_the_given_kind() {
        let material = create_material("TestMaterial".to_string());
        assert_eq!(material.kind, "TestMaterial");
    }

    #[test]
    fn defaults_name_to_none() {
        assert!(create_material("TestMaterial".to_string()).name.is_none());
    }
}

mod equals_material {
    use super::*;

    #[test]
    fn is_false_for_different_kinds() {
        assert!(!equals_material(
            &create_material("A".to_string()),
            &create_material("B".to_string()),
        ));
    }

    #[test]
    fn is_true_for_same_kind_materials() {
        assert!(equals_material(
            &create_material("A".to_string()),
            &create_material("A".to_string()),
        ));
    }
}

mod get_material_of_kind {
    use super::*;

    #[test]
    fn returns_material_when_kind_matches() {
        let material = create_material("TestMaterial".to_string());
        assert!(get_material_of_kind(Some(&material), "TestMaterial").is_some());
    }

    #[test]
    fn returns_none_when_kind_does_not_match() {
        let material = create_material("TestMaterial".to_string());
        assert!(get_material_of_kind(Some(&material), "Other").is_none());
    }

    #[test]
    fn returns_none_for_none_material() {
        assert!(get_material_of_kind(None, "TestMaterial").is_none());
    }
}

mod initialize_material {
    use super::*;

    #[test]
    fn sets_kind_and_clears_name() {
        let mut material = create_material("Placeholder".to_string());
        initialize_material(&mut material, "TestMaterial".to_string());
        assert_eq!(material.kind, "TestMaterial");
        assert!(material.name.is_none());
    }
}

mod material_family {
    use super::*;

    #[test]
    fn generic_base_readers_accept_2d_3d_and_base_kinds() {
        let base = create_material("Base".to_string());
        let standard = create_standard_material(None);
        let phong = create_phong_material(None);
        let materials: [&dyn Material; 3] = [&base, &standard, &phong];
        let kinds: Vec<&str> = materials.iter().map(|m| m.material_fields().kind.as_str()).collect();
        assert_eq!(kinds, vec!["Base", "StandardMaterial", "PhongMaterial"]);
        assert!(get_material_of_kind(Some(&phong as &dyn Material), "PhongMaterial").is_some());
        assert!(get_material_of_kind(Some(&standard as &dyn Material), "PhongMaterial").is_none());
    }

    #[test]
    fn copies_and_compares_base_fields_across_families() {
        let mut phong = create_phong_material(None);
        let mut named = create_material("StandardMaterial".to_string());
        named.name = Some("hero".to_string());
        copy_material(&mut phong, &named);
        assert_eq!((phong.kind.as_str(), phong.name.as_deref()), ("StandardMaterial", Some("hero")));
        assert!(equals_material(&phong, &named));
        let cloned: MaterialFields = clone_material(&phong);
        assert_eq!((cloned.kind.as_str(), cloned.name.as_deref()), ("StandardMaterial", Some("hero")));
        assert!(equals_material(&phong, &phong));
    }

    #[test]
    fn built_in_kinds_carry_no_modifier_stream() {
        assert!(create_material("Base".to_string()).modifier_stream().is_none());
        assert!(create_standard_material(None).modifier_stream().is_none());
        assert!(create_phong_material(None).modifier_stream().is_none());
    }

    #[test]
    fn narrows_through_the_base_trait() {
        let phong = create_phong_material(None);
        let any: &dyn Material = &phong;
        assert!(any.as_any().downcast_ref::<flight_materials::PhongMaterial>().is_some());
        assert!(any.as_any().downcast_ref::<MaterialFields>().is_none());
    }
}
