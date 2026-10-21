use flight_materials::standard_material::*;
use flight_materials::*;

mod create_standard_material {
    use super::*;

    #[test]
    fn creates_with_correct_kind() {
        let m = create_standard_material(None);
        assert_eq!(m.kind, STANDARD_MATERIAL_KIND);
        assert!(m.name.is_none());
    }

    #[test]
    fn creates_with_name() {
        let opts = StandardMaterialOptions { name: Some("MyMaterial".to_string()) };
        let m = create_standard_material(Some(&opts));
        assert_eq!(m.kind, STANDARD_MATERIAL_KIND);
        assert_eq!(m.name, Some("MyMaterial".to_string()));
    }
}

mod initialize_standard_material {
    use super::*;

    #[test]
    fn sets_kind_and_name() {
        let mut m = create_standard_material(None);
        let opts = StandardMaterialOptions { name: Some("NewName".to_string()) };
        initialize_standard_material(&mut m, Some(&opts));
        assert_eq!(m.kind, STANDARD_MATERIAL_KIND);
        assert_eq!(m.name, Some("NewName".to_string()));
    }
}
