use crate::awd2_block_dispatch::{create_awd2_parse_state, expand_awd2_block_dispatch};
use crate::awd2_schema::*;
use crate::awd2_types::Awd2RehydratedBody;
use crate::awd2_types::{
    Awd2Block, Awd2BlockDispatch, Awd2BlockHandler, Awd2ParseOptions, Awd2ParseState,
};
use crate::three_ds_read::read_three_ds_u32;
use flight_compression::{
    CompressionFraming, Decompressor, HostDecompressDeflateCapability, HostDecompressLzmaCapability,
};
use flight_entity::{Ref, Uint8Array};
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
    report_import_diagnostic,
};
use flight_scene3d::{
    Scene3D, Scene3DDocument, Scene3DDocumentScene, create_scene3d_from_document,
};
use std::collections::HashMap;
use std::sync::{Arc, RwLock};

#[cfg(test)]
mod sugar_tests {
    use super::*;

    #[test]
    fn receiver_forwards_the_original_custom_handler_family_and_collector_without_hidden_defaults()
    {
        let handler = Arc::new(RwLock::new(Awd2BlockHandler {
            block_types: vec![90],
            build_phase: None,
            deferred: None,
            build: None,
            parse: Arc::new(|state, _| {
                state.document.write().unwrap().scenes[0].name = Some("vendor".to_string())
            }),
        }));
        let mut bytes = vec![
            0x41, 0x57, 0x44, 2, 1, 0, 0, 0, 11, 0, 0, 0, 1, 0, 0, 0, 0, 90, 0, 0, 0, 0, 0,
        ];
        for blocks in [Vec::new(), vec![handler]] {
            let is_custom = !blocks.is_empty();
            let options = Awd2ParseOptions {
                blocks,
                deflate: None,
                lzma: None,
            };
            let input = Arc::new(RwLock::new(bytes.clone().into_boxed_slice()));
            let receiver_diagnostics = Arc::new(RwLock::new(Vec::new()));
            let free_diagnostics = Arc::new(RwLock::new(Vec::new()));
            let receiver = options.parse(&input, Some(&receiver_diagnostics));
            let free = parse_awd2(&input, &options, Some(&free_diagnostics));
            let receiver = receiver.read().unwrap();
            let free = free.read().unwrap();
            assert_eq!(receiver.scenes[0].name, free.scenes[0].name);
            assert_eq!(
                receiver.scenes[0].name.as_deref(),
                if is_custom { Some("vendor") } else { None }
            );
            assert_eq!(
                *receiver_diagnostics.read().unwrap(),
                *free_diagnostics.read().unwrap()
            );
        }
        bytes[3] = 3;
        let options = Awd2ParseOptions {
            blocks: Vec::new(),
            deflate: None,
            lzma: None,
        };
        assert!(
            options
                .parse(&Arc::new(RwLock::new(bytes.into_boxed_slice())), None)
                .read()
                .unwrap()
                .nodes
                .is_empty()
        );
    }
}

struct Awd2UnhandledBlock {
    block_type: u8,
    count: usize,
    first_block_id: u32,
    namespace: u8,
}

struct Awd2DeferredBlock {
    block: Awd2Block,
    handler: Ref<Awd2BlockHandler>,
}

pub fn create_scene3d_from_awd2(
    bytes: &Ref<Box<Uint8Array>>,
    options: &Awd2ParseOptions,
    diagnostics: Option<&Ref<Vec<ImportDiagnostic>>>,
) -> Scene3D {
    let document = parse_awd2(bytes, options, diagnostics);
    return create_scene3d_from_document(&document.read().unwrap(), None);
}

fn build_phase_order(blocks: &[Ref<Awd2BlockHandler>]) -> Vec<Ref<Awd2BlockHandler>> {
    let mut with_build: Vec<Ref<Awd2BlockHandler>> = blocks
        .iter()
        .filter(|handler| handler.read().unwrap().build.is_some())
        .cloned()
        .collect();
    // D3 stable source sort: NaN comparator results retain the input order.
    with_build.sort_by(|a, b| {
        let a = a.read().unwrap().build_phase.unwrap_or(0.0);
        let b = b.read().unwrap().build_phase.unwrap_or(0.0);
        return (a - b)
            .partial_cmp(&0.0)
            .unwrap_or(std::cmp::Ordering::Equal);
    });
    return with_build;
}

pub(crate) fn empty_awd_document() -> Scene3DDocument {
    return Scene3DDocument {
        animations: Vec::new(),
        cameras: Vec::new(),
        lights: Vec::new(),
        materials: Vec::new(),
        meshes: Vec::new(),
        metadata: None,
        nodes: Vec::new(),
        resources: Vec::new(),
        scenes: vec![Scene3DDocumentScene {
            name: None,
            root_nodes: Vec::new(),
        }],
        skins: Vec::new(),
    };
}

fn is_awd2_version(input: &Uint8Array, diagnostics: Option<&Ref<Vec<ImportDiagnostic>>>) -> bool {
    let version = input[AWD2_VERSION_MAJOR_OFFSET];
    if version == AWD2_FORMAT_VERSION {
        return true;
    }
    let mut detail = HashMap::new();
    detail.insert(
        "version".to_string(),
        ImportDiagnosticDetailValue::Number(version as f32),
    );
    report_awd_diagnostic(
        diagnostics,
        ImportDiagnosticSeverity::Reject,
        "awd2.unsupported-version",
        "isAwd2Version",
        Some(detail),
    );
    return false;
}

pub fn parse_awd2(
    bytes: &Ref<Box<Uint8Array>>,
    options: &Awd2ParseOptions,
    diagnostics: Option<&Ref<Vec<ImportDiagnostic>>>,
) -> Ref<Scene3DDocument> {
    let document = Arc::new(RwLock::new(empty_awd_document()));
    {
        let input = bytes.read().unwrap();
        if input.len() < AWD2_HEADER_BYTES {
            report_awd_diagnostic(
                diagnostics,
                ImportDiagnosticSeverity::Reject,
                "awd2.header-too-short",
                "parseAwd2",
                None,
            );
            return document;
        }
        if input[0] != AWD2_MAGIC_0 || input[1] != AWD2_MAGIC_1 || input[2] != AWD2_MAGIC_2 {
            report_awd_diagnostic(
                diagnostics,
                ImportDiagnosticSeverity::Reject,
                "awd2.bad-magic",
                "parseAwd2",
                None,
            );
            return document;
        }
        if !is_awd2_version(&input, diagnostics) {
            return document;
        }
    }
    let deflate = options.deflate.as_ref().and_then(|slot| slot.as_deref());
    let lzma = options.lzma.as_ref().and_then(|slot| slot.as_deref());
    let Some(rehydrated) = rehydrate_awd2_body(bytes, deflate, lzma, diagnostics) else {
        return document;
    };
    let mut state = create_awd2_parse_state();
    state.document = document.clone();
    state.source = rehydrated.source;
    state.view = rehydrated.view;
    state.diagnostics = diagnostics.cloned();
    let mut dispatch = Vec::new();
    expand_awd2_block_dispatch(&mut dispatch, &options.blocks);
    walk_awd2_blocks(&mut state, &dispatch);
    for handler in build_phase_order(&options.blocks) {
        let build = handler.read().unwrap().build.clone().unwrap();
        build(&mut state);
    }
    return document;
}

pub fn rehydrate_awd2_body(
    input: &Ref<Box<Uint8Array>>,
    deflate: Option<&HostDecompressDeflateCapability>,
    lzma: Option<&HostDecompressLzmaCapability>,
    diagnostics: Option<&Ref<Vec<ImportDiagnostic>>>,
) -> Option<Awd2RehydratedBody> {
    let compression = input.read().unwrap().get(7).copied();
    if compression == Some(AWD2_COMPRESSION_NONE) {
        return Some(Awd2RehydratedBody {
            source: input.clone(),
            view: input.clone(),
        });
    }
    let mut detail = HashMap::new();
    if let Some(compression) = compression {
        detail.insert(
            "compression".to_string(),
            ImportDiagnosticDetailValue::Number(compression as f32),
        );
    }
    let decompressor = resolve_awd_decompressor(compression, deflate, lzma);
    let Some(decompressor) = decompressor else {
        report_awd_diagnostic(
            diagnostics,
            ImportDiagnosticSeverity::Reject,
            "awd2.compression-no-decompressor",
            "rehydrateAwd2Body",
            Some(detail),
        );
        return None;
    };
    // Release the buffer borrow before calling retained host code. The byte window is a native input snapshot.
    let compressed = {
        let input = input.read().unwrap();
        let end = (AWD2_HEADER_BYTES + read_three_ds_u32(&input, 8) as usize).min(input.len());
        input[AWD2_HEADER_BYTES.min(input.len())..end].to_vec()
    };
    let framing = if compression == Some(AWD2_COMPRESSION_DEFLATE) {
        CompressionFraming::Rfc1950
    } else {
        CompressionFraming::Raw
    };
    let Some(inflated) = decompressor(&compressed, 0, framing) else {
        report_awd_diagnostic(
            diagnostics,
            ImportDiagnosticSeverity::Reject,
            "awd2.decompression-failed",
            "rehydrateAwd2Body",
            Some(detail),
        );
        return None;
    };
    let mut bytes = vec![0; AWD2_HEADER_BYTES + inflated.len()].into_boxed_slice();
    {
        let input = input.read().unwrap();
        let header_end = AWD2_HEADER_BYTES.min(input.len());
        bytes[..header_end].copy_from_slice(&input[..header_end]);
    }
    bytes[AWD2_HEADER_BYTES..].copy_from_slice(&inflated);
    bytes[7] = AWD2_COMPRESSION_NONE;
    bytes[8..12].copy_from_slice(&(inflated.len() as u32).to_le_bytes());
    let source = Arc::new(RwLock::new(bytes));
    return Some(Awd2RehydratedBody {
        source: source.clone(),
        view: source,
    });
}

pub(crate) fn report_awd_diagnostic(
    diagnostics: Option<&Ref<Vec<ImportDiagnostic>>>,
    severity: ImportDiagnosticSeverity,
    kind: &str,
    origin: &str,
    detail: Option<HashMap<String, ImportDiagnosticDetailValue>>,
) {
    if let Some(diagnostics) = diagnostics {
        report_import_diagnostic(
            Some(&mut diagnostics.write().unwrap()),
            severity,
            kind,
            origin,
            detail,
        );
    }
}

fn resolve_awd_decompressor(
    compression: Option<u8>,
    deflate: Option<&HostDecompressDeflateCapability>,
    lzma: Option<&HostDecompressLzmaCapability>,
) -> Option<Decompressor> {
    return match compression {
        Some(AWD2_COMPRESSION_DEFLATE) => deflate.map(|slot| slot.decompress.clone()),
        Some(AWD2_COMPRESSION_LZMA) => lzma.map(|slot| slot.decompress.clone()),
        _ => None,
    };
}

fn tally_unhandled_awd_block(
    tally: &mut Vec<Awd2UnhandledBlock>,
    namespace: u8,
    block_type: u8,
    block_id: u32,
) {
    if let Some(entry) = tally
        .iter_mut()
        .find(|entry| entry.namespace == namespace && entry.block_type == block_type)
    {
        entry.count += 1;
    } else {
        tally.push(Awd2UnhandledBlock {
            block_type,
            count: 1,
            first_block_id: block_id,
            namespace,
        });
    }
}

fn walk_awd2_blocks(state: &mut Awd2ParseState, dispatch: &Awd2BlockDispatch) {
    let body_length = read_three_ds_u32(&state.view.read().unwrap(), 8) as usize;
    let body_end = (AWD2_HEADER_BYTES + body_length).min(state.source.read().unwrap().len());
    let mut unhandled: Vec<Awd2UnhandledBlock> = Vec::new();
    let mut deferred: Vec<Awd2DeferredBlock> = Vec::new();
    let mut offset = AWD2_HEADER_BYTES;
    while offset + AWD2_BLOCK_HEADER_BYTES <= body_end {
        let block_id = read_three_ds_u32(&state.view.read().unwrap(), offset);
        let (namespace, block_type, block_flags) = {
            let source = state.source.read().unwrap();
            (source[offset + 4], source[offset + 5], source[offset + 6])
        };
        let block_length = read_three_ds_u32(&state.view.read().unwrap(), offset + 7) as usize;
        let data_start = offset + AWD2_BLOCK_HEADER_BYTES;
        if data_start + block_length > body_end {
            report_awd_diagnostic(
                state.diagnostics.as_ref(),
                ImportDiagnosticSeverity::Drop,
                "awd2.block-length-past-end",
                "parseAwd2",
                None,
            );
            break;
        }
        let handler = if namespace == AWD2_NAMESPACE_CORE {
            dispatch
                .iter()
                .find(|entry| entry.block_type == block_type)
                .map(|entry| entry.handler.clone())
        } else {
            None
        };
        if let Some(handler) = handler {
            let block = Awd2Block {
                block_id,
                block_type,
                data_end: data_start + block_length,
                data_start,
                geometry_wide: block_flags & 2 != 0,
                matrix_wide: block_flags & 1 != 0,
                source: state.source.clone(),
                view: state.view.clone(),
            };
            let is_deferred = handler.read().unwrap().deferred == Some(true);
            if is_deferred {
                deferred.push(Awd2DeferredBlock { block, handler });
            } else {
                let parse = handler.read().unwrap().parse.clone();
                parse(state, &block);
            }
        } else {
            tally_unhandled_awd_block(&mut unhandled, namespace, block_type, block_id);
        }
        offset = data_start + block_length;
    }
    for entry in deferred {
        let parse = entry.handler.read().unwrap().parse.clone();
        parse(state, &entry.block);
    }
    for entry in unhandled {
        let mut detail = HashMap::new();
        detail.insert(
            "blockType".to_string(),
            ImportDiagnosticDetailValue::Number(entry.block_type as f32),
        );
        detail.insert(
            "count".to_string(),
            ImportDiagnosticDetailValue::Number(entry.count as f32),
        );
        detail.insert(
            "firstBlockId".to_string(),
            ImportDiagnosticDetailValue::Number(entry.first_block_id as f32),
        );
        detail.insert(
            "namespace".to_string(),
            ImportDiagnosticDetailValue::Number(entry.namespace as f32),
        );
        report_awd_diagnostic(
            state.diagnostics.as_ref(),
            ImportDiagnosticSeverity::Drop,
            "awd2.block-unhandled",
            "parseAwd2",
            Some(detail),
        );
    }
}

impl Awd2ParseOptions {
    pub fn parse(
        &self,
        bytes: &Ref<Box<Uint8Array>>,
        diagnostics: Option<&Ref<Vec<ImportDiagnostic>>>,
    ) -> Ref<Scene3DDocument> {
        return parse_awd2(bytes, self, diagnostics);
    }
}
