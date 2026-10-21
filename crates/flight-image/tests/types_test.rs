use flight_image::contract::*;

mod get_image_cross_origin_string {
    use super::*;

    #[test]
    fn returns_exact_contract_strings() {
        assert_eq!(
            get_image_cross_origin_string(ImageCrossOrigin::Anonymous),
            "anonymous"
        );
        assert_eq!(
            get_image_cross_origin_string(ImageCrossOrigin::UseCredentials),
            "use-credentials"
        );
    }
}

mod get_image_operation_string {
    use super::*;

    #[test]
    fn returns_exact_contract_strings() {
        assert_eq!(
            get_image_operation_string(ImageOperation::CreateImageFromBitmap),
            "createImageFromBitmap"
        );
        assert_eq!(
            get_image_operation_string(ImageOperation::CreateImageFromSurface),
            "createImageFromSurface"
        );
        assert_eq!(
            get_image_operation_string(ImageOperation::LoadImageFromUrl),
            "loadImageFromUrl"
        );
    }
}

mod get_image_resource_failure_kind_string {
    use super::*;

    #[test]
    fn returns_exact_contract_strings() {
        assert_eq!(
            get_image_resource_failure_kind_string(ImageResourceFailureKind::Error),
            "Error"
        );
        assert_eq!(
            get_image_resource_failure_kind_string(ImageResourceFailureKind::Unavailable),
            "Unavailable"
        );
    }
}

mod get_image_resource_reference_kind_string {
    use super::*;

    #[test]
    fn returns_exact_contract_strings() {
        assert_eq!(
            get_image_resource_reference_kind_string(ImageResourceReferenceKind::Embedded),
            "Embedded"
        );
        assert_eq!(
            get_image_resource_reference_kind_string(ImageResourceReferenceKind::External),
            "External"
        );
    }
}

mod parse_image_cross_origin {
    use super::*;

    #[test]
    fn parses_only_exact_contract_strings() {
        assert_eq!(
            parse_image_cross_origin("use-credentials"),
            Some(ImageCrossOrigin::UseCredentials)
        );
        assert_eq!(parse_image_cross_origin("UseCredentials"), None);
    }
}

mod parse_image_operation {
    use super::*;

    #[test]
    fn parses_only_exact_contract_strings() {
        assert_eq!(
            parse_image_operation("loadImageFromUrl"),
            Some(ImageOperation::LoadImageFromUrl)
        );
        assert_eq!(parse_image_operation("load_image_from_url"), None);
    }
}

mod parse_image_resource_failure_kind {
    use super::*;

    #[test]
    fn parses_only_exact_contract_strings() {
        assert_eq!(
            parse_image_resource_failure_kind("Error"),
            Some(ImageResourceFailureKind::Error)
        );
        assert_eq!(parse_image_resource_failure_kind("error"), None);
    }
}

mod parse_image_resource_reference_kind {
    use super::*;

    #[test]
    fn parses_only_exact_contract_strings() {
        assert_eq!(
            parse_image_resource_reference_kind("External"),
            Some(ImageResourceReferenceKind::External)
        );
        assert_eq!(parse_image_resource_reference_kind("external"), None);
    }
}
