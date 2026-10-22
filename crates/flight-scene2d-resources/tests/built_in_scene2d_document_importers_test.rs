use flight_image::ImageResourceReference;
use flight_node::{NodeRef, get_node_child_count};
use flight_path_boolean::MARTINEZ_PATH_BOOLEAN_KERNEL;
use flight_scene2d_resources::contract::*;

use crate::guard_state;

fn encode_var_uint(value: u64) -> Vec<u8> {
    let mut bytes = Vec::new();
    let mut remaining = value;
    loop {
        let group = (remaining & 0x7f) as u8;
        remaining >>= 7;
        bytes.push(if remaining > 0 { group | 0x80 } else { group });
        if remaining == 0 {
            return bytes;
        }
    }
}

fn push_text(out: &mut Vec<u8>, key: u64, value: &str) {
    out.extend(encode_var_uint(key));
    out.extend(encode_var_uint(value.len() as u64));
    out.extend(value.as_bytes());
}

fn rive_bytes(with_image: bool) -> Vec<u8> {
    let mut out = vec![0x52, 0x49, 0x56, 0x45];
    out.extend(encode_var_uint(7));
    out.extend(encode_var_uint(0));
    out.extend(encode_var_uint(0));
    out.push(0);
    if with_image {
        out.extend(encode_var_uint(105));
        push_text(&mut out, 203, "sky");
        out.push(0);
        let png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
        out.extend(encode_var_uint(106));
        out.extend(encode_var_uint(212));
        out.extend(encode_var_uint(png.len() as u64));
        out.extend(png);
        out.push(0);
    }
    out.extend(encode_var_uint(1));
    push_text(&mut out, 4, "Board");
    out.push(0);
    return out;
}

mod register_lottie_scene2d_document_importer {
    use super::*;

    #[test]
    fn adds_an_opt_in_bodymovin_codec_without_global_registration() {
        let mut registry = create_scene2d_document_importer_registry();
        register_lottie_scene2d_document_importer(&mut registry);
        let source = br#"{"v":"5.7.0","fr":30,"ip":0,"op":30,"w":100,"h":100,"layers":[]}"#;
        let document =
            create_scene2d_document_from_bytes(source, &registry, None, &guard_state()).unwrap();
        assert_eq!(
            document.read().unwrap().source_kind.as_deref(),
            Some("lottie")
        );
    }

    #[test]
    fn preserves_none_when_the_format_importer_rejects_a_document() {
        let mut registry = create_scene2d_document_importer_registry();
        register_lottie_scene2d_document_importer(&mut registry);
        let context = Scene2DDocumentImportContext {
            mime_type: Some("application/lottie+json".to_string()),
            url: None,
        };
        assert!(
            create_scene2d_document_from_bytes(
                b"{invalid",
                &registry,
                Some(&context),
                &guard_state(),
            )
            .is_none()
        );
    }
}

mod register_rive_scene2d_document_importer {
    use super::*;

    #[test]
    fn adds_an_opt_in_rive_codec_that_produces_a_document_root() {
        let mut registry = create_scene2d_document_importer_registry();
        register_rive_scene2d_document_importer(&MARTINEZ_PATH_BOOLEAN_KERNEL, &mut registry);
        let document =
            create_scene2d_document_from_bytes(&rive_bytes(false), &registry, None, &guard_state())
                .unwrap();
        let document = document.read().unwrap();
        assert_eq!(document.source_kind.as_deref(), Some("rive"));
        let root: NodeRef = document.root.clone();
        assert_eq!(get_node_child_count(&root), 1);
    }

    #[test]
    fn carries_an_embedded_image_out_as_an_unresolved_reference() {
        let mut registry = create_scene2d_document_importer_registry();
        register_rive_scene2d_document_importer(&MARTINEZ_PATH_BOOLEAN_KERNEL, &mut registry);
        let document =
            create_scene2d_document_from_bytes(&rive_bytes(true), &registry, None, &guard_state())
                .unwrap();
        let document = document.read().unwrap();
        assert_eq!(document.image_resources.len(), 1);
        let ImageResourceReference::Embedded(value) = &document.image_resources[0] else {
            panic!("expected embedded image");
        };
        assert_eq!(
            value.reference.read().unwrap().mime_type.as_deref(),
            Some("image/png")
        );
    }

    #[test]
    fn preserves_none_for_bytes_that_are_not_a_rive_file() {
        let mut registry = create_scene2d_document_importer_registry();
        register_rive_scene2d_document_importer(&MARTINEZ_PATH_BOOLEAN_KERNEL, &mut registry);
        assert!(
            create_scene2d_document_from_bytes(b"not a riv", &registry, None, &guard_state(),)
                .is_none()
        );
    }
}

mod register_svg_scene2d_document_importer {
    use super::*;

    #[test]
    fn adds_an_opt_in_svg_codec_that_produces_a_document_root() {
        let mut registry = create_scene2d_document_importer_registry();
        register_svg_scene2d_document_importer(&mut registry);
        let document = create_scene2d_document_from_bytes(
            br#"<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="20"/></svg>"#,
            &registry,
            None,
            &guard_state(),
        )
        .unwrap();
        let document = document.read().unwrap();
        assert_eq!(document.source_kind.as_deref(), Some("svg"));
        let root: NodeRef = document.root.clone();
        assert_eq!(get_node_child_count(&root), 1);
    }

    #[test]
    fn preserves_none_when_the_format_importer_rejects_a_document() {
        let mut registry = create_scene2d_document_importer_registry();
        register_svg_scene2d_document_importer(&mut registry);
        let context = Scene2DDocumentImportContext {
            mime_type: Some("image/svg+xml".to_string()),
            url: None,
        };
        assert!(
            create_scene2d_document_from_bytes(
                b"<not-svg/>",
                &registry,
                Some(&context),
                &guard_state(),
            )
            .is_none()
        );
    }
}
