use super::three_ds_test_helper::*;
use flight_scene3d_formats::*;
use std::sync::{Arc, RwLock};

mod parse_three_ds_material {
    use super::*;
    #[test]
    fn reads_named_colors_shininess_transparency_and_three_independent_texture_filenames() {
        let mut children = Vec::new();
        children.extend_from_slice(&write_chunk(THREE_DS_MATERIAL_NAME, b"Skin\0"));
        children.extend_from_slice(&write_chunk(
            THREE_DS_MATERIAL_DIFFUSE,
            &write_chunk(THREE_DS_COLOR_BYTE, &[204, 102, 51]),
        ));
        for (id, name) in [
            (THREE_DS_MATERIAL_TEXTURE_MAP, "diffuse.png"),
            (THREE_DS_MATERIAL_BUMP_MAP, "height.png"),
            (THREE_DS_MATERIAL_OPACITY_MAP, "alpha.png"),
        ] {
            children.extend_from_slice(&write_chunk(
                id,
                &write_chunk(
                    THREE_DS_MATERIAL_TEXTURE_FILENAME,
                    format!("{name}\0").as_bytes(),
                ),
            ));
        }
        children.extend_from_slice(&write_chunk(
            THREE_DS_MATERIAL_SHININESS,
            &write_chunk(THREE_DS_PERCENT_INT, &50u16.to_le_bytes()),
        ));
        children.extend_from_slice(&write_chunk(
            THREE_DS_MATERIAL_TRANSPARENCY,
            &write_chunk(THREE_DS_PERCENT_FLOAT, &0.25f32.to_le_bytes()),
        ));
        let bytes = write_chunk(THREE_DS_MATERIAL, &children);
        let material = parse_three_ds_material(&bytes, 0, bytes.len());
        assert_eq!(material.name, "Skin");
        assert_eq!(
            material.diffuse,
            [204.0 / 255.0, 102.0 / 255.0, 51.0 / 255.0]
        );
        assert_eq!(material.ambient, [0.0; 3]);
        assert_eq!(material.specular, [1.0; 3]);
        assert_eq!(material.shininess, Some(64.0));
        assert_eq!(material.opacity, 0.75);
        assert_eq!(material.texture_filename.as_deref(), Some("diffuse.png"));
        assert_eq!(material.bump_filename.as_deref(), Some("height.png"));
        assert_eq!(material.opacity_filename.as_deref(), Some("alpha.png"));
        let bytes = write_chunk(
            THREE_DS_MATERIAL,
            &write_chunk(
                THREE_DS_MATERIAL_SHININESS,
                &write_chunk(THREE_DS_PERCENT_INT, &0u16.to_le_bytes()),
            ),
        );
        assert_eq!(
            parse_three_ds_material(&bytes, 0, bytes.len()).shininess,
            Some(0.0)
        );
        let bytes = write_chunk(THREE_DS_MATERIAL, &[]);
        let material = parse_three_ds_material(&bytes, 0, bytes.len());
        assert_eq!(material.shininess, None);
        assert_eq!(material.opacity, 1.0);
        assert_eq!(material.diffuse, [1.0; 3]);
    }
}

mod three_ds_material_handler {
    use super::*;
    #[test]
    fn family_retains_handler_identity_and_duplicate_names_replace_without_reordering() {
        assert_eq!(THREE_DS_MATERIAL_FAMILY.len(), 1);
        assert!(Arc::ptr_eq(
            &THREE_DS_MATERIAL_FAMILY[0],
            &THREE_DS_MATERIAL_HANDLER
        ));
        assert_eq!(
            THREE_DS_MATERIAL_HANDLER.read().unwrap().chunk_ids,
            [THREE_DS_MATERIAL]
        );
        let inspect = Arc::new(RwLock::new(ThreeDsChunkHandler {
            chunk_ids: vec![0x8888],
            collect: Arc::new(|_, _, _, _, _| {}),
            build: Some(Arc::new(|state| {
                assert_eq!(
                    state
                        .materials
                        .iter()
                        .map(|entry| entry.key.as_str())
                        .collect::<Vec<_>>(),
                    ["A", "B"]
                );
                assert_eq!(state.materials[0].value.diffuse, [1.0, 0.0, 0.0]);
            })),
        }));
        let material = |name: &str, color: &[u8]| {
            let mut bytes =
                write_chunk(THREE_DS_MATERIAL_NAME, format!("{name}\0").as_bytes()).to_vec();
            bytes.extend_from_slice(&write_chunk(
                THREE_DS_MATERIAL_DIFFUSE,
                &write_chunk(THREE_DS_COLOR_BYTE, color),
            ));
            return write_chunk(THREE_DS_MATERIAL, &bytes);
        };
        let bytes = build_minimal_three_ds(&[
            material("A", &[0, 0, 0]),
            material("B", &[0, 0, 255]),
            material("A", &[255, 0, 0]),
            material("", &[0, 0, 0]),
        ]);
        parse_three_ds_document_with_dispatch(&bytes, None, &{
            let mut output = Vec::new();
            build_three_ds_chunk_dispatch(
                &mut output,
                &[THREE_DS_MATERIAL_HANDLER.clone(), inspect],
            );
            output
        });
    }
}
