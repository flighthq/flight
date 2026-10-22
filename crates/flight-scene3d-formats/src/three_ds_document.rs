use crate::three_ds_chunk_dispatch::build_three_ds_chunk_dispatch;
use crate::three_ds_chunk_registry::THREE_DS_ALL_CHUNK_HANDLERS;
use crate::three_ds_parse::parse_three_ds_document_with_dispatch;
use crate::three_ds_types::ThreeDsImportOptions;
use flight_entity::Uint8Array;
use flight_importdiagnostics::ImportDiagnostic;
use flight_scene3d::{Scene3D, Scene3DDocument, create_scene3d_from_document};

#[cfg(test)]
mod sugar_tests {
    use super::*;
    use crate::three_ds_types::ThreeDsChunkHandler;
    use std::sync::{Arc, RwLock};

    #[test]
    fn receiver_matches_free_parse_and_forwards_the_exact_custom_or_empty_family() {
        let bytes = [0x4d, 0x4d, 12, 0, 0, 0, 0x88, 0x88, 6, 0, 0, 0];
        let handler = Arc::new(RwLock::new(ThreeDsChunkHandler {
            chunk_ids: vec![0x8888],
            build: None,
            collect: Arc::new(|state, _, _, _, _| {
                state.document.scenes[0].name = Some("vendor".to_string());
            }),
        }));
        for handlers in [Vec::new(), vec![handler]] {
            let custom = !handlers.is_empty();
            let options = ThreeDsImportOptions {
                handlers: Some(handlers),
            };
            let mut receiver_diagnostics = Vec::new();
            let mut free_diagnostics = Vec::new();
            let receiver = options.parse(&bytes, Some(&mut receiver_diagnostics));
            let free = parse3ds(&bytes, Some(&mut free_diagnostics), Some(&options));
            assert_eq!(receiver.scenes[0].name, free.scenes[0].name);
            assert_eq!(
                receiver.scenes[0].name.as_deref(),
                if custom { Some("vendor") } else { None }
            );
            assert_eq!(receiver.scenes[0].root_nodes, free.scenes[0].root_nodes);
            assert_eq!(receiver_diagnostics, free_diagnostics);
        }
    }
}

pub fn create_scene3d_from_3ds(
    bytes: &Uint8Array,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
    options: Option<&ThreeDsImportOptions>,
) -> Scene3D {
    return create_scene3d_from_document(&parse3ds(bytes, diagnostics, options), None);
}

pub fn parse3ds(
    bytes: &Uint8Array,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
    options: Option<&ThreeDsImportOptions>,
) -> Scene3DDocument {
    let handlers = options
        .and_then(|options| options.handlers.as_deref())
        .unwrap_or(&THREE_DS_ALL_CHUNK_HANDLERS);
    let mut dispatch = Vec::new();
    build_three_ds_chunk_dispatch(&mut dispatch, handlers);
    return parse_three_ds_document_with_dispatch(bytes, diagnostics, &dispatch);
}

impl ThreeDsImportOptions {
    pub fn parse(
        &self,
        bytes: &Uint8Array,
        diagnostics: Option<&mut Vec<ImportDiagnostic>>,
    ) -> Scene3DDocument {
        return parse3ds(bytes, diagnostics, Some(self));
    }
}
