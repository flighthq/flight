use flight_materials::standard_material::*;
use flight_materials::*;

mod create_standard_material {
    use super::*;

    #[test]
    fn creates_with_correct_kind() {
        let m = create_standard_material();
        assert_eq!(m.kind, STANDARD_MATERIAL_KIND);
        assert!(m.name.is_none());
    }

    #[test]
    fn creates_with_name() {
        let m = {
            let mut value = create_standard_material();
            value.name = Some("MyMaterial".to_string());
            value
        };
        assert_eq!(m.kind, STANDARD_MATERIAL_KIND);
        assert_eq!(m.name, Some("MyMaterial".to_string()));
    }
}

mod initialize_standard_material {
    use super::*;

    #[test]
    fn sets_kind_and_name() {
        let mut m = create_standard_material();
        initialize_standard_material(&mut m);
        m.name = Some("NewName".to_string());
        assert_eq!(m.kind, STANDARD_MATERIAL_KIND);
        assert_eq!(m.name, Some("NewName".to_string()));
    }
}
