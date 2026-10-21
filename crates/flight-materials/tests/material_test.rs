use flight_materials::*;
use flight_materials::material::*;

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
        let mut material = Material::default();
        initialize_material(&mut material, "TestMaterial".to_string());
        assert_eq!(material.kind, "TestMaterial");
        assert!(material.name.is_none());
    }
}
