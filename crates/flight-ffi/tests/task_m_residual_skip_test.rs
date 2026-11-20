use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
enum Group {
    Behavior,
    ClosureParam,
    ClosureReturn,
    ImportContext,
    IteratorCollector,
    LifetimeData,
    NestedOption,
}

#[derive(Clone, Copy, Debug)]
enum Contract {
    BorrowedContext,
    OptionalScalarCallback,
    OptionalStringCallback,
    OptionalBehaviorVTable,
    OptionalLayoutResolver,
    NestedOptionalString,
    BorrowedByteUnion,
    BorrowedAtomicWriteUnion,
    ColorCurveCallback,
    DiagnosticCollectorCallback,
    RequirementCollectorCallback,
    PathSegmentCallback,
    OptionalEnumCallback,
    DisposerReturn,
    SignalConnectionReturn,
}

#[derive(Clone, Copy, Debug)]
struct Candidate {
    function: &'static str,
    reason: &'static str,
    group: Group,
    contract: Contract,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum Outcome {
    Generated,
    ExtensionPolicySkip,
    SafetyPolicySkip,
}

macro_rules! candidate {
    ($function:literal, $reason:literal, $group:ident, $contract:ident) => {
        Candidate {
            function: $function,
            reason: $reason,
            group: Group::$group,
            contract: Contract::$contract,
        }
    };
}

const TASK_M_CANDIDATES: &[Candidate] = &[
    candidate!(
        "lottie_ellipse_shape_item_handler",
        "unmapped_param(&mut LottieShapeItemContext<'_, '_>)",
        ImportContext,
        BorrowedContext
    ),
    candidate!(
        "lottie_fill_shape_item_handler",
        "unmapped_param(&mut LottieShapeItemContext<'_, '_>)",
        ImportContext,
        BorrowedContext
    ),
    candidate!(
        "lottie_gradient_fill_shape_item_handler",
        "unmapped_param(&mut LottieShapeItemContext<'_, '_>)",
        ImportContext,
        BorrowedContext
    ),
    candidate!(
        "lottie_gradient_stroke_shape_item_handler",
        "unmapped_param(&mut LottieShapeItemContext<'_, '_>)",
        ImportContext,
        BorrowedContext
    ),
    candidate!(
        "lottie_path_shape_item_handler",
        "unmapped_param(&mut LottieShapeItemContext<'_, '_>)",
        ImportContext,
        BorrowedContext
    ),
    candidate!(
        "lottie_polystar_shape_item_handler",
        "unmapped_param(&mut LottieShapeItemContext<'_, '_>)",
        ImportContext,
        BorrowedContext
    ),
    candidate!(
        "lottie_rectangle_shape_item_handler",
        "unmapped_param(&mut LottieShapeItemContext<'_, '_>)",
        ImportContext,
        BorrowedContext
    ),
    candidate!(
        "lottie_stroke_shape_item_handler",
        "unmapped_param(&mut LottieShapeItemContext<'_, '_>)",
        ImportContext,
        BorrowedContext
    ),
    candidate!(
        "lottie_trim_path_shape_item_handler",
        "unmapped_param(&mut LottieShapeItemContext<'_, '_>)",
        ImportContext,
        BorrowedContext
    ),
    candidate!(
        "lottie_image_layer_handler",
        "unmapped_param(&mut LottieLayerContext<'_, '_>)",
        ImportContext,
        BorrowedContext
    ),
    candidate!(
        "lottie_null_layer_handler",
        "unmapped_param(&mut LottieLayerContext<'_, '_>)",
        ImportContext,
        BorrowedContext
    ),
    candidate!(
        "lottie_precomposition_layer_handler",
        "unmapped_param(&mut LottieLayerContext<'_, '_>)",
        ImportContext,
        BorrowedContext
    ),
    candidate!(
        "lottie_shape_layer_handler",
        "unmapped_param(&mut LottieLayerContext<'_, '_>)",
        ImportContext,
        BorrowedContext
    ),
    candidate!(
        "lottie_solid_layer_handler",
        "unmapped_param(&mut LottieLayerContext<'_, '_>)",
        ImportContext,
        BorrowedContext
    ),
    candidate!(
        "lottie_text_layer_handler",
        "unmapped_param(&mut LottieLayerContext<'_, '_>)",
        ImportContext,
        BorrowedContext
    ),
    candidate!(
        "lottie_additive_mask_handler",
        "unmapped_param(&mut LottieMaskContext<'_, '_>)",
        ImportContext,
        BorrowedContext
    ),
    candidate!(
        "svg_path_clip_handler",
        "unmapped_param(&mut SvgClipContext<'_, '_>)",
        ImportContext,
        BorrowedContext
    ),
    candidate!(
        "svg_container_element_handler",
        "unmapped_param(&mut SvgElementContext<'_, '_>)",
        ImportContext,
        BorrowedContext
    ),
    candidate!(
        "svg_geometry_element_handler",
        "unmapped_param(&mut SvgElementContext<'_, '_>)",
        ImportContext,
        BorrowedContext
    ),
    candidate!(
        "svg_image_element_handler",
        "unmapped_param(&mut SvgElementContext<'_, '_>)",
        ImportContext,
        BorrowedContext
    ),
    candidate!(
        "svg_text_element_handler",
        "unmapped_param(&mut SvgElementContext<'_, '_>)",
        ImportContext,
        BorrowedContext
    ),
    candidate!(
        "svg_use_element_handler",
        "unmapped_param(&mut SvgElementContext<'_, '_>)",
        ImportContext,
        BorrowedContext
    ),
    candidate!(
        "skip_spine_binary_animations_section",
        "unmapped_param(&mut SpineBinarySectionContext<'_>)",
        ImportContext,
        BorrowedContext
    ),
    candidate!(
        "skip_spine_binary_events_section",
        "unmapped_param(&mut SpineBinarySectionContext<'_>)",
        ImportContext,
        BorrowedContext
    ),
    candidate!(
        "skip_spine_binary_ik_constraints_section",
        "unmapped_param(&mut SpineBinarySectionContext<'_>)",
        ImportContext,
        BorrowedContext
    ),
    candidate!(
        "skip_spine_binary_path_constraints_section",
        "unmapped_param(&mut SpineBinarySectionContext<'_>)",
        ImportContext,
        BorrowedContext
    ),
    candidate!(
        "skip_spine_binary_transform_constraints_section",
        "unmapped_param(&mut SpineBinarySectionContext<'_>)",
        ImportContext,
        BorrowedContext
    ),
    candidate!(
        "skip_spine_binary_bone_timelines",
        "unmapped_param(&mut SpineBinaryTimelineContext<'_, '_>)",
        ImportContext,
        BorrowedContext
    ),
    candidate!(
        "skip_spine_binary_deform_timelines",
        "unmapped_param(&mut SpineBinaryTimelineContext<'_, '_>)",
        ImportContext,
        BorrowedContext
    ),
    candidate!(
        "skip_spine_binary_draw_order_timeline",
        "unmapped_param(&mut SpineBinaryTimelineContext<'_, '_>)",
        ImportContext,
        BorrowedContext
    ),
    candidate!(
        "skip_spine_binary_event_timelines",
        "unmapped_param(&mut SpineBinaryTimelineContext<'_, '_>)",
        ImportContext,
        BorrowedContext
    ),
    candidate!(
        "skip_spine_binary_ik_timelines",
        "unmapped_param(&mut SpineBinaryTimelineContext<'_, '_>)",
        ImportContext,
        BorrowedContext
    ),
    candidate!(
        "skip_spine_binary_path_timelines",
        "unmapped_param(&mut SpineBinaryTimelineContext<'_, '_>)",
        ImportContext,
        BorrowedContext
    ),
    candidate!(
        "skip_spine_binary_slot_timelines",
        "unmapped_param(&mut SpineBinaryTimelineContext<'_, '_>)",
        ImportContext,
        BorrowedContext
    ),
    candidate!(
        "skip_spine_binary_transform_timelines",
        "unmapped_param(&mut SpineBinaryTimelineContext<'_, '_>)",
        ImportContext,
        BorrowedContext
    ),
    candidate!(
        "set_bitmap_text_missing_glyph_guard",
        "unmapped_param(Option<BitmapTextMissingGlyphGuard>)",
        Behavior,
        OptionalScalarCallback
    ),
    candidate!(
        "create_file_dialog_handle",
        "unmapped_param(Option<FileDialogHandleOperations>)",
        Behavior,
        OptionalBehaviorVTable
    ),
    candidate!(
        "register_layout_resolver",
        "unmapped_param(Option<LayoutResolver>)",
        Behavior,
        OptionalLayoutResolver
    ),
    candidate!(
        "dispatch_selectable_rich_text_key_down",
        "unmapped_param(Option<TextInputCopyCallback>)",
        Behavior,
        OptionalStringCallback
    ),
    candidate!(
        "dispatch_text_input_key_down",
        "unmapped_param(Option<TextInputCopyCallback>)",
        Behavior,
        OptionalStringCallback
    ),
    candidate!(
        "create_child_log_context",
        "unmapped_param(Option<Option<String>>)",
        NestedOption,
        NestedOptionalString
    ),
    candidate!(
        "detect_audio_mime_type",
        "unmapped_param(AudioMimeTypeData<'_>)",
        LifetimeData,
        BorrowedByteUnion
    ),
    candidate!(
        "detect_font_format",
        "unmapped_param(FontFormatData<'_>)",
        LifetimeData,
        BorrowedByteUnion
    ),
    candidate!(
        "detect_video_mime_type",
        "unmapped_param(VideoMimeTypeData<'_>)",
        LifetimeData,
        BorrowedByteUnion
    ),
    candidate!(
        "write_file_atomic",
        "unmapped_param(FileAtomicWriteData<'_>)",
        LifetimeData,
        BorrowedAtomicWriteUnion
    ),
    candidate!(
        "build_particle_color_curve",
        "unknown(build_particle_color_curve)",
        IteratorCollector,
        ColorCurveCallback
    ),
    candidate!(
        "collect_import_diagnostics",
        "unknown(collect_import_diagnostics)",
        IteratorCollector,
        DiagnosticCollectorCallback
    ),
    candidate!(
        "collect_scene2d_requirements",
        "unknown(collect_scene2d_requirements)",
        IteratorCollector,
        RequirementCollectorCallback
    ),
    candidate!(
        "for_each_path_segment",
        "unknown(for_each_path_segment)",
        IteratorCollector,
        PathSegmentCallback
    ),
    candidate!(
        "watch_geolocation_position",
        "closure_param(Option<Arc<dyn Fn(GeolocationErrorReason) + Send + Sync>>)",
        ClosureParam,
        OptionalEnumCallback
    ),
    candidate!(
        "connect_signal_at_frame_rate",
        "closure_return(Arc<dyn Fn() + Send + Sync>)",
        ClosureReturn,
        SignalConnectionReturn
    ),
    candidate!(
        "enable_scene3d_resource_failure_guards",
        "closure_return(Arc<dyn Fn() + Send + Sync>)",
        ClosureReturn,
        DisposerReturn
    ),
];

const EXTENSION_POLICY_SKIPS: &[&str] = &[
    "allocate_glyph_rasterizer_backend_from_glyph_outline_source",
    "create_filter_log_sink",
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
    "enable_log_signals",
    "init_bounds_rectangle_runtime_trait",
    "init_transform2d_runtime_trait",
    "initialize_glyph_rasterizer_backend_from_glyph_outline_source",
    "lerp_effect",
    "migrate_storage",
    "register_dragon_bones_section_handler",
    "register_dragon_bones_timeline_handler",
    "register_log_serializer",
    "register_rive_core_object_handler",
    "register_skeleton_2d_json_analyzer",
    "register_spine_binary_section_handler",
    "register_spine_binary_timeline_handler",
    "register_spine_json_section_handler",
    "register_spine_json_timeline_handler",
    "register_spine_skeleton_binary_parser",
    "set_log_sink",
];

const OWNERSHIP_POLICY_SKIPS: &[&str] = &[
    "build_tilemap_layers_from_tiled",
    "create_animation_clip",
    "create_animation_state_machine",
    "create_canvas_surface_from_native_handle",
    "create_fanout_log_sink",
    "create_skeleton_2d",
    "create_skin_2d",
    "explain_host_capability_slot",
    "get_memory_log_sink_entries",
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
    "report_import_diagnostic",
    "send_ipc_message",
    "transition_animation_state_machine",
    "write_binary_file_chunks",
];

const SAFETY_POLICY_SKIPS: &[&str] = &[
    "enable_clip_guards",
    "enable_statechart_guards",
    "get_connectivity_online",
];

const PRE_M_TOTAL_SOURCES: usize = 4083;
const PRE_M_GENERATED_SOURCES: usize = 3376;
const PRE_M_SKIPPED_SOURCES: usize = 707;
const PRE_M_PUBLIC_SOURCES: usize = 3488;
const PRE_M_NON_PUBLIC_SOURCES: usize = 595;
const MONOMORPHIZED_EXTRAS: usize = 97;
const BACKEND_SCAN_TOTAL_SOURCES: usize = 232;
const BACKEND_SCAN_GENERATED_SOURCES: usize = 167;
const BACKEND_SCAN_SKIPPED_SOURCES: usize = 65;
const BACKEND_SCAN_PUBLIC_SOURCES: usize = 230;
const BACKEND_SCAN_NON_PUBLIC_SOURCES: usize = 2;
const BACKEND_SCAN_MONOMORPHIZED_EXTRAS: usize = 8;
const BACKEND_SCAN_PUBLIC_POLICY_SKIPS: usize =
    BACKEND_SCAN_SKIPPED_SOURCES - BACKEND_SCAN_NON_PUBLIC_SOURCES;
// Item D adds one TypeScript-public source, `share_bitmap`, which generates. It is added to the
// totals here so the pre-M baseline and Task M's own delta stay exactly as recorded.
const ITEM_D_GENERATED_SOURCES: usize = 1;
// Item C scans flight-interaction, adding 60 TypeScript-public sources. 59 generate;
// `set_node_hit_area` consumes an owned `HitArea` that no wrapper produces, so it is an ownership
// policy skip.
const ITEM_C_INTERACTION_GENERATED_SOURCES: usize = 59;
const ITEM_C_INTERACTION_OWNERSHIP_POLICY_SKIPS: &[&str] = &["set_node_hit_area"];

fn outcome(candidate: &Candidate) -> Outcome {
    if candidate.function == "enable_scene3d_resource_failure_guards" {
        return Outcome::SafetyPolicySkip;
    }
    if matches!(candidate.group, Group::Behavior | Group::ImportContext) {
        return Outcome::ExtensionPolicySkip;
    }
    return Outcome::Generated;
}

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
    return (
        total.parse().unwrap(),
        generated.parse().unwrap(),
        skipped.strip_suffix(" skipped").unwrap().parse().unwrap(),
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
    return (
        total.parse().unwrap(),
        sources.parse().unwrap(),
        extras
            .strip_suffix(" monomorphized extras")
            .unwrap()
            .parse()
            .unwrap(),
    );
}

fn public_census(stats: &str) -> (usize, usize) {
    let line = stats.lines().nth(2).expect("FFI public census line");
    let line = line
        .strip_prefix("FFI public census: ")
        .expect("FFI public census prefix");
    let (public, non_public) = line
        .split_once(" TypeScript-public, ")
        .expect("public source census");
    return (
        public.parse().unwrap(),
        non_public
            .strip_suffix(" non-public")
            .unwrap()
            .parse()
            .unwrap(),
    );
}

fn skip_counts(stats: &str) -> BTreeMap<String, usize> {
    let mut counts = BTreeMap::new();
    for line in stats.lines() {
        let Some(rest) = line.strip_prefix("  skip:") else {
            continue;
        };
        let Some(separator) = rest.trim().find(' ') else {
            panic!("malformed skip census row {line}");
        };
        let rest = rest.trim();
        let count: usize = rest[..separator].parse().unwrap();
        let reason = rest[separator..].trim();
        assert!(counts.insert(reason.to_string(), count).is_none());
    }
    return counts;
}

fn policy_decisions(stats: &str) -> BTreeSet<String> {
    let expected = final_policy_decisions();
    return skip_counts(stats)
        .into_iter()
        .filter_map(|(reason, count)| {
            let is_policy = reason.starts_with("extension_policy_skip(")
                || reason.starts_with("ownership_policy_skip(")
                || reason.starts_with("safety_policy_skip(");
            if !is_policy || !expected.contains(&reason) {
                return None;
            }
            assert_eq!(count, 1, "policy decision must identify one source");
            Some(reason)
        })
        .collect();
}

fn baseline_policy_decisions() -> BTreeSet<String> {
    let mut expected = BTreeSet::new();
    for (category, names) in [
        ("extension_policy_skip", EXTENSION_POLICY_SKIPS),
        ("ownership_policy_skip", OWNERSHIP_POLICY_SKIPS),
        (
            "ownership_policy_skip",
            ITEM_C_INTERACTION_OWNERSHIP_POLICY_SKIPS,
        ),
        ("safety_policy_skip", SAFETY_POLICY_SKIPS),
    ] {
        for name in names {
            assert!(expected.insert(format!("{category}({name})")));
        }
    }
    return expected;
}

fn final_policy_decisions() -> BTreeSet<String> {
    let mut expected = baseline_policy_decisions();
    for candidate in TASK_M_CANDIDATES {
        let category = match outcome(candidate) {
            Outcome::Generated => continue,
            Outcome::ExtensionPolicySkip => "extension_policy_skip",
            Outcome::SafetyPolicySkip => "safety_policy_skip",
        };
        assert!(expected.insert(format!("{category}({})", candidate.function)));
    }
    return expected;
}

fn expected_actionable_reasons() -> BTreeMap<String, usize> {
    let mut expected = BTreeMap::new();
    for candidate in TASK_M_CANDIDATES {
        *expected.entry(candidate.reason.to_string()).or_default() += 1;
    }
    return expected;
}

fn actual_actionable_reasons(stats: &str) -> BTreeMap<String, usize> {
    return skip_counts(stats)
        .into_iter()
        .filter(|(reason, _)| {
            !reason.starts_with("no_ts_public_export(")
                && !reason.starts_with("sdk_internal_contract_export(")
                && !reason.starts_with("extension_policy_skip(")
                && !reason.starts_with("backend_behavior_policy_skip(")
                && !reason.starts_with("bracket_policy_skip(")
                && !reason.starts_with("native_layout_policy_skip(")
                && !reason.starts_with("nested_bracket_policy_skip(")
                && !reason.starts_with("ownership_policy_skip(")
                && !reason.starts_with("safety_policy_skip(")
                && !reason.starts_with("scoped_callback_policy_skip(")
                && !reason.starts_with("trait_carrier_policy_skip(")
        })
        .collect();
}

fn wrapper_block<'a>(wrappers: &'a str, symbol: &str) -> Option<&'a str> {
    let marker = format!("pub unsafe extern \"C\" fn {symbol}(");
    let start = wrappers.find(&marker)?;
    let rest = &wrappers[start..];
    let end = rest.find("\n}\n").map_or(rest.len(), |index| index + 3);
    return Some(&rest[..end]);
}

fn header_entry<'a>(header: &'a str, symbol: &str) -> Option<(&'a str, Option<&'a str>)> {
    let needle = format!(" {symbol}(");
    let lines: Vec<&str> = header.lines().collect();
    let index = lines.iter().position(|line| line.contains(&needle))?;
    let comment = index
        .checked_sub(1)
        .and_then(|previous| lines[previous].starts_with("/*").then_some(lines[previous]));
    return Some((lines[index], comment));
}

fn push_error(errors: &mut Vec<String>, condition: bool, message: impl FnOnce() -> String) {
    if !condition {
        errors.push(message());
    }
}

fn has_callback_pair(block: &str, prototype: &str) -> bool {
    return block.contains("_fn:")
        && block.contains("extern \"C\" fn(")
        && block.contains("_ctx: *mut std::ffi::c_void")
        && prototype.contains("(*")
        && prototype.matches("void *").count() >= 1;
}

fn assert_callback_contract(
    candidate: &Candidate,
    block: &str,
    prototype: &str,
    errors: &mut Vec<String>,
) {
    push_error(errors, has_callback_pair(block, prototype), || {
        format!(
            "{} does not expose a typed callback plus caller context",
            candidate.function
        )
    });
    push_error(
        errors,
        block.contains("catch_unwind") && block.contains("AssertUnwindSafe"),
        || {
            format!(
                "{} does not contain callback-triggered Rust unwinding",
                candidate.function
            )
        },
    );
}

#[test]
fn task_m_inventory_is_exact_unique_and_complete() {
    assert_eq!(TASK_M_CANDIDATES.len(), 52, "Task M inventory omission");
    assert_eq!(EXTENSION_POLICY_SKIPS.len(), 30);
    assert_eq!(OWNERSHIP_POLICY_SKIPS.len(), 27);
    assert_eq!(SAFETY_POLICY_SKIPS.len(), 3);
    assert_eq!(baseline_policy_decisions().len(), 61);
    assert_eq!(final_policy_decisions().len(), 102);

    let mut names = BTreeSet::new();
    for candidate in TASK_M_CANDIDATES {
        assert!(
            names.insert(candidate.function),
            "duplicate Task M inventory entry {}",
            candidate.function
        );
        assert!(!candidate.reason.is_empty());
    }
    let counts =
        TASK_M_CANDIDATES
            .iter()
            .fold(BTreeMap::<Group, usize>::new(), |mut counts, candidate| {
                *counts.entry(candidate.group).or_default() += 1;
                counts
            });
    assert_eq!(
        counts,
        BTreeMap::from([
            (Group::Behavior, 5),
            (Group::ClosureParam, 1),
            (Group::ClosureReturn, 2),
            (Group::ImportContext, 35),
            (Group::IteratorCollector, 4),
            (Group::LifetimeData, 4),
            (Group::NestedOption, 1),
        ])
    );
    assert_eq!(
        TASK_M_CANDIDATES
            .iter()
            .filter(|candidate| outcome(candidate) == Outcome::Generated)
            .count(),
        11
    );
    assert_eq!(
        TASK_M_CANDIDATES
            .iter()
            .filter(|candidate| outcome(candidate) == Outcome::ExtensionPolicySkip)
            .count(),
        40
    );
    assert_eq!(
        TASK_M_CANDIDATES
            .iter()
            .filter(|candidate| outcome(candidate) == Outcome::SafetyPolicySkip)
            .count(),
        1
    );
}

#[test]
fn task_m_pre_m_census_has_no_undocumented_public_gap() {
    let stats = generated_stats();
    let source = source_census(stats);
    let generated_additions = TASK_M_CANDIDATES
        .iter()
        .filter(|candidate| outcome(candidate) == Outcome::Generated)
        .count();
    let item_c_skipped = ITEM_C_INTERACTION_OWNERSHIP_POLICY_SKIPS.len();
    let total = PRE_M_TOTAL_SOURCES
        + ITEM_D_GENERATED_SOURCES
        + ITEM_C_INTERACTION_GENERATED_SOURCES
        + item_c_skipped
        + BACKEND_SCAN_TOTAL_SOURCES;
    let baseline_generated = PRE_M_GENERATED_SOURCES
        + ITEM_D_GENERATED_SOURCES
        + ITEM_C_INTERACTION_GENERATED_SOURCES
        + BACKEND_SCAN_GENERATED_SOURCES;
    let final_generated = baseline_generated + generated_additions;
    let final_skipped =
        PRE_M_SKIPPED_SOURCES + item_c_skipped - generated_additions + BACKEND_SCAN_SKIPPED_SOURCES;
    assert!(
        source
            == (
                total,
                baseline_generated,
                PRE_M_SKIPPED_SOURCES + item_c_skipped + BACKEND_SCAN_SKIPPED_SOURCES
            )
            || source == (total, final_generated, final_skipped),
        "Task M census drifted to an undeclared intermediate state: {source:?}"
    );
    assert_eq!(
        public_census(stats),
        (
            PRE_M_PUBLIC_SOURCES
                + ITEM_D_GENERATED_SOURCES
                + ITEM_C_INTERACTION_GENERATED_SOURCES
                + item_c_skipped
                + BACKEND_SCAN_PUBLIC_SOURCES,
            PRE_M_NON_PUBLIC_SOURCES + BACKEND_SCAN_NON_PUBLIC_SOURCES
        )
    );

    let skips = skip_counts(stats);
    assert_eq!(
        skips
            .iter()
            .filter(|(reason, _)| reason.starts_with("no_ts_public_export("))
            .map(|(_, count)| count)
            .sum::<usize>(),
        591 + BACKEND_SCAN_NON_PUBLIC_SOURCES
    );
    assert_eq!(
        skips
            .iter()
            .filter(|(reason, _)| reason.starts_with("sdk_internal_contract_export("))
            .map(|(_, count)| count)
            .sum::<usize>(),
        4
    );
    let actionable = actual_actionable_reasons(stats);
    if source.1 == baseline_generated {
        assert_eq!(policy_decisions(stats), baseline_policy_decisions());
        assert_eq!(actionable, expected_actionable_reasons());
        assert_eq!(actionable.values().sum::<usize>(), 52);
    } else {
        assert_eq!(policy_decisions(stats), final_policy_decisions());
        assert!(actionable.is_empty(), "Task M left actionable skips");
    }
    assert_eq!(
        source.2 - PRE_M_NON_PUBLIC_SOURCES - BACKEND_SCAN_NON_PUBLIC_SOURCES,
        policy_decisions(stats).len()
            + actionable.values().sum::<usize>()
            + BACKEND_SCAN_PUBLIC_POLICY_SKIPS,
        "every TypeScript-public skip must be named policy or Task M actionable"
    );
}

#[test]
fn task_m_final_public_skip_set_is_only_named_policy() {
    let stats = generated_stats();
    let generated_additions = TASK_M_CANDIDATES
        .iter()
        .filter(|candidate| outcome(candidate) == Outcome::Generated)
        .count();
    let item_c_skipped = ITEM_C_INTERACTION_OWNERSHIP_POLICY_SKIPS.len();
    let expected_generated = PRE_M_GENERATED_SOURCES
        + ITEM_D_GENERATED_SOURCES
        + ITEM_C_INTERACTION_GENERATED_SOURCES
        + generated_additions
        + BACKEND_SCAN_GENERATED_SOURCES;
    let expected_skipped =
        PRE_M_SKIPPED_SOURCES + item_c_skipped - generated_additions + BACKEND_SCAN_SKIPPED_SOURCES;
    assert_eq!(
        source_census(stats),
        (
            PRE_M_TOTAL_SOURCES
                + ITEM_D_GENERATED_SOURCES
                + ITEM_C_INTERACTION_GENERATED_SOURCES
                + item_c_skipped
                + BACKEND_SCAN_TOTAL_SOURCES,
            expected_generated,
            expected_skipped
        ),
        "EXPECTED PRE-M TASK M ACCEPTANCE FAILURE: all 11 actionable carriers must generate"
    );
    assert_eq!(
        wrapper_census(stats),
        (
            expected_generated + MONOMORPHIZED_EXTRAS + BACKEND_SCAN_MONOMORPHIZED_EXTRAS,
            expected_generated,
            MONOMORPHIZED_EXTRAS + BACKEND_SCAN_MONOMORPHIZED_EXTRAS,
        ),
        "Task M must not change the monomorphized wrapper extras"
    );
    assert_eq!(policy_decisions(stats), final_policy_decisions());
    assert!(
        actual_actionable_reasons(stats).is_empty(),
        "Task M actionable skip count must be zero"
    );
    assert_eq!(
        expected_skipped - PRE_M_NON_PUBLIC_SOURCES - BACKEND_SCAN_NON_PUBLIC_SOURCES,
        final_policy_decisions().len() + BACKEND_SCAN_PUBLIC_POLICY_SKIPS,
        "final TypeScript-public skip set must equal named by-design policy"
    );
}

#[test]
fn task_m_generated_surface_satisfies_every_carrier_contract() {
    let wrappers = generated_wrappers();
    let header = generated_header();
    let mut errors = Vec::new();

    for candidate in TASK_M_CANDIDATES {
        let symbol = format!("flight_{}", candidate.function);
        let marker = format!("fn {symbol}(");
        if outcome(candidate) != Outcome::Generated {
            let category = match outcome(candidate) {
                Outcome::ExtensionPolicySkip => "extension_policy_skip",
                Outcome::SafetyPolicySkip => "safety_policy_skip",
                Outcome::Generated => unreachable!(),
            };
            push_error(
                &mut errors,
                wrappers.matches(&marker).count() == 0
                    && header_entry(header, &symbol).is_none()
                    && generated_stats().contains(&format!("{category}({})", candidate.function)),
                || {
                    format!(
                        "{} must remain a named {category} decision",
                        candidate.function
                    )
                },
            );
            continue;
        }
        push_error(&mut errors, wrappers.matches(&marker).count() == 1, || {
            format!("{} must emit exactly one wrapper", candidate.function)
        });
        let Some(block) = wrapper_block(wrappers, &symbol) else {
            continue;
        };
        let Some((prototype, comment)) = header_entry(header, &symbol) else {
            errors.push(format!(
                "{} is absent from the strict-C header",
                candidate.function
            ));
            continue;
        };

        match candidate.contract {
            Contract::BorrowedContext => {
                push_error(
                    &mut errors,
                    block
                        .lines()
                        .next()
                        .is_some_and(|line| line.contains(": *mut"))
                        && block.contains("unsafe { &mut *")
                        && !block.contains("Box::from_raw"),
                    || {
                        format!(
                            "{} does not borrow its mutable import context for the call",
                            candidate.function
                        )
                    },
                );
                push_error(
                    &mut errors,
                    prototype.contains("void *") && !prototype.contains("ownership transferred"),
                    || {
                        format!(
                            "{} header does not expose a borrowed context",
                            candidate.function
                        )
                    },
                );
            }
            Contract::OptionalScalarCallback | Contract::OptionalStringCallback => {
                assert_callback_contract(candidate, block, prototype, &mut errors);
                push_error(
                    &mut errors,
                    block.contains("Option<extern \"C\" fn(")
                        && block.contains("match")
                        && block.contains("None => None"),
                    || format!("{} loses its nullable callback state", candidate.function),
                );
                if matches!(candidate.contract, Contract::OptionalStringCallback) {
                    push_error(
                        &mut errors,
                        block.contains("CString") || block.contains("c_char"),
                        || format!("{} does not lower callback text to C", candidate.function),
                    );
                }
            }
            Contract::OptionalBehaviorVTable => {
                push_error(
                    &mut errors,
                    block.contains("VTable")
                        && block.contains("context")
                        && block.contains("catch_unwind"),
                    || {
                        format!(
                            "{} lacks a context-bearing, unwind-contained behavior vtable",
                            candidate.function
                        )
                    },
                );
                push_error(
                    &mut errors,
                    prototype.contains("VTable") && prototype.contains("void *"),
                    || format!("{} header lacks its behavior vtable", candidate.function),
                );
            }
            Contract::OptionalLayoutResolver => {
                assert_callback_contract(candidate, block, prototype, &mut errors);
                push_error(
                    &mut errors,
                    block.contains("out_ptr")
                        && block.contains("out_len")
                        && block.contains("intrinsic_sizes"),
                    || format!("{} loses resolver slice bounds", candidate.function),
                );
            }
            Contract::NestedOptionalString => {
                push_error(
                    &mut errors,
                    block.contains(": bool")
                        && block.contains("*const std::ffi::c_char")
                        && block.contains("Some(None)")
                        && block.contains("Some(Some(")
                        && block.contains("None"),
                    || {
                        format!(
                            "{} does not preserve absent, null, and string states",
                            candidate.function
                        )
                    },
                );
                push_error(
                    &mut errors,
                    prototype.contains("bool") && prototype.contains("const char *"),
                    || {
                        format!(
                            "{} header collapses nested optional state",
                            candidate.function
                        )
                    },
                );
            }
            Contract::BorrowedByteUnion => {
                push_error(
                    &mut errors,
                    (block.contains("data: *const u8") || block.contains("data_ptr: *const u8"))
                        && block.contains("data_len: usize")
                        && block.contains("ffi_slice_from_raw_parts")
                        && !block.contains("Box::from_raw(data"),
                    || {
                        format!(
                            "{} does not borrow an explicitly bounded byte carrier",
                            candidate.function
                        )
                    },
                );
                push_error(
                    &mut errors,
                    prototype.contains("const uint8_t *") && prototype.contains("size_t"),
                    || format!("{} header lacks a bounded byte carrier", candidate.function),
                );
                push_error(
                    &mut errors,
                    comment.is_some_and(|line| line.contains("flight_free_string")),
                    || format!("{} header loses owned MIME/format text", candidate.function),
                );
            }
            Contract::BorrowedAtomicWriteUnion => {
                push_error(
                    &mut errors,
                    block.contains("data_kind")
                        && (block.contains("data: *const u8")
                            || block.contains("data_ptr: *const u8"))
                        && block.contains("data_len")
                        && block.contains("catch_unwind")
                        && !block.contains("Box::from_raw(data"),
                    || {
                        format!(
                            "{} does not preserve a borrowed tagged write payload",
                            candidate.function
                        )
                    },
                );
                push_error(
                    &mut errors,
                    prototype.contains("uint32_t")
                        && prototype.contains("const uint8_t *")
                        && prototype.contains("size_t"),
                    || {
                        format!(
                            "{} header lacks a tagged bounded payload",
                            candidate.function
                        )
                    },
                );
            }
            Contract::ColorCurveCallback
            | Contract::DiagnosticCollectorCallback
            | Contract::RequirementCollectorCallback
            | Contract::PathSegmentCallback => {
                assert_callback_contract(candidate, block, prototype, &mut errors);
                match candidate.contract {
                    Contract::ColorCurveCallback => {
                        push_error(
                            &mut errors,
                            block.contains("*mut f32")
                                && wrappers
                                    .contains("fn flight_build_particle_color_curve_result_len(")
                                && wrappers
                                    .contains("fn flight_build_particle_color_curve_result_get(")
                                && wrappers
                                    .contains("fn flight_build_particle_color_curve_result_free("),
                            || {
                                "build_particle_color_curve lacks RGB callback output or owned result accessors"
                                    .to_string()
                            },
                        );
                    }
                    Contract::DiagnosticCollectorCallback => {
                        push_error(
                            &mut errors,
                            block.contains("FfiImportDiagnosticList")
                                && block
                                    .lines()
                                    .next()
                                    .is_some_and(|line| line.contains("-> bool")),
                            || {
                                "collect_import_diagnostics does not reuse the caller-owned diagnostic list"
                                    .to_string()
                            },
                        );
                    }
                    Contract::RequirementCollectorCallback => {
                        push_error(
                            &mut errors,
                            block.contains("Requirement")
                                && block.contains("Box::into_raw")
                                && comment.is_some_and(|line| line.contains("Caller owns")),
                            || {
                                "collect_scene2d_requirements lacks a callback-borrowed list and owned result"
                                    .to_string()
                            },
                        );
                    }
                    Contract::PathSegmentCallback => {
                        push_error(
                            &mut errors,
                            prototype.contains("uint32_t")
                                && prototype.matches("double").count() >= 6
                                && block
                                    .lines()
                                    .next()
                                    .is_some_and(|line| line.contains("-> bool")),
                            || {
                                "for_each_path_segment lacks kind plus six-coordinate callback ABI"
                                    .to_string()
                            },
                        );
                    }
                    _ => unreachable!(),
                }
            }
            Contract::OptionalEnumCallback => {
                assert_callback_contract(candidate, block, prototype, &mut errors);
                push_error(
                    &mut errors,
                    block.contains("Option<extern \"C\" fn(")
                        && prototype.contains("uint32_t")
                        && block.matches("_ctx: *mut std::ffi::c_void").count() >= 2
                        && block.contains("as usize"),
                    || {
                        format!(
                            "{} loses nullable enum callback semantics",
                            candidate.function
                        )
                    },
                );
            }
            // Item C: the frame-rate connection shares the signal connection teardown contract.
            Contract::SignalConnectionReturn => {
                push_error(
                    &mut errors,
                    has_callback_pair(block, prototype)
                        && block
                            .contains("release_fn: Option<extern \"C\" fn(*mut std::ffi::c_void)>")
                        && block.contains("Box::into_raw(Box::new(connection))")
                        && !block.contains("FfiDisposer"),
                    || {
                        format!(
                            "{} does not return an owned signal connection",
                            candidate.function
                        )
                    },
                );
                push_error(
                    &mut errors,
                    comment.is_some_and(|line| line.contains("flight_free_signal_connection"))
                        && prototype.starts_with("void *"),
                    || {
                        format!(
                            "{} header lacks signal connection ownership",
                            candidate.function
                        )
                    },
                );
            }
            Contract::DisposerReturn => {
                push_error(
                    &mut errors,
                    block.contains("Box::into_raw(Box::new(FfiDisposer"),
                    || format!("{} does not return an owned disposer", candidate.function),
                );
                push_error(
                    &mut errors,
                    comment.is_some_and(|line| line.contains("flight_free_disposer"))
                        && prototype.starts_with("void *"),
                    || format!("{} header lacks disposer ownership", candidate.function),
                );
            }
        }
    }

    push_error(
        &mut errors,
        wrappers.contains("fn flight_call_disposer(")
            && wrappers.contains("fn flight_free_disposer(")
            && wrappers.contains("catch_unwind(std::panic::AssertUnwindSafe(|| dispose()))"),
        || "returned disposer support must invoke safely and free independently".to_string(),
    );
    if !errors.is_empty() {
        panic!(
            "EXPECTED PRE-M TASK M ACCEPTANCE FAILURE ({} issue(s)):\n{}",
            errors.len(),
            errors.join("\n")
        );
    }
}
