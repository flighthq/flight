use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::Path;
use std::sync::OnceLock;

static KNOWN_ENUMS: OnceLock<BTreeSet<String>> = OnceLock::new();
static ALL_ENUMS: OnceLock<BTreeSet<String>> = OnceLock::new();

pub fn is_known_enum(ty: &str) -> bool {
    KNOWN_ENUMS.get().map(|s| s.contains(ty)).unwrap_or(false)
}

pub fn is_any_enum(ty: &str) -> bool {
    ALL_ENUMS.get().map(|s| s.contains(ty)).unwrap_or(false)
}

// Mirrors flight-ffi's `SCAN_CRATES` exactly, minus `SCAN_EXCLUDED_CRATES`: every crate that
// crosses the C ABI is scanned here so each generated wrapper can receive a Haxe extern. Both
// lists iterate in the same order, so first-seen name deduplication resolves identically.
pub const SCAN_CRATES: &[&str] = &[
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

// flight-ffi crates deliberately absent from `SCAN_CRATES`, each with the reason. Empty: every
// crate the C ABI scans is also scanned for Haxe externs.
#[cfg(test)]
pub const SCAN_EXCLUDED_CRATES: &[(&str, &str)] = &[];

pub const DYN_OPAQUE_TRAITS: &[(&str, &str)] = &[
    ("Node", "NodeRef"),
    ("Node2D", "Node2DRef"),
    ("Node3D", "Node3DRef"),
];

pub const DYN_MONO_TRAITS: &[(&str, &[&str])] = &[
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

pub const SKIP_FN_PREFIXES: &[&str] = &["initialize_"];

pub const SKIP_TYPES: &[&str] = &[
    "AttachmentSkin2D",
    "BidiClassKernel",
    "BidiClassKernelExplanation",
    "Bone2D",
    "BoundsRectangleRuntimeMethods",
    "ClippingAttachment2D",
    "DateTimeFormatOptions",
    "EffectFieldRoles",
    "MarkupTagRegistry",
    "MeshAttachment2D",
    "NumberFormatOptions",
    "PathMeshPool",
    "PathMorphBuildResult",
    "PluralRulesOptions",
    "PointAttachment2D",
    "RectangleLike",
    "RegionAttachment2D",
    "RelativeTimeFormatOptions",
    "ShapeJsonFormatOptions",
    "ShapeJsonParseOptions",
    "Skeleton2DClippingAttachmentSlotRange",
    "Skeleton2DGuardState",
    "SpritesheetParseDiagnosticSeverity",
    "StrokePathGeometry",
    "TextLayoutContext",
    "TextMarkupGuardState",
    "Transform2DRuntimeMethods",
    "Value",
];

pub const SCALARS: &[&str] = &[
    "f32", "f64", "i8", "i16", "i32", "i64", "u8", "u16", "u32", "u64", "usize", "isize", "bool",
];

#[derive(Debug, Clone)]
pub struct ParsedFn {
    pub name: String,
    // Preserve the logical SDK name before native monomorphization; None marks an ABI-only free.
    pub source_name: Option<String>,
    pub params: Vec<Param>,
    pub ret: Option<String>,
}

#[derive(Debug, Clone)]
pub struct Param {
    pub name: String,
    pub ty: String,
}

#[derive(Debug, Clone)]
pub struct StructField {
    pub name: String,
    pub ty: String,
}

#[derive(Debug, Clone)]
pub struct ParsedStruct {
    pub name: String,
    pub fields: Vec<StructField>,
}

#[derive(Debug)]
pub struct ParsedEnumVariant {
    pub name: String,
    pub value: u32,
}

pub struct ParsedEnum {
    pub name: String,
    pub variants: Vec<ParsedEnumVariant>,
}

pub struct CrateExports {
    pub dir_name: String,
    pub fns: Vec<ParsedFn>,
    pub structs: Vec<ParsedStruct>,
    pub enums: Vec<ParsedEnum>,
}

pub fn is_scalar(ty: &str) -> bool {
    SCALARS.contains(&ty)
}

pub fn extract_dyn_trait(ty: &str) -> Option<&str> {
    let inner = ty.strip_prefix("&mut ").or_else(|| ty.strip_prefix('&'))?;
    let inner = inner.strip_prefix("dyn ")?;
    Some(inner.trim())
}

pub fn is_known_dyn_opaque(ty: &str) -> bool {
    extract_dyn_trait(ty)
        .map(|t| DYN_OPAQUE_TRAITS.iter().any(|(name, _)| *name == t))
        .unwrap_or(false)
}

pub fn is_known_dyn_mono(ty: &str) -> bool {
    extract_dyn_trait(ty)
        .map(|t| DYN_MONO_TRAITS.iter().any(|(name, _)| *name == t))
        .unwrap_or(false)
}

pub fn is_ffi_incompatible(ty: &str) -> bool {
    if ty.contains("dyn ") {
        if is_known_dyn_opaque(ty) || is_known_dyn_mono(ty) {
            return false;
        }
        return true;
    }
    ty.contains("Fn(")
        || ty.contains("FnMut(")
        || ty.contains("FnOnce(")
        || ty.contains('<')
        || ty.contains("::")
        || SKIP_TYPES.iter().any(|s| ty.contains(s))
}

fn relocate_synthesized_frees(crate_exports: &mut [CrateExports]) {
    let mut owners: BTreeMap<String, BTreeSet<usize>> = BTreeMap::new();
    for (crate_index, exports) in crate_exports.iter().enumerate() {
        for parsed_struct in &exports.structs {
            owners
                .entry(parsed_struct.name.clone())
                .or_default()
                .insert(crate_index);
        }
        for parsed_enum in &exports.enums {
            owners
                .entry(parsed_enum.name.clone())
                .or_default()
                .insert(crate_index);
        }
    }

    let mut relocated: BTreeMap<usize, Vec<ParsedFn>> = BTreeMap::new();
    for crate_index in 0..crate_exports.len() {
        let functions = std::mem::take(&mut crate_exports[crate_index].fns);
        let mut retained = Vec::with_capacity(functions.len());
        for function in functions {
            let target = synthesized_free_type(&function)
                .and_then(|ty| owners.get(ty))
                .filter(|type_owners| type_owners.len() == 1)
                .and_then(|type_owners| type_owners.first().copied())
                .filter(|target_index| *target_index != crate_index);
            if let Some(target_index) = target {
                relocated.entry(target_index).or_default().push(function);
            } else {
                // No parsed owner or more than one parsed owner is an explicit no-op: the first
                // returning crate remains authoritative unless ownership becomes unambiguous.
                retained.push(function);
            }
        }
        crate_exports[crate_index].fns = retained;
    }

    for (target_index, mut functions) in relocated {
        functions.sort_by(|a, b| a.name.cmp(&b.name));
        crate_exports[target_index].fns.extend(functions);
    }
}

pub fn scan_all_crates(crates_dir: &Path) -> Vec<CrateExports> {
    let mut enum_names = BTreeSet::new();
    let mut all_enum_names = BTreeSet::new();
    for dir_name in SCAN_CRATES {
        let src_dir = crates_dir.join(dir_name).join("src");
        if !src_dir.exists() {
            continue;
        }
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
            parse_simple_enums(&content, &mut enum_names);
            collect_all_pub_enum_names(&content, &mut all_enum_names);
        }
    }
    let enum_count = enum_names.len();
    let _ = KNOWN_ENUMS.set(enum_names);
    let _ = ALL_ENUMS.set(all_enum_names);
    eprintln!("found {enum_count} simple enums");

    let mut results = Vec::new();
    let mut seen_names: BTreeSet<String> = BTreeSet::new();

    for dir_name in SCAN_CRATES {
        let src_dir = crates_dir.join(dir_name).join("src");
        if !src_dir.exists() {
            continue;
        }

        let fns = collect_pub_fns(&src_dir);
        let structs = collect_pub_structs(&src_dir);
        let enums = collect_pub_enums(&src_dir);

        let mut exported_fns = Vec::new();
        for func in fns {
            if SKIP_FN_PREFIXES.iter().any(|p| func.name.starts_with(p)) {
                continue;
            }
            if !has_ffi_compatible_signature(&func) {
                continue;
            }

            if has_mono_dyn_param(&func) {
                let expanded = expand_mono_dyn(&func);
                for ef in expanded {
                    let ffi_name = format!("flight_{}", ef.name);
                    if !seen_names.contains(&ffi_name) {
                        seen_names.insert(ffi_name);
                        exported_fns.push(ef);
                    }
                }
            } else {
                let ffi_name = format!("flight_{}", func.name);
                if !seen_names.contains(&ffi_name) {
                    seen_names.insert(ffi_name);
                    exported_fns.push(func);
                }
            }
        }

        // Synthesize free_* functions for struct/array/string returns
        let mut free_fns = Vec::new();
        let mut free_seen: BTreeSet<String> = BTreeSet::new();
        let mut needs_free_string = false;
        for func in &exported_fns {
            if let Some(ref ret) = func.ret {
                let ret_kind = classify_return(ret);
                let free_type = match &ret_kind {
                    Some(ReturnKind::Struct(ty)) => Some(ty.clone()),
                    Some(ReturnKind::OptionStruct(ty)) => Some(ty.clone()),
                    Some(ReturnKind::StringReturn | ReturnKind::OptionString) => {
                        needs_free_string = true;
                        None
                    }
                    _ => None,
                };
                if let Some(ty) = free_type {
                    if ty.contains('<')
                        || ty.contains('[')
                        || ty.contains('(')
                        || ty.contains('&')
                        || ty.contains(' ')
                    {
                        continue;
                    }
                    let snake = to_snake_case(&ty);
                    let free_name = format!("free_{snake}");
                    let ffi_name = format!("flight_{free_name}");
                    if !seen_names.contains(&ffi_name) && free_seen.insert(free_name.clone()) {
                        seen_names.insert(ffi_name);
                        free_fns.push(ParsedFn {
                            name: free_name,
                            source_name: None,
                            params: vec![Param {
                                name: "ptr".to_string(),
                                ty: format!("&mut {ty}"),
                            }],
                            ret: None,
                        });
                    }
                }
            }
        }
        if needs_free_string {
            let ffi_name = "flight_free_string".to_string();
            if !seen_names.contains(&ffi_name) && free_seen.insert("free_string".to_string()) {
                seen_names.insert(ffi_name);
                free_fns.push(ParsedFn {
                    name: "free_string".to_string(),
                    source_name: None,
                    params: vec![Param {
                        name: "ptr".to_string(),
                        ty: "Ref<CString>".to_string(),
                    }],
                    ret: None,
                });
            }
        }
        exported_fns.extend(free_fns);

        if !exported_fns.is_empty() || !structs.is_empty() || !enums.is_empty() {
            results.push(CrateExports {
                dir_name: dir_name.to_string(),
                fns: exported_fns,
                structs,
                enums,
            });
        }
    }
    relocate_synthesized_frees(&mut results);
    results
}

fn synthesized_free_type(function: &ParsedFn) -> Option<&str> {
    if function.source_name.is_some()
        || !function.name.starts_with("free_")
        || function.params.len() != 1
    {
        return None;
    }
    return function.params[0].ty.strip_prefix("&mut ");
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

fn has_mono_dyn_param(func: &ParsedFn) -> bool {
    func.params.iter().any(|p| {
        let ty = strip_lifetimes(&resolve_type_alias(p.ty.trim()));
        is_known_dyn_mono(&ty)
    })
}

fn expand_mono_dyn(func: &ParsedFn) -> Vec<ParsedFn> {
    let mut mono_indices = Vec::new();
    for (i, p) in func.params.iter().enumerate() {
        let ty = strip_lifetimes(&resolve_type_alias(p.ty.trim()));
        if let Some(trait_name) = extract_dyn_trait(&ty) {
            if let Some((_, impls)) = DYN_MONO_TRAITS.iter().find(|(n, _)| *n == trait_name) {
                let is_mut = ty.starts_with("&mut ");
                mono_indices.push((i, is_mut, *impls));
            }
        }
    }
    if mono_indices.is_empty() {
        return vec![func.clone()];
    }

    let mut combos: Vec<Vec<(usize, bool, &str)>> = vec![vec![]];
    for (idx, is_mut, impls) in &mono_indices {
        let mut new_combos = Vec::new();
        for existing in &combos {
            for concrete in *impls {
                let mut combo = existing.clone();
                combo.push((*idx, *is_mut, concrete));
                new_combos.push(combo);
            }
        }
        combos = new_combos;
    }

    let mut result = Vec::new();
    for combo in &combos {
        let suffix: Vec<String> = combo.iter().map(|(_, _, ty)| to_snake_case(ty)).collect();
        let new_name = format!("{}__{}", func.name, suffix.join("__"));
        let mut new_params = func.params.clone();
        for &(idx, is_mut, concrete_ty) in combo {
            if is_mut {
                new_params[idx].ty = format!("&mut {concrete_ty}");
            } else {
                new_params[idx].ty = format!("&{concrete_ty}");
            }
        }
        result.push(ParsedFn {
            name: new_name,
            source_name: func.source_name.clone(),
            params: new_params,
            ret: func.ret.clone(),
        });
    }
    result
}

fn has_ffi_compatible_signature(func: &ParsedFn) -> bool {
    for param in &func.params {
        if classify_param(&param.ty).is_none() {
            return false;
        }
    }
    if let Some(ref ret) = func.ret {
        if classify_return(ret).is_none() {
            return false;
        }
    }
    return true;
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub enum ParamKind {
    Scalar(String),
    RefConst(String),
    RefMut(String),
    OptionF32,
    OptionF64,
    OptionI32,
    OptionBool,
    StrRef,
    StringParam,
    OptionStr,
    OptionStringParam,
    OptionRefConst(String),
    OptionRefMut(String),
    ArcRef,
    ArcRefMut,
    SliceConst(String),
    SliceMut(String),
    FixedArrayConst(String, usize),
    FixedArrayMut(String, usize),
    OptionSliceConst(String),
    OptionSliceMut(String),
    Enum(String),
    DynOpaque(String),
    DynMono(String),
    VecMut(String),
    VecConst(String),
    VecOwned(String),
    Closure,
    OptionClosure,
    BoxSlice(String),
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub enum ReturnKind {
    Void,
    Scalar(String),
    Struct(String),
    StringReturn,
    OptionString,
    ArcRefReturn,
    OptionArcRefReturn,
    Enum(String),
    VecReturn(String),
    OptionVecReturn(String),
    BoxSliceReturn(String),
    OptionBoxSliceReturn(String),
    FixedArrayReturn(String, usize),
    OptionStruct(String),
    /// A tuple of two or more scalars. The native ABI has no return value and writes element `i`
    /// through a trailing `out_i` pointer parameter; the Haxe value is `{ _0, _1, ... }`.
    Tuple(Vec<String>),
    /// An optional scalar tuple. The native ABI returns `bool` presence and, when present, writes
    /// the same `out_i` parameters as `Tuple`; the Haxe value is `Null<{ _0, _1, ... }>`.
    OptionTuple(Vec<String>),
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

fn strip_crate_path(ty: &str) -> String {
    let mut result = ty.to_string();
    loop {
        let prev = result.clone();
        // Strip crate::types:: prefix
        result = result.replace("crate::types::", "");
        // Strip flight_*:: crate qualifiers
        while let Some(pos) = result.find("flight_") {
            if let Some(sep) = result[pos..].find("::") {
                let end = pos + sep + 2;
                result = format!("{}{}", &result[..pos], &result[end..]);
            } else {
                break;
            }
        }
        if result == prev {
            break;
        }
    }
    result
}

fn resolve_type_alias(ty: &str) -> String {
    let ty = &strip_crate_path(ty);
    let ty = ty.as_str();
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

    let like_aliases: &[(&str, &str)] = &[
        ("MatrixLike", "Matrix"),
        ("Scene3DLightsLike", "Scene3DLights"),
        ("Vector2Like", "Vector2"),
    ];
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

    let aliases: &[(&str, &str)] = &[
        ("Physics2DAbiObjectId", "u32"),
        ("Physics3DAbiObjectId", "u32"),
        ("Physics2DAbiWorldHandle", "u32"),
        ("Physics3DAbiWorldHandle", "u32"),
        ("SpatialObjectId", "i32"),
        ("SourceId", "u64"),
        ("Kind", "String"),
        ("EasingFn", "Arc<dyn Fn(f32) -> f32 + Send + Sync>"),
        ("BitmapTextClock", "Arc<dyn Fn() -> f64 + Send + Sync>"),
        ("ClockProvider", "Arc<dyn Fn() -> f64 + Send + Sync>"),
        ("MovieClipGuardClock", "Arc<dyn Fn() -> f64 + Send + Sync>"),
        ("NodeGuardClock", "Arc<dyn Fn() -> f64 + Send + Sync>"),
        ("Physics2DGuardClock", "Arc<dyn Fn() -> f64 + Send + Sync>"),
        (
            "Scene2DResourceFailureClock",
            "Arc<dyn Fn() -> f64 + Send + Sync>",
        ),
        (
            "Scene3DResourceFailureClock",
            "Arc<dyn Fn() -> f64 + Send + Sync>",
        ),
        ("Skeleton3DGuardClock", "Arc<dyn Fn() -> f64 + Send + Sync>"),
        ("TextGuardClock", "Arc<dyn Fn() -> f64 + Send + Sync>"),
        ("TextMarkupClock", "Arc<dyn Fn() -> f64 + Send + Sync>"),
        ("AnimationBlendTreeRef", "Ref<AnimationBlendTree>"),
        ("AnimationPlayerRef", "Ref<AnimationPlayer>"),
        ("AnimationStateMachineRef", "Ref<AnimationStateMachine>"),
        ("CameraGuardStateRef", "Ref<CameraGuardState>"),
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

pub fn classify_param(ty: &str) -> Option<ParamKind> {
    let raw_ty = strip_lifetimes(ty.trim());
    let ty = strip_lifetimes(&resolve_type_alias(ty.trim()));
    let ty = ty.as_str();

    if ty == "&str" {
        return Some(ParamKind::StrRef);
    }
    if ty == "Option<f32>" {
        return Some(ParamKind::OptionF32);
    }
    if ty == "Option<f64>" {
        return Some(ParamKind::OptionF64);
    }
    if ty == "Option<u32>" || ty == "Option<usize>" {
        return Some(ParamKind::Scalar("i64".to_string()));
    }
    if ty == "Option<i32>"
        || ty == "Option<u32>"
        || ty == "Option<usize>"
        || ty == "Option<i64>"
        || ty == "Option<u64>"
        || ty == "Option<u8>"
        || ty == "Option<u16>"
        || ty == "Option<i8>"
        || ty == "Option<i16>"
        || ty == "Option<isize>"
    {
        return Some(ParamKind::OptionI32);
    }
    if ty == "Option<bool>" {
        return Some(ParamKind::OptionBool);
    }
    if ty == "Option<&str>" {
        return Some(ParamKind::OptionStr);
    }
    if ty == "Option<String>" {
        return Some(ParamKind::OptionStringParam);
    }

    // Option<&mut [T]> for scalar T or struct T
    if let Some(inner) = ty.strip_prefix("Option<&mut [") {
        if let Some(inner) = inner.strip_suffix("]>") {
            let inner = inner.trim();
            if is_scalar(inner) || (!is_ffi_incompatible(inner) && !inner.contains('<')) {
                return Some(ParamKind::OptionSliceMut(inner.to_string()));
            }
        }
    }
    // Option<&[T]> for scalar T or struct T
    if let Some(inner) = ty.strip_prefix("Option<&[") {
        if let Some(inner) = inner.strip_suffix("]>") {
            let inner = inner.trim();
            if is_scalar(inner) || (!is_ffi_incompatible(inner) && !inner.contains('<')) {
                return Some(ParamKind::OptionSliceConst(inner.to_string()));
            }
        }
    }

    // Option<&Ref<T>> or Option<&mut Ref<T>> -> ArcRef (nullable opaque handle)
    if let Some(inner) = ty.strip_prefix("Option<&mut Ref<") {
        if let Some(inner) = inner.strip_suffix(">>") {
            let inner = inner.trim();
            if !inner.contains('<')
                && !inner.contains("::")
                && !SKIP_TYPES.iter().any(|s| inner.contains(s))
            {
                return Some(ParamKind::ArcRef);
            }
        }
    }
    if let Some(inner) = ty.strip_prefix("Option<&Ref<") {
        if let Some(inner) = inner.strip_suffix(">>") {
            let inner = inner.trim();
            if !inner.contains('<')
                && !inner.contains("::")
                && !SKIP_TYPES.iter().any(|s| inner.contains(s))
            {
                return Some(ParamKind::ArcRef);
            }
        }
    }

    if let Some(inner) = ty.strip_prefix("Option<&mut ") {
        if let Some(inner) = inner.strip_suffix('>') {
            let inner = inner.trim();
            if !inner.starts_with('[') && !is_ffi_incompatible(inner) && !is_scalar(inner) {
                return Some(ParamKind::OptionRefMut(inner.to_string()));
            }
        }
    }
    if let Some(inner) = ty.strip_prefix("Option<&") {
        if let Some(inner) = inner.strip_suffix('>') {
            let inner = inner.trim();
            if inner != "str"
                && !inner.starts_with('[')
                && !is_ffi_incompatible(inner)
                && !is_scalar(inner)
            {
                return Some(ParamKind::OptionRefConst(inner.to_string()));
            }
        }
    }

    if let Some(inner) = ty.strip_prefix("&mut Ref<") {
        if let Some(inner) = inner.strip_suffix('>') {
            let inner = inner.trim();
            if !inner.contains('<')
                && !inner.contains("::")
                && !SKIP_TYPES.iter().any(|s| inner.contains(s))
            {
                return Some(ParamKind::ArcRefMut);
            }
        }
    }
    if let Some(inner) = ty.strip_prefix("&Ref<") {
        if let Some(inner) = inner.strip_suffix('>') {
            let inner = inner.trim();
            if !inner.contains('<')
                && !inner.contains("::")
                && !SKIP_TYPES.iter().any(|s| inner.contains(s))
            {
                return Some(ParamKind::ArcRef);
            }
        }
    }

    // Option<Ref<T>> -> ArcRef (nullable opaque handle)
    if let Some(inner) = ty.strip_prefix("Option<Ref<") {
        if let Some(inner) = inner.strip_suffix(">>") {
            let inner = inner.trim();
            if !inner.contains('<')
                && !inner.contains("::")
                && !SKIP_TYPES.iter().any(|s| inner.contains(s))
            {
                return Some(ParamKind::ArcRef);
            }
        }
    }

    // &mut [T; N] -> FixedArrayMut(T, N) for scalar T
    if let Some(inner) = ty.strip_prefix("&mut [") {
        if let Some(inner) = inner.strip_suffix(']') {
            let inner = inner.trim();
            if let Some((elem, size_str)) = inner.split_once(';') {
                let elem = elem.trim();
                let size_str = size_str.trim();
                if is_scalar(elem) || (!is_ffi_incompatible(elem) && !elem.contains('<')) {
                    if let Ok(size) = size_str.parse::<usize>() {
                        return Some(ParamKind::FixedArrayMut(elem.to_string(), size));
                    }
                }
            }
        }
    }

    // &[T; N] -> FixedArrayConst(T, N) for scalar T
    if let Some(inner) = ty.strip_prefix("&[") {
        if let Some(inner) = inner.strip_suffix(']') {
            let inner = inner.trim();
            if let Some((elem, size_str)) = inner.split_once(';') {
                let elem = elem.trim();
                let size_str = size_str.trim();
                if is_scalar(elem) || (!is_ffi_incompatible(elem) && !elem.contains('<')) {
                    if let Ok(size) = size_str.parse::<usize>() {
                        return Some(ParamKind::FixedArrayConst(elem.to_string(), size));
                    }
                }
            }
        }
    }

    // &mut [T] -> SliceMut(T) for scalar T or struct T
    if let Some(inner) = ty.strip_prefix("&mut [") {
        if let Some(inner) = inner.strip_suffix(']') {
            let inner = inner.trim();
            if is_scalar(inner) || (!is_ffi_incompatible(inner) && !inner.contains('<')) {
                return Some(ParamKind::SliceMut(inner.to_string()));
            }
        }
    }
    // &mut [T] using raw (pre-resolution) type for alias types like NodeRef
    if let Some(raw_inner) = raw_ty.strip_prefix("&mut [") {
        if let Some(raw_inner) = raw_inner.strip_suffix(']') {
            let raw_inner = raw_inner.trim();
            if !raw_inner.contains('<') && !is_ffi_incompatible(raw_inner) {
                return Some(ParamKind::SliceMut(raw_inner.to_string()));
            }
        }
    }

    // &[T] -> SliceConst(T) for scalar T or struct T
    if let Some(inner) = ty.strip_prefix("&[") {
        if let Some(inner) = inner.strip_suffix(']') {
            let inner = inner.trim();
            if is_scalar(inner) || (!is_ffi_incompatible(inner) && !inner.contains('<')) {
                return Some(ParamKind::SliceConst(inner.to_string()));
            }
        }
    }
    // &[T] using raw (pre-resolution) type for alias types like NodeRef
    if let Some(raw_inner) = raw_ty.strip_prefix("&[") {
        if let Some(raw_inner) = raw_inner.strip_suffix(']') {
            let raw_inner = raw_inner.trim();
            if !raw_inner.contains('<') && !is_ffi_incompatible(raw_inner) {
                return Some(ParamKind::SliceConst(raw_inner.to_string()));
            }
        }
    }

    // &dyn Trait -> DynOpaque or DynMono
    if let Some(trait_name) = extract_dyn_trait(ty) {
        if DYN_OPAQUE_TRAITS.iter().any(|(n, _)| *n == trait_name) {
            return Some(ParamKind::DynOpaque(trait_name.to_string()));
        }
        if DYN_MONO_TRAITS.iter().any(|(n, _)| *n == trait_name) {
            return Some(ParamKind::DynMono(trait_name.to_string()));
        }
    }

    // &mut Vec<T> -> VecMut
    if let Some(inner) = ty.strip_prefix("&mut Vec<") {
        if let Some(inner) = inner.strip_suffix('>') {
            let inner = inner.trim();
            if is_scalar(inner)
                || is_known_enum(inner)
                || (!is_ffi_incompatible(inner) && !inner.contains('<'))
            {
                return Some(ParamKind::VecMut(inner.to_string()));
            }
        }
    }
    // &Vec<T> -> VecConst
    if let Some(inner) = ty.strip_prefix("&Vec<") {
        if let Some(inner) = inner.strip_suffix('>') {
            let inner = inner.trim();
            if is_scalar(inner)
                || is_known_enum(inner)
                || (!is_ffi_incompatible(inner) && !inner.contains('<'))
            {
                return Some(ParamKind::VecConst(inner.to_string()));
            }
        }
    }
    // Vec<T> owned -> VecOwned
    if let Some(inner) = ty.strip_prefix("Vec<") {
        if let Some(inner) = inner.strip_suffix('>') {
            let inner = inner.trim();
            if is_scalar(inner)
                || is_known_enum(inner)
                || (!is_ffi_incompatible(inner) && !inner.contains('<'))
            {
                return Some(ParamKind::VecOwned(inner.to_string()));
            }
        }
    }

    // Closure params: &dyn Fn(...), &mut dyn FnMut(...), Arc<dyn Fn(...) + Send + Sync>
    if ty.starts_with("&dyn Fn(")
        || ty.starts_with("&mut dyn FnMut(")
        || ty.starts_with("Arc<dyn Fn(")
    {
        return Some(ParamKind::Closure);
    }
    // Option<Arc<dyn Fn(...)>>
    if let Some(inner) = ty.strip_prefix("Option<") {
        if let Some(inner) = inner.strip_suffix('>') {
            let inner = inner.trim();
            if inner.starts_with("Arc<dyn Fn(") {
                return Some(ParamKind::OptionClosure);
            }
        }
    }

    // Box<[T]> -> BoxSlice(T) for scalar T
    if let Some(inner) = ty.strip_prefix("Box<[") {
        if let Some(inner) = inner.strip_suffix("]>") {
            let inner = inner.trim();
            if is_scalar(inner) {
                return Some(ParamKind::BoxSlice(inner.to_string()));
            }
        }
    }

    // Option<enum> -> OptionI32
    if let Some(inner) = ty.strip_prefix("Option<") {
        if let Some(inner) = inner.strip_suffix('>') {
            let inner = inner.trim();
            if is_known_enum(inner) {
                return Some(ParamKind::OptionI32);
            }
        }
    }

    // Ref<T> (owned) -> ArcRef
    if let Some(inner) = ty.strip_prefix("Ref<") {
        if let Some(inner) = inner.strip_suffix('>') {
            let inner = inner.trim();
            if !inner.contains('<')
                && !inner.contains("::")
                && !SKIP_TYPES.iter().any(|s| inner.contains(s))
            {
                return Some(ParamKind::ArcRef);
            }
        }
    }

    // [T; N] (owned fixed array) -> FixedArrayConst
    if ty.starts_with('[') {
        if let Some(inner) = ty.strip_prefix('[') {
            if let Some(inner) = inner.strip_suffix(']') {
                if let Some((elem, size)) = inner.rsplit_once(';') {
                    let elem = elem.trim();
                    let size = size.trim();
                    if is_scalar(elem) {
                        if let Ok(n) = size.parse::<usize>() {
                            return Some(ParamKind::FixedArrayConst(elem.to_string(), n));
                        }
                    }
                }
            }
        }
    }

    if is_ffi_incompatible(ty) {
        return None;
    }

    // &mut T -> RefMut(T)
    if let Some(inner) = ty.strip_prefix("&mut ") {
        let inner = inner.trim();
        if inner == "str" || inner.starts_with('[') || is_ffi_incompatible(inner) {
            return None;
        }
        return Some(ParamKind::RefMut(inner.to_string()));
    }

    // &T -> RefConst(T)
    if let Some(inner) = ty.strip_prefix('&') {
        let inner = inner.trim();
        if inner == "str" || inner.starts_with('[') || is_ffi_incompatible(inner) {
            return None;
        }
        return Some(ParamKind::RefConst(inner.to_string()));
    }

    // String param
    if ty == "String" {
        return Some(ParamKind::StringParam);
    }

    if is_scalar(ty) {
        return Some(ParamKind::Scalar(ty.to_string()));
    }

    if is_known_enum(ty) {
        return Some(ParamKind::Enum(ty.to_string()));
    }

    if is_known_enum(ty) {
        return Some(ParamKind::Scalar("u32".to_string()));
    }

    if !is_ffi_incompatible(ty) && !ty.starts_with('[') {
        return Some(ParamKind::RefMut(ty.to_string()));
    }

    None
}

pub fn classify_return(ty: &str) -> Option<ReturnKind> {
    let ty = strip_lifetimes(&resolve_type_alias(ty.trim()));
    let ty = ty.as_str();

    // Mirrors flight-ffi's tuple policy: only scalar tuples (plain or optional) are bridged, and no
    // tuple may fall through to the struct arms.
    if ty.starts_with('(') && ty.ends_with(')') {
        return scalar_tuple_elements(ty).map(ReturnKind::Tuple);
    }
    if let Some(inner) = ty
        .strip_prefix("Option<")
        .and_then(|rest| rest.strip_suffix('>'))
        .map(str::trim)
        .filter(|inner| inner.starts_with('('))
    {
        return scalar_tuple_elements(inner).map(ReturnKind::OptionTuple);
    }

    if ty == "Option<String>" || ty == "Option<&str>" {
        return Some(ReturnKind::OptionString);
    }

    // Option<scalar> -> Scalar (FFI uses sentinel NaN/-1)
    // Option<enum> -> Scalar("i32") (FFI uses -1 sentinel)
    if let Some(inner) = ty.strip_prefix("Option<") {
        if let Some(inner) = inner.strip_suffix('>') {
            let inner = inner.trim();
            if inner == "i32" || inner == "u32" {
                return Some(ReturnKind::Scalar("i64".to_string()));
            }
            if is_scalar(inner) {
                return Some(ReturnKind::Scalar(inner.to_string()));
            }
            if is_known_enum(inner) {
                return Some(ReturnKind::Scalar("i32".to_string()));
            }
        }
    }

    if let Some(inner) = ty.strip_prefix("Ref<") {
        if let Some(inner) = inner.strip_suffix('>') {
            let inner = inner.trim();
            if !inner.contains('<')
                && !inner.contains("::")
                && !SKIP_TYPES.iter().any(|s| inner.contains(s))
            {
                return Some(ReturnKind::ArcRefReturn);
            }
        }
    }
    if let Some(inner) = ty.strip_prefix("Option<Ref<") {
        if let Some(inner) = inner.strip_suffix(">>") {
            let inner = inner.trim();
            if !inner.contains('<')
                && !inner.contains("::")
                && !SKIP_TYPES.iter().any(|s| inner.contains(s))
            {
                return Some(ReturnKind::OptionArcRefReturn);
            }
        }
    }

    // Box<[T]> -> BoxSliceReturn
    if let Some(inner) = ty.strip_prefix("Box<[") {
        if let Some(inner) = inner.strip_suffix("]>") {
            let inner = inner.trim();
            if is_scalar(inner) {
                return Some(ReturnKind::BoxSliceReturn(inner.to_string()));
            }
        }
    }
    // Option<Box<[T]>> -> OptionBoxSliceReturn
    if let Some(inner) = ty.strip_prefix("Option<Box<[") {
        if let Some(inner) = inner.strip_suffix("]>>") {
            let inner = inner.trim();
            if is_scalar(inner) {
                return Some(ReturnKind::OptionBoxSliceReturn(inner.to_string()));
            }
        }
    }

    // Vec<T> -> VecReturn
    if let Some(inner) = ty.strip_prefix("Vec<") {
        if let Some(inner) = inner.strip_suffix('>') {
            let inner = inner.trim();
            if is_scalar(inner)
                || is_known_enum(inner)
                || (!is_ffi_incompatible(inner) && !inner.contains('<'))
            {
                return Some(ReturnKind::VecReturn(inner.to_string()));
            }
        }
    }
    // Option<Vec<T>> -> OptionVecReturn
    if let Some(inner) = ty.strip_prefix("Option<Vec<") {
        if let Some(inner) = inner.strip_suffix(">>") {
            let inner = inner.trim();
            if is_scalar(inner)
                || is_known_enum(inner)
                || (!is_ffi_incompatible(inner) && !inner.contains('<'))
            {
                return Some(ReturnKind::OptionVecReturn(inner.to_string()));
            }
        }
    }

    if ty == "&str" {
        return Some(ReturnKind::StringReturn);
    }

    // Option<T> where T is a struct -> OptionStruct
    if let Some(inner) = ty.strip_prefix("Option<") {
        if let Some(inner) = inner.strip_suffix('>') {
            let inner = inner.trim();
            if !is_ffi_incompatible(inner)
                && !inner.contains('<')
                && !inner.contains('[')
                && !inner.contains('(')
                && !inner.starts_with('&')
                && !is_scalar(inner)
            {
                if is_known_enum(inner) {
                    return Some(ReturnKind::OptionStruct(inner.to_string()));
                }
                return Some(ReturnKind::OptionStruct(inner.to_string()));
            }
        }
    }

    // &T (borrowed ref return) -> Struct (FFI returns *const T)
    if let Some(inner) = ty.strip_prefix('&') {
        let inner = inner.trim();
        if !is_ffi_incompatible(inner)
            && !inner.contains('<')
            && !inner.contains('[')
            && !inner.contains('(')
            && !is_scalar(inner)
        {
            return Some(ReturnKind::Struct(inner.to_string()));
        }
        return None;
    }

    if is_ffi_incompatible(ty) {
        return None;
    }

    if is_scalar(ty) {
        return Some(ReturnKind::Scalar(ty.to_string()));
    }
    if ty == "String" {
        return Some(ReturnKind::StringReturn);
    }
    // [T; N] -> FixedArrayReturn for scalar T
    if ty.starts_with('[') {
        if let Some(inner) = ty.strip_prefix('[') {
            if let Some(inner) = inner.strip_suffix(']') {
                if let Some((elem, size)) = inner.rsplit_once(';') {
                    let elem = elem.trim();
                    let size = size.trim();
                    if is_scalar(elem) {
                        if let Ok(n) = size.parse::<usize>() {
                            return Some(ReturnKind::FixedArrayReturn(elem.to_string(), n));
                        }
                    }
                }
            }
        }
        return None;
    }
    if is_known_enum(ty) {
        return Some(ReturnKind::Enum(ty.to_string()));
    }
    if is_known_enum(ty) {
        return Some(ReturnKind::Scalar("u32".to_string()));
    }
    return Some(ReturnKind::Struct(ty.to_string()));
}

/// The element types of a tuple the native ABI returns through `out_0`, `out_1`, ... parameters, or
/// `None` when flight-ffi does not bridge it (fewer than two elements, or any non-scalar element).
pub fn scalar_tuple_elements(ty: &str) -> Option<Vec<String>> {
    let inner = ty.strip_prefix('(')?.strip_suffix(')')?;
    let elements: Vec<String> = inner
        .split(',')
        .map(str::trim)
        .filter(|element| !element.is_empty())
        .map(str::to_string)
        .collect();
    if elements.len() < 2 || elements.iter().any(|element| !is_scalar(element)) {
        return None;
    }
    return Some(elements);
}

pub fn collect_pub_fns(src_dir: &Path) -> Vec<ParsedFn> {
    let lib_path = src_dir.join("lib.rs");
    if !lib_path.exists() {
        return Vec::new();
    }

    let exported_names = collect_exported_names(&lib_path, src_dir);
    if exported_names.is_empty() {
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
        for f in all_fns {
            if exported_names.contains(&f.name) {
                fns.push(f);
            }
        }
    }
    fns
}

pub fn collect_pub_structs(src_dir: &Path) -> Vec<ParsedStruct> {
    let lib_path = src_dir.join("lib.rs");
    if !lib_path.exists() {
        return Vec::new();
    }

    let exported_names = collect_exported_type_names(&lib_path, src_dir);
    if exported_names.is_empty() {
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
            if exported_names.contains(&s.name) && !SKIP_TYPES.contains(&s.name.as_str()) {
                structs.push(s);
            }
        }
    }
    structs
}

pub fn collect_pub_enums(src_dir: &Path) -> Vec<ParsedEnum> {
    let lib_path = src_dir.join("lib.rs");
    if !lib_path.exists() {
        return Vec::new();
    }

    let exported_names = collect_exported_type_names(&lib_path, src_dir);
    if exported_names.is_empty() {
        return Vec::new();
    }

    let mut enums = Vec::new();
    let mut entries: Vec<_> = fs::read_dir(src_dir)
        .unwrap()
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path().extension().is_some_and(|ext| ext == "rs")
                && !e.file_name().to_string_lossy().contains("test")
        })
        .collect();
    entries.sort_by_key(|e| e.file_name());

    let mut seen = BTreeSet::new();
    for entry in entries {
        let fname = entry.file_name().to_string_lossy().to_string();
        if fname == "contract.rs" || fname == "lib.rs" {
            continue;
        }
        let content = fs::read_to_string(entry.path()).unwrap();
        let mut all_enums = Vec::new();
        parse_enums_with_variants(&content, &mut all_enums);
        for e in all_enums {
            if exported_names.contains(&e.name)
                && !SKIP_TYPES.contains(&e.name.as_str())
                && seen.insert(e.name.clone())
            {
                enums.push(e);
            }
        }
    }
    enums
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
        let glob_mod = if line.ends_with("::*;") {
            if let Some(rest) = line.strip_prefix("pub use super::") {
                Some(rest.strip_suffix("::*;").unwrap())
            } else if let Some(rest) = line.strip_prefix("pub use crate::") {
                let path = rest.strip_suffix("::*;").unwrap();
                Some(path.rsplit("::").next().unwrap_or(path))
            } else {
                None
            }
        } else {
            None
        };
        if let Some(inner) = glob_mod {
            let mod_file = src_dir.join(format!("{inner}.rs"));
            if mod_file.exists() {
                let mod_content = fs::read_to_string(&mod_file).unwrap();
                let mut mod_structs = Vec::new();
                parse_pub_structs(&mod_content, &mut mod_structs);
                for s in mod_structs {
                    names.insert(s.name);
                }
                let mut mod_enums = Vec::new();
                parse_enums_with_variants(&mod_content, &mut mod_enums);
                for e in mod_enums {
                    names.insert(e.name);
                }
            }
        }
        let named_reexport =
            line.starts_with("pub use super::") || line.starts_with("pub use crate::");
        if named_reexport && !line.ends_with("::*;") {
            if let Some(name) = line.trim_end_matches(';').rsplit("::").next() {
                if name.chars().next().is_some_and(|c| c.is_uppercase()) {
                    names.insert(name.to_string());
                }
            }
        }
    }
}

fn collect_exported_names(lib_path: &Path, src_dir: &Path) -> BTreeSet<String> {
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
                        collect_glob_names(&mod_file, src_dir, &mut names);
                    }
                } else if let Some(name) = rest.rsplit("::").next() {
                    if name.chars().next().is_some_and(|c| c.is_lowercase()) {
                        names.insert(name.to_string());
                    }
                }
            }
        }
    }
    names
}

fn collect_glob_names(file: &Path, src_dir: &Path, names: &mut BTreeSet<String>) {
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
                let mut mod_fns = Vec::new();
                parse_pub_fns(&mod_content, &mut mod_fns);
                for f in mod_fns {
                    names.insert(f.name);
                }
            }
        }
        if line.starts_with("pub use super::") && !line.ends_with("::*;") {
            if let Some(name) = line.trim_end_matches(';').rsplit("::").next() {
                if name.chars().next().is_some_and(|c| c.is_lowercase()) {
                    names.insert(name.to_string());
                }
            }
        }
    }
}

pub fn parse_pub_fns(content: &str, out: &mut Vec<ParsedFn>) {
    let lines: Vec<&str> = content.lines().collect();
    let mut i = 0;
    let mut brace_depth: i32 = 0;
    while i < lines.len() {
        let line = lines[i].trim();

        if !line.starts_with("pub fn ") || brace_depth > 0 {
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

pub fn parse_pub_structs(content: &str, out: &mut Vec<ParsedStruct>) {
    let lines: Vec<&str> = content.lines().collect();
    let mut i = 0;
    while i < lines.len() {
        let line = lines[i].trim();
        if !line.starts_with("pub struct ") || !line.contains('{') {
            i += 1;
            continue;
        }

        let name_part = line.strip_prefix("pub struct ").unwrap();
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

        let mut fields = Vec::new();
        i += 1;
        while i < lines.len() {
            let fline = lines[i].trim();
            if fline == "}" {
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

pub fn collect_all_pub_enum_names(content: &str, out: &mut BTreeSet<String>) {
    for line in content.lines() {
        let line = line.trim();
        if let Some(rest) = line.strip_prefix("pub enum ") {
            let name_end = rest.find(|c: char| c == '{' || c == '<' || c == ' ' || c == '(');
            if let Some(end) = name_end {
                let name = rest[..end].trim();
                if !name.is_empty() && !rest[..end].contains('<') {
                    out.insert(name.to_string());
                }
            }
        }
    }
}

pub fn parse_simple_enums(content: &str, out: &mut BTreeSet<String>) {
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
        let mut variant_count = 0usize;
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
            variant_count += 1;
        }
        i += 1;

        if all_unit && variant_count >= 2 {
            out.insert(name);
        }
    }
}

pub fn parse_enums_with_variants(content: &str, out: &mut Vec<ParsedEnum>) {
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
        let mut next_value = 0u32;
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
            if let Some((vname, val_str)) = vline.split_once('=') {
                let vname = vname.trim().to_string();
                let val_str = val_str.trim();
                if let Some(hex) = val_str
                    .strip_prefix("0x")
                    .or_else(|| val_str.strip_prefix("0X"))
                {
                    if let Ok(v) = u32::from_str_radix(hex, 16) {
                        next_value = v;
                    }
                } else if let Ok(v) = val_str.parse::<u32>() {
                    next_value = v;
                }
                variants.push(ParsedEnumVariant {
                    name: vname,
                    value: next_value,
                });
            } else {
                variants.push(ParsedEnumVariant {
                    name: vline.trim().to_string(),
                    value: next_value,
                });
            }
            next_value += 1;
        }
        i += 1;

        if all_unit && variants.len() >= 2 {
            out.push(ParsedEnum { name, variants });
        }
    }
}

fn parse_struct_field(line: &str) -> Option<StructField> {
    let line = line.trim().trim_end_matches(',');
    let rest = line.strip_prefix("pub ")?;
    let colon = rest.find(':')?;
    let name = rest[..colon].trim();
    let name = name.strip_prefix("r#").unwrap_or(name).to_string();
    let ty = rest[colon + 1..].trim().to_string();
    if is_ffi_incompatible(&ty) {
        return None;
    }
    if !is_scalar(&ty) {
        return None;
    }
    Some(StructField { name, ty })
}

fn parse_fn_signature(sig: &str) -> Option<ParsedFn> {
    let sig = sig.trim();
    let after_pub_fn = sig.strip_prefix("pub fn ")?;

    let name_end = after_pub_fn.find(|c: char| c == '(' || c == '<')?;
    let name = after_pub_fn[..name_end].trim().to_string();

    if after_pub_fn.as_bytes().get(name_end) == Some(&b'<') {
        return None;
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
        source_name: Some(name.clone()),
        name,
        params,
        ret,
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
            b'>' if i > 0 && bytes[i - 1] == b'-' => {}
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
    let raw_name = param[..colon].trim();
    let name = raw_name.strip_prefix("mut ").unwrap_or(raw_name);
    // A raw identifier (`r#type`) is Rust spelling only; the target-language name is `type`.
    let name = name.strip_prefix("r#").unwrap_or(name).to_string();
    let ty = param[colon + 1..].trim().to_string();
    Some(Param { name, ty })
}

pub fn to_pascal_case(s: &str) -> String {
    let mut out = String::new();
    let mut capitalize_next = true;
    for c in s.chars() {
        if c == '_' || c == '-' {
            capitalize_next = true;
        } else if capitalize_next {
            out.push(c.to_ascii_uppercase());
            capitalize_next = false;
        } else {
            out.push(c);
        }
    }
    out
}

const HAXE_KEYWORDS: &[&str] = &[
    "abstract",
    "break",
    "callback",
    "case",
    "cast",
    "catch",
    "class",
    "continue",
    "default",
    "do",
    "dynamic",
    "else",
    "enum",
    "extends",
    "extern",
    "false",
    "final",
    "for",
    "function",
    "if",
    "implements",
    "import",
    "in",
    "inline",
    "interface",
    "macro",
    "new",
    "null",
    "operator",
    "overload",
    "override",
    "package",
    "private",
    "public",
    "return",
    "static",
    "switch",
    "this",
    "throw",
    "true",
    "try",
    "typedef",
    "untyped",
    "using",
    "var",
    "while",
];

pub fn to_camel_case(s: &str) -> String {
    let pascal = to_pascal_case(s);
    let mut chars = pascal.chars();
    let result = match chars.next() {
        None => String::new(),
        Some(c) => c.to_ascii_lowercase().to_string() + chars.as_str(),
    };
    if HAXE_KEYWORDS.contains(&result.as_str()) {
        format!("{result}_")
    } else {
        result
    }
}

/// `flight_math::random_gaussian_pair`, the scalar tuple return flight-ffi bridges through
/// `out_0`/`out_1`.
#[cfg(test)]
pub(crate) fn random_gaussian_pair_fixture() -> ParsedFn {
    return parse_fn_signature(
        "pub fn random_gaussian_pair(random: &dyn Fn() -> f32, mean: Option<f32>, standard_deviation: Option<f32>) -> (f32, f32) {",
    )
    .unwrap();
}

#[cfg(test)]
mod native_abi_tests {
    use super::*;

    #[test]
    fn moves_synthesized_frees_to_unique_owner_in_name_order() {
        let mut exports = vec![
            crate_exports(
                "flight-source",
                vec![
                    free_function("free_zebra", "Zebra"),
                    declared_function("keep_first"),
                    free_function("free_apple", "Apple"),
                    declared_function("free_declared"),
                    declared_function("keep_last"),
                ],
                vec![],
            ),
            crate_exports(
                "flight-owner",
                vec![declared_function("owner_function")],
                vec![parsed_struct("Zebra")],
            ),
        ];
        exports[1].enums.push(parsed_enum("Apple"));

        relocate_synthesized_frees(&mut exports);

        assert_eq!(
            function_names(&exports[0]),
            ["keep_first", "free_declared", "keep_last"]
        );
        assert_eq!(
            function_names(&exports[1]),
            ["owner_function", "free_apple", "free_zebra"]
        );
        assert_eq!(
            exports
                .iter()
                .map(|exports| exports.dir_name.as_str())
                .collect::<Vec<_>>(),
            ["flight-source", "flight-owner"]
        );
    }

    #[test]
    fn production_inventory_has_exact_owner_placements() {
        let exports = production_exports();
        let mut owners: BTreeMap<&str, BTreeSet<&str>> = BTreeMap::new();
        for item in exports {
            for parsed_struct in &item.structs {
                owners
                    .entry(parsed_struct.name.as_str())
                    .or_default()
                    .insert(item.dir_name.as_str());
            }
            for parsed_enum in &item.enums {
                owners
                    .entry(parsed_enum.name.as_str())
                    .or_default()
                    .insert(item.dir_name.as_str());
            }
        }

        let mut synthesized_count = 0;
        let mut unique_owner_count = 0;
        let mut zero_owner_count = 0;
        let mut multiple_owner_count = 0;
        let mut mismatches = Vec::new();
        for item in exports {
            for function in &item.fns {
                if function.source_name.is_some() || !function.name.starts_with("free_") {
                    continue;
                }
                synthesized_count += 1;
                let Some(ty) = synthesized_free_type(function) else {
                    zero_owner_count += 1;
                    continue;
                };
                match owners.get(ty) {
                    None => zero_owner_count += 1,
                    Some(type_owners) if type_owners.len() == 1 => {
                        unique_owner_count += 1;
                        if !type_owners.contains(item.dir_name.as_str()) {
                            mismatches.push((
                                function.name.as_str(),
                                ty,
                                item.dir_name.as_str(),
                                type_owners.clone(),
                            ));
                        }
                    }
                    Some(_) => multiple_owner_count += 1,
                }
            }
        }
        assert_eq!(synthesized_count, 413);
        assert_eq!(unique_owner_count, 180);
        assert_eq!(zero_owner_count, 233);
        assert_eq!(multiple_owner_count, 0);
        assert_eq!(mismatches, Vec::new());

        for (function_name, type_name, owner) in [
            ("free_rectangle", "Rectangle", "flight-geometry"),
            ("free_log_timer", "LogTimer", "flight-log"),
            ("free_glyph_metrics", "GlyphMetrics", "flight-font"),
            ("free_slot_id", "SlotId", "flight-signals"),
            (
                "free_backend_operation_explanation",
                "BackendOperationExplanation",
                "flight-host",
            ),
            ("free_timeline_label", "TimelineLabel", "flight-timeline"),
            (
                "free_text_layout_params",
                "TextLayoutParams",
                "flight-textlayout",
            ),
            (
                "free_text_line_metrics",
                "TextLineMetrics",
                "flight-textlayout",
            ),
            (
                "free_requirement_set",
                "RequirementSet",
                "flight-requirement",
            ),
        ] {
            let locations = function_locations(exports, function_name, type_name);
            assert_eq!(locations, [owner], "{function_name}");
        }
    }

    #[test]
    fn retains_synthesized_frees_without_a_unique_owner() {
        let mut exports = vec![
            crate_exports(
                "flight-source",
                vec![
                    free_function("free_missing", "Missing"),
                    free_function("free_shared", "Shared"),
                ],
                vec![],
            ),
            crate_exports("flight-owner-a", vec![], vec![parsed_struct("Shared")]),
            crate_exports("flight-owner-b", vec![], vec![parsed_struct("Shared")]),
        ];

        relocate_synthesized_frees(&mut exports);

        assert_eq!(function_names(&exports[0]), ["free_missing", "free_shared"]);
        assert!(exports[1].fns.is_empty());
        assert!(exports[2].fns.is_empty());
    }

    fn crate_exports(
        dir_name: &str,
        fns: Vec<ParsedFn>,
        structs: Vec<ParsedStruct>,
    ) -> CrateExports {
        return CrateExports {
            dir_name: dir_name.to_string(),
            fns,
            structs,
            enums: vec![],
        };
    }

    fn declared_function(name: &str) -> ParsedFn {
        return ParsedFn {
            name: name.to_string(),
            source_name: Some(name.to_string()),
            params: vec![],
            ret: None,
        };
    }

    fn free_function(name: &str, ty: &str) -> ParsedFn {
        return ParsedFn {
            name: name.to_string(),
            source_name: None,
            params: vec![Param {
                name: "ptr".to_string(),
                ty: format!("&mut {ty}"),
            }],
            ret: None,
        };
    }

    fn function_locations<'a>(
        exports: &'a [CrateExports],
        function_name: &str,
        type_name: &str,
    ) -> Vec<&'a str> {
        return exports
            .iter()
            .filter(|item| {
                item.fns.iter().any(|function| {
                    function.name == function_name
                        && synthesized_free_type(function) == Some(type_name)
                })
            })
            .map(|item| item.dir_name.as_str())
            .collect();
    }

    fn function_names(exports: &CrateExports) -> Vec<&str> {
        return exports
            .fns
            .iter()
            .map(|function| function.name.as_str())
            .collect();
    }

    fn parsed_enum(name: &str) -> ParsedEnum {
        return ParsedEnum {
            name: name.to_string(),
            variants: vec![],
        };
    }

    fn parsed_struct(name: &str) -> ParsedStruct {
        return ParsedStruct {
            name: name.to_string(),
            fields: vec![],
        };
    }

    fn production_exports() -> &'static [CrateExports] {
        static EXPORTS: OnceLock<Vec<CrateExports>> = OnceLock::new();
        return EXPORTS.get_or_init(|| {
            let crates_dir = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
            scan_all_crates(crates_dir)
        });
    }
    #[test]
    fn scalar_tuple_return_matches_ffi_out_parameter_policy() {
        let function = random_gaussian_pair_fixture();
        assert!(matches!(
            classify_return(function.ret.as_deref().unwrap()),
            Some(ReturnKind::Tuple(ref elements)) if elements == &["f32", "f32"]
        ));
        assert!(matches!(
            classify_return("(f64, u32, bool)"),
            Some(ReturnKind::Tuple(ref elements)) if elements.len() == 3
        ));
    }
    #[test]
    fn tuples_ffi_does_not_bridge_are_unsupported_not_structs() {
        for ty in [
            "(f32,)",
            "()",
            "(f32, Vector2)",
            "(String, f32)",
            "Option<(f32,)>",
            "Option<(f32, Vector2)>",
        ] {
            assert!(classify_return(ty).is_none(), "{ty}");
        }
    }
    #[test]
    fn optional_scalar_tuple_return_matches_ffi_presence_policy() {
        assert!(matches!(
            classify_return("Option<(f64, f64)>"),
            Some(ReturnKind::OptionTuple(ref elements)) if elements == &["f64", "f64"]
        ));
    }
    #[test]
    fn raw_identifier_parameters_drop_the_rust_prefix() {
        let function = parse_fn_signature(
            "pub fn trigger_haptic_notification(host: &HostHapticsCapability, r#type: HapticNotificationType) -> bool {",
        )
        .unwrap();
        assert_eq!(function.params[1].name, "type");
        assert_eq!(
            parse_struct_field("pub r#type: u32,").map(|field| field.name),
            Some("type".to_string())
        );
    }
    #[test]
    fn closure_arrow_preserves_following_parameters() {
        let function = parse_fn_signature(
            "pub fn random_exponential(random: &dyn Fn() -> f32, rate: Option<f32>) -> f32 {",
        )
        .unwrap();
        assert_eq!(function.params.len(), 2);
        assert_eq!(function.params[1].name, "rate");
        assert_eq!(function.params[0].ty, "&dyn Fn() -> f32");
    }
    #[test]
    fn fixed_struct_arrays_have_no_length_carrier() {
        assert!(matches!(
            classify_param("&mut [Vector3; 8]"),
            Some(ParamKind::FixedArrayMut(_, 8))
        ));
    }
    #[test]
    fn optional_unsigned_input_matches_wide_ffi_sentinel() {
        assert!(
            matches!(classify_param("Option<u32>"), Some(ParamKind::Scalar(ref t)) if t == "i64")
        );
        assert!(
            matches!(classify_return("Option<i32>"), Some(ReturnKind::Scalar(ref t)) if t == "i64")
        );
    }
    #[test]
    fn guard_clock_alias_uses_callback_and_context() {
        assert!(matches!(
            classify_param("NodeGuardClock"),
            Some(ParamKind::Closure)
        ));
    }
    const FFI_BUILD_SOURCE: &str = include_str!("../../flight-ffi/build.rs");

    #[test]
    fn every_host_capability_crate_is_scanned() {
        let crates_dir = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
        let unscanned: Vec<String> = host_capability_types_by_crate(crates_dir)
            .into_keys()
            .filter(|dir_name| !SCAN_CRATES.contains(&dir_name.as_str()))
            .collect();
        assert_eq!(unscanned, Vec::<String>::new());
    }
    #[test]
    fn every_scan_crate_has_a_source_directory() {
        let crates_dir = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
        let missing: Vec<&str> = SCAN_CRATES
            .iter()
            .copied()
            .filter(|dir_name| !crates_dir.join(dir_name).join("src").is_dir())
            .collect();
        assert_eq!(missing, Vec::<&str>::new());
    }
    #[test]
    fn scan_crates_are_strictly_ascending() {
        for pair in SCAN_CRATES.windows(2) {
            assert!(pair[0] < pair[1], "{} must precede {}", pair[0], pair[1]);
        }
    }
    #[test]
    fn scan_crates_match_ffi_scan_crates_exactly() {
        let ffi_crates = ffi_scan_crates();
        assert!(
            !ffi_crates.is_empty(),
            "flight-ffi SCAN_CRATES block not found"
        );
        let expected: Vec<&str> = ffi_crates
            .iter()
            .copied()
            .filter(|dir_name| {
                !SCAN_EXCLUDED_CRATES
                    .iter()
                    .any(|(name, _)| name == dir_name)
            })
            .collect();
        assert_eq!(SCAN_CRATES, expected.as_slice());
    }
    #[test]
    fn scan_exclusions_are_exact_and_reasoned() {
        let ffi_crates = ffi_scan_crates();
        let names: Vec<&str> = SCAN_EXCLUDED_CRATES.iter().map(|(name, _)| *name).collect();
        assert_eq!(names, Vec::<&str>::new());
        for (name, reason) in SCAN_EXCLUDED_CRATES {
            assert!(
                !reason.trim().is_empty(),
                "{name} needs an exclusion reason"
            );
            assert!(
                ffi_crates.contains(name),
                "{name} is not scanned by flight-ffi"
            );
            assert!(
                !SCAN_CRATES.contains(name),
                "{name} is both scanned and excluded"
            );
        }
    }

    fn ffi_scan_crates() -> Vec<&'static str> {
        let Some(start) = FFI_BUILD_SOURCE.find("const SCAN_CRATES: &[&str] = &[") else {
            return Vec::new();
        };
        let block = &FFI_BUILD_SOURCE[start..];
        let block = &block[..block.find("];").unwrap()];
        block
            .lines()
            .skip(1)
            .map(|line| line.trim().trim_end_matches(',').trim_matches('"'))
            .filter(|line| !line.is_empty())
            .collect()
    }

    // Every `pub struct Host*Capability` declared in a crate's non-test sources, keyed by crate.
    fn host_capability_types_by_crate(
        crates_dir: &Path,
    ) -> std::collections::BTreeMap<String, BTreeSet<String>> {
        let mut by_crate = std::collections::BTreeMap::new();
        let mut entries: Vec<_> = fs::read_dir(crates_dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .collect();
        entries.sort_by_key(|e| e.file_name());
        for entry in entries {
            let src_dir = entry.path().join("src");
            if !src_dir.is_dir() {
                continue;
            }
            let mut names = BTreeSet::new();
            collect_host_capability_names(&src_dir, &mut names);
            if !names.is_empty() {
                by_crate.insert(entry.file_name().to_string_lossy().to_string(), names);
            }
        }
        by_crate
    }

    fn collect_host_capability_names(dir: &Path, out: &mut BTreeSet<String>) {
        for entry in fs::read_dir(dir).unwrap().filter_map(|e| e.ok()) {
            let path = entry.path();
            if path.is_dir() {
                collect_host_capability_names(&path, out);
                continue;
            }
            let file_name = entry.file_name().to_string_lossy().to_string();
            if !file_name.ends_with(".rs") || file_name.contains("test") {
                continue;
            }
            for line in fs::read_to_string(&path).unwrap().lines() {
                let Some(rest) = line.trim().strip_prefix("pub struct Host") else {
                    continue;
                };
                let end = rest
                    .find(|c: char| !c.is_ascii_alphanumeric() && c != '_')
                    .unwrap_or(rest.len());
                let name = format!("Host{}", &rest[..end]);
                if name.ends_with("Capability") {
                    out.insert(name);
                }
            }
        }
    }
}
