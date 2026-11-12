use std::collections::BTreeSet;
use std::fs;
use std::path::Path;
use std::sync::OnceLock;

static KNOWN_ENUMS: OnceLock<BTreeSet<String>> = OnceLock::new();

pub fn is_known_enum(ty: &str) -> bool {
    KNOWN_ENUMS.get().map(|s| s.contains(ty)).unwrap_or(false)
}

pub const SCAN_CRATES: &[&str] = &[
    "flight-abc",
    "flight-adjustments",
    "flight-animation",
    "flight-audio",
    "flight-binpack",
    "flight-bitmap",
    "flight-bitmapfont",
    "flight-bitmapfont-formats",
    "flight-camera",
    "flight-camera-controls",
    "flight-clip",
    "flight-clock",
    "flight-collision",
    "flight-color",
    "flight-compression",
    "flight-easing",
    "flight-effects",
    "flight-encoding",
    "flight-entity",
    "flight-flow",
    "flight-font",
    "flight-font-formats",
    "flight-geometry",
    "flight-image",
    "flight-image-codec",
    "flight-input",
    "flight-intl",
    "flight-layout",
    "flight-lighting",
    "flight-log",
    "flight-materials",
    "flight-math",
    "flight-meshgeometry",
    "flight-motionpath",
    "flight-movieclip",
    "flight-node",
    "flight-particles",
    "flight-particles-formats",
    "flight-particleemitter",
    "flight-path",
    "flight-path-boolean",
    "flight-path-formats",
    "flight-physics2d",
    "flight-physics2d-abi",
    "flight-physics3d",
    "flight-physics3d-abi",
    "flight-picking",
    "flight-quadbatch",
    "flight-render",
    "flight-scene2d",
    "flight-scene2d-formats",
    "flight-scene3d",
    "flight-scene3d-formats",
    "flight-shading",
    "flight-shape",
    "flight-shape-formats",
    "flight-signals",
    "flight-skeleton2d",
    "flight-skeleton2d-formats",
    "flight-skeleton3d",
    "flight-snapshot",
    "flight-spatial",
    "flight-spring",
    "flight-spritesheet",
    "flight-spritesheet-formats",
    "flight-statechart",
    "flight-text",
    "flight-text-markup",
    "flight-textbidi",
    "flight-textsegment",
    "flight-texture",
    "flight-texture-formats",
    "flight-textureatlas",
    "flight-textureatlas-formats",
    "flight-tilemap",
    "flight-tilemap-formats",
    "flight-timeline",
    "flight-tween",
    "flight-velocity",
    "flight-video",
    "flight-xml",
];

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
pub struct CrateExports {
    pub dir_name: String,
    pub fns: Vec<ParsedFn>,
    pub structs: Vec<ParsedStruct>,
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

pub fn scan_all_crates(crates_dir: &Path) -> Vec<CrateExports> {
    let mut enum_names = BTreeSet::new();
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
        }
    }
    let enum_count = enum_names.len();
    let _ = KNOWN_ENUMS.set(enum_names);
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
                    params: vec![Param {
                        name: "ptr".to_string(),
                        ty: "Ref<CString>".to_string(),
                    }],
                    ret: None,
                });
            }
        }
        exported_fns.extend(free_fns);

        if !exported_fns.is_empty() || !structs.is_empty() {
            results.push(CrateExports {
                dir_name: dir_name.to_string(),
                fns: exported_fns,
                structs,
            });
        }
    }
    results
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
        ("AnimationBlendTreeRef", "Ref<AnimationBlendTree>"),
        ("AnimationPlayerRef", "Ref<AnimationPlayer>"),
        ("AnimationStateMachineRef", "Ref<AnimationStateMachine>"),
        ("CameraGuardStateRef", "Ref<CameraGuardState>"),
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
                if is_scalar(elem) {
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
                if is_scalar(elem) {
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

    if !is_ffi_incompatible(ty) && !ty.starts_with('[') {
        return Some(ParamKind::RefMut(ty.to_string()));
    }

    None
}

pub fn classify_return(ty: &str) -> Option<ReturnKind> {
    let ty = strip_lifetimes(&resolve_type_alias(ty.trim()));
    let ty = ty.as_str();

    if ty == "Option<String>" {
        return Some(ReturnKind::OptionString);
    }

    // Option<scalar> -> Scalar (FFI uses sentinel NaN/-1)
    // Option<enum> -> Scalar("i32") (FFI uses -1 sentinel)
    if let Some(inner) = ty.strip_prefix("Option<") {
        if let Some(inner) = inner.strip_suffix('>') {
            let inner = inner.trim();
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
            if !is_ffi_incompatible(inner) && !inner.contains('<') && !is_scalar(inner) {
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
        if !is_ffi_incompatible(inner) && !inner.contains('<') && !is_scalar(inner) {
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
    return Some(ReturnKind::Struct(ty.to_string()));
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

fn parse_struct_field(line: &str) -> Option<StructField> {
    let line = line.trim().trim_end_matches(',');
    let rest = line.strip_prefix("pub ")?;
    let colon = rest.find(':')?;
    let name = rest[..colon].trim().to_string();
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

    Some(ParsedFn { name, params, ret })
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
    let name = param[..colon].trim().to_string();
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

pub fn to_camel_case(s: &str) -> String {
    let pascal = to_pascal_case(s);
    let mut chars = pascal.chars();
    match chars.next() {
        None => String::new(),
        Some(c) => c.to_ascii_lowercase().to_string() + chars.as_str(),
    }
}
