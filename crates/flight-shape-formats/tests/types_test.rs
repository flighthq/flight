use flight_shape_formats::contract::*;

mod get_shape_command_schema_argument_type_string {
    use super::*;

    #[test]
    fn returns_every_source_keyword() {
        let values = [
            (ShapeCommandSchemaArgumentType::Boolean, "boolean"),
            (ShapeCommandSchemaArgumentType::MatrixOrNull, "matrixOrNull"),
            (ShapeCommandSchemaArgumentType::Number, "number"),
            (ShapeCommandSchemaArgumentType::Numbers, "numbers"),
            (
                ShapeCommandSchemaArgumentType::NumbersOrNull,
                "numbersOrNull",
            ),
            (ShapeCommandSchemaArgumentType::String, "string"),
            (ShapeCommandSchemaArgumentType::Texture, "texture"),
        ];
        for (value, expected) in values {
            assert_eq!(
                get_shape_command_schema_argument_type_string(value),
                expected
            );
        }
    }
}

mod parse_shape_command_schema_argument_type {
    use super::*;

    #[test]
    fn parses_exact_keywords_and_rejects_unknown_values() {
        assert_eq!(
            parse_shape_command_schema_argument_type("matrixOrNull"),
            Some(ShapeCommandSchemaArgumentType::MatrixOrNull)
        );
        assert_eq!(
            parse_shape_command_schema_argument_type("numbersOrNull"),
            Some(ShapeCommandSchemaArgumentType::NumbersOrNull)
        );
        assert_eq!(parse_shape_command_schema_argument_type("NUMBER"), None);
        assert_eq!(parse_shape_command_schema_argument_type(""), None);
    }
}
