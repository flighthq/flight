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
        let m = create_standard_material(Some("MyMaterial".to_string()));
        assert_eq!(m.kind, STANDARD_MATERIAL_KIND);
        assert_eq!(m.name, Some("MyMaterial".to_string()));
    }
}
