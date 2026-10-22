use flight_scene3d_formats::contract::*;

mod scene3d_format_requirements {
    use super::*;

    #[test]
    fn uses_distinct_namespaces_with_the_exact_source_values() {
        let namespaces = [
            COLLADA_REQUIREMENT_KEY_NAMESPACE,
            MD2_REQUIREMENT_KEY_NAMESPACE,
            MD5_REQUIREMENT_KEY_NAMESPACE,
            OBJ_REQUIREMENT_KEY_NAMESPACE,
            THREE_DS_REQUIREMENT_KEY_NAMESPACE,
        ];
        for (index, namespace) in namespaces.iter().enumerate() {
            assert!(!namespaces[..index].contains(namespace));
        }
        assert_eq!(COLLADA_REQUIREMENT_KEY_NAMESPACE, "dae");
        assert_eq!(MD2_REQUIREMENT_KEY_NAMESPACE, "md2");
        assert_eq!(MD5_REQUIREMENT_KEY_NAMESPACE, "md5");
        assert_eq!(OBJ_REQUIREMENT_KEY_NAMESPACE, "obj");
        assert_eq!(THREE_DS_REQUIREMENT_KEY_NAMESPACE, "3ds");
    }
}
