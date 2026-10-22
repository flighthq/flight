use crate::md2_parse::parse_md2_with_section_handlers;
use crate::md2_section_registry::MD2_ALL_SECTION_HANDLERS;
use crate::md2_types::Md2ImportOptions;
use flight_entity::Uint8Array;
use flight_importdiagnostics::ImportDiagnostic;
use flight_scene3d::{Scene3D, Scene3DDocument, create_scene3d_from_document};

#[cfg(test)]
mod sugar_tests {
    use super::*;
    use crate::md2_types::Md2SectionHandler;
    use std::sync::{Arc, RwLock};

    #[test]
    fn receiver_matches_free_parse_with_empty_and_custom_families() {
        // One compressed source vertex and one degenerate triangle are sufficient for a valid MD2.
        let mut bytes = vec![0; 128];
        for (offset, value) in [
            (0, 0x32504449i32),
            (4, 8),
            (8, 64),
            (12, 64),
            (16, 44),
            (24, 1),
            (28, 1),
            (32, 1),
            (40, 1),
            (48, 68),
            (52, 72),
            (56, 84),
            (64, 128),
        ] {
            bytes[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
        }
        for offset in [84, 88, 92] {
            bytes[offset..offset + 4].copy_from_slice(&1.0f32.to_le_bytes());
        }
        let custom = Arc::new(RwLock::new(Md2SectionHandler {
            feature: "Vendor".to_string(),
            collect: Arc::new(|context| {
                context.mesh_materials.push(7);
                context.document.scenes[0].name = Some("custom".to_string());
            }),
        }));
        for handlers in [Vec::new(), vec![custom]] {
            let expected = if handlers.is_empty() {
                Vec::new()
            } else {
                vec![7]
            };
            let options = Md2ImportOptions {
                section_handlers: Some(handlers),
            };
            let method = options.parse(&bytes, None);
            let free = parse_md2(&bytes, None, Some(&options));
            assert_eq!(
                method.meshes[0].geometry.read().unwrap().vertices,
                free.meshes[0].geometry.read().unwrap().vertices
            );
            assert_eq!(method.meshes[0].materials, free.meshes[0].materials);
            assert_eq!(method.meshes[0].materials, expected);
            assert_eq!(method.scenes[0].name, free.scenes[0].name);
            assert_eq!(method.scenes[0].root_nodes, [0]);
        }
    }
}

pub fn create_scene3d_from_md2(
    bytes: &Uint8Array,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
    options: Option<&Md2ImportOptions>,
) -> Scene3D {
    return create_scene3d_from_document(&parse_md2(bytes, diagnostics, options), None);
}

pub fn parse_md2(
    bytes: &Uint8Array,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
    options: Option<&Md2ImportOptions>,
) -> Scene3DDocument {
    let handlers = options
        .and_then(|options| options.section_handlers.as_deref())
        .unwrap_or(&MD2_ALL_SECTION_HANDLERS);
    return parse_md2_with_section_handlers(bytes, diagnostics, handlers);
}

impl Md2ImportOptions {
    pub fn parse(
        &self,
        bytes: &Uint8Array,
        diagnostics: Option<&mut Vec<ImportDiagnostic>>,
    ) -> Scene3DDocument {
        return parse_md2(bytes, diagnostics, Some(self));
    }
}
