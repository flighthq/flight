mod callback_alias;
mod claim_guard;
mod host_seam;
mod native_bindings;
mod out_alias;
mod public_perimeter;
mod reachability;
mod registry_carrier;
mod registry_tokens;
mod render_pass_bracket;
mod renderer_handles;
mod root_census;
mod signal_identity;
mod signal_ref_connect;
use std::collections::{BTreeMap, BTreeSet};
use std::env;
use std::fmt::Write as _;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use quote::ToTokens;

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

// The callback aliases a parameter may be spelled with and still lower as a C callback: each is
// resolved from its one source definition to its `Arc<dyn Fn(..)>` target. The list is policy, not
// discovery: the scanned crates define about three hundred callback aliases, most of them host
// capability or registry handler shapes that other policies keep out of the C surface, so each one
// is admitted by name. IpcInvokeHandler (returns a future) and IpcMessageListener (takes
// `&[AnySlot]`) are absent because their payloads have no C lowering yet, aliased or not.
const LOWERED_CALLBACK_ALIASES: &[&str] = &[
    "AnyInteractionSignalSlot",
    "FileWatchListener",
    "HitTestFunction",
    "HitTestPreciseFunction",
    "InputRepeatCallback",
    "SignalSlot",
];

// The checked definitions of `LOWERED_CALLBACK_ALIASES`; set once after scanning.
static CALLBACK_ALIASES: OnceLock<BTreeMap<String, callback_alias::CallbackAlias>> =
    OnceLock::new();

// Every named type's definitions, from source, for by-value ownership; each is flagged with whether
// its crate root re-exports it by name, which picks the SDK's meaning when two crates share a name.
// Type names that some scanned crate's root re-exports, and type names reachable only through one
// crate's contract module, keyed to that module. A signature type that is contract-only must be
// named through `flight_sdk::<module>::contract`, since the SDK root glob never sees it.
static ROOT_TYPE_NAMES: OnceLock<BTreeSet<String>> = OnceLock::new();
static CONTRACT_ONLY_TYPE_MODULES: OnceLock<BTreeMap<String, String>> = OnceLock::new();

fn collect_type_lanes(crates_dir: &Path) -> (BTreeSet<String>, BTreeMap<String, String>) {
    let mut root = BTreeSet::new();
    let mut contract: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    for dir_name in SCAN_CRATES {
        let src_dir = crates_dir.join(dir_name).join("src");
        let lib = src_dir.join("lib.rs");
        if !lib.exists() {
            continue;
        }
        root.extend(root_census::collect_module_exports(&src_dir, &lib).types);
        let contract_path = src_dir.join("contract.rs");
        if contract_path.exists() {
            let module = package_module_name(&src_dir);
            for name in root_census::collect_module_exports(&src_dir, &contract_path).types {
                contract.entry(name).or_default().insert(module.clone());
            }
        }
    }
    let contract_only = contract
        .into_iter()
        .filter(|(name, modules)| !root.contains(name) && modules.len() == 1)
        .map(|(name, modules)| (name, modules.into_iter().next().unwrap()))
        .collect();
    return (root, contract_only);
}

// SDK types every definition of which derives `Clone` (or `Copy`): an out-parameter wrapper can
// snapshot an aliased input of such a type before the call.
fn collect_clone_types(crates_dir: &Path) -> BTreeSet<String> {
    return collect_derive_types(crates_dir, &["Clone", "Copy"]);
}

// SDK types every definition of which derives one of `derives`.
fn collect_derive_types(crates_dir: &Path, derives: &[&str]) -> BTreeSet<String> {
    let mut verdicts: BTreeMap<String, bool> = BTreeMap::new();
    for dir_name in SCAN_CRATES {
        let Ok(entries) = fs::read_dir(crates_dir.join(dir_name).join("src")) else {
            continue;
        };
        let mut paths: Vec<_> = entries
            .filter_map(Result::ok)
            .map(|entry| entry.path())
            .filter(|path| root_census::is_library_path(path))
            .collect();
        paths.sort();
        for path in paths {
            let Ok(file) = syn::parse_file(&fs::read_to_string(&path).unwrap_or_default()) else {
                continue;
            };
            for item in file.items {
                let (ident, attrs) = match &item {
                    syn::Item::Struct(value) => (&value.ident, &value.attrs),
                    syn::Item::Enum(value) => (&value.ident, &value.attrs),
                    _ => continue,
                };
                let clone = attrs.iter().any(|attribute| {
                    attribute.path().is_ident("derive")
                        && attribute
                            .to_token_stream()
                            .to_string()
                            .split(|c: char| !c.is_alphanumeric())
                            .any(|word| derives.contains(&word))
                });
                let verdict = verdicts.entry(ident.to_string()).or_insert(true);
                *verdict &= clone;
            }
        }
    }
    return verdicts
        .into_iter()
        .filter_map(|(name, clone)| clone.then_some(name))
        .collect();
}

static CLONE_TYPES: OnceLock<BTreeSet<String>> = OnceLock::new();
// Plain records: public structs whose every field is public and a scalar or `String`, by name, with
// their fields in declaration order. C can build one from parallel field arrays.
static RECORD_TYPES: OnceLock<BTreeMap<String, Vec<(String, String)>>> = OnceLock::new();

fn collect_record_types(crates_dir: &Path) -> BTreeMap<String, Vec<(String, String)>> {
    let mut records: BTreeMap<String, Option<Vec<(String, String)>>> = BTreeMap::new();
    for dir_name in SCAN_CRATES {
        let Ok(entries) = fs::read_dir(crates_dir.join(dir_name).join("src")) else {
            continue;
        };
        let mut paths: Vec<_> = entries
            .filter_map(Result::ok)
            .map(|entry| entry.path())
            .filter(|path| root_census::is_library_path(path))
            .collect();
        paths.sort();
        for path in paths {
            let Ok(file) = syn::parse_file(&fs::read_to_string(&path).unwrap_or_default()) else {
                continue;
            };
            for item in file.items {
                let syn::Item::Struct(value) = item else {
                    continue;
                };
                if !matches!(value.vis, syn::Visibility::Public(_)) {
                    continue;
                }
                let mut fields = Vec::new();
                let mut plain = !value.fields.is_empty();
                for field in &value.fields {
                    let ty = field.ty.to_token_stream().to_string().replace(' ', "");
                    match &field.ident {
                        Some(ident)
                            if matches!(field.vis, syn::Visibility::Public(_))
                                && (is_scalar(&ty) || ty == "String") =>
                        {
                            fields.push((ident.to_string(), ty));
                        }
                        _ => plain = false,
                    }
                }
                let entry = records.entry(value.ident.to_string()).or_insert(None);
                // A name two crates define is not a record: its identity is ambiguous.
                *entry = if entry.is_none() && plain {
                    Some(fields)
                } else {
                    None
                };
            }
        }
    }
    return records
        .into_iter()
        .filter_map(|(name, fields)| Some((name, fields?)))
        .collect();
}

static TYPE_DEFINITIONS: OnceLock<BTreeMap<String, Vec<(bool, TypeDefinition)>>> = OnceLock::new();

// Exact Rust types C can hold as an owned box because some generated wrapper produces that box.
// The set is discovered to a fixed point before emission: a consumer can depend on a producer, but
// a cycle of consumers can never invent its own initial handle.
static PRODUCIBLE_TYPES: OnceLock<Mutex<BTreeSet<String>>> = OnceLock::new();
// Signal owners C only holds as a shared `Ref` handle; set once before the signal inventory report.
static REF_OWNED_SIGNAL_OWNERS: OnceLock<BTreeSet<String>> = OnceLock::new();

// Node kinds are discovered from the SDK's implementation macros before any ABI lowering. This
// keeps every concrete node producer on the one FlightNode carrier without a hand-maintained list
// that can silently miss a newly exported node kind.
static NODE_TYPES: OnceLock<BTreeMap<String, NodeKind>> = OnceLock::new();

// A borrowed T can use a Ref<T> handle only when T has no owned-value producer. Dual-produced
// types deliberately retain their historical raw-pointer borrowing ABI in this item and are
// reported with the exact generated functions that borrow them.
static BORROW_PRODUCTION: OnceLock<BorrowProduction> = OnceLock::new();

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum NodeKind {
    Node,
    Node2D,
    Node3D,
}

#[derive(Default)]
struct BorrowProduction {
    ref_producers: BTreeMap<String, BTreeSet<String>>,
    owned_producers: BTreeMap<String, BTreeSet<String>>,
    borrowers: BTreeMap<String, BTreeSet<String>>,
}

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
    "flight-effects-wgpu",
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
    "flight-interaction",
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
    "flight-render-wgpu",
    "flight-requirement",
    "flight-requirement-catalog",
    "flight-requirement-codegen",
    "flight-resource",
    "flight-scene-document",
    "flight-scene2d",
    "flight-scene2d-formats",
    "flight-scene2d-resources",
    "flight-scene2d-wgpu",
    "flight-scene3d",
    "flight-scene3d-formats",
    "flight-scene3d-resources",
    "flight-scene3d-wgpu",
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
    // The three RenderTexture borrows must be proven pairwise distinct or grouped under one lock;
    // the current ABI only arbitrates two same-allocation borrows.
    "apply_wgpu_effects_to_render_texture",
    "enable_clip_guards",
    "enable_statechart_guards",
    // The capability contains a host-supplied Arc<dyn Fn>; C cannot construct it soundly.
    "get_connectivity_online",
];
// WGPU backend sources outside the declared render sequence. Each decision is literal so a new
// backend export fails the public-skip census instead of inheriting a pattern-based exemption.
const WGPU_BACKEND_POLICY_SKIP_FNS: &[(&str, &str, &str)] = &[
    (
        "begin_wgpu_effect_pass",
        "nested_bracket_policy_skip",
        "nested effect pass borrows a caller-owned render pass",
    ),
    (
        "begin_wgpu_render_pass",
        "bracket_policy_skip",
        "emitted by the borrow-erased bracket table",
    ),
    (
        "create_external_wgpu_texture",
        "native_layout_policy_skip",
        "consumes native wgpu Texture ownership",
    ),
    (
        "create_wgpu_texture_render_target",
        "native_layout_policy_skip",
        "native wgpu TextureFormat has no declared C layout",
    ),
    (
        "end_wgpu_effect_pass",
        "nested_bracket_policy_skip",
        "nested effect pass consumes a caller-owned render-pass borrow",
    ),
    (
        "end_wgpu_render_pass",
        "bracket_policy_skip",
        "emitted by the borrow-erased bracket table",
    ),
    (
        "get_wgpu_shape_rasterizer",
        "backend_behavior_policy_skip",
        "optional SDK callback has no declared C ownership contract",
    ),
    (
        "is_wgpu_bitmap_displacement_effect_resolvable",
        "trait_carrier_policy_skip",
        "borrowed dyn Effect has no declared FFI trait carrier",
    ),
    (
        "is_wgpu_effect_resolvable",
        "trait_carrier_policy_skip",
        "borrowed dyn Effect has no declared FFI trait carrier",
    ),
    (
        "register_wgpu_shape_rasterizer",
        "backend_behavior_policy_skip",
        "optional rasterizer callback has no declared C teardown contract",
    ),
    (
        "render_into_wgpu_render_texture",
        "scoped_callback_policy_skip",
        "scoped FnOnce borrows a render pass without a C callback contract",
    ),
    (
        "render_wgpu_environment_skybox",
        "bracket_policy_skip",
        "emitted by the borrow-erased bracket table",
    ),
    (
        "render_wgpu_scene2d",
        "bracket_policy_skip",
        "emitted by the borrow-erased bracket table",
    ),
    (
        "render_wgpu_scene3d",
        "bracket_policy_skip",
        "emitted by the borrow-erased bracket table",
    ),
    (
        "set_wgpu_effect_velocity_texture",
        "native_layout_policy_skip",
        "consumes optional native wgpu Texture ownership",
    ),
    (
        "wgpu_bevel_effect_runner",
        "backend_behavior_policy_skip",
        "SDK-owned effect hook receives a private borrow-scoped context",
    ),
    (
        "wgpu_bitmap_displacement_effect_runner",
        "backend_behavior_policy_skip",
        "SDK-owned effect hook receives a private borrow-scoped context",
    ),
    (
        "wgpu_blend_effect_runner",
        "backend_behavior_policy_skip",
        "SDK-owned effect hook receives a private borrow-scoped context",
    ),
    (
        "wgpu_bloom_effect_runner",
        "backend_behavior_policy_skip",
        "SDK-owned effect hook receives a private borrow-scoped context",
    ),
    (
        "wgpu_blur_effect_runner",
        "backend_behavior_policy_skip",
        "SDK-owned effect hook receives a private borrow-scoped context",
    ),
    (
        "wgpu_camera_motion_blur_effect_runner",
        "backend_behavior_policy_skip",
        "SDK-owned effect hook receives a private borrow-scoped context",
    ),
    (
        "wgpu_chromatic_aberration_effect_runner",
        "backend_behavior_policy_skip",
        "SDK-owned effect hook receives a private borrow-scoped context",
    ),
    (
        "wgpu_composite_effect_runner",
        "backend_behavior_policy_skip",
        "SDK-owned effect hook receives a private borrow-scoped context",
    ),
    (
        "wgpu_contact_shadows_effect_runner",
        "backend_behavior_policy_skip",
        "SDK-owned effect hook receives a private borrow-scoped context",
    ),
    (
        "wgpu_convolution_effect_runner",
        "backend_behavior_policy_skip",
        "SDK-owned effect hook receives a private borrow-scoped context",
    ),
    (
        "wgpu_crt_effect_runner",
        "backend_behavior_policy_skip",
        "SDK-owned effect hook receives a private borrow-scoped context",
    ),
    (
        "wgpu_directional_blur_effect_runner",
        "backend_behavior_policy_skip",
        "SDK-owned effect hook receives a private borrow-scoped context",
    ),
    (
        "wgpu_displacement_effect_runner",
        "backend_behavior_policy_skip",
        "SDK-owned effect hook receives a private borrow-scoped context",
    ),
    (
        "wgpu_dither_effect_runner",
        "backend_behavior_policy_skip",
        "SDK-owned effect hook receives a private borrow-scoped context",
    ),
    (
        "wgpu_drop_shadow_effect_runner",
        "backend_behavior_policy_skip",
        "SDK-owned effect hook receives a private borrow-scoped context",
    ),
    (
        "wgpu_film_grain_effect_runner",
        "backend_behavior_policy_skip",
        "SDK-owned effect hook receives a private borrow-scoped context",
    ),
    (
        "wgpu_fxaa_effect_runner",
        "backend_behavior_policy_skip",
        "SDK-owned effect hook receives a private borrow-scoped context",
    ),
    (
        "wgpu_glitch_effect_runner",
        "backend_behavior_policy_skip",
        "SDK-owned effect hook receives a private borrow-scoped context",
    ),
    (
        "wgpu_god_rays_effect_runner",
        "backend_behavior_policy_skip",
        "SDK-owned effect hook receives a private borrow-scoped context",
    ),
    (
        "wgpu_gradient_bevel_effect_runner",
        "backend_behavior_policy_skip",
        "SDK-owned effect hook receives a private borrow-scoped context",
    ),
    (
        "wgpu_gradient_glow_effect_runner",
        "backend_behavior_policy_skip",
        "SDK-owned effect hook receives a private borrow-scoped context",
    ),
    (
        "wgpu_halftone_effect_runner",
        "backend_behavior_policy_skip",
        "SDK-owned effect hook receives a private borrow-scoped context",
    ),
    (
        "wgpu_inner_glow_effect_runner",
        "backend_behavior_policy_skip",
        "SDK-owned effect hook receives a private borrow-scoped context",
    ),
    (
        "wgpu_inner_shadow_effect_runner",
        "backend_behavior_policy_skip",
        "SDK-owned effect hook receives a private borrow-scoped context",
    ),
    (
        "wgpu_kuwahara_effect_runner",
        "backend_behavior_policy_skip",
        "SDK-owned effect hook receives a private borrow-scoped context",
    ),
    (
        "wgpu_lens_dirt_effect_runner",
        "backend_behavior_policy_skip",
        "SDK-owned effect hook receives a private borrow-scoped context",
    ),
    (
        "wgpu_lens_distortion_effect_runner",
        "backend_behavior_policy_skip",
        "SDK-owned effect hook receives a private borrow-scoped context",
    ),
    (
        "wgpu_lens_flare_effect_runner",
        "backend_behavior_policy_skip",
        "SDK-owned effect hook receives a private borrow-scoped context",
    ),
    (
        "wgpu_median_effect_runner",
        "backend_behavior_policy_skip",
        "SDK-owned effect hook receives a private borrow-scoped context",
    ),
    (
        "wgpu_motion_blur_effect_runner",
        "backend_behavior_policy_skip",
        "SDK-owned effect hook receives a private borrow-scoped context",
    ),
    (
        "wgpu_node2d_velocity_writer",
        "backend_behavior_policy_skip",
        "SDK-owned velocity hook receives a private borrow-scoped context",
    ),
    (
        "wgpu_outer_glow_effect_runner",
        "backend_behavior_policy_skip",
        "SDK-owned effect hook receives a private borrow-scoped context",
    ),
    (
        "wgpu_outline_effect_runner",
        "backend_behavior_policy_skip",
        "SDK-owned effect hook receives a private borrow-scoped context",
    ),
    (
        "wgpu_particle_emitter2d_velocity_writer",
        "backend_behavior_policy_skip",
        "SDK-owned velocity hook receives a private borrow-scoped context",
    ),
    (
        "wgpu_pixelate_effect_runner",
        "backend_behavior_policy_skip",
        "SDK-owned effect hook receives a private borrow-scoped context",
    ),
    (
        "wgpu_posterize_effect_runner",
        "backend_behavior_policy_skip",
        "SDK-owned effect hook receives a private borrow-scoped context",
    ),
    (
        "wgpu_radial_blur_effect_runner",
        "backend_behavior_policy_skip",
        "SDK-owned effect hook receives a private borrow-scoped context",
    ),
    (
        "wgpu_scanlines_effect_runner",
        "backend_behavior_policy_skip",
        "SDK-owned effect hook receives a private borrow-scoped context",
    ),
    (
        "wgpu_screen_space_fog_effect_runner",
        "backend_behavior_policy_skip",
        "SDK-owned effect hook receives a private borrow-scoped context",
    ),
    (
        "wgpu_sharpen_effect_runner",
        "backend_behavior_policy_skip",
        "SDK-owned effect hook receives a private borrow-scoped context",
    ),
    (
        "wgpu_sketch_effect_runner",
        "backend_behavior_policy_skip",
        "SDK-owned effect hook receives a private borrow-scoped context",
    ),
    (
        "wgpu_smaa_effect_runner",
        "backend_behavior_policy_skip",
        "SDK-owned effect hook receives a private borrow-scoped context",
    ),
    (
        "wgpu_ssao_effect_runner",
        "backend_behavior_policy_skip",
        "SDK-owned effect hook receives a private borrow-scoped context",
    ),
    (
        "wgpu_tilt_shift_effect_runner",
        "backend_behavior_policy_skip",
        "SDK-owned effect hook receives a private borrow-scoped context",
    ),
    (
        "wgpu_tone_map_effect_runner",
        "backend_behavior_policy_skip",
        "SDK-owned effect hook receives a private borrow-scoped context",
    ),
    (
        "wgpu_vignette_effect_runner",
        "backend_behavior_policy_skip",
        "SDK-owned effect hook receives a private borrow-scoped context",
    ),
    (
        "wgpu_white_balance_effect_runner",
        "backend_behavior_policy_skip",
        "SDK-owned effect hook receives a private borrow-scoped context",
    ),
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
// Marks a C pointer parameter that lowers a Rust `Option`; reachability reads it, the header does not.
const NULLABLE_PARAM_DOC_PREFIX: &str = "flight-ffi nullable|";
// SDK types C only ever receives as a shared `Ref` handle (their factory returns one) but whose
// functions borrow the value. Their `&T`/`&mut T` parameters lower to that handle, read- or
// write-locked for the call, as the SDK's own retained connectors lock it. Listed explicitly: the
// same gap exists for other Ref-produced types and is a separate ABI decision.
const REF_LOCKED_PARAM_TYPES: &[&str] = &["InteractionManager"];
// The header contract every `flight_connect_<payload>_signal` carries.
const SIGNAL_CONNECT_CONTRACT: &str = "Connects callback_fn(callback_ctx, payload) to signal and returns an owned connection; NULL signal or callback_fn returns NULL without connecting and without calling release_fn. Callbacks run synchronously on the thread that emits the signal; borrowed payload pointers and handles are valid only during the call. release_fn (nullable) receives callback_ctx exactly once, with no signal or scope lock held, when the slot is torn down: flight_free_signal_connection (which disconnects), flight_disconnect_signal_connection, a once connection firing, disconnecting scope, clearing the signal, or dropping the last handle to the signal. The callback never runs after release_fn; a call already running on another thread finishes first, and the connection reports disconnected as soon as it is torn down. release_fn may call back into the signal. Higher priority runs first and equal priorities keep connect order; once disconnects after the first call; scope may be NULL.";
// Item C: the decision for every `Signal<T>` payload on the public perimeter. `connect` emits one
// `flight_connect_<payload>_signal` wrapper whose callback argument follows Task M's lowering
// rules (unit, scalar, checked enum as u32, `&PlainStruct` and `&Ref<T>` as borrowed handles);
// `skip:<reason>` names a payload the callback contract cannot carry. The build fails when the
// inventory holds a payload with no entry here or an entry names a payload that no longer exists,
// so a new public payload is never silently omitted.
const SIGNAL_PAYLOAD_POLICIES: &[(&str, &str)] = &[
    ("()", "connect"),
    (
        "(Notification, String)",
        "skip:tuple payload has no Task M callback carrier",
    ),
    (
        "(Notification, String, String)",
        "skip:tuple payload has no Task M callback carrier",
    ),
    (
        "(Ref<TreeViewControllerItem>, bool)",
        "skip:tuple payload has no Task M callback carrier",
    ),
    (
        "(RenderRegistryTable, Kind)",
        "skip:tuple payload has no Task M callback carrier",
    ),
    (
        "(String, Unknown)",
        "skip:dynamic `Unknown` payload has no C representation",
    ),
    (
        "(String, Unknown, usize)",
        "skip:dynamic `Unknown` payload has no C representation",
    ),
    (
        "(String, usize, f64)",
        "skip:tuple payload has no Task M callback carrier",
    ),
    (
        "(Unknown, String)",
        "skip:dynamic `Unknown` payload has no C representation",
    ),
    (
        "(f64, f64)",
        "skip:tuple payload has no Task M callback carrier",
    ),
    (
        "(i32, i32, i16)",
        "skip:tuple payload has no Task M callback carrier",
    ),
    (
        "(i32, i32, i32)",
        "skip:tuple payload has no Task M callback carrier",
    ),
    (
        "(i32, i32, i32, i32)",
        "skip:tuple payload has no Task M callback carrier",
    ),
    (
        "(usize, i32)",
        "skip:tuple payload has no Task M callback carrier",
    ),
    ("AmbientLightReading", "connect"),
    ("AnimationClipEvent", "connect"),
    ("AppLifecycleState", "connect"),
    (
        "AppLifecycleStateBag",
        "skip:dynamic `Unknown` payload has no C representation",
    ),
    ("AppMemoryPressure", "connect"),
    ("ConnectivityConnectionType", "connect"),
    ("ConnectivityStatus", "connect"),
    ("FocusEventData", "connect"),
    ("FrameTick", "connect"),
    ("InputGamepadAxisData", "connect"),
    ("InputGamepadButtonData", "connect"),
    ("InputGamepadConnectData", "connect"),
    ("InputKeyboardData", "connect"),
    ("InputPointerData", "connect"),
    ("InputTextData", "connect"),
    ("InstancedMeshInstanceRemoved", "connect"),
    ("KeyboardEventData", "connect"),
    ("LogEntry", "connect"),
    ("MediaSessionActionDetails", "connect"),
    ("MidiInputMessage", "connect"),
    ("MidiPort", "connect"),
    ("MotionReading", "connect"),
    (
        "NodeRef",
        "skip:node payload waits for Item B's FlightNode carrier",
    ),
    ("Notification", "connect"),
    (
        "Option<HostTextShaperCapability>",
        "skip:host capability construction is withdrawn from the alpha ABI (Task S)",
    ),
    (
        "Option<NodeRef>",
        "skip:node payload waits for Item B's FlightNode carrier",
    ),
    (
        "Option<Ref<GuiDialogEntry>>",
        "skip:optional handle payload has no Task M callback carrier",
    ),
    (
        "Option<Ref<TreeViewControllerItem>>",
        "skip:optional handle payload has no Task M callback carrier",
    ),
    ("OrientationReading", "connect"),
    ("ParticleDeathEvent", "connect"),
    ("ParticleSpawnEvent", "connect"),
    ("PointerEventData", "connect"),
    ("PowerStatus", "connect"),
    ("PowerThermalState", "connect"),
    ("PressureReading", "connect"),
    ("ProximityReading", "connect"),
    ("QuaternionReading", "connect"),
    ("Ref<AssetLoadProgress>", "connect"),
    ("Ref<GuiDialogCloseResult>", "connect"),
    ("Ref<LoadProgress>", "connect"),
    ("Ref<NetProgress>", "connect"),
    ("Ref<Scene3DDocumentLoadProgress>", "connect"),
    ("Ref<ShareResult>", "connect"),
    ("Ref<TreeViewControllerItem>", "connect"),
    (
        "ResourceLoadReports",
        "skip:collection payload has no Task M callback carrier",
    ),
    ("RotationRateReading", "connect"),
    ("Scene2DAudioResourceLoadProgress", "connect"),
    ("Scene2DDocumentFetchProgress", "connect"),
    ("Scene2DImageResourceLoadProgress", "connect"),
    ("Scene3DResourceEvent", "connect"),
    ("Scene3DResourceLoadProgress", "connect"),
    ("ScreenChangeEvent", "connect"),
    ("ScreenInfo", "connect"),
    ("ScreenPermissionState", "connect"),
    ("SocketCloseInfo", "connect"),
    ("SocketMessage", "connect"),
    ("StatusBarInfo", "connect"),
    ("StorageChange", "connect"),
    (
        "String",
        "skip:string payload has no Task M borrowed-string callback carrier",
    ),
    ("TextFieldChangeEvent", "connect"),
    ("TextFieldLinkEvent", "connect"),
    ("TextFieldScrollEvent", "connect"),
    ("TimelineFrameEvent", "connect"),
    ("TrayBalloonEvent", "connect"),
    ("TrayDropEvent", "connect"),
    ("TrayInteractionEvent", "connect"),
    ("TrayMenuSelectionEvent", "connect"),
    (
        "Unknown",
        "skip:dynamic `Unknown` payload has no C representation",
    ),
    (
        "Vec<NodeRef>",
        "skip:node payload waits for Item B's FlightNode carrier",
    ),
    (
        "Vec<String>",
        "skip:collection payload has no Task M callback carrier",
    ),
    (
        "WgpuDeviceLostInfo",
        "skip:Rust-owned String field has no borrowed C struct layout",
    ),
    ("bool", "connect"),
    ("f32", "connect"),
    ("f64", "connect"),
    ("i32", "connect"),
    ("usize", "connect"),
];
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
    if let Some((_, category, _)) = WGPU_BACKEND_POLICY_SKIP_FNS
        .iter()
        .find(|(function, _, _)| *function == name)
    {
        return Some(category);
    }
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
    ("HitTestContext", "interaction"),
    ("MarkupTagHandler", "text_markup"),
    ("MarkupTagRegistry", "text_markup"),
    ("MeshAttachment2D", "skeleton2d"),
    ("NodeInteractionStateRef", "interaction"),
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

// Explicit backend instantiations of generic render functions (Item E1). Nothing here is inferred:
// a generic function absent from this table stays outside the scanner, and each entry must name a
// public generic signature whose type parameters are exactly the ones it binds. The output name is
// explicit so a lifecycle pair reads as one (`prepare`/`destroy`) and never collides with an
// existing backend function.
struct DeclaredInstantiation {
    crate_dir: &'static str,
    function: &'static str,
    ffi_name: &'static str,
    type_args: &'static [(&'static str, &'static str)],
}

const DECLARED_INSTANTIATIONS: &[DeclaredInstantiation] = &[
    DeclaredInstantiation {
        crate_dir: "flight-render",
        function: "prepare_scene_2d_render",
        ffi_name: "flight_prepare_wgpu_scene_2d_render",
        type_args: &[("S", "WgpuRenderState")],
    },
    DeclaredInstantiation {
        crate_dir: "flight-render",
        function: "register_node_renderer",
        ffi_name: "flight_register_gl_node_renderer",
        type_args: &[("S", "GlRenderState")],
    },
    DeclaredInstantiation {
        crate_dir: "flight-render",
        function: "register_node_renderer",
        ffi_name: "flight_register_wgpu_node_renderer",
        type_args: &[("S", "WgpuRenderState")],
    },
    DeclaredInstantiation {
        crate_dir: "flight-render",
        function: "destroy_render_state",
        ffi_name: "flight_destroy_wgpu_scene_2d_render",
        type_args: &[("S", "WgpuRenderState")],
    },
];

// Opaque carriers for generic containers, one per instantiation. A carrier is created from the
// container's `Default` (the containers have no constructor function) and released by its paired
// free; the instantiated functions above borrow it.
struct DeclaredCarrier {
    container: &'static str,
    type_args: &'static [&'static str],
    create_name: &'static str,
    free_name: &'static str,
}

const DECLARED_CARRIERS: &[DeclaredCarrier] = &[DeclaredCarrier {
    container: "RenderProxies2D",
    type_args: &["WgpuRenderState"],
    create_name: "flight_create_wgpu_scene_2d_render_proxies",
    free_name: "flight_free_wgpu_scene_2d_render_proxies",
}];

fn collect_node_types(crates_dir: &Path) -> BTreeMap<String, NodeKind> {
    fn insert(out: &mut BTreeMap<String, NodeKind>, name: String, kind: NodeKind) {
        match out.insert(name.clone(), kind) {
            Some(previous) if previous != kind => {
                panic!("node type {name} was classified as both {previous:?} and {kind:?}")
            }
            _ => {}
        }
    }

    fn simple_type_name(ty: &syn::Type) -> Option<String> {
        let syn::Type::Path(path) = ty else {
            return None;
        };
        return path
            .path
            .segments
            .last()
            .map(|segment| segment.ident.to_string());
    }

    fn first_macro_type(mac: &syn::Macro) -> Option<String> {
        let tokens = mac.tokens.to_string();
        let name: String = tokens
            .chars()
            .skip_while(|character| character.is_whitespace())
            .take_while(|character| character.is_alphanumeric() || *character == '_')
            .collect();
        return (!name.is_empty()).then_some(name);
    }

    fn visit_items(items: &[syn::Item], out: &mut BTreeMap<String, NodeKind>) {
        for item in items {
            match item {
                syn::Item::Macro(item) => {
                    let Some(name) = item
                        .mac
                        .path
                        .segments
                        .last()
                        .map(|part| part.ident.to_string())
                    else {
                        continue;
                    };
                    let kind = match name.as_str() {
                        "impl_node2d" | "impl_shape_node2d" => Some(NodeKind::Node2D),
                        "impl_node3d" => Some(NodeKind::Node3D),
                        _ => None,
                    };
                    if let Some(kind) = kind
                        && let Some(ty) = first_macro_type(&item.mac)
                    {
                        insert(out, ty, kind);
                    }
                }
                syn::Item::Impl(item) => {
                    let is_node = item
                        .trait_
                        .as_ref()
                        .and_then(|(_, path, _)| path.segments.last())
                        .is_some_and(|segment| segment.ident == "Node");
                    if is_node && let Some(ty) = simple_type_name(&item.self_ty) {
                        out.entry(ty).or_insert(NodeKind::Node);
                    }
                }
                syn::Item::Mod(item) => {
                    if let Some((_, items)) = &item.content {
                        visit_items(items, out);
                    }
                }
                _ => {}
            }
        }
    }

    let mut out = BTreeMap::new();
    for dir_name in SCAN_CRATES {
        let src_dir = crates_dir.join(dir_name).join("src");
        let Ok(entries) = fs::read_dir(src_dir) else {
            continue;
        };
        let mut entries: Vec<_> = entries
            .filter_map(Result::ok)
            .filter(|entry| entry.path().extension().is_some_and(|ext| ext == "rs"))
            .collect();
        entries.sort_by_key(|entry| entry.file_name());
        for entry in entries {
            let content = fs::read_to_string(entry.path()).unwrap();
            if let Ok(file) = syn::parse_file(&content) {
                visit_items(&file.items, &mut out);
            }
        }
    }
    return out;
}

fn simple_ref_inner(ty: &str) -> Option<String> {
    let resolved = strip_crate_paths(&strip_lifetimes(&resolve_type_alias(ty.trim())));
    let value = resolved
        .strip_prefix("Option<")
        .and_then(|rest| rest.strip_suffix('>'))
        .unwrap_or(&resolved)
        .trim();
    let inner = value.strip_prefix("Ref<")?.strip_suffix('>')?.trim();
    (!inner.contains('<') && !inner.contains("dyn ") && !inner.contains("::"))
        .then(|| inner.to_string())
}

fn simple_owned_return(ty: &str) -> Option<String> {
    let resolved = strip_crate_paths(&strip_lifetimes(&resolve_type_alias(ty.trim())));
    let value = resolved
        .strip_prefix("Option<")
        .and_then(|rest| rest.strip_suffix('>'))
        .unwrap_or(&resolved)
        .trim();
    if value.starts_with("Ref<") || value.starts_with("Arc<") {
        return None;
    }
    let value = value
        .strip_prefix("Box<")
        .and_then(|rest| rest.strip_suffix('>'))
        .unwrap_or(value)
        .trim();
    if value.is_empty()
        || value.contains('<')
        || value.contains("::")
        || value.starts_with('&')
        || value.starts_with('[')
        || value.starts_with('(')
        || is_scalar(value)
        || is_known_enum(value)
        || value == "String"
    {
        return None;
    }
    return Some(value.to_string());
}

fn simple_borrowed_type(ty: &str) -> Option<String> {
    let resolved = strip_crate_paths(&strip_lifetimes(&resolve_type_alias(ty.trim())));
    let inner = resolved
        .strip_prefix("&mut ")
        .or_else(|| resolved.strip_prefix('&'))?
        .trim();
    if inner.is_empty()
        || inner.contains('<')
        || inner.contains("::")
        || inner.starts_with('[')
        || inner.starts_with("dyn ")
        || is_scalar(inner)
        || is_known_enum(inner)
        || inner == "str"
    {
        return None;
    }
    return Some(inner.to_string());
}

fn collect_borrow_production(crates_dir: &Path) -> BorrowProduction {
    let mut out = BorrowProduction::default();
    for dir_name in SCAN_CRATES {
        let src_dir = crates_dir.join(dir_name).join("src");
        if !src_dir.exists() {
            continue;
        }
        for function in collect_pub_fns(&src_dir) {
            if function.lacks_public_export || explicit_skip_category(&function.name).is_some() {
                continue;
            }
            if let Some(ret) = &function.ret {
                if let Some(ty) = simple_ref_inner(ret) {
                    out.ref_producers
                        .entry(ty)
                        .or_default()
                        .insert(function.name.clone());
                } else if let Some(ty) = simple_owned_return(ret) {
                    out.owned_producers
                        .entry(ty)
                        .or_default()
                        .insert(function.name.clone());
                }
            }
            for parameter in &function.params {
                if let Some(ty) = simple_borrowed_type(&parameter.ty) {
                    out.borrowers
                        .entry(ty)
                        .or_default()
                        .insert(function.name.clone());
                }
            }
        }
    }
    return out;
}

// `create_X() -> X` with no parameters, where public functions borrow `X` and no public function
// produces it. TypeScript keeps such state in its module; Rust makes it an explicit value, and C
// needs the one constructor to call the public functions at all.
fn is_state_seam_constructor(func: &ParsedFn) -> bool {
    if !func.name.starts_with("create_") || !func.params.is_empty() {
        return false;
    }
    let Some(ty) = func.ret.as_deref().and_then(simple_owned_return) else {
        return false;
    };
    let Some(inventory) = BORROW_PRODUCTION.get() else {
        return false;
    };
    return inventory.borrowers.contains_key(&ty)
        && !inventory.ref_producers.contains_key(&ty)
        && !inventory.owned_producers.contains_key(&ty);
}

// Types C holds only as one shared `Ref` handle: every producer returns that handle (an owned value
// is wrapped into a fresh one), every borrower locks it, a by-value consumer clones the value under
// a read lock, and its one free releases one handle. TextFormat additionally validates every handle
// against a registry of issued tokens.
const CANONICAL_REF_CARRIERS: &[&str] = &[
    "AnimationClip",
    "Bitmap",
    "Path",
    "Scene3DDocument",
    "TextFormat",
    "TextLayoutResult",
    "Texture",
    "Texture2D",
    "XmlElement",
];

fn is_canonical_ref_carrier(ty: &str) -> bool {
    return CANONICAL_REF_CARRIERS.contains(&ty.trim());
}

// `T` -> `Ref<T>` and `Option<T>` -> `Option<Ref<T>>` for a canonical carrier `T`.
fn normalize_canonical_return(mut func: ParsedFn) -> ParsedFn {
    let Some(ret) = func.ret.clone() else {
        return func;
    };
    let resolved = strip_crate_paths(&strip_lifetimes(&resolve_type_alias(ret.trim())));
    let (inner, optional) = match resolved
        .strip_prefix("Option<")
        .and_then(|rest| rest.strip_suffix('>'))
    {
        Some(inner) => (inner.trim().to_string(), true),
        None => (resolved.trim().to_string(), false),
    };
    if !is_canonical_ref_carrier(&inner) {
        return func;
    }
    func.ret = Some(if optional {
        format!("Option<Ref<{inner}>>")
    } else {
        format!("Ref<{inner}>")
    });
    func.canonical_wrap = Some(optional);
    return func;
}

// A slice, array or vector whose elements are canonical carriers by value or by plain reference:
// C would hand over raw elements, so the collection has no lowering until it takes handles.
fn canonical_element_collection(ty: &str) -> bool {
    let inner = ty
        .strip_prefix("&mut [")
        .or_else(|| ty.strip_prefix("&["))
        .or_else(|| ty.strip_prefix('['))
        .and_then(|rest| rest.strip_suffix(']'))
        .map(|rest| rest.split(';').next().unwrap_or(rest))
        .or_else(|| {
            ty.strip_prefix("Vec<")
                .or_else(|| ty.strip_prefix("&Vec<"))
                .or_else(|| ty.strip_prefix("&mut Vec<"))
                .and_then(|rest| rest.strip_suffix('>'))
        });
    let Some(inner) = inner else {
        return false;
    };
    let inner = inner.trim();
    let inner = inner
        .strip_prefix("&mut ")
        .or_else(|| inner.strip_prefix('&'))
        .unwrap_or(inner)
        .trim();
    return is_canonical_ref_carrier(inner);
}

fn wrap_canonical_call(func: &ParsedFn, call: String) -> String {
    return match func.canonical_wrap {
        None => call,
        Some(false) => format!("std::sync::Arc::new(std::sync::RwLock::new({call}))"),
        Some(true) => {
            format!("({call}).map(|value| std::sync::Arc::new(std::sync::RwLock::new(value)))")
        }
    };
}

fn is_ref_only_borrow_type(ty: &str) -> bool {
    if is_canonical_ref_carrier(ty) {
        return true;
    }
    let Some(inventory) = BORROW_PRODUCTION.get() else {
        return false;
    };
    return inventory.ref_producers.contains_key(ty) && !inventory.owned_producers.contains_key(ty);
}

fn generate_dual_produced_report(inventory: &BorrowProduction) -> String {
    let mut out = String::from(
        "type\tref_producers\towned_producers\taffected_borrowers\tborrower_functions\n",
    );
    for ty in inventory
        .ref_producers
        .keys()
        .filter(|ty| inventory.owned_producers.contains_key(*ty))
    {
        let ref_count = inventory.ref_producers[ty].len();
        let owned_count = inventory.owned_producers[ty].len();
        let borrowers = inventory.borrowers.get(ty).cloned().unwrap_or_default();
        write!(out, "{ty}\t{ref_count}\t{owned_count}\t{}", borrowers.len()).unwrap();
        if !borrowers.is_empty() {
            write!(
                out,
                "\t{}",
                borrowers.into_iter().collect::<Vec<_>>().join(",")
            )
            .unwrap();
        }
        out.push('\n');
    }
    return out;
}

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
    all_output.push_str(FFI_C_STR_SUPPORT);
    all_output.push_str(FFI_REF_GROUP_SUPPORT);
    all_output.push_str(generate_node_handle_support());
    all_output.push_str(generate_shape_bounds_context_support());
    all_output.push_str(generate_owned_byte_reader_support());
    let mut boxed_types: BTreeSet<String> = BTreeSet::new();
    boxed_types.insert("FlightNode".to_string());
    boxed_types.insert("FlightNodeArray".to_string());
    let mut vec_ref_handle_specs: BTreeSet<VecRefHandleSpec> = BTreeSet::new();
    let mut seen_names: BTreeSet<String> = BTreeSet::new();
    let mut stats_total_fns = 0usize;
    let mut stats_public_fns = 0usize;
    let mut stats_non_public_fns = 0usize;
    let mut stats_generated_sources = 0usize;
    let mut stats_generated_wrappers = 0usize;
    let mut stats_sdk_contract_decisions = BTreeMap::new();
    let mut stats_public_skips = BTreeMap::new();
    let mut census_decisions = root_census::Decisions::default();
    let mut state_seam_constructors = Vec::new();
    let mut canonical_constructors = Vec::new();
    let mut stats_skipped: std::collections::BTreeMap<String, usize> =
        std::collections::BTreeMap::new();

    let mut enum_definitions: BTreeMap<String, Vec<KnownEnum>> = BTreeMap::new();
    let mut type_definitions = BTreeMap::new();
    let mut callback_definitions = BTreeMap::new();
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
                    && root_census::is_library_path(&e.path())
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
            let file = syn::parse_file(&content).unwrap_or_else(|error| {
                panic!("failed to parse {}: {error}", entry.path().display())
            });
            callback_alias::collect_callback_aliases(&file, dir_name, &mut callback_definitions);
        }
    }
    let callback_aliases =
        callback_alias::check_callback_aliases(&callback_definitions, LOWERED_CALLBACK_ALIASES)
            .unwrap_or_else(|error| panic!("{error}"));
    let _ = CALLBACK_ALIASES.set(callback_aliases);
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
    let _ = CLONE_TYPES.set(collect_clone_types(crates_dir));
    let _ = RECORD_TYPES.set(collect_record_types(crates_dir));
    let (root_type_names, contract_only_type_modules) = collect_type_lanes(crates_dir);
    let _ = ROOT_TYPE_NAMES.set(root_type_names);
    let _ = CONTRACT_ONLY_TYPE_MODULES.set(contract_only_type_modules);
    let _ = NODE_TYPES.set(collect_node_types(crates_dir));
    let borrow_production = collect_borrow_production(crates_dir);
    fs::write(
        out_dir.join("ffi_dual_produced_types.tsv"),
        generate_dual_produced_report(&borrow_production),
    )
    .unwrap();
    let _ = BORROW_PRODUCTION.set(borrow_production);

    let mut host_capability_inventory = Vec::new();
    for dir_name in SCAN_CRATES {
        let src_dir = crates_dir.join(dir_name).join("src");
        if src_dir.exists() {
            host_capability_inventory.extend(collect_host_capability_inventory(
                dir_name, &src_dir, crates_dir,
            ));
        }
    }
    host_capability_inventory
        .sort_by(|a, b| (&a.owner, &a.name, &a.source).cmp(&(&b.owner, &b.name, &b.source)));
    fs::write(
        out_dir.join("host_capability_inventory.txt"),
        generate_host_capability_inventory_report(&host_capability_inventory),
    )
    .unwrap();

    let defined_type_names = collect_crate_defined_type_names(crates_dir);
    let mut signal_inventory = Vec::new();
    for dir_name in SCAN_CRATES {
        let src_dir = crates_dir.join(dir_name).join("src");
        if src_dir.exists() {
            signal_inventory.extend(collect_signal_inventory(
                dir_name,
                &src_dir,
                crates_dir,
                &defined_type_names,
            ));
        }
    }
    signal_inventory.sort_by(|a, b| {
        (&a.owner, &a.source, &a.item, &a.payload).cmp(&(&b.owner, &b.source, &b.item, &b.payload))
    });
    let _ = REF_OWNED_SIGNAL_OWNERS.set(collect_ref_owned_signal_owners(crates_dir));
    let signal_inventory_report = generate_signal_inventory_report(&signal_inventory);
    fs::write(
        out_dir.join("signal_inventory.txt"),
        &signal_inventory_report,
    )
    .unwrap();
    check_signal_inventory(&signal_inventory, &signal_inventory_report);

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
                    census_decisions
                        .skipped
                        .insert(format!("{dir_name}|{}", func.name), skip_reason.clone());
                    *stats_skipped.entry(skip_reason).or_insert(0) += 1;
                } else {
                    let mut emitted = false;
                    let mut emitted_wrappers = 0usize;
                    let mut emitted_names = BTreeSet::new();
                    for (ffi_name, wrapper, boxed_ty) in wrappers {
                        if !seen_names.contains(&ffi_name) {
                            writeln!(crate_output, "{wrapper}").unwrap();
                            emitted_names.insert(ffi_name.clone());
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
                        census_decisions
                            .generated
                            .insert(format!("{dir_name}|{}", func.name), emitted_names);
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
                        census_decisions
                            .skipped
                            .insert(format!("{dir_name}|{}", func.name), skip_reason.clone());
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
                    census_decisions
                        .skipped
                        .insert(format!("{dir_name}|{}", func.name), skip_reason.clone());
                    *stats_skipped.entry(skip_reason).or_insert(0) += 1;
                    continue;
                }
                if let Some((wrapper, boxed_ty)) = generate_ffi_wrapper(func) {
                    writeln!(crate_output, "{wrapper}").unwrap();
                    seen_names.insert(ffi_name.clone());
                    crate_used = true;
                    collect_vec_ref_handle_specs(func, &mut vec_ref_handle_specs);
                    actual_produced_types.extend(owned_producer_types(func));
                    actual_consumed_types.extend(owned_consumed_types(func));
                    stats_generated_sources += 1;
                    stats_generated_wrappers += 1;
                    if func.state_seam {
                        state_seam_constructors.push(ffi_name.clone());
                    }
                    census_decisions.generated.insert(
                        format!("{dir_name}|{}", func.name),
                        BTreeSet::from([ffi_name]),
                    );
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
                    census_decisions
                        .skipped
                        .insert(format!("{dir_name}|{}", func.name), skip_reason.clone());
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

    let declared = generate_declared_instantiations(crates_dir, &mut seen_names);
    writeln!(all_output, "// declared instantiations").unwrap();
    all_output.push_str(&declared.output);
    writeln!(all_output).unwrap();

    // Built-in renderers and presets cross as borrowed handles: one producer per static, and every
    // wrapper that consumes one resolves it against its own family first.
    let builtin_renderers = collect_builtin_renderer_statics(crates_dir);
    let renderer_handles = renderer_handles::generate_renderer_handles(&builtin_renderers);
    for name in &renderer_handles.surface {
        assert!(
            seen_names.insert(name.clone()),
            "{name} collides with an existing FFI symbol"
        );
    }
    writeln!(all_output, "// built-in renderer handles").unwrap();
    all_output.push_str(&renderer_handles.output);
    writeln!(all_output).unwrap();
    let (guarded_materials, guarded_material_registrars) =
        renderer_handles::guard_builtin_material_registrars(&all_output);
    all_output = guarded_materials;
    let (guarded_lookups, guarded_material_lookups) =
        renderer_handles::guard_builtin_material_lookups(&all_output);
    all_output = guarded_lookups;

    // Every wrapper outside the bracket that takes a bracket's state claims it per call and is
    // refused while that state's pass is open.
    let mut bracket_state_wrappers = Vec::new();
    for bracket in render_pass_bracket::BORROW_ERASED_BRACKETS {
        let (guarded, names) =
            render_pass_bracket::guard_bracket_state_wrappers(&all_output, bracket);
        all_output = guarded;
        for teardown in bracket.teardowns {
            assert!(
                names.iter().any(|name| name == teardown),
                "bracket teardown {teardown} must name a generated state wrapper with no return value"
            );
        }
        bracket_state_wrappers.extend(names);
    }
    // A canonical carrier that derives `Default` and has no generated `create_*` gets a default
    // constructor returning its one shared handle, so C can make one to fill field by field.
    let default_types = collect_derive_types(crates_dir, &["Default"]);
    writeln!(all_output, "// canonical carrier constructors").unwrap();
    for carrier in CANONICAL_REF_CARRIERS {
        let snake = to_snake_case(carrier);
        let name = format!("flight_create_{snake}");
        if !default_types.contains(*carrier) || !seen_names.insert(name.clone()) {
            continue;
        }
        let qualified = qualify_type(carrier);
        writeln!(
            all_output,
            "#[doc = \"flight-ffi contract|Creates a {carrier} with every field at its default (every optional field absent) and returns its one shared handle.\"]\n#[doc = \"flight-ffi ownership|owned-return|flight_free_{snake}_ref|flight_sdk::Ref<{qualified}>\"]\n#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn {name}() -> *mut std::ffi::c_void {{\n    let value: {qualified} = Default::default();\n    return Box::into_raw(Box::new(std::sync::Arc::new(std::sync::RwLock::new(value)))) as *mut std::ffi::c_void;\n}}"
        )
        .unwrap();
        canonical_constructors.push(name);
    }
    let (aliased, alias_guarded) =
        out_alias::guard_out_parameter_aliases(&all_output, CLONE_TYPES.get().unwrap());
    all_output = aliased;
    writeln!(all_output, "// registry tokens").unwrap();
    all_output.push_str(&registry_tokens::generate_registry_token_support());
    let brackets = generate_borrow_erased_brackets(crates_dir, &mut seen_names);
    writeln!(all_output, "// borrow-erased brackets").unwrap();
    all_output.push_str(&brackets.output);
    writeln!(all_output).unwrap();

    // Each enabled host feature scans its crate exactly and lowers it into a guarded section that
    // is appended last, so the header can wrap it whole. A disabled feature contributes nothing.
    let host_sections = generate_host_sections(crates_dir);
    // A host feature's lent carriers are handles, never pointers: every SDK wrapper that takes one
    // resolves it against the live host before use.
    let mut lent_carrier_consumers = Vec::new();
    if !host_sections.is_empty() {
        let (guarded, names) = host_seam::guard_lent_carrier_consumers(&all_output);
        all_output = guarded;
        lent_carrier_consumers = names;
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
    let mut wgpu_policy_names = BTreeSet::new();
    for (name, category, reason) in WGPU_BACKEND_POLICY_SKIP_FNS {
        assert!(
            wgpu_policy_names.insert(*name),
            "duplicate WGPU policy entry"
        );
        assert!(
            !reason.trim().is_empty(),
            "{name} needs a WGPU policy reason"
        );
        assert_eq!(
            stats_public_skips.get(*name).map(String::as_str),
            Some(format!("{category}({name}: {reason})").as_str()),
            "{name} must remain an exact public {category} decision"
        );
    }
    for bracket in render_pass_bracket::BORROW_ERASED_BRACKETS {
        for (function, ffi_name) in [
            (bracket.begin, bracket.ffi_begin),
            (bracket.end, bracket.ffi_end),
        ] {
            census_decisions.generated.insert(
                format!("{}|{function}", bracket.crate_dir),
                BTreeSet::from([ffi_name.to_string()]),
            );
        }
        for consumer in bracket.consumers {
            census_decisions.generated.insert(
                format!("{}|{}", consumer.crate_dir, consumer.function),
                BTreeSet::from([consumer.ffi_name.to_string()]),
            );
        }
    }
    for entry in DECLARED_INSTANTIATIONS {
        census_decisions
            .generated
            .entry(format!("{}|{}", entry.crate_dir, entry.function))
            .or_default()
            .insert(entry.ffi_name.to_string());
    }
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
        "FFI declared instantiations: {} wrappers, {} carriers",
        DECLARED_INSTANTIATIONS.len(),
        DECLARED_CARRIERS.len()
    )
    .unwrap();
    for line in &declared.report {
        writeln!(stats_file, "  declared: {line}").unwrap();
    }
    writeln!(
        stats_file,
        "FFI borrow-erased brackets: {} brackets, {} consumers",
        render_pass_bracket::BORROW_ERASED_BRACKETS.len(),
        render_pass_bracket::BORROW_ERASED_BRACKETS
            .iter()
            .map(|bracket| bracket.consumers.len())
            .sum::<usize>()
    )
    .unwrap();
    for name in &bracket_state_wrappers {
        writeln!(stats_file, "  bracket state claim: {name}").unwrap();
    }
    writeln!(
        stats_file,
        "FFI claim-guarded carriers: {}",
        claim_guard::CLAIM_GUARDED_CARRIERS.join(", ")
    )
    .unwrap();
    for name in &canonical_constructors {
        writeln!(stats_file, "  canonical constructor: {name}").unwrap();
    }
    writeln!(
        stats_file,
        "FFI state seam constructors: {}",
        state_seam_constructors.len()
    )
    .unwrap();
    for name in &state_seam_constructors {
        writeln!(stats_file, "  state seam: {name}").unwrap();
    }
    writeln!(
        stats_file,
        "FFI out-parameter alias guards: {} wrappers",
        alias_guarded.len()
    )
    .unwrap();
    for name in &alias_guarded {
        writeln!(stats_file, "  alias guard: {name}").unwrap();
    }
    for line in &brackets.report {
        writeln!(stats_file, "  bracket: {line}").unwrap();
    }
    for (feature, section) in &host_sections {
        writeln!(
            stats_file,
            "FFI host feature {}: {} crate functions lowered from {}",
            feature.feature,
            feature.lowerings.len(),
            feature.crate_dir
        )
        .unwrap();
        for line in &section.report {
            writeln!(stats_file, "  host: {line}").unwrap();
        }
    }
    for name in &lent_carrier_consumers {
        writeln!(stats_file, "  host lent carrier consumer: {name}").unwrap();
    }
    writeln!(
        stats_file,
        "FFI built-in renderer handles: {} statics, {} producers",
        builtin_renderers.len(),
        builtin_renderers.len()
    )
    .unwrap();
    for line in &renderer_handles.report {
        writeln!(stats_file, "  renderer handle: {line}").unwrap();
    }
    for name in &guarded_material_registrars {
        writeln!(stats_file, "  renderer handle consumer: {name}").unwrap();
    }
    for name in &guarded_material_lookups {
        writeln!(stats_file, "  renderer kind lookup: {name}").unwrap();
    }
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
    all_output.push_str(generate_signal_connection_support());
    all_output.push_str(&generate_signal_connect_wrappers());
    all_output.push_str(&generate_signal_field_producers(&signal_inventory));
    boxed_types.extend(REGISTERED_HANDLE_REFS.iter().map(|ty| ty.to_string()));
    all_output.push_str(generate_storage_set_items_result_support());

    // `seen_names` is the exact generated SDK-wrapper surface (including field accessors). The
    // support functions appended below participate in the carrier graph, but are not themselves
    // census rows in the committed usability baseline.
    let mut reachability_surface = seen_names.clone();
    for (_, section) in &host_sections {
        reachability_surface.extend(section.surface.iter().cloned());
    }

    writeln!(all_output, "// free functions").unwrap();
    writeln!(
        all_output,
        "#[doc = \"flight-ffi contract|Releases a non-NULL owned string returned by flight-ffi. Pass each returned string exactly once; NULL is a no-op.\"]\n#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn flight_free_string(ptr: *mut std::ffi::c_char) {{\n    if !ptr.is_null() {{\n        unsafe {{ drop(std::ffi::CString::from_raw(ptr)); }}\n    }}\n}}"
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
        let contract = if boxed_ty == "FlightNode" {
            "#[doc = \"flight-ffi contract|Releases only this owned FlightNode handle and its shared reference. The node remains alive while its graph or another handle retains it. NULL is a no-op.\"]\n"
        } else if boxed_ty == "FlightNodeArray" {
            "#[doc = \"flight-ffi contract|Releases this owned FlightNodeArray and its stored shared references. Handles and graph references outside the array remain valid. NULL is a no-op.\"]\n"
        } else {
            ""
        };
        writeln!(
            all_output,
            "{contract}#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn flight_free_{snake}(ptr: *mut {boxed_ty}) {{\n    if !ptr.is_null() {{\n        unsafe {{ drop(Box::from_raw(ptr)); }}\n    }}\n}}"
        )
        .unwrap();
    }

    for (_, section) in &host_sections {
        all_output.push_str(&section.output);
    }

    let (registered, registry_guarded) = registry_carrier::guard_registry_carriers(&all_output);
    all_output = registered;
    all_output.push_str(&registry_carrier::generate_support());
    for carrier in registry_carrier::REGISTRY_CARRIERS {
        all_output.push_str(&registry_tokens::family_tag_const(carrier.tag_const));
    }
    let raw_registry_reads = registry_carrier::find_raw_registry_reads(&all_output);
    assert!(
        raw_registry_reads.is_empty(),
        "registry carriers must be resolved through their registry: {raw_registry_reads:?}"
    );
    let (claimed, claim_guarded) = claim_guard::guard_claimed_carriers(&all_output);
    all_output = claimed;
    all_output.push_str(claim_guard::CLAIM_SUPPORT);
    // An owned renderer copy's free refuses every built-in's address, so a borrowed handle forced
    // through it is never released.
    let (guarded_frees, owned_renderer_frees) =
        renderer_handles::guard_owned_renderer_frees(&all_output);
    all_output = guarded_frees;
    assert!(
        !owned_renderer_frees.is_empty(),
        "no owned renderer free to guard: the built-in free guard is unreachable"
    );

    let caller_producible = collect_caller_producible_value_types(crates_dir);
    let reachability_aliases = collect_reachability_aliases();
    fs::write(out_dir.join("ffi_generated.rs"), &all_output).unwrap();
    let mixed =
        root_census::find_mixed_canonical_representations(&all_output, CANONICAL_REF_CARRIERS);
    assert!(
        mixed.is_empty(),
        "canonical carriers must cross C only as their one Ref handle; these wrappers mix representations: {mixed:?}"
    );
    native_bindings::emit(
        &all_output,
        &out_dir,
        &caller_producible,
        &reachability_aliases,
        &reachability_surface,
    );
    fs::write(out_dir.join("ffi_generated.rs"), all_output).unwrap();
    let reachability_baseline =
        fs::read_to_string(out_dir.join("ffi_reachability_baseline.tsv")).unwrap();
    let unreachable_wrappers: BTreeSet<String> = reachability_baseline
        .lines()
        .filter_map(|line| line.strip_prefix("unreachable|"))
        .filter_map(|rest| rest.split('|').next())
        .map(str::to_string)
        .collect();
    let packages_dir = crates_dir.parent().unwrap().join("packages");
    let by_design_path = manifest_dir.join("tests/ffi_root_census_by_design.tsv");
    println!("cargo::rerun-if-changed={}", by_design_path.display());
    let by_design = root_census::parse_by_design(&fs::read_to_string(&by_design_path).unwrap())
        .unwrap_or_else(|error| panic!("{error}"));
    let census_rows = root_census::classify(
        &packages_dir,
        crates_dir,
        SCAN_CRATES,
        &census_decisions,
        &unreachable_wrappers,
        &by_design,
    );
    let node_type_names: BTreeSet<String> = NODE_TYPES.get().unwrap().keys().cloned().collect();
    let node_data_fields =
        root_census::collect_node_data_fields(crates_dir, SCAN_CRATES, &node_type_names);
    let mut census_rows = census_rows;
    census_rows.extend(root_census::classify_node_data_fields(
        &node_data_fields,
        &reachability_surface,
        &unreachable_wrappers,
    ));
    census_rows.sort();
    root_census::check_by_design_coverage(&census_rows, &by_design)
        .unwrap_or_else(|error| panic!("{error}"));
    fs::write(
        out_dir.join("ffi_root_census.tsv"),
        root_census::render_census(&census_rows),
    )
    .unwrap();
    fs::write(
        out_dir.join("ffi_root_census_residual.tsv"),
        root_census::render_residual(&census_rows),
    )
    .unwrap();
    let (census_generated, census_by_design, census_actionable) =
        root_census::count_by_status(&census_rows);
    writeln!(
        stats_file,
        "FFI root census: {} TypeScript root values, {census_generated} generated, {census_by_design} by-design, {census_actionable} actionable",
        census_rows.len()
    )
    .unwrap();
    for name in &claim_guarded {
        writeln!(stats_file, "  claim guard: {name}").unwrap();
    }
    for name in &registry_guarded {
        writeln!(stats_file, "  registry carrier: {name}").unwrap();
    }
    fs::write(out_dir.join("ffi_stats.txt"), &stats_file).unwrap();

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
            // Offsets describe scalar layout only; optional fields have no C layout.
            if !s.fields.iter().any(|field| is_scalar(&field.ty)) {
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
            for field in s.fields.iter().filter(|field| is_scalar(&field.ty)) {
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
    // A non-public zero-argument `create_*` that is the only producer of a carrier public
    // functions borrow: the explicit-state seam Rust adds where TypeScript keeps module state.
    state_seam: bool,
    // An owned canonical-carrier return rewritten to its `Ref` (`Some(optional)`): the call's value
    // is wrapped into a fresh shared handle, so C only ever holds the one carrier.
    canonical_wrap: Option<bool>,
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

#[derive(Debug)]
struct HostCapabilityInventory {
    owner: String,
    source: PathBuf,
    name: String,
    public_reachable: bool,
    fields: Vec<HostCapabilityInventoryField>,
}

#[derive(Debug)]
struct HostCapabilityInventoryField {
    name: String,
    ty: String,
    callback: Option<HostCapabilityCallback>,
}

#[derive(Debug)]
struct HostCapabilityCallback {
    optional: bool,
    signature: String,
}

// One `Signal<T>` occurrence on the public perimeter (Item C): a pub field of a root-exported
// struct, or a parameter or return of a TS-public function. `declared` is the full type the signal
// is nested in (`Signal<T>`, `Ref<Signal<T>>`, `Option<Ref<Signal<T>>>`, a callback return, ...).
struct SignalInventoryEntry {
    owner: String,
    source: PathBuf,
    item: String,
    declared: String,
    payload: String,
    // The owning struct reaches the crate root only through `pub use <module>::*`.
    glob_export: bool,
    // The defining crate of every nominal type the payload names.
    identities: BTreeSet<signal_identity::PayloadIdentity>,
}

// These leaves were briefly emitted during Task S. Capability construction is withdrawn from the
// alpha ABI; the names remain only so the structural inventory records that decision explicitly.
const WITHDRAWN_HOST_CAPABILITY_PRIORITIES: &[&str] = &[
    "HostCanvasCapability",
    "HostDeviceCapability",
    "HostGlCapability",
    "HostInputIngressCapability",
    "HostLifecycleCapability",
    "HostScreenChangeCapability",
    "HostScreenDetailsCapability",
    "HostScreenPermissionChangeCapability",
    "HostScreenQueryCapability",
    "HostSurfaceDisplayCapability",
    "HostSurfaceResizeCapability",
    "HostTimerCapability",
    "HostWgpuCapability",
    "HostWindowAppearanceCapability",
    "HostWindowAttachCapability",
    "HostWindowAttentionCapability",
    "HostWindowContentProtectionCapability",
    "HostWindowFocusCapability",
    "HostWindowFullscreenCapability",
    "HostWindowGeometryCapability",
    "HostWindowHierarchyCapability",
    "HostWindowLifecycleCapability",
    "HostWindowProgressCapability",
    "HostWindowShadowCapability",
    "HostWindowShellCapability",
    "HostWindowSizeConstraintsCapability",
    "HostWindowStateCapability",
    "HostWindowVisibilityCapability",
    "HostWindowZOrderCapability",
];

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
    let contract_path = src_dir.join("contract.rs");
    let contract_names = if contract_path.exists() {
        root_census::collect_module_function_exports(src_dir, &contract_path)
    } else {
        BTreeSet::new()
    };
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
        .filter(|e| root_census::is_library_path(&e.path()))
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
            // A TypeScript-root function its crate root does not re-export is still public: the
            // SDK reaches it through the crate's contract module, which the census requires.
            let contract_only = !exported_names.contains(&f.name)
                && ts_exports.public.contains(&export_key)
                && contract_names.contains(&f.name);
            if (!f.is_async
                && (exported_names.contains(&f.name)
                    || ts_exports.sdk_public.contains(&export_key)
                    || contract_only))
                || internal_sdk_export
            {
                f.lacks_public_export =
                    internal_sdk_export || !ts_exports.public.contains(&export_key);
                f.sdk_contract_export = ts_exports.sdk_public.contains(&export_key);
                f.sdk_contract_module =
                    (f.sdk_contract_export || contract_only).then(|| package_module_name(src_dir));
                fns.push(f);
            } else if !f.is_async
                && !ts_exports.public.contains(&export_key)
                && (exported_names.contains(&f.name) || contract_names.contains(&f.name))
                && is_state_seam_constructor(&f)
            {
                f.lacks_public_export = true;
                f.state_seam = true;
                f.sdk_contract_module =
                    (!exported_names.contains(&f.name)).then(|| package_module_name(src_dir));
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
    _ts_exports: &BTreeSet<String>,
) -> BTreeSet<String> {
    return root_census::collect_module_function_exports(src_dir, lib_path);
}

fn parse_pub_fns(content: &str, out: &mut Vec<ParsedFn>) {
    for sig in collect_pub_fn_signatures(content) {
        if let Some(parsed) = parse_fn_signature(&sig) {
            out.push(parsed);
        }
    }
}

// The source with every comment and the contents of every string and char literal blanked to
// spaces, line breaks kept, so brace counting sees only code. Lifetimes (`'a`) are left intact.
fn mask_literals_and_comments(content: &str) -> String {
    let chars: Vec<char> = content.chars().collect();
    let mut out = String::with_capacity(content.len());
    let blank = |c: char| if c == '\n' { '\n' } else { ' ' };
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        let next = chars.get(i + 1).copied();
        if c == '/' && next == Some('/') {
            while i < chars.len() && chars[i] != '\n' {
                out.push(' ');
                i += 1;
            }
            continue;
        }
        if c == '/' && next == Some('*') {
            let mut depth = 0;
            while i < chars.len() {
                if chars[i] == '/' && chars.get(i + 1) == Some(&'*') {
                    depth += 1;
                    out.push_str("  ");
                    i += 2;
                } else if chars[i] == '*' && chars.get(i + 1) == Some(&'/') {
                    depth -= 1;
                    out.push_str("  ");
                    i += 2;
                    if depth == 0 {
                        break;
                    }
                } else {
                    out.push(blank(chars[i]));
                    i += 1;
                }
            }
            continue;
        }
        let raw_start = (c == 'r' || (c == 'b' && next == Some('r')))
            && (i == 0 || !(chars[i - 1].is_alphanumeric() || chars[i - 1] == '_'));
        if raw_start {
            let mut j = i + if c == 'b' { 2 } else { 1 };
            let mut hashes = 0;
            while chars.get(j) == Some(&'#') {
                hashes += 1;
                j += 1;
            }
            if chars.get(j) == Some(&'"') {
                for k in i..=j {
                    out.push(chars[k]);
                }
                i = j + 1;
                while i < chars.len() {
                    if chars[i] == '"' && (0..hashes).all(|h| chars.get(i + 1 + h) == Some(&'#')) {
                        out.push('"');
                        for _ in 0..hashes {
                            out.push('#');
                        }
                        i += 1 + hashes;
                        break;
                    }
                    out.push(blank(chars[i]));
                    i += 1;
                }
                continue;
            }
        }
        if c == '"' {
            out.push('"');
            i += 1;
            while i < chars.len() && chars[i] != '"' {
                if chars[i] == '\\' {
                    out.push(' ');
                    i += 1;
                }
                if i < chars.len() {
                    out.push(blank(chars[i]));
                    i += 1;
                }
            }
            if i < chars.len() {
                out.push('"');
                i += 1;
            }
            continue;
        }
        if c == '\'' {
            let char_literal_end = if next == Some('\\') {
                (i + 2..chars.len().min(i + 12)).find(|&k| chars[k] == '\'')
            } else if chars.get(i + 2) == Some(&'\'') {
                Some(i + 2)
            } else {
                None
            };
            if let Some(end) = char_literal_end {
                out.push('\'');
                for _ in i + 1..end {
                    out.push(' ');
                }
                out.push('\'');
                i = end + 1;
                continue;
            }
        }
        out.push(c);
        i += 1;
    }
    return out;
}

// Top-level `pub fn` / `pub async fn` signatures, each joined onto one line up to its opening brace.
fn collect_pub_fn_signatures(content: &str) -> Vec<String> {
    let mut out = Vec::new();
    let masked = mask_literals_and_comments(content);
    let lines: Vec<&str> = masked.lines().collect();
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
        out.push(sig);
    }
    return out;
}

struct DeclaredOutput {
    output: String,
    report: Vec<String>,
}

// Emits every DECLARED_INSTANTIATIONS wrapper and DECLARED_CARRIERS create/free pair, in table
// order. Each entry must resolve, lower through the ordinary wrapper generator, and claim an unused
// symbol; any failure is a build error, so the table can never silently shrink.
fn generate_declared_instantiations(
    crates_dir: &Path,
    seen_names: &mut BTreeSet<String>,
) -> DeclaredOutput {
    let mut output = String::new();
    let mut report = Vec::new();
    for entry in DECLARED_INSTANTIATIONS {
        let func = instantiate_declared_fn(crates_dir, entry);
        let (wrapper, _) = generate_ffi_wrapper(&func).unwrap_or_else(|| {
            panic!(
                "declared instantiation {} must lower to a wrapper",
                entry.ffi_name
            )
        });
        let generic_symbol = format!("fn flight_{}(", entry.function);
        assert_eq!(
            wrapper.matches(&generic_symbol).count(),
            1,
            "{} must emit exactly one wrapper symbol",
            entry.ffi_name
        );
        let generic_call = format!("{QUALIFIER}::{}(", entry.function);
        assert_eq!(
            wrapper.matches(&generic_call).count(),
            1,
            "{} must call its generic function exactly once",
            entry.ffi_name
        );
        let turbofish: Vec<String> = entry
            .type_args
            .iter()
            .map(|(_, concrete)| qualify_type(concrete))
            .collect();
        let mut wrapper = wrapper
            .replace(&generic_symbol, &format!("fn {}(", entry.ffi_name))
            .replace(
                &generic_call,
                &format!(
                    "{QUALIFIER}::{}::<{}>(",
                    entry.function,
                    turbofish.join(", ")
                ),
            );
        // The renderer of a node-renderer registrar is a borrowed built-in handle, resolved
        // against its backend's statics before use, never an erased pointer read on trust.
        if entry.function == "register_node_renderer" {
            wrapper =
                renderer_handles::guard_node_renderer_instantiation(&wrapper, entry.type_args[0].1);
        }
        assert!(
            seen_names.insert(entry.ffi_name.to_string()),
            "{} collides with an existing FFI symbol",
            entry.ffi_name
        );
        writeln!(output, "{wrapper}").unwrap();
        let bindings: Vec<String> = entry
            .type_args
            .iter()
            .map(|(param, concrete)| format!("{param} = {concrete}"))
            .collect();
        report.push(format!(
            "{} = {}::{}<{}>",
            entry.ffi_name,
            entry.crate_dir,
            entry.function,
            bindings.join(", ")
        ));
    }
    for carrier in DECLARED_CARRIERS {
        let arguments: Vec<String> = carrier
            .type_args
            .iter()
            .map(|ty| qualify_type(ty))
            .collect();
        let qualified = format!(
            "{}<{}>",
            qualify_type(carrier.container),
            arguments.join(", ")
        );
        for name in [carrier.create_name, carrier.free_name] {
            assert!(
                seen_names.insert(name.to_string()),
                "{name} collides with an existing FFI symbol"
            );
        }
        writeln!(
            output,
            "#[doc = \"flight-ffi ownership|owned-return|{free}|{qualified}\"]\n#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn {create}() -> *mut std::ffi::c_void {{\n    let carrier: {qualified} = Default::default();\n    return Box::into_raw(Box::new(carrier)) as *mut std::ffi::c_void;\n}}\n#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn {free}(ptr: *mut {qualified}) {{\n    if !ptr.is_null() {{\n        unsafe {{ drop(Box::from_raw(ptr)); }}\n    }}\n}}",
            create = carrier.create_name,
            free = carrier.free_name,
        )
        .unwrap();
        report.push(format!(
            "{} / {} = {}<{}>",
            carrier.create_name,
            carrier.free_name,
            carrier.container,
            carrier.type_args.join(", ")
        ));
    }
    return DeclaredOutput { output, report };
}

// Emits every BORROW_ERASED_BRACKETS entry: its handle support, begin, end and free, then one bool
// wrapper per consumer. Each begin, end and consumer signature must match the table exactly and be
// TypeScript-public, and every symbol must be unused; any drift is a build error.
fn generate_borrow_erased_brackets(
    crates_dir: &Path,
    seen_names: &mut BTreeSet<String>,
) -> DeclaredOutput {
    let mut output = String::new();
    let mut report = Vec::new();
    for bracket in render_pass_bracket::BORROW_ERASED_BRACKETS {
        let signatures = collect_bracket_crate_signatures(crates_dir, bracket.crate_dir);
        for (function, expected) in [
            (bracket.begin, bracket.begin_signature),
            (bracket.end, bracket.end_signature),
        ] {
            render_pass_bracket::check_bracket_signature(&signatures, function, expected)
                .unwrap_or_else(|error| panic!("{error}"));
            check_bracket_public(crates_dir, bracket.crate_dir, function);
        }
        let begin = parse_fn_signature(&format!(
            "{} {{",
            bracket.begin_signature.replacen("<'a>", "", 1)
        ))
        .expect("bracket begin signature parses");
        let target = lower_bracket_param(&begin.params[1], "return std::ptr::null_mut();");
        let clear = lower_bracket_param(&begin.params[2], "return std::ptr::null_mut();");
        output.push_str(&render_pass_bracket::generate_bracket_support(
            bracket, &target, &clear,
        ));
        for name in [bracket.ffi_begin, bracket.ffi_end, bracket.ffi_free] {
            assert!(
                seen_names.insert(name.to_string()),
                "{name} collides with an existing FFI symbol"
            );
        }
        report.push(format!(
            "{} / {} / {} = {}::{}..{} over {}",
            bracket.ffi_begin,
            bracket.ffi_end,
            bracket.ffi_free,
            bracket.crate_dir,
            bracket.begin,
            bracket.end,
            bracket.handle
        ));
        for consumer in bracket.consumers {
            let signatures = collect_bracket_crate_signatures(crates_dir, consumer.crate_dir);
            render_pass_bracket::check_bracket_signature(
                &signatures,
                consumer.function,
                consumer.signature,
            )
            .unwrap_or_else(|error| panic!("{error}"));
            check_bracket_public(crates_dir, consumer.crate_dir, consumer.function);
            let func = parse_fn_signature(&format!("{} {{", consumer.signature))
                .expect("bracket consumer signature parses");
            let params: Vec<_> = func.params[1..]
                .iter()
                .map(|param| lower_bracket_param(param, "return false;"))
                .collect();
            output.push_str(&render_pass_bracket::generate_bracket_consumer(
                bracket, consumer, &params,
            ));
            assert!(
                seen_names.insert(consumer.ffi_name.to_string()),
                "{} collides with an existing FFI symbol",
                consumer.ffi_name
            );
            report.push(format!(
                "{} = {}::{} over {}",
                consumer.ffi_name, consumer.crate_dir, consumer.function, bracket.handle
            ));
        }
        render_pass_bracket::check_bracket_free_link(&output, bracket)
            .unwrap_or_else(|error| panic!("{error}"));
    }
    return DeclaredOutput { output, report };
}

// Every top-level `pub fn` signature in a crate's non-test source files.
fn collect_bracket_crate_signatures(crates_dir: &Path, crate_dir: &str) -> Vec<String> {
    let src_dir = crates_dir.join(crate_dir).join("src");
    println!("cargo::rerun-if-changed={}", src_dir.display());
    let mut files: Vec<_> = fs::read_dir(&src_dir)
        .unwrap()
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|path| {
            path.extension().is_some_and(|ext| ext == "rs") && root_census::is_library_path(path)
        })
        .collect();
    files.sort();
    let mut signatures = Vec::new();
    for path in files {
        signatures.extend(collect_pub_fn_signatures(
            &fs::read_to_string(&path).unwrap(),
        ));
    }
    return signatures;
}

// A bracket function must be TypeScript-public in its crate, like any generated wrapper.
fn check_bracket_public(crates_dir: &Path, crate_dir: &str, function: &str) {
    let ts_exports = collect_ts_exports(&crates_dir.join(crate_dir).join("src"));
    assert!(
        ts_exports
            .public
            .contains(&public_perimeter::get_export_key(function)),
        "borrow-erased bracket function {function} must be TypeScript-public in {crate_dir}"
    );
}

// One non-handle bracket parameter through the ordinary parameter lowering. A pointer lowered from
// an `Option` may be NULL; every other pointer is required. A binding that rejects its handle (a
// node handle without the required view) returns `invalid_return`, the wrapper's failure result.
fn lower_bracket_param(param: &Param, invalid_return: &str) -> render_pass_bracket::LoweredParam {
    let mapped = map_param_to_ffi(&param.name, &param.ty).unwrap_or_else(|| {
        panic!(
            "borrow-erased bracket parameter {}: {} must lower ordinarily",
            param.name, param.ty
        )
    });
    let optional = strip_crate_paths(&strip_lifetimes(&resolve_type_alias(param.ty.trim())))
        .starts_with("Option<");
    let mut required = Vec::new();
    let mut nullable = Vec::new();
    for (name, ty) in &mapped.ffi_params {
        if ty.starts_with('*') {
            if optional {
                nullable.push(name.clone());
            } else {
                required.push(name.clone());
            }
        }
    }
    let bindings = mapped
        .bindings
        .iter()
        .map(|binding| binding.replace(INVALID_NODE_RETURN, invalid_return))
        .collect();
    return render_pass_bracket::LoweredParam {
        ffi_params: mapped.ffi_params,
        bindings,
        call_expr: mapped.call_expr,
        required,
        nullable,
    };
}

// Reads the entry's generic signature from its crate and substitutes each bound type parameter,
// producing the concrete signature the ordinary generator lowers. The declared bindings must be
// exactly the function's type parameters, so an instantiation can never leave one unbound.
fn instantiate_declared_fn(crates_dir: &Path, entry: &DeclaredInstantiation) -> ParsedFn {
    let src_dir = crates_dir.join(entry.crate_dir).join("src");
    let prefix = format!("pub fn {}<", entry.function);
    let mut matches = Vec::new();
    let mut files: Vec<_> = fs::read_dir(&src_dir)
        .unwrap()
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|path| {
            path.extension().is_some_and(|ext| ext == "rs") && root_census::is_library_path(path)
        })
        .collect();
    files.sort();
    for path in files {
        let content = fs::read_to_string(&path).unwrap();
        matches.extend(
            collect_pub_fn_signatures(&content)
                .into_iter()
                .filter(|sig| sig.trim().starts_with(&prefix)),
        );
    }
    assert_eq!(
        matches.len(),
        1,
        "{} must name exactly one generic `{}` in {}",
        entry.ffi_name,
        entry.function,
        entry.crate_dir
    );
    let sig = matches.remove(0);
    let after_name = &sig.trim()[prefix.len() - 1..];
    let params_start = after_name.find('(').unwrap();
    let generics_end = after_name[..params_start].rfind('>').unwrap();
    let declared: Vec<&str> = after_name[1..generics_end]
        .split(',')
        .map(|generic| generic.split(':').next().unwrap().trim())
        .collect();
    let bound: Vec<&str> = entry.type_args.iter().map(|(param, _)| *param).collect();
    assert_eq!(
        declared, bound,
        "{} must bind exactly the type parameters of {}",
        entry.ffi_name, entry.function
    );
    let mut rest = after_name[params_start..].to_string();
    for (param, concrete) in entry.type_args {
        rest = replace_type_parameter(&rest, param, concrete);
    }
    let concrete_sig = format!("pub fn {}{rest}", entry.function);
    let mut func = parse_fn_signature(&concrete_sig)
        .unwrap_or_else(|| panic!("{} must parse once instantiated", entry.ffi_name));
    let ts_exports = collect_ts_exports(&src_dir);
    func.lacks_public_export = !ts_exports
        .public
        .contains(&public_perimeter::get_export_key(&func.name));
    assert!(
        !func.lacks_public_export,
        "{} must instantiate a TypeScript-public function",
        entry.ffi_name
    );
    return func;
}

// Replaces whole-identifier occurrences of a type parameter, leaving longer identifiers intact.
fn replace_type_parameter(text: &str, param: &str, concrete: &str) -> String {
    let mut out = String::new();
    let mut identifier = String::new();
    for c in text.chars().chain(std::iter::once(' ')) {
        if c.is_alphanumeric() || c == '_' {
            identifier.push(c);
            continue;
        }
        if !identifier.is_empty() {
            out.push_str(if identifier == param {
                concrete
            } else {
                &identifier
            });
            identifier.clear();
        }
        out.push(c);
    }
    out.pop();
    return out;
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
        state_seam: false,
        canonical_wrap: None,
    })
    .map(normalize_canonical_return)
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

    let mut structs = Vec::new();
    let mut entries: Vec<_> = fs::read_dir(src_dir)
        .unwrap()
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path().extension().is_some_and(|ext| ext == "rs")
                && root_census::is_library_path(&e.path())
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
            if exported_types.contains(&s.name)
                || matches!(
                    s.name.as_str(),
                    "NodeFields" | "Node2DFields" | "Node3DFields"
                )
            {
                structs.push(s);
            }
        }
    }
    structs
}

fn collect_exported_type_names(lib_path: &Path, src_dir: &Path) -> BTreeSet<String> {
    return root_census::collect_module_exports(src_dir, lib_path).types;
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
    let Ok(file) = syn::parse_file(content) else {
        return;
    };
    for item in &file.items {
        let syn::Item::Struct(value) = item else {
            continue;
        };
        if !matches!(value.vis, syn::Visibility::Public(_)) || !value.generics.params.is_empty() {
            continue;
        }
        let syn::Fields::Named(named) = &value.fields else {
            continue;
        };
        let fields = named
            .named
            .iter()
            .filter(|field| matches!(field.vis, syn::Visibility::Public(_)))
            .filter_map(|field| {
                let name = field.ident.as_ref()?.to_string();
                let ty = normalize_token_type(&field.ty.to_token_stream().to_string());
                (is_scalar(&ty) || ty.starts_with("Option<")).then_some(StructField { name, ty })
            })
            .collect();
        out.push(ParsedStruct {
            name: value.ident.to_string(),
            fields,
        });
    }
}

// A type's token text in source spelling: `Option < Vec < f32 > >` -> `Option<Vec<f32>>`.
fn normalize_token_type(tokens: &str) -> String {
    let mut out = String::new();
    for word in tokens.split_whitespace() {
        let joins = out.ends_with(|c: char| c.is_alphanumeric() || c == '_' || c == '\'')
            && word.starts_with(|c: char| c.is_alphanumeric() || c == '_');
        if joins {
            out.push(' ');
        }
        out.push_str(word);
    }
    return out.replace(",", ", ");
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
    if is_scalar(&ty) || ty.starts_with("Option<") {
        Some(StructField { name, ty })
    } else {
        None
    }
}

fn collect_host_capability_inventory(
    owner: &str,
    src_dir: &Path,
    crates_dir: &Path,
) -> Vec<HostCapabilityInventory> {
    let lib_path = src_dir.join("lib.rs");
    let public_types = if lib_path.exists() {
        collect_exported_type_names(&lib_path, src_dir)
    } else {
        BTreeSet::new()
    };
    let sources = collect_rust_source_files(src_dir);
    let mut aliases = BTreeMap::new();
    let mut parsed_files = Vec::new();
    for source in sources {
        let content = fs::read_to_string(&source).unwrap();
        let file = syn::parse_file(&content)
            .unwrap_or_else(|error| panic!("failed to parse {}: {error}", source.display()));
        for item in &file.items {
            if let syn::Item::Type(alias) = item
                && alias.generics.params.is_empty()
            {
                aliases.insert(alias.ident.to_string(), (*alias.ty).clone());
            }
        }
        parsed_files.push((source, file));
    }

    let mut inventory = Vec::new();
    for (source, file) in parsed_files {
        for item in file.items {
            let syn::Item::Struct(item) = item else {
                continue;
            };
            let name = item.ident.to_string();
            if !name.starts_with("Host") || !name.contains("Capabilit") {
                continue;
            }
            let fields = match item.fields {
                syn::Fields::Named(fields) => fields.named,
                syn::Fields::Unnamed(_) | syn::Fields::Unit => continue,
            };
            let fields = fields
                .into_iter()
                .filter_map(|field| {
                    let name = field.ident?.to_string();
                    let callback = get_host_capability_callback(&field.ty, &aliases, false, 0);
                    Some(HostCapabilityInventoryField {
                        name,
                        ty: rust_type_text(&field.ty),
                        callback,
                    })
                })
                .collect();
            inventory.push(HostCapabilityInventory {
                owner: owner.to_string(),
                source: source
                    .strip_prefix(crates_dir)
                    .unwrap_or(&source)
                    .to_path_buf(),
                public_reachable: public_types.contains(&name),
                name,
                fields,
            });
        }
    }
    inventory
}

// The sections of every enabled host feature, after checking that each lowers exactly its crate's
// public functions.
fn generate_host_sections(
    crates_dir: &Path,
) -> Vec<(&'static host_seam::HostFeature, host_seam::HostSection)> {
    let mut out = Vec::new();
    for feature in host_seam::HOST_FEATURES {
        if !host_seam::is_host_feature_enabled(feature) {
            continue;
        }
        let src_dir = crates_dir.join(feature.crate_dir).join("src");
        println!("cargo::rerun-if-changed={}", src_dir.display());
        let sources: Vec<String> = collect_rust_source_files(&src_dir)
            .iter()
            .map(|path| fs::read_to_string(path).unwrap())
            .collect();
        let exports = host_seam::collect_host_exports(&sources);
        host_seam::check_host_scan_membership(feature, &exports)
            .unwrap_or_else(|error| panic!("{error}"));
        let mut section = host_seam::generate_host_section(feature);
        let tags: String = [
            "FFI_HEADLESS_HOST_TOKEN_TAG",
            "FFI_HEADLESS_DEVICE_TOKEN_TAG",
            "FFI_HEADLESS_CAPABILITY_TOKEN_TAG",
            "FFI_HEADLESS_SURFACE_TOKEN_TAG",
            "FFI_HEADLESS_RENDER_TARGET_TOKEN_TAG",
        ]
        .iter()
        .map(|name| registry_tokens::family_tag_const(name))
        .collect();
        section.output = tags + &section.output;
        out.push((feature, section));
    }
    return out;
}

// Every `pub static` built-in renderer and preset of the crates whose renderers C can borrow.
fn collect_builtin_renderer_statics(crates_dir: &Path) -> Vec<renderer_handles::BuiltinRenderer> {
    let mut sources = Vec::new();
    for crate_dir in renderer_handles::OWNING_CRATES {
        let src_dir = crates_dir.join(crate_dir).join("src");
        println!("cargo::rerun-if-changed={}", src_dir.display());
        for path in collect_rust_source_files(&src_dir) {
            sources.push((crate_dir.to_string(), fs::read_to_string(path).unwrap()));
        }
    }
    return renderer_handles::collect_builtin_renderers(&sources);
}

fn collect_rust_source_files(dir: &Path) -> Vec<PathBuf> {
    fn visit(dir: &Path, out: &mut Vec<PathBuf>) {
        let mut entries: Vec<_> = fs::read_dir(dir).unwrap().filter_map(Result::ok).collect();
        entries.sort_by_key(|entry| entry.path());
        for entry in entries {
            let path = entry.path();
            if path.is_dir() {
                visit(&path, out);
            } else if path.extension().is_some_and(|extension| extension == "rs")
                && path
                    .file_name()
                    .is_some_and(|_| root_census::is_library_path(&path))
            {
                out.push(path);
            }
        }
    }

    let mut sources = Vec::new();
    visit(dir, &mut sources);
    sources
}

// The types a TypeScript-public function returns as a shared handle (`Ref<T>` or
// `Option<Ref<T>>`). C holds such an owner only as that handle, so its signal fields are reached
// through lock-scoped connects, never through a raw pointer into the unlocked value.
fn collect_ref_owned_signal_owners(crates_dir: &Path) -> BTreeSet<String> {
    let mut owners = BTreeSet::new();
    for dir_name in SCAN_CRATES {
        let src_dir = crates_dir.join(dir_name).join("src");
        if !src_dir.exists() {
            continue;
        }
        for func in collect_pub_fns(&src_dir) {
            if func.lacks_public_export {
                continue;
            }
            let Some(ret) = &func.ret else {
                continue;
            };
            let ret = strip_crate_paths(&resolve_type_alias(ret.trim()));
            let ret = ret
                .strip_prefix("Option<")
                .and_then(|rest| rest.strip_suffix('>'))
                .unwrap_or(&ret);
            if let Some(inner) = ret
                .strip_prefix("Ref<")
                .and_then(|rest| rest.strip_suffix('>'))
                && inner.chars().all(|c| c.is_alphanumeric() || c == '_')
            {
                owners.insert(inner.to_string());
            }
        }
    }
    owners
}

// The type names every Flight crate defines, keyed by crate directory, so a payload's nominal types
// resolve to their defining crate.
fn collect_crate_defined_type_names(
    crates_dir: &Path,
) -> BTreeMap<String, signal_identity::CrateIndex> {
    let mut defined = BTreeMap::new();
    let mut crates: Vec<_> = fs::read_dir(crates_dir)
        .unwrap()
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.file_name().to_string_lossy().to_string())
        .filter(|name| name.starts_with("flight-"))
        .collect();
    crates.sort();
    for name in crates {
        let src_dir = crates_dir.join(&name).join("src");
        if !src_dir.exists() {
            continue;
        }
        let files: Vec<(String, syn::File)> = collect_rust_source_files(&src_dir)
            .iter()
            .filter_map(|path| {
                let file = syn::parse_file(&fs::read_to_string(path).ok()?).ok()?;
                Some((get_source_module_path(&src_dir, path), file))
            })
            .collect();
        defined.insert(name, signal_identity::index_crate(&files));
    }
    defined
}

// The module path of one source file: `lib.rs` is the root (`""`), `types.rs` is `types`, and
// `a/b.rs` or `a/b/mod.rs` is `a::b`.
fn get_source_module_path(src_dir: &Path, source: &Path) -> String {
    let relative = source.strip_prefix(src_dir).unwrap_or(source);
    let mut segments: Vec<String> = relative
        .with_extension("")
        .components()
        .map(|component| component.as_os_str().to_string_lossy().to_string())
        .collect();
    if segments
        .last()
        .is_some_and(|last| last == "lib" || last == "mod")
    {
        segments.pop();
    }
    segments.join("::")
}

// Every `Signal<T>` on the public perimeter of one crate: pub fields of root-exported structs and
// parameters/returns of TS-public functions. A function's own generic parameter (`Signal<T>` in
// flight-signals) is the generic API, not a payload, and is not recorded.
fn collect_signal_inventory(
    owner: &str,
    src_dir: &Path,
    crates_dir: &Path,
    defined: &BTreeMap<String, signal_identity::CrateIndex>,
) -> Vec<SignalInventoryEntry> {
    let lib_path = src_dir.join("lib.rs");
    if !lib_path.exists() {
        return Vec::new();
    }
    let (public_types, glob_types) = collect_root_exported_item_names(&lib_path, src_dir);
    let ts_exports = collect_ts_exports(src_dir);
    let mut inventory = Vec::new();
    for source in collect_rust_source_files(src_dir) {
        let content = fs::read_to_string(&source).unwrap();
        let file = syn::parse_file(&content)
            .unwrap_or_else(|error| panic!("failed to parse {}: {error}", source.display()));
        let relative = source
            .strip_prefix(crates_dir)
            .unwrap_or(&source)
            .to_path_buf();
        let module = get_source_module_path(src_dir, &source);
        let mut record = |item: String,
                          ty: &syn::Type,
                          generics: &BTreeSet<String>,
                          glob_export: bool| {
            for payload in find_signal_payloads(ty) {
                let (payload_text, identities) =
                    signal_identity::resolve_payload(&payload, defined, owner, &module, generics)
                        .unwrap_or_else(|error| panic!("{}: {item}: {error}", relative.display()));
                if generics.contains(&payload_text) {
                    continue;
                }
                inventory.push(SignalInventoryEntry {
                    owner: owner.to_string(),
                    source: relative.clone(),
                    item: item.clone(),
                    declared: signal_identity::display_type_text(ty)
                        .unwrap_or_else(|error| panic!("{}: {item}: {error}", relative.display())),
                    payload: payload_text,
                    identities,
                    glob_export,
                });
            }
        };
        for item in &file.items {
            match item {
                syn::Item::Struct(item) => {
                    let name = item.ident.to_string();
                    if !matches!(item.vis, syn::Visibility::Public(_))
                        || !public_types.contains(&name)
                    {
                        continue;
                    }
                    let syn::Fields::Named(fields) = &item.fields else {
                        continue;
                    };
                    let struct_generics = signal_identity::type_parameter_names(&item.generics);
                    for field in &fields.named {
                        if !matches!(field.vis, syn::Visibility::Public(_)) {
                            continue;
                        }
                        let field_name = field.ident.as_ref().unwrap().to_string();
                        record(
                            format!("{name}.{field_name}"),
                            &field.ty,
                            &struct_generics,
                            glob_types.contains(&name),
                        );
                    }
                }
                syn::Item::Fn(item) => {
                    let name = item.sig.ident.to_string();
                    if !matches!(item.vis, syn::Visibility::Public(_))
                        || !ts_exports
                            .public
                            .contains(&public_perimeter::get_export_key(&name))
                    {
                        continue;
                    }
                    let generics = signal_identity::type_parameter_names(&item.sig.generics);
                    for input in &item.sig.inputs {
                        if let syn::FnArg::Typed(input) = input {
                            let param = input.pat.to_token_stream().to_string();
                            record(format!("fn {name}({param})"), &input.ty, &generics, false);
                        }
                    }
                    if let syn::ReturnType::Type(_, ty) = &item.sig.output {
                        record(format!("fn {name} -> return"), ty, &generics, false);
                    }
                }
                _ => {}
            }
        }
    }
    inventory
}

// Item C gate. Every inventory payload needs a policy, every policy needs a payload, and the
// committed `signal_inventory.txt` must equal the generated report; set
// `FLIGHT_FFI_UPDATE_SIGNAL_INVENTORY=1` to rewrite the committed copy after reviewing the delta.
fn check_signal_inventory(inventory: &[SignalInventoryEntry], report: &str) {
    let mut identities: BTreeMap<String, BTreeSet<signal_identity::PayloadIdentity>> =
        BTreeMap::new();
    for entry in inventory {
        identities
            .entry(entry.payload.clone())
            .or_default()
            .extend(entry.identities.iter().cloned());
    }
    if let Err(error) =
        signal_identity::check_payload_identities(&identities, get_signal_payload_stem)
    {
        panic!("signal payload identities are ambiguous: {error}");
    }
    let payloads: BTreeSet<&str> = inventory
        .iter()
        .map(|entry| entry.payload.as_str())
        .collect();
    let policies: BTreeSet<&str> = SIGNAL_PAYLOAD_POLICIES
        .iter()
        .map(|(payload, _)| *payload)
        .collect();
    let unclassified: Vec<&&str> = payloads.difference(&policies).collect();
    assert!(
        unclassified.is_empty(),
        "public Signal<T> payloads with no SIGNAL_PAYLOAD_POLICIES entry (add a connect or a named skip): {unclassified:?}"
    );
    let stale: Vec<&&str> = policies.difference(&payloads).collect();
    assert!(
        stale.is_empty(),
        "SIGNAL_PAYLOAD_POLICIES names payloads absent from the public perimeter: {stale:?}"
    );
    for (payload, decision) in SIGNAL_PAYLOAD_POLICIES {
        if let Some(reason) = decision.strip_prefix("skip:") {
            assert!(
                !reason.trim().is_empty(),
                "skipped signal payload {payload} needs a reason"
            );
        } else {
            assert_eq!(
                *decision, "connect",
                "unknown signal payload decision {decision:?} for {payload}"
            );
            assert!(
                get_signal_payload_class(payload).is_some(),
                "signal payload {payload} is marked connect but has no Task M callback lowering"
            );
        }
    }
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let committed_path = manifest_dir.join("signal_inventory.txt");
    println!("cargo::rerun-if-changed={}", committed_path.display());
    println!("cargo::rerun-if-env-changed=FLIGHT_FFI_UPDATE_SIGNAL_INVENTORY");
    if env::var("FLIGHT_FFI_UPDATE_SIGNAL_INVENTORY").is_ok_and(|value| value == "1") {
        fs::write(&committed_path, report).unwrap();
        return;
    }
    let committed = fs::read_to_string(&committed_path).unwrap_or_default();
    assert!(
        committed == report,
        "{} is stale: the public Signal<T> perimeter changed. Review the generated inventory, then rebuild with FLIGHT_FFI_UPDATE_SIGNAL_INVENTORY=1",
        committed_path.display()
    );
}

// Task M's callback lowering class for one signal payload, or `None` when it has none.
fn get_signal_payload_class(payload: &str) -> Option<&'static str> {
    if payload == "()" {
        return Some("unit");
    }
    if is_scalar(payload) {
        return Some("scalar");
    }
    if is_known_enum(payload) {
        return Some("enum-u32");
    }
    if let Some(inner) = payload
        .strip_prefix("Ref<")
        .and_then(|rest| rest.strip_suffix('>'))
    {
        return (!inner.contains('<') && !inner.contains(',')).then_some("borrowed-ref-handle");
    }
    if !payload.contains('<')
        && !payload.contains('(')
        && !payload.contains(',')
        && payload != "String"
    {
        return Some("borrowed-struct");
    }
    None
}

// The wrapper stem for a connectable payload: `()` -> `unit`, `Ref<NetProgress>` ->
// `net_progress`, `Scene2DDocumentFetchProgress` -> `scene2d_document_fetch_progress`.
fn get_signal_payload_stem(payload: &str) -> String {
    if payload == "()" {
        return "unit".to_string();
    }
    let name = payload
        .strip_prefix("Ref<")
        .and_then(|rest| rest.strip_suffix('>'))
        .unwrap_or(payload);
    let chars: Vec<char> = name.chars().collect();
    let mut out = String::new();
    for (index, &character) in chars.iter().enumerate() {
        if character.is_ascii_uppercase() && index > 0 {
            let previous = chars[index - 1];
            let next_is_lower = chars
                .get(index + 1)
                .is_some_and(|next| next.is_ascii_lowercase());
            if previous.is_ascii_lowercase() || (previous.is_ascii_uppercase() && next_is_lower) {
                out.push('_');
            }
        }
        out.push(character.to_ascii_lowercase());
    }
    out
}

// Every item name a crate root (`lib.rs`) re-exports, read with `syn` so grouped
// (`pub use contract::{A, B};`), renamed and glob (`pub use contract::*;`, `pub use crate::m::*;`)
// forms all count. `collect_exported_type_names` predates grouped root exports and feeds wrapper
// generation, so it is left unchanged; this reader serves the signal inventory only. The second
// set holds the names reached only through a root glob of a module other than `contract`.
fn collect_root_exported_item_names(
    lib_path: &Path,
    src_dir: &Path,
) -> (BTreeSet<String>, BTreeSet<String>) {
    fn module_file(src_dir: &Path, path: &[String]) -> Option<PathBuf> {
        let module = path
            .iter()
            .rfind(|segment| segment.as_str() != "crate" && segment.as_str() != "self")?;
        let file = src_dir.join(format!("{module}.rs"));
        return file.exists().then_some(file);
    }
    // `glob` is true below a crate-root glob of a module other than `contract` (`pub use types::*;`);
    // `root` marks a tree written in `lib.rs` itself.
    fn visit_tree(
        tree: &syn::UseTree,
        prefix: &mut Vec<String>,
        root: bool,
        glob: bool,
        src_dir: &Path,
        seen: &mut BTreeSet<PathBuf>,
        names: &mut BTreeMap<String, bool>,
    ) {
        match tree {
            syn::UseTree::Path(path) => {
                prefix.push(path.ident.to_string());
                visit_tree(&path.tree, prefix, root, glob, src_dir, seen, names);
                prefix.pop();
            }
            syn::UseTree::Name(name) => {
                insert_name(names, name.ident.to_string(), glob);
            }
            syn::UseTree::Rename(rename) => {
                insert_name(names, rename.rename.to_string(), glob);
            }
            syn::UseTree::Glob(_) => {
                let glob =
                    glob || (root && prefix.last().is_some_and(|module| module != "contract"));
                if let Some(file) = module_file(src_dir, prefix) {
                    collect_module(&file, glob, src_dir, seen, names);
                }
            }
            syn::UseTree::Group(group) => {
                for item in &group.items {
                    visit_tree(item, prefix, root, glob, src_dir, seen, names);
                }
            }
        }
    }
    fn insert_name(names: &mut BTreeMap<String, bool>, name: String, glob: bool) {
        let entry = names.entry(name).or_insert(glob);
        *entry = *entry && glob;
    }
    fn collect_module(
        file: &Path,
        glob: bool,
        src_dir: &Path,
        seen: &mut BTreeSet<PathBuf>,
        names: &mut BTreeMap<String, bool>,
    ) {
        if !seen.insert(file.to_path_buf()) {
            return;
        }
        let content = fs::read_to_string(file).unwrap();
        let Ok(parsed) = syn::parse_file(&content) else {
            return;
        };
        for item in &parsed.items {
            match item {
                syn::Item::Struct(item) if matches!(item.vis, syn::Visibility::Public(_)) => {
                    insert_name(names, item.ident.to_string(), glob);
                }
                syn::Item::Use(item) if matches!(item.vis, syn::Visibility::Public(_)) => {
                    visit_tree(
                        &item.tree,
                        &mut Vec::new(),
                        false,
                        glob,
                        src_dir,
                        seen,
                        names,
                    );
                }
                _ => {}
            }
        }
    }
    let mut names = BTreeMap::new();
    let content = fs::read_to_string(lib_path).unwrap();
    if let Ok(parsed) = syn::parse_file(&content) {
        let mut seen = BTreeSet::new();
        for item in &parsed.items {
            if let syn::Item::Use(item) = item
                && matches!(item.vis, syn::Visibility::Public(_))
            {
                visit_tree(
                    &item.tree,
                    &mut Vec::new(),
                    true,
                    false,
                    src_dir,
                    &mut seen,
                    &mut names,
                );
            }
        }
    }
    let glob_only = names
        .iter()
        .filter(|(_, glob)| **glob)
        .map(|(name, _)| name.clone())
        .collect();
    (names.into_keys().collect(), glob_only)
}

// The payload type text of every `Signal<T>` anywhere inside `ty` (nested generics, references,
// tuples, callback parameters and returns).
fn find_signal_payloads(ty: &syn::Type) -> Vec<syn::Type> {
    struct SignalFinder {
        payloads: Vec<syn::Type>,
    }
    impl<'ast> syn::visit::Visit<'ast> for SignalFinder {
        fn visit_type_path(&mut self, path: &'ast syn::TypePath) {
            if let Some(segment) = path.path.segments.last()
                && segment.ident == "Signal"
                && let syn::PathArguments::AngleBracketed(arguments) = &segment.arguments
                && let Some(syn::GenericArgument::Type(payload)) = arguments.args.first()
            {
                self.payloads.push(payload.clone());
            }
            syn::visit::visit_type_path(self, path);
        }
    }
    let mut finder = SignalFinder {
        payloads: Vec::new(),
    };
    syn::visit::Visit::visit_type(&mut finder, ty);
    finder.payloads
}

fn generate_signal_inventory_report(inventory: &[SignalInventoryEntry]) -> String {
    let owners: BTreeSet<&str> = inventory.iter().map(|entry| entry.owner.as_str()).collect();
    let payloads: BTreeSet<&str> = inventory
        .iter()
        .map(|entry| entry.payload.as_str())
        .collect();
    let fields = inventory
        .iter()
        .filter(|entry| !entry.item.starts_with("fn "))
        .count();
    let functions = inventory.len() - fields;
    let ref_wrapped = inventory
        .iter()
        .filter(|entry| {
            entry.declared.starts_with("Ref<Signal")
                || entry.declared.starts_with("Option<Ref<Signal")
        })
        .count();
    // An owner whose every occurrence is glob-exported is listed by name: those crates define the
    // fields in their own modules and expose them with `pub use types::*;`, so each occurrence is
    // counted once, under its defining crate.
    let glob_owners: Vec<&str> = owners
        .iter()
        .copied()
        .filter(|owner| {
            inventory
                .iter()
                .filter(|entry| entry.owner == *owner)
                .all(|entry| entry.glob_export)
        })
        .collect();
    let mut report = String::new();
    writeln!(
        report,
        "Signal inventory: {} occurrences in {} owning crates ({} named-export, {} glob-export: {}; each occurrence counted once under its defining crate) ({fields} fields, {functions} function parameters/returns, {ref_wrapped} Ref-wrapped), {} payload types",
        inventory.len(),
        owners.len(),
        owners.len() - glob_owners.len(),
        glob_owners.len(),
        glob_owners.join(", "),
        payloads.len()
    )
    .unwrap();
    for entry in inventory {
        writeln!(
            report,
            "signal|{}|{}|{}|{}|{}",
            entry.owner,
            entry.source.display(),
            entry.item,
            entry.declared,
            entry.payload
        )
        .unwrap();
    }
    let mut counts: BTreeMap<&str, usize> = BTreeMap::new();
    for entry in inventory {
        *counts.entry(entry.payload.as_str()).or_default() += 1;
    }
    for (payload, count) in counts {
        writeln!(report, "payload|{payload}|{count}").unwrap();
    }
    for entry in inventory {
        let decision = get_signal_producer_decision(entry);
        match decision.strip_prefix("skip:") {
            Some(reason) => writeln!(
                report,
                "producer|{}|{}|skip|{reason}",
                entry.owner, entry.item
            )
            .unwrap(),
            None => writeln!(report, "producer|{}|{}|{decision}", entry.owner, entry.item).unwrap(),
        }
    }
    for (payload, decision) in SIGNAL_PAYLOAD_POLICIES {
        match decision.strip_prefix("skip:") {
            Some(reason) => writeln!(report, "policy|{payload}|skip|{reason}").unwrap(),
            None => writeln!(
                report,
                "policy|{payload}|flight_connect_{}_signal|{}",
                get_signal_payload_stem(payload),
                get_signal_payload_class(payload).unwrap_or("none")
            )
            .unwrap(),
        }
    }
    report
}

fn generate_host_capability_inventory_report(inventory: &[HostCapabilityInventory]) -> String {
    let field_count: usize = inventory
        .iter()
        .map(|capability| capability.fields.len())
        .sum();
    let callbacks: Vec<_> = inventory
        .iter()
        .flat_map(|capability| {
            capability
                .fields
                .iter()
                .filter_map(|field| field.callback.as_ref())
        })
        .collect();
    let required_count = callbacks
        .iter()
        .filter(|callback| !callback.optional)
        .count();
    let optional_count = callbacks.len() - required_count;
    let mut signature_families = BTreeMap::new();
    for callback in &callbacks {
        *signature_families
            .entry(callback.signature.clone())
            .or_insert(0usize) += 1;
    }

    let mut report = String::new();
    writeln!(
        report,
        "Host capability inventory: {} structs, {field_count} fields, {} callback fields ({required_count} required, {optional_count} optional), {} signature families",
        inventory.len(),
        callbacks.len(),
        signature_families.len()
    )
    .unwrap();
    for capability in inventory {
        let withdrawn_priority =
            WITHDRAWN_HOST_CAPABILITY_PRIORITIES.contains(&capability.name.as_str());
        writeln!(
            report,
            "struct|{}|{}|{}|rust_public={}|ffi_constructor=false|withdrawn_priority={withdrawn_priority}|fields={}|callbacks={}",
            capability.owner,
            capability.source.display(),
            capability.name,
            capability.public_reachable,
            capability.fields.len(),
            capability
                .fields
                .iter()
                .filter(|field| field.callback.is_some())
                .count()
        )
        .unwrap();
        for field in &capability.fields {
            match &field.callback {
                Some(callback) => writeln!(
                    report,
                    "  field|{}|{}|{}|{}",
                    field.name,
                    if callback.optional {
                        "optional-callback"
                    } else {
                        "required-callback"
                    },
                    callback.signature,
                    field.ty
                ),
                None => writeln!(report, "  field|{}|data|{}", field.name, field.ty),
            }
            .unwrap();
            writeln!(
                report,
                "  decision|{}|unsupported|{}",
                field.name,
                if withdrawn_priority {
                    "withdrawn-capability-construction-deferred-beyond-alpha"
                } else {
                    "not-prioritized"
                }
            )
            .unwrap();
        }
    }
    for (signature, count) in signature_families {
        writeln!(report, "signature|{count}|{signature}").unwrap();
    }
    report
}

fn get_host_capability_callback(
    ty: &syn::Type,
    aliases: &BTreeMap<String, syn::Type>,
    optional: bool,
    depth: usize,
) -> Option<HostCapabilityCallback> {
    if depth > 16 {
        return None;
    }
    match ty {
        syn::Type::BareFn(function) => Some(HostCapabilityCallback {
            optional,
            signature: bare_fn_signature(function),
        }),
        syn::Type::Path(path) if path.qself.is_none() => {
            let segment = path.path.segments.last()?;
            if segment.ident == "Option" {
                let syn::PathArguments::AngleBracketed(arguments) = &segment.arguments else {
                    return None;
                };
                let inner = arguments.args.iter().find_map(|argument| match argument {
                    syn::GenericArgument::Type(ty) => Some(ty),
                    _ => None,
                })?;
                return get_host_capability_callback(inner, aliases, true, depth + 1);
            }
            if segment.ident == "Arc" {
                let syn::PathArguments::AngleBracketed(arguments) = &segment.arguments else {
                    return None;
                };
                let inner = arguments.args.iter().find_map(|argument| match argument {
                    syn::GenericArgument::Type(ty) => Some(ty),
                    _ => None,
                })?;
                let syn::Type::TraitObject(object) = inner else {
                    return None;
                };
                return trait_object_callback_signature(object).map(|signature| {
                    HostCapabilityCallback {
                        optional,
                        signature,
                    }
                });
            }
            if path.path.segments.len() == 1
                && let Some(alias) = aliases.get(&segment.ident.to_string())
            {
                return get_host_capability_callback(alias, aliases, optional, depth + 1);
            }
            None
        }
        _ => None,
    }
}

fn trait_object_callback_signature(object: &syn::TypeTraitObject) -> Option<String> {
    let function = object.bounds.iter().find_map(|bound| match bound {
        syn::TypeParamBound::Trait(bound) => {
            let segment = bound.path.segments.last()?;
            matches!(
                segment.ident.to_string().as_str(),
                "Fn" | "FnMut" | "FnOnce"
            )
            .then_some(segment)
        }
        _ => None,
    })?;
    let syn::PathArguments::Parenthesized(arguments) = &function.arguments else {
        return None;
    };
    let inputs = arguments
        .inputs
        .iter()
        .map(rust_type_text)
        .collect::<Vec<_>>()
        .join(", ");
    let output = return_type_text(&arguments.output);
    Some(format!("{}({inputs}){output}", function.ident))
}

fn bare_fn_signature(function: &syn::TypeBareFn) -> String {
    let inputs = function
        .inputs
        .iter()
        .map(|input| rust_type_text(&input.ty))
        .collect::<Vec<_>>()
        .join(", ");
    let output = return_type_text(&function.output);
    format!("fn({inputs}){output}")
}

fn return_type_text(output: &syn::ReturnType) -> String {
    match output {
        syn::ReturnType::Default => String::new(),
        syn::ReturnType::Type(_, ty) => format!(" -> {}", rust_type_text(ty)),
    }
}

fn rust_type_text(ty: &syn::Type) -> String {
    ty.to_token_stream().to_string()
}

// Plain `#[repr(C)]` value structs whose entire layout is public and recursively composed from
// scalars, generated enums, arrays, or other such structs can be declared by a C caller. They are
// roots of the reachability graph rather than opaque handles. A private field, generic argument,
// duplicate SDK name, or non-C representation keeps the type opaque and in need of a producer.
fn collect_caller_producible_value_types(crates_dir: &Path) -> BTreeSet<String> {
    let mut candidates = BTreeMap::<String, Option<BTreeSet<String>>>::new();
    for dir_name in SCAN_CRATES {
        let src_dir = crates_dir.join(dir_name).join("src");
        if !src_dir.exists() {
            continue;
        }
        let mut entries: Vec<_> = fs::read_dir(&src_dir)
            .unwrap()
            .filter_map(|entry| entry.ok())
            .filter(|entry| {
                entry
                    .path()
                    .extension()
                    .is_some_and(|extension| extension == "rs")
                    && root_census::is_library_path(&entry.path())
            })
            .collect();
        entries.sort_by_key(|entry| entry.file_name());
        for entry in entries {
            let file_name = entry.file_name().to_string_lossy().to_string();
            if file_name == "contract.rs" || file_name == "lib.rs" {
                continue;
            }
            let content = fs::read_to_string(entry.path()).unwrap();
            let file = syn::parse_file(&content).unwrap_or_else(|error| {
                panic!(
                    "failed to parse {} for C value layouts: {error}",
                    entry.path().display()
                )
            });
            for item in file.items {
                let syn::Item::Struct(item) = item else {
                    continue;
                };
                let name = item.ident.to_string();
                let dependencies = caller_value_struct_dependencies(&item);
                match candidates.entry(name) {
                    std::collections::btree_map::Entry::Vacant(entry) => {
                        entry.insert(dependencies);
                    }
                    std::collections::btree_map::Entry::Occupied(mut entry) => {
                        entry.insert(None);
                    }
                }
            }
        }
    }

    let mut producible = BTreeSet::new();
    loop {
        let discovered: Vec<_> = candidates
            .iter()
            .filter(|(name, dependencies)| {
                !producible.contains(*name)
                    && dependencies
                        .as_ref()
                        .is_some_and(|dependencies| dependencies.is_subset(&producible))
            })
            .map(|(name, _)| name.clone())
            .collect();
        if discovered.is_empty() {
            return producible;
        }
        producible.extend(discovered);
    }
}

fn caller_value_struct_dependencies(item: &syn::ItemStruct) -> Option<BTreeSet<String>> {
    if !matches!(item.vis, syn::Visibility::Public(_))
        || !item.generics.params.is_empty()
        || !item.attrs.iter().any(|attribute| {
            attribute.path().is_ident("repr")
                && attribute.meta.require_list().is_ok_and(|list| {
                    list.tokens
                        .to_string()
                        .split(',')
                        .any(|part| part.trim() == "C")
                })
        })
    {
        return None;
    }
    let syn::Fields::Named(fields) = &item.fields else {
        return None;
    };
    if fields.named.is_empty()
        || fields
            .named
            .iter()
            .any(|field| !matches!(field.vis, syn::Visibility::Public(_)))
    {
        return None;
    }
    let mut dependencies = BTreeSet::new();
    for field in &fields.named {
        dependencies.extend(caller_value_type_dependencies(&field.ty)?);
    }
    Some(dependencies)
}

fn caller_value_type_dependencies(ty: &syn::Type) -> Option<BTreeSet<String>> {
    match ty {
        syn::Type::Array(array) => caller_value_type_dependencies(&array.elem),
        syn::Type::Path(path) if path.qself.is_none() => {
            let segment = path.path.segments.last()?;
            if !matches!(segment.arguments, syn::PathArguments::None) {
                return None;
            }
            let name = segment.ident.to_string();
            if is_scalar(&name) || is_known_enum(&name) {
                return Some(BTreeSet::new());
            }
            Some([name].into_iter().collect())
        }
        _ => None,
    }
}

fn collect_reachability_aliases() -> BTreeMap<String, String> {
    TYPE_DEFINITIONS
        .get()
        .unwrap()
        .iter()
        .filter_map(|(name, definitions)| {
            let resolved = resolve_type_alias(name);
            if resolved == *name {
                return None;
            }
            let qualified = qualify_opaque_type(&resolved)?;
            let expected_target = reachability::canonical_type(&qualified);
            // A root export selects the SDK meaning for a shared name. Without one, every
            // definition must prove the vetted reachability alias target; nominal, generic, or
            // conflicting definitions remain distinct carriers rather than being guessed together.
            let exported_only = definitions.iter().any(|(exported, _)| *exported);
            let proven_target = reachability::unambiguous_alias_target(
                definitions
                    .iter()
                    .filter(|(exported, _)| *exported || !exported_only)
                    .map(|(_, definition)| match definition {
                        TypeDefinition::Alias(target) => {
                            qualify_opaque_type(target).and_then(|target| {
                                syn::parse_str::<syn::Type>(&target)
                                    .ok()
                                    .map(|_| reachability::canonical_type(&target))
                            })
                        }
                        TypeDefinition::Nominal { .. } | TypeDefinition::GenericAlias => None,
                    }),
            );
            (proven_target.as_deref() == Some(expected_target.as_str()))
                .then(|| (name.clone(), expected_target))
        })
        .collect()
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
    const LOCKED: &str = "shared Ref handle; locked for the duration of the call";
    let ty = strip_crate_paths(&strip_lifetimes(&resolve_type_alias(ty.trim())));
    if [ty.strip_prefix("&mut "), ty.strip_prefix('&')]
        .into_iter()
        .flatten()
        .any(|inner| REF_LOCKED_PARAM_TYPES.contains(&inner))
    {
        return Some(LOCKED);
    }
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
    if matches!(struct_name, "NodeFields" | "Node2DFields" | "Node3DFields") {
        // Node views have their own accessors, including their optional fields.
        let scalar_fields: Vec<StructField> = fields
            .iter()
            .filter(|field| is_scalar(&field.ty))
            .map(|field| StructField {
                name: field.name.clone(),
                ty: field.ty.clone(),
            })
            .collect();
        return generate_node_field_accessors(struct_name, &scalar_fields, seen_names);
    }
    let snake = to_snake_case(struct_name);
    let qualified = qualify_type(struct_name);
    let ref_only = is_ref_only_borrow_type(struct_name);
    let mut output = String::new();

    for field in fields {
        if field.ty.starts_with("Option<") {
            for (name, code) in generate_optional_field_accessors(
                &snake,
                &qualified,
                ref_only,
                &field.name,
                &field.ty,
            ) {
                if seen_names.insert(name) {
                    output.push_str(&code);
                    output.push('\n');
                }
            }
            continue;
        }
        let getter_name = format!("flight_get_{snake}_{}", field.name);
        let setter_name = format!("flight_set_{snake}_{}", field.name);

        let ffi_ty = &field.ty;

        if seen_names.insert(getter_name.clone()) {
            if ref_only {
                writeln!(
                    output,
                    "#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn {getter_name}(ptr: *const std::ffi::c_void) -> {ffi_ty} {{\n    if ptr.is_null() {{ return Default::default(); }}\n    let value = unsafe {{ &*(ptr as *const flight_sdk::Ref<{qualified}>) }}.read().unwrap_or_else(std::sync::PoisonError::into_inner);\n    value.{}\n}}",
                    field.name
                )
                .unwrap();
            } else {
                writeln!(
                    output,
                    "#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn {getter_name}(ptr: *const {qualified}) -> {ffi_ty} {{\n    return unsafe {{ &*ptr }}.{};\n}}",
                    field.name
                )
                .unwrap();
            }
        }
        if seen_names.insert(setter_name.clone()) {
            if ref_only {
                writeln!(
                    output,
                    "#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn {setter_name}(ptr: *mut std::ffi::c_void, value: {ffi_ty}) -> {ffi_ty} {{\n    if ptr.is_null() {{ return Default::default(); }}\n    unsafe {{ &*(ptr as *const flight_sdk::Ref<{qualified}>) }}.write().unwrap_or_else(std::sync::PoisonError::into_inner).{} = value;\n    value\n}}",
                    field.name
                )
                .unwrap();
            } else {
                writeln!(
                    output,
                    "#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn {setter_name}(ptr: *mut {qualified}, value: {ffi_ty}) -> {ffi_ty} {{\n    unsafe {{ &mut *ptr }}.{} = value;\n    return value;\n}}",
                    field.name
                )
                .unwrap();
            }
        }
    }
    output
}

// Accessors for one optional field: `has`, `get`, `set` and `clear`, so C can tell an absent value
// from a present false, zero or empty string. Every accessor returns false (or NULL) for a NULL
// handle and changes nothing. Scalars, enums (as their u32 discriminant), strings, scalar lists and
// lists of plain records lower; any other optional shape has no accessors.
fn generate_optional_field_accessors(
    snake: &str,
    qualified: &str,
    ref_only: bool,
    field: &str,
    ty: &str,
) -> Vec<(String, String)> {
    let resolved = strip_crate_paths(&resolve_type_alias(ty.trim()));
    let Some(inner) = resolved
        .strip_prefix("Option<")
        .and_then(|rest| rest.strip_suffix('>'))
        .map(str::trim)
    else {
        return Vec::new();
    };
    let handle = |mutable: bool| -> (String, String) {
        if ref_only {
            let pointer = if mutable { "*mut" } else { "*const" };
            let lock = if mutable { "write" } else { "read" };
            let binding = if mutable { "mut " } else { "" };
            return (
                format!("ptr: {pointer} std::ffi::c_void"),
                format!(
                    "    if ptr.is_null() {{ return FAIL; }}\n    let {binding}value = unsafe {{ &*(ptr as *const flight_sdk::Ref<{qualified}>) }}.{lock}().unwrap_or_else(std::sync::PoisonError::into_inner);\n"
                ),
            );
        }
        if mutable {
            return (
                format!("ptr: *mut {qualified}"),
                "    if ptr.is_null() { return FAIL; }\n    let value = unsafe { &mut *ptr };\n"
                    .to_string(),
            );
        }
        return (
            format!("ptr: *const {qualified}"),
            "    if ptr.is_null() { return FAIL; }\n    let value = unsafe { &*ptr };\n"
                .to_string(),
        );
    };
    let wrapper = |name: &str, mutable: bool, params: &str, ret: &str, fail: &str, body: &str| {
        let (handle_param, access) = handle(mutable);
        let params = if params.is_empty() {
            handle_param
        } else {
            format!("{handle_param}, {params}")
        };
        let access = access.replace("FAIL", fail);
        let ownership = if ret == "*mut std::ffi::c_char" {
            "#[doc = \"flight-ffi ownership|owned-return|flight_free_string|std::ffi::c_char\"]\n"
        } else {
            ""
        };
        return (
            name.to_string(),
            format!(
                "{ownership}#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn {name}({params}) -> {ret} {{\n{access}{body}\n}}"
            ),
        );
    };
    let has = format!("flight_has_{snake}_{field}");
    let get = format!("flight_get_{snake}_{field}");
    let set = format!("flight_set_{snake}_{field}");
    let clear = format!("flight_clear_{snake}_{field}");
    let mut out = vec![
        wrapper(
            &has,
            false,
            "",
            "bool",
            "false",
            &format!("    value.{field}.is_some()"),
        ),
        wrapper(
            &clear,
            true,
            "",
            "bool",
            "false",
            &format!("    value.{field} = None;\n    true"),
        ),
    ];
    if is_scalar(inner) {
        out.push(wrapper(&get, false, &format!("out: *mut {inner}"), "bool", "false", &format!(
            "    match value.{field} {{\n        Some(present) => {{ if !out.is_null() {{ unsafe {{ *out = present; }} }} true }}\n        None => false,\n    }}"
        )));
        out.push(wrapper(
            &set,
            true,
            &format!("present: {inner}"),
            "bool",
            "false",
            &format!("    value.{field} = Some(present);\n    true"),
        ));
        return out;
    }
    if is_known_enum(inner) {
        let conversion = get_enum_conversion(inner, "present");
        out.push(wrapper(&get, false, "out: *mut u32", "bool", "false", &format!(
            "    match &value.{field} {{\n        // A known enum is a fieldless `#[repr(u32)]` enum: its value is its u32 discriminant.\n        Some(present) => {{ if !out.is_null() {{ unsafe {{ *out = *(present as *const _ as *const u32); }} }} true }}\n        None => false,\n    }}"
        )));
        out.push(wrapper(&set, true, "present: u32", "bool", "false", &format!(
            "    let Some(present) = {conversion} else {{ return false; }};\n    value.{field} = Some(present);\n    true"
        )));
        return out;
    }
    if inner == "String" {
        out.push(wrapper(&get, false, "", "*mut std::ffi::c_char", "std::ptr::null_mut()", &format!(
            "    match &value.{field} {{\n        Some(present) => std::ffi::CString::new(present.as_str()).unwrap_or_default().into_raw(),\n        None => std::ptr::null_mut(),\n    }}"
        )));
        // The text is read before the handle is locked: NULL or invalid UTF-8 changes nothing.
        let (handle_param, access) = handle(true);
        let access = access.replace("FAIL", "false");
        out.push((set.clone(), format!(
            "#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn {set}({handle_param}, present: *const std::ffi::c_char) -> bool {{\n    let Some(present) = (unsafe {{ ffi_c_str(present) }}) else {{ return false; }};\n{access}    value.{field} = Some(present.to_string());\n    true\n}}"
        )));
        return out;
    }
    let (list, shared) = match inner
        .strip_prefix("Arc<")
        .and_then(|rest| rest.strip_suffix('>'))
    {
        Some(list) => (list.trim(), true),
        None => (inner, false),
    };
    let Some(element) = list
        .strip_prefix("Vec<")
        .and_then(|rest| rest.strip_suffix('>'))
        .map(str::trim)
    else {
        return Vec::new();
    };
    let wrap = |expression: String| {
        if shared {
            format!("std::sync::Arc::new({expression})")
        } else {
            expression
        }
    };
    if is_scalar(element) {
        out.push(wrapper(&get, false, &format!("out: *mut {element}, capacity: usize, len: *mut usize"), "bool", "false", &format!(
            "    let Some(present) = &value.{field} else {{ return false; }};\n    if !len.is_null() {{ unsafe {{ *len = present.len(); }} }}\n    if !out.is_null() {{\n        for (index, item) in present.iter().take(capacity).enumerate() {{ unsafe {{ *out.add(index) = *item; }} }}\n    }}\n    true"
        )));
        let values = wrap("unsafe { ffi_slice_from_raw_parts(values, len) }.to_vec()".to_string());
        let (handle_param, access) = handle(true);
        let access = access.replace("FAIL", "false");
        out.push((set.clone(), format!(
            "#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn {set}({handle_param}, values: *const {element}, len: usize) -> bool {{\n    if values.is_null() && len != 0 {{ return false; }}\n{access}    value.{field} = Some({values});\n    true\n}}"
        )));
        return out;
    }
    let Some(record) = RECORD_TYPES.get().and_then(|records| records.get(element)) else {
        return Vec::new();
    };
    let record_ty = qualify_type(element);
    out.push(wrapper(&format!("{get}_len"), false, "len: *mut usize", "bool", "false", &format!(
        "    let Some(present) = &value.{field} else {{ return false; }};\n    if !len.is_null() {{ unsafe {{ *len = present.len(); }} }}\n    true"
    )));
    let mut set_params = Vec::new();
    let mut set_reads = Vec::new();
    let mut set_fields = Vec::new();
    for (sub, sub_ty) in record {
        if sub_ty == "String" {
            out.push(wrapper(&format!("{get}_{sub}"), false, "index: usize", "*mut std::ffi::c_char", "std::ptr::null_mut()", &format!(
                "    match value.{field}.as_ref().and_then(|present| present.get(index)) {{\n        Some(item) => std::ffi::CString::new(item.{sub}.as_str()).unwrap_or_default().into_raw(),\n        None => std::ptr::null_mut(),\n    }}"
            )));
            set_params.push(format!("{sub}: *const *const std::ffi::c_char"));
            set_reads.push(format!(
                "    let mut ffi_{sub} = Vec::with_capacity(len);\n    for index in 0..len {{\n        let Some(text) = (unsafe {{ ffi_c_str(*{sub}.add(index)) }}) else {{ return false; }};\n        ffi_{sub}.push(text.to_string());\n    }}"
            ));
        } else {
            out.push(wrapper(&format!("{get}_{sub}"), false, &format!("index: usize, out: *mut {sub_ty}"), "bool", "false", &format!(
                "    match value.{field}.as_ref().and_then(|present| present.get(index)) {{\n        Some(item) => {{ if !out.is_null() {{ unsafe {{ *out = item.{sub}; }} }} true }}\n        None => false,\n    }}"
            )));
            set_params.push(format!("{sub}: *const {sub_ty}"));
            set_reads.push(format!(
                "    let ffi_{sub} = unsafe {{ ffi_slice_from_raw_parts({sub}, len) }}.to_vec();"
            ));
        }
        set_fields.push(sub.clone());
    }
    let null_checks: Vec<String> = set_fields
        .iter()
        .map(|sub| format!("{sub}.is_null()"))
        .collect();
    let construct: Vec<String> = set_fields
        .iter()
        .map(|sub| format!("{sub}: ffi_{sub}[index].clone()"))
        .collect();
    let items = wrap(format!(
        "(0..len).map(|index| {record_ty} {{ {} }}).collect::<Vec<_>>()",
        construct.join(", ")
    ));
    let (handle_param, access) = handle(true);
    let access = access.replace("FAIL", "false");
    out.push((set.clone(), format!(
        "#[doc = \"flight-ffi contract|Sets the list from parallel arrays of len items, one per record field in declaration order; a NULL array with len 0 sets an empty list, and NULL or invalid UTF-8 text refuses the call without change.\"]\n#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn {set}({handle_param}, {}, len: usize) -> bool {{\n    if len != 0 && ({}) {{ return false; }}\n{}\n{access}    value.{field} = Some({items});\n    true\n}}",
        set_params.join(", "),
        null_checks.join(" || "),
        set_reads.join("\n")
    )));
    return out;
}

fn generate_node_field_accessors(
    struct_name: &str,
    fields: &[StructField],
    seen_names: &mut BTreeSet<String>,
) -> String {
    let mut output = String::new();
    let (stem, view, field_read, field_write) = match struct_name {
        "NodeFields" => (
            "node",
            "Some(&node.node)",
            "guard.node_fields()",
            "guard.node_fields_mut()",
        ),
        "Node2DFields" => (
            "node2d",
            "node.node2d.as_ref()",
            "guard.node2d_fields()",
            "guard.node2d_fields_mut()",
        ),
        "Node3DFields" => (
            "node3d",
            "node.node3d.as_ref()",
            "guard.node3d_fields()",
            "guard.node3d_fields_mut()",
        ),
        _ => unreachable!(),
    };

    for field in fields {
        let getter_name = format!("flight_get_{stem}_{}", field.name);
        // A raw field write cannot shadow an SDK setter whose canonical verb also invalidates.
        // These are the two current collisions; non-colliding fields keep their concise names.
        let setter_name = match (struct_name, field.name.as_str()) {
            ("NodeFields", "enabled") => "flight_set_node_enabled_field".to_string(),
            ("Node3DFields", "alpha") => "flight_set_node3d_alpha_field".to_string(),
            _ => format!("flight_set_{stem}_{}", field.name),
        };
        let ffi_ty = &field.ty;
        if seen_names.insert(getter_name.clone()) {
            writeln!(
                output,
                "#[doc = \"flight-ffi contract|Reads {stem}.{} through the handle's read lock. NULL or a handle without the required node view returns the field type's default value (0, 0.0, or false).\"]\n#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn {getter_name}(node: *const FlightNode) -> {ffi_ty} {{\n    let Some(node) = (unsafe {{ ffi_node_handle(node) }}) else {{ return Default::default(); }};\n    let Some(view) = {view} else {{ return Default::default(); }};\n    let guard = view.read().unwrap_or_else(std::sync::PoisonError::into_inner);\n    {field_read}.{}\n}}",
                field.name,
                field.name
            )
            .unwrap();
        }
        if seen_names.insert(setter_name.clone()) {
            writeln!(
                output,
                "#[doc = \"flight-ffi contract|Assigns {stem}.{} through the handle's write lock without implicit invalidation. Returns true after assignment; NULL or a handle without the required node view returns false and changes nothing.\"]\n#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn {setter_name}(node: *mut FlightNode, value: {ffi_ty}) -> bool {{\n    let Some(node) = (unsafe {{ ffi_node_handle(node) }}) else {{ return false; }};\n    let Some(view) = {view} else {{ return false; }};\n    let mut guard = view.write().unwrap_or_else(std::sync::PoisonError::into_inner);\n    {field_write}.{} = value;\n    true\n}}",
                field.name,
                field.name
            )
            .unwrap();
        }
    }

    if struct_name == "NodeFields" {
        let extras = [
            "flight_get_node_kind",
            "flight_set_node_kind",
            "flight_get_node_name",
            "flight_set_node_name",
        ];
        if extras
            .iter()
            .all(|name| seen_names.insert((*name).to_string()))
        {
            output.push_str(
                r#"#[doc = "flight-ffi contract|Returns an owned copy of node.kind; the caller must call flight_free_string. NULL handles or an interior-NUL value return NULL."]
#[doc = "flight-ffi ownership|owned-return|flight_free_string|std::ffi::c_char"]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_get_node_kind(node: *const FlightNode) -> *mut std::ffi::c_char {
    let Some(node) = (unsafe { ffi_node_handle(node) }) else { return std::ptr::null_mut(); };
    let guard = node.node.read().unwrap_or_else(std::sync::PoisonError::into_inner);
    match std::ffi::CString::new(guard.node_fields().kind.as_str()) { Ok(value) => value.into_raw(), Err(_) => std::ptr::null_mut() }
}
#[doc = "flight-ffi contract|Assigns node.kind without implicit invalidation. NULL sets the kind to an empty string; invalid UTF-8 returns false and leaves the value unchanged; true means assigned. This mutability is intentional because kind is a public SDK field."]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_set_node_kind(node: *mut FlightNode, value: *const std::ffi::c_char) -> bool {
    let Some(node) = (unsafe { ffi_node_handle(node) }) else { return false; };
    let value = if value.is_null() { String::new() } else { match unsafe { std::ffi::CStr::from_ptr(value) }.to_str() { Ok(value) => value.to_owned(), Err(_) => return false } };
    node.node.write().unwrap_or_else(std::sync::PoisonError::into_inner).node_fields_mut().kind = value;
    true
}
#[doc = "flight-ffi contract|Returns an owned copy of node.name; the caller must call flight_free_string. NULL means no name, a NULL handle, or an interior-NUL stored name."]
#[doc = "flight-ffi ownership|owned-return|flight_free_string|std::ffi::c_char"]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_get_node_name(node: *const FlightNode) -> *mut std::ffi::c_char {
    let Some(node) = (unsafe { ffi_node_handle(node) }) else { return std::ptr::null_mut(); };
    let guard = node.node.read().unwrap_or_else(std::sync::PoisonError::into_inner);
    match guard.node_fields().name.as_deref() {
        Some(value) => match std::ffi::CString::new(value) { Ok(value) => value.into_raw(), Err(_) => std::ptr::null_mut() },
        None => std::ptr::null_mut(),
    }
}
#[doc = "flight-ffi contract|Assigns a UTF-8 node.name without implicit invalidation. NULL clears the optional name; invalid UTF-8 returns false and leaves the value unchanged; true means assigned or cleared."]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_set_node_name(node: *mut FlightNode, value: *const std::ffi::c_char) -> bool {
    let Some(node) = (unsafe { ffi_node_handle(node) }) else { return false; };
    let value = if value.is_null() { None } else { match unsafe { std::ffi::CStr::from_ptr(value) }.to_str() { Ok(value) => Some(value.to_owned()), Err(_) => return false } };
    node.node.write().unwrap_or_else(std::sync::PoisonError::into_inner).node_fields_mut().name = value;
    true
}
"#,
            );
        }
    }

    if struct_name == "Node2DFields" {
        let extras = [
            "flight_has_node2d_blend_mode",
            "flight_get_node2d_blend_mode",
            "flight_set_node2d_blend_mode",
            "flight_get_node2d_clip",
            "flight_get_node2d_material",
            "flight_set_node2d_material",
            "flight_get_node2d_material_data",
            "flight_set_node2d_material_data",
            "flight_free_material2_d_ref",
            "flight_free_material_data_ref",
        ];
        if extras
            .iter()
            .all(|name| seen_names.insert((*name).to_string()))
        {
            output.push_str(generate_node2d_field_extras());
        }
    }

    if struct_name == "Node3DFields" {
        for (field, components) in [
            ("position", &["x", "y", "z"][..]),
            ("rotation", &["x", "y", "z", "w"][..]),
            ("scale", &["x", "y", "z"][..]),
        ] {
            for component in components {
                let getter = format!("flight_get_node3d_{field}_{component}");
                let setter = format!("flight_set_node3d_{field}_{component}");
                if seen_names.insert(getter.clone()) {
                    writeln!(output, "#[doc = \"flight-ffi contract|Reads node3d.{field}.{component} through the handle's read lock. NULL or a non-3D handle returns 0.0.\"]\n#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn {getter}(node: *const FlightNode) -> f64 {{\n    let Some(node) = (unsafe {{ ffi_node_handle(node) }}) else {{ return 0.0; }};\n    let Some(view) = node.node3d.as_ref() else {{ return 0.0; }};\n    view.read().unwrap_or_else(std::sync::PoisonError::into_inner).node3d_fields().{field}.{component}\n}}").unwrap();
                }
                if seen_names.insert(setter.clone()) {
                    writeln!(output, "#[doc = \"flight-ffi contract|Assigns node3d.{field}.{component} through the handle's write lock without implicit invalidation. Returns true after assignment; NULL or a non-3D handle returns false and changes nothing.\"]\n#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn {setter}(node: *mut FlightNode, value: f64) -> bool {{\n    let Some(node) = (unsafe {{ ffi_node_handle(node) }}) else {{ return false; }};\n    let Some(view) = node.node3d.as_ref() else {{ return false; }};\n    view.write().unwrap_or_else(std::sync::PoisonError::into_inner).node3d_fields_mut().{field}.{component} = value;\n    true\n}}").unwrap();
                }
            }
        }
        if seen_names.insert("flight_set_node3d_alpha".to_string()) {
            output.push_str(generate_node3d_alpha_setter_wrapper());
        }
    }
    return output;
}

fn generate_node2d_field_extras() -> &'static str {
    r#"#[doc = "flight-ffi contract|Returns whether node2d.blend_mode is present. NULL or a non-2D handle returns false."]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_has_node2d_blend_mode(node: *const FlightNode) -> bool {
    let Some(node) = (unsafe { ffi_node_handle(node) }) else { return false; };
    let Some(view) = node.node2d.as_ref() else { return false; };
    view.read().unwrap_or_else(std::sync::PoisonError::into_inner).node2d_fields().blend_mode.is_some()
}
#[doc = "flight-ffi contract|Reads node2d.blend_mode as 0 ADD, 1 DARKEN, 2 LIGHTEN, 3 MULTIPLY, 4 NORMAL, or 5 SCREEN. Returns -1 when absent, NULL, or wrong-kind; returns -2 for an unknown SDK value."]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_get_node2d_blend_mode(node: *const FlightNode) -> i32 {
    let Some(node) = (unsafe { ffi_node_handle(node) }) else { return -1; };
    let Some(view) = node.node2d.as_ref() else { return -1; };
    let guard = view.read().unwrap_or_else(std::sync::PoisonError::into_inner);
    match guard.node2d_fields().blend_mode.as_deref() {
        None => -1,
        Some(flight_sdk::BLEND_MODE_ADD) => 0,
        Some(flight_sdk::BLEND_MODE_DARKEN) => 1,
        Some(flight_sdk::BLEND_MODE_LIGHTEN) => 2,
        Some(flight_sdk::BLEND_MODE_MULTIPLY) => 3,
        Some(flight_sdk::BLEND_MODE_NORMAL) => 4,
        Some(flight_sdk::BLEND_MODE_SCREEN) => 5,
        Some(_) => -2,
    }
}
#[doc = "flight-ffi contract|Assigns node2d.blend_mode without implicit invalidation. present=false clears it and ignores value. With present=true, values 0..5 select ADD, DARKEN, LIGHTEN, MULTIPLY, NORMAL, SCREEN; any other value returns false and changes nothing. NULL or wrong-kind returns false; true means assigned or cleared."]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_set_node2d_blend_mode(node: *mut FlightNode, value: i32, present: bool) -> bool {
    let Some(node) = (unsafe { ffi_node_handle(node) }) else { return false; };
    let Some(view) = node.node2d.as_ref() else { return false; };
    let value = if !present { None } else { Some(match value {
        0 => flight_sdk::BLEND_MODE_ADD,
        1 => flight_sdk::BLEND_MODE_DARKEN,
        2 => flight_sdk::BLEND_MODE_LIGHTEN,
        3 => flight_sdk::BLEND_MODE_MULTIPLY,
        4 => flight_sdk::BLEND_MODE_NORMAL,
        5 => flight_sdk::BLEND_MODE_SCREEN,
        _ => return false,
    }.to_owned()) };
    view.write().unwrap_or_else(std::sync::PoisonError::into_inner).node2d_fields_mut().blend_mode = value;
    true
}
#[doc = "flight-ffi contract|Returns an owned clone of node2d.clip, or NULL when absent, NULL, or wrong-kind. Release a non-NULL result with flight_free_clip_region_ref."]
#[doc = "flight-ffi ownership|owned-return|flight_free_clip_region_ref|flight_sdk::Ref<flight_sdk::ClipRegion>"]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_get_node2d_clip(node: *const FlightNode) -> *mut std::ffi::c_void {
    let Some(node) = (unsafe { ffi_node_handle(node) }) else { return std::ptr::null_mut(); };
    let Some(view) = node.node2d.as_ref() else { return std::ptr::null_mut(); };
    let guard = view.read().unwrap_or_else(std::sync::PoisonError::into_inner);
    match guard.node2d_fields().clip.clone() {
        Some(value) => Box::into_raw(Box::new(value)) as *mut std::ffi::c_void,
        None => std::ptr::null_mut(),
    }
}
#[doc = "flight-ffi contract|Returns an owned clone of node2d.material, or NULL when absent, NULL, or wrong-kind. Release a non-NULL result with flight_free_material2_d_ref."]
#[doc = "flight-ffi ownership|owned-return|flight_free_material2_d_ref|flight_sdk::Ref<dyn flight_sdk::Material2D>"]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_get_node2d_material(node: *const FlightNode) -> *mut std::ffi::c_void {
    let Some(node) = (unsafe { ffi_node_handle(node) }) else { return std::ptr::null_mut(); };
    let Some(view) = node.node2d.as_ref() else { return std::ptr::null_mut(); };
    let guard = view.read().unwrap_or_else(std::sync::PoisonError::into_inner);
    match guard.node2d_fields().material.clone() { Some(value) => Box::into_raw(Box::new(value)) as *mut std::ffi::c_void, None => std::ptr::null_mut() }
}
#[doc = "flight-ffi contract|Assigns node2d.material without implicit invalidation. NULL clears it; a non-NULL value is cloned. NULL or wrong-kind node handles return false; true means assigned or cleared."]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_set_node2d_material(node: *mut FlightNode, value: *const std::ffi::c_void) -> bool {
    let Some(node) = (unsafe { ffi_node_handle(node) }) else { return false; };
    let Some(view) = node.node2d.as_ref() else { return false; };
    let value = if value.is_null() { None } else { Some(unsafe { &*(value as *const flight_sdk::Ref<dyn flight_sdk::Material2D>) }.clone()) };
    view.write().unwrap_or_else(std::sync::PoisonError::into_inner).node2d_fields_mut().material = value;
    true
}
#[doc = "flight-ffi contract|Returns an owned clone of node2d.material_data, or NULL when absent, NULL, or wrong-kind. Release a non-NULL result with flight_free_material_data_ref."]
#[doc = "flight-ffi ownership|owned-return|flight_free_material_data_ref|flight_sdk::Ref<dyn flight_sdk::MaterialData>"]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_get_node2d_material_data(node: *const FlightNode) -> *mut std::ffi::c_void {
    let Some(node) = (unsafe { ffi_node_handle(node) }) else { return std::ptr::null_mut(); };
    let Some(view) = node.node2d.as_ref() else { return std::ptr::null_mut(); };
    let guard = view.read().unwrap_or_else(std::sync::PoisonError::into_inner);
    match guard.node2d_fields().material_data.clone() { Some(value) => Box::into_raw(Box::new(value)) as *mut std::ffi::c_void, None => std::ptr::null_mut() }
}
#[doc = "flight-ffi contract|Assigns node2d.material_data without implicit invalidation. NULL clears it; a non-NULL value is cloned. NULL or wrong-kind node handles return false; true means assigned or cleared."]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_set_node2d_material_data(node: *mut FlightNode, value: *const std::ffi::c_void) -> bool {
    let Some(node) = (unsafe { ffi_node_handle(node) }) else { return false; };
    let Some(view) = node.node2d.as_ref() else { return false; };
    let value = if value.is_null() { None } else { Some(unsafe { &*(value as *const flight_sdk::Ref<dyn flight_sdk::MaterialData>) }.clone()) };
    view.write().unwrap_or_else(std::sync::PoisonError::into_inner).node2d_fields_mut().material_data = value;
    true
}
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_free_material2_d_ref(value: *mut flight_sdk::Ref<dyn flight_sdk::Material2D>) { if !value.is_null() { unsafe { drop(Box::from_raw(value)); } } }
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_free_material_data_ref(value: *mut flight_sdk::Ref<dyn flight_sdk::MaterialData>) { if !value.is_null() { unsafe { drop(Box::from_raw(value)); } } }
"#
}

fn generate_node2d_clip_setter_wrapper() -> &'static str {
    r#"#[doc = "flight-ffi contract|Calls the SDK set_node2d_clip verb and invalidates node appearance. NULL clears the clip; a non-NULL value is cloned. NULL or wrong-kind node handles return false; true means assigned or cleared."]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_set_node2d_clip(node: *mut FlightNode, value: *const std::ffi::c_void) -> bool {
    let Some(node) = (unsafe { ffi_node_handle(node) }) else { return false; };
    let Some(node2d) = node.node2d.clone() else { return false; };
    let value = if value.is_null() { None } else { Some(unsafe { &*(value as *const flight_sdk::Ref<flight_sdk::ClipRegion>) }.clone()) };
    flight_sdk::set_node2d_clip(&node2d, value);
    true
}"#
}

fn generate_node_enabled_setter_wrapper() -> &'static str {
    r#"#[doc = "flight-ffi contract|Calls the SDK set_node_enabled verb, assigning node.enabled and invalidating the node's appearance, local bounds, local content, local transform, parent reference and world bounds. NULL returns false and changes nothing; true means assigned and invalidated."]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_set_node_enabled(node: *mut FlightNode, value: bool) -> bool {
    let Some(node) = (unsafe { ffi_node_handle(node) }) else { return false; };
    flight_sdk::set_node_enabled(&node.node, value);
    true
}"#
}

fn generate_node3d_alpha_setter_wrapper() -> &'static str {
    r#"#[doc = "flight-ffi contract|Calls the SDK set_node3d_alpha verb, assigning node3d.alpha and invalidating node appearance. NULL or non-3D handles return false and change nothing; true means assigned and invalidated."]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_set_node3d_alpha(node: *mut FlightNode, value: f32) -> bool {
    let Some(node) = (unsafe { ffi_node_handle(node) }) else { return false; };
    if node.node3d.is_none() { return false; }
    flight_sdk::set_node3d_alpha(&node.node, value);
    true
}"#
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
                    r#"#[doc = "flight-ffi contract|Segment kind: 0 move, 1 line, 2 quadratic, 3 cubic, 4 close; unused coordinates are zero. The path is visited as it was when the call began. Callback and context are valid only until this function returns and must not be retained."]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_for_each_path_segment(path: *const std::ffi::c_void, visitor_fn: Option<extern "C" fn(*mut std::ffi::c_void, u32, f64, f64, f64, f64, f64, f64) -> bool>, visitor_ctx: *mut std::ffi::c_void) -> bool {
    if path.is_null() { return false; }
    let Some(visitor_fn) = visitor_fn else { return false; };
    std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        // The visitor runs on a snapshot, so no lock is held while C code runs and the callback
        // may use the same path handle.
        let snapshot = Clone::clone(&*unsafe { &*(path as *const flight_sdk::Ref<flight_sdk::Path>) }.read().unwrap_or_else(std::sync::PoisonError::into_inner));
        flight_sdk::for_each_path_segment(&snapshot, &mut |segment| {
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
    if func.lacks_public_export && !func.state_seam {
        return None;
    }
    if func.name == "connect_signal_at_frame_rate" {
        return Some((generate_signal_at_frame_rate_wrapper(), None));
    }
    if func.name == "connect_interaction_signal" {
        return Some((
            generate_interaction_signal_connect_wrapper(),
            boxed_value_type("Option<SlotId>"),
        ));
    }
    if func.name == "set_node2d_clip" {
        return Some((generate_node2d_clip_setter_wrapper().to_string(), None));
    }
    if func.name == "set_node_enabled" {
        return Some((generate_node_enabled_setter_wrapper().to_string(), None));
    }
    if func.name == "set_node3d_alpha" {
        return Some((generate_node3d_alpha_setter_wrapper().to_string(), None));
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
        .map(|param| get_binding_name(&param.name).to_string());

    // C pointers that lower a Rust `Option`: NULL is a valid argument, so reachability must not
    // treat them as required carriers.
    let mut nullable_params = Vec::new();
    let alias_borrow_pairs = collect_alias_borrow_pairs(func);
    let alias_borrow_groups = collect_alias_borrow_groups(func);
    for (index, param) in func.params.iter().enumerate() {
        let resolved_ty = strip_crate_paths(&strip_lifetimes(&resolve_type_alias(param.ty.trim())));
        if let Some(group) = alias_borrow_groups
            .iter()
            .find(|group| group.iter().any(|member| member.index == index))
        {
            let member = group.iter().find(|member| member.index == index).unwrap();
            ffi_params.push(format!("{}: {}", param.name, member.pointer));
            if group[0].index == index {
                guard_bindings.extend(alias_borrow_group_bindings(group));
            }
            call_args.push(alias_borrow_group_call_expr(group, index));
            continue;
        }
        if let Some(pair) = alias_borrow_pairs
            .iter()
            .find(|pair| pair.first.index == index || pair.second.index == index)
        {
            let paired = if pair.first.index == index {
                &pair.first
            } else {
                &pair.second
            };
            ffi_params.push(format!("{}: {}", param.name, paired.pointer));
            if pair.first.index == index {
                guard_bindings.extend(alias_borrow_pair_bindings(pair));
            }
            call_args.push(alias_borrow_call_expr(pair, index));
            continue;
        }
        let mapped = map_param_to_ffi(&param.name, &param.ty)?;
        for (pname, pty) in &mapped.ffi_params {
            ffi_params.push(format!("{pname}: {pty}"));
            if resolved_ty.starts_with("Option<") && pty.starts_with('*') {
                nullable_params.push(pname.clone());
            }
        }
        guard_bindings.extend(mapped.bindings);
        call_args.push(mapped.call_expr);
        if resolved_ty == "&mut ByteReader<>" || resolved_ty == "&mut ByteReader" {
            let clean = get_binding_name(&param.name);
            reader_writebacks.push(format!(
                "        ffi_owned_{clean}.offset = sdk_{clean}.offset;"
            ));
        }

        let ty = resolved_ty;
        if let Some(trait_name) = extract_dyn_trait(&ty) {
            if matches!(trait_name.as_str(), "Node" | "Node2D" | "Node3D") {
                continue;
            }
            if let Some((_, ref_alias)) = DYN_OPAQUE_TRAITS.iter().find(|(n, _)| *n == trait_name) {
                let qualified_ref = qualify_type(ref_alias);
                let name = &param.name;
                let clean = get_binding_name(name);
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
    let invalid_return = invalid_parameter_return(&call_wrap);
    for binding in &mut guard_bindings {
        *binding = binding.replace(INVALID_NODE_RETURN, invalid_return);
    }
    // A returned disposer maps only for an allowlisted, callback-free call; the type alone is not
    // consent.
    if matches!(call_wrap, FfiReturn::DisposerReturn) {
        let param_types: Vec<String> = func
            .params
            .iter()
            .map(|param| strip_crate_paths(&resolve_type_alias(param.ty.trim())))
            .collect();
        let param_types: Vec<&str> = param_types.iter().map(String::as_str).collect();
        if !public_perimeter::is_disposer_function(&func.name, &param_types) {
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
            | FfiReturn::NodeReturn(_)
            | FfiReturn::OptionNodeReturn(_)
            | FfiReturn::NodeArrayReturn(_)
            | FfiReturn::ArrayOutReturn(_)
            | FfiReturn::PortsOutcomeReturn(_)
    ) && boxed_ty.is_none()
    {
        return None;
    }

    let ffi_name = format!("flight_{}", func.name);
    let mut call = wrap_canonical_call(
        func,
        format!(
            "{function}({args})",
            function = sdk_function_path(func),
            args = call_args.join(", ")
        ),
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
    for param in &nullable_params {
        notes.push_str(&format!(
            "#[doc = \"{NULLABLE_PARAM_DOC_PREFIX}{param}\"]\n"
        ));
    }
    for param in &func.params {
        if let Some(kind) = optional_node_ref_slice_kind(&param.ty) {
            let required_view = match kind {
                NodeKind::Node => "Node",
                NodeKind::Node2D => "Node2D",
                NodeKind::Node3D => "Node3D",
            };
            notes.push_str(&format!(
                "#[doc = \"flight-ffi contract|Parameter {name} is a borrowed FlightNode pointer array: {name}_ptr may be NULL only when {name}_len is 0; NULL elements become None; every non-NULL element must provide the {required_view} view or the function returns its invalid-parameter sentinel without calling the SDK. The array and every handle remain caller-owned and need only stay alive for this call.\"]\n",
                name = param.name
            ));
        }
    }
    if !alias_borrow_pairs.is_empty() {
        notes.push_str("#[doc = \"flight-ffi contract|Borrowed handles are compared by allocation before locking. Shared aliases take one read lock; any pair containing a mutable borrow returns this function's ordinary invalid-parameter sentinel when both handles refer to one allocation. Distinct allocations are locked in allocation order.\"]\n");
    }
    if func.name == "watch_geolocation_position" {
        notes.push_str("#[doc = \"flight-ffi contract|Handler and error contexts are retained until flight_clear_geolocation_watch(id); each nullable release callback then receives its context exactly once, when the host drops that callback, and the caller must keep a context alive until it is released.\"]\n");
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
            | FfiReturn::NodeReturn(_)
            | FfiReturn::OptionNodeReturn(_)
            | FfiReturn::NodeArrayReturn(_)
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
                if is_ref_only_borrow_type(concrete_ty) {
                    let clean = get_binding_name(name);
                    let mutable = ty.starts_with("&mut ") || ty.starts_with("Option<&mut ");
                    let optional = ty.starts_with("Option<");
                    ffi_params.push(format!(
                        "{name}: {} std::ffi::c_void",
                        if mutable { "*mut" } else { "*const" }
                    ));
                    if optional {
                        bindings.push(if mutable {
                            format!("    let mut guard_{clean} = if {name}.is_null() {{ None }} else {{ Some(unsafe {{ &*({name} as *const flight_sdk::Ref<{qualified}>) }}.write().unwrap_or_else(std::sync::PoisonError::into_inner)) }};")
                        } else {
                            format!("    let guard_{clean} = if {name}.is_null() {{ None }} else {{ Some(unsafe {{ &*({name} as *const flight_sdk::Ref<{qualified}>) }}.read().unwrap_or_else(std::sync::PoisonError::into_inner)) }};")
                        });
                        call_args.push(if mutable {
                            format!("guard_{clean}.as_deref_mut().map(|value| value as &mut dyn {QUALIFIER}::{trait_name})")
                        } else {
                            format!("guard_{clean}.as_deref().map(|value| value as &dyn {QUALIFIER}::{trait_name})")
                        });
                    } else {
                        bindings.push(format!(
                            "    if {name}.is_null() {{ {INVALID_NODE_RETURN} }}"
                        ));
                        bindings.push(if mutable {
                            format!("    let mut guard_{clean} = unsafe {{ &*({name} as *const flight_sdk::Ref<{qualified}>) }}.write().unwrap_or_else(std::sync::PoisonError::into_inner);")
                        } else {
                            format!("    let guard_{clean} = unsafe {{ &*({name} as *const flight_sdk::Ref<{qualified}>) }}.read().unwrap_or_else(std::sync::PoisonError::into_inner);")
                        });
                        call_args.push(format!(
                            "{}*guard_{clean} as {}dyn {QUALIFIER}::{trait_name}",
                            if mutable { "&mut " } else { "&" },
                            if mutable { "&mut " } else { "&" }
                        ));
                    }
                } else if ty.starts_with("Option<&mut ") {
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
        let invalid_return = invalid_parameter_return(&call_wrap);
        for binding in &mut bindings {
            *binding = binding.replace(INVALID_NODE_RETURN, invalid_return);
        }
        append_tuple_out_params(&mut ffi_params, &call_wrap);
        append_borrowed_slice_out_param(&mut ffi_params, &call_wrap);

        let call = wrap_canonical_call(
            func,
            format!(
                "{function}({args})",
                function = sdk_function_path(func),
                args = call_args.join(", ")
            ),
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
    NodeReturn(NodeReturnSpec),
    OptionNodeReturn(NodeReturnSpec),
    NodeArrayReturn(NodeKind),
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

#[derive(Clone)]
struct NodeReturnSpec {
    kind: NodeKind,
    concrete: Option<String>,
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

fn invalid_parameter_return(value: &FfiReturn) -> &'static str {
    match value {
        FfiReturn::SharedClone(value) => invalid_parameter_return(value),
        // An async wrapper refuses inside the closure that builds its future, then completes the
        // callback once with the refusal.
        FfiReturn::AsyncCallback(_) => "return None;",
        FfiReturn::Void | FfiReturn::TupleReturn(_) | FfiReturn::ArrayOutReturn(_) => "return;",
        FfiReturn::OptionTupleReturn(_) => "return false;",
        FfiReturn::BorrowedSliceReturn => "return std::ptr::null();",
        FfiReturn::OptionEnumReturn | FfiReturn::OptionU32Return | FfiReturn::OptionBoolReturn => {
            "return -1;"
        }
        FfiReturn::OptionF32Return => "return f32::NAN;",
        FfiReturn::OptionF64Return => "return f64::NAN;",
        FfiReturn::OptionI32Return => "return i64::MIN;",
        FfiReturn::Direct | FfiReturn::EnumReturn | FfiReturn::OperationOutcomeReturn => {
            "return Default::default();"
        }
        FfiReturn::BoxReturn
        | FfiReturn::OptionBoxReturn
        | FfiReturn::StringReturn
        | FfiReturn::OptionStringReturn
        | FfiReturn::ArcRefReturn
        | FfiReturn::OptionArcRefReturn
        | FfiReturn::NodeReturn(_)
        | FfiReturn::OptionNodeReturn(_)
        | FfiReturn::NodeArrayReturn(_)
        | FfiReturn::OwnedByteReaderReturn
        | FfiReturn::EffectInputSliceReturn
        | FfiReturn::EffectKindSliceReturn
        | FfiReturn::VecReturn(_)
        | FfiReturn::OptionVecReturn(_)
        | FfiReturn::HashMapReturn(_)
        | FfiReturn::OptionHashMapReturn(_)
        | FfiReturn::BoxSliceReturn(_)
        | FfiReturn::OptionBoxSliceReturn(_)
        | FfiReturn::SliceReturn(_)
        | FfiReturn::RefReturn
        | FfiReturn::OptionRefReturn
        | FfiReturn::OptionBorrowedRefReturn
        | FfiReturn::NestedVecReturn(_)
        | FfiReturn::PortsOutcomeReturn(_)
        | FfiReturn::StringRecordReturn
        | FfiReturn::DisposerReturn => "return std::ptr::null_mut();",
    }
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
        "    let future = match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {{\n{preamble}    Some({call})\n    }})) {{\n        \
                 Ok(Some(future)) => future,\n        \
                 Ok(None) => {{\n            \
                     complete_fn(complete_ctx, {empty}, crate::async_callback::get_ffi_async_refusal_string());\n            \
                     return;\n        \
                 }}\n        \
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
        FfiReturn::NodeReturn(spec) => {
            let constructor = node_handle_constructor(spec, call);
            format!("{preamble}    return Box::into_raw(Box::new({constructor}));")
        }
        FfiReturn::OptionNodeReturn(spec) => {
            let constructor = node_handle_constructor(spec, "node");
            format!(
                "{preamble}    match {call} {{\n        \
                     Some(node) => Box::into_raw(Box::new({constructor})),\n        \
                     None => std::ptr::null_mut(),\n    \
                     }}"
            )
        }
        FfiReturn::NodeArrayReturn(kind) => {
            let map = match kind {
                NodeKind::Node => "ffi_node_ref_from_node",
                NodeKind::Node2D => "ffi_node_ref_from_node2d",
                NodeKind::Node3D => "ffi_node_ref_from_node3d",
            };
            format!(
                "{preamble}    let values = {call}.into_iter().map({map}).collect();\n    \
                     return Box::into_raw(Box::new(FlightNodeArray {{ values }}));"
            )
        }
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
        FfiReturn::ArrayOutReturn(element) => {
            let value = if element.starts_with("flight_sdk::Ref<") {
                "std::sync::Arc::new(std::sync::RwLock::new(value))"
            } else {
                "value"
            };
            format!(
                "{preamble}    let values = {call};\n    \
                     if out_values.is_null() {{ return; }}\n    \
                     for (index, value) in values.into_iter().enumerate() {{\n        \
                         unsafe {{ *out_values.add(index) = Box::into_raw(Box::new({value})) as *mut std::ffi::c_void; }}\n    \
                     }}"
            )
        }
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

fn node_handle_constructor(spec: &NodeReturnSpec, value: &str) -> String {
    if spec.concrete.is_some() {
        return match spec.kind {
            NodeKind::Node => format!("ffi_node_from_concrete({value})"),
            NodeKind::Node2D => format!("ffi_node_from_concrete_2d({value})"),
            NodeKind::Node3D => format!("ffi_node_from_concrete_3d({value})"),
        };
    }
    return match spec.kind {
        NodeKind::Node => format!("ffi_node_from_node_ref({value})"),
        NodeKind::Node2D => format!("ffi_node_from_node2d_ref({value})"),
        NodeKind::Node3D => format!("ffi_node_from_node3d_ref({value})"),
    };
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

// Item C retained signal callbacks. Every `flight_connect_*_signal` wrapper funnels into
// `ffi_connect_signal`, so one teardown mechanism serves every payload:
// - The slot closure owns an `FfiSignalCallbackRelease` guard; its `Drop` calls `release(ctx)`.
// - The guard lives exactly as long as the slot, so `release` runs exactly once, when the last
//   reference to the slot goes away: `flight_disconnect_signal_connection`, freeing a still-connected
//   handle (`flight_free_signal_connection` disconnects first), a `once` slot firing, scope
//   teardown, or the signal being cleared or disposed. A callback already in flight on another
//   thread keeps the slot alive until it returns, so `release` never overlaps or precedes a call,
//   and the callback can never run after `release`.
// - Callbacks run synchronously on the thread that emits the signal.
// Task M's lowering of one connectable payload into the C callback: the payload's Rust type, the
// callback's extra C parameters, the call arguments, and the slot closure's payload binding name.
fn get_signal_callback_lowering(payload: &str) -> (String, String, String, &'static str) {
    let class = get_signal_payload_class(payload)
        .unwrap_or_else(|| panic!("connect payload `{payload}` has no Task M class"));
    let rust_ty = get_signal_payload_rust_type(payload);
    let (callback_args, call_args) = match class {
        "unit" => (String::new(), String::new()),
        "scalar" => (format!(", {payload}"), ", *payload".to_string()),
        "enum-u32" => (", u32".to_string(), ", *payload as u32".to_string()),
        "borrowed-struct" => (
            format!(", *const {rust_ty}"),
            format!(", payload as *const {rust_ty}"),
        ),
        "borrowed-ref-handle" => (
            ", *const std::ffi::c_void".to_string(),
            format!(", payload as *const {rust_ty} as *const std::ffi::c_void"),
        ),
        other => panic!("unknown signal payload class `{other}`"),
    };
    let payload_name = if call_args.is_empty() {
        "_payload"
    } else {
        "payload"
    };
    (rust_ty, callback_args, call_args, payload_name)
}

// The Rust type a connectable payload names inside `flight_sdk::Signal<...>`.
fn get_signal_payload_rust_type(payload: &str) -> String {
    if payload == "()" || is_scalar(payload) {
        return payload.to_string();
    }
    if let Some(inner) = payload
        .strip_prefix("Ref<")
        .and_then(|rest| rest.strip_suffix('>'))
    {
        return format!("{QUALIFIER}::Ref<{}>", qualify_type(inner));
    }
    qualify_type(payload)
}

// How C reaches one inventoried signal: `function` (the SDK function itself crosses),
// `ref-connect` (a lock-scoped connect on an owner C holds as a shared `Ref` handle), `get` (a
// borrowed field getter), `get+enable` (an optional input signal on an `*Options` struct, which C
// creates in place before passing the options), or `skip:<reason>`. Producers hand out borrowed
// pointers to the owner's own field, never `Signal` clones: a clone owns a separate emit cell, so
// after the last disconnect resets one handle's cell, a reconnect through another handle is not
// reached by emits through the first.
fn get_signal_producer_decision(entry: &SignalInventoryEntry) -> String {
    if entry.item.starts_with("fn ") {
        return "function".to_string();
    }
    let policy = SIGNAL_PAYLOAD_POLICIES
        .iter()
        .find(|(payload, _)| *payload == entry.payload)
        .map(|(_, decision)| *decision)
        .unwrap_or("skip:unclassified");
    if policy != "connect" {
        return "skip:payload has no connect wrapper".to_string();
    }
    if entry.declared.starts_with("Arc<dyn Fn") {
        return "skip:host capability construction is withdrawn from the alpha ABI (Task S)"
            .to_string();
    }
    let payload = &entry.payload;
    let (owner, _) = entry.item.split_once('.').unwrap();
    let shapes = [
        format!("Signal<{payload}>"),
        format!("Ref<Signal<{payload}>>"),
        format!("Option<Signal<{payload}>>"),
        format!("Option<Ref<Signal<{payload}>>>"),
    ];
    if REF_OWNED_SIGNAL_OWNERS
        .get()
        .is_some_and(|owners| owners.contains(owner))
        && shapes.contains(&entry.declared)
    {
        return "ref-connect".to_string();
    }
    if [
        format!("Signal<{payload}>"),
        format!("Ref<Signal<{payload}>>"),
    ]
    .contains(&entry.declared)
    {
        return "get".to_string();
    }
    if [
        format!("Option<Signal<{payload}>>"),
        format!("Option<Ref<Signal<{payload}>>>"),
    ]
    .contains(&entry.declared)
    {
        return if owner.ends_with("Options") {
            "get+enable".to_string()
        } else {
            "get".to_string()
        };
    }
    panic!(
        "signal field {} declares `{}`, which has no producer rule",
        entry.item, entry.declared
    );
}

// Borrowed producers for every connectable signal field. The getter takes the owner the way the
// existing field accessors do (`*const Owner`) and returns a pointer into the owner's field;
// `Ref<Signal<T>>` fields return a pointer to the signal inside the shared cell, which lives as long
// as the owner's handle on it.
fn generate_signal_field_producers(inventory: &[SignalInventoryEntry]) -> String {
    let mut out = String::new();
    let mut names = BTreeSet::new();
    for entry in inventory {
        let decision = get_signal_producer_decision(entry);
        if decision == "ref-connect" {
            out.push_str(&generate_signal_ref_connect(entry, &mut names));
            continue;
        }
        if decision != "get" && decision != "get+enable" {
            continue;
        }
        let (owner, field) = entry.item.split_once('.').unwrap();
        let owner_ty = qualify_type(owner);
        let signal_ty = format!(
            "{QUALIFIER}::Signal<{}>",
            get_signal_payload_rust_type(&entry.payload)
        );
        let base = format!("{}_{field}", to_snake_case(owner));
        assert!(
            names.insert(base.clone()),
            "two signal producers share flight_get_{base}"
        );
        let borrowed = borrowed_ownership_doc(&format!(
            "the {owner} owner remains alive and its {field} field is not reassigned"
        ));
        let optional = entry.declared.starts_with("Option<");
        let shared = entry.declared.contains("Ref<Signal<");
        let borrow = if shared {
            format!("{{ let guard = signal.read().unwrap(); &*guard as *const {signal_ty} }}")
        } else {
            format!("signal as *const {signal_ty}")
        };
        let read = if optional {
            format!(
                "match &unsafe {{ &*owner }}.{field} {{ Some(signal) => {borrow}, None => std::ptr::null() }}"
            )
        } else {
            format!("{{ let signal = &unsafe {{ &*owner }}.{field}; {borrow} }}")
        };
        writeln!(
            out,
            "#[doc = \"flight-ffi contract|Returns a borrowed pointer to the {owner}.{field} signal for the flight_connect_*_signal wrappers; it is valid while the owner is alive and the field is not reassigned, and the caller never frees it. NULL owner{absent} returns NULL.\"]\n\
             {borrowed}#[unsafe(no_mangle)]\n\
             pub unsafe extern \"C\" fn flight_get_{base}(owner: *const {owner_ty}) -> *const {signal_ty} {{\n    \
                 if owner.is_null() {{ return std::ptr::null(); }}\n    \
                 return {read};\n\
             }}",
            absent = if optional { ", or an absent signal," } else { "" },
            borrowed = borrowed,
        )
        .unwrap();
        if decision != "get+enable" {
            continue;
        }
        let create = if shared {
            format!(
                "|| {QUALIFIER}::Ref::new(std::sync::RwLock::new({QUALIFIER}::create_signal()))"
            )
        } else {
            format!("{QUALIFIER}::create_signal")
        };
        writeln!(
            out,
            "#[doc = \"flight-ffi contract|Creates the optional {owner}.{field} signal if it is absent and returns a borrowed pointer to it, valid while the owner is alive and the field is not reassigned; the caller never frees it. Connect before passing the options to the call that emits through them. NULL owner returns NULL.\"]\n\
             {borrowed}#[unsafe(no_mangle)]\n\
             pub unsafe extern \"C\" fn flight_enable_{base}(owner: *mut {owner_ty}) -> *const {signal_ty} {{\n    \
                 if owner.is_null() {{ return std::ptr::null(); }}\n    \
                 let signal = unsafe {{ &mut *owner }}.{field}.get_or_insert_with({create});\n    \
                 return {borrow};\n\
             }}"
        )
        .unwrap();
    }
    out
}

// A lock-scoped connect for one signal field of an owner C holds as a shared `Ref` handle: the
// handle is read-locked only while the connection is made, and the connection reaches the signal
// weakly, so dropping the last owner handle drops the signal and releases the context once.
fn generate_signal_ref_connect(
    entry: &SignalInventoryEntry,
    names: &mut BTreeSet<String>,
) -> String {
    let (owner, field) = entry.item.split_once('.').unwrap();
    let owner_ty = qualify_type(owner);
    let (rust_ty, callback_args, call_args, payload_name) =
        get_signal_callback_lowering(&entry.payload);
    let base = format!("{}_{field}", to_snake_case(owner));
    assert!(
        names.insert(base.clone()),
        "two signal producers share flight_connect_{base}"
    );
    let optional = entry.declared.starts_with("Option<");
    let shared = entry.declared.contains("Ref<Signal<");
    let signal_ty = format!("{QUALIFIER}::Signal<{rust_ty}>");
    let reach = signal_ref_connect::get_ref_connect_reach(field, optional, shared, &signal_ty);
    let release = if reach.release.is_empty() {
        String::new()
    } else {
        format!("{}\n    ", reach.release)
    };
    let mut out = String::new();
    writeln!(
        out,
        "#[doc = \"flight-ffi contract|Connects callback_fn to the {owner}.{field} signal of a shared {owner} handle, which is read-locked only while the connection is made. NULL owner{absent} returns NULL without calling release_fn. Callback, release and teardown follow flight_connect_{stem}_signal; dropping the last {owner} handle drops the signal and releases the context once.\"]\n\
         #[doc = \"flight-ffi ownership|owned-return|flight_free_signal_connection|flight_sdk::SignalConnection\"]\n\
         #[doc = \"{NULLABLE_PARAM_DOC_PREFIX}scope\"]\n\
         #[unsafe(no_mangle)]\n\
         pub unsafe extern \"C\" fn flight_connect_{base}(owner: *const std::ffi::c_void, callback_fn: Option<extern \"C\" fn(*mut std::ffi::c_void{callback_args})>, callback_ctx: *mut std::ffi::c_void, release_fn: Option<extern \"C\" fn(*mut std::ffi::c_void)>, priority: i32, once: bool, scope: *const {QUALIFIER}::SignalScope) -> *mut {QUALIFIER}::SignalConnection {{\n    \
             if owner.is_null() {{ return std::ptr::null_mut(); }}\n    \
             let Some(callback) = callback_fn else {{ return std::ptr::null_mut(); }};\n    \
             let owner = unsafe {{ &*(owner as *const {QUALIFIER}::Ref<{owner_ty}>) }};\n    \
             let guard = owner.read().unwrap();\n    \
             {bind}\n    \
             let connection = ffi_connect_signal(signal, callback_ctx, release_fn, priority, once, scope, move |ctx, {payload_name}: &{rust_ty}| callback(ctx{call_args}));\n    \
             {release}drop(guard);\n    \
             return connection;\n\
         }}",
        absent = if optional { ", an absent signal," } else { "" },
        bind = reach.bind,
        stem = get_signal_payload_stem(&entry.payload),
    )
    .unwrap();
    out
}

// One `flight_connect_<payload>_signal` per `connect` policy. The callback receives the context
// first, then the payload lowered by its Task M class; the returned connection is owned by C and
// freed (which disconnects) with `flight_free_signal_connection`.
fn generate_signal_connect_wrappers() -> String {
    let mut out = String::new();
    for (payload, decision) in SIGNAL_PAYLOAD_POLICIES {
        if *decision != "connect" {
            continue;
        }
        let (rust_ty, callback_args, call_args, payload_name) =
            get_signal_callback_lowering(payload);
        let stem = get_signal_payload_stem(payload);
        writeln!(
            out,
            "#[doc = \"flight-ffi contract|{SIGNAL_CONNECT_CONTRACT}\"]\n\
             #[doc = \"flight-ffi ownership|owned-return|flight_free_signal_connection|flight_sdk::SignalConnection\"]\n\
             #[doc = \"{NULLABLE_PARAM_DOC_PREFIX}scope\"]\n\
             #[unsafe(no_mangle)]\n\
             pub unsafe extern \"C\" fn flight_connect_{stem}_signal(signal: *const {QUALIFIER}::Signal<{rust_ty}>, callback_fn: Option<extern \"C\" fn(*mut std::ffi::c_void{callback_args})>, callback_ctx: *mut std::ffi::c_void, release_fn: Option<extern \"C\" fn(*mut std::ffi::c_void)>, priority: i32, once: bool, scope: *const {QUALIFIER}::SignalScope) -> *mut {QUALIFIER}::SignalConnection {{\n    \
                 let Some(callback) = callback_fn else {{ return std::ptr::null_mut(); }};\n    \
                 return ffi_connect_signal(signal, callback_ctx, release_fn, priority, once, scope, move |ctx, {payload_name}: &{rust_ty}| callback(ctx{call_args}));\n\
             }}"
        )
        .unwrap();
    }
    out
}

// `connect_signal_at_frame_rate` shares the signal connection teardown contract (one owned
// `SignalConnection`, context released exactly once) instead of the generic disposer lowering, so
// its wrapper is written here and counted as that source's generated wrapper.
// `connect_interaction_signal` decides acceptance before anything is retained: the name is decoded
// against the pointer signals alone (`slot` takes PointerEventData), so a focus or key name, or a
// value that is no InteractionSignalName at all, returns NULL before the callback is wrapped, and
// its context is never released because nothing took ownership of it. The accepted set is pinned
// against the SDK's own rule by interaction_signal_runtime_test.
fn generate_interaction_signal_connect_wrapper() -> String {
    let names = INTERACTION_POINTER_SIGNAL_NAMES
        .iter()
        .map(|name| format!("{QUALIFIER}::InteractionSignalName::{name}"))
        .collect::<Vec<_>>()
        .join(", ");
    return format!(
        r#"#[doc = "flight-ffi contract|{INTERACTION_SIGNAL_CONNECT_CONTRACT}"]
#[doc = "flight-ffi nullable|options"]
#[doc = "flight-ffi ownership|owned-return|flight_free_slot_id|flight_sdk::SlotId"]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_connect_interaction_signal(manager: *const std::ffi::c_void, target: *const FlightNode, name: u32, slot_fn: Option<extern "C" fn(*mut std::ffi::c_void, *const {QUALIFIER}::PointerEventData)>, slot_ctx: *mut std::ffi::c_void, slot_release: Option<extern "C" fn(*mut std::ffi::c_void)>, options: *const {QUALIFIER}::SignalConnectOptions) -> *mut {QUALIFIER}::SlotId {{
    let Some(name) = [{names}].into_iter().find(|pointer| *pointer as u32 == name) else {{
        return std::ptr::null_mut();
    }};
    if manager.is_null() || target.is_null() {{
        return std::ptr::null_mut();
    }}
    let Some(callback) = slot_fn else {{
        return std::ptr::null_mut();
    }};
    let Some(target) = (unsafe {{ ffi_node_handle(target) }}) else {{
        return std::ptr::null_mut();
    }};
    let target = target.node.clone();
    let guard = FfiSignalCallbackRelease {{ ctx: slot_ctx as usize, release: slot_release }};
    let slot: {QUALIFIER}::AnyInteractionSignalSlot = std::sync::Arc::new(move |event: &{QUALIFIER}::PointerEventData| callback(guard.ctx(), event));
    let manager = unsafe {{ &*(manager as *const {QUALIFIER}::Ref<{QUALIFIER}::InteractionManager>) }};
    let options = if options.is_null() {{ None }} else {{ Some(unsafe {{ &*options }}) }};
    return match {QUALIFIER}::connect_interaction_signal(manager, &target, name, slot, options) {{
        Some(id) => Box::into_raw(Box::new(id)),
        None => std::ptr::null_mut(),
    }};
}}"#
    );
}

// The InteractionSignalName variants whose payload is PointerEventData, in declaration order.
const INTERACTION_POINTER_SIGNAL_NAMES: &[&str] = &[
    "OnClick",
    "OnContextMenu",
    "OnDoubleClick",
    "OnPointerCancel",
    "OnPointerDoubleClick",
    "OnPointerDown",
    "OnPointerMove",
    "OnPointerOut",
    "OnPointerOver",
    "OnPointerRollOut",
    "OnPointerRollOver",
    "OnPointerUp",
    "OnReleaseOutside",
    "OnWheel",
];

// The header contract `flight_connect_interaction_signal` carries.
const INTERACTION_SIGNAL_CONNECT_CONTRACT: &str = "Connects slot_fn(slot_ctx, event) to the name pointer signal of target and counts it as a subscriber of manager, returning the registration flight_disconnect_interaction_signal takes. name must be a pointer InteractionSignalName: a focus or key name, or a value that is no InteractionSignalName, returns NULL, as does a NULL manager, target or slot_fn; nothing is then connected, counted or retained, and slot_release is never called. Once connected, slot_release(slot_ctx) runs exactly once, with no manager or signal lock held, when the registration is disconnected, a once connection has been called, or the target's signal is dropped. NULL options connects at default priority, repeating.";

fn generate_signal_at_frame_rate_wrapper() -> String {
    return format!(
        r#"#[doc = "flight-ffi contract|{SIGNAL_AT_FRAME_RATE_CONTRACT}"]
#[doc = "flight-ffi ownership|owned-return|flight_free_signal_connection|flight_sdk::SignalConnection"]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_connect_signal_at_frame_rate(source: *const flight_sdk::Signal<flight_sdk::FrameTick>, fps: f64, callback_fn: Option<extern "C" fn(*mut std::ffi::c_void, f64)>, callback_ctx: *mut std::ffi::c_void, release_fn: Option<extern "C" fn(*mut std::ffi::c_void)>) -> *mut flight_sdk::SignalConnection {{
    if source.is_null() {{
        return std::ptr::null_mut();
    }}
    let Some(callback) = callback_fn else {{
        return std::ptr::null_mut();
    }};
    let guard = FfiSignalCallbackRelease {{ ctx: callback_ctx as usize, release: release_fn }};
    let slot: std::sync::Arc<dyn Fn(f64) + Send + Sync> = std::sync::Arc::new(move |total: f64| callback(guard.ctx(), total));
    let connection = flight_sdk::signals::contract::connect_signal_at_frame_rate_tracked(unsafe {{ &*source }}, fps, slot, None);
    return Box::into_raw(Box::new(connection));
}}"#
    );
}

// The header contract `flight_connect_signal_at_frame_rate` carries.
const SIGNAL_AT_FRAME_RATE_CONTRACT: &str = "Connects callback_fn(callback_ctx, accumulated_ms) to a FrameTick signal at a reduced frame rate and returns an owned connection; NULL source or callback_fn returns NULL without calling release_fn. Teardown matches flight_connect_*_signal: release_fn(callback_ctx) runs exactly once, with no signal lock held, when flight_free_signal_connection or flight_disconnect_signal_connection disconnects it, the source is cleared, or the last handle to the source is dropped; the callback never runs after it. Callbacks run on the emitting thread, and the connection reports disconnected as soon as it is torn down, even while a callback already running on another thread finishes.";

fn generate_signal_connection_support() -> &'static str {
    r#"struct FfiSignalCallbackRelease {
    ctx: usize,
    release: Option<extern "C" fn(*mut std::ffi::c_void)>,
}
// Slots read the context through this method so the closure captures the whole guard: a field
// read (`guard.ctx`) captures only the `usize` under edition 2021+ disjoint capture, which drops
// the guard, and releases the context, as soon as the connect call returns.
impl FfiSignalCallbackRelease {
    fn ctx(&self) -> *mut std::ffi::c_void {
        return self.ctx as *mut std::ffi::c_void;
    }
}
impl Drop for FfiSignalCallbackRelease {
    fn drop(&mut self) {
        if let Some(release) = self.release {
            release(self.ctx as *mut std::ffi::c_void);
        }
    }
}
// Connects `invoke` (the payload lowering of one wrapper) to `signal` and returns the owned
// connection. NULL signal or callback returns NULL without connecting and without calling
// `release`: the caller still owns the context.
fn ffi_connect_signal<T: 'static>(
    signal: *const flight_sdk::Signal<T>,
    ctx: *mut std::ffi::c_void,
    release: Option<extern "C" fn(*mut std::ffi::c_void)>,
    priority: i32,
    once: bool,
    scope: *const flight_sdk::SignalScope,
    invoke: impl Fn(*mut std::ffi::c_void, &T) + Send + Sync + 'static,
) -> *mut flight_sdk::SignalConnection {
    if signal.is_null() {
        return std::ptr::null_mut();
    }
    let guard = FfiSignalCallbackRelease { ctx: ctx as usize, release };
    let slot: flight_sdk::SignalSlot<T> = std::sync::Arc::new(move |payload: &T| {
        invoke(guard.ctx(), payload);
    });
    let options = flight_sdk::SignalTrackedConnectOptions {
        priority: Some(priority),
        once: Some(once),
        scope: if scope.is_null() { None } else { Some(unsafe { (*scope).clone() }) },
    };
    let connection = flight_sdk::connect_signal_tracked(unsafe { &*signal }, slot, Some(&options));
    return Box::into_raw(Box::new(connection));
}
#[doc = "flight-ffi contract|Disconnects the connection if it is still connected, which releases the callback context exactly once, then frees the handle. NULL is a no-op."]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_free_signal_connection(connection: *mut flight_sdk::SignalConnection) {
    if connection.is_null() {
        return;
    }
    let connection = unsafe { Box::from_raw(connection) };
    flight_sdk::disconnect_signal_connection(&connection);
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

fn generate_node_handle_support() -> &'static str {
    r#"pub struct FfiNodeHandle {
    node: flight_sdk::NodeRef,
    node2d: Option<flight_sdk::Node2DRef>,
    node3d: Option<flight_sdk::Node3DRef>,
    concrete: Option<Box<dyn std::any::Any + Send + Sync>>,
}
pub type FlightNode = FfiNodeHandle;

pub struct FlightNodeArray {
    values: Vec<flight_sdk::NodeRef>,
}

fn ffi_node_from_node_ref(node: flight_sdk::NodeRef) -> FlightNode {
    let node2d = flight_sdk::as_node2d_ref(&node);
    let node3d = flight_sdk::as_node3d_ref(&node);
    FlightNode { node, node2d, node3d, concrete: None }
}
fn ffi_node_from_node2d_ref(node2d: flight_sdk::Node2DRef) -> FlightNode {
    let node: flight_sdk::NodeRef = node2d.clone();
    FlightNode { node, node2d: Some(node2d), node3d: None, concrete: None }
}
#[allow(dead_code)]
fn ffi_node_from_node3d_ref(node3d: flight_sdk::Node3DRef) -> FlightNode {
    let node: flight_sdk::NodeRef = node3d.clone();
    FlightNode { node, node2d: None, node3d: Some(node3d), concrete: None }
}
#[allow(dead_code)]
fn ffi_node_from_concrete<T: flight_sdk::Node + 'static>(value: flight_sdk::Ref<T>) -> FlightNode {
    let node: flight_sdk::NodeRef = value.clone();
    FlightNode { node, node2d: None, node3d: None, concrete: Some(Box::new(value)) }
}
fn ffi_node_from_concrete_2d<T: flight_sdk::Node2D + 'static>(value: flight_sdk::Ref<T>) -> FlightNode {
    let node: flight_sdk::NodeRef = value.clone();
    let node2d: flight_sdk::Node2DRef = value.clone();
    FlightNode { node, node2d: Some(node2d), node3d: None, concrete: Some(Box::new(value)) }
}
fn ffi_node_from_concrete_3d<T: flight_sdk::Node3D + 'static>(value: flight_sdk::Ref<T>) -> FlightNode {
    let node: flight_sdk::NodeRef = value.clone();
    let node3d: flight_sdk::Node3DRef = value.clone();
    FlightNode { node, node2d: None, node3d: Some(node3d), concrete: Some(Box::new(value)) }
}
fn ffi_node_ref_from_node(value: flight_sdk::NodeRef) -> flight_sdk::NodeRef { value }
#[allow(dead_code)]
fn ffi_node_ref_from_node2d(value: flight_sdk::Node2DRef) -> flight_sdk::NodeRef { value }
#[allow(dead_code)]
fn ffi_node_ref_from_node3d(value: flight_sdk::Node3DRef) -> flight_sdk::NodeRef { value }
unsafe fn ffi_node_handle<'a>(node: *const FlightNode) -> Option<&'a FlightNode> {
    if node.is_null() { return None; }
    Some(unsafe { &*node })
}
fn ffi_node_concrete<T: flight_sdk::Node + 'static>(node: &FlightNode) -> Option<flight_sdk::Ref<T>> {
    node.concrete
        .as_ref()
        .and_then(|value| value.downcast_ref::<flight_sdk::Ref<T>>())
        .cloned()
        .or_else(|| flight_sdk::downcast_node_ref::<T>(&node.node))
}
#[doc = "flight-ffi contract|FlightNode is an owned handle containing one shared reference, not the node allocation itself. The node remains alive while its graph or any handle retains it. flight_node_equals compares the underlying allocation, not handle addresses; NULL compares false."]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_node_equals(a: *const FlightNode, b: *const FlightNode) -> bool {
    let (Some(a), Some(b)) = (unsafe { ffi_node_handle(a) }, unsafe { ffi_node_handle(b) }) else { return false; };
    std::sync::Arc::ptr_eq(&a.node, &b.node)
}
#[doc = "flight-ffi contract|FlightNodeArray is the owned node-slice carrier. It stores shared node references; array get returns a new owned FlightNode handle, and clearing or freeing the array releases only its stored references."]
#[doc = "flight-ffi ownership|owned-return|flight_free_node_array|FlightNodeArray"]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_node_array_create() -> *mut FlightNodeArray {
    Box::into_raw(Box::new(FlightNodeArray { values: Vec::new() }))
}
#[doc = "flight-ffi contract|Returns 0 for NULL; otherwise returns the exact number of stored node references."]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_node_array_len(nodes: *const FlightNodeArray) -> usize {
    if nodes.is_null() { return 0; }
    unsafe { &*nodes }.values.len()
}
#[doc = "flight-ffi ownership|owned-return|flight_free_node|FlightNode"]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_node_array_get(nodes: *const FlightNodeArray, index: usize) -> *mut FlightNode {
    if nodes.is_null() { return std::ptr::null_mut(); }
    let Some(node) = unsafe { &*nodes }.values.get(index) else { return std::ptr::null_mut(); };
    Box::into_raw(Box::new(ffi_node_from_node_ref(node.clone())))
}
#[doc = "flight-ffi contract|Appends exactly one shared node reference. NULL array or node handles return false and do not change the array."]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_node_array_push(nodes: *mut FlightNodeArray, node: *const FlightNode) -> bool {
    if nodes.is_null() { return false; }
    let Some(node) = (unsafe { ffi_node_handle(node) }) else { return false; };
    unsafe { &mut *nodes }.values.push(node.node.clone());
    true
}
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_node_array_clear(nodes: *mut FlightNodeArray) {
    if !nodes.is_null() { unsafe { &mut *nodes }.values.clear(); }
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
    if let Some((_, category, reason)) = WGPU_BACKEND_POLICY_SKIP_FNS
        .iter()
        .find(|(function, _, _)| *function == func.name)
    {
        return format!("{category}({}: {reason})", func.name);
    }
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
        "backend_behavior_policy_skip(",
        "bracket_policy_skip(",
        "extension_policy_skip(",
        "guard_policy_skip(",
        "import_handler_policy_skip(",
        "native_layout_policy_skip(",
        "nested_bracket_policy_skip(",
        "ownership_policy_skip(",
        "safety_policy_skip(",
        "scoped_callback_policy_skip(",
        "trait_carrier_policy_skip(",
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
    if qualified_type == "FlightNode" {
        return "node".to_string();
    }
    if qualified_type == "FlightNodeArray" {
        return "node_array".to_string();
    }
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
        FfiReturn::NodeReturn(_) | FfiReturn::OptionNodeReturn(_) => Some("FlightNode".to_string()),
        FfiReturn::NodeArrayReturn(_) => Some("FlightNodeArray".to_string()),
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
    // A canonical carrier by value clones from the caller's shared handle; nothing is consumed.
    if is_canonical_ref_carrier(ty) {
        return None;
    }

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
        | FfiReturn::OptionArcRefReturn
        | FfiReturn::NodeReturn(_)
        | FfiReturn::OptionNodeReturn(_)
        | FfiReturn::NodeArrayReturn(_) => {
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
        // Each canonical element is wrapped into its own fresh shared handle.
        if is_canonical_ref_carrier(element) {
            return Some(Some((
                String::new(),
                FfiReturn::ArrayOutReturn(format!("flight_sdk::Ref<{}>", qualify_type(element))),
            )));
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
        let clean = get_binding_name(name);
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
        ("dyn_material3_d", "dyn flight_sdk::Material3D"),
        ("dyn_modifier", "dyn flight_sdk::Modifier"),
        ("flow_state", "flight_sdk::FlowState"),
        (
            "gltf_core_feature_handler",
            "flight_sdk::GltfCoreFeatureHandler",
        ),
        ("gltf_extension_handler", "flight_sdk::GltfExtensionHandler"),
        ("gui_dialog_entry", "flight_sdk::GuiDialogEntry"),
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
            | "Record" | "HashSet" => 1,
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
            "HashSet" => "std::collections::HashSet".to_string(),
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
    if let Some(module) = CONTRACT_ONLY_TYPE_MODULES
        .get()
        .and_then(|modules| modules.get(name))
    {
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
    if let Some(resolved) = CALLBACK_ALIASES
        .get()
        .and_then(|aliases| callback_alias::resolve_callback_alias(ty, aliases))
    {
        return resolved;
    }
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
        ("InteractionInputSource", "Ref<InputManager>"),
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

// The nullable release callback a retained callback context is handed to exactly once.
const FFI_RELEASE_FN_TYPE: &str = "Option<extern \"C\" fn(*mut std::ffi::c_void)>";

struct MappedParam {
    ffi_params: Vec<(String, String)>,
    bindings: Vec<String>,
    call_expr: String,
}

#[derive(Clone)]
enum AliasBorrowSource {
    Node(NodeKind),
    RefOnly(String),
}

#[derive(Clone)]
struct AliasBorrowParam {
    index: usize,
    name: String,
    group: String,
    pointer: String,
    mutable: bool,
    source: AliasBorrowSource,
}

struct AliasBorrowPair {
    first: AliasBorrowParam,
    second: AliasBorrowParam,
}

fn alias_borrow_param(index: usize, param: &Param) -> Option<AliasBorrowParam> {
    let ty = strip_crate_paths(&strip_lifetimes(&resolve_type_alias(param.ty.trim())));
    let ty = resolve_type_alias(&ty);
    let (mutable, inner) = if let Some(inner) = ty.strip_prefix("&mut ") {
        (true, inner.trim())
    } else if let Some(inner) = ty.strip_prefix('&') {
        (false, inner.trim())
    } else {
        return None;
    };

    if is_ref_only_borrow_type(inner) {
        let qualified = qualify_type(inner);
        return Some(AliasBorrowParam {
            index,
            name: param.name.clone(),
            group: format!("ref:{qualified}"),
            pointer: if mutable {
                "*mut std::ffi::c_void"
            } else {
                "*const std::ffi::c_void"
            }
            .to_string(),
            mutable,
            source: AliasBorrowSource::RefOnly(qualified),
        });
    }

    let kind = match inner {
        "dyn Node" => NodeKind::Node,
        "dyn Node2D" => NodeKind::Node2D,
        "dyn Node3D" => NodeKind::Node3D,
        _ => return None,
    };
    return Some(AliasBorrowParam {
        index,
        name: param.name.clone(),
        group: format!("node:{kind:?}"),
        pointer: if mutable {
            "*mut FlightNode"
        } else {
            "*const FlightNode"
        }
        .to_string(),
        mutable,
        source: AliasBorrowSource::Node(kind),
    });
}

fn collect_alias_borrow_pairs(func: &ParsedFn) -> Vec<AliasBorrowPair> {
    let mut groups: BTreeMap<String, Vec<AliasBorrowParam>> = BTreeMap::new();
    for (index, param) in func.params.iter().enumerate() {
        if let Some(param) = alias_borrow_param(index, param) {
            groups.entry(param.group.clone()).or_default().push(param);
        }
    }

    let mut pairs = Vec::new();
    for group in groups.into_values().filter(|group| group.len() == 2) {
        pairs.push(AliasBorrowPair {
            first: group[0].clone(),
            second: group[1].clone(),
        });
    }
    return pairs;
}

// Three or more aliasable borrows of one Ref-only allocation type: each distinct allocation is
// locked once, in address order, through one lock group.
fn collect_alias_borrow_groups(func: &ParsedFn) -> Vec<Vec<AliasBorrowParam>> {
    let mut groups: BTreeMap<String, Vec<AliasBorrowParam>> = BTreeMap::new();
    for (index, param) in func.params.iter().enumerate() {
        if let Some(param) = alias_borrow_param(index, param) {
            groups.entry(param.group.clone()).or_default().push(param);
        }
    }
    let groups: Vec<_> = groups
        .into_values()
        .filter(|group| group.len() >= 3)
        .collect();
    for group in &groups {
        assert!(
            group
                .iter()
                .all(|param| matches!(param.source, AliasBorrowSource::RefOnly(_))),
            "{} has three or more aliasable node borrows; extend the grouped lowering before emitting it",
            func.name
        );
    }
    return groups;
}

fn alias_borrow_group_bindings(group: &[AliasBorrowParam]) -> Vec<String> {
    let lead = get_binding_name(&group[0].name);
    let mut bindings = Vec::new();
    for param in group {
        bindings.extend(alias_borrow_arc_binding(param));
    }
    let arcs: Vec<String> = group
        .iter()
        .map(|param| format!("arc_{}", get_binding_name(&param.name)))
        .collect();
    let mutable: Vec<&str> = group
        .iter()
        .map(|param| if param.mutable { "true" } else { "false" })
        .collect();
    bindings.push(format!(
        "    let Some(mut ffi_group_{lead}) = ffi_lock_ref_group(&[{}], &[{}]) else {{ {INVALID_NODE_RETURN} }};",
        arcs.join(", "),
        mutable.join(", ")
    ));
    for (member, param) in group.iter().enumerate() {
        if param.mutable {
            bindings.push(format!(
                "    let mut guard_{} = ffi_group_{lead}.take_write({member});",
                get_binding_name(&param.name)
            ));
        }
    }
    return bindings;
}

fn alias_borrow_group_call_expr(group: &[AliasBorrowParam], index: usize) -> String {
    let lead = get_binding_name(&group[0].name);
    let member = group.iter().position(|param| param.index == index).unwrap();
    let param = &group[member];
    if param.mutable {
        return format!("&mut guard_{}", get_binding_name(&param.name));
    }
    return format!("ffi_group_{lead}.read({member})");
}

const FFI_REF_GROUP_SUPPORT: &str = r#"// One lock per distinct allocation of a group of borrowed Ref handles of one type.
enum FfiRefGuard<'a, T> {
    Read(std::sync::RwLockReadGuard<'a, T>),
    Write(std::sync::RwLockWriteGuard<'a, T>),
}
struct FfiRefGroup<'a, T> {
    guards: Vec<Option<FfiRefGuard<'a, T>>>,
    slots: Vec<usize>,
}
// Locks each distinct allocation once, in address order, so two calls never wait on each other in
// opposite orders. A mutable member that shares its allocation with any other member is refused:
// one object cannot be written and read through two references at once.
fn ffi_lock_ref_group<'a, T>(arcs: &[&'a std::sync::Arc<std::sync::RwLock<T>>], mutable: &[bool]) -> Option<FfiRefGroup<'a, T>> {
    let mut distinct: Vec<usize> = Vec::new();
    let mut slots = Vec::with_capacity(arcs.len());
    for (member, arc) in arcs.iter().enumerate() {
        match distinct.iter().position(|first| std::sync::Arc::ptr_eq(arcs[*first], arc)) {
            Some(slot) => {
                if mutable[member] || mutable[distinct[slot]] {
                    return None;
                }
                slots.push(slot);
            }
            None => {
                slots.push(distinct.len());
                distinct.push(member);
            }
        }
    }
    let mut order: Vec<usize> = (0..distinct.len()).collect();
    order.sort_by_key(|slot| std::sync::Arc::as_ptr(arcs[distinct[*slot]]) as *const () as usize);
    let mut guards: Vec<Option<FfiRefGuard<'a, T>>> = (0..distinct.len()).map(|_| None).collect();
    for slot in order {
        let arc = arcs[distinct[slot]];
        guards[slot] = Some(if mutable[distinct[slot]] {
            FfiRefGuard::Write(arc.write().unwrap_or_else(std::sync::PoisonError::into_inner))
        } else {
            FfiRefGuard::Read(arc.read().unwrap_or_else(std::sync::PoisonError::into_inner))
        });
    }
    return Some(FfiRefGroup { guards, slots });
}
impl<'a, T> FfiRefGroup<'a, T> {
    // Moves a mutable member's write guard out of the group; each is taken once.
    fn take_write(&mut self, member: usize) -> std::sync::RwLockWriteGuard<'a, T> {
        match self.guards[self.slots[member]].take() {
            Some(FfiRefGuard::Write(guard)) => guard,
            _ => unreachable!("a mutable member owns its own write guard"),
        }
    }
    fn read(&self, member: usize) -> &T {
        match &self.guards[self.slots[member]] {
            Some(FfiRefGuard::Read(guard)) => guard,
            _ => unreachable!("a shared member reads through a read guard"),
        }
    }
}

"#;

fn alias_borrow_arc_binding(param: &AliasBorrowParam) -> Vec<String> {
    let clean = get_binding_name(&param.name);
    match &param.source {
        AliasBorrowSource::RefOnly(qualified) => vec![
            format!(
                "    if {}.is_null() {{ {INVALID_NODE_RETURN} }}",
                param.name
            ),
            format!(
                "    let arc_{clean} = unsafe {{ &*({} as *const flight_sdk::Ref<{qualified}>) }};",
                param.name
            ),
        ],
        AliasBorrowSource::Node(kind) => {
            let (arc_ty, selected) = match kind {
                NodeKind::Node => (
                    "flight_sdk::NodeRef",
                    format!("Some(ffi_node_{clean}.node.clone())"),
                ),
                NodeKind::Node2D => (
                    "flight_sdk::Node2DRef",
                    format!("ffi_node_{clean}.node2d.clone()"),
                ),
                NodeKind::Node3D => (
                    "flight_sdk::Node3DRef",
                    format!("ffi_node_{clean}.node3d.clone()"),
                ),
            };
            vec![
                format!(
                    "    let Some(ffi_node_{clean}) = (unsafe {{ ffi_node_handle({}) }}) else {{ {INVALID_NODE_RETURN} }};",
                    param.name
                ),
                format!(
                    "    let Some(owned_arc_{clean}): Option<{arc_ty}> = {selected} else {{ {INVALID_NODE_RETURN} }};"
                ),
                format!("    let arc_{clean} = &owned_arc_{clean};"),
            ]
        }
    }
}

fn alias_borrow_pair_bindings(pair: &AliasBorrowPair) -> Vec<String> {
    let first = get_binding_name(&pair.first.name);
    let second = get_binding_name(&pair.second.name);
    let mut bindings = alias_borrow_arc_binding(&pair.first);
    bindings.extend(alias_borrow_arc_binding(&pair.second));
    let aliases = format!("std::sync::Arc::ptr_eq(arc_{first}, arc_{second})");

    match (pair.first.mutable, pair.second.mutable) {
        (false, false) => {
            bindings.push(format!(
                "    let (guard_{first}, guard_{second}) = if {aliases} {{ (arc_{first}.read().unwrap_or_else(std::sync::PoisonError::into_inner), None) }} else if (std::sync::Arc::as_ptr(arc_{first}) as *const () as usize) < (std::sync::Arc::as_ptr(arc_{second}) as *const () as usize) {{ (arc_{first}.read().unwrap_or_else(std::sync::PoisonError::into_inner), Some(arc_{second}.read().unwrap_or_else(std::sync::PoisonError::into_inner))) }} else {{ let guard_{second} = arc_{second}.read().unwrap_or_else(std::sync::PoisonError::into_inner); let guard_{first} = arc_{first}.read().unwrap_or_else(std::sync::PoisonError::into_inner); (guard_{first}, Some(guard_{second})) }};"
            ));
        }
        (true, true) => {
            bindings.push(format!("    if {aliases} {{ {INVALID_NODE_RETURN} }}"));
            bindings.push(format!(
                "    let (mut guard_{first}, mut guard_{second}) = if (std::sync::Arc::as_ptr(arc_{first}) as *const () as usize) < (std::sync::Arc::as_ptr(arc_{second}) as *const () as usize) {{ (arc_{first}.write().unwrap_or_else(std::sync::PoisonError::into_inner), arc_{second}.write().unwrap_or_else(std::sync::PoisonError::into_inner)) }} else {{ let guard_{second} = arc_{second}.write().unwrap_or_else(std::sync::PoisonError::into_inner); let guard_{first} = arc_{first}.write().unwrap_or_else(std::sync::PoisonError::into_inner); (guard_{first}, guard_{second}) }};"
            ));
        }
        (true, false) => {
            bindings.push(format!("    if {aliases} {{ {INVALID_NODE_RETURN} }}"));
            bindings.push(format!(
                "    let (mut guard_{first}, guard_{second}) = if (std::sync::Arc::as_ptr(arc_{first}) as *const () as usize) < (std::sync::Arc::as_ptr(arc_{second}) as *const () as usize) {{ (arc_{first}.write().unwrap_or_else(std::sync::PoisonError::into_inner), arc_{second}.read().unwrap_or_else(std::sync::PoisonError::into_inner)) }} else {{ let guard_{second} = arc_{second}.read().unwrap_or_else(std::sync::PoisonError::into_inner); let guard_{first} = arc_{first}.write().unwrap_or_else(std::sync::PoisonError::into_inner); (guard_{first}, guard_{second}) }};"
            ));
        }
        (false, true) => {
            bindings.push(format!("    if {aliases} {{ {INVALID_NODE_RETURN} }}"));
            bindings.push(format!(
                "    let (guard_{first}, mut guard_{second}) = if (std::sync::Arc::as_ptr(arc_{first}) as *const () as usize) < (std::sync::Arc::as_ptr(arc_{second}) as *const () as usize) {{ (arc_{first}.read().unwrap_or_else(std::sync::PoisonError::into_inner), arc_{second}.write().unwrap_or_else(std::sync::PoisonError::into_inner)) }} else {{ let guard_{second} = arc_{second}.write().unwrap_or_else(std::sync::PoisonError::into_inner); let guard_{first} = arc_{first}.read().unwrap_or_else(std::sync::PoisonError::into_inner); (guard_{first}, guard_{second}) }};"
            ));
        }
    }
    return bindings;
}

fn alias_borrow_guard_expr(param: &AliasBorrowParam, clean: &str) -> String {
    let borrow = if param.mutable { "&mut " } else { "&" };
    let deref = if matches!(&param.source, AliasBorrowSource::Node(_)) {
        "*"
    } else {
        ""
    };
    format!("{borrow}{deref}guard_{clean}")
}

fn alias_borrow_call_expr(pair: &AliasBorrowPair, index: usize) -> String {
    if index == pair.first.index {
        return alias_borrow_guard_expr(&pair.first, &get_binding_name(&pair.first.name));
    }
    assert_eq!(index, pair.second.index);
    if pair.second.mutable {
        return alias_borrow_guard_expr(&pair.second, &get_binding_name(&pair.second.name));
    }
    if !pair.first.mutable {
        let first = get_binding_name(&pair.first.name);
        let second = get_binding_name(&pair.second.name);
        let fallback = alias_borrow_guard_expr(&pair.first, &first);
        return format!("guard_{second}.as_deref().unwrap_or({fallback})");
    }
    return alias_borrow_guard_expr(&pair.second, &get_binding_name(&pair.second.name));
}

// A required C string: the wrapper returns its failure sentinel for NULL or invalid UTF-8 before
// any SDK call, so no text is ever silently replaced.
fn required_text_param(name: &str, owned: bool) -> MappedParam {
    let clean = get_binding_name(name);
    return MappedParam {
        ffi_params: vec![(name.to_string(), "*const std::ffi::c_char".to_string())],
        bindings: vec![format!(
            "    let Some(ffi_text_{clean}) = (unsafe {{ ffi_c_str({name}) }}) else {{ {INVALID_NODE_RETURN} }};"
        )],
        call_expr: if owned {
            format!("ffi_text_{clean}.to_string()")
        } else {
            format!("ffi_text_{clean}")
        },
    };
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

const INVALID_NODE_RETURN: &str = "__FLIGHT_INVALID_NODE_RETURN__";

// Reads a C string parameter: `None` for NULL or invalid UTF-8.
const FFI_C_STR_SUPPORT: &str = "// A C string parameter as text: None for NULL or invalid UTF-8, which callers refuse.\nunsafe fn ffi_c_str<'a>(text: *const std::ffi::c_char) -> Option<&'a str> {\n    if text.is_null() {\n        return None;\n    }\n    return unsafe { std::ffi::CStr::from_ptr(text) }.to_str().ok();\n}\n\n";

fn node_param_selection(name: &str, inner: &str) -> Option<(NodeReturnSpec, Vec<String>, String)> {
    let spec = node_return_spec(inner)?;
    let clean = get_binding_name(name);
    let handle = format!("ffi_node_{clean}");
    let value = format!("node_{clean}");
    let selected = if let Some(concrete) = &spec.concrete {
        format!("ffi_node_concrete::<flight_sdk::{concrete}>({handle})")
    } else {
        match spec.kind {
            NodeKind::Node => format!("Some({handle}.node.clone())"),
            NodeKind::Node2D => format!("{handle}.node2d.clone()"),
            NodeKind::Node3D => format!("{handle}.node3d.clone()"),
        }
    };
    let bindings = vec![
        format!(
            "    let Some({handle}) = (unsafe {{ ffi_node_handle({name}) }}) else {{ {INVALID_NODE_RETURN} }};"
        ),
        format!("    let Some({value}) = {selected} else {{ {INVALID_NODE_RETURN} }};"),
    ];
    return Some((spec, bindings, value));
}

fn map_node_param(name: &str, ty: &str) -> Option<Option<MappedParam>> {
    let clean = get_binding_name(name);

    if let Some(inner) = ty
        .strip_prefix("&mut Ref<")
        .and_then(|rest| rest.strip_suffix('>'))
    {
        let (_, bindings, value) = node_param_selection(name, inner.trim())?;
        return Some(Some(MappedParam {
            ffi_params: vec![(name.to_string(), "*mut FlightNode".to_string())],
            bindings,
            call_expr: format!("&mut {value}"),
        }));
    }
    if let Some(inner) = ty
        .strip_prefix("&Ref<")
        .and_then(|rest| rest.strip_suffix('>'))
    {
        let (_, bindings, value) = node_param_selection(name, inner.trim())?;
        return Some(Some(MappedParam {
            ffi_params: vec![(name.to_string(), "*const FlightNode".to_string())],
            bindings,
            call_expr: format!("&{value}"),
        }));
    }
    if let Some(inner) = ty
        .strip_prefix("Option<&Ref<")
        .and_then(|rest| rest.strip_suffix(">>"))
    {
        let spec = node_return_spec(inner.trim())?;
        let selected = if let Some(concrete) = &spec.concrete {
            format!("ffi_node_concrete::<flight_sdk::{concrete}>(ffi_node_{clean})")
        } else {
            match spec.kind {
                NodeKind::Node => format!("Some(ffi_node_{clean}.node.clone())"),
                NodeKind::Node2D => format!("ffi_node_{clean}.node2d.clone()"),
                NodeKind::Node3D => format!("ffi_node_{clean}.node3d.clone()"),
            }
        };
        return Some(Some(MappedParam {
            ffi_params: vec![(name.to_string(), "*const FlightNode".to_string())],
            bindings: vec![
                format!("    let ffi_node_{clean} = unsafe {{ ffi_node_handle({name}) }};"),
                format!(
                    "    let node_{clean} = match ffi_node_{clean} {{ None => None, Some(ffi_node_{clean}) => match {selected} {{ Some(value) => Some(value), None => {{ {INVALID_NODE_RETURN} }} }} }};"
                ),
            ],
            call_expr: format!("node_{clean}.as_ref()"),
        }));
    }
    if let Some(inner) = ty
        .strip_prefix("Ref<")
        .and_then(|rest| rest.strip_suffix('>'))
    {
        let (_, bindings, value) = node_param_selection(name, inner.trim())?;
        return Some(Some(MappedParam {
            ffi_params: vec![(name.to_string(), "*const FlightNode".to_string())],
            bindings,
            call_expr: value,
        }));
    }

    if let Some(inner) = ty
        .strip_prefix("Option<Ref<")
        .and_then(|rest| rest.strip_suffix(">>"))
    {
        let spec = node_return_spec(inner.trim())?;
        let selected = if let Some(concrete) = &spec.concrete {
            format!("ffi_node_concrete::<flight_sdk::{concrete}>(ffi_node_{clean})")
        } else {
            match spec.kind {
                NodeKind::Node => format!("Some(ffi_node_{clean}.node.clone())"),
                NodeKind::Node2D => format!("ffi_node_{clean}.node2d.clone()"),
                NodeKind::Node3D => format!("ffi_node_{clean}.node3d.clone()"),
            }
        };
        return Some(Some(MappedParam {
            ffi_params: vec![(name.to_string(), "*const FlightNode".to_string())],
            bindings: vec![
                format!("    let ffi_node_{clean} = unsafe {{ ffi_node_handle({name}) }};"),
                format!(
                    "    let node_{clean} = match ffi_node_{clean} {{ None => None, Some(ffi_node_{clean}) => match {selected} {{ Some(value) => Some(value), None => {{ {INVALID_NODE_RETURN} }} }} }};"
                ),
            ],
            call_expr: format!("node_{clean}"),
        }));
    }

    let (mutable, trait_name) = if let Some(inner) = ty.strip_prefix("&mut dyn ") {
        (true, inner.trim())
    } else if let Some(inner) = ty.strip_prefix("&dyn ") {
        (false, inner.trim())
    } else {
        (false, "")
    };
    let trait_kind = match trait_name {
        "Node" => Some(NodeKind::Node),
        "Node2D" => Some(NodeKind::Node2D),
        "Node3D" => Some(NodeKind::Node3D),
        _ => None,
    };
    if let Some(kind) = trait_kind {
        let arc_ty = match kind {
            NodeKind::Node => "flight_sdk::NodeRef",
            NodeKind::Node2D => "flight_sdk::Node2DRef",
            NodeKind::Node3D => "flight_sdk::Node3DRef",
        };
        let selected = match kind {
            NodeKind::Node => format!("Some(ffi_node_{clean}.node.clone())"),
            NodeKind::Node2D => format!("ffi_node_{clean}.node2d.clone()"),
            NodeKind::Node3D => format!("ffi_node_{clean}.node3d.clone()"),
        };
        let guard = if mutable { "write" } else { "read" };
        let reference = if mutable { "&mut *" } else { "&*" };
        let mut bindings = vec![
            format!(
                "    let Some(ffi_node_{clean}) = (unsafe {{ ffi_node_handle({name}) }}) else {{ {INVALID_NODE_RETURN} }};"
            ),
            format!(
                "    let Some(arc_{clean}): Option<{arc_ty}> = {selected} else {{ {INVALID_NODE_RETURN} }};"
            ),
        ];
        bindings.push(if mutable {
            format!("    let mut guard_{clean} = arc_{clean}.{guard}().unwrap_or_else(std::sync::PoisonError::into_inner);")
        } else {
            format!("    let guard_{clean} = arc_{clean}.{guard}().unwrap_or_else(std::sync::PoisonError::into_inner);")
        });
        bindings.push(format!(
            "    let dyn_{clean}: {}dyn flight_sdk::{trait_name} = {reference}guard_{clean};",
            if mutable { "&mut " } else { "&" }
        ));
        return Some(Some(MappedParam {
            ffi_params: vec![(
                name.to_string(),
                if mutable {
                    "*mut FlightNode"
                } else {
                    "*const FlightNode"
                }
                .to_string(),
            )],
            bindings,
            call_expr: format!("dyn_{clean}"),
        }));
    }

    let (mutable, inner) = if let Some(inner) = ty.strip_prefix("&mut ") {
        (true, inner.trim())
    } else if let Some(inner) = ty.strip_prefix('&') {
        (false, inner.trim())
    } else {
        (false, "")
    };
    if !inner.is_empty()
        && NODE_TYPES
            .get()
            .is_some_and(|types| types.contains_key(inner))
    {
        let (_, mut bindings, value) = node_param_selection(name, inner)?;
        bindings.push(if mutable {
            format!("    let mut guard_{clean} = {value}.write().unwrap_or_else(std::sync::PoisonError::into_inner);")
        } else {
            format!("    let guard_{clean} = {value}.read().unwrap_or_else(std::sync::PoisonError::into_inner);")
        });
        return Some(Some(MappedParam {
            ffi_params: vec![(
                name.to_string(),
                if mutable {
                    "*mut FlightNode"
                } else {
                    "*const FlightNode"
                }
                .to_string(),
            )],
            bindings,
            call_expr: if mutable {
                format!("&mut *guard_{clean}")
            } else {
                format!("&*guard_{clean}")
            },
        }));
    }

    if let Some(inner) = ty
        .strip_prefix("&[Option<")
        .and_then(|rest| rest.strip_suffix(">]"))
        && let Some(kind) = node_ref_kind(inner.trim())
    {
        let ptr_name = format!("{name}_ptr");
        let len_name = format!("{name}_len");
        let view_ty = match kind {
            NodeKind::Node => "flight_sdk::NodeRef",
            NodeKind::Node2D => "flight_sdk::Node2DRef",
            NodeKind::Node3D => "flight_sdk::Node3DRef",
        };
        let selected = match kind {
            NodeKind::Node => format!("Some(ffi_node_{clean}.node.clone())"),
            NodeKind::Node2D => format!("ffi_node_{clean}.node2d.clone()"),
            NodeKind::Node3D => format!("ffi_node_{clean}.node3d.clone()"),
        };
        return Some(Some(MappedParam {
            ffi_params: vec![
                (ptr_name.clone(), "*const *const FlightNode".to_string()),
                (len_name.clone(), "usize".to_string()),
            ],
            bindings: vec![
                format!(
                    "    if {ptr_name}.is_null() && {len_name} != 0 {{ {INVALID_NODE_RETURN} }}"
                ),
                format!(
                    "    let node_handles_{clean}: &[*const FlightNode] = unsafe {{ ffi_slice_from_raw_parts({ptr_name}, {len_name}) }};"
                ),
                format!(
                    "    let mut node_views_{clean}: Vec<Option<{view_ty}>> = Vec::with_capacity({len_name});"
                ),
                format!(
                    "    for handle in node_handles_{clean} {{ if handle.is_null() {{ node_views_{clean}.push(None); }} else {{ let Some(ffi_node_{clean}) = (unsafe {{ ffi_node_handle(*handle) }}) else {{ {INVALID_NODE_RETURN} }}; let Some(view) = {selected} else {{ {INVALID_NODE_RETURN} }}; node_views_{clean}.push(Some(view)); }} }}"
                ),
            ],
            call_expr: format!("node_views_{clean}.as_slice()"),
        }));
    }

    if let Some(inner) = ty
        .strip_prefix("&[")
        .and_then(|rest| rest.strip_suffix(']'))
        && let Some(kind) = node_ref_kind(inner.trim())
    {
        let (mut bindings, call_expr) = match kind {
            NodeKind::Node => (
                vec![format!("    let nodes_{clean} = unsafe {{ &*{name} }};")],
                format!("nodes_{clean}.values.as_slice()"),
            ),
            NodeKind::Node2D | NodeKind::Node3D => {
                let projection = if kind == NodeKind::Node2D {
                    "flight_sdk::as_node2d_ref"
                } else {
                    "flight_sdk::as_node3d_ref"
                };
                (
                    vec![
                        format!("    let nodes_{clean} = unsafe {{ &*{name} }};"),
                        format!(
                            "    let Some(node_views_{clean}) = nodes_{clean}.values.iter().map({projection}).collect::<Option<Vec<_>>>() else {{ {INVALID_NODE_RETURN} }};"
                        ),
                    ],
                    format!("node_views_{clean}.as_slice()"),
                )
            }
        };
        bindings.insert(
            0,
            format!("    if {name}.is_null() {{ {INVALID_NODE_RETURN} }}"),
        );
        return Some(Some(MappedParam {
            ffi_params: vec![(name.to_string(), "*const FlightNodeArray".to_string())],
            bindings,
            call_expr,
        }));
    }

    if let Some(inner) = ty
        .strip_prefix("Option<&[")
        .and_then(|rest| rest.strip_suffix("]>"))
        && let Some(kind) = node_ref_kind(inner.trim())
    {
        let view_ty = match kind {
            NodeKind::Node => "flight_sdk::NodeRef",
            NodeKind::Node2D => "flight_sdk::Node2DRef",
            NodeKind::Node3D => "flight_sdk::Node3DRef",
        };
        let projection = match kind {
            NodeKind::Node => "Some(node.clone())",
            NodeKind::Node2D => "flight_sdk::as_node2d_ref(node)",
            NodeKind::Node3D => "flight_sdk::as_node3d_ref(node)",
        };
        return Some(Some(MappedParam {
            ffi_params: vec![(name.to_string(), "*const FlightNodeArray".to_string())],
            bindings: vec![format!(
                "    let node_views_{clean}: Option<Vec<{view_ty}>> = if {name}.is_null() {{ None }} else {{ let nodes = unsafe {{ &*{name} }}; match nodes.values.iter().map(|node| {projection}).collect::<Option<Vec<_>>>() {{ Some(values) => Some(values), None => {{ {INVALID_NODE_RETURN} }} }} }};"
            )],
            call_expr: format!("node_views_{clean}.as_deref()"),
        }));
    }

    if let Some(inner) = ty
        .strip_prefix("&mut Vec<")
        .and_then(|rest| rest.strip_suffix('>'))
        && node_ref_kind(inner.trim()) == Some(NodeKind::Node)
    {
        return Some(Some(MappedParam {
            ffi_params: vec![(name.to_string(), "*mut FlightNodeArray".to_string())],
            bindings: vec![
                format!("    if {name}.is_null() {{ {INVALID_NODE_RETURN} }}"),
                format!("    let nodes_{clean} = unsafe {{ &mut *{name} }};"),
            ],
            call_expr: format!("&mut nodes_{clean}.values"),
        }));
    }

    return None;
}

fn map_ref_only_borrow(name: &str, ty: &str) -> Option<MappedParam> {
    let clean = get_binding_name(name);
    let (mutable, inner) = if let Some(inner) = ty.strip_prefix("&mut ") {
        (true, inner.trim())
    } else if let Some(inner) = ty.strip_prefix('&') {
        (false, inner.trim())
    } else {
        return None;
    };
    if !is_ref_only_borrow_type(inner) {
        return None;
    }
    let qualified = qualify_type(inner);
    let pointer = if mutable {
        "*mut std::ffi::c_void"
    } else {
        "*const std::ffi::c_void"
    };
    let mut bindings = vec![
        format!("    if {name}.is_null() {{ {INVALID_NODE_RETURN} }}"),
        format!(
            "    let arc_{clean} = unsafe {{ &*({name} as *const flight_sdk::Ref<{qualified}>) }};"
        ),
    ];
    bindings.push(if mutable {
        format!("    let mut guard_{clean} = arc_{clean}.write().unwrap_or_else(std::sync::PoisonError::into_inner);")
    } else {
        format!("    let guard_{clean} = arc_{clean}.read().unwrap_or_else(std::sync::PoisonError::into_inner);")
    });
    return Some(MappedParam {
        ffi_params: vec![(name.to_string(), pointer.to_string())],
        bindings,
        call_expr: if mutable {
            format!("&mut guard_{clean}")
        } else {
            format!("&guard_{clean}")
        },
    });
}

fn map_param_to_ffi(name: &str, ty: &str) -> Option<MappedParam> {
    let ty = strip_crate_paths(&strip_lifetimes(&resolve_type_alias(ty.trim())));
    // An explicit reference lifetime can sit between `&` and a typed-array alias, so run the alias
    // resolver once more after removing lifetimes (`&'a Uint8Array` -> `&[u8]`).
    let ty = resolve_type_alias(&ty);
    let ty = ty.as_str();
    let lifetime_data_ty = ty.strip_suffix("<>").unwrap_or(ty);

    if let Some(mapped) = map_node_param(name, ty) {
        return mapped;
    }
    if let Some(inner) = ty
        .strip_prefix("Option<")
        .and_then(|rest| rest.strip_suffix('>'))
    {
        let (mutable, borrowed) = match inner.trim().strip_prefix("&mut ") {
            Some(rest) => (true, rest.trim()),
            None => (false, inner.trim().strip_prefix('&').unwrap_or("").trim()),
        };
        if is_canonical_ref_carrier(borrowed) {
            let clean = get_binding_name(name);
            let qualified = qualify_type(borrowed);
            let lock = if mutable { "write" } else { "read" };
            let binding = if mutable { "mut " } else { "" };
            return Some(MappedParam {
                ffi_params: vec![(
                    name.to_string(),
                    format!(
                        "*{} std::ffi::c_void",
                        if mutable { "mut" } else { "const" }
                    ),
                )],
                bindings: vec![format!(
                    "    let {binding}guard_{clean} = if {name}.is_null() {{ None }} else {{ Some(unsafe {{ &*({name} as *const flight_sdk::Ref<{qualified}>) }}.{lock}().unwrap_or_else(std::sync::PoisonError::into_inner)) }};"
                )],
                call_expr: if mutable {
                    format!("guard_{clean}.as_deref_mut()")
                } else {
                    format!("guard_{clean}.as_deref()")
                },
            });
        }
    }
    if canonical_element_collection(ty) {
        return None;
    }
    if is_canonical_ref_carrier(ty) {
        // A by-value consumer gets a clone of the value; a type that cannot be cloned has no
        // by-value lowering from a shared handle.
        if !CLONE_TYPES.get().is_some_and(|types| types.contains(ty)) {
            return None;
        }
        let clean = get_binding_name(name);
        let mut mapped = map_ref_only_borrow(name, &format!("&{ty}"))?;
        mapped.call_expr = format!("(*guard_{clean}).clone()");
        return Some(mapped);
    }
    if let Some(mapped) = map_ref_only_borrow(name, ty) {
        return Some(mapped);
    }

    // A borrowed SDK type that C only ever holds as its shared `Ref` handle crosses as that
    // handle, locked for the duration of the call, so no unlocked pointee is ever exposed.
    for (prefix, write) in [("&mut ", true), ("&", false)] {
        if let Some(inner) = ty.strip_prefix(prefix)
            && REF_LOCKED_PARAM_TYPES.contains(&inner)
        {
            let clean = get_binding_name(name);
            let qualified = qualify_type(inner);
            let lock = if write { "write" } else { "read" };
            let borrow = if write { "&mut " } else { "&" };
            return Some(MappedParam {
                ffi_params: vec![(name.to_string(), "*const std::ffi::c_void".to_string())],
                bindings: vec![format!(
                    "    let {borrow_kw}ffi_locked_{clean} = unsafe {{ &*({name} as *const flight_sdk::Ref<{qualified}>) }}.{lock}().unwrap();",
                    borrow_kw = if write { "mut " } else { "" }
                )],
                call_expr: format!("{borrow}ffi_locked_{clean}"),
            });
        }
    }

    // The handle owns bytes and cursor, but never an SDK ByteReader. Borrow its bytes into a
    // transient view for exactly one call; mutable wrappers write the resulting cursor back.
    if ty == "&ByteReader<>" || ty == "&ByteReader" {
        let clean = get_binding_name(name);
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
        let clean = get_binding_name(name);
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
        let clean = get_binding_name(name);
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

    // &str / &'static str -> *const c_char; NULL or invalid UTF-8 is refused, never read as "".
    if ty == "&str" || ty == "&'static str" {
        return Some(required_text_param(name, false));
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

    // Option<&str> / Option<String> -> nullable *const c_char: NULL is None; invalid UTF-8 is
    // refused with the wrapper's sentinel.
    if ty == "Option<&str>" || ty == "Option<String>" {
        let clean = get_binding_name(name);
        return Some(MappedParam {
            ffi_params: vec![(name.to_string(), "*const std::ffi::c_char".to_string())],
            bindings: vec![format!(
                "    let ffi_text_{clean} = if {name}.is_null() {{ None }} else {{ match unsafe {{ ffi_c_str({name}) }} {{ Some(text) => Some(text), None => {{ {INVALID_NODE_RETURN} }} }} }};"
            )],
            call_expr: if ty == "Option<String>" {
                format!("ffi_text_{clean}.map(str::to_string)")
            } else {
                format!("ffi_text_{clean}")
            },
        });
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
            let clean = get_binding_name(name);
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
                        "__guard.ctx()".to_string()
                    } else {
                        format!("__guard.ctx(), {}", ffi_fn_args_str.join(", "))
                    };
                    let option_fn_sig = format!("Option<{ffi_fn_sig}>");
                    let release_name = format!("{name}_release");
                    // A NULL callback retains nothing, so the context stays the caller's and its
                    // release never runs.
                    let closure_body = format!(
                        "match {fn_name} {{ None => None, Some(__f_inner) => {{ let __guard = FfiSignalCallbackRelease {{ ctx: {ctx_name} as usize, release: {release_name} }}; let __f = __f_inner as usize; Some(std::sync::Arc::new(move |{outer_params_str}| {{ let __fp: {ffi_fn_sig} = unsafe {{ std::mem::transmute(__f) }}; __fp({arc_call_args}) }})) }} }}"
                    );
                    return Some(MappedParam {
                        ffi_params: vec![
                            (fn_name, option_fn_sig),
                            (ctx_name, "*mut std::ffi::c_void".to_string()),
                            (release_name, FFI_RELEASE_FN_TYPE.to_string()),
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
                if let Some(spec) = node_return_spec(inner) {
                    let constructor =
                        node_handle_constructor(&spec, &format!("{arg_name}.clone()"));
                    ffi_fn_params.push("*const FlightNode".to_string());
                    ffi_fn_args_str.push(format!("&{constructor} as *const FlightNode"));
                } else {
                    ffi_fn_params.push("*const std::ffi::c_void".to_string());
                    ffi_fn_args_str
                        .push(format!("{arg_name} as *const _ as *const std::ffi::c_void"));
                }
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
            "__guard.ctx()".to_string()
        } else {
            format!("__guard.ctx(), {}", ffi_fn_args_str.join(", "))
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
        // A retained (`Arc`) callback owns its context through a release guard: the SDK may keep
        // the closure past this call, so `{name}_release(ctx)` runs exactly once, when the SDK drops
        // its last handle to it. A borrowed (`&dyn Fn`) callback is only called during this call
        // and takes no release.
        let release_name = format!("{name}_release");
        let closure_body = if parsed.is_arc {
            format!(
                "{{ let __guard = FfiSignalCallbackRelease {{ ctx: {ctx_name} as usize, release: {release_name} }}; let __f = {fn_name} as usize; std::sync::Arc::new(move |{outer_params_str}| {{ let __fp: {ffi_fn_sig} = unsafe {{ std::mem::transmute(__f) }}; {arc_callback_call} }}) }}"
            )
        } else if parsed.is_mut {
            format!("&mut |{outer_params_str}| {direct_callback_call}")
        } else {
            format!("&|{outer_params_str}| {direct_callback_call}")
        };
        // A NULL callback is refused before anything is retained, so its context stays the
        // caller's and its release never runs.
        let bindings = vec![format!(
            "    let Some({fn_name}) = {fn_name} else {{ {INVALID_NODE_RETURN} }};"
        )];
        let mut ffi_params = vec![
            (fn_name, format!("Option<{ffi_fn_sig}>")),
            (ctx_name, "*mut std::ffi::c_void".to_string()),
        ];
        if parsed.is_arc {
            ffi_params.push((release_name, FFI_RELEASE_FN_TYPE.to_string()));
        }
        return Some(MappedParam {
            ffi_params,
            bindings,
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

    // String param -> *const c_char; NULL or invalid UTF-8 is refused, never read as "".
    if ty == "String" {
        return Some(required_text_param(name, true));
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

fn node_return_spec(inner: &str) -> Option<NodeReturnSpec> {
    let inner = inner.trim();
    let kind = match inner {
        "dyn Node" => NodeKind::Node,
        "dyn Node2D" => NodeKind::Node2D,
        "dyn Node3D" => NodeKind::Node3D,
        _ => *NODE_TYPES.get()?.get(inner)?,
    };
    let concrete = (!inner.starts_with("dyn ")).then(|| inner.to_string());
    return Some(NodeReturnSpec { kind, concrete });
}

fn node_ref_kind(ty: &str) -> Option<NodeKind> {
    let resolved = resolve_type_alias(ty.trim());
    let inner = resolved.strip_prefix("Ref<")?.strip_suffix('>')?;
    return node_return_spec(inner).map(|spec| spec.kind);
}

fn optional_node_ref_slice_kind(ty: &str) -> Option<NodeKind> {
    let ty = strip_crate_paths(&strip_lifetimes(ty.trim()));
    let inner = ty.strip_prefix("&[Option<")?.strip_suffix(">]")?.trim();
    node_ref_kind(inner)
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

    // Every abstract or concrete node Ref returns the one opaque FlightNode carrier.
    if let Some(inner) = ty.strip_prefix("Ref<") {
        if let Some(inner) = inner.strip_suffix('>') {
            let inner = inner.trim();
            if let Some(spec) = node_return_spec(inner) {
                return Some((
                    " -> *mut FlightNode".to_string(),
                    FfiReturn::NodeReturn(spec),
                ));
            }
        }
    }

    if let Some(inner) = ty.strip_prefix("Option<Ref<") {
        if let Some(inner) = inner.strip_suffix(">>") {
            let inner = inner.trim();
            if let Some(spec) = node_return_spec(inner) {
                return Some((
                    " -> *mut FlightNode".to_string(),
                    FfiReturn::OptionNodeReturn(spec),
                ));
            }
        }
    }

    // A heterogeneous node vector is one opaque node-array handle, never an array of raw Ref
    // carriers. Items recovered from it are ordinary owned FlightNode handles.
    if let Some(inner) = ty.strip_prefix("Vec<") {
        if let Some(inner) = inner.strip_suffix('>')
            && let Some(kind) = node_ref_kind(inner.trim())
        {
            return Some((
                " -> *mut FlightNodeArray".to_string(),
                FfiReturn::NodeArrayReturn(kind),
            ));
        }
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

    // Option<u32>, Option<u16> and Option<u8> -> i64 with -1 sentinel; every value fits exactly.
    if matches!(ty, "Option<u32>" | "Option<u16>" | "Option<u8>") {
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
                // A borrowed trait object is a fat pointer, which has no C representation; a
                // canonical carrier has no borrowed form.
                if borrowed.starts_with("dyn ") || is_canonical_ref_carrier(borrowed) {
                    return None;
                }
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

    // &T and &mut T reference returns -> *const T (borrowing from input data). A `&mut T` return
    // aliases a parameter the caller already holds mutably, so C reads it back as const. A
    // canonical carrier has no borrowed form: C holds it only as its shared handle.
    if let Some(inner) = ty.strip_prefix('&') {
        let inner = inner.trim();
        let inner = inner.strip_prefix("mut ").unwrap_or(inner).trim();
        if is_canonical_ref_carrier(inner) {
            return None;
        }
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
    // An optional the branches above do not lower has no C representation yet; boxing the
    // `Option` itself would hand C a Rust layout under a non-optional ownership contract.
    if ty.starts_with("Option<") {
        return None;
    }
    let qualified = qualify_opaque_type(ty)?;
    Some((format!(" -> *mut {qualified}"), FfiReturn::BoxReturn))
}
