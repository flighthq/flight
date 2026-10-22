// flight-lint: allow-file(f64) SWF timelines and clip contours bridge the canonical f64 cadence and path lanes

use std::collections::{HashMap, HashSet};
use std::sync::{Arc, RwLock};

use flight_clip::{
    ClipRegion, create_clip_region_from_contours, create_clip_region_from_path,
    create_clip_region_state,
};
use flight_compression::{
    CompressionFraming, HostDecompressDeflateCapability, HostDecompressLzmaCapability,
};
use flight_entity::{Ref, Uint8Array, get_entity_id};
use flight_font::GlyphOutlineSource;
use flight_geometry::{
    Matrix, create_matrix, create_vector2, inverse_matrix, matrix_transform_point_xy,
    multiply_matrix,
};
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
    report_import_diagnostic,
};
use flight_movieclip::{MovieClip, add_movie_clip_frame_script, set_movie_clip_source};
use flight_node::{
    NodeOrderList, NodeRef, add_node_child, add_node_order_list_entry, apply_node_order_list,
    clear_node_order_list, create_node_order_list, invalidate_node_appearance, remove_node_child,
    set_node_color_adjustments, set_node_local_matrix,
};
use flight_path::PathWinding;
use flight_scene2d::contract::Scene2DSlotReference;
use flight_scene2d::{Node2DRef, set_node2d_clip};
use flight_scene2d_resources::{
    Scene2DDocument, Scene2DDocumentImportContext, Scene2DDocumentImporterRegistry,
    create_scene2d_document, create_scene2d_slot_reference, register_scene2d_document_importer,
};
use flight_shape::{get_shape_fill_regions, set_morph_shape_progress};
use flight_timeline::contract::TimelineSourceOptions;
use flight_timeline::{TimelineFrameArg, create_timeline_source};
use indexmap::IndexMap;

use crate::{
    MAX_TIMELINE_FRAME_ENTRIES, SwfDocumentImport, SwfFrameActions, SwfGuardState,
    SwfNodeAppearance, SwfNodeState, SwfParseOptions, SwfReader, SwfTagHandlerRef,
    SwfTagHandlerResources, SwfTagMatrix, SwfTagParseResult, SwfTagParseState, SwfTagPlacement,
    SwfTagRectangle, SwfTimeline, allocate_swf_document_import, apply_swf_morph_bounds,
    create_swf_display_object, create_swf_movie_clip, expand_swf_tag_handler_dispatch,
    merge_swf_rectangles, read_swf_rectangle, read_swf_timeline, transform_swf_rectangle,
};

struct SwfFile {
    frame_rate: f32,
    parsed: SwfTagParseResult,
    stage_bounds: SwfTagRectangle,
}

#[derive(Clone)]
struct SwfFrameEntry {
    clip: Option<Ref<ClipRegion>>,
    placement: SwfTagPlacement,
}

struct SwfInstantiationState {
    active_symbols: HashSet<u32>,
    appearances: Vec<SwfNodeAppearance>,
    diagnostics: Option<Ref<Vec<ImportDiagnostic>>>,
    frame_rate: Option<f64>,
    handlers: Vec<SwfTagHandlerRef>,
    resolved_bounds: HashMap<u32, Option<SwfTagRectangle>>,
    resolving_bounds: HashSet<u32>,
}

struct SwfTimelineRuntime {
    applied_alphas: HashMap<u64, f32>,
    applied_clips: HashMap<u64, Option<Ref<ClipRegion>>>,
    applied_color_adjustments: HashMap<u64, Option<crate::SwfAdjustmentStack>>,
    applied_matrices: HashMap<u64, SwfTagMatrix>,
    applied_ratios: HashMap<u64, f32>,
    attached: HashSet<u64>,
    depths: NodeOrderList,
}

fn create_diagnostic_store(enabled: bool) -> Option<Ref<Vec<ImportDiagnostic>>> {
    return if enabled {
        Some(Arc::new(RwLock::new(Vec::new())))
    } else {
        None
    };
}

// flight-lint: allow(conform-params) D16 Rust retains shared byte and font-source identities explicitly
pub fn create_glyph_outline_sources_from_swf(
    source: &Ref<Box<Uint8Array>>,
    options: &SwfParseOptions,
    mut diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Option<HashMap<u32, Arc<GlyphOutlineSource>>> {
    let shared = create_diagnostic_store(diagnostics.is_some());
    let result = read_swf_file(source, options, shared.clone())
        .map(|file| file.parsed.state.font_outline_sources);
    flush_diagnostics(shared.as_ref(), diagnostics.as_deref_mut());
    return result;
}

fn create_scene2d_document_for_swf(
    root: Node2DRef,
    slots: Vec<Ref<Scene2DSlotReference>>,
    background_color: Option<u32>,
    resources: SwfTagHandlerResources,
) -> Ref<Scene2DDocument> {
    let document = create_scene2d_document();
    {
        let mut document = document.write().unwrap();
        document.audio_resources = resources.audio;
        document.background_color = background_color;
        document.image_resources = resources.images;
        document.root = root;
        document.slots = slots;
        document.source_kind = Some(String::from("swf"));
    }
    return document;
}

pub fn create_scene2d_from_swf(
    source: &Ref<Box<Uint8Array>>,
    options: &SwfParseOptions,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Option<Ref<Scene2DDocument>> {
    return create_scene2d_import_from_swf(source, options, diagnostics)
        .map(|result| result.read().unwrap().document.clone());
}

pub fn create_scene2d_import_from_swf(
    source: &Ref<Box<Uint8Array>>,
    options: &SwfParseOptions,
    mut diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Option<Ref<SwfDocumentImport>> {
    let shared = create_diagnostic_store(diagnostics.is_some());
    let result = read_swf_file(source, options, shared.clone()).and_then(instantiate_swf_file);
    flush_diagnostics(shared.as_ref(), diagnostics.as_deref_mut());
    return result;
}

pub fn create_scene2d_symbol_from_swf(
    source: &Ref<Box<Uint8Array>>,
    linkage_name: &str,
    options: &SwfParseOptions,
    mut diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Option<Ref<Scene2DDocument>> {
    let shared = create_diagnostic_store(diagnostics.is_some());
    let result = read_swf_file(source, options, shared.clone())
        .and_then(|file| instantiate_swf_symbol(file, linkage_name));
    flush_diagnostics(shared.as_ref(), diagnostics.as_deref_mut());
    return result;
}

fn create_swf_handler_placement_node(
    handlers: &[SwfTagHandlerRef],
    parsed: &SwfTagParseResult,
    character_id: u32,
    bounds: Option<&SwfTagRectangle>,
    diagnostics: Option<&Ref<Vec<ImportDiagnostic>>>,
) -> Option<Node2DRef> {
    for handler in handlers {
        let Some(create_placement_node) = handler
            .instantiate
            .as_ref()
            .and_then(|instantiate| instantiate.create_placement_node.as_ref())
        else {
            continue;
        };
        let node = match diagnostics {
            Some(diagnostics) => create_placement_node(
                parsed,
                character_id,
                bounds,
                Some(&mut diagnostics.write().unwrap()),
            ),
            None => create_placement_node(parsed, character_id, bounds, None),
        };
        if node.is_some() {
            return node;
        }
    }
    return None;
}

fn create_swf_instance_key(placement: &SwfTagPlacement) -> u64 {
    return u64::from(placement.depth) * SWF_INSTANCE_KEY_SCALE + u64::from(placement.character_id);
}

fn create_swf_mask_clip_region(
    mask: &SwfTagPlacement,
    placement: &SwfTagPlacement,
    parsed: &SwfTagParseResult,
) -> Option<Ref<ClipRegion>> {
    let shape = parsed.state.shapes.get(&mask.character_id)?;
    let placement_matrix = swf_matrix_to_matrix(&placement.matrix);
    let mut inverse = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
    if !inverse_matrix(&mut inverse, &placement_matrix) {
        return None;
    }
    let mask_matrix = swf_matrix_to_matrix(&mask.matrix);
    let mut combined = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
    multiply_matrix(&mut combined, &mask_matrix, &inverse);

    let regions = {
        let shape = shape.read().unwrap();
        get_shape_fill_regions(&shape.data.commands)?
    };
    let mut contours = Vec::new();
    let mut point = create_vector2(0.0, 0.0);
    for region in regions {
        let flattened = {
            let path = region.path.read().unwrap();
            create_clip_region_from_path(&path, None)
        };
        let flattened = flattened.read().unwrap();
        for contour in flattened.contours.as_deref().unwrap_or(&[]) {
            let mut transformed = Vec::with_capacity(contour.len());
            let mut index = 0;
            while index + 1 < contour.len() {
                matrix_transform_point_xy(
                    &mut point,
                    &combined,
                    contour[index] as f32,
                    contour[index + 1] as f32,
                );
                transformed.push(point.x as f64);
                transformed.push(point.y as f64);
                index += 2;
            }
            contours.push(transformed);
        }
    }
    if contours.is_empty() {
        return None;
    }
    let clip_state = create_clip_region_state();
    return Some(create_clip_region_from_contours(
        &clip_state,
        &contours,
        PathWinding::NonZero,
    ));
}

fn create_swf_symbol_node(
    parsed: &SwfTagParseResult,
    character_id: u32,
    slots: &mut Vec<Ref<Scene2DSlotReference>>,
    state: &mut SwfInstantiationState,
) -> Option<Node2DRef> {
    let bounds = resolve_swf_character_bounds(parsed, character_id, state, 0);
    if let Some(claimed) = create_swf_handler_placement_node(
        &state.handlers,
        parsed,
        character_id,
        bounds.as_ref(),
        state.diagnostics.as_ref(),
    ) {
        return Some(claimed);
    }
    let sprite = parsed.state.sprites.get(&character_id)?;
    return create_swf_timeline_node(sprite, bounds.as_ref(), parsed, slots, state, 0)
        .map(|clip| clip as Node2DRef);
}

fn create_swf_tag_parse_state(
    handlers: Vec<SwfTagHandlerRef>,
    diagnostics: Option<Ref<Vec<ImportDiagnostic>>>,
) -> SwfTagParseState {
    let dispatch = expand_swf_tag_handler_dispatch(&handlers);
    return SwfTagParseState {
        abc_blobs: Vec::new(),
        background_color: None,
        character_bounds: HashMap::new(),
        defined_characters: HashSet::new(),
        diagnostics,
        dispatch,
        edit_texts: HashMap::new(),
        font_code_points: HashMap::new(),
        font_names: HashMap::new(),
        font_outline_sources: HashMap::new(),
        guard_state: Arc::new(RwLock::new(SwfGuardState::default())),
        handlers,
        image_texture_order: Arc::new(RwLock::new(Vec::new())),
        image_textures: Arc::new(RwLock::new(HashMap::new())),
        images: HashMap::new(),
        jpeg_alpha_payloads: IndexMap::new(),
        jpeg_tables: None,
        linkage_order: Vec::new(),
        linkages: HashMap::new(),
        morph_bounds: HashMap::new(),
        morph_instances: Arc::new(RwLock::new(HashMap::new())),
        morph_shapes: HashMap::new(),
        node_state: Arc::new(RwLock::new(SwfNodeState::default())),
        pending_init_actions: Vec::new(),
        pending_texts: Vec::new(),
        remaining_frame_entries: MAX_TIMELINE_FRAME_ENTRIES,
        scaling_grids: HashMap::new(),
        shapes: HashMap::new(),
        sound_cues_awaiting_class: Vec::new(),
        sound_cues_awaiting_rate: Vec::new(),
        sound_order: Vec::new(),
        sound_resources: HashMap::new(),
        sounds: HashMap::new(),
        sprites: HashMap::new(),
        stream_sounds: Vec::new(),
        video_textures: Arc::new(RwLock::new(HashMap::new())),
        videos: HashMap::new(),
    };
}

fn create_swf_timeline_node(
    timeline: &SwfTimeline,
    bounds: Option<&SwfTagRectangle>,
    parsed: &SwfTagParseResult,
    slots: &mut Vec<Ref<Scene2DSlotReference>>,
    state: &mut SwfInstantiationState,
    depth: usize,
) -> Option<Ref<MovieClip>> {
    let clip = create_swf_movie_clip(&parsed.state.node_state, bounds);
    if !populate_swf_timeline_node(&clip, timeline, parsed, slots, state, depth) {
        return None;
    }
    return Some(clip);
}

// flight-lint: allow(hashmap-iteration) detached membership removal is order-independent and produces the same final child set
fn create_swf_timeline_source(
    frames: Vec<Vec<SwfFrameEntry>>,
    nodes: HashMap<u64, Node2DRef>,
    timeline: &SwfTimeline,
    state: &SwfInstantiationState,
    parsed: &SwfTagParseResult,
) -> flight_timeline::TimelineSourceRef {
    let total_frames = frames.len() as i32;
    let frames = Arc::new(frames);
    let nodes = Arc::new(nodes);
    let morph_instances = parsed.state.morph_instances.clone();
    let node_state = parsed.state.node_state.clone();
    let runtime = Arc::new(RwLock::new(SwfTimelineRuntime {
        applied_alphas: HashMap::new(),
        applied_clips: HashMap::new(),
        applied_color_adjustments: HashMap::new(),
        applied_matrices: HashMap::new(),
        applied_ratios: HashMap::new(),
        attached: HashSet::new(),
        depths: create_node_order_list(),
    }));
    let construct_frame = Arc::new(move |target: &Node2DRef, frame: i32| {
        let Some(entries) = usize::try_from(frame - 1)
            .ok()
            .and_then(|index| frames.get(index))
        else {
            return;
        };
        let mut runtime = runtime.write().unwrap();
        let mut framed = HashSet::new();
        clear_node_order_list(&mut runtime.depths);
        for entry in entries {
            let key = create_swf_instance_key(&entry.placement);
            let Some(node) = nodes.get(&key) else {
                continue;
            };
            framed.insert(key);
            let node: NodeRef = node.clone();
            add_node_order_list_entry(&mut runtime.depths, &node, entry.placement.depth as f64);
        }

        let target_node: NodeRef = target.clone();
        let detached: Vec<u64> = runtime
            .attached
            .iter()
            .filter(|key| !framed.contains(key))
            .copied()
            .collect();
        for key in detached {
            if let Some(node) = nodes.get(&key) {
                let node: NodeRef = node.clone();
                remove_node_child(&target_node, &node);
            }
            runtime.attached.remove(&key);
        }
        for entry in entries {
            let key = create_swf_instance_key(&entry.placement);
            if runtime.attached.contains(&key) {
                continue;
            }
            let Some(node) = nodes.get(&key) else {
                continue;
            };
            let node: NodeRef = node.clone();
            add_node_child(&target_node, &node);
            runtime.attached.insert(key);
        }
        apply_node_order_list(&target_node, &runtime.depths);

        for entry in entries {
            let key = create_swf_instance_key(&entry.placement);
            let Some(node) = nodes.get(&key) else {
                continue;
            };
            let node_ref: NodeRef = node.clone();
            if runtime.applied_matrices.get(&key) != Some(&entry.placement.matrix) {
                set_node_local_matrix(&node_ref, &swf_matrix_to_matrix(&entry.placement.matrix));
                runtime.applied_matrices.insert(key, entry.placement.matrix);
            }
            if runtime.applied_alphas.get(&key) != Some(&entry.placement.alpha) {
                node.write().unwrap().node2d_fields_mut().alpha = entry.placement.alpha;
                invalidate_node_appearance(&node_ref);
                runtime.applied_alphas.insert(key, entry.placement.alpha);
            }
            let blend_changed = node.read().unwrap().node2d_fields().blend_mode.as_ref()
                != Some(&entry.placement.blend_mode);
            if blend_changed {
                node.write().unwrap().node2d_fields_mut().blend_mode =
                    Some(entry.placement.blend_mode.clone());
                invalidate_node_appearance(&node_ref);
            }
            if !same_adjustment_stack(
                runtime.applied_color_adjustments.get(&key),
                &entry.placement.color_adjustments,
            ) {
                let adjustments = entry.placement.color_adjustments.as_ref().map(|stack| {
                    Arc::new(RwLock::new(stack.as_ref().clone()))
                        as Ref<Vec<flight_node::contract::AdjustmentRef>>
                });
                set_node_color_adjustments(&node_ref, adjustments);
                runtime
                    .applied_color_adjustments
                    .insert(key, entry.placement.color_adjustments.clone());
            }
            if runtime.applied_ratios.get(&key) != Some(&entry.placement.ratio) {
                let node_id = get_entity_id(&*node.read().unwrap()).to_string();
                if let Some(shape) = morph_instances.read().unwrap().get(&node_id).cloned() {
                    set_morph_shape_progress(&shape, f64::from(entry.placement.ratio));
                    apply_swf_morph_bounds(&node_state, &shape, entry.placement.ratio);
                    runtime.applied_ratios.insert(key, entry.placement.ratio);
                }
            }
            if !same_clip(runtime.applied_clips.get(&key), &entry.clip) {
                set_node2d_clip(node, entry.clip.clone());
                runtime.applied_clips.insert(key, entry.clip.clone());
            }
        }
    });
    return create_timeline_source(Some(&TimelineSourceOptions {
        construct_frame: Some(construct_frame),
        cues: Some(Arc::new(timeline.cues.clone())),
        frame_rate: state.frame_rate,
        labels: Some(Arc::new(timeline.labels.clone())),
        total_frames: Some(total_frames),
    }));
}

// flight-lint: allow(conform-params) D23: document identity defines the import; authored sidecars are assigned after initialization
pub fn initialize_swf_document_import(out: &mut SwfDocumentImport, document: Ref<Scene2DDocument>) {
    out.appearances.clear();
    out.document = document;
    out.jpeg_alpha_payloads.clear();
}

fn attach_swf_frame_actions(clip: &Ref<MovieClip>, actions: &SwfFrameActions, total_frames: i32) {
    for (frame, script) in actions {
        if *frame <= total_frames {
            add_movie_clip_frame_script(clip, &TimelineFrameArg::Frame(*frame), script.clone());
        }
    }
}

fn build_swf_frame_entries(
    ordered: &[SwfTagPlacement],
    parsed: &SwfTagParseResult,
    diagnostics: Option<&Ref<Vec<ImportDiagnostic>>>,
) -> Vec<SwfFrameEntry> {
    let mut entries = Vec::new();
    for placement in ordered {
        if placement.clip_depth > 0 {
            continue;
        }
        let mask = resolve_swf_placement_mask(ordered, placement, diagnostics);
        let clip = mask.and_then(|mask| create_swf_mask_clip_region(mask, placement, parsed));
        if let Some(mask) = mask
            && clip.is_none()
        {
            let mut detail = HashMap::new();
            detail.insert(
                String::from("capability"),
                ImportDiagnosticDetailValue::String(String::from("swf.placement.clip-depth")),
            );
            detail.insert(
                String::from("depth"),
                ImportDiagnosticDetailValue::Number(placement.depth as f32),
            );
            detail.insert(
                String::from("maskCharacterId"),
                ImportDiagnosticDetailValue::Number(mask.character_id as f32),
            );
            report_shared_diagnostic(
                diagnostics,
                ImportDiagnosticSeverity::Recover,
                "swf.mask-without-geometry",
                "buildSwfFrameEntries",
                Some(detail),
            );
        }
        entries.push(SwfFrameEntry {
            clip,
            placement: placement.clone(),
        });
    }
    return entries;
}

// flight-lint: allow(hashmap-iteration) frame entries are ordered vectors; the node map is lookup-only
fn collect_swf_node_appearances(
    frames: &[Vec<SwfFrameEntry>],
    nodes: &HashMap<u64, Node2DRef>,
    out: &mut Vec<SwfNodeAppearance>,
    diagnostics: Option<&Ref<Vec<ImportDiagnostic>>>,
) {
    for (frame_index, frame) in frames.iter().enumerate() {
        for entry in frame {
            if entry.placement.advanced_blend_mode.is_none() && entry.placement.effects.is_empty() {
                continue;
            }
            let Some(node) = nodes.get(&create_swf_instance_key(&entry.placement)) else {
                let mut detail = HashMap::new();
                detail.insert(
                    String::from("capability"),
                    ImportDiagnosticDetailValue::String(String::from(
                        if entry.placement.advanced_blend_mode.is_some() {
                            "swf.placement.blend-mode"
                        } else {
                            "swf.placement.filter-list"
                        },
                    )),
                );
                detail.insert(
                    String::from("frame"),
                    ImportDiagnosticDetailValue::Number((frame_index + 1) as f32),
                );
                report_shared_diagnostic(
                    diagnostics,
                    ImportDiagnosticSeverity::Drop,
                    "swf.appearance-without-node",
                    "collectSwfNodeAppearances",
                    Some(detail),
                );
                continue;
            };
            out.push(SwfNodeAppearance {
                advanced_blend_mode: entry.placement.advanced_blend_mode.clone(),
                effects: entry.placement.effects.as_ref().clone(),
                frame: (frame_index + 1) as i32,
                node: node.clone(),
            });
        }
    }
}

fn detail_number(key: &str, value: f32) -> HashMap<String, ImportDiagnosticDetailValue> {
    let mut detail = HashMap::new();
    detail.insert(key.to_string(), ImportDiagnosticDetailValue::Number(value));
    return detail;
}

fn flush_diagnostics(
    shared: Option<&Ref<Vec<ImportDiagnostic>>>,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) {
    if let (Some(shared), Some(diagnostics)) = (shared, diagnostics) {
        diagnostics.extend(shared.read().unwrap().iter().cloned());
    }
}

fn has_swf_handler_placement_content(
    handlers: &[SwfTagHandlerRef],
    parsed: &SwfTagParseResult,
    character_id: u32,
) -> bool {
    for handler in handlers {
        if handler
            .instantiate
            .as_ref()
            .and_then(|instantiate| instantiate.has_placement_content.as_ref())
            .is_some_and(|has_content| has_content(parsed, character_id))
        {
            return true;
        }
    }
    return false;
}

fn instantiate_swf_file(file: SwfFile) -> Option<Ref<SwfDocumentImport>> {
    let SwfFile {
        frame_rate,
        parsed,
        stage_bounds,
    } = file;
    let mut slots = Vec::new();
    let mut state = SwfInstantiationState {
        active_symbols: HashSet::new(),
        appearances: Vec::new(),
        diagnostics: parsed.state.diagnostics.clone(),
        frame_rate: if frame_rate > 0.0 {
            Some(f64::from(frame_rate))
        } else {
            None
        },
        handlers: parsed.state.handlers.clone(),
        resolved_bounds: HashMap::new(),
        resolving_bounds: HashSet::new(),
    };
    let Some(root) = create_swf_timeline_node(
        &parsed.timeline,
        Some(&stage_bounds),
        &parsed,
        &mut slots,
        &mut state,
        0,
    ) else {
        report_shared_diagnostic(
            state.diagnostics.as_ref(),
            ImportDiagnosticSeverity::Reject,
            "swf.timeline-instantiation-failed",
            "createScene2DImportFromSwf",
            None,
        );
        return None;
    };
    let mut resources = SwfTagHandlerResources {
        audio: Vec::new(),
        images: Vec::new(),
        jpeg_alpha_payloads: Vec::new(),
    };
    for handler in &state.handlers {
        if let Some(create_resources) = handler
            .instantiate
            .as_ref()
            .and_then(|instantiate| instantiate.create_resources.as_ref())
        {
            create_resources(&parsed, &mut resources);
        }
    }
    let root: Node2DRef = root;
    let background_color = parsed.state.background_color;
    let jpeg_alpha_payloads = resources.jpeg_alpha_payloads.clone();
    let document = create_scene2d_document_for_swf(root, slots, background_color, resources);
    let mut out = allocate_swf_document_import(document.clone());
    initialize_swf_document_import(&mut out, document);
    out.appearances = state.appearances;
    out.jpeg_alpha_payloads = jpeg_alpha_payloads;
    return Some(Arc::new(RwLock::new(out)));
}

fn instantiate_swf_symbol(file: SwfFile, linkage_name: &str) -> Option<Ref<Scene2DDocument>> {
    let SwfFile {
        frame_rate, parsed, ..
    } = file;
    let character_id = parsed
        .state
        .linkage_order
        .iter()
        .copied()
        .filter(|id| {
            parsed
                .state
                .linkages
                .get(id)
                .is_some_and(|name| name == linkage_name)
        })
        .last();
    let Some(character_id) = character_id else {
        let mut detail = HashMap::new();
        detail.insert(
            String::from("linkageName"),
            ImportDiagnosticDetailValue::String(linkage_name.to_string()),
        );
        report_shared_diagnostic(
            parsed.state.diagnostics.as_ref(),
            ImportDiagnosticSeverity::Reject,
            "swf.unknown-linkage-name",
            "createScene2DSymbolFromSwf",
            Some(detail),
        );
        return None;
    };
    let mut slots = Vec::new();
    let mut state = SwfInstantiationState {
        active_symbols: HashSet::new(),
        appearances: Vec::new(),
        diagnostics: parsed.state.diagnostics.clone(),
        frame_rate: if frame_rate > 0.0 {
            Some(f64::from(frame_rate))
        } else {
            None
        },
        handlers: parsed.state.handlers.clone(),
        resolved_bounds: HashMap::new(),
        resolving_bounds: HashSet::new(),
    };
    let root = create_swf_symbol_node(&parsed, character_id, &mut slots, &mut state)?;
    let mut resources = SwfTagHandlerResources {
        audio: Vec::new(),
        images: Vec::new(),
        jpeg_alpha_payloads: Vec::new(),
    };
    for handler in &state.handlers {
        if let Some(create_resources) = handler
            .instantiate
            .as_ref()
            .and_then(|instantiate| instantiate.create_resources.as_ref())
        {
            create_resources(&parsed, &mut resources);
        }
    }
    return Some(create_scene2d_document_for_swf(
        root, slots, None, resources,
    ));
}

fn matches_swf_document(source: &[u8], mime_type: Option<&str>) -> bool {
    if mime_type == Some(SWF_MIME_TYPE) {
        return true;
    }
    if source.len() < 3 || source[1] != W_SIGNATURE || source[2] != S_SIGNATURE {
        return false;
    }
    return source[0] == FWS_SIGNATURE || source[0] == CWS_SIGNATURE || source[0] == ZWS_SIGNATURE;
}

// flight-lint: allow(hashmap-iteration) timeline frames and placements are insertion-ordered vectors; node maps are lookup-only
fn populate_swf_timeline_node(
    clip: &Ref<MovieClip>,
    timeline: &SwfTimeline,
    parsed: &SwfTagParseResult,
    slots: &mut Vec<Ref<Scene2DSlotReference>>,
    state: &mut SwfInstantiationState,
    depth: usize,
) -> bool {
    if depth > MAX_SPRITE_NESTING {
        return false;
    }
    let mut nodes = HashMap::new();
    let mut frames = Vec::new();
    for frame in &timeline.frames {
        let mut ordered: Vec<SwfTagPlacement> = frame
            .read()
            .unwrap()
            .iter()
            .map(|(_, placement)| placement.clone())
            .collect();
        ordered.sort_by_key(|placement| placement.depth);
        frames.push(build_swf_frame_entries(
            &ordered,
            parsed,
            state.diagnostics.as_ref(),
        ));
        for placement in ordered {
            let key = create_swf_instance_key(&placement);
            if nodes.contains_key(&key) || placement.clip_depth > 0 {
                continue;
            }
            let sprite = parsed.state.sprites.get(&placement.character_id);
            if placement.name.is_none()
                && !has_swf_handler_placement_content(
                    &state.handlers,
                    parsed,
                    placement.character_id,
                )
            {
                continue;
            }
            let bounds = resolve_swf_character_bounds(parsed, placement.character_id, state, 0);
            let claimed = create_swf_handler_placement_node(
                &state.handlers,
                parsed,
                placement.character_id,
                bounds.as_ref(),
                state.diagnostics.as_ref(),
            );
            let (target, nested_clip): (Node2DRef, Option<Ref<MovieClip>>) = match claimed {
                Some(target) => (target, None),
                None if sprite.is_some() => {
                    let target = create_swf_movie_clip(&parsed.state.node_state, bounds.as_ref());
                    (target.clone(), Some(target))
                }
                None => (
                    create_swf_display_object(&parsed.state.node_state, bounds.as_ref()),
                    None,
                ),
            };
            nodes.insert(key, target.clone());
            if let Some(name) = &placement.name {
                target.write().unwrap().node_fields_mut().name = Some(name.clone());
                let reference = create_scene2d_slot_reference();
                {
                    let mut reference = reference.write().unwrap();
                    reference.linkage = placement
                        .direct_linkage
                        .clone()
                        .or_else(|| parsed.state.linkages.get(&placement.character_id).cloned());
                    reference.name = name.clone();
                    reference.required = true;
                    reference.target = target.clone();
                }
                slots.push(reference);
            }
            if let (Some(sprite), Some(target)) = (sprite, nested_clip) {
                if state.active_symbols.contains(&placement.character_id) {
                    return false;
                }
                state.active_symbols.insert(placement.character_id);
                let populated =
                    populate_swf_timeline_node(&target, sprite, parsed, slots, state, depth + 1);
                state.active_symbols.remove(&placement.character_id);
                if !populated {
                    return false;
                }
            }
        }
    }
    collect_swf_node_appearances(
        &frames,
        &nodes,
        &mut state.appearances,
        state.diagnostics.as_ref(),
    );
    let source = create_swf_timeline_source(frames, nodes, timeline, state, parsed);
    set_movie_clip_source(clip, &source);
    attach_swf_frame_actions(clip, &timeline.actions, source.read().unwrap().total_frames);
    return true;
}

pub fn read_swf_exported_symbol_names(
    source: &Ref<Box<Uint8Array>>,
    options: &SwfParseOptions,
) -> Vec<String> {
    let Some(file) = read_swf_file(source, options, None) else {
        return Vec::new();
    };
    return file
        .parsed
        .state
        .linkage_order
        .iter()
        .filter_map(|id| file.parsed.state.linkages.get(id).cloned())
        .collect();
}

fn read_swf_file(
    source: &Ref<Box<Uint8Array>>,
    options: &SwfParseOptions,
    diagnostics: Option<Ref<Vec<ImportDiagnostic>>>,
) -> Option<SwfFile> {
    let deflate = options.deflate.as_ref().and_then(|slot| slot.as_ref());
    let lzma = options.lzma.as_ref().and_then(|slot| slot.as_ref());
    let uncompressed = match diagnostics.as_ref() {
        Some(diagnostics) => uncompress_swf_source(
            source,
            deflate,
            lzma,
            Some(&mut diagnostics.write().unwrap()),
        ),
        None => uncompress_swf_source(source, deflate, lzma, None),
    }?;

    let source_length = uncompressed.read().unwrap().len();
    let mut header = SwfReader::new(uncompressed.clone(), 0, source_length);
    let signature = header.read_uint8();
    if signature != FWS_SIGNATURE
        || header.read_uint8() != W_SIGNATURE
        || header.read_uint8() != S_SIGNATURE
    {
        report_shared_diagnostic(
            diagnostics.as_ref(),
            ImportDiagnosticSeverity::Reject,
            "swf.uncompressed-signature-invalid",
            "readSwfFile",
            None,
        );
        return None;
    }
    let version = header.read_uint8();
    let file_length = header.read_uint32();
    if !header.valid
        || version == 0
        || file_length < MIN_SWF_LENGTH as u32
        || file_length as usize > source_length
    {
        let mut detail = HashMap::new();
        detail.insert(
            String::from("declaredLength"),
            ImportDiagnosticDetailValue::Number(file_length as f32),
        );
        detail.insert(
            String::from("available"),
            ImportDiagnosticDetailValue::Number(source_length as f32),
        );
        detail.insert(
            String::from("version"),
            ImportDiagnosticDetailValue::Number(f32::from(version)),
        );
        report_shared_diagnostic(
            diagnostics.as_ref(),
            ImportDiagnosticSeverity::Reject,
            "swf.header-fields-invalid",
            "readSwfFile",
            Some(detail),
        );
        return None;
    }
    let mut body = SwfReader::new(uncompressed, SWF_PREFIX_LENGTH, file_length as usize);
    let Some(stage_bounds) = read_swf_rectangle(&mut body) else {
        report_shared_diagnostic(
            diagnostics.as_ref(),
            ImportDiagnosticSeverity::Reject,
            "swf.stage-bounds-unreadable",
            "readSwfFile",
            None,
        );
        return None;
    };
    let frame_rate = f32::from(body.read_uint16()) / crate::FIXED_8_8_ONE;
    body.read_uint16();
    if !body.valid {
        report_shared_diagnostic(
            diagnostics.as_ref(),
            ImportDiagnosticSeverity::Reject,
            "swf.header-truncated",
            "readSwfFile",
            None,
        );
        return None;
    }
    let handlers = options.tags.clone().unwrap_or_default();
    let mut state = create_swf_tag_parse_state(handlers.clone(), diagnostics);
    let mut timeline = read_swf_timeline(&mut body, &mut state)?;
    for handler in handlers {
        if let Some(resolve) = &handler.resolve {
            resolve(&mut state, &mut timeline);
        }
    }
    return Some(SwfFile {
        frame_rate,
        parsed: SwfTagParseResult { state, timeline },
        stage_bounds,
    });
}

// flight-lint: allow(conform-params) Rust mutates the caller-owned importer registry explicitly
pub fn register_swf_scene2d_document_importer(
    importers: &mut Scene2DDocumentImporterRegistry,
    options: &SwfParseOptions,
) {
    let options = options.clone();
    let match_swf = Arc::new(|source: &[u8], context: &Scene2DDocumentImportContext| {
        return matches_swf_document(source, context.mime_type.as_deref());
    });
    let import_swf = Arc::new(
        move |source: &[u8], _context: &Scene2DDocumentImportContext| {
            let source = Arc::new(RwLock::new(source.to_vec().into_boxed_slice()));
            return create_scene2d_from_swf(&source, &options, None);
        },
    );
    register_scene2d_document_importer(importers, String::from("swf"), match_swf, import_swf);
}

fn report_shared_diagnostic(
    diagnostics: Option<&Ref<Vec<ImportDiagnostic>>>,
    severity: ImportDiagnosticSeverity,
    kind: &str,
    origin: &str,
    detail: Option<HashMap<String, ImportDiagnosticDetailValue>>,
) {
    let Some(diagnostics) = diagnostics else {
        return;
    };
    report_import_diagnostic(
        Some(&mut diagnostics.write().unwrap()),
        severity,
        kind,
        origin,
        detail,
    );
}

// flight-lint: allow(hashmap-iteration) sprite frames and placements are insertion-ordered vectors; bound maps are lookup-only
fn resolve_swf_character_bounds(
    parsed: &SwfTagParseResult,
    character_id: u32,
    state: &mut SwfInstantiationState,
    depth: usize,
) -> Option<SwfTagRectangle> {
    if let Some(bounds) = parsed.state.character_bounds.get(&character_id) {
        return Some(*bounds);
    }
    if let Some(bounds) = state.resolved_bounds.get(&character_id) {
        return *bounds;
    }
    let Some(sprite) = parsed.state.sprites.get(&character_id) else {
        return None;
    };
    if depth > MAX_SPRITE_NESTING || state.resolving_bounds.contains(&character_id) {
        return None;
    }
    state.resolving_bounds.insert(character_id);
    let mut bounds = None;
    let mut missing_children = 0;
    for frame in &sprite.frames {
        for (_, placement) in frame.read().unwrap().iter() {
            let child_bounds =
                resolve_swf_character_bounds(parsed, placement.character_id, state, depth + 1);
            let Some(child_bounds) = child_bounds else {
                if !parsed
                    .state
                    .character_bounds
                    .contains_key(&placement.character_id)
                    && !parsed.state.sprites.contains_key(&placement.character_id)
                {
                    missing_children += 1;
                }
                continue;
            };
            let transformed = transform_swf_rectangle(&child_bounds, &placement.matrix);
            bounds = Some(match bounds {
                Some(bounds) => merge_swf_rectangles(&bounds, &transformed),
                None => transformed,
            });
        }
    }
    state.resolving_bounds.remove(&character_id);
    if missing_children > 0 {
        let mut detail = HashMap::new();
        detail.insert(
            String::from("capability"),
            ImportDiagnosticDetailValue::String(String::from("swf.timeline.define-sprite")),
        );
        detail.insert(
            String::from("characterId"),
            ImportDiagnosticDetailValue::Number(character_id as f32),
        );
        detail.insert(
            String::from("missingChildren"),
            ImportDiagnosticDetailValue::Number(missing_children as f32),
        );
        report_shared_diagnostic(
            state.diagnostics.as_ref(),
            ImportDiagnosticSeverity::Drop,
            "swf.sprite-bounds-short",
            "resolveSwfCharacterBounds",
            Some(detail),
        );
    }
    state.resolved_bounds.insert(character_id, bounds);
    return bounds;
}

fn resolve_swf_placement_mask<'a>(
    ordered: &'a [SwfTagPlacement],
    placement: &SwfTagPlacement,
    diagnostics: Option<&Ref<Vec<ImportDiagnostic>>>,
) -> Option<&'a SwfTagPlacement> {
    let mut mask = None;
    let mut covering = 0;
    for candidate in ordered {
        if candidate.clip_depth == 0
            || candidate.depth >= placement.depth
            || placement.depth > candidate.clip_depth
        {
            continue;
        }
        covering += 1;
        if mask.is_none_or(|current: &SwfTagPlacement| candidate.depth > current.depth) {
            mask = Some(candidate);
        }
    }
    if covering > 1 {
        let mut detail = HashMap::new();
        detail.insert(
            String::from("capability"),
            ImportDiagnosticDetailValue::String(String::from("swf.placement.clip-depth")),
        );
        detail.insert(
            String::from("covering"),
            ImportDiagnosticDetailValue::Number(covering as f32),
        );
        detail.insert(
            String::from("depth"),
            ImportDiagnosticDetailValue::Number(placement.depth as f32),
        );
        report_shared_diagnostic(
            diagnostics,
            ImportDiagnosticSeverity::Skip,
            "swf.nested-mask-collapsed",
            "resolveSwfPlacementMask",
            Some(detail),
        );
    }
    return mask;
}

fn same_adjustment_stack(
    applied: Option<&Option<crate::SwfAdjustmentStack>>,
    value: &Option<crate::SwfAdjustmentStack>,
) -> bool {
    return match (applied, value) {
        (Some(Some(applied)), Some(value)) => Arc::ptr_eq(applied, value),
        (Some(None), None) => true,
        _ => false,
    };
}

fn same_clip(applied: Option<&Option<Ref<ClipRegion>>>, value: &Option<Ref<ClipRegion>>) -> bool {
    return match (applied, value) {
        (Some(Some(applied)), Some(value)) => Arc::ptr_eq(applied, value),
        (Some(None), None) => true,
        _ => false,
    };
}

fn swf_matrix_to_matrix(source: &SwfTagMatrix) -> Matrix {
    return create_matrix(source.a, source.b, source.c, source.d, source.tx, source.ty);
}

pub fn uncompress_swf_source(
    source: &Ref<Box<Uint8Array>>,
    deflate: Option<&HostDecompressDeflateCapability>,
    lzma: Option<&HostDecompressLzmaCapability>,
    mut diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Option<Ref<Box<Uint8Array>>> {
    let (signature, file_length, source_length, stream) = {
        let bytes = source.read().unwrap();
        if bytes.len() < SWF_PREFIX_LENGTH || bytes[1] != W_SIGNATURE || bytes[2] != S_SIGNATURE {
            report_import_diagnostic(
                diagnostics.as_deref_mut(),
                ImportDiagnosticSeverity::Reject,
                "swf.invalid-signature",
                "uncompressSwfSource",
                Some(detail_number("length", bytes.len() as f32)),
            );
            return None;
        }
        let signature = bytes[0];
        if signature == FWS_SIGNATURE {
            return Some(source.clone());
        }
        let file_length = u32::from(bytes[4])
            + u32::from(bytes[5]) * 0x100
            + u32::from(bytes[6]) * 0x10000
            + u32::from(bytes[7]) * 0x1000000;
        let stream_start = if signature == ZWS_SIGNATURE {
            SWF_LZMA_PREFIX_LENGTH
        } else {
            SWF_PREFIX_LENGTH
        };
        let stream = if stream_start <= bytes.len() {
            Some(bytes[stream_start..].to_vec().into_boxed_slice())
        } else {
            None
        };
        (signature, file_length, bytes.len(), stream)
    };

    let (slot, framing, compression_name): (
        &dyn Fn(&Uint8Array, usize, CompressionFraming) -> Option<Box<Uint8Array>>,
        CompressionFraming,
        &str,
    ) = if signature == CWS_SIGNATURE {
        let slot = deflate?;
        (&*slot.decompress, CompressionFraming::Rfc1950, "deflate")
    } else if signature == ZWS_SIGNATURE {
        let slot = lzma?;
        (&*slot.decompress, CompressionFraming::Raw, "lzma")
    } else {
        report_import_diagnostic(
            diagnostics.as_deref_mut(),
            ImportDiagnosticSeverity::Reject,
            "swf.unknown-container",
            "uncompressSwfSource",
            Some(detail_number("signature", f32::from(signature))),
        );
        return None;
    };

    if file_length < MIN_SWF_LENGTH as u32 {
        report_import_diagnostic(
            diagnostics.as_deref_mut(),
            ImportDiagnosticSeverity::Reject,
            "swf.declared-length-too-small",
            "uncompressSwfSource",
            Some(detail_number("fileLength", file_length as f32)),
        );
        return None;
    }
    let Some(stream) = stream else {
        let mut detail = HashMap::new();
        detail.insert(
            "length".to_string(),
            ImportDiagnosticDetailValue::Number(source_length as f32),
        );
        detail.insert(
            "streamStart".to_string(),
            ImportDiagnosticDetailValue::Number(SWF_LZMA_PREFIX_LENGTH as f32),
        );
        report_import_diagnostic(
            diagnostics.as_deref_mut(),
            ImportDiagnosticSeverity::Reject,
            "swf.truncated-container",
            "uncompressSwfSource",
            Some(detail),
        );
        return None;
    };
    let body_length = file_length as usize - SWF_PREFIX_LENGTH;
    let body = slot(&stream, body_length, framing);
    if body.as_ref().is_none_or(|body| body.len() < body_length) {
        let mut detail = HashMap::new();
        detail.insert(
            "compression".to_string(),
            ImportDiagnosticDetailValue::String(compression_name.to_string()),
        );
        detail.insert(
            "expected".to_string(),
            ImportDiagnosticDetailValue::Number(body_length as f32),
        );
        detail.insert(
            "received".to_string(),
            ImportDiagnosticDetailValue::Number(
                body.as_ref().map_or(-1.0, |value| value.len() as f32),
            ),
        );
        report_import_diagnostic(
            diagnostics.as_deref_mut(),
            ImportDiagnosticSeverity::Reject,
            "swf.decompression-failed",
            "uncompressSwfSource",
            Some(detail),
        );
        return None;
    }
    let source_prefix = {
        let bytes = source.read().unwrap();
        bytes[..SWF_PREFIX_LENGTH].to_vec()
    };
    let body = body.unwrap();
    let mut uncompressed = Vec::with_capacity(SWF_PREFIX_LENGTH + body_length);
    uncompressed.extend_from_slice(&source_prefix);
    uncompressed[0] = FWS_SIGNATURE;
    uncompressed.extend_from_slice(&body[..body_length]);
    return Some(Arc::new(RwLock::new(uncompressed.into_boxed_slice())));
}

const CWS_SIGNATURE: u8 = 0x43;
const FWS_SIGNATURE: u8 = 0x46;
const MAX_SPRITE_NESTING: usize = 256;
const MIN_SWF_LENGTH: usize = 12;
const S_SIGNATURE: u8 = 0x53;
const SWF_INSTANCE_KEY_SCALE: u64 = 0x10000;
const SWF_LZMA_PREFIX_LENGTH: usize = 17;
const SWF_MIME_TYPE: &str = "application/x-shockwave-flash";
const SWF_PREFIX_LENGTH: usize = 8;
const W_SIGNATURE: u8 = 0x57;
const ZWS_SIGNATURE: u8 = 0x5a;
