use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
enum Group {
    Borrowed,
    Owned,
    Shared,
    Guard,
    Signal,
    Map,
    Slice,
    Vec,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum Outcome {
    Generated,
    ExtensionPolicySkip,
    OwnershipPolicySkip,
    ClosureDeferred,
    UnmappedCarrier,
}

#[derive(Clone, Copy, Debug)]
enum Contract {
    BorrowedParam {
        parameter: &'static str,
        mutable: bool,
        nullable: bool,
    },
    ClonedParam(&'static str),
    CopiedParam(&'static str),
    CheckedEnumParam(&'static str),
    BorrowedReturn,
    OwnedReturn,
    MapReturn,
    SliceParam(&'static str),
    SliceReturn,
    VecParam {
        parameter: &'static str,
        owned: bool,
        nullable: bool,
    },
    VecReturn,
    ExtensionPolicySkip,
    OwnershipPolicySkip,
    ClosureDeferred,
    UnmappedCarrier,
}

#[derive(Clone, Copy, Debug)]
struct Candidate {
    function: &'static str,
    carrier: &'static str,
    group: Group,
    outcome: Outcome,
    contract: Contract,
}

macro_rules! generated {
    ($function:literal, $carrier:literal, $group:ident, $contract:expr) => {
        Candidate {
            function: $function,
            carrier: $carrier,
            group: Group::$group,
            outcome: Outcome::Generated,
            contract: $contract,
        }
    };
}

macro_rules! extension_skip {
    ($function:literal, $carrier:literal) => {
        Candidate {
            function: $function,
            carrier: $carrier,
            group: Group::Borrowed,
            outcome: Outcome::ExtensionPolicySkip,
            contract: Contract::ExtensionPolicySkip,
        }
    };
}

macro_rules! extension_skip_group {
    ($function:literal, $carrier:literal, $group:ident) => {
        Candidate {
            function: $function,
            carrier: $carrier,
            group: Group::$group,
            outcome: Outcome::ExtensionPolicySkip,
            contract: Contract::ExtensionPolicySkip,
        }
    };
}

macro_rules! ownership_skip {
    ($function:literal, $carrier:literal, $group:ident) => {
        Candidate {
            function: $function,
            carrier: $carrier,
            group: Group::$group,
            outcome: Outcome::OwnershipPolicySkip,
            contract: Contract::OwnershipPolicySkip,
        }
    };
}

macro_rules! closure_deferred {
    ($function:literal, $carrier:literal, $group:ident) => {
        Candidate {
            function: $function,
            carrier: $carrier,
            group: Group::$group,
            outcome: Outcome::ClosureDeferred,
            contract: Contract::ClosureDeferred,
        }
    };
}

macro_rules! unmapped_carrier {
    ($function:literal, $carrier:literal, $group:ident) => {
        Candidate {
            function: $function,
            carrier: $carrier,
            group: Group::$group,
            outcome: Outcome::UnmappedCarrier,
            contract: Contract::UnmappedCarrier,
        }
    };
}

// This is the ratified Task K baseline inventory. Its group counts are part of the acceptance
// contract: 37 + 29 + 20 + 8 + 6 + 6 + 8 + 6 = 120 source functions. Each entry records the
// foreman-ratified decision, including policy exclusions and the pre-M closure/disposer deferral.
const TASK_K_CANDIDATES: &[Candidate] = &[
    // Borrowed refs, borrowed returns, and the three by-design runtime method tables (37).
    generated!(
        "explain_bidi_class_kernel",
        "&BidiClassKernel",
        Borrowed,
        Contract::BorrowedParam {
            parameter: "bidi_class_kernel",
            mutable: false,
            nullable: false,
        }
    ),
    generated!(
        "get_bidi_runs",
        "&BidiClassKernel",
        Borrowed,
        Contract::BorrowedParam {
            parameter: "bidi_class_kernel",
            mutable: false,
            nullable: false,
        }
    ),
    generated!(
        "resolve_bidi_levels",
        "&BidiClassKernel",
        Borrowed,
        Contract::BorrowedParam {
            parameter: "bidi_class_kernel",
            mutable: false,
            nullable: false,
        }
    ),
    generated!(
        "capture_snapshot",
        "&SnapshotValue",
        Borrowed,
        Contract::BorrowedParam {
            parameter: "source",
            mutable: false,
            nullable: false,
        }
    ),
    generated!(
        "interpolate_snapshots",
        "&SnapshotValue",
        Borrowed,
        Contract::BorrowedParam {
            parameter: "out",
            mutable: false,
            nullable: false,
        }
    ),
    generated!(
        "restore_snapshot",
        "&SnapshotValue",
        Borrowed,
        Contract::BorrowedParam {
            parameter: "target",
            mutable: false,
            nullable: false,
        }
    ),
    generated!(
        "compute_skeleton_2d_clipping_attachment_vertices",
        "&ClippingAttachment2D",
        Borrowed,
        Contract::BorrowedParam {
            parameter: "attachment",
            mutable: false,
            nullable: false,
        }
    ),
    generated!(
        "get_skeleton_2d_clipping_attachment_slot_range",
        "&ClippingAttachment2D",
        Borrowed,
        Contract::BorrowedParam {
            parameter: "attachment",
            mutable: false,
            nullable: false,
        }
    ),
    generated!(
        "compute_skeleton_2d_point_attachment_position",
        "&PointAttachment2D",
        Borrowed,
        Contract::BorrowedParam {
            parameter: "attachment",
            mutable: false,
            nullable: false,
        }
    ),
    generated!(
        "compute_skeleton_2d_point_attachment_rotation",
        "&PointAttachment2D",
        Borrowed,
        Contract::BorrowedParam {
            parameter: "attachment",
            mutable: false,
            nullable: false,
        }
    ),
    generated!(
        "create_scene2d_from_lottie_document_with_registry",
        "&Value",
        Borrowed,
        Contract::BorrowedParam {
            parameter: "source",
            mutable: false,
            nullable: false,
        }
    ),
    generated!(
        "create_scene2d_from_lottie_document",
        "&Value",
        Borrowed,
        Contract::BorrowedParam {
            parameter: "source",
            mutable: false,
            nullable: false,
        }
    ),
    generated!(
        "explain_text_markup",
        "Option<&MarkupTagRegistry>",
        Borrowed,
        Contract::BorrowedParam {
            parameter: "registry",
            mutable: false,
            nullable: true,
        }
    ),
    generated!(
        "parse_text_markup",
        "Option<&MarkupTagRegistry>",
        Borrowed,
        Contract::BorrowedParam {
            parameter: "registry",
            mutable: false,
            nullable: true,
        }
    ),
    generated!(
        "get_skeleton_2d_slot_deform_offsets",
        "&Slot2D",
        Borrowed,
        Contract::BorrowedParam {
            parameter: "slot",
            mutable: false,
            nullable: false,
        }
    ),
    generated!(
        "set_skeleton_2d_slot_deform",
        "&mut Slot2D",
        Borrowed,
        Contract::BorrowedParam {
            parameter: "slot",
            mutable: true,
            nullable: false,
        }
    ),
    generated!(
        "set_skeleton_2d_skin",
        "&AttachmentSkin2D",
        Borrowed,
        Contract::BorrowedParam {
            parameter: "skin",
            mutable: false,
            nullable: false,
        }
    ),
    generated!(
        "get_skeleton_2d_skin",
        "Option<&AttachmentSkin2D>",
        Borrowed,
        Contract::BorrowedReturn
    ),
    generated!(
        "deform_skeleton_2d_mesh_attachment",
        "&MeshAttachment2D",
        Borrowed,
        Contract::BorrowedParam {
            parameter: "attachment",
            mutable: false,
            nullable: false,
        }
    ),
    generated!(
        "compute_skeleton_2d_region_attachment_vertices",
        "&RegionAttachment2D",
        Borrowed,
        Contract::BorrowedParam {
            parameter: "attachment",
            mutable: false,
            nullable: false,
        }
    ),
    generated!(
        "get_text_layout_measure_provider",
        "&TextLayoutMeasureState",
        Borrowed,
        Contract::BorrowedParam {
            parameter: "state",
            mutable: false,
            nullable: false,
        }
    ),
    generated!(
        "format_shape_json",
        "Option<&ShapeJsonFormatOptions>",
        Borrowed,
        Contract::BorrowedParam {
            parameter: "options",
            mutable: false,
            nullable: true,
        }
    ),
    generated!(
        "parse_shape_json",
        "Option<&ShapeJsonParseOptions>",
        Borrowed,
        Contract::BorrowedParam {
            parameter: "options",
            mutable: false,
            nullable: true,
        }
    ),
    generated!(
        "parse_user_agent_runtime",
        "Option<&Record<Unknown>>",
        Borrowed,
        Contract::BorrowedParam {
            parameter: "win",
            mutable: false,
            nullable: true,
        }
    ),
    generated!(
        "get_collision_face_query3d",
        "Option<&CollisionFaceQuery3D>",
        Borrowed,
        Contract::BorrowedReturn
    ),
    generated!(
        "get_collision_pair_test2d",
        "Option<&CollisionPairTest2D>",
        Borrowed,
        Contract::BorrowedReturn
    ),
    generated!(
        "get_collision_pair_test3d",
        "Option<&CollisionPairTest3D>",
        Borrowed,
        Contract::BorrowedReturn
    ),
    generated!(
        "get_collision_support2d",
        "Option<&CollisionSupport2D>",
        Borrowed,
        Contract::BorrowedReturn
    ),
    generated!(
        "get_collision_support3d",
        "Option<&CollisionSupport3D>",
        Borrowed,
        Contract::BorrowedReturn
    ),
    generated!(
        "get_audio_decode_slot",
        "Option<&HostAudioDecodeFormatCapability>",
        Borrowed,
        Contract::BorrowedReturn
    ),
    generated!(
        "get_particle_format_codec",
        "Option<&ParticleFormatCodec>",
        Borrowed,
        Contract::BorrowedReturn
    ),
    generated!(
        "select_texture_container",
        "Option<&TextureContainer>",
        Borrowed,
        Contract::BorrowedReturn
    ),
    generated!(
        "select_video_resource_url",
        "Option<&VideoResourceUrl>",
        Borrowed,
        Contract::BorrowedReturn
    ),
    generated!(
        "get_tilemap_signals",
        "Option<&TilemapSignals>",
        Borrowed,
        Contract::BorrowedReturn
    ),
    extension_skip!(
        "init_bounds_rectangle_runtime_trait",
        "Option<&BoundsRectangleRuntimeMethods>"
    ),
    extension_skip!(
        "init_transform2d_runtime_trait",
        "Option<&Transform2DRuntimeMethods>"
    ),
    extension_skip!("lerp_effect", "Option<&EffectFieldRoles>"),
    // Mutable or owned structs, aliases, and returns (28).
    generated!(
        "register_markup_class_styles",
        "&mut MarkupTagRegistry",
        Owned,
        Contract::BorrowedParam {
            parameter: "registry",
            mutable: true,
            nullable: false,
        }
    ),
    generated!(
        "register_markup_named_colors",
        "&mut MarkupTagRegistry",
        Owned,
        Contract::BorrowedParam {
            parameter: "registry",
            mutable: true,
            nullable: false,
        }
    ),
    generated!(
        "register_markup_tag",
        "&mut MarkupTagRegistry",
        Owned,
        Contract::BorrowedParam {
            parameter: "registry",
            mutable: true,
            nullable: false,
        }
    ),
    generated!(
        "register_standard_markup_tags",
        "&mut MarkupTagRegistry",
        Owned,
        Contract::BorrowedParam {
            parameter: "registry",
            mutable: true,
            nullable: false,
        }
    ),
    generated!(
        "create_markup_tag_registry",
        "MarkupTagRegistry",
        Owned,
        Contract::OwnedReturn
    ),
    generated!(
        "acquire_path_mesh",
        "&mut PathMeshPool",
        Owned,
        Contract::BorrowedParam {
            parameter: "pool",
            mutable: true,
            nullable: false,
        }
    ),
    generated!(
        "acquire_path_mesh_typed",
        "&mut PathMeshPool",
        Owned,
        Contract::BorrowedParam {
            parameter: "pool",
            mutable: true,
            nullable: false,
        }
    ),
    generated!(
        "release_path_mesh",
        "&mut PathMeshPool",
        Owned,
        Contract::BorrowedParam {
            parameter: "pool",
            mutable: true,
            nullable: false,
        }
    ),
    generated!(
        "release_path_mesh_typed",
        "&mut PathMeshPool",
        Owned,
        Contract::BorrowedParam {
            parameter: "pool",
            mutable: true,
            nullable: false,
        }
    ),
    generated!(
        "write_shape_geometry_command_end",
        "&mut ShapeGeometryEnd",
        Owned,
        Contract::BorrowedParam {
            parameter: "out",
            mutable: true,
            nullable: false,
        }
    ),
    generated!(
        "set_text_layout_measure_provider",
        "&mut TextLayoutMeasureState",
        Owned,
        Contract::BorrowedParam {
            parameter: "state",
            mutable: true,
            nullable: false,
        }
    ),
    generated!(
        "add_node_color_adjustment",
        "AdjustmentRef",
        Owned,
        Contract::ClonedParam("adjustment")
    ),
    generated!(
        "register_skeleton_2d_constraint_solver",
        "Skeleton2DConstraintSolver",
        Owned,
        Contract::ClonedParam("solve")
    ),
    generated!(
        "get_skeleton_2d_constraint_solver",
        "Option<Skeleton2DConstraintSolver>",
        Owned,
        Contract::OwnedReturn
    ),
    generated!(
        "explain_skeleton_2d_channel_interpolation",
        "Option<Skeleton2DCoercedInterpolation>",
        Owned,
        Contract::OwnedReturn
    ),
    generated!(
        "build_path_morph",
        "PathMorphBuildResult",
        Owned,
        Contract::OwnedReturn
    ),
    generated!(
        "build_stroke_path_geometry",
        "StrokePathGeometry",
        Owned,
        Contract::OwnedReturn
    ),
    ownership_skip!("write_binary_file_chunks", "ByteChunkStream", Owned),
    extension_skip_group!("set_log_sink", "Option<LogSink>", Owned),
    extension_skip_group!("register_skeleton_2d_json_analyzer", "Detector", Owned),
    ownership_skip!("send_ipc_message", "IpcArguments", Owned),
    generated!(
        "find_nodes_in_marquee_selection",
        "Option<MarqueeSelectionMode>",
        Owned,
        Contract::CheckedEnumParam("mode")
    ),
    ownership_skip!(
        "create_canvas_surface_from_native_handle",
        "Option<NativeSurfaceHandle>",
        Owned
    ),
    ownership_skip!("create_animation_state_machine", "Option<StateRef>", Owned),
    ownership_skip!("transition_animation_state_machine", "StateRef", Owned),
    generated!(
        "register_particle_format",
        "ParticleFormatCodec",
        Owned,
        Contract::ClonedParam("codec")
    ),
    generated!(
        "create_animation_channel",
        "TargetRef",
        Owned,
        Contract::ClonedParam("target_ref")
    ),
    generated!(
        "find_requirement_catalog_entries",
        "RequirementFacet",
        Owned,
        Contract::CopiedParam("facet")
    ),
    generated!(
        "create_tween_timer",
        "Tween<TimerTarget>",
        Owned,
        Contract::OwnedReturn
    ),
    // Arc/Ref carriers (20).
    generated!(
        "disable_text_label_guards",
        "&Ref<TextLayoutContext>",
        Shared,
        Contract::BorrowedParam {
            parameter: "context",
            mutable: false,
            nullable: false,
        }
    ),
    generated!(
        "enable_text_label_guards",
        "&Ref<TextLayoutContext>",
        Shared,
        Contract::BorrowedParam {
            parameter: "context",
            mutable: false,
            nullable: false,
        }
    ),
    generated!(
        "create_rich_text",
        "Option<Ref<TextLayoutContext>>",
        Shared,
        Contract::ClonedParam("layout_context")
    ),
    generated!(
        "create_text_label",
        "Option<Ref<TextLayoutContext>>",
        Shared,
        Contract::ClonedParam("layout_context")
    ),
    generated!(
        "create_bitmap_from_image_source",
        "&Arc<HostImageSource>",
        Shared,
        Contract::BorrowedParam {
            parameter: "source",
            mutable: false,
            nullable: false,
        }
    ),
    generated!(
        "explain_bitmap_readback",
        "&Arc<HostImageSource>",
        Shared,
        Contract::BorrowedParam {
            parameter: "source",
            mutable: false,
            nullable: false,
        }
    ),
    generated!(
        "create_image_resource",
        "Arc<HostImageSource>",
        Shared,
        Contract::ClonedParam("image")
    ),
    extension_skip_group!(
        "initialize_glyph_rasterizer_backend_from_glyph_outline_source",
        "Arc<GlyphOutlineSource>",
        Shared
    ),
    extension_skip_group!(
        "allocate_glyph_rasterizer_backend_from_glyph_outline_source",
        "Arc<GlyphOutlineSource>",
        Shared
    ),
    generated!(
        "create_skeleton_2d_draw_order_animation_target",
        "&Ref<Vec<Option<NodeRef>>>",
        Shared,
        Contract::BorrowedParam {
            parameter: "nodes",
            mutable: false,
            nullable: false,
        }
    ),
    generated!(
        "create_skeleton_2d_draw_order_channel",
        "&Ref<Vec<Option<NodeRef>>>",
        Shared,
        Contract::BorrowedParam {
            parameter: "nodes",
            mutable: false,
            nullable: false,
        }
    ),
    generated!(
        "set_node_color_adjustments",
        "Option<Ref<Vec<AdjustmentRef>>>",
        Shared,
        Contract::ClonedParam("value")
    ),
    generated!(
        "get_node_color_adjustments",
        "Option<Ref<Vec<AdjustmentRef>>>",
        Shared,
        Contract::OwnedReturn
    ),
    generated!(
        "load_video_resource_from_blob",
        "&Arc<Blob>",
        Shared,
        Contract::BorrowedParam {
            parameter: "blob",
            mutable: false,
            nullable: false,
        }
    ),
    generated!(
        "create_compressed_image_resource",
        "Arc<CompressedImageData>",
        Shared,
        Contract::ClonedParam("compressed")
    ),
    extension_skip_group!(
        "register_rive_core_object_handler",
        "Arc<RiveCoreObjectHandler>",
        Shared
    ),
    generated!(
        "register_spritesheet_format",
        "Arc<SpritesheetFormatEntry>",
        Shared,
        Contract::ClonedParam("entry")
    ),
    generated!(
        "get_spritesheet_format",
        "Option<Arc<SpritesheetFormatEntry>>",
        Shared,
        Contract::OwnedReturn
    ),
    generated!(
        "register_texture_atlas_format",
        "Arc<TextureAtlasFormatEntry>",
        Shared,
        Contract::ClonedParam("entry")
    ),
    generated!(
        "get_texture_atlas_format",
        "Option<Arc<TextureAtlasFormatEntry>>",
        Shared,
        Contract::OwnedReturn
    ),
    // Guard state params (8).
    generated!(
        "apply_animation_clip_to_skeleton_2d",
        "&Skeleton2DGuardState",
        Guard,
        Contract::BorrowedParam {
            parameter: "guards",
            mutable: false,
            nullable: false,
        }
    ),
    generated!(
        "compute_skeleton_2d_bounding_box_attachment_vertices",
        "&Skeleton2DGuardState",
        Guard,
        Contract::BorrowedParam {
            parameter: "guards",
            mutable: false,
            nullable: false,
        }
    ),
    generated!(
        "deform_skeleton_2d_path_attachment",
        "&Skeleton2DGuardState",
        Guard,
        Contract::BorrowedParam {
            parameter: "guards",
            mutable: false,
            nullable: false,
        }
    ),
    generated!(
        "skin_skeleton_2d_attachment_points",
        "&Skeleton2DGuardState",
        Guard,
        Contract::BorrowedParam {
            parameter: "guards",
            mutable: false,
            nullable: false,
        }
    ),
    generated!(
        "disable_skeleton_2d_guards",
        "&mut Skeleton2DGuardState",
        Guard,
        Contract::BorrowedParam {
            parameter: "state",
            mutable: true,
            nullable: false,
        }
    ),
    generated!(
        "enable_skeleton_2d_guards",
        "&mut Skeleton2DGuardState",
        Guard,
        Contract::BorrowedParam {
            parameter: "state",
            mutable: true,
            nullable: false,
        }
    ),
    generated!(
        "disable_text_markup_guards",
        "&mut TextMarkupGuardState",
        Guard,
        Contract::BorrowedParam {
            parameter: "state",
            mutable: true,
            nullable: false,
        }
    ),
    generated!(
        "enable_text_markup_guards",
        "&mut TextMarkupGuardState",
        Guard,
        Contract::BorrowedParam {
            parameter: "state",
            mutable: true,
            nullable: false,
        }
    ),
    // Signal and SignalSlot carriers (6).
    closure_deferred!("connect_signal_at_frame_rate", "&Signal<FrameTick>", Signal),
    generated!(
        "enable_clock_signals",
        "Signal<FrameTick>",
        Signal,
        Contract::OwnedReturn
    ),
    generated!(
        "on_tray_balloon_event",
        "SignalSlot<TrayBalloonEvent>",
        Signal,
        Contract::ClonedParam("listener")
    ),
    generated!(
        "on_tray_drop",
        "SignalSlot<TrayDropEvent>",
        Signal,
        Contract::ClonedParam("listener")
    ),
    generated!(
        "on_tray_interaction",
        "SignalSlot<TrayInteractionEvent>",
        Signal,
        Contract::ClonedParam("listener")
    ),
    generated!(
        "on_tray_menu_selection",
        "SignalSlot<TrayMenuSelectionEvent>",
        Signal,
        Contract::ClonedParam("listener")
    ),
    // HashMap carriers (6).
    ownership_skip!(
        "report_import_diagnostic",
        "Option<HashMap<String, ImportDiagnosticDetailValue>>",
        Map
    ),
    generated!(
        "serialize_log_error",
        "HashMap<String, LogValue>",
        Map,
        Contract::MapReturn
    ),
    unmapped_carrier!("create_child_log_context", "HashMap<String, LogValue>", Map),
    generated!(
        "collect_dragon_bones_section_counts",
        "Option<HashMap<String, usize>>",
        Map,
        Contract::MapReturn
    ),
    generated!(
        "collect_spine_binary_section_counts",
        "Option<HashMap<String, usize>>",
        Map,
        Contract::MapReturn
    ),
    generated!(
        "collect_spine_json_section_counts",
        "Option<HashMap<String, usize>>",
        Map,
        Contract::MapReturn
    ),
    // Slice carriers (8).
    generated!(
        "index_of_bone",
        "&[Bone2D]",
        Slice,
        Contract::SliceParam("bones")
    ),
    generated!(
        "index_of_spine_slot",
        "&[Slot2D]",
        Slice,
        Contract::SliceParam("slots")
    ),
    extension_skip_group!("migrate_storage", "&[&StorageMigration]", Slice),
    generated!(
        "create_rive_animation_clips",
        "&[Option<Node2DRef>]",
        Slice,
        Contract::SliceParam("nodes")
    ),
    generated!(
        "read_spine_binary_string_reference",
        "&[Option<String>]",
        Slice,
        Contract::SliceParam("strings")
    ),
    generated!(
        "get_bitmap_text_pages",
        "&[BitmapTextPage]",
        Slice,
        Contract::SliceReturn
    ),
    generated!(
        "spritesheet_all_formats",
        "&[SpritesheetFormatDescriptor]",
        Slice,
        Contract::SliceReturn
    ),
    generated!(
        "texture_atlas_all_formats",
        "&[TextureAtlasFormatDescriptor]",
        Slice,
        Contract::SliceReturn
    ),
    // Vec carriers (6).
    generated!(
        "read_swf_filter_list",
        "&mut Vec<SwfAdjustmentRef>",
        Vec,
        Contract::VecParam {
            parameter: "out_adjustments",
            owned: false,
            nullable: false,
        }
    ),
    ownership_skip!("create_skeleton_2d", "Vec<Bone2D>", Vec),
    generated!(
        "report_requirement",
        "Option<&mut Vec<Requirement>>",
        Vec,
        Contract::VecParam {
            parameter: "sink",
            owned: false,
            nullable: true,
        }
    ),
    generated!(
        "build_spine_segment_easings",
        "Option<Vec<EasingFn>>",
        Vec,
        Contract::VecReturn
    ),
    generated!(
        "build_spine_binary_segment_easings",
        "Option<Vec<EasingFn>>",
        Vec,
        Contract::VecReturn
    ),
    ownership_skip!(
        "build_tilemap_layers_from_tiled",
        "Option<Vec<TilemapData>>",
        Vec
    ),
];

const PRE_K_GENERATED_SOURCES: usize = 3278;
const PRE_K_SKIPPED_SOURCES: usize = 805;
const PRE_K_TOTAL_SOURCES: usize = 4083;
// Task M promotes eleven of the residual pre-M skips. Its own census test pins the exact names;
// this keeps Task K's historical delta additive when the suites run together.
const TASK_M_GENERATED_SOURCES: usize = 11;
// Item D adds one TypeScript-public source, `share_bitmap`, which generates; it widens the total
// and the generated set without touching Task K's own delta.
const ITEM_D_GENERATED_SOURCES: usize = 1;

// The producer fixed point also finds three pre-K wrappers that consumed boxes no public wrapper
// could produce. They are removals from the baseline generated set, not members of the original
// opaque-fallback skip inventory.
const TASK_K_BASELINE_GENERATED_OWNERSHIP_SKIPS: &[&str] = &[
    "create_animation_clip",
    "create_skin_2d",
    "explain_host_capability_slot",
];

// These LogDataOrProvider functions were already skipped before Task K. The producer audit changes
// their reason from an incidental unmapped type to the durable ownership policy.
const TASK_K_ADDITIONAL_OWNERSHIP_RECLASSIFICATIONS: &[&str] = &[
    "log",
    "log_assert",
    "log_debug",
    "log_debug_with",
    "log_error",
    "log_error_with",
    "log_info",
    "log_info_with",
    "log_once",
    "log_verbose",
    "log_verbose_with",
    "log_warn",
    "log_warn_with",
    "log_with",
];

const PRE_K_EXTENSION_POLICY_SKIPS: &[&str] = &[
    "create_filter_log_sink",
    "enable_log_signals",
    "register_dragon_bones_section_handler",
    "register_dragon_bones_timeline_handler",
    "register_log_serializer",
    "register_spine_binary_section_handler",
    "register_spine_binary_timeline_handler",
    "register_spine_json_section_handler",
    "register_spine_json_timeline_handler",
    "register_spine_skeleton_binary_parser",
];
const PRE_K_OWNERSHIP_POLICY_SKIPS: &[&str] =
    &["create_fanout_log_sink", "get_memory_log_sink_entries"];
const PRE_K_SAFETY_POLICY_SKIPS: &[&str] = &[
    "enable_clip_guards",
    "enable_statechart_guards",
    "get_connectivity_online",
];
const TASK_L_EXTENSION_POLICY_SKIPS: &[&str] = &[
    "default_shape_bounds_cubic_curve_to",
    "default_shape_bounds_draw_circle",
    "default_shape_bounds_draw_ellipse",
    "default_shape_bounds_draw_path",
    "default_shape_bounds_draw_rectangle",
    "default_shape_bounds_draw_rounded_rectangle",
    "default_shape_bounds_expand_point_pairs",
    "default_shape_bounds_line_style",
    "default_shape_bounds_line_to",
    "default_shape_bounds_move_to",
    "default_shape_bounds_quadratic_curve_to",
];

fn generated_wrappers() -> &'static str {
    include_str!(concat!(env!("OUT_DIR"), "/ffi_generated.rs"))
}

fn generated_header() -> &'static str {
    include_str!(concat!(env!("OUT_DIR"), "/flight_ffi.h"))
}

fn generated_stats() -> &'static str {
    include_str!(concat!(env!("OUT_DIR"), "/ffi_stats.txt"))
}

fn source_census(stats: &str) -> (usize, usize, usize) {
    let line = stats.lines().next().expect("FFI source census line");
    let line = line
        .strip_prefix("FFI source decisions: ")
        .expect("FFI source census prefix");
    let (total, line) = line.split_once(" total, ").expect("total source census");
    let (generated, skipped) = line
        .split_once(" generated, ")
        .expect("generated source census");
    let skipped = skipped
        .strip_suffix(" skipped")
        .expect("skipped source census");
    return (
        total.parse().unwrap(),
        generated.parse().unwrap(),
        skipped.parse().unwrap(),
    );
}

fn wrapper_census(stats: &str) -> (usize, usize, usize) {
    let line = stats.lines().nth(1).expect("FFI wrapper census line");
    let line = line
        .strip_prefix("FFI emitted wrappers: ")
        .expect("FFI wrapper census prefix");
    let (total, line) = line.split_once(" total, ").expect("total wrapper census");
    let (sources, extras) = line
        .split_once(" generated sources, ")
        .expect("source wrapper census");
    let extras = extras
        .strip_suffix(" monomorphized extras")
        .expect("extra wrapper census");
    return (
        total.parse().unwrap(),
        sources.parse().unwrap(),
        extras.parse().unwrap(),
    );
}

fn policy_decisions(stats: &str) -> Vec<String> {
    let mut decisions = Vec::new();
    for line in stats.lines() {
        let Some(rest) = line.strip_prefix("  skip:") else {
            continue;
        };
        let start = [
            "extension_policy_skip(",
            "ownership_policy_skip(",
            "safety_policy_skip(",
        ]
        .into_iter()
        .find_map(|needle| rest.find(needle));
        let Some(start) = start else {
            continue;
        };
        let count: usize = rest[..start].trim().parse().expect("policy decision count");
        assert_eq!(
            count, 1,
            "policy decisions must identify one source: {line}"
        );
        decisions.push(rest[start..].to_string());
    }
    return decisions;
}

fn insert_policy(expected: &mut BTreeSet<String>, category: &str, names: &[&str]) {
    for name in names {
        assert!(
            expected.insert(format!("{category}({name})")),
            "duplicate declared policy decision {category}({name})"
        );
    }
}

fn generator_source() -> &'static str {
    include_str!("../build.rs")
}

fn task_k_failure_heading(source: &str, stats: &str) -> &'static str {
    if source.contains("const SKIP_TYPES:")
        || stats.contains("skip_type_param(")
        || stats.contains("skip_type_return(")
    {
        return "EXPECTED PRE-K TASK K ACCEPTANCE FAILURE";
    }
    if !source.contains("static PRODUCIBLE_TYPES:") {
        return "EXPECTED TASK K SAFETY REPAIR FAILURE";
    }
    return "TASK K ACCEPTANCE FAILURE";
}

fn wrapper_block<'a>(wrappers: &'a str, symbol: &str) -> Option<&'a str> {
    let marker = format!("pub unsafe extern \"C\" fn {symbol}(");
    let start = wrappers.find(&marker)?;
    let rest = &wrappers[start..];
    let end = rest.find("\n}\n").map_or(rest.len(), |index| index + 3);
    Some(&rest[..end])
}

fn header_entry<'a>(header: &'a str, symbol: &str) -> Option<(&'a str, Option<&'a str>)> {
    let needle = format!(" {symbol}(");
    let lines: Vec<&str> = header.lines().collect();
    let index = lines.iter().position(|line| line.contains(&needle))?;
    let comment = index
        .checked_sub(1)
        .and_then(|previous| lines[previous].starts_with("/*").then_some(lines[previous]));
    Some((lines[index], comment))
}

fn push_error(errors: &mut Vec<String>, condition: bool, message: impl FnOnce() -> String) {
    if !condition {
        errors.push(message());
    }
}

fn parameter_clone_count(block: &str, parameter: &str) -> usize {
    let direct = format!("(*{parameter}).clone()");
    let cast = format!("(*({parameter} as *const ");
    return block
        .lines()
        .filter(|line| {
            line.contains(&direct)
                || line
                    .find(&cast)
                    .is_some_and(|start| line[start..].contains(")).clone()"))
        })
        .count();
}

fn assert_owned_return(candidate: &Candidate, block: &str, header: &str, errors: &mut Vec<String>) {
    let symbol = format!("flight_{}", candidate.function);
    push_error(errors, block.contains("Box::into_raw(Box::new("), || {
        format!(
            "{} ({}) does not box its owned return",
            candidate.function, candidate.carrier
        )
    });
    let Some((_, comment)) = header_entry(header, &symbol) else {
        return;
    };
    let comment = comment.unwrap_or("");
    push_error(
        errors,
        comment.starts_with("/* Caller owns the return value; call "),
        || {
            format!(
                "{} ({}) lacks the caller-owns header comment",
                candidate.function, candidate.carrier
            )
        },
    );
    let Some(free) = comment
        .split_once("; call ")
        .and_then(|(_, rest)| rest.strip_suffix(" when done. */"))
    else {
        return;
    };
    push_error(errors, header.contains(&format!("void {free}(")), || {
        format!("{} names missing paired free {free}", candidate.function)
    });
    push_error(
        errors,
        generated_wrappers().contains(&format!("fn {free}(")),
        || {
            format!(
                "{} names unimplemented paired free {free}",
                candidate.function
            )
        },
    );
}

fn assert_result_accessors(function: &str, require_key: bool, errors: &mut Vec<String>) {
    let wrappers = generated_wrappers();
    let prefix = format!("flight_{function}_result_");
    for suffix in ["len", "get", "free"] {
        push_error(
            errors,
            wrappers.contains(&format!("fn {prefix}{suffix}(")),
            || format!("{function} lacks its {prefix}{suffix} accessor"),
        );
    }
    if require_key {
        push_error(
            errors,
            wrappers.contains(&format!("fn {prefix}get_key("))
                || wrappers.contains(&format!("fn {prefix}keys(")),
            || format!("{function} lacks a map key accessor"),
        );
    }
}

#[test]
fn task_k_inventory_is_exact_unique_and_complete() {
    assert_eq!(TASK_K_CANDIDATES.len(), 120, "Task K inventory omission");

    let mut names = BTreeSet::new();
    for candidate in TASK_K_CANDIDATES {
        assert!(
            names.insert(candidate.function),
            "duplicate Task K inventory entry {}",
            candidate.function
        );
        assert!(!candidate.carrier.is_empty());
    }

    let counts: BTreeMap<Group, usize> =
        TASK_K_CANDIDATES
            .iter()
            .fold(BTreeMap::new(), |mut counts, candidate| {
                *counts.entry(candidate.group).or_default() += 1;
                counts
            });
    assert_eq!(
        counts,
        BTreeMap::from([
            (Group::Borrowed, 37),
            (Group::Owned, 29),
            (Group::Shared, 20),
            (Group::Guard, 8),
            (Group::Signal, 6),
            (Group::Map, 6),
            (Group::Slice, 8),
            (Group::Vec, 6),
        ])
    );
    assert_eq!(
        TASK_K_CANDIDATES
            .iter()
            .filter(|candidate| candidate.outcome == Outcome::Generated)
            .count(),
        101
    );
    assert_eq!(
        TASK_K_CANDIDATES
            .iter()
            .filter(|candidate| candidate.outcome == Outcome::ExtensionPolicySkip)
            .count(),
        9
    );
    assert_eq!(
        TASK_K_CANDIDATES
            .iter()
            .filter(|candidate| candidate.outcome == Outcome::OwnershipPolicySkip)
            .count(),
        8
    );
    assert_eq!(
        TASK_K_CANDIDATES
            .iter()
            .filter(|candidate| candidate.outcome == Outcome::ClosureDeferred)
            .count(),
        1
    );
    assert_eq!(
        TASK_K_CANDIDATES
            .iter()
            .filter(|candidate| candidate.outcome == Outcome::UnmappedCarrier)
            .count(),
        1
    );
}

#[test]
fn task_k_source_decision_delta_from_pre_k_baseline_is_exact() {
    let stats = generated_stats();
    let heading = task_k_failure_heading(generator_source(), stats);
    let generated_additions = TASK_K_CANDIDATES
        .iter()
        .filter(|candidate| candidate.outcome == Outcome::Generated)
        .count();
    let generated_removals = TASK_K_BASELINE_GENERATED_OWNERSHIP_SKIPS.len();
    let expected_generated = PRE_K_GENERATED_SOURCES + generated_additions - generated_removals
        + TASK_M_GENERATED_SOURCES
        + ITEM_D_GENERATED_SOURCES;
    let expected_skipped =
        PRE_K_SKIPPED_SOURCES - generated_additions + generated_removals - TASK_M_GENERATED_SOURCES;
    assert_eq!(
        source_census(stats),
        (
            PRE_K_TOTAL_SOURCES + ITEM_D_GENERATED_SOURCES,
            expected_generated,
            expected_skipped
        ),
        "{heading}: source-decision delta must have no undeclared addition or omission"
    );
    assert_eq!(
        wrapper_census(stats),
        (expected_generated + 97, expected_generated, 97),
        "{heading}: Task K must not change the pre-K monomorphized wrapper extras"
    );

    let mut changed_names = BTreeSet::new();
    for candidate in TASK_K_CANDIDATES
        .iter()
        .filter(|candidate| candidate.outcome != Outcome::ClosureDeferred)
    {
        assert!(
            changed_names.insert(candidate.function),
            "duplicate Task K changed source {}",
            candidate.function
        );
    }
    for name in TASK_K_BASELINE_GENERATED_OWNERSHIP_SKIPS
        .iter()
        .chain(TASK_K_ADDITIONAL_OWNERSHIP_RECLASSIFICATIONS)
    {
        assert!(
            changed_names.insert(name),
            "duplicate Task K changed source {name}"
        );
    }
    assert_eq!(
        changed_names.len(),
        136,
        "complete Task K changed-source inventory"
    );

    let mut expected_policy = BTreeSet::new();
    insert_policy(
        &mut expected_policy,
        "extension_policy_skip",
        PRE_K_EXTENSION_POLICY_SKIPS,
    );
    insert_policy(
        &mut expected_policy,
        "ownership_policy_skip",
        PRE_K_OWNERSHIP_POLICY_SKIPS,
    );
    insert_policy(
        &mut expected_policy,
        "safety_policy_skip",
        PRE_K_SAFETY_POLICY_SKIPS,
    );
    insert_policy(
        &mut expected_policy,
        "extension_policy_skip",
        TASK_L_EXTENSION_POLICY_SKIPS,
    );
    for candidate in TASK_K_CANDIDATES {
        match candidate.outcome {
            Outcome::ExtensionPolicySkip => insert_policy(
                &mut expected_policy,
                "extension_policy_skip",
                &[candidate.function],
            ),
            Outcome::OwnershipPolicySkip => insert_policy(
                &mut expected_policy,
                "ownership_policy_skip",
                &[candidate.function],
            ),
            Outcome::Generated | Outcome::ClosureDeferred | Outcome::UnmappedCarrier => {}
        }
    }
    insert_policy(
        &mut expected_policy,
        "ownership_policy_skip",
        TASK_K_BASELINE_GENERATED_OWNERSHIP_SKIPS,
    );
    insert_policy(
        &mut expected_policy,
        "ownership_policy_skip",
        TASK_K_ADDITIONAL_OWNERSHIP_RECLASSIFICATIONS,
    );

    let actual_policy = policy_decisions(stats);
    let actual_unique: BTreeSet<_> = actual_policy.iter().cloned().collect();
    assert_eq!(
        actual_policy.len(),
        actual_unique.len(),
        "duplicate source policy decision"
    );
    assert!(
        expected_policy.is_subset(&actual_unique),
        "{heading}: every Task K policy decision must remain in the final policy set"
    );

    let wrappers = generated_wrappers();
    let header = generated_header();
    for function in TASK_K_BASELINE_GENERATED_OWNERSHIP_SKIPS {
        let symbol = format!("flight_{function}");
        assert!(wrapper_block(wrappers, &symbol).is_none());
        assert!(header_entry(header, &symbol).is_none());
        assert!(stats.contains(&format!("ownership_policy_skip({function})")));
    }
    for function in TASK_K_ADDITIONAL_OWNERSHIP_RECLASSIFICATIONS {
        assert!(stats.contains(&format!("ownership_policy_skip({function})")));
    }
}

// Before Task K lands this test intentionally fails with an "expected pre-K" prefix. Inventory
// defects are separate failures in `task_k_inventory_is_exact_unique_and_complete`; once SKIP_TYPES
// disappears, every diagnostic below is a genuine generated-contract regression.
#[test]
fn task_k_generated_surface_satisfies_every_inventory_contract() {
    let wrappers = generated_wrappers();
    let header = generated_header();
    let stats = generated_stats();
    let source = generator_source();
    let mut errors = Vec::new();

    push_error(&mut errors, !source.contains("const SKIP_TYPES:"), || {
        "generator still declares SKIP_TYPES".to_string()
    });
    push_error(&mut errors, !stats.contains("skip_type_param("), || {
        "stats still contain skip_type_param".to_string()
    });
    push_error(&mut errors, !stats.contains("skip_type_return("), || {
        "stats still contain skip_type_return".to_string()
    });

    for candidate in TASK_K_CANDIDATES {
        let symbol = format!("flight_{}", candidate.function);
        let marker = format!("fn {symbol}(");
        let promoted_by_task_m = matches!(
            candidate.function,
            "connect_signal_at_frame_rate" | "create_child_log_context"
        );
        let expected_occurrences =
            usize::from(candidate.outcome == Outcome::Generated || promoted_by_task_m);
        push_error(
            &mut errors,
            wrappers.matches(&marker).count() == expected_occurrences,
            || {
                format!(
                    "{} must emit exactly {expected_occurrences} source wrapper(s)",
                    candidate.function
                )
            },
        );
        if promoted_by_task_m {
            push_error(&mut errors, header_entry(header, &symbol).is_some(), || {
                format!(
                    "{} was promoted by Task M but lacks a C header entry",
                    candidate.function
                )
            });
            continue;
        }
        if candidate.outcome != Outcome::Generated {
            push_error(
                &mut errors,
                wrapper_block(wrappers, &symbol).is_none(),
                || format!("{} must remain a by-design Task K skip", candidate.function),
            );
            push_error(&mut errors, header_entry(header, &symbol).is_none(), || {
                format!("{} leaked into the C header", candidate.function)
            });
            match candidate.outcome {
                Outcome::ExtensionPolicySkip => push_error(
                    &mut errors,
                    stats.contains(&format!("extension_policy_skip({})", candidate.function)),
                    || {
                        format!(
                            "{} is not classified extension_policy_skip",
                            candidate.function
                        )
                    },
                ),
                Outcome::OwnershipPolicySkip => push_error(
                    &mut errors,
                    stats.contains(&format!("ownership_policy_skip({})", candidate.function)),
                    || {
                        format!(
                            "{} is not classified ownership_policy_skip",
                            candidate.function
                        )
                    },
                ),
                Outcome::ClosureDeferred => push_error(
                    &mut errors,
                    stats.contains("closure_return(Arc<dyn Fn() + Send + Sync>)"),
                    || {
                        format!(
                            "{} is not deferred to the ordinary pre-M closure-return skip",
                            candidate.function
                        )
                    },
                ),
                Outcome::UnmappedCarrier => push_error(
                    &mut errors,
                    stats.contains("unmapped_param(Option<Option<String>>)")
                        && candidate.function == "create_child_log_context",
                    || {
                        format!(
                            "{} is not pinned to its remaining nested-optional carrier gap",
                            candidate.function
                        )
                    },
                ),
                Outcome::Generated => unreachable!(),
            }
            continue;
        }

        let Some(block) = wrapper_block(wrappers, &symbol) else {
            errors.push(format!(
                "{} ({}) is absent from generated Rust",
                candidate.function, candidate.carrier
            ));
            continue;
        };
        let Some((prototype, comment)) = header_entry(header, &symbol) else {
            errors.push(format!(
                "{} ({}) is absent from the C header",
                candidate.function, candidate.carrier
            ));
            continue;
        };

        match candidate.contract {
            Contract::BorrowedParam {
                parameter,
                mutable,
                nullable,
            } => {
                let pointer = if mutable { "*mut" } else { "*const" };
                push_error(
                    &mut errors,
                    block.contains(&format!("{parameter}: {pointer}")),
                    || {
                        format!(
                            "{} does not lower borrowed {} as {pointer}",
                            candidate.function, candidate.carrier
                        )
                    },
                );
                push_error(
                    &mut errors,
                    !block.contains(&format!("Box::from_raw({parameter}")),
                    || format!("{} consumes borrowed {parameter}", candidate.function),
                );
                if nullable {
                    push_error(
                        &mut errors,
                        block.contains(&format!("{parameter}.is_null()")),
                        || format!("{} loses nullable {parameter}", candidate.function),
                    );
                }
            }
            Contract::ClonedParam(parameter) => {
                push_error(
                    &mut errors,
                    parameter_clone_count(block, parameter) == 1
                        && !block.contains(&format!("Box::from_raw({parameter}")),
                    || {
                        format!(
                            "{} does not clone shared parameter {parameter}",
                            candidate.function
                        )
                    },
                );
                push_error(
                    &mut errors,
                    prototype.contains("cloned; caller retains its handle"),
                    || format!("{} lacks its cloned-handle comment", candidate.function),
                );
            }
            Contract::CopiedParam(parameter) => {
                push_error(
                    &mut errors,
                    !block.contains(&format!("Box::from_raw({parameter}"))
                        && !prototype.contains("ownership transferred"),
                    || format!("{} consumes Copy parameter {parameter}", candidate.function),
                );
            }
            Contract::CheckedEnumParam(parameter) => {
                push_error(
                    &mut errors,
                    block.contains("ffi_enum_from_u32!")
                        && !block.contains("transmute")
                        && block.contains(parameter),
                    || {
                        format!(
                            "{} does not check enum parameter {parameter}",
                            candidate.function
                        )
                    },
                );
            }
            Contract::BorrowedReturn => {
                push_error(
                    &mut errors,
                    block
                        .lines()
                        .next()
                        .is_some_and(|line| line.contains("-> *const"))
                        && !block.contains("Box::into_raw"),
                    || format!("{} does not return a borrowed pointer", candidate.function),
                );
                push_error(
                    &mut errors,
                    comment.is_some_and(|line| line.contains("Borrowed return; do not free")),
                    || format!("{} lacks its borrowed-return comment", candidate.function),
                );
            }
            Contract::OwnedReturn => {
                assert_owned_return(candidate, block, header, &mut errors);
            }
            Contract::MapReturn => {
                assert_owned_return(candidate, block, header, &mut errors);
                assert_result_accessors(candidate.function, true, &mut errors);
            }
            Contract::SliceParam(parameter) => {
                push_error(
                    &mut errors,
                    block.contains(&format!("{parameter}_ptr: *const"))
                        && block.contains(&format!("{parameter}_len: usize"))
                        && block.contains("ffi_slice_from_raw_parts"),
                    || {
                        format!(
                            "{} does not lower {} to a borrowed ptr+len pair",
                            candidate.function, candidate.carrier
                        )
                    },
                );
            }
            Contract::SliceReturn => {
                push_error(
                    &mut errors,
                    block
                        .lines()
                        .next()
                        .is_some_and(|line| line.contains("-> *const"))
                        && block
                            .lines()
                            .next()
                            .is_some_and(|line| line.contains("*mut usize"))
                        && block.contains(".as_ptr()")
                        && !block.contains("Box::into_raw"),
                    || {
                        format!(
                            "{} does not lower its borrowed slice return to ptr+len",
                            candidate.function
                        )
                    },
                );
                push_error(
                    &mut errors,
                    comment.is_some_and(|line| line.contains("Borrowed return; do not free")),
                    || format!("{} lacks its borrowed-slice comment", candidate.function),
                );
            }
            Contract::VecParam {
                parameter,
                owned,
                nullable,
            } => {
                if owned {
                    push_error(
                        &mut errors,
                        block.contains(&format!("Box::from_raw({parameter}"))
                            && prototype.contains("ownership transferred"),
                        || {
                            format!(
                                "{} does not consume owned Vec {parameter}",
                                candidate.function
                            )
                        },
                    );
                } else {
                    push_error(
                        &mut errors,
                        block.contains(&format!("{parameter}: *mut"))
                            && !block.contains(&format!("Box::from_raw({parameter}")),
                        || {
                            format!(
                                "{} does not borrow mutable Vec {parameter}",
                                candidate.function
                            )
                        },
                    );
                    if nullable {
                        push_error(
                            &mut errors,
                            block.contains(&format!("{parameter}.is_null()"))
                                || (candidate.function == "report_requirement"
                                    && block.contains(&format!(
                                        "ffi_requirement_list_values({parameter})"
                                    ))),
                            || format!("{} loses nullable Vec {parameter}", candidate.function),
                        );
                    }
                }
            }
            Contract::VecReturn => {
                assert_owned_return(candidate, block, header, &mut errors);
                assert_result_accessors(candidate.function, false, &mut errors);
            }
            Contract::ExtensionPolicySkip
            | Contract::OwnershipPolicySkip
            | Contract::ClosureDeferred
            | Contract::UnmappedCarrier => unreachable!(),
        }
    }

    if !errors.is_empty() {
        let heading = task_k_failure_heading(source, stats);
        panic!(
            "{heading} ({} issue(s)):\n{}",
            errors.len(),
            errors.join("\n")
        );
    }
}
