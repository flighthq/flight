mod native_bindings;
mod public_perimeter;
use std::collections::{BTreeMap, BTreeSet};
use std::env;
use std::fmt::Write as _;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

// `#[repr(u32)]` unit enums by name, each with its owning crate and variants in declaration order.
// A name two crates both define is not known: an enum's identity is its owning crate plus name, so
// a same-named enum elsewhere can never stand in for it.
static KNOWN_ENUMS: OnceLock<BTreeMap<String, KnownEnum>> = OnceLock::new();

#[derive(Debug)]
struct KnownEnum {
    owner: String,
    variants: Vec<String>,
}

fn known_enum_name(ty: &str) -> Option<String> {
    fn resolve(ty: &str, depth: usize) -> Option<String> {
        if depth > 8 {
            return None;
        }
        if KNOWN_ENUMS
            .get()
            .is_some_and(|enums| enums.contains_key(ty))
        {
            return Some(ty.to_string());
        }
        let definitions = TYPE_DEFINITIONS.get()?.get(ty)?;
        let mut names = definitions.iter().map(|(_, definition)| match definition {
            TypeDefinition::Alias(target) => resolve(target, depth + 1),
            TypeDefinition::Nominal { .. } | TypeDefinition::GenericAlias => None,
        });
        let first = names.next()??;
        names
            .all(|name| name.as_ref() == Some(&first))
            .then_some(first)
    }

    resolve(ty, 0)
}

fn is_known_enum(ty: &str) -> bool {
    known_enum_name(ty).is_some()
}

// `ffi_enum_from_u32!(value, [Enum::A, Enum::B])` over every variant of the known enum `ty`.
fn get_enum_conversion(ty: &str, value: &str) -> String {
    let known_name = known_enum_name(ty).unwrap();
    let known = &KNOWN_ENUMS.get().unwrap()[&known_name];
    let qualified = qualify_type(ty);
    let variants: Vec<String> = known
        .variants
        .iter()
        .map(|variant| format!("{qualified}::{variant}"))
        .collect();
    format!("ffi_enum_from_u32!({value}, [{}])", variants.join(", "))
}

// A Rust binding name for a parameter, without the raw-identifier prefix (`r#type` -> `type`).
fn get_binding_name(name: &str) -> String {
    name.trim_start_matches("r#")
        .trim_start_matches('_')
        .to_string()
}

// Every named type's definitions, from source, for by-value ownership; each is flagged with whether
// its crate root re-exports it by name, which picks the SDK's meaning when two crates share a name.
static TYPE_DEFINITIONS: OnceLock<BTreeMap<String, Vec<(bool, TypeDefinition)>>> = OnceLock::new();

// Exact Rust types C can hold as an owned box because some generated wrapper produces that box.
// The set is discovered to a fixed point before emission: a consumer can depend on a producer, but
// a cycle of consumers can never invent its own initial handle.
static PRODUCIBLE_TYPES: OnceLock<Mutex<BTreeSet<String>>> = OnceLock::new();

#[derive(Clone, Debug, PartialEq)]
enum TypeDefinition {
    // A struct or enum and whether its derive list includes `Copy`.
    Nominal { copy: bool },
    // A non-generic `pub type` alias and its target.
    Alias(String),
    // A generic alias, whose by-value ownership the generator does not reason about.
    GenericAlias,
}

// How a by-value parameter of a named type crosses the C ABI (agents/ffi-public-lane.md).
#[derive(Clone, Copy, Debug, PartialEq)]
enum OwnedParam {
    // `Copy`: read from the caller's pointer; the caller keeps its value.
    Copied,
    // A `Ref`/`Arc` handle: cloned from the caller's borrowed handle; the caller keeps its handle.
    Cloned,
    // Non-`Copy`: the caller's FFI-owned box is consumed and must not be used again.
    Transferred,
}

const QUALIFIER: &str = "flight_sdk";

const SCAN_CRATES: &[&str] = &[
    "flight-abc",
    "flight-accessibility",
    "flight-adjustments",
    "flight-animation",
    "flight-app",
    "flight-assets",
    "flight-audio",
    "flight-binpack",
    "flight-bitmap",
    "flight-bitmapfont",
    "flight-bitmapfont-formats",
    "flight-bitmaptext",
    "flight-buffer",
    "flight-camera",
    "flight-camera-controls",
    "flight-capture",
    "flight-clip",
    "flight-clipboard",
    "flight-clock",
    "flight-collision",
    "flight-color",
    "flight-command",
    "flight-compression",
    "flight-connectivity",
    "flight-debug",
    "flight-device",
    "flight-dialog",
    "flight-easing",
    "flight-effects",
    "flight-encoding",
    "flight-entity",
    "flight-filesystem",
    "flight-flow",
    "flight-font",
    "flight-font-formats",
    "flight-geolocation",
    "flight-geometry",
    "flight-gizmo",
    "flight-glyphatlas",
    "flight-gui",
    "flight-haptics",
    "flight-host",
    "flight-image",
    "flight-image-codec",
    "flight-importdiagnostics",
    "flight-input",
    "flight-intl",
    "flight-ipc",
    "flight-keyboard",
    "flight-layout",
    "flight-lifecycle",
    "flight-lighting",
    "flight-loader",
    "flight-log",
    "flight-materials",
    "flight-math",
    "flight-media",
    "flight-mediasession",
    "flight-menu",
    "flight-meshgeometry",
    "flight-midi",
    "flight-motionpath",
    "flight-movieclip",
    "flight-net",
    "flight-node",
    "flight-notification",
    "flight-particleemitter",
    "flight-particles",
    "flight-particles-formats",
    "flight-path",
    "flight-path-boolean",
    "flight-path-formats",
    "flight-permissions",
    "flight-physics2d",
    "flight-physics2d-abi",
    "flight-physics3d",
    "flight-physics3d-abi",
    "flight-picking",
    "flight-platform",
    "flight-power",
    "flight-preferences",
    "flight-protocol",
    "flight-quadbatch",
    "flight-regexp",
    "flight-registry",
    "flight-render",
    "flight-requirement",
    "flight-requirement-catalog",
    "flight-requirement-codegen",
    "flight-resource",
    "flight-scene-document",
    "flight-scene2d",
    "flight-scene2d-formats",
    "flight-scene2d-resources",
    "flight-scene3d",
    "flight-scene3d-formats",
    "flight-scene3d-resources",
    "flight-screen",
    "flight-selection",
    "flight-sensors",
    "flight-shading",
    "flight-shape",
    "flight-shape-formats",
    "flight-share",
    "flight-shell",
    "flight-shortcut",
    "flight-signals",
    "flight-skeleton2d",
    "flight-skeleton2d-formats",
    "flight-skeleton3d",
    "flight-snapshot",
    "flight-socket",
    "flight-spatial",
    "flight-spring",
    "flight-spritesheet",
    "flight-spritesheet-formats",
    "flight-statechart",
    "flight-statusbar",
    "flight-stream",
    "flight-surface",
    "flight-swf",
    "flight-text",
    "flight-text-markup",
    "flight-textbidi",
    "flight-textformat",
    "flight-textinput",
    "flight-textlayout",
    "flight-textsegment",
    "flight-textshaper",
    "flight-texture",
    "flight-texture-formats",
    "flight-textureatlas",
    "flight-textureatlas-formats",
    "flight-tilemap",
    "flight-tilemap-formats",
    "flight-timeline",
    "flight-tokens",
    "flight-tray",
    "flight-tween",
    "flight-updater",
    "flight-useragent",
    "flight-velocity",
    "flight-video",
    "flight-xml",
];

const DYN_OPAQUE_TRAITS: &[(&str, &str)] = &[
    ("Node", "NodeRef"),
    ("Node2D", "Node2DRef"),
    ("Node3D", "Node3DRef"),
    ("Surface", "SurfaceRef"),
    ("TextureSource", "TextureSourceRef"),
];

const DYN_MONO_TRAITS: &[(&str, &[&str])] = &[
    (
        "Material",
        &[
            "Material2DFields",
            "Material3DFields",
            "MaterialFields",
            "ShadedMaterial",
            "StandardMaterial",
        ],
    ),
    ("Material3D", &["Material3DFields"]),
    ("TextureVariant", &["Texture"]),
    ("TextureUvTransform", &["Texture"]),
    (
        "Adjustment",
        &[
            "BrightnessContrastAdjustment",
            "ChannelMixerAdjustment",
            "ColorBlindSimulationAdjustment",
            "ColorGradeAdjustment",
            "ColorMatrixAdjustment",
            "ColorScaleBiasAdjustment",
            "ExposureAdjustment",
            "GrayscaleAdjustment",
            "HueSaturationAdjustment",
            "InvertAdjustment",
            "LiftGammaGainAdjustment",
            "LookupTableGradeAdjustment",
            "SepiaAdjustment",
            "TintAdjustment",
        ],
    ),
    (
        "Modifier",
        &[
            "AnimatedNormalModifier",
            "DissolveModifier",
            "EmissiveModifier",
            "EnvReflectModifier",
            "FogModifier",
            "RimModifier",
            "ToonModifier",
            "VertexDisplaceModifier",
        ],
    ),
    (
        "Light",
        &[
            "AmbientLight",
            "DirectionalLight",
            "Environment",
            "HemisphereLight",
        ],
    ),
    ("PunctualLight", &["PointLight", "SpotLight"]),
    (
        "PhotometricLightLike",
        &["AmbientLight", "DirectionalLight", "HemisphereLight"],
    ),
    (
        "Skeleton2DConstraint",
        &[
            "Skeleton2DIkConstraint",
            "Skeleton2DPathConstraint",
            "Skeleton2DTransformConstraint",
        ],
    ),
    (
        "Physics2DJoint",
        &[
            "Physics2DDistanceJoint",
            "Physics2DGearJoint",
            "Physics2DMouseJoint",
            "Physics2DPrismaticJoint",
            "Physics2DPulleyJoint",
            "Physics2DRevoluteJoint",
            "Physics2DRopeJoint",
            "Physics2DWeldJoint",
            "Physics2DWheelJoint",
        ],
    ),
    (
        "Physics3DJoint",
        &[
            "Physics3DBallAndSocketJoint",
            "Physics3DConeTwistJoint",
            "Physics3DDistanceJoint",
            "Physics3DFixedJoint",
            "Physics3DGeneric6DofJoint",
            "Physics3DHingeJoint",
            "Physics3DSliderJoint",
        ],
    ),
];

// Provider future aliases (`Pin<Box<dyn Future<Output = ...> + Send>>`) that cross the ABI as a
// completion callback. `true` marks an alias whose output is `Result<T, FlightError>`; the callback
// receives `T` and a null error, or the empty carrier and an owned error string.
const ASYNC_FUTURE_ALIASES: &[(&str, bool)] = &[
    ("AppProviderFuture", true),
    ("DialogProviderFuture", true),
    ("FileSystemProviderFuture", true),
    ("TrayFuture", false),
    ("VideoProviderFuture", true),
];

// Behavior-bearing values with established Arc or borrowed-slice carriers. The outer carrier owns
// the lifetime contract; bare callback/guard wrappers remain excluded below.
const EXTENSION_POINT_TYPES: &[&str] = &[
    "GlyphOutlineSource",
    "RiveCoreObjectHandler",
    "SpritesheetFormatEntry",
    "StorageMigration",
    "TextureAtlasFormatEntry",
];
const OPAQUE_FALLBACK_EXCLUDED_TYPES: &[&str] = &[
    "BitmapTextMissingGlyphGuard",
    "FileDialogHandleOperations",
    "LayoutResolver",
    "LogDataOrProvider",
    "TextInputCopyCallback",
];
// Plain Clone data handles whose visible producer is borrowed. These cross by cloning from a
// caller-retained pointer, never by reconstructing ownership with Box::from_raw.
const CALLER_RETAINED_CLONE_TYPES: &[&str] = &["ParticleFormatCodec"];
const SAFETY_POLICY_SKIP_FNS: &[&str] = &[
    "enable_clip_guards",
    "enable_statechart_guards",
    // The capability contains a host-supplied Arc<dyn Fn>; C cannot construct it soundly.
    "get_connectivity_online",
];
// Public extension points whose behavior values cannot be authored by C or HashLink. The plural
// bulk registration functions are deliberately not here: they consume no caller behavior and
// install only SDK-owned handlers.
const EXTENSION_POLICY_SKIP_FNS: &[&str] = &[
    "allocate_glyph_rasterizer_backend_from_glyph_outline_source",
    "create_filter_log_sink",
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
// Import handler functions receive parser-owned mutable contexts whose lifetimes, invariants and
// private backing state never cross the public ABI. They are behavior registrations used by the
// SDK's built-in import pipelines, not standalone data transformations C can invoke safely.
const IMPORT_HANDLER_POLICY_SKIP_FNS: &[&str] = &[
    "lottie_additive_mask_handler",
    "lottie_ellipse_shape_item_handler",
    "lottie_fill_shape_item_handler",
    "lottie_gradient_fill_shape_item_handler",
    "lottie_gradient_stroke_shape_item_handler",
    "lottie_image_layer_handler",
    "lottie_null_layer_handler",
    "lottie_path_shape_item_handler",
    "lottie_polystar_shape_item_handler",
    "lottie_precomposition_layer_handler",
    "lottie_rectangle_shape_item_handler",
    "lottie_shape_layer_handler",
    "lottie_solid_layer_handler",
    "lottie_stroke_shape_item_handler",
    "lottie_text_layer_handler",
    "lottie_trim_path_shape_item_handler",
    "skip_spine_binary_animations_section",
    "skip_spine_binary_bone_timelines",
    "skip_spine_binary_deform_timelines",
    "skip_spine_binary_draw_order_timeline",
    "skip_spine_binary_event_timelines",
    "skip_spine_binary_events_section",
    "skip_spine_binary_ik_constraints_section",
    "skip_spine_binary_ik_timelines",
    "skip_spine_binary_path_constraints_section",
    "skip_spine_binary_path_timelines",
    "skip_spine_binary_slot_timelines",
    "skip_spine_binary_transform_constraints_section",
    "skip_spine_binary_transform_timelines",
    "svg_container_element_handler",
    "svg_geometry_element_handler",
    "svg_image_element_handler",
    "svg_path_clip_handler",
    "svg_text_element_handler",
    "svg_use_element_handler",
];
// These public functions install or retain caller-authored behavior objects. Their surrounding
// data handles do not turn those callbacks, provider operations or function pointers into plain
// data, so a generic opaque fallback would erase the lifetime and teardown contract.
const BEHAVIOR_POLICY_SKIP_FNS: &[&str] = &[
    "create_file_dialog_handle",
    "dispatch_selectable_rich_text_key_down",
    "dispatch_text_input_key_down",
    "register_layout_resolver",
    "set_bitmap_text_missing_glyph_guard",
];
// This opt-in diagnostic guard retains a caller-supplied live clock and returns guard teardown.
// It is an extension boundary, unlike the immediate consumption callbacks Task M lowers below.
const GUARD_POLICY_SKIP_FNS: &[&str] = &["enable_scene3d_resource_failure_guards"];
// Task M's retained callback has an explicit teardown path: its returned disposer disconnects the
// signal slot, after which C may release the callback context and free the disposer handle.
const RETAINED_CALLBACK_DISPOSER_FNS: &[&str] = &["connect_signal_at_frame_rate"];
// The default shape-bounds handler values: each decodes one command's arguments from a
// `&dyn ShapeCommandArgumentCursor` into calls on a `&mut dyn ShapeBoundsContext`. Their purpose is
// to compose `ShapeBoundsCommand` registrations, an extension point. The only cursor implementation
// is private to flight-shape and no wrapper yields `ShapeCommandToken` storage, so C could supply a
// cursor only as its own behavior object, and the call would route caller data to caller callbacks.
const SHAPE_BOUNDS_HANDLER_FNS: &[&str] = &[
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
// These APIs need a complete typed ownership family before they can cross the ABI. A bare
// `void *` neither proves where a Vec<LogSink> came from nor gives LogEntry collectors a lifecycle.
const OWNERSHIP_POLICY_SKIP_FNS: &[&str] =
    &["create_fanout_log_sink", "get_memory_log_sink_entries"];
// The SDK compatibility barrel deliberately promotes these leading-underscore font helpers for
// SDK assembly. They remain internal async host plumbing rather than caller-facing ABI. Inventory
// them as source decisions so the barrel cannot silently enlarge or bypass the public perimeter.
const SDK_INTERNAL_CONTRACT_EXPORT_FNS: &[&str] = &[
    "_load_font_face_from_bytes",
    "_load_font_face_from_url",
    "_load_font_face_from_urls",
    "_load_font_faces_from_name",
];

fn explicit_skip_category(name: &str) -> Option<&'static str> {
    if SAFETY_POLICY_SKIP_FNS.contains(&name) || GUARD_POLICY_SKIP_FNS.contains(&name) {
        return Some("safety_policy_skip");
    }
    if EXTENSION_POLICY_SKIP_FNS.contains(&name)
        || SHAPE_BOUNDS_HANDLER_FNS.contains(&name)
        || IMPORT_HANDLER_POLICY_SKIP_FNS.contains(&name)
        || BEHAVIOR_POLICY_SKIP_FNS.contains(&name)
    {
        return Some("extension_policy_skip");
    }
    if OWNERSHIP_POLICY_SKIP_FNS.contains(&name) {
        return Some("ownership_policy_skip");
    }
    if SDK_INTERNAL_CONTRACT_EXPORT_FNS.contains(&name) {
        return Some("sdk_internal_contract_export");
    }
    None
}
// Public-function `#[repr(u32)]` unit enums that their crate roots do not re-export, as (enum, SDK
// module). They cross as `u32`, so naming them through the crate's contract module exposes only the
// discriminant, never a contract-lane handle.
const CONTRACT_LANE_ENUMS: &[(&str, &str)] = &[
    ("SpreadMethod", "shape"),
    ("SpritesheetParseDiagnosticSeverity", "spritesheet"),
];
// Public package functions can mention contract-lane types that their package root intentionally
// does not re-export. The SDK mirrors every package as a module, so these types remain nameable
// without widening the SDK root lane.
const CONTRACT_LANE_TYPES: &[(&str, &str)] = &[
    ("AdjustmentRef", "node"),
    ("Attachment2DRef", "skeleton2d"),
    ("AttachmentSkin2D", "skeleton2d"),
    ("BidiClassKernel", "textbidi"),
    ("BidiClassKernelExplanation", "textbidi"),
    ("BidiDirection", "textbidi"),
    ("BidiRun", "textbidi"),
    ("Bone2D", "skeleton2d"),
    ("BoundingBoxAttachment2D", "skeleton2d"),
    ("ClippingAttachment2D", "skeleton2d"),
    ("MarkupTagHandler", "text_markup"),
    ("MarkupTagRegistry", "text_markup"),
    ("MeshAttachment2D", "skeleton2d"),
    ("PathAttachment2D", "skeleton2d"),
    ("PathMeshPool", "path"),
    ("PathMorphBuildResult", "path"),
    ("PointAttachment2D", "skeleton2d"),
    ("RegionAttachment2D", "skeleton2d"),
    ("ShapeGeometryEnd", "shape"),
    ("ShapeJsonFormatOptions", "shape_formats"),
    ("ShapeJsonParseOptions", "shape_formats"),
    ("Skeleton2DClippingAttachmentSlotRange", "skeleton2d"),
    ("Skeleton2DCoercedInterpolation", "skeleton2d"),
    ("Skeleton2DConstraintSolver", "skeleton2d"),
    ("Skeleton2DGuardState", "skeleton2d"),
    ("Slot2D", "skeleton2d"),
    ("StrokePathGeometry", "path"),
    ("SwfAdjustmentRef", "swf"),
    ("SwfGuardStateRef", "swf"),
    ("SwfReader", "swf"),
    ("TextLayoutContext", "text"),
    ("TextLayoutMeasureState", "textlayout"),
    ("TextMarkupExplanation", "text_markup"),
    ("TextMarkupGuardState", "text_markup"),
];
fn main() {
    // The C consumer test builds and links its executable with the same target and rustc Cargo
    // builds this crate with.
    println!(
        "cargo::rustc-env=FLIGHT_FFI_TARGET={}",
        env::var("TARGET").unwrap()
    );
    println!(
        "cargo::rustc-env=FLIGHT_FFI_HOST={}",
        env::var("HOST").unwrap()
    );
    println!(
        "cargo::rustc-env=FLIGHT_FFI_RUSTC={}",
        env::var("RUSTC").unwrap()
    );

    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let crates_dir = manifest_dir.parent().unwrap();
    let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());

    let mut all_output = String::from("use flight_sdk;\n\n");
    all_output.push_str(generate_checked_slice_support());
    all_output.push_str(generate_shape_bounds_context_support());
    all_output.push_str(generate_owned_byte_reader_support());
    let mut boxed_types: BTreeSet<String> = BTreeSet::new();
    let mut vec_ref_handle_specs: BTreeSet<VecRefHandleSpec> = BTreeSet::new();
    let mut seen_names: BTreeSet<String> = BTreeSet::new();
    let mut stats_total_fns = 0usize;
    let mut stats_public_fns = 0usize;
    let mut stats_non_public_fns = 0usize;
    let mut stats_generated_sources = 0usize;
    let mut stats_generated_wrappers = 0usize;
    let mut stats_sdk_contract_decisions = BTreeMap::new();
    let mut stats_public_skips = BTreeMap::new();
    let mut stats_skipped: std::collections::BTreeMap<String, usize> =
        std::collections::BTreeMap::new();

    let mut enum_definitions: BTreeMap<String, Vec<KnownEnum>> = BTreeMap::new();
    let mut type_definitions = BTreeMap::new();
    for dir_name in SCAN_CRATES {
        let src_dir = crates_dir.join(dir_name).join("src");
        if !src_dir.exists() {
            continue;
        }
        let lib_path = src_dir.join("lib.rs");
        let exported_types = if lib_path.exists() {
            collect_exported_type_names(&lib_path, &src_dir)
        } else {
            BTreeSet::new()
        };
        let mut entries: Vec<_> = fs::read_dir(&src_dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| {
                e.path().extension().is_some_and(|ext| ext == "rs")
                    && !e.file_name().to_string_lossy().contains("test")
            })
            .collect();
        entries.sort_by_key(|e| e.file_name());
        for entry in entries {
            let fname = entry.file_name().to_string_lossy().to_string();
            if fname == "contract.rs" || fname == "lib.rs" {
                continue;
            }
            let content = fs::read_to_string(entry.path()).unwrap();
            parse_simple_enums(&content, dir_name, &mut enum_definitions);
            parse_type_definitions(&content, &exported_types, &mut type_definitions);
        }
    }
    let known_enums: BTreeMap<String, KnownEnum> = enum_definitions
        .into_iter()
        .filter_map(|(name, mut definitions)| {
            (definitions.len() == 1).then(|| (name, definitions.remove(0)))
        })
        .collect();
    for (name, module) in CONTRACT_LANE_ENUMS {
        let owner = known_enums.get(*name).map(|known| known.owner.as_str());
        assert_eq!(
            owner.map(|owner| owner.trim_start_matches("flight-").replace('-', "_")),
            Some(module.to_string()),
            "{name} must stay a #[repr(u32)] unit enum owned by the {module} crate"
        );
    }
    let _ = KNOWN_ENUMS.set(known_enums);
    let _ = TYPE_DEFINITIONS.set(type_definitions);

    // Discover owned producers to a fixed point. A wrapper is eligible to produce a handle only
    // after every owned handle it consumes is already producible; consequently a consumer cycle
    // cannot bootstrap an otherwise unconstructible C handle. Policy exclusions run inside the
    // normal generators and therefore cannot become producers through this pre-pass.
    let _ = PRODUCIBLE_TYPES.set(Mutex::new(BTreeSet::new()));
    loop {
        let mut discovered = BTreeSet::new();
        for dir_name in SCAN_CRATES {
            let src_dir = crates_dir.join(dir_name).join("src");
            if !src_dir.exists() {
                continue;
            }
            for func in collect_pub_fns(&src_dir) {
                let generated = if has_mono_dyn_param(&func) {
                    !generate_mono_wrappers(&func).is_empty()
                } else {
                    generate_ffi_wrapper(&func).is_some()
                };
                if generated {
                    discovered.extend(owned_producer_types(&func));
                }
            }
        }
        let mut producible = PRODUCIBLE_TYPES.get().unwrap().lock().unwrap();
        let previous_len = producible.len();
        producible.extend(discovered);
        if producible.len() == previous_len {
            break;
        }
    }

    let mut shape_bounds_handlers_seen = BTreeSet::new();
    let mut actual_produced_types = BTreeSet::new();
    let mut actual_consumed_types = BTreeSet::new();
    for dir_name in SCAN_CRATES {
        let src_dir = crates_dir.join(dir_name).join("src");
        if !src_dir.exists() {
            continue;
        }
        println!("cargo::rerun-if-changed={}", src_dir.display());

        let fns = collect_pub_fns(&src_dir);
        let structs = collect_pub_structs(&src_dir);

        let mut crate_output = String::new();
        let mut crate_used = false;
        for func in &fns {
            stats_total_fns += 1;
            assert_eq!(
                takes_shape_command_argument_cursor(func),
                SHAPE_BOUNDS_HANDLER_FNS.contains(&func.name.as_str()),
                "{} must be listed in SHAPE_BOUNDS_HANDLER_FNS exactly when it takes a ShapeCommandArgumentCursor",
                func.name
            );
            if takes_shape_command_argument_cursor(func) {
                shape_bounds_handlers_seen.insert(func.name.clone());
            }
            if func.lacks_public_export {
                stats_non_public_fns += 1;
            } else {
                stats_public_fns += 1;
            }
            if has_mono_dyn_param(func) {
                let wrappers = generate_mono_wrappers(func);
                if wrappers.is_empty() {
                    let skip_reason = categorize_skip(func);
                    if !func.lacks_public_export {
                        stats_public_skips.insert(func.name.clone(), skip_reason.clone());
                    }
                    if func.sdk_contract_export {
                        stats_sdk_contract_decisions
                            .insert(func.name.clone(), format!("skipped: {skip_reason}"));
                    }
                    *stats_skipped.entry(skip_reason).or_insert(0) += 1;
                } else {
                    let mut emitted = false;
                    let mut emitted_wrappers = 0usize;
                    for (ffi_name, wrapper, boxed_ty) in wrappers {
                        if !seen_names.contains(&ffi_name) {
                            writeln!(crate_output, "{wrapper}").unwrap();
                            seen_names.insert(ffi_name);
                            crate_used = true;
                            emitted = true;
                            emitted_wrappers += 1;
                            stats_generated_wrappers += 1;
                            if let Some(ty) = boxed_ty.filter(|ty| needs_generic_boxed_free(ty)) {
                                boxed_types.insert(ty);
                            }
                        }
                    }
                    if emitted {
                        actual_produced_types.extend(owned_producer_types(func));
                        actual_consumed_types.extend(owned_consumed_types(func));
                        stats_generated_sources += 1;
                        if func.sdk_contract_export {
                            stats_sdk_contract_decisions.insert(
                                func.name.clone(),
                                format!("generated: {emitted_wrappers} wrapper(s)"),
                            );
                        }
                        collect_vec_ref_handle_specs(func, &mut vec_ref_handle_specs);
                    } else {
                        let skip_reason = format!("duplicate_ffi_symbol({})", func.name);
                        if !func.lacks_public_export {
                            stats_public_skips.insert(func.name.clone(), skip_reason.clone());
                        }
                        if func.sdk_contract_export {
                            stats_sdk_contract_decisions
                                .insert(func.name.clone(), format!("skipped: {skip_reason}"));
                        }
                        *stats_skipped.entry(skip_reason).or_insert(0) += 1;
                    }
                }
            } else {
                let ffi_name = format!("flight_{}", func.name);
                if seen_names.contains(&ffi_name) {
                    let skip_reason = format!("duplicate_ffi_symbol({})", func.name);
                    if !func.lacks_public_export {
                        stats_public_skips.insert(func.name.clone(), skip_reason.clone());
                    }
                    if func.sdk_contract_export {
                        stats_sdk_contract_decisions
                            .insert(func.name.clone(), format!("skipped: {skip_reason}"));
                    }
                    *stats_skipped.entry(skip_reason).or_insert(0) += 1;
                    continue;
                }
                if let Some((wrapper, boxed_ty)) = generate_ffi_wrapper(func) {
                    writeln!(crate_output, "{wrapper}").unwrap();
                    seen_names.insert(ffi_name);
                    crate_used = true;
                    collect_vec_ref_handle_specs(func, &mut vec_ref_handle_specs);
                    actual_produced_types.extend(owned_producer_types(func));
                    actual_consumed_types.extend(owned_consumed_types(func));
                    stats_generated_sources += 1;
                    stats_generated_wrappers += 1;
                    if func.sdk_contract_export {
                        stats_sdk_contract_decisions
                            .insert(func.name.clone(), "generated: 1 wrapper(s)".to_string());
                    }
                    if let Some(ty) = boxed_ty.filter(|ty| needs_generic_boxed_free(ty)) {
                        boxed_types.insert(ty);
                    }
                } else {
                    let skip_reason = categorize_skip(func);
                    if !func.lacks_public_export {
                        stats_public_skips.insert(func.name.clone(), skip_reason.clone());
                    }
                    if func.sdk_contract_export {
                        stats_sdk_contract_decisions
                            .insert(func.name.clone(), format!("skipped: {skip_reason}"));
                    }
                    *stats_skipped.entry(skip_reason).or_insert(0) += 1;
                }
            }
        }
        for s in &structs {
            let accessors = generate_field_accessors(&s.name, &s.fields, &mut seen_names);
            if !accessors.is_empty() {
                crate_output.push_str(&accessors);
                crate_used = true;
            }
        }
        if crate_used {
            writeln!(all_output, "// {dir_name}").unwrap();
            all_output.push_str(&crate_output);
            writeln!(all_output).unwrap();
        }
    }

    assert_eq!(
        shape_bounds_handlers_seen.len(),
        SHAPE_BOUNDS_HANDLER_FNS.len(),
        "every SHAPE_BOUNDS_HANDLER_FNS entry must name a scanned cursor-taking function"
    );

    let missing_producers: Vec<_> = actual_consumed_types
        .difference(&actual_produced_types)
        .cloned()
        .collect();
    assert!(
        missing_producers.is_empty(),
        "generated wrappers consume owned handles without a generated producer: {missing_producers:?}"
    );

    for (names, category) in [
        (IMPORT_HANDLER_POLICY_SKIP_FNS, "extension_policy_skip"),
        (BEHAVIOR_POLICY_SKIP_FNS, "extension_policy_skip"),
        (GUARD_POLICY_SKIP_FNS, "safety_policy_skip"),
    ] {
        let unique: BTreeSet<_> = names.iter().copied().collect();
        assert_eq!(unique.len(), names.len(), "duplicate {category} entry");
        for name in names {
            assert_eq!(
                stats_public_skips.get(*name).map(String::as_str),
                Some(format!("{category}({name})").as_str()),
                "{name} must remain an exact public {category} decision"
            );
        }
    }
    let actionable_public_skips: Vec<_> = stats_public_skips
        .iter()
        .filter(|(_, reason)| !is_by_design_public_skip(reason))
        .map(|(name, reason)| format!("{name}: {reason}"))
        .collect();
    assert!(
        actionable_public_skips.is_empty(),
        "public FFI skips remain actionable: {actionable_public_skips:?}"
    );

    let stats_skipped_total: usize = stats_skipped.values().sum();
    let stats_monomorphized_extras = stats_generated_wrappers
        .checked_sub(stats_generated_sources)
        .expect("every generated source must emit at least one wrapper");
    assert_eq!(
        stats_total_fns,
        stats_generated_sources + stats_skipped_total,
        "every scanned source function must have exactly one generated-or-skipped decision"
    );
    assert_eq!(
        stats_generated_wrappers,
        stats_generated_sources + stats_monomorphized_extras,
        "wrapper totals must separate generated sources from monomorphized extras"
    );
    let mut stats_file = String::new();
    writeln!(stats_file, "FFI source decisions: {stats_total_fns} total, {stats_generated_sources} generated, {stats_skipped_total} skipped").unwrap();
    writeln!(stats_file, "FFI emitted wrappers: {stats_generated_wrappers} total, {stats_generated_sources} generated sources, {stats_monomorphized_extras} monomorphized extras").unwrap();
    writeln!(
        stats_file,
        "FFI public census: {stats_public_fns} TypeScript-public, {stats_non_public_fns} non-public"
    )
    .unwrap();
    writeln!(
        stats_file,
        "FFI public skip decisions: {} total",
        stats_public_skips.len()
    )
    .unwrap();
    writeln!(
        stats_file,
        "FFI public skip partition: {} by-design, {} actionable",
        stats_public_skips.len() - actionable_public_skips.len(),
        actionable_public_skips.len()
    )
    .unwrap();
    let mut sorted_skips: Vec<_> = stats_skipped.iter().collect();
    sorted_skips.sort_by(|a, b| b.1.cmp(a.1));
    for (reason, count) in &sorted_skips {
        writeln!(stats_file, "  skip: {count:>4} {reason}").unwrap();
    }
    for (name, decision) in stats_sdk_contract_decisions {
        writeln!(stats_file, "  SDK contract decision: {name} {decision}").unwrap();
    }
    for (name, reason) in &stats_public_skips {
        writeln!(stats_file, "  public skip: {name}: {reason}").unwrap();
    }
    fs::write(out_dir.join("ffi_stats.txt"), &stats_file).unwrap();

    validate_required_vec_ref_handle_specs(&vec_ref_handle_specs);
    all_output.push_str(&generate_vec_ref_handle_support(&vec_ref_handle_specs));
    all_output.push_str(generate_requirement_list_support());
    all_output.push_str(&generate_import_diagnostic_list_support());
    all_output.push_str(generate_import_diagnostic_append_support());
    all_output.push_str(&generate_typed_array_ref_support());
    all_output.push_str(&generate_registered_handle_support());
    all_output.push_str(generate_disposer_support());
    boxed_types.extend(REGISTERED_HANDLE_REFS.iter().map(|ty| ty.to_string()));
    all_output.push_str(generate_storage_set_items_result_support());

    writeln!(all_output, "// free functions").unwrap();
    writeln!(
        all_output,
        "#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn flight_free_string(ptr: *mut std::ffi::c_char) {{\n    if !ptr.is_null() {{\n        unsafe {{ drop(std::ffi::CString::from_raw(ptr)); }}\n    }}\n}}"
    )
    .unwrap();
    for qualified_ty in &boxed_types {
        let type_name = qualified_ty.rsplit("::").next().unwrap_or(qualified_ty);
        if type_name.starts_with('(') {
            continue;
        }
        // A boxed scalar fixed array is released by its element type and length, `[f32; 20]`
        // through `flight_free_f32_array_20`.
        let (snake, boxed_ty) = if type_name.starts_with('[') {
            let Some((element, length)) = type_name
                .strip_prefix('[')
                .and_then(|rest| rest.strip_suffix(']'))
                .and_then(|array| array.split_once(';'))
                .filter(|(element, _)| is_scalar(element.trim()))
            else {
                continue;
            };
            (
                format!("{}_array_{}", element.trim(), length.trim()),
                type_name.to_string(),
            )
        } else {
            (boxed_free_suffix(qualified_ty), qualified_ty.clone())
        };
        writeln!(
            all_output,
            "#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn flight_free_{snake}(ptr: *mut {boxed_ty}) {{\n    if !ptr.is_null() {{\n        unsafe {{ drop(Box::from_raw(ptr)); }}\n    }}\n}}"
        )
        .unwrap();
    }

    native_bindings::emit(&all_output, &out_dir);
    fs::write(out_dir.join("ffi_generated.rs"), all_output).unwrap();

    let mut offsets_src = String::new();
    writeln!(offsets_src, "fn main() {{").unwrap();
    writeln!(offsets_src, "    let mut out = String::new();").unwrap();
    writeln!(offsets_src, "    out.push('{{');").unwrap();
    writeln!(offsets_src, "    out.push('\\n');").unwrap();
    let mut first_struct = true;
    for dir_name in SCAN_CRATES {
        let src_dir = crates_dir.join(dir_name).join("src");
        if !src_dir.exists() {
            continue;
        }
        let structs = collect_pub_structs(&src_dir);
        for s in &structs {
            if s.fields.is_empty() {
                continue;
            }
            let qualified = qualify_type(&s.name);
            if first_struct {
                first_struct = false;
            } else {
                writeln!(offsets_src, "    out.push_str(\",\\n\");").unwrap();
            }
            writeln!(
                offsets_src,
                "    out.push_str(\"  \\\"{name}\\\": {{\");",
                name = s.name
            )
            .unwrap();
            writeln!(
                offsets_src,
                "    out.push_str(&format!(\"\\\"_size\\\": {{}}\", std::mem::size_of::<{qualified}>()));"
            )
            .unwrap();
            for field in &s.fields {
                writeln!(
                    offsets_src,
                    "    out.push_str(&format!(\", \\\"{field_name}\\\": {{}}\", std::mem::offset_of!({qualified}, {field_name})));",
                    field_name = field.name
                )
                .unwrap();
            }
            writeln!(offsets_src, "    out.push('}}');").unwrap();
        }
    }
    writeln!(offsets_src, "    out.push('\\n');").unwrap();
    writeln!(offsets_src, "    out.push('}}');").unwrap();
    writeln!(offsets_src, "    print!(\"{{out}}\");").unwrap();
    writeln!(offsets_src, "}}").unwrap();
    fs::write(out_dir.join("offsets_generated.rs"), offsets_src).unwrap();
}

#[derive(Debug)]
struct ParsedFn {
    name: String,
    params: Vec<Param>,
    ret: Option<String>,
    // Async functions are normally outside this synchronous generator. The SDK's four explicitly
    // internal font promotions are still parsed so they receive durable skip decisions.
    is_async: bool,
    // Explicitly promoted from the owning package's contract by the SDK barrel.
    sdk_contract_export: bool,
    sdk_contract_module: Option<String>,
    // Absent from the package's TypeScript `index.ts` export graph. Rust crate-root visibility is
    // discovery only and never authorizes a generated public ABI. Explicit SDK contract
    // promotions join the package root; named internal promotions remain non-public.
    lacks_public_export: bool,
}

#[derive(Default)]
struct TsExportPerimeter {
    public: BTreeSet<String>,
    internal: BTreeSet<String>,
    sdk_public: BTreeSet<String>,
}

#[derive(Debug)]
struct Param {
    name: String,
    ty: String,
}

#[derive(Debug)]
struct ParsedStruct {
    name: String,
    fields: Vec<StructField>,
}

#[derive(Debug)]
struct StructField {
    name: String,
    ty: String,
}

fn collect_pub_fns(src_dir: &Path) -> Vec<ParsedFn> {
    let lib_path = src_dir.join("lib.rs");
    if !lib_path.exists() {
        return Vec::new();
    }

    let ts_exports = collect_ts_exports(src_dir);
    let discoverable_exports: BTreeSet<_> = ts_exports
        .public
        .union(&ts_exports.internal)
        .cloned()
        .collect();
    let exported_names = collect_exported_names(&lib_path, src_dir, &discoverable_exports);
    if exported_names.is_empty()
        && ts_exports.sdk_public.is_empty()
        && ts_exports.internal.is_empty()
    {
        return Vec::new();
    }

    let mut fns = Vec::new();
    let mut entries: Vec<_> = fs::read_dir(src_dir)
        .unwrap()
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path().extension().is_some_and(|ext| ext == "rs")
                && !e.file_name().to_string_lossy().contains("test")
        })
        .collect();
    entries.sort_by_key(|e| e.file_name());

    for entry in entries {
        let fname = entry.file_name().to_string_lossy().to_string();
        if fname == "contract.rs" || fname == "lib.rs" {
            continue;
        }
        let content = fs::read_to_string(entry.path()).unwrap();
        let mut all_fns = Vec::new();
        parse_pub_fns(&content, &mut all_fns);
        for mut f in all_fns {
            let export_key = public_perimeter::get_export_key(&f.name);
            let internal_sdk_export = ts_exports.internal.contains(&export_key);
            if (!f.is_async
                && (exported_names.contains(&f.name)
                    || ts_exports.sdk_public.contains(&export_key)))
                || internal_sdk_export
            {
                f.lacks_public_export =
                    internal_sdk_export || !ts_exports.public.contains(&export_key);
                f.sdk_contract_export = ts_exports.sdk_public.contains(&export_key);
                f.sdk_contract_module = f.sdk_contract_export.then(|| package_module_name(src_dir));
                fns.push(f);
            }
        }
    }
    fns
}

fn package_module_name(src_dir: &Path) -> String {
    return src_dir
        .parent()
        .unwrap()
        .file_name()
        .unwrap()
        .to_string_lossy()
        .trim_start_matches("flight-")
        .replace('-', "_");
}

// Public values come from the package root plus deliberate named promotions from its SDK contract.
// The SDK's leading-underscore font helpers are tracked separately as internal decisions.
fn collect_ts_exports(src_dir: &Path) -> TsExportPerimeter {
    let crate_dir = src_dir.parent().unwrap();
    let crate_name = crate_dir.file_name().unwrap().to_string_lossy();
    let Some(package) = crate_name.strip_prefix("flight-") else {
        return TsExportPerimeter::default();
    };
    let packages_dir = crate_dir
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .join("packages");
    let package_src = packages_dir.join(package).join("src");
    let (names, files) = public_perimeter::collect_ts_module_exports(&package_src.join("index.ts"));
    for file in files {
        println!("cargo::rerun-if-changed={}", file.display());
    }
    let mut perimeter = TsExportPerimeter::default();
    perimeter.public.extend(
        names
            .iter()
            .map(|name| public_perimeter::get_export_key(name)),
    );

    let sdk_index = packages_dir.join("sdk/src/index.ts");
    println!("cargo::rerun-if-changed={}", sdk_index.display());
    let contract_source = format!("@flighthq/{package}/contract");
    for name in public_perimeter::collect_ts_external_reexports(&sdk_index, &contract_source) {
        let key = public_perimeter::get_export_key(&name);
        if SDK_INTERNAL_CONTRACT_EXPORT_FNS
            .iter()
            .any(|internal| public_perimeter::get_export_key(internal) == key)
        {
            perimeter.internal.insert(key);
        } else {
            perimeter.public.insert(key.clone());
            perimeter.sdk_public.insert(key);
        }
    }
    return perimeter;
}

fn collect_exported_names(
    lib_path: &Path,
    src_dir: &Path,
    ts_exports: &BTreeSet<String>,
) -> BTreeSet<String> {
    let content = fs::read_to_string(lib_path).unwrap();
    let mut names = BTreeSet::new();

    for line in content.lines() {
        let line = line.trim();

        // pub use contract::foo_bar; or pub use sugar::foo_bar;
        if line.starts_with("pub use ") {
            if let Some(rest) = line.strip_prefix("pub use ") {
                let rest = rest.trim_end_matches(';').trim();
                if rest.ends_with("::*") {
                    // glob re-export: pub use contract::* — resolve the module
                    let mod_path = rest.trim_end_matches("::*");
                    // e.g. "contract" or "super::foo"
                    let mod_name = mod_path.rsplit("::").next().unwrap_or(mod_path);
                    let mod_file = src_dir.join(format!("{mod_name}.rs"));
                    if mod_file.exists() {
                        collect_glob_names(&mod_file, src_dir, ts_exports, &mut names);
                    }
                } else if let Some(name) = rest.rsplit("::").next() {
                    // named re-export
                    if name.chars().next().is_some_and(|c| c.is_lowercase()) {
                        names.insert(name.to_string());
                    }
                }
            }
        }
    }
    names
}

fn collect_glob_names(
    file: &Path,
    src_dir: &Path,
    ts_exports: &BTreeSet<String>,
    names: &mut BTreeSet<String>,
) {
    let content = match fs::read_to_string(file) {
        Ok(c) => c,
        Err(_) => return,
    };
    for line in content.lines() {
        let line = line.trim();
        // pub use super::module_name::*;  (contract.rs pattern)
        if line.starts_with("pub use super::") && line.ends_with("::*;") {
            let inner = line
                .strip_prefix("pub use super::")
                .unwrap()
                .strip_suffix("::*;")
                .unwrap();
            let mod_file = src_dir.join(format!("{inner}.rs"));
            if mod_file.exists() {
                let mod_content = fs::read_to_string(&mod_file).unwrap();
                let mut mod_fns = Vec::new();
                parse_pub_fns(&mod_content, &mut mod_fns);
                for f in mod_fns {
                    if !f.is_async {
                        names.insert(f.name);
                    }
                }
            }
        }
        // pub use super::module_name::specific_fn;
        if line.starts_with("pub use super::") && !line.ends_with("::*;") {
            if let Some(name) = line.trim_end_matches(';').rsplit("::").next() {
                if name.chars().next().is_some_and(|c| c.is_lowercase()) {
                    names.insert(name.to_string());
                }
            }
        }
        // Newer contracts use crate-root module re-exports. Unlike the legacy `super` contract
        // lane, admit these functions only when the package's real TypeScript root exports the
        // same public name; a broad Rust contract glob must not enlarge the FFI perimeter.
        if line.starts_with("pub use crate::") && line.ends_with("::*;") {
            let inner = line
                .strip_prefix("pub use crate::")
                .unwrap()
                .strip_suffix("::*;")
                .unwrap();
            let mod_file = src_dir.join(format!("{inner}.rs"));
            if mod_file.exists() {
                let mod_content = fs::read_to_string(&mod_file).unwrap();
                let mut mod_fns = Vec::new();
                parse_pub_fns(&mod_content, &mut mod_fns);
                for f in mod_fns {
                    if !f.is_async
                        && ts_exports.contains(&public_perimeter::get_export_key(&f.name))
                    {
                        names.insert(f.name);
                    }
                }
            }
        }
        if line.starts_with("pub use crate::")
            && !line.ends_with("::*;")
            && let Some(name) = line.trim_end_matches(';').rsplit("::").next()
            && name.chars().next().is_some_and(|c| c.is_lowercase())
            && ts_exports.contains(&public_perimeter::get_export_key(name))
        {
            names.insert(name.to_string());
        }
    }
}

fn parse_pub_fns(content: &str, out: &mut Vec<ParsedFn>) {
    let lines: Vec<&str> = content.lines().collect();
    let mut i = 0;
    let mut brace_depth: i32 = 0;
    while i < lines.len() {
        let line = lines[i].trim();

        if (!line.starts_with("pub fn ") && !line.starts_with("pub async fn ")) || brace_depth > 0 {
            for c in line.chars() {
                match c {
                    '{' => brace_depth += 1,
                    '}' => brace_depth -= 1,
                    _ => {}
                }
            }
            i += 1;
            continue;
        }

        let mut sig = String::new();
        while i < lines.len() {
            let l = lines[i].trim();
            sig.push_str(l);
            sig.push(' ');
            for c in l.chars() {
                match c {
                    '{' => brace_depth += 1,
                    '}' => brace_depth -= 1,
                    _ => {}
                }
            }
            if l.contains('{') {
                break;
            }
            i += 1;
        }
        i += 1;

        if let Some(parsed) = parse_fn_signature(&sig) {
            out.push(parsed);
        }
    }
}

fn parse_fn_signature(sig: &str) -> Option<ParsedFn> {
    let sig = sig.trim();
    let (after_pub_fn, is_async) = if let Some(signature) = sig.strip_prefix("pub fn ") {
        (signature, false)
    } else {
        (sig.strip_prefix("pub async fn ")?, true)
    };

    let name_end = after_pub_fn.find(|c: char| c == '(' || c == '<')?;
    let name = after_pub_fn[..name_end].trim().to_string();

    if after_pub_fn.as_bytes().get(name_end) == Some(&b'<') {
        let params_start = after_pub_fn.find('(')?;
        let generic_end = after_pub_fn[..params_start].rfind('>')?;
        let generics = &after_pub_fn[name_end + 1..generic_end];
        // Lifetime-only generics do not change the ABI after references are lowered. Type and
        // const generics still require explicit monomorphization and remain outside this scanner.
        if generics
            .split(',')
            .map(str::trim)
            .any(|generic| generic.is_empty() || !generic.starts_with('\''))
        {
            return None;
        }
    }

    let params_start = after_pub_fn.find('(')?;
    let params_end = find_matching_paren(after_pub_fn, params_start)?;
    let params_str = &after_pub_fn[params_start + 1..params_end];

    let params = parse_params(params_str)?;

    let after_params = after_pub_fn[params_end + 1..].trim();
    let ret = if after_params.starts_with("->") {
        let ret_str = after_params[2..].trim();
        let ret_end = ret_str.find('{').unwrap_or(ret_str.len());
        let ret_type = ret_str[..ret_end].trim().to_string();
        if ret_type.is_empty() {
            None
        } else {
            Some(ret_type)
        }
    } else {
        None
    };

    Some(ParsedFn {
        name,
        params,
        ret,
        is_async,
        sdk_contract_export: false,
        sdk_contract_module: None,
        lacks_public_export: false,
    })
}

fn find_matching_paren(s: &str, open: usize) -> Option<usize> {
    let mut depth = 0;
    for (i, c) in s[open..].char_indices() {
        match c {
            '(' => depth += 1,
            ')' => {
                depth -= 1;
                if depth == 0 {
                    return Some(open + i);
                }
            }
            _ => {}
        }
    }
    None
}

fn parse_params(params_str: &str) -> Option<Vec<Param>> {
    let params_str = params_str.trim();
    if params_str.is_empty() {
        return Some(Vec::new());
    }

    let mut params = Vec::new();
    let mut depth = 0i32;
    let mut start = 0;
    let bytes = params_str.as_bytes();

    for i in 0..bytes.len() {
        match bytes[i] {
            b'<' | b'(' | b'[' => depth += 1,
            b'>' if i > 0 && bytes[i - 1] == b'-' => {} // `->` arrow, not bracket
            b'>' | b')' | b']' => depth -= 1,
            b',' if depth == 0 => {
                if let Some(p) = parse_single_param(&params_str[start..i]) {
                    params.push(p);
                } else {
                    return None;
                }
                start = i + 1;
            }
            _ => {}
        }
    }
    if let Some(p) = parse_single_param(&params_str[start..]) {
        params.push(p);
    } else if !params_str[start..].trim().is_empty() {
        return None;
    }

    Some(params)
}

fn parse_single_param(param: &str) -> Option<Param> {
    let param = param.trim();
    if param.is_empty() {
        return None;
    }
    let colon = param.find(':')?;
    let mut name = param[..colon].trim().to_string();
    if let Some(rest) = name.strip_prefix("mut ") {
        name = rest.to_string();
    }
    let ty = param[colon + 1..].trim().to_string();
    Some(Param { name, ty })
}

fn collect_pub_structs(src_dir: &Path) -> Vec<ParsedStruct> {
    let lib_path = src_dir.join("lib.rs");
    if !lib_path.exists() {
        return Vec::new();
    }

    let exported_types = collect_exported_type_names(&lib_path, src_dir);
    if exported_types.is_empty() {
        return Vec::new();
    }

    let mut structs = Vec::new();
    let mut entries: Vec<_> = fs::read_dir(src_dir)
        .unwrap()
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path().extension().is_some_and(|ext| ext == "rs")
                && !e.file_name().to_string_lossy().contains("test")
        })
        .collect();
    entries.sort_by_key(|e| e.file_name());

    for entry in entries {
        let fname = entry.file_name().to_string_lossy().to_string();
        if fname == "contract.rs" || fname == "lib.rs" {
            continue;
        }
        let content = fs::read_to_string(entry.path()).unwrap();
        let mut all_structs = Vec::new();
        parse_pub_structs(&content, &mut all_structs);
        for s in all_structs {
            if exported_types.contains(&s.name) {
                structs.push(s);
            }
        }
    }
    structs
}

fn collect_exported_type_names(lib_path: &Path, src_dir: &Path) -> BTreeSet<String> {
    let content = fs::read_to_string(lib_path).unwrap();
    let mut names = BTreeSet::new();

    for line in content.lines() {
        let line = line.trim();
        if line.starts_with("pub use ") {
            if let Some(rest) = line.strip_prefix("pub use ") {
                let rest = rest.trim_end_matches(';').trim();
                if rest.ends_with("::*") {
                    let mod_path = rest.trim_end_matches("::*");
                    let mod_name = mod_path.rsplit("::").next().unwrap_or(mod_path);
                    let mod_file = src_dir.join(format!("{mod_name}.rs"));
                    if mod_file.exists() {
                        collect_glob_type_names(&mod_file, src_dir, &mut names);
                    }
                } else if let Some(name) = rest.rsplit("::").next() {
                    if name.chars().next().is_some_and(|c| c.is_uppercase()) {
                        names.insert(name.to_string());
                    }
                }
            }
        }
    }
    names
}

fn collect_glob_type_names(file: &Path, src_dir: &Path, names: &mut BTreeSet<String>) {
    let content = match fs::read_to_string(file) {
        Ok(c) => c,
        Err(_) => return,
    };
    for line in content.lines() {
        let line = line.trim();
        if line.starts_with("pub use super::") && line.ends_with("::*;") {
            let inner = line
                .strip_prefix("pub use super::")
                .unwrap()
                .strip_suffix("::*;")
                .unwrap();
            let mod_file = src_dir.join(format!("{inner}.rs"));
            if mod_file.exists() {
                let mod_content = fs::read_to_string(&mod_file).unwrap();
                let mut mod_structs = Vec::new();
                parse_pub_structs(&mod_content, &mut mod_structs);
                for s in mod_structs {
                    names.insert(s.name);
                }
            }
        }
        if line.starts_with("pub use super::") && !line.ends_with("::*;") {
            if let Some(name) = line.trim_end_matches(';').rsplit("::").next() {
                if name.chars().next().is_some_and(|c| c.is_uppercase()) {
                    names.insert(name.to_string());
                }
            }
        }
    }
}

fn parse_pub_structs(content: &str, out: &mut Vec<ParsedStruct>) {
    let lines: Vec<&str> = content.lines().collect();
    let mut i = 0;
    while i < lines.len() {
        let line = lines[i].trim();
        if !line.starts_with("pub struct ") {
            i += 1;
            continue;
        }
        let after = &line["pub struct ".len()..];
        let name_end = after
            .find(|c: char| c == '{' || c == '(' || c == '<' || c == ' ')
            .unwrap_or(after.len());
        let name = after[..name_end].trim().to_string();

        if after[name_end..].trim_start().starts_with('<') {
            i += 1;
            continue;
        }

        if !after.contains('{') {
            i += 1;
            continue;
        }

        let mut fields = Vec::new();
        i += 1;
        while i < lines.len() {
            let fline = lines[i].trim();
            if fline.starts_with('}') {
                break;
            }
            if let Some(field) = parse_struct_field(fline) {
                fields.push(field);
            }
            i += 1;
        }
        i += 1;

        if !fields.is_empty() {
            out.push(ParsedStruct { name, fields });
        }
    }
}

fn parse_struct_field(line: &str) -> Option<StructField> {
    let line = line.trim().trim_end_matches(',');
    if !line.starts_with("pub ") {
        return None;
    }
    let after_pub = &line[4..];
    let colon = after_pub.find(':')?;
    let name = after_pub[..colon].trim().to_string();
    let ty = after_pub[colon + 1..].trim().to_string();
    if is_scalar(&ty) {
        Some(StructField { name, ty })
    } else {
        None
    }
}

// Records each `pub struct` / `pub enum` with whether its `#[derive(...)]` list (across any
// attribute and doc lines before it) includes `Copy`, and each `pub type` alias.
fn parse_type_definitions(
    content: &str,
    exported: &BTreeSet<String>,
    out: &mut BTreeMap<String, Vec<(bool, TypeDefinition)>>,
) {
    let mut derives = String::new();
    let mut in_derive = false;
    let mut alias: Option<(String, String)> = None;
    for line in content.lines() {
        let line = line.trim();
        if let Some((name, mut target)) = alias.take() {
            target.push(' ');
            target.push_str(line);
            if target.contains(';') {
                record_alias(&name, &target, exported, out);
            } else {
                alias = Some((name, target));
            }
            continue;
        }
        if in_derive || line.starts_with("#[derive(") {
            derives.push_str(line);
            in_derive = !line.contains(")]");
            continue;
        }
        if line.starts_with("#[") || line.starts_with("//") || line.is_empty() {
            continue;
        }
        let declaration = line
            .strip_prefix("pub struct ")
            .or_else(|| line.strip_prefix("pub enum "));
        if let Some(rest) = declaration {
            let name: String = rest
                .chars()
                .take_while(|c| c.is_alphanumeric() || *c == '_')
                .collect();
            let copy = derives
                .split(|c: char| !c.is_alphanumeric())
                .any(|word| word == "Copy");
            let is_exported = exported.contains(&name);
            out.entry(name)
                .or_default()
                .push((is_exported, TypeDefinition::Nominal { copy }));
        } else if let Some(rest) = line.strip_prefix("pub type ") {
            let name: String = rest
                .chars()
                .take_while(|c| c.is_alphanumeric() || *c == '_')
                .collect();
            let after_name = &rest[name.len()..];
            if after_name.trim_start().starts_with('<') {
                let is_exported = exported.contains(&name);
                out.entry(name)
                    .or_default()
                    .push((is_exported, TypeDefinition::GenericAlias));
            } else if let Some((_, target)) = after_name.split_once('=') {
                if target.contains(';') {
                    record_alias(&name, target, exported, out);
                } else {
                    alias = Some((name, target.to_string()));
                }
            }
        }
        derives.clear();
    }
}

fn record_alias(
    name: &str,
    target: &str,
    exported: &BTreeSet<String>,
    out: &mut BTreeMap<String, Vec<(bool, TypeDefinition)>>,
) {
    let target = target.split(';').next().unwrap_or("").trim();
    let target = strip_crate_paths(&target.split_whitespace().collect::<Vec<_>>().join(" "));
    out.entry(name.to_string())
        .or_default()
        .push((exported.contains(name), TypeDefinition::Alias(target)));
}

// The by-value ownership of a named, non-generic type, proven from its definitions, or None when
// it cannot be proven (no exported definition, conflicting definitions, or a generic container).
fn get_owned_param(ty: &str) -> Option<OwnedParam> {
    get_owned_param_at_depth(ty.trim(), 0)
}

fn get_owned_param_at_depth(ty: &str, depth: usize) -> Option<OwnedParam> {
    if depth > 8 {
        return None;
    }
    if is_scalar(ty) || ty.starts_with("fn(") {
        return Some(OwnedParam::Copied);
    }
    if ty.starts_with("Arc<") || ty.starts_with("Ref<") {
        return Some(OwnedParam::Cloned);
    }
    if let Some(inner) = ty
        .strip_prefix("Option<")
        .and_then(|rest| rest.strip_suffix('>'))
    {
        return get_owned_param_at_depth(inner.trim(), depth + 1);
    }
    if let Some((element, length)) = ty
        .strip_prefix('[')
        .and_then(|rest| rest.strip_suffix(']'))
        .and_then(|array| array.split_once(';'))
    {
        let copied = length.trim().parse::<usize>().is_ok()
            && get_owned_param_at_depth(element.trim(), depth + 1) == Some(OwnedParam::Copied);
        return copied.then_some(OwnedParam::Copied);
    }
    if !ty.chars().all(|c| c.is_alphanumeric() || c == '_') {
        return None;
    }
    let definitions = TYPE_DEFINITIONS.get()?.get(ty)?;
    // Root-exported definitions decide a shared name; otherwise every definition must agree.
    let exported_only = definitions.iter().any(|(exported, _)| *exported);
    let mut owned = definitions
        .iter()
        .filter(|(exported, _)| *exported || !exported_only)
        .map(|(_, definition)| match definition {
            TypeDefinition::Nominal { copy: true } => Some(OwnedParam::Copied),
            TypeDefinition::Nominal { copy: false } => Some(OwnedParam::Transferred),
            TypeDefinition::Alias(target) => get_owned_param_at_depth(target, depth + 1),
            TypeDefinition::GenericAlias => None,
        });
    let first = owned.next()??;
    owned.all(|other| other == Some(first)).then_some(first)
}

// The C header note for a parameter whose ownership is not obvious from its pointer shape.
fn get_param_ownership_note(ty: &str) -> Option<&'static str> {
    const CLONED: &str = "cloned; caller retains its handle";
    const TRANSFERRED: &str = "ownership transferred; do not use or free after call";
    let ty = strip_crate_paths(&strip_lifetimes(&resolve_type_alias(ty.trim())));
    if ty.starts_with('&') || is_opaque_fallback_excluded(&ty) {
        return None;
    }
    if ty.starts_with("Ref<") || ty.starts_with("Arc<") || ty.starts_with("SignalSlot<") {
        return Some(CLONED);
    }
    if is_caller_retained_clone_type(&ty)
        || opaque_clone_handle_type(&ty).is_some()
        || get_owned_param(&ty) == Some(OwnedParam::Cloned)
    {
        return Some(CLONED);
    }
    if let Some(inner) = ty
        .strip_prefix("Option<")
        .and_then(|rest| rest.strip_suffix('>'))
    {
        let inner = inner.trim();
        if inner.starts_with('&') || is_opaque_fallback_excluded(inner) {
            return None;
        }
        if is_caller_retained_clone_type(inner) || opaque_clone_handle_type(inner).is_some() {
            return Some(CLONED);
        }
        if is_opaque_transferred_generic(inner) || can_transfer_named_opaque(inner) {
            return Some(TRANSFERRED);
        }
        if DYN_OPAQUE_TRAITS.iter().any(|(_, alias)| *alias == inner) {
            return Some(CLONED);
        }
        return None;
    }
    if is_opaque_transferred_generic(&ty) {
        return Some(TRANSFERRED);
    }
    if ty.contains('<') || is_scalar(&ty) || is_known_enum(&ty) {
        return None;
    }
    match get_owned_param(&ty).or_else(|| {
        TYPE_DEFINITIONS
            .get()
            .is_some_and(|definitions| definitions.contains_key(&ty))
            .then_some(OwnedParam::Transferred)
    })? {
        OwnedParam::Cloned => Some(CLONED),
        OwnedParam::Transferred => Some(TRANSFERRED),
        OwnedParam::Copied => None,
    }
}

fn parse_simple_enums(content: &str, owner: &str, out: &mut BTreeMap<String, Vec<KnownEnum>>) {
    let lines: Vec<&str> = content.lines().collect();
    let mut i = 0;
    while i < lines.len() {
        let line = lines[i].trim();
        if !line.starts_with("pub enum ") || !line.contains('{') {
            i += 1;
            continue;
        }
        let name_part = line.strip_prefix("pub enum ").unwrap();
        let name_end = name_part.find(|c: char| c == '{' || c == '<' || c == ' ');
        let name = match name_end {
            Some(e) => name_part[..e].trim().to_string(),
            None => {
                i += 1;
                continue;
            }
        };
        if name_part.contains('<') {
            i += 1;
            continue;
        }
        let has_repr_u32 = {
            let mut k = (i as isize) - 1;
            let mut found = false;
            while k >= 0 {
                let kline = lines[k as usize].trim();
                if kline == "#[repr(u32)]" {
                    found = true;
                    break;
                }
                if kline.starts_with("#[") || kline.starts_with("//") || kline.is_empty() {
                    k -= 1;
                    continue;
                }
                break;
            }
            found
        };
        if !has_repr_u32 {
            i += 1;
            continue;
        }
        let mut all_unit = true;
        let mut variants = Vec::new();
        i += 1;
        while i < lines.len() {
            let vline = lines[i].trim();
            if vline == "}" {
                break;
            }
            i += 1;
            if vline.is_empty() || vline.starts_with("//") || vline.starts_with('#') {
                continue;
            }
            let vline = vline.trim_end_matches(',');
            if vline.contains('(') || vline.contains('{') {
                all_unit = false;
                break;
            }
            // Each comma-separated variant, named before any explicit `= discriminant`.
            for part in vline.split(',') {
                let variant: String = part
                    .trim()
                    .chars()
                    .take_while(|c| c.is_alphanumeric() || *c == '_')
                    .collect();
                if !variant.is_empty() {
                    variants.push(variant);
                }
            }
        }
        i += 1;
        if all_unit && variants.len() >= 2 {
            out.entry(name).or_default().push(KnownEnum {
                owner: owner.to_string(),
                variants,
            });
        }
    }
}

fn generate_field_accessors(
    struct_name: &str,
    fields: &[StructField],
    seen_names: &mut BTreeSet<String>,
) -> String {
    let snake = to_snake_case(struct_name);
    let qualified = qualify_type(struct_name);
    let mut output = String::new();

    for field in fields {
        let getter_name = format!("flight_get_{snake}_{}", field.name);
        let setter_name = format!("flight_set_{snake}_{}", field.name);

        let ffi_ty = &field.ty;

        if seen_names.insert(getter_name.clone()) {
            writeln!(
            output,
            "#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn {getter_name}(ptr: *const {qualified}) -> {ffi_ty} {{\n    return unsafe {{ &*ptr }}.{};\n}}",
            field.name
        )
        .unwrap();
        }
        if seen_names.insert(setter_name.clone()) {
            writeln!(
            output,
            "#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn {setter_name}(ptr: *mut {qualified}, value: {ffi_ty}) -> {ffi_ty} {{\n    unsafe {{ &mut *ptr }}.{} = value;\n    return value;\n}}",
            field.name
        )
        .unwrap();
        }
    }
    output
}

fn extract_dyn_trait(ty: &str) -> Option<String> {
    let inner = ty.strip_prefix("&mut ").or_else(|| ty.strip_prefix('&'))?;
    let inner = inner.strip_prefix("dyn ")?;
    let inner = inner.trim();
    if let Some(pos) = inner.rfind("::") {
        Some(inner[pos + 2..].to_string())
    } else {
        Some(inner.to_string())
    }
}

fn is_known_dyn_opaque(ty: &str) -> bool {
    extract_dyn_trait(ty)
        .map(|t| DYN_OPAQUE_TRAITS.iter().any(|(name, _)| *name == t))
        .unwrap_or(false)
}

// `dyn Trait` named directly, as the inner type of a `Ref<...>` handle, for a trait whose handles
// are opaque `Ref<dyn Trait>` pointers.
fn is_opaque_dyn(inner: &str) -> bool {
    inner
        .strip_prefix("dyn ")
        .is_some_and(|t| DYN_OPAQUE_TRAITS.iter().any(|(name, _)| *name == t.trim()))
}

fn is_known_dyn_mono(ty: &str) -> bool {
    extract_dyn_trait(ty)
        .map(|t| DYN_MONO_TRAITS.iter().any(|(name, _)| *name == t))
        .unwrap_or(false)
}

fn is_ffi_incompatible(ty: &str) -> bool {
    if ty.contains("dyn ") {
        if is_known_dyn_opaque(ty) || is_known_dyn_mono(ty) {
            return false;
        }
        return true;
    }
    is_tuple(ty)
        || ty.contains("Fn(")
        || ty.contains("FnMut(")
        || ty.contains("FnOnce(")
        || ty.contains('<')
        || ty.contains("::")
}

fn is_shape_bounds_context(ty: &str) -> bool {
    strip_crate_paths(&strip_lifetimes(&resolve_type_alias(ty.trim())))
        == "&mut dyn ShapeBoundsContext"
}

fn takes_shape_command_argument_cursor(func: &ParsedFn) -> bool {
    return func.params.iter().any(|param| {
        strip_crate_paths(&strip_lifetimes(&resolve_type_alias(param.ty.trim())))
            == "&dyn ShapeCommandArgumentCursor"
    });
}

fn sdk_function_path(func: &ParsedFn) -> String {
    return match &func.sdk_contract_module {
        Some(module) => format!("flight_sdk::{module}::contract::{}", func.name),
        None => format!("flight_sdk::{}", func.name),
    };
}

// Immediate Task M callback seams use purpose-built carriers instead of pretending their data
// unions or callback payloads are layout-compatible with C. Every callback is valid only for the
// dynamic extent documented by its wrapper, and every Rust panic is contained at the ABI.
fn generate_task_m_wrapper(func: &ParsedFn) -> Option<(String, Option<String>)> {
    match func.name.as_str() {
        "build_particle_color_curve" => {
            assert_eq!(func.params.len(), 3);
            assert_eq!(func.params[0].ty, "&mut Vec<f32>");
            assert_eq!(func.params[1].ty, "&dyn Fn(f32) -> [f32; 3]");
            assert_eq!(func.params[2].ty, "i32");
            let value = FfiReturn::VecReturn(VecReturnSpec {
                element_ty: "f32".to_string(),
                element_is_ref: false,
            });
            let mut wrapper = String::from(
                r#"#[doc = "flight-ffi contract|Callback and context are valid only until this function returns and must not be retained. The callback output buffer is valid only for the callback duration and must not be retained."]
#[doc = "flight-ffi ownership|owned-return|flight_build_particle_color_curve_result_free|Vec<f32>"]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_build_particle_color_curve(
    sample_fn: extern "C" fn(*mut std::ffi::c_void, f32, *mut f32) -> bool,
    sample_ctx: *mut std::ffi::c_void,
    samples: i32,
) -> *mut std::ffi::c_void {
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let mut values = Vec::new();
        flight_sdk::build_particle_color_curve(
            &mut values,
            &|value| {
                let mut color = [0.0_f32; 3];
                assert!(sample_fn(sample_ctx, value, color.as_mut_ptr()), "particle color callback failed");
                color
            },
            samples,
        );
        values
    }));
    match result {
        Ok(values) => Box::into_raw(Box::new(values)) as *mut std::ffi::c_void,
        Err(_) => std::ptr::null_mut(),
    }
}"#,
            );
            wrapper.push_str(&generate_vec_result_helpers(
                "flight_build_particle_color_curve",
                &value,
            ));
            return Some((wrapper, None));
        }
        "collect_import_diagnostics" => {
            assert_eq!(func.params.len(), 2);
            assert_eq!(func.params[0].ty, "&mut Vec<ImportDiagnostic>");
            assert_eq!(func.params[1].ty, "&dyn Fn(&mut Vec<ImportDiagnostic>)");
            return Some((
                String::from(
                    r#"#[doc = "flight-ffi contract|Callback and context are valid only until this function returns and must not be retained. The borrowed diagnostic-list handle is valid only for the callback duration and must not be retained or destroyed."]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_collect_import_diagnostics(out: *mut FfiImportDiagnosticList, run_fn: extern "C" fn(*mut std::ffi::c_void, *mut FfiImportDiagnosticList) -> bool, run_ctx: *mut std::ffi::c_void) -> bool {
    if !is_ffi_import_diagnostic_list(out) { return false; }
    unsafe { (*out).values.clear(); }
    std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| run_fn(run_ctx, out))).unwrap_or(false)
}"#,
                ),
                None,
            ));
        }
        "collect_scene2d_requirements" => {
            assert_eq!(func.params.len(), 1);
            assert_eq!(func.params[0].ty, "&dyn Fn(&mut Vec<Requirement>)");
            return Some((
                String::from(
                    r#"#[doc = "flight-ffi contract|Callback and context are valid only until this function returns and must not be retained. The borrowed requirement-list handle is valid only for the callback duration and must not be retained or destroyed."]
#[doc = "flight-ffi ownership|owned-return|flight_free_requirement_set|flight_sdk::RequirementSet"]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_collect_scene2d_requirements(
    run_fn: extern "C" fn(*mut std::ffi::c_void, *mut FfiRequirementList) -> bool,
    run_ctx: *mut std::ffi::c_void,
) -> *mut flight_sdk::RequirementSet {
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        flight_sdk::collect_scene2d_requirements(&|requirements| {
            let succeeded = ffi_with_requirement_list(requirements, |list| run_fn(run_ctx, list));
            assert!(succeeded, "requirement collector callback failed");
        })
    }));
    match result {
        Ok(requirements) => Box::into_raw(Box::new(requirements)),
        Err(_) => std::ptr::null_mut(),
    }
}"#,
                ),
                Some("flight_sdk::RequirementSet".to_string()),
            ));
        }
        "for_each_path_segment" => {
            assert_eq!(func.params.len(), 2);
            assert_eq!(func.params[0].ty, "&Path");
            assert_eq!(func.params[1].ty, "&mut dyn FnMut(PathSegment)");
            return Some((
                String::from(
                    r#"#[doc = "flight-ffi contract|Segment kind: 0 move, 1 line, 2 quadratic, 3 cubic, 4 close; unused coordinates are zero. Callback and context are valid only until this function returns and must not be retained."]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_for_each_path_segment(path: *const flight_sdk::Path, visitor_fn: extern "C" fn(*mut std::ffi::c_void, u32, f64, f64, f64, f64, f64, f64) -> bool, visitor_ctx: *mut std::ffi::c_void) -> bool {
    if path.is_null() { return false; }
    std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        flight_sdk::for_each_path_segment(unsafe { &*path }, &mut |segment| {
            let (kind, a, b, c, d, e, f) = match segment {
                flight_sdk::PathSegment::MoveTo { x, y } => (0, x, y, 0.0, 0.0, 0.0, 0.0),
                flight_sdk::PathSegment::LineTo { x, y } => (1, x, y, 0.0, 0.0, 0.0, 0.0),
                flight_sdk::PathSegment::QuadraticCurveTo { control_x, control_y, x, y } => (2, control_x, control_y, x, y, 0.0, 0.0),
                flight_sdk::PathSegment::CubicCurveTo { control_x1, control_y1, control_x2, control_y2, x, y } => (3, control_x1, control_y1, control_x2, control_y2, x, y),
                flight_sdk::PathSegment::Close => (4, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0),
            };
            assert!(visitor_fn(visitor_ctx, kind, a, b, c, d, e, f), "path segment callback failed");
        });
    }))
    .is_ok()
}"#,
                ),
                None,
            ));
        }
        _ => None,
    }
}

fn generate_ffi_wrapper(func: &ParsedFn) -> Option<(String, Option<String>)> {
    if explicit_skip_category(&func.name).is_some() {
        return None;
    }
    if func.lacks_public_export {
        return None;
    }
    if let Some(wrapper) = generate_task_m_wrapper(func) {
        return Some(wrapper);
    }

    let mut ffi_params = Vec::new();
    let mut call_args = Vec::new();
    let mut guard_bindings = Vec::new();
    let mut reader_writebacks = Vec::new();
    let shape_bounds_context = func
        .params
        .iter()
        .find(|param| is_shape_bounds_context(&param.ty))
        .map(|param| param.name.trim_start_matches('_').to_string());

    for param in &func.params {
        let resolved_ty = strip_crate_paths(&strip_lifetimes(&resolve_type_alias(param.ty.trim())));
        let mapped = map_param_to_ffi(&param.name, &param.ty)?;
        for (pname, pty) in &mapped.ffi_params {
            ffi_params.push(format!("{pname}: {pty}"));
        }
        guard_bindings.extend(mapped.bindings);
        call_args.push(mapped.call_expr);
        if resolved_ty == "&mut ByteReader<>" || resolved_ty == "&mut ByteReader" {
            let clean = param.name.trim_start_matches('_');
            reader_writebacks.push(format!(
                "        ffi_owned_{clean}.offset = sdk_{clean}.offset;"
            ));
        }

        let ty = resolved_ty;
        if let Some(trait_name) = extract_dyn_trait(&ty) {
            if let Some((_, ref_alias)) = DYN_OPAQUE_TRAITS.iter().find(|(n, _)| *n == trait_name) {
                let qualified_ref = qualify_type(ref_alias);
                let name = &param.name;
                let clean = name.trim_start_matches('_');
                if ty.starts_with("&mut ") {
                    guard_bindings.push(format!(
                        "    let arc_{clean} = unsafe {{ &*({name} as *const {qualified_ref}) }};\n    \
                         let mut guard_{clean} = arc_{clean}.write().unwrap();\n    \
                         let dyn_{clean}: &mut dyn {QUALIFIER}::{trait_name} = &mut *guard_{clean};"
                    ));
                } else {
                    guard_bindings.push(format!(
                        "    let arc_{clean} = unsafe {{ &*({name} as *const {qualified_ref}) }};\n    \
                         let guard_{clean} = arc_{clean}.read().unwrap();\n    \
                         let dyn_{clean}: &dyn {QUALIFIER}::{trait_name} = &*guard_{clean};"
                    ));
                }
            }
        }
    }

    let (ret_decl, call_wrap) = match (&shape_bounds_context, &func.ret) {
        (Some(_), None) => (" -> bool".to_string(), FfiReturn::Void),
        (Some(_), Some(_)) => return None,
        (None, None) => (String::new(), FfiReturn::Void),
        (None, Some(ty)) => map_return_to_ffi(ty)?,
    };
    // A returned disposer maps only for an allowlisted, callback-free call; the type alone is not
    // consent.
    if matches!(call_wrap, FfiReturn::DisposerReturn) {
        let param_types: Vec<String> = func
            .params
            .iter()
            .map(|param| strip_crate_paths(&resolve_type_alias(param.ty.trim())))
            .collect();
        let param_types: Vec<&str> = param_types.iter().map(String::as_str).collect();
        if !public_perimeter::is_disposer_function(&func.name, &param_types)
            && !RETAINED_CALLBACK_DISPOSER_FNS.contains(&func.name.as_str())
        {
            return None;
        }
    }
    append_tuple_out_params(&mut ffi_params, &call_wrap);
    append_borrowed_slice_out_param(&mut ffi_params, &call_wrap);
    append_async_callback_params(&mut ffi_params, &call_wrap);

    // An async value boxes its own output type, not the future the function returns.
    let (value_wrap, value_ty) = match &call_wrap {
        FfiReturn::AsyncCallback(spec) => (&spec.value, Some(spec.value_rust_ty.as_str())),
        _ => (&call_wrap, func.ret.as_deref()),
    };
    // A shared value is boxed, and read through result helpers, as the type it shares.
    let shared_ty = match value_wrap {
        FfiReturn::SharedClone(_) => value_ty.and_then(get_shared_value_type),
        _ => None,
    };
    let (value_wrap, value_ty) = match value_wrap {
        FfiReturn::SharedClone(value) => (&**value, shared_ty.as_deref()),
        _ => (value_wrap, value_ty),
    };
    let boxed_ty = boxed_type_for_return(value_wrap, value_ty);
    if matches!(
        value_wrap,
        FfiReturn::BoxReturn
            | FfiReturn::OptionBoxReturn
            | FfiReturn::ArcRefReturn
            | FfiReturn::OptionArcRefReturn
            | FfiReturn::ArrayOutReturn(_)
            | FfiReturn::PortsOutcomeReturn(_)
    ) && boxed_ty.is_none()
    {
        return None;
    }

    let ffi_name = format!("flight_{}", func.name);
    let mut call = format!(
        "{function}({args})",
        function = sdk_function_path(func),
        args = call_args.join(", ")
    );
    if !reader_writebacks.is_empty() {
        call = format!(
            "{{\n        let ffi_result = {call};\n{}\n        ffi_result\n    }}",
            reader_writebacks.join("\n")
        );
    }

    let preamble = if guard_bindings.is_empty() {
        String::new()
    } else {
        format!("{}\n", guard_bindings.join("\n"))
    };

    let body = if func.name == "watch_geolocation_position" {
        format!(
            "{preamble}    match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {call})) {{\n        Ok(value) => value,\n        Err(_) => i32::MIN,\n    }}"
        )
    } else if let Some(context) = shape_bounds_context {
        format!(
            "{preamble}    let call_succeeded = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {{\n        {call};\n    }})).is_ok();\n    return call_succeeded && !ffi_{context}.failed;"
        )
    } else {
        generate_return_body(&call_wrap, &call, &preamble)
    };
    let helpers = generate_vec_result_helpers(&ffi_name, value_wrap);
    let ownership = wrapper_ownership_doc(
        func,
        &ffi_name,
        value_wrap,
        boxed_ty.as_deref(),
        matches!(call_wrap, FfiReturn::AsyncCallback(_)),
    )
    .unwrap_or_default();

    // Parameter ownership notes travel as doc attributes into the C header.
    let mut notes: String = func
        .params
        .iter()
        .filter_map(|param| {
            get_param_ownership_note(&param.ty)
                .map(|note| format!("#[doc = \"ffi-param {}: {note}\"]\n", param.name))
        })
        .collect();
    if func.name == "connect_signal_at_frame_rate" {
        notes.push_str("#[doc = \"flight-ffi contract|Callback and context are retained until flight_call_disposer disconnects them; call flight_call_disposer before releasing the context, then call flight_free_disposer. Calling flight_free_disposer without first calling flight_call_disposer does not disconnect.\"]\n");
    }
    if func.name == "watch_geolocation_position" {
        notes.push_str("#[doc = \"flight-ffi contract|Handler and error contexts are retained until flight_clear_geolocation_watch(id); caller must keep them alive through the clear call.\"]\n");
    }
    if func.name == "write_file_atomic" {
        notes.push_str("#[doc = \"flight-ffi contract|data_kind tag: 0 means bytes; 1 means UTF-8 text; all other tags are invalid.\"]\n");
    }
    Some((
        format!(
            "{notes}{ownership}#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn {ffi_name}({params}){ret_decl} {{\n{body}\n}}{helpers}",
            params = ffi_params.join(", "),
        ),
        boxed_ty,
    ))
}

fn has_mono_dyn_param(func: &ParsedFn) -> bool {
    func.params.iter().any(|p| {
        mono_dyn_trait(&strip_crate_paths(&strip_lifetimes(&resolve_type_alias(
            p.ty.trim(),
        ))))
        .is_some()
    })
}

// The DYN_MONO trait behind `&dyn T`, `&mut dyn T`, `Option<&dyn T>` or `Option<&mut dyn T>`.
// Only monomorphized wrappers accept the optional forms: each becomes a nullable pointer to the
// concrete type. Opaque traits keep `extract_dyn_trait`, whose guard bindings are not optional.
fn mono_dyn_trait(ty: &str) -> Option<String> {
    let reference = ty
        .strip_prefix("Option<")
        .and_then(|inner| inner.strip_suffix('>'))
        .unwrap_or(ty);
    let trait_name = extract_dyn_trait(reference.trim())?;
    if DYN_MONO_TRAITS.iter().any(|(name, _)| *name == trait_name) {
        return Some(trait_name);
    }
    return None;
}

struct MonoParam {
    index: usize,
    #[allow(dead_code)]
    trait_name: String,
    concrete_types: Vec<String>,
}

fn collect_mono_params(func: &ParsedFn) -> Vec<MonoParam> {
    let mut result = Vec::new();
    for (i, p) in func.params.iter().enumerate() {
        let ty = strip_crate_paths(&strip_lifetimes(&resolve_type_alias(p.ty.trim())));
        if let Some(trait_name) = mono_dyn_trait(&ty) {
            if let Some((_, impls)) = DYN_MONO_TRAITS.iter().find(|(n, _)| *n == trait_name) {
                result.push(MonoParam {
                    index: i,
                    trait_name: trait_name.to_string(),
                    concrete_types: impls.iter().map(|s| s.to_string()).collect(),
                });
            }
        }
    }
    result
}

fn generate_mono_wrappers(func: &ParsedFn) -> Vec<(String, String, Option<String>)> {
    if explicit_skip_category(&func.name).is_some() || func.lacks_public_export {
        return Vec::new();
    }

    let mono_params = collect_mono_params(func);
    if mono_params.is_empty() {
        return Vec::new();
    }

    let (ret_decl, call_wrap) = match &func.ret {
        None => (String::new(), FfiReturn::Void),
        Some(ty) => match map_return_to_ffi(ty) {
            Some(r) => r,
            None => return Vec::new(),
        },
    };

    let (value_wrap, value_ty) = match &call_wrap {
        FfiReturn::AsyncCallback(spec) => (&spec.value, Some(spec.value_rust_ty.as_str())),
        _ => (&call_wrap, func.ret.as_deref()),
    };
    let shared_ty = match value_wrap {
        FfiReturn::SharedClone(_) => value_ty.and_then(get_shared_value_type),
        _ => None,
    };
    let (value_wrap, value_ty) = match value_wrap {
        FfiReturn::SharedClone(value) => (&**value, shared_ty.as_deref()),
        _ => (value_wrap, value_ty),
    };
    let boxed_ty = boxed_type_for_return(value_wrap, value_ty);
    if matches!(
        value_wrap,
        FfiReturn::BoxReturn
            | FfiReturn::OptionBoxReturn
            | FfiReturn::ArcRefReturn
            | FfiReturn::OptionArcRefReturn
            | FfiReturn::ArrayOutReturn(_)
            | FfiReturn::PortsOutcomeReturn(_)
    ) && boxed_ty.is_none()
    {
        return Vec::new();
    }

    let mut combos: Vec<Vec<(usize, &str)>> = vec![vec![]];
    for mp in &mono_params {
        let mut new_combos = Vec::new();
        for existing in &combos {
            for concrete in &mp.concrete_types {
                let mut combo = existing.clone();
                combo.push((mp.index, concrete.as_str()));
                new_combos.push(combo);
            }
        }
        combos = new_combos;
    }

    let mut wrappers = Vec::new();
    for combo in &combos {
        let suffix: Vec<String> = combo.iter().map(|(_, ty)| to_snake_case(ty)).collect();
        let ffi_name = format!("flight_{}__{}", func.name, suffix.join("__"));

        let mut ffi_params = Vec::new();
        let mut call_args = Vec::new();
        let mut bindings = Vec::new();
        let mut ok = true;

        for (i, param) in func.params.iter().enumerate() {
            if let Some((_, concrete_ty)) = combo.iter().find(|(idx, _)| *idx == i) {
                let ty = strip_crate_paths(&strip_lifetimes(&resolve_type_alias(param.ty.trim())));
                let qualified = qualify_type(concrete_ty);
                let trait_name = mono_dyn_trait(&ty).unwrap();
                let name = &param.name;
                if ty.starts_with("Option<&mut ") {
                    ffi_params.push(format!("{name}: *mut {qualified}"));
                    call_args.push(format!(
                        "if {name}.is_null() {{ None }} else {{ Some(unsafe {{ &mut *{name} }} as &mut dyn {QUALIFIER}::{trait_name}) }}"
                    ));
                } else if ty.starts_with("Option<&") {
                    ffi_params.push(format!("{name}: *const {qualified}"));
                    call_args.push(format!(
                        "if {name}.is_null() {{ None }} else {{ Some(unsafe {{ &*{name} }} as &dyn {QUALIFIER}::{trait_name}) }}"
                    ));
                } else if ty.starts_with("&mut ") {
                    ffi_params.push(format!("{}: *mut {qualified}", param.name));
                    call_args.push(format!(
                        "unsafe {{ &mut *{name} }} as &mut dyn {QUALIFIER}::{trait_name}",
                        name = param.name
                    ));
                } else {
                    ffi_params.push(format!("{}: *const {qualified}", param.name));
                    call_args.push(format!(
                        "unsafe {{ &*{name} }} as &dyn {QUALIFIER}::{trait_name}",
                        name = param.name
                    ));
                }
            } else {
                match map_param_to_ffi(&param.name, &param.ty) {
                    Some(mapped) => {
                        for (pname, pty) in &mapped.ffi_params {
                            ffi_params.push(format!("{pname}: {pty}"));
                        }
                        bindings.extend(mapped.bindings);
                        call_args.push(mapped.call_expr);
                    }
                    None => {
                        ok = false;
                        break;
                    }
                }
            }
        }

        if !ok {
            continue;
        }
        append_tuple_out_params(&mut ffi_params, &call_wrap);
        append_borrowed_slice_out_param(&mut ffi_params, &call_wrap);

        let call = format!(
            "{function}({args})",
            function = sdk_function_path(func),
            args = call_args.join(", ")
        );

        let preamble = if bindings.is_empty() {
            String::new()
        } else {
            format!("{}\n", bindings.join("\n"))
        };
        let body = generate_return_body(&call_wrap, &call, &preamble);
        let helpers = generate_vec_result_helpers(&ffi_name, value_wrap);
        let ownership = wrapper_ownership_doc(
            func,
            &ffi_name,
            value_wrap,
            boxed_ty.as_deref(),
            matches!(call_wrap, FfiReturn::AsyncCallback(_)),
        )
        .unwrap_or_default();
        let notes: String = func
            .params
            .iter()
            .filter_map(|param| {
                get_param_ownership_note(&param.ty)
                    .map(|note| format!("#[doc = \"ffi-param {}: {note}\"]\n", param.name))
            })
            .collect();

        wrappers.push((
            ffi_name.clone(),
            format!(
                "{notes}{ownership}#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn {ffi_name}({params}){ret_decl} {{\n{body}\n}}{helpers}",
                params = ffi_params.join(", "),
            ),
            boxed_ty.clone(),
        ));
    }
    wrappers
}

enum FfiReturn {
    Void,
    Direct,
    BoxReturn,
    OptionBoxReturn,
    StringReturn,
    OptionStringReturn,
    ArcRefReturn,
    OptionArcRefReturn,
    EnumReturn,
    OptionEnumReturn,
    OptionF32Return,
    OptionF64Return,
    OptionI32Return,
    OptionU32Return,
    OptionBoolReturn,
    // A copied byte buffer plus cursor. SDK ByteReader values borrow transient views of this data.
    OwnedByteReaderReturn,
    // Owned snapshots of the two public process-static effect metadata slices.
    EffectInputSliceReturn,
    EffectKindSliceReturn,
    VecReturn(VecReturnSpec),
    OptionVecReturn(VecReturnSpec),
    HashMapReturn(HashMapReturnSpec),
    OptionHashMapReturn(HashMapReturnSpec),
    // The element type of a boxed scalar slice (`Box<[T]>`).
    BoxSliceReturn(String),
    OptionBoxSliceReturn(String),
    TupleReturn(Vec<String>),
    OptionTupleReturn(Vec<String>),
    // The scalar element type of a copied borrowed slice. The FFI owns the copied Vec.
    SliceReturn(String),
    // A borrowed non-scalar slice returns its base and writes its length to `out_len`.
    BorrowedSliceReturn,
    RefReturn,
    OptionRefReturn,
    OptionBorrowedRefReturn,
    AsyncCallback(Box<AsyncCallbackSpec>),
    // `Arc<T>` / `Option<Arc<T>>`: the shared value is immutable, so C receives an owned clone of T
    // through T's own carrier and frees it as it would a T return.
    SharedClone(Box<FfiReturn>),
    // The scalar element type of a boxed `Vec<Vec<T>>`, read one inner list at a time.
    NestedVecReturn(String),
    // A fixed array of owned structs, written as boxed handles into the caller's `out_values` array.
    ArrayOutReturn(String),
    // `AccessibilityOperationOutcome<R>`: true when the operation ran; otherwise false with the
    // block reason discriminant written to `out_0`.
    OperationOutcomeReturn,
    // `MidiAccessPortsOutcome<P>`: a boxed outcome read through its `_result_*` helpers, holding the
    // qualified port type P.
    PortsOutcomeReturn(String),
    // `XmlRecord<String, String>`: a boxed record read by index or key through `_result_*` helpers.
    StringRecordReturn,
    // `Arc<dyn Fn() + Send + Sync>` returned as a disposer: a boxed `FfiDisposer` handle.
    DisposerReturn,
}

// A future return lowered to `complete_fn(complete_ctx, value, error)`: `value` is `value_ty`,
// converted from the future's output exactly as the synchronous `value` return would be.
struct AsyncCallbackSpec {
    value: FfiReturn,
    value_ty: String,
    value_rust_ty: String,
    fallible: bool,
}

struct VecReturnSpec {
    element_ty: String,
    element_is_ref: bool,
}

struct HashMapReturnSpec {
    value_ty: String,
}

fn async_future_output(ty: &str) -> Option<(&str, bool)> {
    for &(alias, fallible) in ASYNC_FUTURE_ALIASES {
        if let Some(output) = ty
            .strip_prefix(alias)
            .and_then(|rest| rest.strip_prefix('<'))
            .and_then(|rest| rest.strip_suffix('>'))
        {
            return Some((output.trim(), fallible));
        }
    }
    None
}

// Owned carriers only: a borrowed return cannot outlive the settled future, and
// tuple out-parameters have no place in a callback.
fn is_async_callback_value(value: &FfiReturn) -> bool {
    !matches!(
        value,
        FfiReturn::Void
            | FfiReturn::TupleReturn(_)
            | FfiReturn::OptionTupleReturn(_)
            | FfiReturn::SliceReturn(_)
            | FfiReturn::BorrowedSliceReturn
            | FfiReturn::RefReturn
            | FfiReturn::OptionRefReturn
            | FfiReturn::OptionBorrowedRefReturn
            | FfiReturn::AsyncCallback(_)
            | FfiReturn::ArrayOutReturn(_)
            | FfiReturn::OperationOutcomeReturn
    )
}

fn append_tuple_out_params(ffi_params: &mut Vec<String>, call_wrap: &FfiReturn) {
    if matches!(call_wrap, FfiReturn::ArrayOutReturn(_)) {
        ffi_params.push("out_values: *mut *mut std::ffi::c_void".to_string());
        return;
    }
    if matches!(call_wrap, FfiReturn::OperationOutcomeReturn) {
        ffi_params.push("out_0: *mut u32".to_string());
        return;
    }
    let (FfiReturn::TupleReturn(elements) | FfiReturn::OptionTupleReturn(elements)) = call_wrap
    else {
        return;
    };
    for (index, element) in elements.iter().enumerate() {
        ffi_params.push(format!("out_{index}: *mut {element}"));
    }
}

fn append_borrowed_slice_out_param(ffi_params: &mut Vec<String>, call_wrap: &FfiReturn) {
    if matches!(call_wrap, FfiReturn::BorrowedSliceReturn) {
        ffi_params.push("out_len: *mut usize".to_string());
    }
}

fn append_async_callback_params(ffi_params: &mut Vec<String>, call_wrap: &FfiReturn) {
    let FfiReturn::AsyncCallback(spec) = call_wrap else {
        return;
    };
    ffi_params.push(format!(
        "complete_fn: extern \"C\" fn(*mut std::ffi::c_void, {}, *mut std::ffi::c_char)",
        spec.value_ty
    ));
    ffi_params.push("complete_ctx: *mut std::ffi::c_void".to_string());
}

// The value a callback receives alongside a non-null error: null for handles, false, NaN, -1 for
// signed carriers (the `Option<enum>` / `Option<u32>` / `Option<bool>` sentinel), and 0 otherwise.
fn get_async_callback_empty_value(value_ty: &str) -> &'static str {
    if value_ty.starts_with("*mut ") {
        return "std::ptr::null_mut()";
    }
    match value_ty {
        "bool" => "false",
        "f32" => "f32::NAN",
        "f64" => "f64::NAN",
        "i8" | "i16" | "i32" | "i64" | "isize" => "-1",
        _ => "0",
    }
}

// The caller-owned `error` string is null on success; on rejection, or a panic while building or
// polling the future, `value` is the type's empty carrier.
fn generate_async_callback_body(spec: &AsyncCallbackSpec, call: &str, preamble: &str) -> String {
    let value_ty = &spec.value_ty;
    let convert = generate_return_body(&spec.value, "value", "");
    let empty = get_async_callback_empty_value(value_ty);
    let settled =
        format!("((move || -> {value_ty} {{\n{convert}\n            }})(), std::ptr::null_mut())");
    let arms = if spec.fallible {
        format!(
            "            Ok(Ok(value)) => {settled},\n            \
                 Ok(Err(error)) => ({empty}, crate::async_callback::get_ffi_async_error_string(&error)),\n            \
                 Err(error) => ({empty}, error),"
        )
    } else {
        format!(
            "            Ok(value) => {settled},\n            \
                 Err(error) => ({empty}, error),"
        )
    };
    // A panic while building the future (a parameter binding's assertion, a typed throw, or a host
    // provider panicking before it returns a future) completes the callback once, here, and nothing
    // is driven; so the parameter preamble runs inside the same guarded closure as the call.
    format!(
        "    let future = match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {{\n{preamble}    {call}\n    }})) {{\n        \
                 Ok(future) => future,\n        \
                 Err(payload) => {{\n            \
                     complete_fn(complete_ctx, {empty}, crate::async_callback::get_ffi_async_panic_string(payload));\n            \
                     return;\n        \
                 }}\n    \
             }};\n    \
             let complete_ctx = crate::async_callback::FfiAsyncContext(complete_ctx);\n    \
             crate::async_callback::drive_ffi_async(Box::pin(async move {{\n        \
                 let (value, error) = match crate::async_callback::settle_ffi_async(future).await {{\n{arms}\n        \
                 }};\n        \
                 complete_fn(crate::async_callback::get_ffi_async_context(&complete_ctx), value, error);\n    \
             }}));"
    )
}

fn generate_return_body(call_wrap: &FfiReturn, call: &str, preamble: &str) -> String {
    match call_wrap {
        FfiReturn::AsyncCallback(spec) => generate_async_callback_body(spec, call, preamble),
        FfiReturn::SharedClone(value) => {
            let call = if matches!(
                **value,
                FfiReturn::OptionBoxReturn | FfiReturn::OptionVecReturn(_)
            ) {
                format!("{call}.map(|shared| (*shared).clone())")
            } else {
                format!("(*{call}).clone()")
            };
            generate_return_body(value, &call, preamble)
        }
        FfiReturn::Void => format!("{preamble}    {call};"),
        FfiReturn::Direct => format!("{preamble}    return {call};"),
        FfiReturn::BoxReturn => {
            format!("{preamble}    return Box::into_raw(Box::new({call}));")
        }
        FfiReturn::StringReturn => format!(
            "{preamble}    let s = {call};\n    \
                 let c_str = std::ffi::CString::new(s).unwrap_or_default();\n    \
                 return c_str.into_raw();"
        ),
        FfiReturn::OptionStringReturn => format!(
            "{preamble}    match {call} {{\n        \
                 Some(s) => std::ffi::CString::new(s).unwrap_or_default().into_raw(),\n        \
                 None => std::ptr::null_mut(),\n    \
                 }}"
        ),
        FfiReturn::ArcRefReturn => format!(
            "{preamble}    let arc = {call};\n    \
                 return Box::into_raw(Box::new(arc)) as *mut std::ffi::c_void;"
        ),
        FfiReturn::OptionArcRefReturn => format!(
            "{preamble}    match {call} {{\n        \
                 Some(arc) => Box::into_raw(Box::new(arc)) as *mut std::ffi::c_void,\n        \
                 None => std::ptr::null_mut(),\n    \
                 }}"
        ),
        FfiReturn::EnumReturn => format!("{preamble}    return {call} as u32;"),
        FfiReturn::OptionEnumReturn => format!(
            "{preamble}    match {call} {{\n        \
                 Some(v) => v as i32,\n        \
                 None => -1,\n    \
                 }}"
        ),
        FfiReturn::OptionF32Return => format!(
            "{preamble}    match {call} {{\n        \
                 Some(v) => v,\n        \
                 None => f32::NAN,\n    \
                 }}"
        ),
        FfiReturn::OptionF64Return => format!(
            "{preamble}    match {call} {{\n        \
                 Some(v) => v,\n        \
                 None => f64::NAN,\n    \
                 }}"
        ),
        FfiReturn::OptionI32Return => format!(
            "{preamble}    match {call} {{\n        \
                 Some(v) => v as i64,\n        \
                 None => i64::MIN,\n    \
                 }}"
        ),
        FfiReturn::OptionU32Return => format!(
            "{preamble}    match {call} {{\n        \
                 Some(v) => v as i64,\n        \
                 None => -1,\n    \
                 }}"
        ),
        FfiReturn::OptionBoolReturn => format!(
            "{preamble}    match {call} {{\n        \
                 Some(v) => v as i32,\n        \
                 None => -1,\n    \
                 }}"
        ),
        FfiReturn::OwnedByteReaderReturn => format!(
            "{preamble}    let reader = {call};\n    \
                 return Box::into_raw(Box::new(FfiOwnedByteReader {{ bytes: reader.view.to_vec().into_boxed_slice(), offset: reader.offset }}));"
        ),
        FfiReturn::EffectInputSliceReturn => format!(
            "{preamble}    let values = {call};\n    \
                 return Box::into_raw(Box::new(values.to_vec())) as *mut std::ffi::c_void;"
        ),
        FfiReturn::EffectKindSliceReturn => format!(
            "{preamble}    let values: Vec<String> = {call}.iter().map(|value| (*value).to_owned()).collect();\n    \
                 return Box::into_raw(Box::new(values)) as *mut std::ffi::c_void;"
        ),
        FfiReturn::OptionBoxReturn => format!(
            "{preamble}    match {call} {{\n        \
                 Some(v) => Box::into_raw(Box::new(v)),\n        \
                 None => std::ptr::null_mut(),\n    \
                 }}"
        ),
        FfiReturn::SliceReturn(_) => format!(
            "{preamble}    let slice = {call};\n    \
                 return Box::into_raw(Box::new(slice.to_vec())) as *mut std::ffi::c_void;"
        ),
        FfiReturn::BorrowedSliceReturn => format!(
            "{preamble}    let slice = {call};\n    \
                 if !out_len.is_null() {{ unsafe {{ *out_len = slice.len(); }} }}\n    \
                 return slice.as_ptr();"
        ),
        FfiReturn::RefReturn => format!("{preamble}    return {call} as *const _;"),
        FfiReturn::OptionRefReturn => format!(
            "{preamble}    match {call} {{\n        \
                 Some(v) => v.as_ptr(),\n        \
                 None => std::ptr::null(),\n    \
                 }}"
        ),
        FfiReturn::OptionBorrowedRefReturn => format!(
            "{preamble}    match {call} {{\n        \
                 Some(v) => v as *const _,\n        \
                 None => std::ptr::null(),\n    \
                 }}"
        ),
        FfiReturn::VecReturn(_) | FfiReturn::HashMapReturn(_) | FfiReturn::BoxSliceReturn(_) => {
            format!(
                "{preamble}    let vec = {call};\n    \
                 return Box::into_raw(Box::new(vec)) as *mut std::ffi::c_void;"
            )
        }
        FfiReturn::OptionVecReturn(_)
        | FfiReturn::OptionHashMapReturn(_)
        | FfiReturn::OptionBoxSliceReturn(_) => format!(
            "{preamble}    match {call} {{\n        \
                 Some(vec) => Box::into_raw(Box::new(vec)) as *mut std::ffi::c_void,\n        \
                 None => std::ptr::null_mut(),\n    \
                 }}"
        ),
        FfiReturn::NestedVecReturn(_) => format!(
            "{preamble}    let lists = {call};\n    \
                 return Box::into_raw(Box::new(lists)) as *mut std::ffi::c_void;"
        ),
        // Null `out_values` drops the values; otherwise every slot receives an owned handle.
        FfiReturn::ArrayOutReturn(_) => format!(
            "{preamble}    let values = {call};\n    \
                 if out_values.is_null() {{ return; }}\n    \
                 for (index, value) in values.into_iter().enumerate() {{\n        \
                     unsafe {{ *out_values.add(index) = Box::into_raw(Box::new(value)) as *mut std::ffi::c_void; }}\n    \
                 }}"
        ),
        FfiReturn::OperationOutcomeReturn => format!(
            "{preamble}    match {call} {{\n        \
                 flight_sdk::AccessibilityOperationOutcome::Ok(_) => true,\n        \
                 flight_sdk::AccessibilityOperationOutcome::Blocked(blocked) => {{\n            \
                     if !out_0.is_null() {{ unsafe {{ *out_0 = blocked.reason as u32; }} }}\n            \
                     false\n        \
                 }}\n    \
                 }}"
        ),
        FfiReturn::DisposerReturn => format!(
            "{preamble}    let dispose = {call};\n    \
                 return Box::into_raw(Box::new(FfiDisposer {{ dispose }}));"
        ),
        FfiReturn::StringRecordReturn => format!(
            "{preamble}    let record = {call};\n    \
                 return Box::into_raw(Box::new(record)) as *mut std::ffi::c_void;"
        ),
        FfiReturn::PortsOutcomeReturn(_) => format!(
            "{preamble}    let outcome = {call};\n    \
                 return Box::into_raw(Box::new(outcome)) as *mut std::ffi::c_void;"
        ),
        FfiReturn::TupleReturn(elements) => {
            let mut body = format!("{preamble}    let result = {call};");
            for (index, _) in elements.iter().enumerate() {
                write!(
                    body,
                    "\n    if !out_{index}.is_null() {{ unsafe {{ *out_{index} = result.{index}; }} }}"
                )
                .unwrap();
            }
            body
        }
        // Present -> true with every element written; absent -> false with outputs untouched.
        FfiReturn::OptionTupleReturn(elements) => {
            let mut body = format!(
                "{preamble}    let Some(result) = {call} else {{\n        return false;\n    }};"
            );
            for (index, _) in elements.iter().enumerate() {
                write!(
                    body,
                    "\n    if !out_{index}.is_null() {{ unsafe {{ *out_{index} = result.{index}; }} }}"
                )
                .unwrap();
            }
            body.push_str("\n    return true;");
            body
        }
    }
}

// A boxed `Vec<T>` or `Box<[T]>` result handle reads through `_result_len` / `_result_get` and is
// released by `_result_free`. Both are contiguous, so `_result_get(result, 0)` of a scalar slice is
// the base of `_result_len` elements.
fn generate_vec_result_helpers(ffi_name: &str, call_wrap: &FfiReturn) -> String {
    if matches!(call_wrap, FfiReturn::EffectInputSliceReturn) {
        return generate_effect_input_result_helpers(ffi_name);
    }
    if matches!(call_wrap, FfiReturn::EffectKindSliceReturn) {
        return generate_effect_kind_result_helpers(ffi_name);
    }
    if let FfiReturn::HashMapReturn(spec) | FfiReturn::OptionHashMapReturn(spec) = call_wrap {
        return generate_hash_map_result_helpers(ffi_name, spec);
    }
    let (element_ty, element_is_ref, container) = match call_wrap {
        FfiReturn::VecReturn(spec) | FfiReturn::OptionVecReturn(spec) => (
            spec.element_ty.as_str(),
            spec.element_is_ref,
            format!("Vec<{}>", spec.element_ty),
        ),
        FfiReturn::BoxSliceReturn(element) | FfiReturn::OptionBoxSliceReturn(element) => {
            (element.as_str(), false, format!("Box<[{element}]>"))
        }
        FfiReturn::SliceReturn(element) => (element.as_str(), false, format!("Vec<{element}>")),
        FfiReturn::NestedVecReturn(element) => {
            return generate_nested_vec_result_helpers(ffi_name, element);
        }
        FfiReturn::PortsOutcomeReturn(port) => {
            return generate_ports_outcome_result_helpers(ffi_name, port);
        }
        FfiReturn::StringRecordReturn => return generate_string_record_result_helpers(ffi_name),
        _ => return String::new(),
    };
    let get_return = if element_is_ref {
        "*const std::ffi::c_void".to_string()
    } else {
        format!("*const {element_ty}")
    };
    let get_value = if element_is_ref {
        "value as *const _ as *const std::ffi::c_void".to_string()
    } else {
        "value as *const _".to_string()
    };
    let borrowed = borrowed_ownership_doc(&format!("the {ffi_name} result handle remains alive"));
    format!(
        "\n#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn {ffi_name}_result_len(result: *const std::ffi::c_void) -> usize {{\n    if result.is_null() {{ return 0; }}\n    return unsafe {{ &*(result as *const {container}) }}.len();\n}}\n{borrowed}#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn {ffi_name}_result_get(result: *const std::ffi::c_void, index: usize) -> {get_return} {{\n    if result.is_null() {{ return std::ptr::null(); }}\n    match unsafe {{ &*(result as *const {container}) }}.get(index) {{\n        Some(value) => {get_value},\n        None => std::ptr::null(),\n    }}\n}}\n#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn {ffi_name}_result_free(result: *mut {container}) {{\n    if !result.is_null() {{ unsafe {{ drop(Box::from_raw(result)); }} }}\n}}"
    )
}

// A boxed `HashMap<String, V>` result exposes borrowed value pointers and independently owned key
// strings. The map owns every value until `_result_free`; each key copy uses `flight_free_string`.
fn generate_hash_map_result_helpers(ffi_name: &str, spec: &HashMapReturnSpec) -> String {
    let value = &spec.value_ty;
    let container = format!("std::collections::HashMap<String, {value}>");
    let borrowed = borrowed_ownership_doc(&format!("the {ffi_name} result handle remains alive"));
    let owned_key = ownership_doc("owned-return", "flight_free_string", "std::ffi::c_char");
    format!(
        "\n#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn {ffi_name}_result_len(result: *const std::ffi::c_void) -> usize {{\n    if result.is_null() {{ return 0; }}\n    return unsafe {{ &*(result as *const {container}) }}.len();\n}}\n{borrowed}#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn {ffi_name}_result_get(result: *const std::ffi::c_void, key: *const std::ffi::c_char) -> *const {value} {{\n    if result.is_null() || key.is_null() {{ return std::ptr::null(); }}\n    let key = unsafe {{ std::ffi::CStr::from_ptr(key) }}.to_str().unwrap_or(\"\");\n    match unsafe {{ &*(result as *const {container}) }}.get(key) {{\n        Some(value) => value as *const _,\n        None => std::ptr::null(),\n    }}\n}}\n{owned_key}#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn {ffi_name}_result_get_key(result: *const std::ffi::c_void, index: usize) -> *mut std::ffi::c_char {{\n    if result.is_null() {{ return std::ptr::null_mut(); }}\n    match unsafe {{ &*(result as *const {container}) }}.keys().nth(index) {{\n        Some(key) => std::ffi::CString::new(key.as_str()).unwrap_or_default().into_raw(),\n        None => std::ptr::null_mut(),\n    }}\n}}\n#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn {ffi_name}_result_free(result: *mut {container}) {{\n    if !result.is_null() {{ unsafe {{ drop(Box::from_raw(result)); }} }}\n}}"
    )
}

// Process-static effect metadata crosses the ABI as an owned snapshot. Enum reads use -1 for a
// null handle or out-of-range index; kind reads return independent owned strings.
fn generate_effect_input_result_helpers(ffi_name: &str) -> String {
    let container = "Vec<flight_sdk::EffectInput>";
    format!(
        "\n#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn {ffi_name}_result_len(result: *const std::ffi::c_void) -> usize {{\n    if result.is_null() {{ return 0; }}\n    return unsafe {{ &*(result as *const {container}) }}.len();\n}}\n#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn {ffi_name}_result_get(result: *const std::ffi::c_void, index: usize) -> i32 {{\n    if result.is_null() {{ return -1; }}\n    return unsafe {{ &*(result as *const {container}) }}.get(index).map_or(-1, |value| *value as i32);\n}}\n#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn {ffi_name}_result_free(result: *mut {container}) {{\n    if !result.is_null() {{ unsafe {{ drop(Box::from_raw(result)); }} }}\n}}"
    )
}

fn generate_effect_kind_result_helpers(ffi_name: &str) -> String {
    let container = "Vec<String>";
    let owned = ownership_doc("owned-return", "flight_free_string", "std::ffi::c_char");
    format!(
        "\n#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn {ffi_name}_result_len(result: *const std::ffi::c_void) -> usize {{\n    if result.is_null() {{ return 0; }}\n    return unsafe {{ &*(result as *const {container}) }}.len();\n}}\n{owned}#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn {ffi_name}_result_get(result: *const std::ffi::c_void, index: usize) -> *mut std::ffi::c_char {{\n    if result.is_null() {{ return std::ptr::null_mut(); }}\n    match unsafe {{ &*(result as *const {container}) }}.get(index) {{\n        Some(value) => std::ffi::CString::new(value.as_str()).unwrap_or_default().into_raw(),\n        None => std::ptr::null_mut(),\n    }}\n}}\n#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn {ffi_name}_result_free(result: *mut {container}) {{\n    if !result.is_null() {{ unsafe {{ drop(Box::from_raw(result)); }} }}\n}}"
    )
}

// A boxed `Vec<Vec<T>>` result: `_result_len` counts the inner lists, `_result_get_len` and
// `_result_get` give one inner list's length and base (null when out of range or empty), and
// `_result_free` releases every list. Inner bases stay valid until that free.
fn generate_nested_vec_result_helpers(ffi_name: &str, element: &str) -> String {
    let container = format!("Vec<Vec<{element}>>");
    let borrowed = borrowed_ownership_doc(&format!("the {ffi_name} result handle remains alive"));
    format!(
        "\n#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn {ffi_name}_result_len(result: *const std::ffi::c_void) -> usize {{\n    if result.is_null() {{ return 0; }}\n    return unsafe {{ &*(result as *const {container}) }}.len();\n}}\n{borrowed}#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn {ffi_name}_result_get(result: *const std::ffi::c_void, index: usize) -> *const {element} {{\n    if result.is_null() {{ return std::ptr::null(); }}\n    match unsafe {{ &*(result as *const {container}) }}.get(index) {{\n        Some(list) if !list.is_empty() => list.as_ptr(),\n        _ => std::ptr::null(),\n    }}\n}}\n#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn {ffi_name}_result_get_len(result: *const std::ffi::c_void, index: usize) -> usize {{\n    if result.is_null() {{ return 0; }}\n    return unsafe {{ &*(result as *const {container}) }}.get(index).map_or(0, |list| list.len());\n}}\n#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn {ffi_name}_result_free(result: *mut {container}) {{\n    if !result.is_null() {{ unsafe {{ drop(Box::from_raw(result)); }} }}\n}}"
    )
}

// A boxed `MidiAccessPortsOutcome<P>` result: `_result_reason` is the reason discriminant (-1 for
// NULL), `_result_has_ports` tells an absent list from an empty one, and `_result_len` counts ports.
// `_result_get` returns an owned clone of one port's Ref handle (NULL for NULL or out of range) that
// outlives the outcome and is released once by `flight_free_<port>_ref`.
fn generate_ports_outcome_result_helpers(ffi_name: &str, port: &str) -> String {
    let container = format!("flight_sdk::MidiAccessPortsOutcome<{port}>");
    let owned_port = format!("flight_sdk::Ref<{port}>");
    let owned = ownership_doc(
        "owned-return",
        &format!("flight_free_{}", boxed_free_suffix(&owned_port)),
        &owned_port,
    );
    format!(
        "\n#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn {ffi_name}_result_reason(result: *const std::ffi::c_void) -> i32 {{\n    if result.is_null() {{ return -1; }}\n    return unsafe {{ &*(result as *const {container}) }}.reason as i32;\n}}\n#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn {ffi_name}_result_has_ports(result: *const std::ffi::c_void) -> bool {{\n    if result.is_null() {{ return false; }}\n    return unsafe {{ &*(result as *const {container}) }}.ports.is_some();\n}}\n#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn {ffi_name}_result_len(result: *const std::ffi::c_void) -> usize {{\n    if result.is_null() {{ return 0; }}\n    return unsafe {{ &*(result as *const {container}) }}.ports.as_ref().map_or(0, |ports| ports.len());\n}}\n{owned}#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn {ffi_name}_result_get(result: *const std::ffi::c_void, index: usize) -> *mut std::ffi::c_void {{\n    if result.is_null() {{ return std::ptr::null_mut(); }}\n    match unsafe {{ &*(result as *const {container}) }}.ports.as_ref().and_then(|ports| ports.get(index)) {{\n        Some(port) => Box::into_raw(Box::new(port.clone())) as *mut std::ffi::c_void,\n        None => std::ptr::null_mut(),\n    }}\n}}\n#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn {ffi_name}_result_free(result: *mut {container}) {{\n    if !result.is_null() {{ unsafe {{ drop(Box::from_raw(result)); }} }}\n}}"
    )
}

// A boxed `XmlRecord<String, String>` result: `_result_len` counts entries, `_result_get_key` /
// `_result_get_value` read one entry in insertion order, and `_result_get` looks a value up by key.
// Every string is an owned copy freed with `flight_free_string`; missing entries read NULL.
fn generate_string_record_result_helpers(ffi_name: &str) -> String {
    // The record type is public through `parse_xml_attributes` but lives in the `xml_native` module.
    let container = "flight_sdk::xml_native::XmlRecord<String, String>";
    let owned = ownership_doc("owned-return", "flight_free_string", "std::ffi::c_char");
    format!(
        "\n#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn {ffi_name}_result_len(result: *const std::ffi::c_void) -> usize {{\n    if result.is_null() {{ return 0; }}\n    return unsafe {{ &*(result as *const {container}) }}.len();\n}}\n{owned}#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn {ffi_name}_result_get(result: *const std::ffi::c_void, key: *const std::ffi::c_char) -> *mut std::ffi::c_char {{\n    if result.is_null() || key.is_null() {{ return std::ptr::null_mut(); }}\n    let key = unsafe {{ std::ffi::CStr::from_ptr(key) }}.to_str().unwrap_or(\"\");\n    match unsafe {{ &*(result as *const {container}) }}.get(key) {{\n        Some(value) => std::ffi::CString::new(value.as_str()).unwrap_or_default().into_raw(),\n        None => std::ptr::null_mut(),\n    }}\n}}\n{owned}#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn {ffi_name}_result_get_key(result: *const std::ffi::c_void, index: usize) -> *mut std::ffi::c_char {{\n    if result.is_null() {{ return std::ptr::null_mut(); }}\n    match unsafe {{ &*(result as *const {container}) }}.keys().nth(index) {{\n        Some(key) => std::ffi::CString::new(key.as_str()).unwrap_or_default().into_raw(),\n        None => std::ptr::null_mut(),\n    }}\n}}\n{owned}#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn {ffi_name}_result_get_value(result: *const std::ffi::c_void, index: usize) -> *mut std::ffi::c_char {{\n    if result.is_null() {{ return std::ptr::null_mut(); }}\n    let record = unsafe {{ &*(result as *const {container}) }};\n    match record.keys().nth(index).and_then(|key| record.get(key.as_str())) {{\n        Some(value) => std::ffi::CString::new(value.as_str()).unwrap_or_default().into_raw(),\n        None => std::ptr::null_mut(),\n    }}\n}}\n#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn {ffi_name}_result_free(result: *mut {container}) {{\n    if !result.is_null() {{ unsafe {{ drop(Box::from_raw(result)); }} }}\n}}"
    )
}

// All generated borrowed slices route through these helpers. Rust requires even an empty slice's
// pointer to be non-null and aligned, so a C NULL+zero pair is replaced with a dangling aligned
// pointer before constructing the empty slice. NULL+nonzero remains a caller contract violation.
fn generate_checked_slice_support() -> &'static str {
    r#"unsafe fn ffi_slice_from_raw_parts<'a, T>(values: *const T, count: usize) -> &'a [T] {
    assert!(!values.is_null() || count == 0, "null slice must have length zero");
    let values = if values.is_null() { std::ptr::NonNull::<T>::dangling().as_ptr() } else { values };
    unsafe { std::slice::from_raw_parts(values, count) }
}
unsafe fn ffi_slice_from_raw_parts_mut<'a, T>(values: *mut T, count: usize) -> &'a mut [T] {
    assert!(!values.is_null() || count == 0, "null mutable slice must have length zero");
    let values = if values.is_null() { std::ptr::NonNull::<T>::dangling().as_ptr() } else { values };
    unsafe { std::slice::from_raw_parts_mut(values, count) }
}
unsafe fn ffi_owned_c_string_array(values: *const *const std::ffi::c_char, count: usize) -> Vec<String> {
    unsafe { ffi_slice_from_raw_parts(values, count) }.iter().map(|value| {
        assert!(!value.is_null(), "string array contains a null pointer");
        unsafe { std::ffi::CStr::from_ptr(*value) }
            .to_str()
            .expect("string array contains invalid UTF-8")
            .to_owned()
    }).collect()
}
"#
}

// The FFI owns the bytes independently of the caller. Each SDK call constructs a short-lived
// ByteReader borrowing this allocation, then mutable calls copy only its cursor back. This avoids
// a self-referential Rust value while retaining the SDK's single ByteReader implementation.
fn generate_owned_byte_reader_support() -> &'static str {
    r#"pub struct FfiOwnedByteReader {
    bytes: Box<[u8]>,
    offset: usize,
}
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_free_owned_byte_reader(reader: *mut FfiOwnedByteReader) {
    if !reader.is_null() { unsafe { drop(Box::from_raw(reader)); } }
}
"#
}

// A disposer the SDK returned. `flight_call_disposer` runs it and returns false for NULL or when it
// panicked (the panic stays inside Rust); the SDK's disposers may be called again. Freeing releases
// the handle without running it, so work it would stop keeps running; free each handle once.
fn generate_disposer_support() -> &'static str {
    r#"pub struct FfiDisposer {
    dispose: std::sync::Arc<dyn Fn() + Send + Sync>,
}
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_call_disposer(disposer: *const FfiDisposer) -> bool {
    if disposer.is_null() { return false; }
    let dispose = unsafe { &(*disposer).dispose };
    std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| dispose())).is_ok()
}
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_free_disposer(disposer: *mut FfiDisposer) {
    if !disposer.is_null() { unsafe { drop(Box::from_raw(disposer)); } }
}
"#
}

// Typed reads of the boxed `StorageSetItemsResult` that `flight_set_storage_items` returns and
// `flight_free_storage_set_items_result` releases. `ok` is the outcome discriminant, `completed`
// counts the items written before any failure, `failed_key` is an owned copy of the failing key
// (freed with `flight_free_string`; NULL on success), and `reason` is the
// `StorageSetItemFailureReason` discriminant (-1 on success). NULL reads as false, 0, NULL and -1.
fn generate_storage_set_items_result_support() -> &'static str {
    r#"#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_get_storage_set_items_result_completed(result: *const flight_sdk::StorageSetItemsResult) -> usize {
    if result.is_null() { return 0; }
    match unsafe { &*result } {
        flight_sdk::StorageBatchMutationOutcome::Ok(ok) => ok.completed,
        flight_sdk::StorageBatchMutationOutcome::Err(err) => err.completed,
    }
}
#[unsafe(no_mangle)]
#[doc = "flight-ffi ownership|owned-return|flight_free_string|std::ffi::c_char"]
pub unsafe extern "C" fn flight_get_storage_set_items_result_failed_key(result: *const flight_sdk::StorageSetItemsResult) -> *mut std::ffi::c_char {
    if result.is_null() { return std::ptr::null_mut(); }
    match unsafe { &*result } {
        flight_sdk::StorageBatchMutationOutcome::Err(err) => match &err.failed_key {
            Some(key) => std::ffi::CString::new(key.as_str()).unwrap_or_default().into_raw(),
            None => std::ptr::null_mut(),
        },
        flight_sdk::StorageBatchMutationOutcome::Ok(_) => std::ptr::null_mut(),
    }
}
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_get_storage_set_items_result_reason(result: *const flight_sdk::StorageSetItemsResult) -> i32 {
    if result.is_null() { return -1; }
    match unsafe { &*result } {
        flight_sdk::StorageBatchMutationOutcome::Err(err) => err.reason as i32,
        flight_sdk::StorageBatchMutationOutcome::Ok(_) => -1,
    }
}
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_is_storage_set_items_result_ok(result: *const flight_sdk::StorageSetItemsResult) -> bool {
    if result.is_null() { return false; }
    matches!(unsafe { &*result }, flight_sdk::StorageBatchMutationOutcome::Ok(_))
}
"#
}

// A requirement collector is either caller-owned (`create`/`destroy`) or a callback-scoped view
// installed by `collect_scene2d_requirements`. The registry makes both forms type/provenance
// checked; the scoped form unregisters on unwind and never owns the SDK Vec it views.
fn generate_requirement_list_support() -> &'static str {
    r#"pub struct FfiRequirementList {
    values: *mut Vec<flight_sdk::Requirement>,
    owned: bool,
}
static FFI_REQUIREMENT_LISTS: std::sync::Mutex<std::collections::BTreeSet<usize>> = std::sync::Mutex::new(std::collections::BTreeSet::new());
fn get_ffi_requirement_lists() -> std::sync::MutexGuard<'static, std::collections::BTreeSet<usize>> {
    FFI_REQUIREMENT_LISTS.lock().unwrap_or_else(std::sync::PoisonError::into_inner)
}
fn is_ffi_requirement_list(list: *const FfiRequirementList) -> bool {
    !list.is_null() && get_ffi_requirement_lists().contains(&(list as usize))
}
unsafe fn ffi_requirement_list_values<'a>(list: *mut FfiRequirementList) -> Option<&'a mut Vec<flight_sdk::Requirement>> {
    if !is_ffi_requirement_list(list) { return None; }
    let values = unsafe { (*list).values };
    if values.is_null() { return None; }
    Some(unsafe { &mut *values })
}
struct FfiRequirementListRegistration(usize);
impl Drop for FfiRequirementListRegistration {
    fn drop(&mut self) { get_ffi_requirement_lists().remove(&self.0); }
}
fn ffi_with_requirement_list<R>(values: &mut Vec<flight_sdk::Requirement>, run: impl FnOnce(*mut FfiRequirementList) -> R) -> R {
    let mut list = FfiRequirementList { values, owned: false };
    let list_ptr = &mut list as *mut FfiRequirementList;
    get_ffi_requirement_lists().insert(list_ptr as usize);
    let _registration = FfiRequirementListRegistration(list_ptr as usize);
    run(list_ptr)
}
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_clear_requirement_list(list: *mut FfiRequirementList) {
    if let Some(values) = unsafe { ffi_requirement_list_values(list) } { values.clear(); }
}
#[doc = "flight-ffi ownership|owned-return|flight_destroy_requirement_list|FfiRequirementList"]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_create_requirement_list() -> *mut FfiRequirementList {
    let values = Box::into_raw(Box::new(Vec::new()));
    let list = Box::into_raw(Box::new(FfiRequirementList { values, owned: true }));
    get_ffi_requirement_lists().insert(list as usize);
    list
}
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_destroy_requirement_list(list: *mut FfiRequirementList) {
    if !is_ffi_requirement_list(list) || !unsafe { (*list).owned } { return; }
    get_ffi_requirement_lists().remove(&(list as usize));
    let list = unsafe { Box::from_raw(list) };
    if list.owned && !list.values.is_null() { unsafe { drop(Box::from_raw(list.values)); } }
}
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_get_requirement_list_facet(list: *const FfiRequirementList, index: usize) -> i32 {
    if !is_ffi_requirement_list(list) { return -1; }
    let values = unsafe { &*(*list).values };
    values.get(index).map_or(-1, |requirement| requirement.facet as i32)
}
#[doc = "flight-ffi ownership|owned-return|flight_free_string|std::ffi::c_char"]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_get_requirement_list_key(list: *const FfiRequirementList, index: usize) -> *mut std::ffi::c_char {
    if !is_ffi_requirement_list(list) { return std::ptr::null_mut(); }
    let values = unsafe { &*(*list).values };
    match values.get(index) {
        Some(requirement) => std::ffi::CString::new(requirement.key.as_str()).unwrap_or_default().into_raw(),
        None => std::ptr::null_mut(),
    }
}
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_get_requirement_list_length(list: *const FfiRequirementList) -> usize {
    if !is_ffi_requirement_list(list) { return 0; }
    unsafe { &*(*list).values }.len()
}
"#
}

// Immediate collector callbacks need one detail-free append primitive. Structured detail maps stay
// on the ownership-policy side until C has a typed ImportDiagnosticDetailValue map producer.
fn generate_import_diagnostic_append_support() -> &'static str {
    r#"#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_append_import_diagnostic(
    list: *mut FfiImportDiagnosticList,
    severity: u32,
    kind: *const std::ffi::c_char,
    origin: *const std::ffi::c_char,
) -> bool {
    let Some(values) = (unsafe { ffi_import_diagnostic_list_values(list) }) else { return false; };
    if kind.is_null() || origin.is_null() { return false; }
    let severity = match severity {
        0 => flight_sdk::ImportDiagnosticSeverity::Drop,
        1 => flight_sdk::ImportDiagnosticSeverity::Recover,
        2 => flight_sdk::ImportDiagnosticSeverity::Reject,
        3 => flight_sdk::ImportDiagnosticSeverity::Skip,
        _ => return false,
    };
    let kind = unsafe { std::ffi::CStr::from_ptr(kind) }.to_str().unwrap_or("").to_owned();
    let origin = unsafe { std::ffi::CStr::from_ptr(origin) }.to_str().unwrap_or("").to_owned();
    values.push(flight_sdk::ImportDiagnostic { detail: None, kind, origin, severity });
    true
}
"#
}

// Caller-owned collectors behind exact mutable generic parameters, as (parameter type, handle
// struct, slug, value type). Each keeps the import diagnostic list's live-registry contract: the
// registry filters provenance and type for live handles and is not lifetime synchronization. NULL
// or a live handle of another type makes the wrapper return its empty value without calling the
// SDK; clear and destroy ignore it, and getters read 0, -1 or NULL. A handle is valid from
// `flight_create_<slug>` until its single `flight_destroy_<slug>` call; callers synchronize access
// and never use it after destroy. Ref values are read as owned clones released by the Ref's own
// free, so nothing a getter returns borrows from the collector.
const REGISTERED_HANDLES: &[(&str, &str, &str, &str)] = &[
    (
        "&mut HashMap<String, Ref<TextureAtlasRegion>>",
        "FfiTextureAtlasRegionMap",
        "texture_atlas_region_map",
        "std::collections::HashMap<String, flight_sdk::Ref<flight_sdk::TextureAtlasRegion>>",
    ),
    (
        "&mut HashMap<String, usize>",
        "FfiStringCountMap",
        "string_count_map",
        "std::collections::HashMap<String, usize>",
    ),
    (
        "&mut HashMap<u64, usize>",
        "FfiU64CountMap",
        "u64_count_map",
        "std::collections::HashMap<u64, usize>",
    ),
    (
        "&mut Vec<Option<Ref<TextureAtlas>>>",
        "FfiOptionalTextureAtlasList",
        "optional_texture_atlas_list",
        "Vec<Option<flight_sdk::Ref<flight_sdk::TextureAtlas>>>",
    ),
];

// The Ref types registered-handle getters box, so each gets its `flight_free_<type>_ref`.
const REGISTERED_HANDLE_REFS: &[&str] = &[
    "flight_sdk::Ref<flight_sdk::TextureAtlas>",
    "flight_sdk::Ref<flight_sdk::TextureAtlasRegion>",
];

fn generate_registered_handle_support() -> String {
    let mut output = String::new();
    for (_, handle, slug, value_ty) in REGISTERED_HANDLES {
        let registry = format!("FFI_{}_REGISTRY", slug.to_uppercase());
        write!(
            output,
            "pub struct {handle} {{\n    values: {value_ty},\n}}\n\
             static {registry}: std::sync::Mutex<std::collections::BTreeSet<usize>> = std::sync::Mutex::new(std::collections::BTreeSet::new());\n\
             fn get_ffi_{slug}_registry() -> std::sync::MutexGuard<'static, std::collections::BTreeSet<usize>> {{\n    {registry}.lock().unwrap_or_else(std::sync::PoisonError::into_inner)\n}}\n\
             fn is_ffi_{slug}(handle: *const {handle}) -> bool {{\n    !handle.is_null() && get_ffi_{slug}_registry().contains(&(handle as usize))\n}}\n\
             unsafe fn ffi_{slug}_values<'a>(handle: *mut {handle}) -> Option<&'a mut {value_ty}> {{\n    if !is_ffi_{slug}(handle) {{ return None; }}\n    Some(unsafe {{ &mut (*handle).values }})\n}}\n\
             unsafe fn get_ffi_{slug}<'a>(handle: *const {handle}) -> Option<&'a {value_ty}> {{\n    if !is_ffi_{slug}(handle) {{ return None; }}\n    Some(unsafe {{ &(*handle).values }})\n}}\n\
             #[unsafe(no_mangle)]\npub unsafe extern \"C\" fn flight_clear_{slug}(handle: *mut {handle}) {{\n    if let Some(values) = unsafe {{ ffi_{slug}_values(handle) }} {{ values.clear(); }}\n}}\n\
             #[doc = \"flight-ffi ownership|owned-return|flight_destroy_{slug}|{handle}\"]\n#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn flight_create_{slug}() -> *mut {handle} {{\n    let handle = Box::into_raw(Box::new({handle} {{ values: Default::default() }}));\n    get_ffi_{slug}_registry().insert(handle as usize);\n    handle\n}}\n\
             #[unsafe(no_mangle)]\npub unsafe extern \"C\" fn flight_destroy_{slug}(handle: *mut {handle}) {{\n    if handle.is_null() || !get_ffi_{slug}_registry().remove(&(handle as usize)) {{ return; }}\n    unsafe {{ drop(Box::from_raw(handle)); }}\n}}\n\
             #[unsafe(no_mangle)]\npub unsafe extern \"C\" fn flight_get_{slug}_length(handle: *const {handle}) -> usize {{\n    unsafe {{ get_ffi_{slug}(handle) }}.map_or(0, |values| values.len())\n}}\n"
        )
        .unwrap();
    }
    // Map keys are indexed in byte order and returned as owned strings.
    output.push_str(
        r#"fn get_ffi_sorted_key<V>(values: &std::collections::HashMap<String, V>, index: usize) -> *mut std::ffi::c_char {
    let mut keys: Vec<&String> = values.keys().collect();
    keys.sort();
    match keys.get(index) {
        Some(key) => std::ffi::CString::new(key.as_str()).unwrap_or_default().into_raw(),
        None => std::ptr::null_mut(),
    }
}
unsafe fn get_ffi_key<'a>(key: *const std::ffi::c_char) -> Option<&'a str> {
    if key.is_null() { return None; }
    Some(unsafe { std::ffi::CStr::from_ptr(key) }.to_str().unwrap_or(""))
}
#[unsafe(no_mangle)]
#[doc = "flight-ffi ownership|owned-return|flight_free_texture_atlas_ref|flight_sdk::Ref<flight_sdk::TextureAtlas>"]
pub unsafe extern "C" fn flight_get_optional_texture_atlas_list_item(list: *const FfiOptionalTextureAtlasList, index: usize) -> *mut std::ffi::c_void {
    match unsafe { get_ffi_optional_texture_atlas_list(list) }.and_then(|values| values.get(index)) {
        Some(Some(atlas)) => Box::into_raw(Box::new(atlas.clone())) as *mut std::ffi::c_void,
        _ => std::ptr::null_mut(),
    }
}
#[unsafe(no_mangle)]
#[doc = "flight-ffi ownership|owned-return|flight_free_string|std::ffi::c_char"]
pub unsafe extern "C" fn flight_get_string_count_map_key(map: *const FfiStringCountMap, index: usize) -> *mut std::ffi::c_char {
    match unsafe { get_ffi_string_count_map(map) } {
        Some(values) => get_ffi_sorted_key(values, index),
        None => std::ptr::null_mut(),
    }
}
// The count for `key`, or -1 when the map has no such key.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_get_string_count_map_value(map: *const FfiStringCountMap, key: *const std::ffi::c_char) -> i64 {
    let (Some(values), Some(key)) = (unsafe { get_ffi_string_count_map(map) }, unsafe { get_ffi_key(key) }) else { return -1; };
    values.get(key).map_or(-1, |count| *count as i64)
}
// The key at `index` in ascending order, written to `out_key`; false when out of range.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_get_u64_count_map_key(map: *const FfiU64CountMap, index: usize, out_key: *mut u64) -> bool {
    let Some(values) = (unsafe { get_ffi_u64_count_map(map) }) else { return false; };
    let mut keys: Vec<u64> = values.keys().copied().collect();
    keys.sort_unstable();
    let Some(key) = keys.get(index) else { return false; };
    if !out_key.is_null() { unsafe { *out_key = *key; } }
    true
}
// The count for `key`, or -1 when the map has no such key.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_get_u64_count_map_value(map: *const FfiU64CountMap, key: u64) -> i64 {
    unsafe { get_ffi_u64_count_map(map) }.and_then(|values| values.get(&key)).map_or(-1, |count| *count as i64)
}
#[unsafe(no_mangle)]
#[doc = "flight-ffi ownership|owned-return|flight_free_string|std::ffi::c_char"]
pub unsafe extern "C" fn flight_get_texture_atlas_region_map_key(map: *const FfiTextureAtlasRegionMap, index: usize) -> *mut std::ffi::c_char {
    match unsafe { get_ffi_texture_atlas_region_map(map) } {
        Some(values) => get_ffi_sorted_key(values, index),
        None => std::ptr::null_mut(),
    }
}
// An owned clone of the region Ref for `key`, or NULL when the map has no such key.
#[unsafe(no_mangle)]
#[doc = "flight-ffi ownership|owned-return|flight_free_texture_atlas_region_ref|flight_sdk::Ref<flight_sdk::TextureAtlasRegion>"]
pub unsafe extern "C" fn flight_get_texture_atlas_region_map_value(map: *const FfiTextureAtlasRegionMap, key: *const std::ffi::c_char) -> *mut std::ffi::c_void {
    let (Some(values), Some(key)) = (unsafe { get_ffi_texture_atlas_region_map(map) }, unsafe { get_ffi_key(key) }) else { return std::ptr::null_mut(); };
    match values.get(key) {
        Some(region) => Box::into_raw(Box::new(region.clone())) as *mut std::ffi::c_void,
        None => std::ptr::null_mut(),
    }
}
"#,
    );
    output
}

// The caller-owned list behind every `Option<&mut Vec<ImportDiagnostic>>` parameter. C reads an item
// by (list, index) on every access, so no pointer into the Vec survives a call that can grow it.
// The live-list registry is a provenance and type filter for live handles, checked before any
// reference to the list type exists. It is not lifetime synchronization. NULL, or a live handle of
// another type, collects nothing, clear and destroy ignore it, and getters return the empty value
// (-1, NULL, 0, false or NaN), as they do for an index out of range. A list pointer is valid only
// from `flight_create_import_diagnostic_list` until its single
// `flight_destroy_import_diagnostic_list` call. Callers synchronize access to a list, never race a
// read, write or wrapper call against clear or destroy, and never use the pointer after destroy: a
// freed address can be reused by a later list. Strings getters return are owned and freed with
// `flight_free_string`.
fn generate_import_diagnostic_list_support() -> String {
    let mut output = String::from(
        "// Caller-owned Vec<ImportDiagnostic> collector; a wrapper borrows it for one call and NULL collects nothing.\n\
         pub struct FfiImportDiagnosticList {\n    values: Vec<flight_sdk::ImportDiagnostic>,\n}\n\
         // Addresses of the live lists `flight_create_import_diagnostic_list` returned. Membership is the\n\
         // only proof a pointer is a list; insertion and removal bracket the Box's whole lifetime.\n\
         static FFI_IMPORT_DIAGNOSTIC_LISTS: std::sync::Mutex<std::collections::BTreeSet<usize>> = std::sync::Mutex::new(std::collections::BTreeSet::new());\n",
    );
    output.push_str(
        "fn get_ffi_import_diagnostic_lists() -> std::sync::MutexGuard<'static, std::collections::BTreeSet<usize>> {\n    FFI_IMPORT_DIAGNOSTIC_LISTS.lock().unwrap_or_else(std::sync::PoisonError::into_inner)\n}\n\
         fn is_ffi_import_diagnostic_list(list: *const FfiImportDiagnosticList) -> bool {\n    !list.is_null() && get_ffi_import_diagnostic_lists().contains(&(list as usize))\n}\n\
         unsafe fn ffi_import_diagnostic_list_values<'a>(list: *mut FfiImportDiagnosticList) -> Option<&'a mut Vec<flight_sdk::ImportDiagnostic>> {\n    if !is_ffi_import_diagnostic_list(list) { return None; }\n    Some(unsafe { &mut (*list).values })\n}\n\
         unsafe fn ffi_import_diagnostic_list_item<'a>(list: *const FfiImportDiagnosticList, index: usize) -> Option<&'a flight_sdk::ImportDiagnostic> {\n    if !is_ffi_import_diagnostic_list(list) { return None; }\n    unsafe { &(*list).values }.get(index)\n}\n\
         // Detail entries are indexed in the UTF-16 key order `format_import_diagnostic` prints them in.\n\
         unsafe fn ffi_import_diagnostic_list_detail<'a>(list: *const FfiImportDiagnosticList, index: usize, detail_index: usize) -> Option<(&'a String, &'a flight_sdk::ImportDiagnosticDetailValue)> {\n    let detail = unsafe { ffi_import_diagnostic_list_item(list, index) }?.detail.as_ref()?;\n    let mut entries: Vec<_> = detail.iter().collect();\n    entries.sort_by(|left, right| left.0.encode_utf16().cmp(right.0.encode_utf16()));\n    entries.get(detail_index).copied()\n}\n\
         fn ffi_import_diagnostic_c_string(value: &str) -> *mut std::ffi::c_char {\n    std::ffi::CString::new(value).unwrap_or_default().into_raw()\n}\n\
         #[unsafe(no_mangle)]\n\
         pub unsafe extern \"C\" fn flight_clear_import_diagnostic_list(list: *mut FfiImportDiagnosticList) {\n    if let Some(values) = unsafe { ffi_import_diagnostic_list_values(list) } { values.clear(); }\n}\n\
         #[doc = \"flight-ffi ownership|owned-return|flight_destroy_import_diagnostic_list|FfiImportDiagnosticList\"]\n\
         #[unsafe(no_mangle)]\n\
         pub unsafe extern \"C\" fn flight_create_import_diagnostic_list() -> *mut FfiImportDiagnosticList {\n    let list = Box::into_raw(Box::new(FfiImportDiagnosticList { values: Vec::new() }));\n    get_ffi_import_diagnostic_lists().insert(list as usize);\n    list\n}\n\
         #[unsafe(no_mangle)]\n\
         pub unsafe extern \"C\" fn flight_destroy_import_diagnostic_list(list: *mut FfiImportDiagnosticList) {\n    if list.is_null() || !get_ffi_import_diagnostic_lists().remove(&(list as usize)) { return; }\n    unsafe { drop(Box::from_raw(list)); }\n}\n\
         #[unsafe(no_mangle)]\n\
         pub unsafe extern \"C\" fn flight_get_import_diagnostic_list_detail_bool(list: *const FfiImportDiagnosticList, index: usize, detail_index: usize) -> bool {\n    match unsafe { ffi_import_diagnostic_list_detail(list, index, detail_index) } {\n        Some((_, flight_sdk::ImportDiagnosticDetailValue::Bool(value))) => *value,\n        _ => false,\n    }\n}\n\
         #[doc = \"flight-ffi ownership|owned-return|flight_free_string|std::ffi::c_char\"]\n\
         #[unsafe(no_mangle)]\n\
         pub unsafe extern \"C\" fn flight_get_import_diagnostic_list_detail_key(list: *const FfiImportDiagnosticList, index: usize, detail_index: usize) -> *mut std::ffi::c_char {\n    match unsafe { ffi_import_diagnostic_list_detail(list, index, detail_index) } {\n        Some((key, _)) => ffi_import_diagnostic_c_string(key),\n        None => std::ptr::null_mut(),\n    }\n}\n\
         // 0 is Bool, 1 is Number and 2 is String.\n\
         #[unsafe(no_mangle)]\n\
         pub unsafe extern \"C\" fn flight_get_import_diagnostic_list_detail_kind(list: *const FfiImportDiagnosticList, index: usize, detail_index: usize) -> i32 {\n    match unsafe { ffi_import_diagnostic_list_detail(list, index, detail_index) } {\n        Some((_, flight_sdk::ImportDiagnosticDetailValue::Bool(_))) => 0,\n        Some((_, flight_sdk::ImportDiagnosticDetailValue::Number(_))) => 1,\n        Some((_, flight_sdk::ImportDiagnosticDetailValue::String(_))) => 2,\n        None => -1,\n    }\n}\n\
         #[unsafe(no_mangle)]\n\
         pub unsafe extern \"C\" fn flight_get_import_diagnostic_list_detail_length(list: *const FfiImportDiagnosticList, index: usize) -> usize {\n    match unsafe { ffi_import_diagnostic_list_item(list, index) } {\n        Some(diagnostic) => diagnostic.detail.as_ref().map_or(0, |detail| detail.len()),\n        None => 0,\n    }\n}\n\
         #[unsafe(no_mangle)]\n\
         pub unsafe extern \"C\" fn flight_get_import_diagnostic_list_detail_number(list: *const FfiImportDiagnosticList, index: usize, detail_index: usize) -> f32 {\n    match unsafe { ffi_import_diagnostic_list_detail(list, index, detail_index) } {\n        Some((_, flight_sdk::ImportDiagnosticDetailValue::Number(value))) => *value,\n        _ => f32::NAN,\n    }\n}\n\
         #[doc = \"flight-ffi ownership|owned-return|flight_free_string|std::ffi::c_char\"]\n\
         #[unsafe(no_mangle)]\n\
         pub unsafe extern \"C\" fn flight_get_import_diagnostic_list_detail_string(list: *const FfiImportDiagnosticList, index: usize, detail_index: usize) -> *mut std::ffi::c_char {\n    match unsafe { ffi_import_diagnostic_list_detail(list, index, detail_index) } {\n        Some((_, flight_sdk::ImportDiagnosticDetailValue::String(value))) => ffi_import_diagnostic_c_string(value),\n        _ => std::ptr::null_mut(),\n    }\n}\n\
         #[doc = \"flight-ffi ownership|owned-return|flight_free_string|std::ffi::c_char\"]\n\
         #[unsafe(no_mangle)]\n\
         pub unsafe extern \"C\" fn flight_get_import_diagnostic_list_kind(list: *const FfiImportDiagnosticList, index: usize) -> *mut std::ffi::c_char {\n    match unsafe { ffi_import_diagnostic_list_item(list, index) } {\n        Some(diagnostic) => ffi_import_diagnostic_c_string(&diagnostic.kind),\n        None => std::ptr::null_mut(),\n    }\n}\n\
         #[unsafe(no_mangle)]\n\
         pub unsafe extern \"C\" fn flight_get_import_diagnostic_list_length(list: *const FfiImportDiagnosticList) -> usize {\n    if !is_ffi_import_diagnostic_list(list) { return 0; }\n    unsafe { &(*list).values }.len()\n}\n\
         // The `format_import_diagnostic` line: severity, origin, kind and sorted detail.\n\
         #[doc = \"flight-ffi ownership|owned-return|flight_free_string|std::ffi::c_char\"]\n\
         #[unsafe(no_mangle)]\n\
         pub unsafe extern \"C\" fn flight_get_import_diagnostic_list_message(list: *const FfiImportDiagnosticList, index: usize) -> *mut std::ffi::c_char {\n    match unsafe { ffi_import_diagnostic_list_item(list, index) } {\n        Some(diagnostic) => ffi_import_diagnostic_c_string(&flight_sdk::format_import_diagnostic(diagnostic)),\n        None => std::ptr::null_mut(),\n    }\n}\n\
         #[doc = \"flight-ffi ownership|owned-return|flight_free_string|std::ffi::c_char\"]\n\
         #[unsafe(no_mangle)]\n\
         pub unsafe extern \"C\" fn flight_get_import_diagnostic_list_origin(list: *const FfiImportDiagnosticList, index: usize) -> *mut std::ffi::c_char {\n    match unsafe { ffi_import_diagnostic_list_item(list, index) } {\n        Some(diagnostic) => ffi_import_diagnostic_c_string(&diagnostic.origin),\n        None => std::ptr::null_mut(),\n    }\n}\n\
         // ImportDiagnosticSeverity discriminant: 0 Drop, 1 Recover, 2 Reject, 3 Skip.\n\
         #[unsafe(no_mangle)]\n\
         pub unsafe extern \"C\" fn flight_get_import_diagnostic_list_severity(list: *const FfiImportDiagnosticList, index: usize) -> i32 {\n    match unsafe { ffi_import_diagnostic_list_item(list, index) } {\n        Some(diagnostic) => diagnostic.severity as i32,\n        None => -1,\n    }\n}\n",
    );
    output
}

fn generate_shape_bounds_context_support() -> &'static str {
    r#"// Caller-owned implementation of the open ShapeBoundsContext trait.
#[derive(Clone, Copy)]
#[repr(C)]
pub struct FfiShapeBoundsContextVTable {
    pub close_path: Option<unsafe extern "C-unwind" fn(*mut std::ffi::c_void) -> bool>,
    pub cubic_curve_to: Option<unsafe extern "C-unwind" fn(*mut std::ffi::c_void, f64, f64, f64, f64, f64, f64) -> bool>,
    pub draw_circle: Option<unsafe extern "C-unwind" fn(*mut std::ffi::c_void, f64, f64, f64) -> bool>,
    pub draw_ellipse: Option<unsafe extern "C-unwind" fn(*mut std::ffi::c_void, f64, f64, f64, f64) -> bool>,
    pub draw_rectangle: Option<unsafe extern "C-unwind" fn(*mut std::ffi::c_void, f64, f64, f64, f64) -> bool>,
    pub draw_rounded_rectangle: Option<unsafe extern "C-unwind" fn(*mut std::ffi::c_void, f64, f64, f64, f64, f64) -> bool>,
    pub expand_point: Option<unsafe extern "C-unwind" fn(*mut std::ffi::c_void, f64, f64) -> bool>,
    pub flush_path: Option<unsafe extern "C-unwind" fn(*mut std::ffi::c_void) -> bool>,
    pub line_to: Option<unsafe extern "C-unwind" fn(*mut std::ffi::c_void, f64, f64) -> bool>,
    pub move_to: Option<unsafe extern "C-unwind" fn(*mut std::ffi::c_void, f64, f64) -> bool>,
    pub quadratic_curve_to: Option<unsafe extern "C-unwind" fn(*mut std::ffi::c_void, f64, f64, f64, f64) -> bool>,
    pub set_stroke_style: Option<unsafe extern "C-unwind" fn(*mut std::ffi::c_void, f64, u32, u32, f64) -> bool>,
}

impl FfiShapeBoundsContextVTable {
    fn is_complete(&self) -> bool {
        self.close_path.is_some()
            && self.cubic_curve_to.is_some()
            && self.draw_circle.is_some()
            && self.draw_ellipse.is_some()
            && self.draw_rectangle.is_some()
            && self.draw_rounded_rectangle.is_some()
            && self.expand_point.is_some()
            && self.flush_path.is_some()
            && self.line_to.is_some()
            && self.move_to.is_some()
            && self.quadratic_curve_to.is_some()
            && self.set_stroke_style.is_some()
    }
}

struct FfiShapeBoundsContext {
    context: *mut std::ffi::c_void,
    vtable: FfiShapeBoundsContextVTable,
    failed: bool,
}

impl FfiShapeBoundsContext {
    unsafe fn new(
        context: *mut std::ffi::c_void,
        vtable: *const FfiShapeBoundsContextVTable,
    ) -> Option<Self> {
        if vtable.is_null() {
            return None;
        }
        let vtable = unsafe { *vtable };
        if !vtable.is_complete() {
            return None;
        }
        Some(Self { context, vtable, failed: false })
    }
}

impl flight_sdk::ShapeBoundsContext for FfiShapeBoundsContext {
    fn close_path(&mut self) {
        if self.failed { return; }
        let Some(callback) = self.vtable.close_path else { self.failed = true; return; };
        self.failed = !unsafe { callback(self.context) };
    }

    fn cubic_curve_to(&mut self, control_x1: f64, control_y1: f64, control_x2: f64, control_y2: f64, x: f64, y: f64) {
        if self.failed { return; }
        let Some(callback) = self.vtable.cubic_curve_to else { self.failed = true; return; };
        self.failed = !unsafe { callback(self.context, control_x1, control_y1, control_x2, control_y2, x, y) };
    }

    fn draw_circle(&mut self, center_x: f64, center_y: f64, radius: f64) {
        if self.failed { return; }
        let Some(callback) = self.vtable.draw_circle else { self.failed = true; return; };
        self.failed = !unsafe { callback(self.context, center_x, center_y, radius) };
    }

    fn draw_ellipse(&mut self, center_x: f64, center_y: f64, radius_x: f64, radius_y: f64) {
        if self.failed { return; }
        let Some(callback) = self.vtable.draw_ellipse else { self.failed = true; return; };
        self.failed = !unsafe { callback(self.context, center_x, center_y, radius_x, radius_y) };
    }

    fn draw_rectangle(&mut self, x: f64, y: f64, width: f64, height: f64) {
        if self.failed { return; }
        let Some(callback) = self.vtable.draw_rectangle else { self.failed = true; return; };
        self.failed = !unsafe { callback(self.context, x, y, width, height) };
    }

    fn draw_rounded_rectangle(&mut self, x: f64, y: f64, width: f64, height: f64, radius: f64) {
        if self.failed { return; }
        let Some(callback) = self.vtable.draw_rounded_rectangle else { self.failed = true; return; };
        self.failed = !unsafe { callback(self.context, x, y, width, height, radius) };
    }

    fn expand_point(&mut self, x: f64, y: f64) {
        if self.failed { return; }
        let Some(callback) = self.vtable.expand_point else { self.failed = true; return; };
        self.failed = !unsafe { callback(self.context, x, y) };
    }

    fn flush_path(&mut self) {
        if self.failed { return; }
        let Some(callback) = self.vtable.flush_path else { self.failed = true; return; };
        self.failed = !unsafe { callback(self.context) };
    }

    fn line_to(&mut self, x: f64, y: f64) {
        if self.failed { return; }
        let Some(callback) = self.vtable.line_to else { self.failed = true; return; };
        self.failed = !unsafe { callback(self.context, x, y) };
    }

    fn move_to(&mut self, x: f64, y: f64) {
        if self.failed { return; }
        let Some(callback) = self.vtable.move_to else { self.failed = true; return; };
        self.failed = !unsafe { callback(self.context, x, y) };
    }

    fn quadratic_curve_to(&mut self, control_x: f64, control_y: f64, x: f64, y: f64) {
        if self.failed { return; }
        let Some(callback) = self.vtable.quadratic_curve_to else { self.failed = true; return; };
        self.failed = !unsafe { callback(self.context, control_x, control_y, x, y) };
    }

    fn set_stroke_style(&mut self, width: f64, caps: flight_sdk::CapsStyle, joints: flight_sdk::JointStyle, miter_limit: f64) {
        if self.failed { return; }
        let Some(callback) = self.vtable.set_stroke_style else { self.failed = true; return; };
        self.failed = !unsafe { callback(self.context, width, caps as u32, joints as u32, miter_limit) };
    }
}

"#
}

fn generate_vec_ref_handle_support(specs: &BTreeSet<VecRefHandleSpec>) -> String {
    if specs.is_empty() {
        return String::new();
    }
    let mut output = String::from(
        "// Exact, tagged handle families for caller-owned Vec<Ref<T>> output parameters.\n\
         #[repr(C)]\n\
         pub struct FfiVecRefHandle<T: ?Sized> {\n\
             tag: u64,\n\
             values: Vec<flight_sdk::Ref<T>>,\n\
         }\n",
    );
    for spec in specs {
        let slug = &spec.slug;
        let inner_ty = &spec.inner_ty;
        let tag = spec.tag;
        let handle_ty = format!("FfiVecRefHandle<{inner_ty}>");
        let owned = ownership_doc(
            "owned-return",
            &format!("flight_vec_ref_{slug}_free"),
            &handle_ty,
        );
        let borrowed =
            borrowed_ownership_doc(&format!("the flight_vec_ref_{slug} handle remains alive"));
        writeln!(
            output,
            r#"unsafe fn ffi_vec_ref_{slug}_values<'a>(handle: *mut FfiVecRefHandle<{inner_ty}>) -> &'a mut Vec<flight_sdk::Ref<{inner_ty}>> {{
    assert!(!handle.is_null(), "null Vec<Ref<{slug}>> handle");
    let handle = unsafe {{ &mut *handle }};
    assert_eq!(handle.tag, {tag}, "wrong Vec<Ref<{slug}>> handle type");
    &mut handle.values
}}
{owned}#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_vec_ref_{slug}_create() -> *mut FfiVecRefHandle<{inner_ty}> {{
    Box::into_raw(Box::new(FfiVecRefHandle {{ tag: {tag}, values: Vec::new() }}))
}}
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_vec_ref_{slug}_len(handle: *const FfiVecRefHandle<{inner_ty}>) -> usize {{
    if handle.is_null() {{ return 0; }}
    let handle = unsafe {{ &*handle }};
    assert_eq!(handle.tag, {tag}, "wrong Vec<Ref<{slug}>> handle type");
    handle.values.len()
}}
{borrowed}#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_vec_ref_{slug}_get(handle: *const FfiVecRefHandle<{inner_ty}>, index: usize) -> *const std::ffi::c_void {{
    if handle.is_null() {{ return std::ptr::null(); }}
    let handle = unsafe {{ &*handle }};
    assert_eq!(handle.tag, {tag}, "wrong Vec<Ref<{slug}>> handle type");
    match handle.values.get(index) {{
        Some(value) => value as *const _ as *const std::ffi::c_void,
        None => std::ptr::null(),
    }}
}}
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_vec_ref_{slug}_free(handle: *mut FfiVecRefHandle<{inner_ty}>) {{
    if handle.is_null() {{ return; }}
    assert_eq!(unsafe {{ (*handle).tag }}, {tag}, "wrong Vec<Ref<{slug}>> handle type");
    unsafe {{ drop(Box::from_raw(handle)); }}
}}"#
        )
        .unwrap();
    }
    output
}

fn categorize_skip(func: &ParsedFn) -> String {
    if let Some(category) = explicit_skip_category(&func.name) {
        return format!("{category}({})", func.name);
    }
    if func.lacks_public_export {
        return format!("no_ts_public_export({})", func.name);
    }
    if owned_consumed_types(func)
        .iter()
        .any(|consumed| !has_owned_producer(consumed))
    {
        return format!("ownership_policy_skip({})", func.name);
    }
    for param in &func.params {
        let ty = &param.ty;
        let resolved = strip_crate_paths(&resolve_type_alias(ty));
        if resolved.contains("Fn(") || resolved.contains("FnMut(") || resolved.contains("FnOnce(") {
            if parse_closure_param(&resolved).is_none() {
                return format!("closure_param({})", ty);
            }
            continue;
        }
        if map_param_to_ffi(&param.name, &resolved).is_none() {
            if resolved.contains("dyn ")
                && !is_known_dyn_opaque(&resolved)
                && !is_known_dyn_mono(&resolved)
            {
                return format!("unknown_dyn_param({})", ty);
            }
            return format!("unmapped_param({})", ty);
        }
    }
    if let Some(ret) = &func.ret {
        let resolved = strip_crate_paths(&resolve_type_alias(ret));
        if resolved.contains("Fn(") || resolved.contains("FnMut(") || resolved.contains("FnOnce(") {
            return format!("closure_return({})", ret);
        }
        if resolved.contains("dyn ")
            && !is_known_dyn_opaque(&resolved)
            && !is_known_dyn_mono(&resolved)
        {
            return format!("unknown_dyn_return({})", ret);
        }
        if is_tuple(&resolved) {
            return format!("tuple_return({})", ret);
        }
        if map_return_to_ffi(&resolved).is_none() {
            return format!("unmapped_return({})", ret);
        }
    }
    format!("unknown({})", func.name)
}

fn is_by_design_public_skip(reason: &str) -> bool {
    [
        "behavior_policy_skip(",
        "extension_policy_skip(",
        "guard_policy_skip(",
        "import_handler_policy_skip(",
        "ownership_policy_skip(",
        "safety_policy_skip(",
    ]
    .iter()
    .any(|prefix| reason.starts_with(prefix))
}

const SCALARS: &[&str] = &[
    "f32", "f64", "i8", "i16", "i32", "i64", "u8", "u16", "u32", "u64", "usize", "isize", "bool",
];

fn is_scalar(ty: &str) -> bool {
    SCALARS.contains(&ty)
}

fn to_snake_case(s: &str) -> String {
    let mut out = String::new();
    let chars: Vec<char> = s.chars().collect();
    for (i, &c) in chars.iter().enumerate() {
        if c.is_uppercase() && i > 0 && !chars[i - 1].is_uppercase() && chars[i - 1] != '_' {
            out.push('_');
        }
        out.push(c.to_ascii_lowercase());
    }
    out
}

// The `flight_free_*` suffix for a boxed return type. Ref<T> returns box the Arc handle itself, so
// their free name distinguishes that handle from a hypothetical boxed T.
fn opaque_type_slug(ty: &str) -> String {
    let ty = ty.trim();
    if ty == "()" {
        return "unit".to_string();
    }
    if let Some((outer, arguments)) = outer_generic_parts(ty) {
        let outer = outer.rsplit("::").next().unwrap_or(outer);
        let arguments = split_generic_arguments(arguments).unwrap_or_default();
        let arguments = arguments
            .into_iter()
            .map(opaque_type_slug)
            .collect::<Vec<_>>()
            .join("_");
        return match outer {
            "Ref" => format!("{arguments}_ref"),
            "Arc" => format!("{arguments}_arc"),
            "Signal" => format!("{arguments}_signal"),
            "SignalSlot" => format!("{arguments}_signal_slot"),
            "Tween" => format!("{arguments}_tween"),
            "Vec" => format!("{arguments}_vec"),
            "HashMap" => format!("{arguments}_hash_map"),
            "Option" => format!("optional_{arguments}"),
            _ => format!("{arguments}_{}", to_snake_case(outer)),
        };
    }
    let ty = ty.strip_prefix("dyn ").unwrap_or(ty);
    to_snake_case(ty.rsplit("::").next().unwrap_or(ty))
}

fn boxed_free_suffix(qualified_type: &str) -> String {
    if let Some((element, length)) = qualified_type
        .strip_prefix('[')
        .and_then(|rest| rest.strip_suffix(']'))
        .and_then(|array| array.split_once(';'))
        .filter(|(element, _)| is_scalar(element.trim()))
    {
        return format!("{}_array_{}", element.trim(), length.trim());
    }
    for (alias, scalar) in TYPED_ARRAY_REFS {
        if qualified_type == format!("flight_sdk::Ref<Box<[{scalar}]>>") {
            return format!("{}_ref", to_snake_case(alias));
        }
    }
    if let Some(inner) = qualified_type
        .strip_prefix("flight_sdk::Ref<")
        .and_then(|rest| rest.strip_suffix('>'))
    {
        return format!("{}_ref", opaque_type_slug(inner));
    }
    let type_name = qualified_type.rsplit("::").next().unwrap_or(qualified_type);
    if type_name == "Signal<()>" {
        return "unit_signal".to_string();
    }
    return opaque_type_slug(qualified_type);
}

fn needs_generic_boxed_free(qualified_type: &str) -> bool {
    !TYPED_ARRAY_REFS
        .iter()
        .any(|(_, scalar)| qualified_type == format!("flight_sdk::Ref<Box<[{scalar}]>>"))
}

fn arc_ref_boxed_type(ty: &str) -> Option<String> {
    let resolved = strip_crate_paths(&strip_lifetimes(&resolve_type_alias(ty.trim())));
    let resolved = resolved
        .strip_prefix("Option<")
        .and_then(|inner| inner.strip_suffix('>'))
        .unwrap_or(&resolved)
        .trim();
    if let Some((_, scalar)) = get_typed_array_ref(resolved) {
        return Some(format!("flight_sdk::Ref<Box<[{scalar}]>>"));
    }
    if let Some(inner) = resolved
        .strip_prefix("Arc<")
        .and_then(|rest| rest.strip_suffix('>'))
    {
        return Some(format!("std::sync::Arc<{}>", qualify_opaque_type(inner)?));
    }
    let inner = resolved.strip_prefix("Ref<")?.strip_suffix('>')?.trim();
    Some(format!("flight_sdk::Ref<{}>", qualify_opaque_type(inner)?))
}

fn boxed_value_type(ty: &str) -> Option<String> {
    let resolved = strip_crate_paths(&strip_lifetimes(&resolve_type_alias(ty.trim())));
    let value = resolved
        .strip_prefix("Option<")
        .and_then(|inner| inner.strip_suffix('>'))
        .unwrap_or(&resolved)
        .trim();
    if value.is_empty() || value.starts_with('&') || value.contains("dyn ") {
        return None;
    }
    Some(qualify_type(value))
}

fn boxed_type_for_return(value: &FfiReturn, value_ty: Option<&str>) -> Option<String> {
    match value {
        FfiReturn::BoxReturn | FfiReturn::OptionBoxReturn => boxed_value_type(value_ty?),
        FfiReturn::ArcRefReturn | FfiReturn::OptionArcRefReturn => arc_ref_boxed_type(value_ty?),
        FfiReturn::ArrayOutReturn(element) => Some(element.clone()),
        FfiReturn::PortsOutcomeReturn(port) => Some(format!("flight_sdk::Ref<{port}>")),
        _ => None,
    }
}

fn result_container_type(value: &FfiReturn) -> Option<String> {
    match value {
        FfiReturn::EffectInputSliceReturn => Some("Vec<flight_sdk::EffectInput>".to_string()),
        FfiReturn::EffectKindSliceReturn => Some("Vec<String>".to_string()),
        FfiReturn::VecReturn(spec) | FfiReturn::OptionVecReturn(spec) => {
            Some(format!("Vec<{}>", spec.element_ty))
        }
        FfiReturn::HashMapReturn(spec) | FfiReturn::OptionHashMapReturn(spec) => Some(format!(
            "std::collections::HashMap<String, {}>",
            spec.value_ty
        )),
        FfiReturn::BoxSliceReturn(element) | FfiReturn::OptionBoxSliceReturn(element) => {
            Some(format!("Box<[{element}]>"))
        }
        FfiReturn::SliceReturn(element) => Some(format!("Vec<{element}>")),
        FfiReturn::NestedVecReturn(element) => Some(format!("Vec<Vec<{element}>>")),
        FfiReturn::PortsOutcomeReturn(port) => {
            Some(format!("flight_sdk::MidiAccessPortsOutcome<{port}>"))
        }
        FfiReturn::StringRecordReturn => {
            Some("flight_sdk::xml_native::XmlRecord<String,String>".to_string())
        }
        _ => None,
    }
}

// Every exact Rust type for which this source function emits an owned carrier. Result helper
// handles (Vec/HashMap/etc.) are producers just as direct `Box<T>` returns are.
fn owned_producer_types(func: &ParsedFn) -> BTreeSet<String> {
    let Some(ret) = &func.ret else {
        return BTreeSet::new();
    };
    let Some((_, call_wrap)) = map_return_to_ffi(ret) else {
        return BTreeSet::new();
    };
    let (value_wrap, value_ty) = match &call_wrap {
        FfiReturn::AsyncCallback(spec) => (&spec.value, Some(spec.value_rust_ty.as_str())),
        _ => (&call_wrap, Some(ret.as_str())),
    };
    let shared_ty = match value_wrap {
        FfiReturn::SharedClone(_) => value_ty.and_then(get_shared_value_type),
        _ => None,
    };
    let (value_wrap, value_ty) = match value_wrap {
        FfiReturn::SharedClone(value) => (&**value, shared_ty.as_deref()),
        _ => (value_wrap, value_ty),
    };
    let mut produced = BTreeSet::new();
    produced.extend(boxed_type_for_return(value_wrap, value_ty));
    produced.extend(result_container_type(value_wrap));
    return produced;
}

fn is_caller_retained_clone_type(ty: &str) -> bool {
    let name = ty.rsplit("::").next().unwrap_or(ty).trim();
    CALLER_RETAINED_CLONE_TYPES.contains(&name)
}

fn has_owned_producer(qualified: &str) -> bool {
    PRODUCIBLE_TYPES
        .get()
        .is_some_and(|types| types.lock().unwrap().contains(qualified))
}

// The exact owned box consumed by one parameter, including boxes returned by a callback. This is
// deliberately the same structural predicate used by the mappers below; generated wrappers are
// checked against generated producers after duplicate-symbol filtering.
fn owned_consumed_type(ty: &str) -> Option<String> {
    let ty = strip_crate_paths(&strip_lifetimes(&resolve_type_alias(ty.trim())));
    let ty = ty.as_str();

    if let Some(parsed) = parse_closure_param(ty) {
        let inner = parsed
            .ret
            .strip_prefix("Option<")
            .and_then(|rest| rest.strip_suffix('>'))
            .map(str::trim)
            .filter(|inner| {
                !inner.contains('<')
                    && !inner.contains("::")
                    && !is_scalar(inner)
                    && !is_known_enum(inner)
            })?;
        return qualify_opaque_type(inner);
    }

    if let Some(inner) = ty
        .strip_prefix("Option<")
        .and_then(|rest| rest.strip_suffix('>'))
    {
        let inner = inner.trim();
        if is_caller_retained_clone_type(inner)
            || opaque_clone_handle_type(inner).is_some()
            || matches!(
                get_owned_param(inner),
                Some(OwnedParam::Copied | OwnedParam::Cloned)
            )
        {
            return None;
        }
        if is_opaque_transferred_generic(inner) || can_transfer_named_opaque(inner) {
            return qualify_opaque_type(inner);
        }
        return None;
    }

    if is_opaque_transferred_generic(ty) {
        return qualify_opaque_type(ty);
    }
    if !ty.contains('<')
        && !ty.contains("::")
        && !ty.starts_with('[')
        && !ty.starts_with('(')
        && !is_caller_retained_clone_type(ty)
        && get_owned_param(ty).or_else(|| {
            TYPE_DEFINITIONS
                .get()
                .is_some_and(|definitions| definitions.contains_key(ty))
                .then_some(OwnedParam::Transferred)
        }) == Some(OwnedParam::Transferred)
    {
        return Some(qualify_type(ty));
    }
    return None;
}

fn owned_consumed_types(func: &ParsedFn) -> BTreeSet<String> {
    func.params
        .iter()
        .filter_map(|param| owned_consumed_type(&param.ty))
        .collect()
}

fn ownership_doc(kind: &str, free: &str, owned_type: &str) -> String {
    format!("#[doc = \"flight-ffi ownership|{kind}|{free}|{owned_type}\"]\n")
}

fn borrowed_ownership_doc(anchor: &str) -> String {
    format!("#[doc = \"flight-ffi ownership|borrowed|{anchor}\"]\n")
}

fn explicit_lifetime(ty: &str) -> Option<&str> {
    let start = ty.find('\'')?;
    let end = ty[start + 1..]
        .find(|character: char| !character.is_ascii_alphanumeric() && character != '_')
        .map_or(ty.len(), |end| start + 1 + end);
    return Some(&ty[start..end]);
}

fn borrowed_return_anchor(function: &ParsedFn) -> String {
    let return_ty = function.ret.as_deref().unwrap_or_default();
    if return_ty.contains("'static") {
        return "the process remains alive".to_string();
    }

    let return_lifetime = explicit_lifetime(return_ty);
    let mut inputs: Vec<_> = function
        .params
        .iter()
        .filter(|parameter| {
            if let Some(lifetime) = return_lifetime {
                parameter.ty.contains(lifetime)
            } else {
                let ty = strip_crate_paths(&resolve_type_alias(parameter.ty.trim()));
                ty.starts_with('&') || ty.starts_with("Option<&")
            }
        })
        .map(|parameter| parameter.name.trim_start_matches('_'))
        .collect();
    inputs.sort_unstable();
    inputs.dedup();
    return match inputs.as_slice() {
        [] => "the originating SDK value remains alive".to_string(),
        [input] => format!("the {input} input handle remains alive"),
        _ => format!("the {} input handles remain alive", inputs.join(", ")),
    };
}

fn wrapper_ownership_doc(
    function: &ParsedFn,
    ffi_name: &str,
    value: &FfiReturn,
    boxed_type: Option<&str>,
    callback: bool,
) -> Option<String> {
    let delivery = if callback {
        "owned-callback"
    } else {
        "owned-return"
    };
    match value {
        FfiReturn::StringReturn | FfiReturn::OptionStringReturn => Some(ownership_doc(
            delivery,
            "flight_free_string",
            "std::ffi::c_char",
        )),
        FfiReturn::BoxReturn
        | FfiReturn::OptionBoxReturn
        | FfiReturn::ArcRefReturn
        | FfiReturn::OptionArcRefReturn => {
            let owned_type = boxed_type?;
            Some(ownership_doc(
                delivery,
                &format!("flight_free_{}", boxed_free_suffix(owned_type)),
                owned_type,
            ))
        }
        FfiReturn::VecReturn(_)
        | FfiReturn::OptionVecReturn(_)
        | FfiReturn::HashMapReturn(_)
        | FfiReturn::OptionHashMapReturn(_)
        | FfiReturn::BoxSliceReturn(_)
        | FfiReturn::OptionBoxSliceReturn(_)
        | FfiReturn::SliceReturn(_)
        | FfiReturn::NestedVecReturn(_)
        | FfiReturn::PortsOutcomeReturn(_)
        | FfiReturn::StringRecordReturn => Some(ownership_doc(
            delivery,
            &format!("{ffi_name}_result_free"),
            &result_container_type(value)?,
        )),
        FfiReturn::DisposerReturn => Some(ownership_doc(
            delivery,
            "flight_free_disposer",
            "FfiDisposer",
        )),
        FfiReturn::OwnedByteReaderReturn => Some(ownership_doc(
            delivery,
            "flight_free_owned_byte_reader",
            "FfiOwnedByteReader",
        )),
        FfiReturn::EffectInputSliceReturn | FfiReturn::EffectKindSliceReturn => {
            Some(ownership_doc(
                delivery,
                &format!("{ffi_name}_result_free"),
                &result_container_type(value)?,
            ))
        }
        FfiReturn::ArrayOutReturn(_) => {
            let owned_type = boxed_type?;
            Some(ownership_doc(
                "owned-output",
                &format!("flight_free_{}", boxed_free_suffix(owned_type)),
                owned_type,
            ))
        }
        FfiReturn::RefReturn
        | FfiReturn::OptionRefReturn
        | FfiReturn::OptionBorrowedRefReturn
        | FfiReturn::BorrowedSliceReturn => {
            Some(borrowed_ownership_doc(&borrowed_return_anchor(function)))
        }
        _ => None,
    }
}

// Generic carriers. An outer generic wrapper maps only through its own template below, and only
// when every inner type maps soundly on its own; anything else stays rejected by the non-generic
// arms. Extension-point inner types never map (agents/ffi-public-lane.md).
fn map_generic_carrier_return(ty: &str) -> Option<Option<(String, FfiReturn)>> {
    // A returned no-argument closure is the SDK's disposer for work the call started.
    if ty == "Arc<dyn Fn() + Send + Sync>" {
        return Some(Some((
            " -> *mut FfiDisposer".to_string(),
            FfiReturn::DisposerReturn,
        )));
    }
    if let Some(inner) = ty
        .strip_prefix("Arc<")
        .and_then(|rest| rest.strip_suffix('>'))
    {
        if is_extension_point_type(inner) {
            return Some(Some((
                " -> *mut std::ffi::c_void".to_string(),
                FfiReturn::ArcRefReturn,
            )));
        }
        return Some(map_shared_value_return(inner.trim(), false));
    }
    if let Some(inner) = ty
        .strip_prefix("Option<Arc<")
        .and_then(|rest| rest.strip_suffix(">>"))
    {
        if is_extension_point_type(inner) {
            return Some(Some((
                " -> *mut std::ffi::c_void".to_string(),
                FfiReturn::OptionArcRefReturn,
            )));
        }
        return Some(map_shared_value_return(inner.trim(), true));
    }
    // Ref<Box<TypedArray>> -> a typed array Ref handle sharing the SDK's buffer.
    if get_typed_array_ref(ty).is_some() {
        return Some(Some((
            " -> *mut std::ffi::c_void".to_string(),
            FfiReturn::ArcRefReturn,
        )));
    }
    if ty
        .strip_prefix("Option<")
        .and_then(|rest| rest.strip_suffix('>'))
        .is_some_and(|inner| get_typed_array_ref(inner).is_some())
    {
        return Some(Some((
            " -> *mut std::ffi::c_void".to_string(),
            FfiReturn::OptionArcRefReturn,
        )));
    }
    // XmlRecord<String, String> -> a boxed record with typed index and key reads.
    if ty == "XmlRecord<String, String>" {
        return Some(Some((
            " -> *mut std::ffi::c_void".to_string(),
            FfiReturn::StringRecordReturn,
        )));
    }
    // AccessibilityOperationOutcome<R> over a fieldless reason enum -> bool plus the reason.
    if let Some(reason) = ty
        .strip_prefix("AccessibilityOperationOutcome<")
        .and_then(|rest| rest.strip_suffix('>'))
    {
        return Some(
            is_known_enum(reason.trim())
                .then(|| (" -> bool".to_string(), FfiReturn::OperationOutcomeReturn)),
        );
    }
    // MidiAccessPortsOutcome<P> -> a boxed outcome whose ports are Ref handles.
    if let Some(port) = ty
        .strip_prefix("MidiAccessPortsOutcome<")
        .and_then(|rest| rest.strip_suffix('>'))
    {
        let port = format!("Ref<{}>", port.trim());
        return Some(supported_ref_inner(&port).map(|inner| {
            (
                " -> *mut std::ffi::c_void".to_string(),
                FfiReturn::PortsOutcomeReturn(qualify_type(inner)),
            )
        }));
    }
    // Vec<Vec<T>> -> boxed nested lists of scalars.
    if let Some(inner) = ty
        .strip_prefix("Vec<Vec<")
        .and_then(|rest| rest.strip_suffix(">>"))
    {
        let inner = inner.trim();
        return Some(is_scalar(inner).then(|| {
            (
                " -> *mut std::ffi::c_void".to_string(),
                FfiReturn::NestedVecReturn(inner.to_string()),
            )
        }));
    }
    // [T; N] of owned structs -> N boxed handles written to `out_values`.
    if let Some((element, _length)) = ty
        .strip_prefix('[')
        .and_then(|rest| rest.strip_suffix(']'))
        .and_then(|inner| inner.split_once(';'))
    {
        let element = element.trim();
        if is_scalar(element) {
            return None;
        }
        return Some(is_plain_struct_type(element).then(|| {
            (
                String::new(),
                FfiReturn::ArrayOutReturn(qualify_type(element)),
            )
        }));
    }
    None
}

// The typed arrays with a shared-buffer Ref handle family, as (alias, scalar).
const TYPED_ARRAY_REFS: &[(&str, &str)] = &[("Float32Array", "f32"), ("Uint8Array", "u8")];

// `Ref<Box<Uint8Array>>` or `Ref<Box<[u8]>>` -> ("Uint8Array", "u8").
fn get_typed_array_ref(ty: &str) -> Option<(&'static str, &'static str)> {
    let inner = ty
        .trim()
        .strip_prefix("Ref<Box<")?
        .strip_suffix(">>")?
        .trim();
    TYPED_ARRAY_REFS
        .iter()
        .find(|(alias, scalar)| inner == *alias || inner == format!("[{scalar}]"))
        .copied()
}

// A typed array Ref handle is a boxed `Ref<Box<[T]>>` that shares the SDK's buffer: writes through
// it are visible to every holder, and each handle is released once by its own free. `_read` and
// `_write` copy up to `count` elements from `offset` and return how many they copied; `_length` and
// the copies read 0 from NULL. Concurrent access is synchronized by the Ref's lock.
fn generate_typed_array_ref_support() -> String {
    let mut output = String::new();
    for (alias, scalar) in TYPED_ARRAY_REFS {
        let slug = to_snake_case(alias);
        let handle = format!("flight_sdk::Ref<Box<[{scalar}]>>");
        let owned = ownership_doc("owned-return", &format!("flight_free_{slug}_ref"), &handle);
        write!(
            output,
            "{owned}#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn flight_create_{slug}_ref(values: *const {scalar}, count: usize) -> *mut std::ffi::c_void {{\n    let values: Box<[{scalar}]> = unsafe {{ ffi_slice_from_raw_parts(values, count) }}.into();\n    let handle: {handle} = std::sync::Arc::new(std::sync::RwLock::new(values));\n    return Box::into_raw(Box::new(handle)) as *mut std::ffi::c_void;\n}}\n\
             #[unsafe(no_mangle)]\npub unsafe extern \"C\" fn flight_free_{slug}_ref(handle: *mut {handle}) {{\n    if !handle.is_null() {{ unsafe {{ drop(Box::from_raw(handle)); }} }}\n}}\n\
             #[unsafe(no_mangle)]\npub unsafe extern \"C\" fn flight_get_{slug}_ref_length(handle: *const std::ffi::c_void) -> usize {{\n    if handle.is_null() {{ return 0; }}\n    return unsafe {{ &*(handle as *const {handle}) }}.read().unwrap_or_else(std::sync::PoisonError::into_inner).len();\n}}\n\
             #[unsafe(no_mangle)]\npub unsafe extern \"C\" fn flight_read_{slug}_ref(handle: *const std::ffi::c_void, offset: usize, out: *mut {scalar}, count: usize) -> usize {{\n    if handle.is_null() || out.is_null() {{ return 0; }}\n    let values = unsafe {{ &*(handle as *const {handle}) }}.read().unwrap_or_else(std::sync::PoisonError::into_inner);\n    let source = values.get(offset..).unwrap_or(&[]);\n    let copied = source.len().min(count);\n    unsafe {{ std::ptr::copy_nonoverlapping(source.as_ptr(), out, copied) }};\n    return copied;\n}}\n\
             #[unsafe(no_mangle)]\npub unsafe extern \"C\" fn flight_write_{slug}_ref(handle: *const std::ffi::c_void, offset: usize, values: *const {scalar}, count: usize) -> usize {{\n    if handle.is_null() || values.is_null() {{ return 0; }}\n    let mut target = unsafe {{ &*(handle as *const {handle}) }}.write().unwrap_or_else(std::sync::PoisonError::into_inner);\n    let Some(target) = target.get_mut(offset..) else {{ return 0; }};\n    let copied = target.len().min(count);\n    unsafe {{ std::ptr::copy_nonoverlapping(values, target.as_mut_ptr(), copied) }};\n    return copied;\n}}\n"
        )
        .unwrap();
    }
    output
}

// A named, non-generic SDK struct that an `&T` / `*const T` carrier can point at directly.
fn is_plain_struct_type(ty: &str) -> bool {
    !ty.is_empty()
        && ty != "str"
        && !is_scalar(ty)
        && !is_known_enum(ty)
        && !ty.starts_with('&')
        && !ty.starts_with('[')
        && !is_ffi_incompatible(ty)
        && !is_extension_point_type(ty)
}

// Generic slice carriers for parameters. Every element pointer is borrowed for the call only.
fn map_generic_carrier_param(name: &str, ty: &str) -> Option<Option<MappedParam>> {
    // An exact mutable collector -> its registered caller-owned handle. Without a live handle the
    // wrapper returns its empty value and never calls the SDK.
    if let Some((_, handle, slug, _)) = REGISTERED_HANDLES
        .iter()
        .find(|(param_ty, ..)| *param_ty == ty)
    {
        let clean = name.trim_start_matches('_');
        return Some(Some(MappedParam {
            ffi_params: vec![(name.to_string(), format!("*mut {handle}"))],
            bindings: vec![format!(
                "    let Some(values_{clean}) = (unsafe {{ ffi_{slug}_values({name}) }}) else {{ return Default::default(); }};"
            )],
            call_expr: format!("values_{clean}"),
        }));
    }
    // Ref<Box<TypedArray>> by value -> a typed array Ref handle, cloned for the call.
    if let Some((_, scalar)) = get_typed_array_ref(ty) {
        return Some(mapped_single(
            name,
            "*const std::ffi::c_void",
            format!("unsafe {{ (*({name} as *const flight_sdk::Ref<Box<[{scalar}]>>)).clone() }}"),
        ));
    }
    let inner = ty.strip_prefix("&[")?.strip_suffix(']')?.trim();
    // &[Ref<Box<TypedArray>>] -> an array of typed array Ref handles, each cloned for the call.
    if let Some((_, scalar)) = get_typed_array_ref(inner) {
        let ptr_name = format!("{name}_ptr");
        let len_name = format!("{name}_len");
        let binding = format!("{}_refs", name.trim_start_matches('_'));
        let element_ty = format!("flight_sdk::Ref<Box<[{scalar}]>>");
        return Some(Some(MappedParam {
            ffi_params: vec![
                (
                    ptr_name.clone(),
                    "*const *const std::ffi::c_void".to_string(),
                ),
                (len_name.clone(), "usize".to_string()),
            ],
            bindings: vec![
                format!(
                    "    assert!(!{ptr_name}.is_null() || {len_name} == 0, \"null Ref slice must have length zero\");"
                ),
                format!(
                    "    let {binding}_handles: &[*const std::ffi::c_void] = unsafe {{ ffi_slice_from_raw_parts({ptr_name}, {len_name}) }};"
                ),
                format!(
                    "    let {binding}: Vec<{element_ty}> = {binding}_handles.iter().map(|handle| {{ assert!(!(*handle).is_null(), \"Ref slice contains a null handle\"); unsafe {{ &*(*handle as *const {element_ty}) }}.clone() }}).collect();"
                ),
            ],
            call_expr: format!("&{binding}"),
        }));
    }
    let ptr_name = format!("{name}_ptr");
    let len_name = format!("{name}_len");
    let binding = format!("{}_items", name.trim_start_matches('_'));
    let null_check = format!(
        "    assert!(!{ptr_name}.is_null() || {len_name} == 0, \"null array must have length zero\");"
    );
    let pointers = |element_ptr: &str| {
        format!(
            "    let {binding}_ptrs: &[*const {element_ptr}] = unsafe {{ ffi_slice_from_raw_parts({ptr_name}, {len_name}) }};"
        )
    };

    // &[Vec<T>] of scalars -> (lists, lengths, count), copied into owned lists for the call.
    if let Some(element) = inner
        .strip_prefix("Vec<")
        .and_then(|rest| rest.strip_suffix('>'))
    {
        let element = element.trim();
        if !is_scalar(element) {
            return Some(None);
        }
        let lengths_name = format!("{name}_lengths");
        return Some(Some(MappedParam {
            ffi_params: vec![
                (
                    ptr_name.clone(),
                    "*const *const std::ffi::c_void".to_string(),
                ),
                (lengths_name.clone(), "*const usize".to_string()),
                (len_name.clone(), "usize".to_string()),
            ],
            bindings: vec![
                format!(
                    "    assert!((!{ptr_name}.is_null() && !{lengths_name}.is_null()) || {len_name} == 0, \"null list array must have length zero\");"
                ),
                pointers("std::ffi::c_void"),
                format!(
                    "    let {binding}_lengths: &[usize] = unsafe {{ ffi_slice_from_raw_parts({lengths_name}, {len_name}) }};"
                ),
                format!(
                    "    let {binding}: Vec<Vec<{element}>> = {binding}_ptrs.iter().zip({binding}_lengths).map(|(list, length)| unsafe {{ ffi_slice_from_raw_parts(*list as *const {element}, *length) }}.to_vec()).collect();"
                ),
            ],
            call_expr: format!("&{binding}"),
        }));
    }

    // &[(&str, &str)] -> parallel key and value C string arrays sharing one count.
    if inner == "(&str, &str)" {
        let keys_name = format!("{name}_keys");
        let values_name = format!("{name}_values");
        return Some(Some(MappedParam {
            ffi_params: vec![
                (
                    keys_name.clone(),
                    "*const *const std::ffi::c_char".to_string(),
                ),
                (
                    values_name.clone(),
                    "*const *const std::ffi::c_char".to_string(),
                ),
                (len_name.clone(), "usize".to_string()),
            ],
            bindings: vec![
                format!(
                    "    assert!((!{keys_name}.is_null() && !{values_name}.is_null()) || {len_name} == 0, \"null string pair arrays must have length zero\");"
                ),
                format!(
                    "    let {binding}_keys: &[*const std::ffi::c_char] = unsafe {{ ffi_slice_from_raw_parts({keys_name}, {len_name}) }};"
                ),
                format!(
                    "    let {binding}_values: &[*const std::ffi::c_char] = unsafe {{ ffi_slice_from_raw_parts({values_name}, {len_name}) }};"
                ),
                format!(
                    "    let {binding}: Vec<(&str, &str)> = {binding}_keys.iter().zip({binding}_values).map(|(key, value)| {{ assert!(!(*key).is_null() && !(*value).is_null(), \"string pair arrays contain a null pointer\"); (unsafe {{ std::ffi::CStr::from_ptr(*key) }}.to_str().unwrap_or(\"\"), unsafe {{ std::ffi::CStr::from_ptr(*value) }}.to_str().unwrap_or(\"\")) }}).collect();"
                ),
            ],
            call_expr: format!("&{binding}"),
        }));
    }

    let element = inner.strip_prefix('&')?.trim();
    // &[&[T; N]] of scalars -> an array of fixed-array pointers.
    let (element_ty, element_ptr) = if let Some((scalar, length)) = element
        .strip_prefix('[')
        .and_then(|rest| rest.strip_suffix(']'))
        .and_then(|array| array.split_once(';'))
    {
        let scalar = scalar.trim();
        if !is_scalar(scalar) {
            return Some(None);
        }
        (
            format!("[{scalar}; {}]", length.trim()),
            "std::ffi::c_void".to_string(),
        )
    } else if is_plain_struct_type(element) || qualify_opaque_type(element).is_some() {
        // &[&T] -> an array of struct pointers.
        (
            qualify_opaque_type(element).unwrap(),
            "std::ffi::c_void".to_string(),
        )
    } else {
        return Some(None);
    };
    Some(Some(MappedParam {
        ffi_params: vec![
            (ptr_name.clone(), format!("*const *const {element_ptr}")),
            (len_name.clone(), "usize".to_string()),
        ],
        bindings: vec![
            null_check,
            pointers(&element_ptr),
            format!(
                "    let {binding}: Vec<&{element_ty}> = {binding}_ptrs.iter().map(|item| {{ assert!(!(*item).is_null(), \"array contains a null pointer\"); unsafe {{ &*(*item as *const {element_ty}) }} }}).collect();"
            ),
        ],
        call_expr: format!("&{binding}"),
    }))
}

// The shared value's own owned carrier: a boxed struct or a boxed Vec, never a borrow, a Ref
// handle, or a dyn/closure value whose clone would be a behavior object rather than data.
fn map_shared_value_return(inner: &str, optional: bool) -> Option<(String, FfiReturn)> {
    if inner.contains("dyn ") || is_extension_point_type(inner) {
        return None;
    }
    let value_ty = if optional {
        format!("Option<{inner}>")
    } else {
        inner.to_string()
    };
    let (decl, value) = map_return_to_ffi(&value_ty)?;
    let owned = if optional {
        matches!(
            value,
            FfiReturn::OptionBoxReturn | FfiReturn::OptionVecReturn(_)
        )
    } else {
        matches!(value, FfiReturn::BoxReturn | FfiReturn::VecReturn(_))
    };
    if !owned {
        return None;
    }
    Some((decl, FfiReturn::SharedClone(Box::new(value))))
}

fn get_shared_value_type(ty: &str) -> Option<String> {
    let resolved = strip_crate_paths(&strip_lifetimes(&resolve_type_alias(ty.trim())));
    if let Some(inner) = resolved
        .strip_prefix("Option<Arc<")
        .and_then(|rest| rest.strip_suffix(">>"))
    {
        return Some(format!("Option<{}>", inner.trim()));
    }
    let inner = resolved.strip_prefix("Arc<")?.strip_suffix('>')?;
    Some(inner.trim().to_string())
}

fn is_extension_point_type(ty: &str) -> bool {
    EXTENSION_POINT_TYPES.iter().any(|extension| {
        ty.split(|c: char| !c.is_alphanumeric() && c != '_')
            .any(|word| word == *extension)
    })
}

fn is_tuple(ty: &str) -> bool {
    ty.starts_with('(') && ty.ends_with(')')
}

fn scalar_tuple_elements(ty: &str) -> Option<Vec<String>> {
    if !is_tuple(ty) {
        return None;
    }
    let elements: Vec<String> = ty[1..ty.len() - 1]
        .split(',')
        .map(str::trim)
        .filter(|element| !element.is_empty())
        .map(str::to_string)
        .collect();
    if elements.len() < 2 || elements.iter().any(|element| !is_scalar(element)) {
        return None;
    }
    Some(elements)
}

fn supported_ref_inner(ty: &str) -> Option<&str> {
    let inner = ty.strip_prefix("Ref<")?.strip_suffix('>')?.trim();
    if let Some(trait_name) = inner.strip_prefix("dyn ") {
        let trait_name = trait_name.rsplit("::").next().unwrap_or(trait_name);
        if DYN_OPAQUE_TRAITS
            .iter()
            .any(|(known, _)| *known == trait_name)
            || DYN_MONO_TRAITS
                .iter()
                .any(|(known, _)| *known == trait_name)
        {
            return Some(inner);
        }
        return None;
    }
    if inner.contains('<') || inner.contains("::") {
        return None;
    }
    Some(inner)
}

#[derive(Clone, Debug, Eq, Ord, PartialEq, PartialOrd)]
struct VecRefHandleSpec {
    slug: String,
    inner_ty: String,
    tag: u64,
}

fn vec_ref_handle_spec(ty: &str) -> Option<VecRefHandleSpec> {
    let ty = strip_crate_paths(&strip_lifetimes(&resolve_type_alias(ty.trim())));
    let inner = ty.strip_prefix("&mut Vec<")?.strip_suffix('>')?.trim();
    let ref_inner = supported_ref_inner(inner)?;
    let (dyn_prefix, bare_inner) = match ref_inner.strip_prefix("dyn ") {
        Some(inner) => ("dyn_", inner),
        None => ("", ref_inner),
    };
    let bare_inner = bare_inner.rsplit("::").next().unwrap_or(bare_inner);
    let slug = format!("{dyn_prefix}{}", to_snake_case(bare_inner));
    let inner_ty = qualify_type(ref_inner);
    let tag = inner_ty
        .as_bytes()
        .iter()
        .fold(0xcbf29ce484222325, |hash, byte| {
            (hash ^ u64::from(*byte)).wrapping_mul(0x100000001b3)
        });
    Some(VecRefHandleSpec {
        slug,
        inner_ty,
        tag,
    })
}

fn collect_vec_ref_handle_specs(func: &ParsedFn, specs: &mut BTreeSet<VecRefHandleSpec>) {
    specs.extend(
        func.params
            .iter()
            .filter_map(|param| vec_ref_handle_spec(&param.ty)),
    );
}

fn validate_required_vec_ref_handle_specs(specs: &BTreeSet<VecRefHandleSpec>) {
    let actual: BTreeSet<_> = specs
        .iter()
        .map(|spec| (spec.slug.as_str(), spec.inner_ty.as_str()))
        .collect();
    let expected: BTreeSet<_> = [
        ("app_window", "flight_sdk::AppWindow"),
        ("audio_channel", "flight_sdk::AudioChannel"),
        ("dyn_modifier", "dyn flight_sdk::Modifier"),
        ("flow_state", "flight_sdk::FlowState"),
        ("texture", "flight_sdk::Texture"),
        ("texture_atlas_region", "flight_sdk::TextureAtlasRegion"),
        ("tray_icon", "flight_sdk::TrayIcon"),
    ]
    .into_iter()
    .collect();
    assert_eq!(
        actual, expected,
        "generated mutable Vec<Ref<_>> handle types changed"
    );
    let tags: BTreeSet<_> = specs.iter().map(|spec| spec.tag).collect();
    assert_eq!(
        tags.len(),
        specs.len(),
        "mutable Vec<Ref<_>> handle tags must be unique"
    );
}

fn outer_generic_parts(ty: &str) -> Option<(&str, &str)> {
    let start = ty.find('<')?;
    if !ty.ends_with('>') {
        return None;
    }
    let mut depth = 0usize;
    for (index, character) in ty.char_indices().skip_while(|(index, _)| *index < start) {
        match character {
            '<' => depth += 1,
            '>' => {
                depth = depth.checked_sub(1)?;
                if depth == 0 && index != ty.len() - 1 {
                    return None;
                }
            }
            _ => {}
        }
    }
    (depth == 0).then(|| (ty[..start].trim(), ty[start + 1..ty.len() - 1].trim()))
}

fn split_generic_arguments(arguments: &str) -> Option<Vec<&str>> {
    let mut result = Vec::new();
    let mut depth = 0usize;
    let mut start = 0usize;
    for (index, character) in arguments.char_indices() {
        match character {
            '<' | '[' | '(' => depth += 1,
            '>' | ']' | ')' => depth = depth.checked_sub(1)?,
            ',' if depth == 0 => {
                let argument = arguments[start..index].trim();
                if argument.is_empty() {
                    return None;
                }
                result.push(argument);
                start = index + 1;
            }
            _ => {}
        }
    }
    if depth != 0 {
        return None;
    }
    let argument = arguments[start..].trim();
    if argument.is_empty() {
        return None;
    }
    result.push(argument);
    Some(result)
}

// A Rust type used only behind an opaque pointer. Generic arguments still have to be exact in the
// generated Rust cast, even though C and HashLink see only `void *`.
fn qualify_opaque_type(ty: &str) -> Option<String> {
    let ty = ty.trim();
    if ty == "Detector" {
        return Some(format!(
            "std::sync::Arc<dyn Fn(&{QUALIFIER}::skeleton2d_formats::contract::JsonRecord) -> bool + Send + Sync>"
        ));
    }
    if ty == "Census" {
        return Some(format!(
            "std::sync::Arc<dyn Fn(&{QUALIFIER}::skeleton2d_formats::contract::JsonRecord) -> std::collections::HashMap<String, usize> + Send + Sync>"
        ));
    }
    if ty.is_empty()
        || ty.as_bytes().contains(&39)
        || ty.starts_with('&')
        || ty.contains("Fn(")
        || ty.contains("FnMut(")
        || ty.contains("FnOnce(")
    {
        return None;
    }
    if ty == "()" || is_scalar(ty) || ty == "String" {
        return Some(ty.to_string());
    }
    if let Some(inner) = ty.strip_prefix("dyn ") {
        let trait_name = inner.rsplit("::").next().unwrap_or(inner).trim();
        if DYN_OPAQUE_TRAITS
            .iter()
            .any(|(known, _)| *known == trait_name)
            || DYN_MONO_TRAITS
                .iter()
                .any(|(known, _)| *known == trait_name)
        {
            return Some(format!("dyn {QUALIFIER}::{trait_name}"));
        }
        return None;
    }
    if let Some(inner) = ty.strip_prefix('[').and_then(|rest| rest.strip_suffix(']')) {
        let (element, length) = inner.split_once(';')?;
        length.trim().parse::<usize>().ok()?;
        return Some(format!(
            "[{}; {}]",
            qualify_opaque_type(element.trim())?,
            length.trim()
        ));
    }
    if let Some((outer, arguments)) = outer_generic_parts(ty) {
        let outer = outer.rsplit("::").next().unwrap_or(outer);
        let arguments = split_generic_arguments(arguments)?
            .into_iter()
            .map(qualify_opaque_type)
            .collect::<Option<Vec<_>>>()?;
        let expected_arguments = match outer {
            "Vec" | "Option" | "Box" | "Arc" | "Ref" | "Signal" | "SignalSlot" | "Tween"
            | "Record" => 1,
            "HashMap" => 2,
            _ => arguments.len(),
        };
        if arguments.len() != expected_arguments {
            return None;
        }
        let qualified_outer = match outer {
            "Vec" | "Option" | "Box" => outer.to_string(),
            "Arc" => "std::sync::Arc".to_string(),
            "HashMap" => "std::collections::HashMap".to_string(),
            _ => format!("{QUALIFIER}::{outer}"),
        };
        return Some(format!("{qualified_outer}<{}>", arguments.join(", ")));
    }
    if ty.contains('<') || ty.contains('>') || ty.starts_with('(') || ty == "str" {
        return None;
    }
    let name = ty.rsplit("::").next().unwrap_or(ty);
    if name == "Value" {
        return Some("serde_json::Value".to_string());
    }
    if let Some((_, module)) = CONTRACT_LANE_ENUMS.iter().find(|(known, _)| *known == name) {
        return Some(format!("{QUALIFIER}::{module}::contract::{name}"));
    }
    if let Some((_, module)) = CONTRACT_LANE_TYPES.iter().find(|(known, _)| *known == name) {
        return Some(format!("{QUALIFIER}::{module}::contract::{name}"));
    }
    (!name.is_empty()).then(|| format!("{QUALIFIER}::{name}"))
}

fn qualify_type(ty: &str) -> String {
    if let Some(qualified) = qualify_opaque_type(ty) {
        return qualified;
    }
    if let Some((_, module)) = CONTRACT_LANE_ENUMS.iter().find(|(name, _)| *name == ty) {
        return format!("{QUALIFIER}::{module}::contract::{ty}");
    }
    if is_scalar(ty) || ty.starts_with('[') || ty.starts_with('(') || ty == "String" {
        ty.to_string()
    } else if let Some(inner) = ty.strip_prefix("dyn ") {
        format!("dyn {QUALIFIER}::{inner}")
    } else {
        format!("{QUALIFIER}::{ty}")
    }
}

fn resolve_type_alias(ty: &str) -> String {
    // Aliases match by bare name, so `&flight_entity::Uint8Array` must lose its path first or it
    // falls through to an opaque pointer to an unsized slice.
    let mut unqualified = strip_crate_paths(ty);
    // `NonEntityCreateResult<T>` is `pub type NonEntityCreateResult<T> = T`: an identity alias
    // that only documents a non-Entity `create*` result, so the ABI sees `T` itself.
    while let Some(inner) = unqualified
        .strip_prefix("NonEntityCreateResult<")
        .and_then(|rest| rest.strip_suffix('>'))
    {
        unqualified = inner.trim().to_string();
    }
    let ty = unqualified.as_str();
    let slice_aliases: &[(&str, &str)] = &[
        ("Uint8Array", "[u8]"),
        ("Int8Array", "[i8]"),
        ("Uint16Array", "[u16]"),
        ("Int16Array", "[i16]"),
        ("Uint32Array", "[u32]"),
        ("Int32Array", "[i32]"),
        ("Float32Array", "[f32]"),
        ("Float64Array", "[f64]"),
    ];
    for &(alias, resolved) in slice_aliases {
        if let Some(rest) = ty.strip_prefix("Option<&mut ") {
            if let Some(inner) = rest.strip_suffix('>') {
                if inner.trim() == alias {
                    return format!("Option<&mut {resolved}>");
                }
            }
        }
        if let Some(rest) = ty.strip_prefix("Option<&") {
            if let Some(inner) = rest.strip_suffix('>') {
                if inner.trim() == alias {
                    return format!("Option<&{resolved}>");
                }
            }
        }
        if let Some(rest) = ty.strip_prefix("&mut ") {
            if rest.trim() == alias {
                return format!("&mut {resolved}");
            }
        }
        if let Some(rest) = ty.strip_prefix('&') {
            if rest.trim() == alias {
                return format!("&{resolved}");
            }
        }
    }

    for &(alias, resolved) in slice_aliases {
        if let Some(rest) = ty.strip_prefix("Box<") {
            if let Some(inner) = rest.strip_suffix('>') {
                if inner.trim() == alias {
                    return format!("Box<{resolved}>");
                }
            }
        }
        if let Some(rest) = ty.strip_prefix("Option<Box<") {
            if let Some(inner) = rest.strip_suffix(">>") {
                if inner.trim() == alias {
                    return format!("Option<Box<{resolved}>>");
                }
            }
        }
    }

    let like_aliases: &[(&str, &str)] = &[("Scene3DLightsLike", "Scene3DLights")];
    for &(alias, resolved) in like_aliases {
        if let Some(rest) = ty.strip_prefix("&mut ") {
            if rest.trim() == alias {
                return format!("&mut {resolved}");
            }
        }
        if let Some(rest) = ty.strip_prefix('&') {
            if rest.trim() == alias {
                return format!("&{resolved}");
            }
        }
    }

    let clock_alias = "Arc<dyn Fn() -> f64 + Send + Sync>";
    let aliases: &[(&str, &str)] = &[
        ("Physics2DAbiObjectId", "u32"),
        ("Physics3DAbiObjectId", "u32"),
        ("Physics2DAbiWorldHandle", "u32"),
        ("Physics3DAbiWorldHandle", "u32"),
        ("SpatialObjectId", "i32"),
        ("SourceId", "u64"),
        ("Kind", "String"),
        ("AnimationPlayerRef", "Ref<AnimationPlayer>"),
        ("AnimationStateMachineRef", "Ref<AnimationStateMachine>"),
        ("CameraGuardStateRef", "Ref<CameraGuardState>"),
        ("AnimationBlendTreeRef", "Ref<AnimationBlendTree>"),
        ("DebugStateRef", "Ref<DebugState>"),
        ("FlowGuardStateRef", "Ref<FlowGuardState>"),
        ("LogStateRef", "Ref<LogState>"),
        ("Node2DRef", "Ref<dyn Node2D>"),
        ("Node3DRef", "Ref<dyn Node3D>"),
        ("NodeRef", "Ref<dyn Node>"),
        ("Physics2DContactRef", "Ref<Physics2DContact>"),
        (
            "Scene2DResourceFailureGuardStateRef",
            "Ref<Scene2DResourceFailureGuardState>",
        ),
        ("ShapeBoundsStateRef", "Ref<ShapeBoundsState>"),
        ("ShapeRuntimeRef", "Ref<ShapeRuntime>"),
        ("Skeleton3DGuardStateRef", "Ref<Skeleton3DGuardState>"),
        ("SocketGuardStateRef", "Ref<SocketGuardState>"),
        ("StatechartGuardStateRef", "Ref<StatechartGuardState>"),
        ("TimelineRef", "Ref<Timeline>"),
        ("BitmapTextClock", clock_alias),
        ("ClockProvider", clock_alias),
        ("EasingFn", "Arc<dyn Fn(f32) -> f32 + Send + Sync>"),
        ("MovieClipGuardClock", clock_alias),
        ("NodeGuardClock", clock_alias),
        ("Physics2DGuardClock", clock_alias),
        ("Scene2DResourceFailureClock", clock_alias),
        ("Scene3DResourceFailureClock", clock_alias),
        ("Skeleton3DGuardClock", clock_alias),
        ("TextGuardClock", clock_alias),
        ("TextMarkupClock", clock_alias),
    ];
    for &(alias, resolved) in aliases {
        if ty == alias {
            return resolved.to_string();
        }
        if let Some(rest) = ty.strip_prefix("&mut ") {
            if rest.trim() == alias {
                return format!("&mut {resolved}");
            }
        }
        if let Some(rest) = ty.strip_prefix('&') {
            if rest.trim() == alias {
                return format!("&{resolved}");
            }
        }
        if let Some(rest) = ty.strip_prefix("Option<&mut ") {
            if let Some(inner) = rest.strip_suffix('>') {
                if inner.trim() == alias {
                    return format!("Option<&mut {resolved}>");
                }
            }
        }
        if let Some(rest) = ty.strip_prefix("Option<&") {
            if let Some(inner) = rest.strip_suffix('>') {
                if inner.trim() == alias {
                    return format!("Option<&{resolved}>");
                }
            }
        }
        if let Some(rest) = ty.strip_prefix("Option<") {
            if let Some(inner) = rest.strip_suffix('>') {
                if inner.trim() == alias {
                    return format!("Option<{resolved}>");
                }
            }
        }
    }
    ty.to_string()
}

struct MappedParam {
    ffi_params: Vec<(String, String)>,
    bindings: Vec<String>,
    call_expr: String,
}

fn mapped_single(name: &str, ffi_ty: &str, call_expr: String) -> Option<MappedParam> {
    Some(MappedParam {
        ffi_params: vec![(name.to_string(), ffi_ty.to_string())],
        bindings: Vec::new(),
        call_expr,
    })
}

fn strip_lifetimes(ty: &str) -> String {
    let mut result = ty.to_string();
    while let Some(start) = result.find('\'') {
        let end = result[start + 1..]
            .find(|c: char| !c.is_alphanumeric() && c != '_')
            .map(|i| start + 1 + i)
            .unwrap_or(result.len());
        result = format!("{}{}", &result[..start], result[end..].trim_start());
    }
    result
}

fn strip_crate_paths(ty: &str) -> String {
    let crate_prefixes: &[&str] = &[
        "flight_entity::",
        "flight_xml::",
        "flight_animation::",
        "flight_node::",
        "flight_requirement::",
        "flight_scene2d::",
        "flight_scene3d::",
        "crate::types::",
        "crate::",
    ];
    let mut result = ty.to_string();
    for prefix in crate_prefixes {
        result = result.replace(prefix, "");
    }
    result
}

struct ParsedClosure {
    params: Vec<(String, bool)>,
    ret: String,
    is_arc: bool,
    is_mut: bool,
}

fn parse_closure_param(ty: &str) -> Option<ParsedClosure> {
    let is_arc;
    let is_mut;
    let fn_part;
    if let Some(inner) = ty.strip_prefix("&dyn Fn(") {
        is_arc = false;
        is_mut = false;
        fn_part = inner;
    } else if let Some(inner) = ty.strip_prefix("&mut dyn FnMut(") {
        is_arc = false;
        is_mut = true;
        fn_part = inner;
    } else if let Some(rest) = ty.strip_prefix("Arc<dyn Fn(") {
        if let Some(inner) = rest.strip_suffix('>') {
            let inner = inner
                .trim_end_matches("+ Send + Sync")
                .trim_end_matches("+ Send")
                .trim_end_matches("+ Sync")
                .trim();
            is_arc = true;
            is_mut = false;
            fn_part = inner;
        } else {
            return None;
        }
    } else {
        return None;
    }

    let paren_end = fn_part.find(')')?;
    let params_str = &fn_part[..paren_end];
    let rest = fn_part[paren_end + 1..].trim();

    let ret = if rest.is_empty() {
        "void".to_string()
    } else if let Some(ret_ty) = rest.strip_prefix("-> ") {
        ret_ty.trim().to_string()
    } else {
        return None;
    };

    let mut params = Vec::new();
    if !params_str.is_empty() {
        for p in params_str.split(',') {
            let p = p.trim();
            if p.is_empty() {
                continue;
            }
            if p.starts_with('&') {
                params.push((p[1..].trim().to_string(), true));
            } else {
                params.push((p.to_string(), false));
            }
        }
    }

    Some(ParsedClosure {
        params,
        ret,
        is_arc,
        is_mut,
    })
}

fn opaque_clone_handle_type(ty: &str) -> Option<String> {
    if matches!(ty, "Census" | "Detector") {
        return qualify_opaque_type(ty);
    }
    let (outer, _) = outer_generic_parts(ty)?;
    let outer = outer.rsplit("::").next().unwrap_or(outer);
    matches!(outer, "Arc" | "Ref" | "SignalSlot").then(|| qualify_opaque_type(ty))?
}

fn is_opaque_transferred_generic(ty: &str) -> bool {
    outer_generic_parts(ty).is_some_and(|(outer, _)| {
        matches!(
            outer.rsplit("::").next().unwrap_or(outer),
            "HashMap" | "Signal" | "Tween" | "Vec"
        )
    })
}

fn can_transfer_named_opaque(ty: &str) -> bool {
    if ty.contains('<') || ty.contains("::") {
        return false;
    }
    get_owned_param(ty) == Some(OwnedParam::Transferred)
        || (get_owned_param(ty).is_none()
            && TYPE_DEFINITIONS
                .get()
                .is_some_and(|definitions| definitions.contains_key(ty)))
}

fn is_opaque_fallback_excluded(ty: &str) -> bool {
    OPAQUE_FALLBACK_EXCLUDED_TYPES.iter().any(|excluded| {
        ty.split(|character: char| !character.is_alphanumeric() && character != '_')
            .any(|word| word == *excluded)
    })
}

// Last-resort carrier for data types whose layout is deliberately hidden from C. Policy checks
// have already run before this mapper: this function never turns a dyn behavior extension into a
// data handle.
fn map_opaque_fallback_param(name: &str, ty: &str) -> Option<MappedParam> {
    if is_opaque_fallback_excluded(ty) {
        return None;
    }

    for (prefix, mutable) in [("Option<&mut [", true), ("Option<&[", false)] {
        if let Some(element) = ty
            .strip_prefix(prefix)
            .and_then(|rest| rest.strip_suffix("]>"))
        {
            let element = qualify_opaque_type(element.trim())?;
            let ptr_name = format!("{name}_ptr");
            let len_name = format!("{name}_len");
            let pointer = if mutable { "*mut" } else { "*const" };
            let adapter = if mutable {
                "ffi_slice_from_raw_parts_mut"
            } else {
                "ffi_slice_from_raw_parts"
            };
            return Some(MappedParam {
                ffi_params: vec![
                    (ptr_name.clone(), format!("{pointer} std::ffi::c_void")),
                    (len_name.clone(), "usize".to_string()),
                ],
                bindings: Vec::new(),
                call_expr: format!(
                    "if {ptr_name}.is_null() && {len_name} == 0 {{ None }} else {{ Some(unsafe {{ {adapter}({ptr_name} as {pointer} {element}, {len_name}) }}) }}"
                ),
            });
        }
    }

    for (prefix, mutable) in [("&mut [", true), ("&[", false)] {
        if let Some(element) = ty
            .strip_prefix(prefix)
            .and_then(|rest| rest.strip_suffix(']'))
        {
            let element = qualify_opaque_type(element.trim())?;
            let ptr_name = format!("{name}_ptr");
            let len_name = format!("{name}_len");
            let pointer = if mutable { "*mut" } else { "*const" };
            let adapter = if mutable {
                "ffi_slice_from_raw_parts_mut"
            } else {
                "ffi_slice_from_raw_parts"
            };
            return Some(MappedParam {
                ffi_params: vec![
                    (ptr_name.clone(), format!("{pointer} std::ffi::c_void")),
                    (len_name.clone(), "usize".to_string()),
                ],
                bindings: Vec::new(),
                call_expr: format!(
                    "unsafe {{ {adapter}({ptr_name} as {pointer} {element}, {len_name}) }}"
                ),
            });
        }
    }

    for (prefix, mutable) in [("Option<&mut ", true), ("Option<&", false)] {
        if let Some(inner) = ty
            .strip_prefix(prefix)
            .and_then(|rest| rest.strip_suffix('>'))
        {
            if !is_ffi_incompatible(inner.trim()) {
                return None;
            }
            let qualified = qualify_opaque_type(inner.trim())?;
            let pointer = if mutable { "*mut" } else { "*const" };
            let borrow = if mutable { "&mut *" } else { "&*" };
            return mapped_single(
                name,
                &format!("{pointer} std::ffi::c_void"),
                format!(
                    "if {name}.is_null() {{ None }} else {{ Some(unsafe {{ {borrow}({name} as {pointer} {qualified}) }}) }}"
                ),
            );
        }
    }

    for (prefix, mutable) in [("&mut ", true), ("&", false)] {
        if let Some(inner) = ty.strip_prefix(prefix) {
            if !is_ffi_incompatible(inner.trim()) {
                return None;
            }
            let qualified = qualify_opaque_type(inner.trim())?;
            let pointer = if mutable { "*mut" } else { "*const" };
            let borrow = if mutable { "&mut *" } else { "&*" };
            return mapped_single(
                name,
                &format!("{pointer} std::ffi::c_void"),
                format!("unsafe {{ {borrow}({name} as {pointer} {qualified}) }}"),
            );
        }
    }

    if let Some(inner) = ty
        .strip_prefix("Option<")
        .and_then(|rest| rest.strip_suffix('>'))
    {
        let inner = inner.trim();
        if is_caller_retained_clone_type(inner) {
            let qualified = qualify_opaque_type(inner)?;
            return mapped_single(
                name,
                "*const std::ffi::c_void",
                format!(
                    "if {name}.is_null() {{ None }} else {{ Some(unsafe {{ (*({name} as *const {qualified})).clone() }}) }}"
                ),
            );
        }
        if let Some(qualified) = opaque_clone_handle_type(inner) {
            return mapped_single(
                name,
                "*const std::ffi::c_void",
                format!(
                    "if {name}.is_null() {{ None }} else {{ Some(unsafe {{ (*({name} as *const {qualified})).clone() }}) }}"
                ),
            );
        }
        let qualified = qualify_opaque_type(inner)?;
        return match get_owned_param(inner) {
            Some(OwnedParam::Copied) => mapped_single(
                name,
                "*const std::ffi::c_void",
                format!(
                    "if {name}.is_null() {{ None }} else {{ Some(unsafe {{ *({name} as *const {qualified}) }}) }}"
                ),
            ),
            Some(OwnedParam::Cloned) => mapped_single(
                name,
                "*const std::ffi::c_void",
                format!(
                    "if {name}.is_null() {{ None }} else {{ Some(unsafe {{ (*({name} as *const {qualified})).clone() }}) }}"
                ),
            ),
            Some(OwnedParam::Transferred)
                if can_transfer_named_opaque(inner) && has_owned_producer(&qualified) =>
            {
                mapped_single(
                    name,
                    "*mut std::ffi::c_void",
                    format!(
                        "if {name}.is_null() {{ None }} else {{ Some(*unsafe {{ Box::from_raw({name} as *mut {qualified}) }}) }}"
                    ),
                )
            }
            None if (is_opaque_transferred_generic(inner) || can_transfer_named_opaque(inner))
                && has_owned_producer(&qualified) =>
            {
                mapped_single(
                    name,
                    "*mut std::ffi::c_void",
                    format!(
                        "if {name}.is_null() {{ None }} else {{ Some(*unsafe {{ Box::from_raw({name} as *mut {qualified}) }}) }}"
                    ),
                )
            }
            _ => None,
        };
    }

    if let Some(qualified) = opaque_clone_handle_type(ty) {
        return mapped_single(
            name,
            "*const std::ffi::c_void",
            format!("unsafe {{ (*({name} as *const {qualified})).clone() }}"),
        );
    }
    if is_opaque_transferred_generic(ty) {
        let qualified = qualify_opaque_type(ty)?;
        if !has_owned_producer(&qualified) {
            return None;
        }
        return Some(MappedParam {
            ffi_params: vec![(name.to_string(), "*mut std::ffi::c_void".to_string())],
            bindings: vec![format!(
                "    assert!(!{name}.is_null(), \"{name} must be an owned {ty} handle\");"
            )],
            call_expr: format!("*unsafe {{ Box::from_raw({name} as *mut {qualified}) }}"),
        });
    }
    None
}

fn map_param_to_ffi(name: &str, ty: &str) -> Option<MappedParam> {
    let ty = strip_crate_paths(&strip_lifetimes(&resolve_type_alias(ty.trim())));
    // An explicit reference lifetime can sit between `&` and a typed-array alias, so run the alias
    // resolver once more after removing lifetimes (`&'a Uint8Array` -> `&[u8]`).
    let ty = resolve_type_alias(&ty);
    let ty = ty.as_str();
    let lifetime_data_ty = ty.strip_suffix("<>").unwrap_or(ty);

    // The handle owns bytes and cursor, but never an SDK ByteReader. Borrow its bytes into a
    // transient view for exactly one call; mutable wrappers write the resulting cursor back.
    if ty == "&ByteReader<>" || ty == "&ByteReader" {
        let clean = name.trim_start_matches('_');
        return Some(MappedParam {
            ffi_params: vec![(name.to_string(), "*const FfiOwnedByteReader".to_string())],
            bindings: vec![
                format!("    assert!(!{name}.is_null(), \"{name} must be a byte-reader handle\");"),
                format!("    let ffi_owned_{clean} = unsafe {{ &*{name} }};"),
                format!(
                    "    let sdk_{clean} = flight_sdk::ByteReader {{ view: &ffi_owned_{clean}.bytes, offset: ffi_owned_{clean}.offset }};"
                ),
            ],
            call_expr: format!("&sdk_{clean}"),
        });
    }
    if ty == "&mut ByteReader<>" || ty == "&mut ByteReader" {
        let clean = name.trim_start_matches('_');
        return Some(MappedParam {
            ffi_params: vec![(name.to_string(), "*mut FfiOwnedByteReader".to_string())],
            bindings: vec![
                format!("    assert!(!{name}.is_null(), \"{name} must be a byte-reader handle\");"),
                format!("    let ffi_owned_{clean} = unsafe {{ &mut *{name} }};"),
                format!(
                    "    let mut sdk_{clean} = flight_sdk::ByteReader {{ view: &ffi_owned_{clean}.bytes, offset: ffi_owned_{clean}.offset }};"
                ),
            ],
            call_expr: format!("&mut sdk_{clean}"),
        });
    }

    // The three public format detectors consume a byte view synchronously. C supplies one
    // borrowed pointer/length pair; using the typed-array arm preserves the exact view window and
    // never constructs or retains an SDK ArrayBuffer identity.
    let byte_data = match lifetime_data_ty {
        "AudioMimeTypeData" => Some(("AudioMimeTypeData", "AudioMimeTypeUint8Array", "data")),
        "FontFormatData" => Some(("FontFormatData", "FontFormatUint8Array", "bytes")),
        "VideoMimeTypeData" => Some(("VideoMimeTypeData", "VideoMimeTypeUint8Array", "data")),
        _ => None,
    };
    if let Some((data_ty, view_ty, field)) = byte_data {
        let ptr_name = "data_ptr".to_string();
        let len_name = "data_len".to_string();
        return Some(MappedParam {
            ffi_params: vec![
                (ptr_name.clone(), "*const u8".to_string()),
                (len_name.clone(), "usize".to_string()),
            ],
            bindings: Vec::new(),
            call_expr: format!(
                "flight_sdk::{data_ty}::Uint8Array(flight_sdk::{view_ty} {{ {field}: unsafe {{ ffi_slice_from_raw_parts({ptr_name}, {len_name}) }} }})"
            ),
        });
    }

    // FileAtomicWriteData is consumed only while the provider future is constructed. Kind 0 is a
    // byte view and kind 1 is UTF-8 text; every other discriminant is rejected inside the async
    // wrapper's panic boundary before provider code runs.
    if lifetime_data_ty == "FileAtomicWriteData" {
        let kind_name = format!("{name}_kind");
        let ptr_name = "data_ptr".to_string();
        let len_name = "data_len".to_string();
        return Some(MappedParam {
            ffi_params: vec![
                (kind_name.clone(), "u32".to_string()),
                (ptr_name.clone(), "*const u8".to_string()),
                (len_name.clone(), "usize".to_string()),
            ],
            bindings: Vec::new(),
            call_expr: format!(
                "match {kind_name} {{ 0 => flight_sdk::FileAtomicWriteData::Bytes(flight_sdk::FileAtomicWriteBytes {{ data: unsafe {{ ffi_slice_from_raw_parts({ptr_name}, {len_name}) }} }}), 1 => flight_sdk::FileAtomicWriteData::Text(flight_sdk::FileAtomicWriteText {{ data: std::str::from_utf8(unsafe {{ ffi_slice_from_raw_parts({ptr_name}, {len_name}) }}).expect(\"atomic text data must be valid UTF-8\") }}), _ => panic!(\"invalid FileAtomicWriteData kind\") }}"
            ),
        });
    }

    // `None` inherits the parent channel, `Some(None)` clears it and `Some(Some(text))` replaces
    // it. The explicit outer flag plus nullable text pointer preserves all three states.
    if ty == "Option<Option<String>>" {
        let present_name = format!("{name}_present");
        return Some(MappedParam {
            ffi_params: vec![
                (present_name.clone(), "bool".to_string()),
                (name.to_string(), "*const std::ffi::c_char".to_string()),
            ],
            bindings: Vec::new(),
            call_expr: format!(
                "if !{present_name} {{ None }} else if {name}.is_null() {{ Some(None) }} else {{ Some(Some(unsafe {{ std::ffi::CStr::from_ptr({name}) }}.to_str().expect(\"nested optional string must be valid UTF-8\").to_owned())) }}"
            ),
        });
    }

    // RequirementFacet is repr(u8) in the Rust IR, while every C enum lane is a checked u32.
    if ty == "RequirementFacet" {
        let binding = format!("{}_enum", get_binding_name(name));
        return Some(MappedParam {
            ffi_params: vec![(name.to_string(), "u32".to_string())],
            bindings: vec![format!(
                "    let {binding} = match ffi_enum_from_u32!({name}, [flight_sdk::RequirementFacet::CompressionKind, flight_sdk::RequirementFacet::DocumentFormat, flight_sdk::RequirementFacet::Physics2DJointKind, flight_sdk::RequirementFacet::SceneBlendMode, flight_sdk::RequirementFacet::SceneMaterialKind, flight_sdk::RequirementFacet::SceneModifierKind, flight_sdk::RequirementFacet::SceneNodeKind, flight_sdk::RequirementFacet::SceneResourceMimeType, flight_sdk::RequirementFacet::SceneShapeCommand, flight_sdk::RequirementFacet::SceneTextureSourceKind]) {{ Some(value) => value, None => panic!(\"{name} must be a RequirementFacet discriminant, got {{}}\", {name}) }};"
            )],
            call_expr: binding,
        });
    }

    // Option<&mut Vec<ImportDiagnostic>> -> a nullable, registered diagnostics list. NULL does not collect.
    if ty == "Option<&mut Vec<ImportDiagnostic>>" {
        return mapped_single(
            name,
            "*mut FfiImportDiagnosticList",
            format!("unsafe {{ ffi_import_diagnostic_list_values({name}) }}"),
        );
    }

    // Requirement callbacks receive a provenance-checked list handle. NULL preserves the SDK's
    // optional no-op sink, while callback-scoped handles are invalidated on return.
    if ty == "Option<&mut Vec<Requirement>>" {
        return mapped_single(
            name,
            "*mut FfiRequirementList",
            format!("unsafe {{ ffi_requirement_list_values({name}) }}"),
        );
    }

    // ShapeBoundsContext is an open, stateful public trait. Its C carrier is a caller-owned context
    // pointer plus a complete typed vtable; validation happens before any callback can mutate it.
    if ty == "&mut dyn ShapeBoundsContext" {
        let clean = name.trim_start_matches('_');
        let context_ptr = format!("{name}_ptr");
        let vtable = format!("{name}_vtable");
        return Some(MappedParam {
            ffi_params: vec![
                (context_ptr.clone(), "*mut std::ffi::c_void".to_string()),
                (
                    vtable.clone(),
                    "*const FfiShapeBoundsContextVTable".to_string(),
                ),
            ],
            bindings: vec![format!(
                "    let Some(mut ffi_{clean}) = (unsafe {{ FfiShapeBoundsContext::new({context_ptr}, {vtable}) }}) else {{ return false; }};"
            )],
            call_expr: format!("&mut ffi_{clean}"),
        });
    }

    // &str / &'static str -> *const c_char
    if ty == "&str" || ty == "&'static str" {
        return mapped_single(
            name,
            "*const std::ffi::c_char",
            format!("unsafe {{ std::ffi::CStr::from_ptr({name}) }}.to_str().unwrap_or(\"\")"),
        );
    }

    // Option<f64> -> f64 with NaN sentinel
    if ty == "Option<f64>" {
        return mapped_single(
            name,
            "f64",
            format!("if {name}.is_nan() {{ None }} else {{ Some({name}) }}"),
        );
    }

    // Option<bool> -> i32 with -1 sentinel
    if ty == "Option<bool>" {
        return mapped_single(
            name,
            "i32",
            format!("if {name} < 0 {{ None }} else {{ Some({name} != 0) }}"),
        );
    }

    // Option<i32> -> i32 with i32::MIN sentinel
    if ty == "Option<i32>" {
        return mapped_single(
            name,
            "i32",
            format!("if {name} == i32::MIN {{ None }} else {{ Some({name}) }}"),
        );
    }

    // Option<&str> -> nullable *const c_char
    if ty == "Option<&str>" {
        return mapped_single(
            name,
            "*const std::ffi::c_char",
            format!(
                "if {name}.is_null() {{ None }} else {{ Some(unsafe {{ std::ffi::CStr::from_ptr({name}) }}.to_str().unwrap_or(\"\")) }}"
            ),
        );
    }

    // Option<String> param -> nullable *const c_char
    if ty == "Option<String>" {
        return mapped_single(
            name,
            "*const std::ffi::c_char",
            format!(
                "if {name}.is_null() {{ None }} else {{ Some(unsafe {{ std::ffi::CStr::from_ptr({name}) }}.to_str().unwrap_or(\"\").to_string()) }}"
            ),
        );
    }

    // Option<&[T]> -> nullable pointer + length for scalar T
    if let Some(inner) = ty.strip_prefix("Option<&[") {
        if let Some(inner) = inner.strip_suffix("]>") {
            let inner = inner.trim();
            if is_scalar(inner) {
                let ptr_name = format!("{name}_ptr");
                let len_name = format!("{name}_len");
                return Some(MappedParam {
                    ffi_params: vec![
                        (ptr_name.clone(), format!("*const {inner}")),
                        (len_name.clone(), "usize".to_string()),
                    ],
                    bindings: Vec::new(),
                    call_expr: format!(
                        "if {ptr_name}.is_null() && {len_name} == 0 {{ None }} else {{ Some(unsafe {{ ffi_slice_from_raw_parts({ptr_name}, {len_name}) }}) }}"
                    ),
                });
            }
        }
    }

    // Option<&[Ref<T>]> -> nullable array of opaque Ref handles + length. Each handle points to
    // the boxed Ref value produced by this FFI, so clone the handles into contiguous Rust Refs
    // rather than reinterpreting the handle pointers as Arc storage.
    if let Some(inner) = ty.strip_prefix("Option<&[") {
        if let Some(inner) = inner.strip_suffix("]>") {
            if let Some(ref_inner) = supported_ref_inner(inner.trim()) {
                let ptr_name = format!("{name}_ptr");
                let len_name = format!("{name}_len");
                let binding_name = format!("{}_refs", name.trim_start_matches('_'));
                let element_ty = format!("flight_sdk::Ref<{}>", qualify_type(ref_inner));
                return Some(MappedParam {
                    ffi_params: vec![
                        (
                            ptr_name.clone(),
                            "*const *const std::ffi::c_void".to_string(),
                        ),
                        (len_name.clone(), "usize".to_string()),
                    ],
                    bindings: vec![
                        format!(
                            "    assert!(!{ptr_name}.is_null() || {len_name} == 0, \"null Ref slice must have length zero\");"
                        ),
                        format!(
                            "    let {binding_name}: Option<Vec<{element_ty}>> = if {ptr_name}.is_null() {{ None }} else {{ Some(unsafe {{ ffi_slice_from_raw_parts({ptr_name}, {len_name}) }}.iter().map(|handle| {{ assert!(!(*handle).is_null(), \"Ref slice contains a null handle\"); unsafe {{ &*(*handle as *const {element_ty}) }}.clone() }}).collect()) }};"
                        ),
                    ],
                    call_expr: format!("{binding_name}.as_deref()"),
                });
            }
        }
    }

    // Option<&mut [T]> -> nullable pointer + length for scalar T
    if let Some(inner) = ty.strip_prefix("Option<&mut [") {
        if let Some(inner) = inner.strip_suffix("]>") {
            let inner = inner.trim();
            if is_scalar(inner) {
                let ptr_name = format!("{name}_ptr");
                let len_name = format!("{name}_len");
                return Some(MappedParam {
                    ffi_params: vec![
                        (ptr_name.clone(), format!("*mut {inner}")),
                        (len_name.clone(), "usize".to_string()),
                    ],
                    bindings: Vec::new(),
                    call_expr: format!(
                        "if {ptr_name}.is_null() && {len_name} == 0 {{ None }} else {{ Some(unsafe {{ ffi_slice_from_raw_parts_mut({ptr_name}, {len_name}) }}) }}"
                    ),
                });
            }
        }
    }

    // Option<&mut T> -> nullable *mut T
    if let Some(inner) = ty.strip_prefix("Option<&mut ") {
        if let Some(inner) = inner.strip_suffix('>') {
            let inner = inner.trim();
            if !inner.starts_with('[') && !is_ffi_incompatible(inner) && !is_scalar(inner) {
                let qualified = qualify_type(inner);
                return mapped_single(
                    name,
                    &format!("*mut {qualified}"),
                    format!(
                        "if {name}.is_null() {{ None }} else {{ Some(unsafe {{ &mut *{name} }}) }}"
                    ),
                );
            }
        }
    }

    // Option<&T> -> nullable *const T
    if let Some(inner) = ty.strip_prefix("Option<&") {
        if let Some(inner) = inner.strip_suffix('>') {
            let inner = inner.trim();
            if inner != "str"
                && !inner.starts_with('[')
                && !is_ffi_incompatible(inner)
                && !is_scalar(inner)
            {
                let qualified = qualify_type(inner);
                return mapped_single(
                    name,
                    &format!("*const {qualified}"),
                    format!(
                        "if {name}.is_null() {{ None }} else {{ Some(unsafe {{ &*{name} }}) }}"
                    ),
                );
            }
        }
    }

    // Option<f32> -> f32 with NaN sentinel
    if ty == "Option<f32>" {
        return mapped_single(
            name,
            "f32",
            format!("if {name}.is_nan() {{ None }} else {{ Some({name}) }}"),
        );
    }

    // Option<u32> -> i64 with -1 sentinel
    if ty == "Option<u32>" {
        return mapped_single(
            name,
            "i64",
            format!("if {name} < 0 {{ None }} else {{ Some({name} as u32) }}"),
        );
    }

    // Option<usize> -> i64 with -1 sentinel
    if ty == "Option<usize>" {
        return mapped_single(
            name,
            "i64",
            format!("if {name} < 0 {{ None }} else {{ Some({name} as usize) }}"),
        );
    }

    // Option<enum> -> i32 with -1 sentinel
    if let Some(inner) = ty.strip_prefix("Option<") {
        if let Some(inner) = inner.strip_suffix('>') {
            let inner = inner.trim();
            if is_known_enum(inner) {
                // -1 is None; any other value must be a real discriminant, checked before the enum
                // exists. A caller passing anything else has violated the ABI.
                let label = name.trim_start_matches("r#");
                let binding = format!("{}_enum", get_binding_name(name));
                let conversion = get_enum_conversion(inner, "raw");
                return Some(MappedParam {
                    ffi_params: vec![(name.to_string(), "i32".to_string())],
                    bindings: vec![format!(
                        "    let {binding} = match {name} {{ -1 => None, raw => match u32::try_from(raw).ok().and_then(|raw| {conversion}) {{ Some(value) => Some(value), None => panic!(\"{label} must be -1 or a {inner} discriminant, got {{}}\", {name}) }} }};"
                    )],
                    call_expr: binding,
                });
            }
        }
    }

    // &mut Ref<T> -> *mut c_void (opaque handle to Arc<RwLock<T>>)
    if let Some(inner) = ty.strip_prefix("&mut Ref<") {
        if let Some(inner) = inner.strip_suffix('>') {
            let inner = inner.trim();
            if !inner.contains('<') && !inner.contains("::") {
                let qualified = qualify_type(inner);
                return mapped_single(
                    name,
                    "*mut std::ffi::c_void",
                    format!("unsafe {{ &mut *({name} as *mut flight_sdk::Ref<{qualified}>) }}"),
                );
            }
        }
    }

    // &Ref<T> -> *const c_void (opaque handle to Arc<RwLock<T>>)
    if let Some(inner) = ty.strip_prefix("&Ref<") {
        if let Some(inner) = inner.strip_suffix('>') {
            let inner = inner.trim();
            if !inner.contains('<') && !inner.contains("::") {
                let qualified = qualify_type(inner);
                return mapped_single(
                    name,
                    "*const std::ffi::c_void",
                    format!("unsafe {{ &*({name} as *const flight_sdk::Ref<{qualified}>) }}"),
                );
            }
        }
    }

    // &mut [T; N] -> *mut T (fixed-size array, no length needed)
    if let Some(inner) = ty.strip_prefix("&mut [") {
        if let Some(inner) = inner.strip_suffix(']') {
            let inner = inner.trim();
            if let Some((elem, size_str)) = inner.split_once(';') {
                let elem = elem.trim();
                let size_str = size_str.trim();
                if size_str.parse::<usize>().is_ok()
                    && (is_scalar(elem)
                        || (!is_ffi_incompatible(elem)
                            && !elem.contains('<')
                            && !elem.starts_with('&')
                            && !elem.starts_with('[')))
                {
                    let qualified = qualify_type(elem);
                    return mapped_single(
                        name,
                        &format!("*mut {qualified}"),
                        format!("unsafe {{ &mut *({name} as *mut [{qualified}; {size_str}]) }}"),
                    );
                }
            }
        }
    }

    // &[T; N] -> *const T (fixed-size array, no length needed)
    if let Some(inner) = ty.strip_prefix("&[") {
        if let Some(inner) = inner.strip_suffix(']') {
            let inner = inner.trim();
            if let Some((elem, size_str)) = inner.split_once(';') {
                let elem = elem.trim();
                let size_str = size_str.trim();
                if size_str.parse::<usize>().is_ok()
                    && (is_scalar(elem)
                        || (!is_ffi_incompatible(elem)
                            && !elem.contains('<')
                            && !elem.starts_with('&')
                            && !elem.starts_with('[')))
                {
                    let qualified = qualify_type(elem);
                    return mapped_single(
                        name,
                        &format!("*const {qualified}"),
                        format!("unsafe {{ &*({name} as *const [{qualified}; {size_str}]) }}"),
                    );
                }
            }
        }
    }

    // Option<XRef> by value, where `XRef = Ref<dyn X>` names an opaque trait handle -> nullable
    // pointer to the caller's `XRef` (the value `flight_free_x_ref` releases), cloned for the call.
    if let Some(inner) = ty
        .strip_prefix("Option<")
        .and_then(|rest| rest.strip_suffix('>'))
    {
        let inner = inner.trim();
        if DYN_OPAQUE_TRAITS.iter().any(|(_, alias)| *alias == inner) {
            let qualified = qualify_type(inner);
            return mapped_single(
                name,
                "*const std::ffi::c_void",
                format!(
                    "if {name}.is_null() {{ None }} else {{ Some(unsafe {{ (*({name} as *const {qualified})).clone() }}) }}"
                ),
            );
        }
    }

    // &[String] -> array of validated NUL-terminated C strings copied into Rust-owned Strings for
    // the call. Never reinterpret caller memory as Rust String structs.
    if ty == "&[String]" {
        let ptr_name = format!("{name}_ptr");
        let len_name = format!("{name}_len");
        let binding_name = format!("{}_strings", name.trim_start_matches('_'));
        return Some(MappedParam {
            ffi_params: vec![
                (
                    ptr_name.clone(),
                    "*const *const std::ffi::c_char".to_string(),
                ),
                (len_name.clone(), "usize".to_string()),
            ],
            bindings: vec![format!(
                "    let {binding_name} = unsafe {{ ffi_owned_c_string_array({ptr_name}, {len_name}) }};"
            )],
            call_expr: format!("&{binding_name}"),
        });
    }

    // &[&str] -> array of borrowed NUL-terminated C strings + length, decoded like a `&str`
    // parameter for the duration of the SDK call.
    if ty == "&[&str]" {
        let ptr_name = format!("{name}_ptr");
        let len_name = format!("{name}_len");
        let binding_name = format!("{}_strs", name.trim_start_matches('_'));
        return Some(MappedParam {
            ffi_params: vec![
                (
                    ptr_name.clone(),
                    "*const *const std::ffi::c_char".to_string(),
                ),
                (len_name.clone(), "usize".to_string()),
            ],
            bindings: vec![
                format!(
                    "    let {binding_name}_ptrs: &[*const std::ffi::c_char] = unsafe {{ ffi_slice_from_raw_parts({ptr_name}, {len_name}) }};"
                ),
                format!(
                    "    let {binding_name}: Vec<&str> = {binding_name}_ptrs.iter().map(|text| {{ assert!(!(*text).is_null(), \"string array contains a null pointer\"); unsafe {{ std::ffi::CStr::from_ptr(*text) }}.to_str().unwrap_or(\"\") }}).collect();"
                ),
            ],
            call_expr: format!("&{binding_name}"),
        });
    }

    // &[Ref<T>] -> array of opaque Ref handles + length. Preserve caller ownership by cloning
    // each boxed Ref handle for the duration of the SDK call.
    if let Some(inner) = ty.strip_prefix("&[") {
        if let Some(inner) = inner.strip_suffix(']') {
            if let Some(ref_inner) = supported_ref_inner(inner.trim()) {
                let ptr_name = format!("{name}_ptr");
                let len_name = format!("{name}_len");
                let binding_name = format!("{}_refs", name.trim_start_matches('_'));
                let element_ty = format!("flight_sdk::Ref<{}>", qualify_type(ref_inner));
                return Some(MappedParam {
                    ffi_params: vec![
                        (
                            ptr_name.clone(),
                            "*const *const std::ffi::c_void".to_string(),
                        ),
                        (len_name.clone(), "usize".to_string()),
                    ],
                    bindings: vec![
                        format!(
                            "    assert!(!{ptr_name}.is_null() || {len_name} == 0, \"null Ref slice must have length zero\");"
                        ),
                        format!(
                            "    let {binding_name}_handles: &[*const std::ffi::c_void] = unsafe {{ ffi_slice_from_raw_parts({ptr_name}, {len_name}) }};"
                        ),
                        format!(
                            "    let {binding_name}: Vec<{element_ty}> = {binding_name}_handles.iter().map(|handle| {{ assert!(!(*handle).is_null(), \"Ref slice contains a null handle\"); unsafe {{ &*(*handle as *const {element_ty}) }}.clone() }}).collect();"
                        ),
                    ],
                    call_expr: format!("&{binding_name}"),
                });
            }
        }
    }

    if let Some(Some(mapped)) = map_generic_carrier_param(name, ty) {
        return Some(mapped);
    }

    // &mut [T] -> (*mut T, usize)
    if let Some(inner) = ty.strip_prefix("&mut [") {
        if let Some(inner) = inner.strip_suffix(']') {
            let inner = inner.trim();
            if is_scalar(inner)
                || (!is_ffi_incompatible(inner)
                    && !inner.contains('<')
                    && !inner.contains(';')
                    && !inner.contains('[')
                    && !inner.starts_with('&'))
            {
                let qualified = qualify_type(inner);
                let ptr_name = format!("{name}_ptr");
                let len_name = format!("{name}_len");
                return Some(MappedParam {
                    ffi_params: vec![
                        (ptr_name.clone(), format!("*mut {qualified}")),
                        (len_name.clone(), "usize".to_string()),
                    ],
                    bindings: Vec::new(),
                    call_expr: format!(
                        "unsafe {{ ffi_slice_from_raw_parts_mut({ptr_name}, {len_name}) }}"
                    ),
                });
            }
        }
    }

    // &[T] -> (*const T, usize)
    if let Some(inner) = ty.strip_prefix("&[") {
        if let Some(inner) = inner.strip_suffix(']') {
            let inner = inner.trim();
            if is_scalar(inner)
                || (!is_ffi_incompatible(inner)
                    && !inner.contains('<')
                    && !inner.contains(';')
                    && !inner.contains('[')
                    && !inner.starts_with('&'))
            {
                let qualified = qualify_type(inner);
                let ptr_name = format!("{name}_ptr");
                let len_name = format!("{name}_len");
                return Some(MappedParam {
                    ffi_params: vec![
                        (ptr_name.clone(), format!("*const {qualified}")),
                        (len_name.clone(), "usize".to_string()),
                    ],
                    bindings: Vec::new(),
                    call_expr: format!(
                        "unsafe {{ ffi_slice_from_raw_parts({ptr_name}, {len_name}) }}"
                    ),
                });
            }
        }
    }

    // &dyn Trait / &mut dyn Trait -> opaque handle (Strategy A: NodeRef, Node2DRef, Node3DRef)
    // These need special handling: the RwLock guard must outlive the function call,
    // so we can't inline the expression. Instead we mark them as DynOpaque and handle
    // them in generate_ffi_wrapper's body generation.
    if let Some(trait_name) = extract_dyn_trait(ty) {
        if DYN_OPAQUE_TRAITS.iter().any(|(n, _)| *n == trait_name) {
            let clean = name.trim_start_matches('_');
            return Some(MappedParam {
                ffi_params: vec![(
                    name.to_string(),
                    if ty.starts_with("&mut ") {
                        "*mut std::ffi::c_void".to_string()
                    } else {
                        "*const std::ffi::c_void".to_string()
                    },
                )],
                bindings: Vec::new(),
                call_expr: format!("dyn_{clean}"),
            });
        }
    }

    // &mut Vec<Ref<T>> -> an exact opaque handle family. C sees void*, while the generated Rust
    // ABI keeps distinct generic pointer types and validates a per-type tag before exposing values.
    if let Some(spec) = vec_ref_handle_spec(ty) {
        let handle_ty = format!("FfiVecRefHandle<{}>", spec.inner_ty);
        return mapped_single(
            name,
            &format!("*mut {handle_ty}"),
            format!("unsafe {{ ffi_vec_ref_{}_values({name}) }}", spec.slug),
        );
    }

    // &mut Vec<T> -> *mut c_void (opaque handle)
    if let Some(inner) = ty.strip_prefix("&mut Vec<") {
        if let Some(inner) = inner.strip_suffix('>') {
            let inner = inner.trim();
            if is_scalar(inner)
                || is_known_enum(inner)
                || (!is_ffi_incompatible(inner) && !inner.contains('<'))
            {
                let qualified_inner = qualify_type(inner);
                return mapped_single(
                    name,
                    "*mut std::ffi::c_void",
                    format!("unsafe {{ &mut *({name} as *mut Vec<{qualified_inner}>) }}"),
                );
            }
        }
    }

    // &Vec<T> -> *const c_void (opaque handle)
    if let Some(inner) = ty.strip_prefix("&Vec<") {
        if let Some(inner) = inner.strip_suffix('>') {
            let inner = inner.trim();
            if is_scalar(inner)
                || is_known_enum(inner)
                || (!is_ffi_incompatible(inner) && !inner.contains('<'))
            {
                let qualified_inner = qualify_type(inner);
                return mapped_single(
                    name,
                    "*const std::ffi::c_void",
                    format!("unsafe {{ &*({name} as *const Vec<{qualified_inner}>) }}"),
                );
            }
        }
    }

    // Vec<T> owned param -> *mut c_void (takes ownership of boxed Vec)
    if let Some(inner) = ty.strip_prefix("Vec<") {
        if let Some(inner) = inner.strip_suffix('>') {
            let inner = inner.trim();
            if is_scalar(inner)
                || is_known_enum(inner)
                || (!is_ffi_incompatible(inner) && !inner.contains('<'))
            {
                let qualified_inner = qualify_type(inner);
                let qualified = format!("Vec<{qualified_inner}>");
                if !has_owned_producer(&qualified) {
                    return None;
                }
                return mapped_single(
                    name,
                    "*mut std::ffi::c_void",
                    format!("unsafe {{ *Box::from_raw({name} as *mut Vec<{qualified_inner}>) }}"),
                );
            }
        }
    }

    // Ref<T> owned -> *const c_void (caller passes a cloned Arc)
    if let Some(inner) = ty.strip_prefix("Ref<") {
        if let Some(inner) = inner.strip_suffix('>') {
            let inner = inner.trim();
            if !inner.contains("dyn ") && !inner.contains('<') && !inner.contains("::") {
                let qualified = qualify_type(inner);
                return mapped_single(
                    name,
                    "*const std::ffi::c_void",
                    format!(
                        "unsafe {{ (*({name} as *const flight_sdk::Ref<{qualified}>)).clone() }}"
                    ),
                );
            }
        }
    }

    // Option<Ref<T>> -> nullable *const c_void
    if let Some(inner) = ty.strip_prefix("Option<Ref<") {
        if let Some(inner) = inner.strip_suffix(">>") {
            let inner = inner.trim();
            if (!inner.contains("dyn ") || is_opaque_dyn(inner))
                && !inner.contains('<')
                && !inner.contains("::")
            {
                let qualified = qualify_type(inner);
                return mapped_single(
                    name,
                    "*const std::ffi::c_void",
                    format!(
                        "if {name}.is_null() {{ None }} else {{ Some(unsafe {{ (*({name} as *const flight_sdk::Ref<{qualified}>)).clone() }}) }}"
                    ),
                );
            }
        }
    }

    // Option<&Ref<T>> -> nullable *const c_void
    if let Some(inner) = ty.strip_prefix("Option<&Ref<") {
        if let Some(inner) = inner.strip_suffix(">>") {
            let inner = inner.trim();
            if (!inner.contains("dyn ") || is_opaque_dyn(inner))
                && !inner.contains('<')
                && !inner.contains("::")
            {
                let qualified = qualify_type(inner);
                return mapped_single(
                    name,
                    "*const std::ffi::c_void",
                    format!(
                        "if {name}.is_null() {{ None }} else {{ Some(unsafe {{ &*({name} as *const flight_sdk::Ref<{qualified}>) }}) }}"
                    ),
                );
            }
        }
    }

    // Box<TypedArray> -> (*mut T, usize) taking ownership
    if let Some(inner) = ty.strip_prefix("Box<") {
        if let Some(inner) = inner.strip_suffix('>') {
            let inner = inner.trim();
            let resolved_inner = resolve_type_alias(inner);
            if let Some(slice_inner) = resolved_inner.strip_prefix('[') {
                if let Some(slice_inner) = slice_inner.strip_suffix(']') {
                    let elem = slice_inner.trim();
                    if is_scalar(elem) {
                        let ptr_name = format!("{name}_ptr");
                        let len_name = format!("{name}_len");
                        return Some(MappedParam {
                            ffi_params: vec![
                                (ptr_name.clone(), format!("*mut {elem}")),
                                (len_name.clone(), "usize".to_string()),
                            ],
                            bindings: Vec::new(),
                            call_expr: format!(
                                "if {len_name} == 0 {{ Vec::new().into_boxed_slice() }} else {{ assert!(!{ptr_name}.is_null(), \"null owned slice must have length zero\"); unsafe {{ Vec::from_raw_parts({ptr_name}, {len_name}, {len_name}) }}.into_boxed_slice() }}"
                            ),
                        });
                    }
                }
            }
        }
    }

    // Option<&[T]> for non-scalar struct types -> nullable pointer + length
    if let Some(inner) = ty.strip_prefix("Option<&[") {
        if let Some(inner) = inner.strip_suffix("]>") {
            let inner = inner.trim();
            if !is_scalar(inner)
                && !is_ffi_incompatible(inner)
                && !inner.contains('<')
                && !inner.contains(';')
                && !inner.contains('[')
                && !inner.starts_with('&')
            {
                let qualified = qualify_type(inner);
                let ptr_name = format!("{name}_ptr");
                let len_name = format!("{name}_len");
                return Some(MappedParam {
                    ffi_params: vec![
                        (ptr_name.clone(), format!("*const {qualified}")),
                        (len_name.clone(), "usize".to_string()),
                    ],
                    bindings: Vec::new(),
                    call_expr: format!(
                        "if {ptr_name}.is_null() && {len_name} == 0 {{ None }} else {{ Some(unsafe {{ ffi_slice_from_raw_parts({ptr_name}, {len_name}) }}) }}"
                    ),
                });
            }
        }
    }

    // Option<&mut [T]> for non-scalar struct types -> nullable pointer + length
    if let Some(inner) = ty.strip_prefix("Option<&mut [") {
        if let Some(inner) = inner.strip_suffix("]>") {
            let inner = inner.trim();
            if !is_scalar(inner)
                && !is_ffi_incompatible(inner)
                && !inner.contains('<')
                && !inner.contains(';')
                && !inner.contains('[')
                && !inner.starts_with('&')
            {
                let qualified = qualify_type(inner);
                let ptr_name = format!("{name}_ptr");
                let len_name = format!("{name}_len");
                return Some(MappedParam {
                    ffi_params: vec![
                        (ptr_name.clone(), format!("*mut {qualified}")),
                        (len_name.clone(), "usize".to_string()),
                    ],
                    bindings: Vec::new(),
                    call_expr: format!(
                        "if {ptr_name}.is_null() && {len_name} == 0 {{ None }} else {{ Some(unsafe {{ ffi_slice_from_raw_parts_mut({ptr_name}, {len_name}) }}) }}"
                    ),
                });
            }
        }
    }

    // Option<Arc<dyn Fn(args) -> ret>> -> nullable fn+ctx pair
    if let Some(inner) = ty.strip_prefix("Option<") {
        if let Some(inner) = inner.strip_suffix('>') {
            let resolved_inner =
                strip_crate_paths(&strip_lifetimes(&resolve_type_alias(inner.trim())));
            if let Some(parsed) = parse_closure_param(&resolved_inner) {
                if parsed.is_arc
                    && parsed.params.iter().all(|(cty, _)| {
                        let resolved = strip_crate_paths(&resolve_type_alias(cty));
                        is_scalar(&resolved) || is_known_enum(&resolved)
                    })
                    && (parsed.ret == "void" || is_scalar(&parsed.ret))
                {
                    let fn_name = format!("{name}_fn");
                    let ctx_name = format!("{name}_ctx");
                    let mut ffi_fn_params = vec!["*mut std::ffi::c_void".to_string()];
                    let mut ffi_fn_args_str = Vec::new();
                    let mut outer_closure_params = Vec::new();
                    for (i, (cty, _)) in parsed.params.iter().enumerate() {
                        let resolved_cty = strip_crate_paths(&resolve_type_alias(cty));
                        let arg_name = format!("__a{i}");
                        if is_known_enum(&resolved_cty) {
                            ffi_fn_params.push("u32".to_string());
                            ffi_fn_args_str.push(format!("{arg_name} as u32"));
                            outer_closure_params
                                .push(format!("{arg_name}: {}", qualify_type(&resolved_cty)));
                        } else {
                            ffi_fn_params.push(resolved_cty.clone());
                            ffi_fn_args_str.push(arg_name.clone());
                            outer_closure_params.push(format!("{arg_name}: {resolved_cty}"));
                        }
                    }
                    let ffi_ret = if parsed.ret == "void" {
                        String::new()
                    } else {
                        format!(" -> {}", parsed.ret)
                    };
                    let ffi_fn_sig =
                        format!("extern \"C\" fn({}){ffi_ret}", ffi_fn_params.join(", "));
                    let outer_params_str = outer_closure_params.join(", ");
                    let arc_call_args = if ffi_fn_args_str.is_empty() {
                        "__ctx as *mut std::ffi::c_void".to_string()
                    } else {
                        format!(
                            "__ctx as *mut std::ffi::c_void, {}",
                            ffi_fn_args_str.join(", ")
                        )
                    };
                    let option_fn_sig = format!("Option<{ffi_fn_sig}>");
                    let closure_body = format!(
                        "match {fn_name} {{ None => None, Some(__f_inner) => {{ let __ctx = {ctx_name} as usize; let __f = __f_inner as usize; Some(std::sync::Arc::new(move |{outer_params_str}| {{ let __fp: {ffi_fn_sig} = unsafe {{ std::mem::transmute(__f) }}; __fp({arc_call_args}) }})) }} }}"
                    );
                    return Some(MappedParam {
                        ffi_params: vec![
                            (fn_name, option_fn_sig),
                            (ctx_name, "*mut std::ffi::c_void".to_string()),
                        ],
                        bindings: Vec::new(),
                        call_expr: closure_body,
                    });
                }
            }
        }
    }

    // &dyn Fn(args) -> ret / &mut dyn FnMut(args) -> ret -> extern "C" fn(*mut c_void, args) -> ret + *mut c_void
    if let Some(parsed) = parse_closure_param(ty) {
        let fn_name = format!("{name}_fn");
        let ctx_name = format!("{name}_ctx");
        let mut ffi_fn_params = vec!["*mut std::ffi::c_void".to_string()];
        let mut ffi_fn_args_str = Vec::new();
        let mut outer_closure_params = Vec::new();
        for (i, (cty, is_ref)) in parsed.params.iter().enumerate() {
            let resolved_cty = strip_crate_paths(&resolve_type_alias(cty));
            let arg_name = format!("__a{i}");
            if is_scalar(&resolved_cty) {
                ffi_fn_params.push(resolved_cty.clone());
                ffi_fn_args_str.push(arg_name.clone());
                outer_closure_params.push(format!("{arg_name}: {resolved_cty}"));
            } else if *is_ref && resolved_cty.starts_with("Ref<") {
                let inner = resolved_cty
                    .strip_prefix("Ref<")
                    .and_then(|s| s.strip_suffix('>'))
                    .unwrap_or(&resolved_cty);
                let qualified_inner = if inner.starts_with("dyn ") {
                    let trait_name = inner.strip_prefix("dyn ").unwrap();
                    format!("dyn {QUALIFIER}::{trait_name}")
                } else {
                    format!("{QUALIFIER}::{inner}")
                };
                let qualified_ref = format!("{QUALIFIER}::Ref<{qualified_inner}>");
                ffi_fn_params.push("*const std::ffi::c_void".to_string());
                ffi_fn_args_str.push(format!("{arg_name} as *const _ as *const std::ffi::c_void"));
                outer_closure_params.push(format!("{arg_name}: &{qualified_ref}"));
            } else if *is_ref && resolved_cty.starts_with('[') && resolved_cty.ends_with(']') {
                let elem = resolved_cty[1..resolved_cty.len() - 1].trim();
                if is_scalar(elem) {
                    ffi_fn_params.push(format!("*const {elem}"));
                    ffi_fn_params.push("usize".to_string());
                    ffi_fn_args_str.push(format!("{arg_name}.as_ptr()"));
                    ffi_fn_args_str.push(format!("{arg_name}.len()"));
                    outer_closure_params.push(format!("{arg_name}: &[{elem}]"));
                } else {
                    return None;
                }
            } else if *is_ref
                && !resolved_cty.contains('<')
                && !resolved_cty.contains("dyn ")
                && !resolved_cty.starts_with('[')
            {
                let qualified = qualify_type(&resolved_cty);
                ffi_fn_params.push(format!("*const {qualified}"));
                ffi_fn_args_str.push(format!("{arg_name} as *const _ as *const {qualified}"));
                outer_closure_params.push(format!("{arg_name}: &{qualified}"));
            } else {
                return None;
            }
        }
        // A callback may return an optional opaque value through a nullable owned box. The
        // callback transfers a non-null box to this wrapper, which consumes it before calling the
        // SDK. This is the callback-side counterpart of an owned opaque parameter.
        let opaque_option_return = parsed
            .ret
            .strip_prefix("Option<")
            .and_then(|rest| rest.strip_suffix('>'))
            .map(str::trim)
            .filter(|inner| {
                !inner.contains('<')
                    && !inner.contains("::")
                    && !is_scalar(inner)
                    && !is_known_enum(inner)
            })
            .and_then(qualify_opaque_type)
            .filter(|qualified| has_owned_producer(qualified));
        let ffi_ret = if parsed.ret == "void" {
            String::new()
        } else if is_scalar(&parsed.ret) {
            format!(" -> {}", parsed.ret)
        } else if let Some(qualified) = &opaque_option_return {
            format!(" -> *mut {qualified}")
        } else {
            return None;
        };
        let ffi_fn_sig = format!("extern \"C\" fn({}){ffi_ret}", ffi_fn_params.join(", "));
        let outer_params_str = outer_closure_params.join(", ");
        let inner_args = if ffi_fn_args_str.is_empty() {
            format!("{ctx_name}")
        } else {
            format!("{ctx_name}, {}", ffi_fn_args_str.join(", "))
        };
        let arc_call_args = if ffi_fn_args_str.is_empty() {
            "__ctx as *mut std::ffi::c_void".to_string()
        } else {
            format!(
                "__ctx as *mut std::ffi::c_void, {}",
                ffi_fn_args_str.join(", ")
            )
        };
        let direct_callback_call = if let Some(qualified) = &opaque_option_return {
            format!(
                "{{ let __value = ({fn_name})({inner_args}); if __value.is_null() {{ None }} else {{ Some(*unsafe {{ Box::from_raw(__value as *mut {qualified}) }}) }} }}"
            )
        } else {
            format!("({fn_name})({inner_args})")
        };
        let arc_callback_call = if let Some(qualified) = &opaque_option_return {
            format!(
                "{{ let __value = __fp({arc_call_args}); if __value.is_null() {{ None }} else {{ Some(*unsafe {{ Box::from_raw(__value as *mut {qualified}) }}) }} }}"
            )
        } else {
            format!("__fp({arc_call_args})")
        };
        let closure_body = if parsed.is_arc {
            format!(
                "{{ let __ctx = {ctx_name} as usize; let __f = {fn_name} as usize; std::sync::Arc::new(move |{outer_params_str}| {{ let __fp: {ffi_fn_sig} = unsafe {{ std::mem::transmute(__f) }}; {arc_callback_call} }}) }}"
            )
        } else if parsed.is_mut {
            format!("&mut |{outer_params_str}| {direct_callback_call}")
        } else {
            format!("&|{outer_params_str}| {direct_callback_call}")
        };
        return Some(MappedParam {
            ffi_params: vec![
                (fn_name, ffi_fn_sig),
                (ctx_name, "*mut std::ffi::c_void".to_string()),
            ],
            bindings: Vec::new(),
            call_expr: closure_body,
        });
    }

    if let Some(mapped) = map_opaque_fallback_param(name, ty) {
        return Some(mapped);
    }

    if is_opaque_fallback_excluded(ty) {
        return None;
    }

    if is_ffi_incompatible(ty) {
        return None;
    }

    // &mut T -> *mut T
    if let Some(inner) = ty.strip_prefix("&mut ") {
        let inner = inner.trim();
        if inner == "str" || inner.starts_with('[') || is_ffi_incompatible(inner) {
            return None;
        }
        let qualified = qualify_type(inner);
        return mapped_single(
            name,
            &format!("*mut {qualified}"),
            format!("unsafe {{ &mut *{name} }}"),
        );
    }

    // &T -> *const T
    if let Some(inner) = ty.strip_prefix('&') {
        let inner = inner.trim();
        if inner == "str" || inner.starts_with('[') || is_ffi_incompatible(inner) {
            return None;
        }
        let qualified = qualify_type(inner);
        return mapped_single(
            name,
            &format!("*const {qualified}"),
            format!("unsafe {{ &*{name} }}"),
        );
    }

    // String param -> *const c_char
    if ty == "String" {
        return mapped_single(
            name,
            "*const std::ffi::c_char",
            format!(
                "unsafe {{ std::ffi::CStr::from_ptr({name}) }}.to_str().unwrap_or(\"\").to_string()"
            ),
        );
    }

    // Scalar types pass through
    if is_scalar(ty) {
        return mapped_single(name, ty, name.to_string());
    }

    // A direct enum is checked against its variants before it exists; any other value is a
    // programmer error.
    if is_known_enum(ty) {
        let label = name.trim_start_matches("r#");
        let binding = format!("{}_enum", get_binding_name(name));
        let conversion = get_enum_conversion(ty, name);
        return Some(MappedParam {
            ffi_params: vec![(name.to_string(), "u32".to_string())],
            bindings: vec![format!(
                "    let {binding} = match {conversion} {{ Some(value) => value, None => panic!(\"{label} must be a {ty} discriminant, got {{}}\", {name}) }};"
            )],
            call_expr: binding,
        });
    }

    // Owned fixed-size array [T; N] -> *const T
    if ty.starts_with('[') {
        if let Some(inner) = ty.strip_prefix('[') {
            if let Some(inner) = inner.strip_suffix(']') {
                if let Some((elem, size_str)) = inner.split_once(';') {
                    let elem = elem.trim();
                    let size_str = size_str.trim();
                    if size_str.parse::<usize>().is_ok()
                        && (is_scalar(elem)
                            || (!is_ffi_incompatible(elem)
                                && !elem.contains('<')
                                && !elem.starts_with('&')
                                && !elem.starts_with('[')))
                    {
                        // Only a `Copy` element type makes the array a plain copy.
                        if get_owned_param(elem) != Some(OwnedParam::Copied) {
                            return None;
                        }
                        let qualified = qualify_type(elem);
                        return mapped_single(
                            name,
                            &format!("*const {qualified}"),
                            format!("unsafe {{ *({name} as *const [{qualified}; {size_str}]) }}"),
                        );
                    }
                }
            }
        }
    }

    // A small, evidence-backed set of Clone data values has only a borrowed public producer. Clone
    // from a caller-retained typed pointer instead of inventing an owned box for it.
    if is_caller_retained_clone_type(ty) {
        let qualified = qualify_type(ty);
        return mapped_single(
            name,
            &format!("*const {qualified}"),
            format!("unsafe {{ (*{name}).clone() }}"),
        );
    }

    // Owned named T, by its proven ownership: a `Copy` value is copied from `*const T`, a
    // `Ref`/`Arc` alias is cloned from the caller's borrowed handle, and any other value consumes
    // a non-null box produced by another generated wrapper. A definition alone proves the Rust
    // ownership shape, never that C can construct the box.
    if !ty.contains('<') && !ty.contains("::") && !ty.starts_with('[') && !ty.starts_with('(') {
        let qualified = qualify_type(ty);
        let ownership = get_owned_param(ty).or_else(|| {
            TYPE_DEFINITIONS
                .get()
                .is_some_and(|definitions| definitions.contains_key(ty))
                .then_some(OwnedParam::Transferred)
        })?;
        return match ownership {
            OwnedParam::Copied => mapped_single(
                name,
                &format!("*const {qualified}"),
                format!("unsafe {{ *{name} }}"),
            ),
            OwnedParam::Cloned => mapped_single(
                name,
                &format!("*const {qualified}"),
                format!("unsafe {{ (*{name}).clone() }}"),
            ),
            OwnedParam::Transferred => {
                if !has_owned_producer(&qualified) {
                    return None;
                }
                Some(MappedParam {
                    ffi_params: vec![(name.to_string(), format!("*mut {qualified}"))],
                    bindings: vec![format!(
                        "    assert!(!{name}.is_null(), \"{name} must be an owned {ty} handle\");"
                    )],
                    call_expr: format!("*unsafe {{ Box::from_raw({name}) }}"),
                })
            }
        };
    }

    None
}

fn map_return_to_ffi(ty: &str) -> Option<(String, FfiReturn)> {
    let ty = strip_crate_paths(&strip_lifetimes(&resolve_type_alias(ty.trim())));
    let ty = ty.as_str();

    if ty == "ByteReader" || ty == "ByteReader<>" {
        return Some((
            " -> *mut FfiOwnedByteReader".to_string(),
            FfiReturn::OwnedByteReaderReturn,
        ));
    }
    if ty == "&[EffectInput]" {
        return Some((
            " -> *mut std::ffi::c_void".to_string(),
            FfiReturn::EffectInputSliceReturn,
        ));
    }
    if ty == "&[&str]" {
        return Some((
            " -> *mut std::ffi::c_void".to_string(),
            FfiReturn::EffectKindSliceReturn,
        ));
    }

    // Provider future -> void return plus trailing `complete_fn` / `complete_ctx` parameters.
    if let Some((output, fallible)) = async_future_output(ty) {
        let (value_decl, value) = map_return_to_ffi(output)?;
        if !is_async_callback_value(&value) {
            return None;
        }
        let value_ty = value_decl.strip_prefix(" -> ")?.to_string();
        return Some((
            String::new(),
            FfiReturn::AsyncCallback(Box::new(AsyncCallbackSpec {
                value,
                value_ty,
                value_rust_ty: output.to_string(),
                fallible,
            })),
        ));
    }

    if let Some(mapped) = map_generic_carrier_return(ty) {
        return mapped;
    }

    let optional_hash_map = ty
        .strip_prefix("Option<")
        .and_then(|rest| rest.strip_suffix('>'));
    let hash_map_ty = optional_hash_map.unwrap_or(ty).trim();
    if let Some((outer, arguments)) = outer_generic_parts(hash_map_ty) {
        if outer.rsplit("::").next().unwrap_or(outer) == "HashMap" {
            let arguments = split_generic_arguments(arguments)?;
            if arguments.len() == 2 && arguments[0].trim() == "String" {
                let value_ty = arguments[1].trim();
                let spec = HashMapReturnSpec {
                    value_ty: qualify_opaque_type(value_ty)?,
                };
                return Some((
                    " -> *mut std::ffi::c_void".to_string(),
                    if optional_hash_map.is_some() {
                        FfiReturn::OptionHashMapReturn(spec)
                    } else {
                        FfiReturn::HashMapReturn(spec)
                    },
                ));
            }
        }
    }

    // Option<String> -> nullable *mut c_char
    if ty == "Option<String>" {
        return Some((
            " -> *mut std::ffi::c_char".to_string(),
            FfiReturn::OptionStringReturn,
        ));
    }

    // Ref<T> -> *mut c_void (boxed Arc handle)
    if let Some(inner) = ty.strip_prefix("Ref<") {
        if let Some(inner) = inner.strip_suffix('>') {
            let inner = inner.trim();
            if qualify_opaque_type(inner).is_some() {
                return Some((
                    " -> *mut std::ffi::c_void".to_string(),
                    FfiReturn::ArcRefReturn,
                ));
            }
        }
    }

    // Option<Ref<T>> -> nullable *mut c_void
    if let Some(inner) = ty.strip_prefix("Option<Ref<") {
        if let Some(inner) = inner.strip_suffix(">>") {
            let inner = inner.trim();
            if qualify_opaque_type(inner).is_some() {
                return Some((
                    " -> *mut std::ffi::c_void".to_string(),
                    FfiReturn::OptionArcRefReturn,
                ));
            }
        }
    }

    // Vec<Ref<T>> -> *mut c_void (boxed Vec with result accessors)
    if let Some(inner) = ty.strip_prefix("Vec<") {
        if let Some(inner) = inner.strip_suffix('>') {
            let inner = inner.trim();
            if let Some(ref_inner) = supported_ref_inner(inner) {
                return Some((
                    " -> *mut std::ffi::c_void".to_string(),
                    FfiReturn::VecReturn(VecReturnSpec {
                        element_ty: format!("flight_sdk::Ref<{}>", qualify_type(ref_inner)),
                        element_is_ref: true,
                    }),
                ));
            }
        }
    }

    // Vec<T> -> *mut c_void (boxed Vec with result accessors)
    if let Some(inner) = ty.strip_prefix("Vec<") {
        if let Some(inner) = inner.strip_suffix('>') {
            let inner = inner.trim();
            if qualify_opaque_type(inner).is_some() {
                return Some((
                    " -> *mut std::ffi::c_void".to_string(),
                    FfiReturn::VecReturn(VecReturnSpec {
                        element_ty: qualify_opaque_type(inner).unwrap(),
                        element_is_ref: false,
                    }),
                ));
            }
        }
    }

    // Option<Vec<Ref<T>>> -> nullable *mut c_void
    if let Some(inner) = ty.strip_prefix("Option<Vec<") {
        if let Some(inner) = inner.strip_suffix(">>") {
            let inner = inner.trim();
            if let Some(ref_inner) = supported_ref_inner(inner) {
                return Some((
                    " -> *mut std::ffi::c_void".to_string(),
                    FfiReturn::OptionVecReturn(VecReturnSpec {
                        element_ty: format!("flight_sdk::Ref<{}>", qualify_type(ref_inner)),
                        element_is_ref: true,
                    }),
                ));
            }
        }
    }

    // Option<Vec<T>> -> nullable *mut c_void
    if let Some(inner) = ty.strip_prefix("Option<Vec<") {
        if let Some(inner) = inner.strip_suffix(">>") {
            let inner = inner.trim();
            if qualify_opaque_type(inner).is_some() {
                return Some((
                    " -> *mut std::ffi::c_void".to_string(),
                    FfiReturn::OptionVecReturn(VecReturnSpec {
                        element_ty: qualify_opaque_type(inner).unwrap(),
                        element_is_ref: false,
                    }),
                ));
            }
        }
    }

    // Scalar tuples return through typed out-parameters.
    if let Some(elements) = scalar_tuple_elements(ty) {
        return Some((String::new(), FfiReturn::TupleReturn(elements)));
    }

    // Signal<()> -> owned opaque handle (a cloned signal sharing the source's listeners), released
    // with flight_free_unit_signal; Option<Signal<()>> -> the same handle or null.
    if ty == "Signal<()>" {
        return Some((
            " -> *mut flight_sdk::Signal<()>".to_string(),
            FfiReturn::BoxReturn,
        ));
    }
    if ty == "Option<Signal<()>>" {
        return Some((
            " -> *mut flight_sdk::Signal<()>".to_string(),
            FfiReturn::OptionBoxReturn,
        ));
    }

    // Optional scalar tuples return a presence flag and write the same out-parameters.
    if let Some(elements) = ty
        .strip_prefix("Option<")
        .and_then(|inner| inner.strip_suffix('>'))
        .and_then(|inner| scalar_tuple_elements(inner.trim()))
    {
        return Some((
            " -> bool".to_string(),
            FfiReturn::OptionTupleReturn(elements),
        ));
    }

    // Box<[T]> (typed arrays) -> *mut c_void (opaque owned handle)
    if let Some(inner) = ty.strip_prefix("Box<[") {
        if let Some(inner) = inner.strip_suffix("]>") {
            let inner = inner.trim();
            if is_scalar(inner) {
                return Some((
                    " -> *mut std::ffi::c_void".to_string(),
                    FfiReturn::BoxSliceReturn(inner.to_string()),
                ));
            }
        }
    }

    // Option<Box<[T]>> -> nullable *mut c_void
    if let Some(inner) = ty.strip_prefix("Option<Box<[") {
        if let Some(inner) = inner.strip_suffix("]>>") {
            let inner = inner.trim();
            if is_scalar(inner) {
                return Some((
                    " -> *mut std::ffi::c_void".to_string(),
                    FfiReturn::OptionBoxSliceReturn(inner.to_string()),
                ));
            }
        }
    }

    // [T; N] fixed-size array -> *mut T (box the array)
    if ty.starts_with('[') {
        if let Some(inner) = ty.strip_prefix('[') {
            if let Some(inner) = inner.strip_suffix(']') {
                if let Some((elem, _size_str)) = inner.split_once(';') {
                    let elem = elem.trim();
                    if is_scalar(elem) {
                        return Some((format!(" -> *mut {ty}"), FfiReturn::BoxReturn));
                    }
                }
            }
        }
    }

    // Option<EnumType> -> i32 with -1 sentinel for None
    if let Some(inner) = ty.strip_prefix("Option<") {
        if let Some(inner) = inner.strip_suffix('>') {
            let inner = inner.trim();
            if is_known_enum(inner) {
                return Some((" -> i32".to_string(), FfiReturn::OptionEnumReturn));
            }
        }
    }

    // Option<f32> -> f32 with NaN sentinel
    if ty == "Option<f32>" {
        return Some((" -> f32".to_string(), FfiReturn::OptionF32Return));
    }

    // Option<f64> -> f64 with NaN sentinel
    if ty == "Option<f64>" {
        return Some((" -> f64".to_string(), FfiReturn::OptionF64Return));
    }

    // Option<i32> -> i64 with i64::MIN sentinel
    if ty == "Option<i32>" {
        return Some((" -> i64".to_string(), FfiReturn::OptionI32Return));
    }

    // Option<u32> -> i64 with -1 sentinel
    if ty == "Option<u32>" {
        return Some((" -> i64".to_string(), FfiReturn::OptionU32Return));
    }

    // Option<bool> -> i32 with -1 sentinel (0 false, 1 true), matching the `Option<bool>` parameter
    if ty == "Option<bool>" {
        return Some((" -> i32".to_string(), FfiReturn::OptionBoolReturn));
    }

    // Option<&[T; N]> -> nullable *const T (pointer to caller's fixed array)
    if let Some(inner) = ty.strip_prefix("Option<&[") {
        if let Some(inner) = inner.strip_suffix("]>") {
            if let Some((elem, _size_str)) = inner.split_once(';') {
                let elem = elem.trim();
                if is_scalar(elem) {
                    return Some((format!(" -> *const {elem}"), FfiReturn::OptionRefReturn));
                }
            }
        }
    }

    // Option<&'static [T]> -> nullable ptr (returned as-is, caller must not free)
    if let Some(inner) = ty.strip_prefix("Option<&[") {
        if let Some(inner) = inner.strip_suffix("]>") {
            let inner = inner.trim();
            if is_scalar(inner) {
                return Some((format!(" -> *const {inner}"), FfiReturn::OptionRefReturn));
            }
        }
    }

    // Option<T> where T is a known non-generic struct -> nullable *mut T (boxed)
    if let Some(inner) = ty.strip_prefix("Option<") {
        if let Some(inner) = inner.strip_suffix('>') {
            let inner = inner.trim();
            if let Some(borrowed) = inner.strip_prefix('&') {
                let borrowed = borrowed.trim();
                if !borrowed.starts_with('[') && !is_scalar(borrowed) && borrowed != "str" {
                    let qualified = qualify_opaque_type(borrowed)?;
                    return Some((
                        format!(" -> *const {qualified}"),
                        FfiReturn::OptionBorrowedRefReturn,
                    ));
                }
            }
            if !inner.contains('<')
                && !inner.contains("::")
                && !inner.starts_with('&')
                && !is_scalar(inner)
                && !is_ffi_incompatible(inner)
            {
                return Some((
                    format!(" -> *mut {}", qualify_type(inner)),
                    FfiReturn::OptionBoxReturn,
                ));
            }
        }
    }

    if ty == "Option<&str>" || ty == "Option<&'static str>" {
        return Some((
            " -> *mut std::ffi::c_char".to_string(),
            FfiReturn::OptionStringReturn,
        ));
    }

    if ty == "&str" || ty == "&'static str" {
        return Some((
            " -> *mut std::ffi::c_char".to_string(),
            FfiReturn::StringReturn,
        ));
    }

    // &'static [T] -> boxed copy for FFI boundary
    if let Some(inner) = ty.strip_prefix("&[") {
        if let Some(inner) = inner.strip_suffix(']') {
            let inner = inner.trim();
            if is_scalar(inner) {
                return Some((
                    " -> *mut std::ffi::c_void".to_string(),
                    FfiReturn::SliceReturn(inner.to_string()),
                ));
            }
            let qualified = qualify_opaque_type(inner)?;
            return Some((
                format!(" -> *const {qualified}"),
                FfiReturn::BorrowedSliceReturn,
            ));
        }
    }

    // &T reference returns -> *const T (borrowing from input data)
    if let Some(inner) = ty.strip_prefix('&') {
        let inner = inner.trim();
        if !inner.starts_with('[') && !is_ffi_incompatible(inner) && !is_scalar(inner) {
            let qualified = qualify_type(inner);
            return Some((format!(" -> *const {qualified}"), FfiReturn::RefReturn));
        }
    }

    if ty.starts_with('&') {
        return None;
    }

    if is_scalar(ty) {
        return Some((format!(" -> {ty}"), FfiReturn::Direct));
    }
    if ty == "String" {
        return Some((
            " -> *mut std::ffi::c_char".to_string(),
            FfiReturn::StringReturn,
        ));
    }
    if ty.starts_with('[') {
        return None;
    }
    if is_known_enum(ty) {
        return Some((" -> u32".to_string(), FfiReturn::EnumReturn));
    }
    let qualified = qualify_opaque_type(ty)?;
    Some((format!(" -> *mut {qualified}"), FfiReturn::BoxReturn))
}
