mod native_bindings;
use std::collections::BTreeSet;
use std::env;
use std::fmt::Write as _;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

static KNOWN_ENUMS: OnceLock<BTreeSet<String>> = OnceLock::new();

fn is_known_enum(ty: &str) -> bool {
    KNOWN_ENUMS.get().map(|s| s.contains(ty)).unwrap_or(false)
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

const SKIP_FN_PREFIXES: &[&str] = &["initialize_"];
const SKIP_FNS: &[&str] = &["enable_clip_guards", "enable_statechart_guards"];
const SKIP_TYPES: &[&str] = &[
    "AdjustmentRef",
    "AttachmentSkin2D",
    "BidiClassKernel",
    "BidiClassKernelExplanation",
    "Bone2D",
    "BoundsRectangleRuntimeMethods",
    "ClippingAttachment2D",
    "EffectFieldRoles",
    "MarkupTagRegistry",
    "MeshAttachment2D",
    "PathMeshPool",
    "PathMorphBuildResult",
    "PointAttachment2D",
    "RegionAttachment2D",
    "ShapeGeometryEnd",
    "ShapeJsonFormatOptions",
    "ShapeJsonParseOptions",
    "Skeleton2DClippingAttachmentSlotRange",
    "Skeleton2DCoercedInterpolation",
    "Skeleton2DConstraintSolver",
    "Skeleton2DGuardState",
    "Slot2D",
    "SpreadMethod",
    "SpritesheetParseDiagnosticSeverity",
    "StrokePathGeometry",
    "TextLayoutContext",
    "TextLayoutMeasureState",
    "TextMarkupGuardState",
    "Transform2DRuntimeMethods",
    "Value",
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
    all_output.push_str(generate_shape_bounds_context_support());
    let mut boxed_types: BTreeSet<String> = BTreeSet::new();
    let mut vec_ref_handle_specs: BTreeSet<VecRefHandleSpec> = BTreeSet::new();
    let mut seen_names: BTreeSet<String> = BTreeSet::new();
    let mut stats_total_fns = 0usize;
    let mut stats_generated = 0usize;
    let mut stats_skipped: std::collections::BTreeMap<String, usize> =
        std::collections::BTreeMap::new();

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
    let _ = KNOWN_ENUMS.set(enum_names);

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
            if has_mono_dyn_param(func) {
                let wrappers = generate_mono_wrappers(func);
                if wrappers.is_empty() {
                    let skip_reason = categorize_skip(func);
                    *stats_skipped.entry(skip_reason).or_insert(0) += 1;
                } else {
                    let mut emitted = false;
                    for (ffi_name, wrapper, boxed_ty) in wrappers {
                        if !seen_names.contains(&ffi_name) {
                            writeln!(crate_output, "{wrapper}").unwrap();
                            seen_names.insert(ffi_name);
                            crate_used = true;
                            emitted = true;
                            stats_generated += 1;
                            if let Some(ty) = boxed_ty {
                                boxed_types.insert(ty);
                            }
                        }
                    }
                    if emitted {
                        collect_vec_ref_handle_specs(func, &mut vec_ref_handle_specs);
                    }
                }
            } else {
                let ffi_name = format!("flight_{}", func.name);
                if seen_names.contains(&ffi_name) {
                    continue;
                }
                if let Some((wrapper, boxed_ty)) = generate_ffi_wrapper(func) {
                    writeln!(crate_output, "{wrapper}").unwrap();
                    seen_names.insert(ffi_name);
                    crate_used = true;
                    collect_vec_ref_handle_specs(func, &mut vec_ref_handle_specs);
                    stats_generated += 1;
                    if let Some(ty) = boxed_ty {
                        boxed_types.insert(ty);
                    }
                } else {
                    let skip_reason = categorize_skip(func);
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

    let stats_skipped_total: usize = stats_skipped.values().sum();
    let mut stats_file = String::new();
    writeln!(stats_file, "FFI stats: {stats_total_fns} total, {stats_generated} generated, {stats_skipped_total} skipped").unwrap();
    let mut sorted_skips: Vec<_> = stats_skipped.iter().collect();
    sorted_skips.sort_by(|a, b| b.1.cmp(a.1));
    for (reason, count) in &sorted_skips {
        writeln!(stats_file, "  skip: {count:>4} {reason}").unwrap();
    }
    fs::write(out_dir.join("ffi_stats.txt"), &stats_file).unwrap();

    validate_required_vec_ref_handle_specs(&vec_ref_handle_specs);
    all_output.push_str(&generate_vec_ref_handle_support(&vec_ref_handle_specs));
    all_output.push_str(&generate_import_diagnostic_list_support());

    writeln!(all_output, "// free functions").unwrap();
    writeln!(
        all_output,
        "#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn flight_free_string(ptr: *mut std::ffi::c_char) {{\n    if !ptr.is_null() {{\n        unsafe {{ drop(std::ffi::CString::from_raw(ptr)); }}\n    }}\n}}"
    )
    .unwrap();
    for qualified_ty in &boxed_types {
        let type_name = qualified_ty.rsplit("::").next().unwrap_or(qualified_ty);
        if type_name.starts_with('[') || type_name.starts_with('(') {
            continue;
        }
        let snake = boxed_free_suffix(type_name);
        writeln!(
            all_output,
            "#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn flight_free_{snake}(ptr: *mut {qualified_ty}) {{\n    if !ptr.is_null() {{\n        unsafe {{ drop(Box::from_raw(ptr)); }}\n    }}\n}}"
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
            if SKIP_TYPES.contains(&s.name.as_str()) || s.fields.is_empty() {
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

fn collect_exported_names(lib_path: &Path, src_dir: &Path) -> BTreeSet<String> {
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
                        collect_glob_names(&mod_file, src_dir, &mut names);
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

fn collect_glob_names(file: &Path, src_dir: &Path, names: &mut BTreeSet<String>) {
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
                    names.insert(f.name);
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
    }
}

fn parse_pub_fns(content: &str, out: &mut Vec<ParsedFn>) {
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

fn parse_simple_enums(content: &str, out: &mut BTreeSet<String>) {
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
        || SKIP_TYPES.iter().any(|s| ty.contains(s))
}

fn is_shape_bounds_context(ty: &str) -> bool {
    strip_crate_paths(&strip_lifetimes(&resolve_type_alias(ty.trim())))
        == "&mut dyn ShapeBoundsContext"
}

fn generate_ffi_wrapper(func: &ParsedFn) -> Option<(String, Option<String>)> {
    if SKIP_FN_PREFIXES.iter().any(|p| func.name.starts_with(p)) {
        return None;
    }
    if SKIP_FNS.contains(&func.name.as_str()) {
        return None;
    }

    let mut ffi_params = Vec::new();
    let mut call_args = Vec::new();
    let mut guard_bindings = Vec::new();
    let shape_bounds_context = func
        .params
        .iter()
        .find(|param| is_shape_bounds_context(&param.ty))
        .map(|param| param.name.trim_start_matches('_').to_string());

    for param in &func.params {
        let mapped = map_param_to_ffi(&param.name, &param.ty)?;
        for (pname, pty) in &mapped.ffi_params {
            ffi_params.push(format!("{pname}: {pty}"));
        }
        guard_bindings.extend(mapped.bindings);
        call_args.push(mapped.call_expr);

        let ty = strip_crate_paths(&strip_lifetimes(&resolve_type_alias(param.ty.trim())));
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
    append_tuple_out_params(&mut ffi_params, &call_wrap);
    append_async_callback_params(&mut ffi_params, &call_wrap);

    // An async value boxes its own output type, not the future the function returns.
    let (value_wrap, value_ty) = match &call_wrap {
        FfiReturn::AsyncCallback(spec) => (&spec.value, Some(spec.value_rust_ty.as_str())),
        _ => (&call_wrap, func.ret.as_deref()),
    };
    let boxed_ty = if matches!(
        value_wrap,
        FfiReturn::BoxReturn | FfiReturn::OptionBoxReturn
    ) {
        value_ty.map(|ty| {
            let resolved = resolve_type_alias(ty);
            if let Some(inner) = resolved.strip_prefix("Option<") {
                if let Some(inner) = inner.strip_suffix('>') {
                    return qualify_type(inner.trim());
                }
            }
            qualify_type(&resolved)
        })
    } else {
        None
    };

    let ffi_name = format!("flight_{}", func.name);
    let call = format!(
        "flight_sdk::{name}({args})",
        name = func.name,
        args = call_args.join(", ")
    );

    let preamble = if guard_bindings.is_empty() {
        String::new()
    } else {
        format!("{}\n", guard_bindings.join("\n"))
    };

    let body = if let Some(context) = shape_bounds_context {
        format!(
            "{preamble}    let call_succeeded = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {{\n        {call};\n    }})).is_ok();\n    return call_succeeded && !ffi_{context}.failed;"
        )
    } else {
        generate_return_body(&call_wrap, &call, &preamble)
    };
    let helpers = generate_vec_result_helpers(&ffi_name, value_wrap);

    Some((
        format!(
            "#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn {ffi_name}({params}){ret_decl} {{\n{body}\n}}{helpers}",
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
    if SKIP_FN_PREFIXES.iter().any(|p| func.name.starts_with(p)) {
        return Vec::new();
    }
    if SKIP_FNS.contains(&func.name.as_str()) {
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

    let boxed_ty = if matches!(call_wrap, FfiReturn::BoxReturn | FfiReturn::OptionBoxReturn) {
        func.ret.as_ref().map(|ty| {
            let resolved = resolve_type_alias(ty);
            if let Some(inner) = resolved.strip_prefix("Option<") {
                if let Some(inner) = inner.strip_suffix('>') {
                    return qualify_type(inner.trim());
                }
            }
            qualify_type(&resolved)
        })
    } else {
        None
    };

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

        let call = format!(
            "flight_sdk::{name}({args})",
            name = func.name,
            args = call_args.join(", ")
        );

        let preamble = if bindings.is_empty() {
            String::new()
        } else {
            format!("{}\n", bindings.join("\n"))
        };
        let body = generate_return_body(&call_wrap, &call, &preamble);
        let helpers = generate_vec_result_helpers(&ffi_name, &call_wrap);

        wrappers.push((
            ffi_name.clone(),
            format!(
                "#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn {ffi_name}({params}){ret_decl} {{\n{body}\n}}{helpers}",
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
    VecReturn(VecReturnSpec),
    OptionVecReturn(VecReturnSpec),
    // The element type of a boxed scalar slice (`Box<[T]>`).
    BoxSliceReturn(String),
    OptionBoxSliceReturn(String),
    TupleReturn(Vec<String>),
    OptionTupleReturn(Vec<String>),
    SliceReturn,
    RefReturn,
    OptionRefReturn,
    AsyncCallback(Box<AsyncCallbackSpec>),
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
            | FfiReturn::SliceReturn
            | FfiReturn::RefReturn
            | FfiReturn::OptionRefReturn
            | FfiReturn::AsyncCallback(_)
    )
}

fn append_tuple_out_params(ffi_params: &mut Vec<String>, call_wrap: &FfiReturn) {
    let (FfiReturn::TupleReturn(elements) | FfiReturn::OptionTupleReturn(elements)) = call_wrap
    else {
        return;
    };
    for (index, element) in elements.iter().enumerate() {
        ffi_params.push(format!("out_{index}: *mut {element}"));
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
        FfiReturn::OptionBoxReturn => format!(
            "{preamble}    match {call} {{\n        \
                 Some(v) => Box::into_raw(Box::new(v)),\n        \
                 None => std::ptr::null_mut(),\n    \
                 }}"
        ),
        FfiReturn::SliceReturn => format!(
            "{preamble}    let slice = {call};\n    \
                 return Box::into_raw(Box::new(slice.to_vec())) as *mut std::ffi::c_void;"
        ),
        FfiReturn::RefReturn => format!("{preamble}    return {call} as *const _;"),
        FfiReturn::OptionRefReturn => format!(
            "{preamble}    match {call} {{\n        \
                 Some(v) => v.as_ptr(),\n        \
                 None => std::ptr::null(),\n    \
                 }}"
        ),
        FfiReturn::VecReturn(_) | FfiReturn::BoxSliceReturn(_) => format!(
            "{preamble}    let vec = {call};\n    \
                 return Box::into_raw(Box::new(vec)) as *mut std::ffi::c_void;"
        ),
        FfiReturn::OptionVecReturn(_) | FfiReturn::OptionBoxSliceReturn(_) => format!(
            "{preamble}    match {call} {{\n        \
                 Some(vec) => Box::into_raw(Box::new(vec)) as *mut std::ffi::c_void,\n        \
                 None => std::ptr::null_mut(),\n    \
                 }}"
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
    let (element_ty, element_is_ref, container) = match call_wrap {
        FfiReturn::VecReturn(spec) | FfiReturn::OptionVecReturn(spec) => (
            spec.element_ty.as_str(),
            spec.element_is_ref,
            format!("Vec<{}>", spec.element_ty),
        ),
        FfiReturn::BoxSliceReturn(element) | FfiReturn::OptionBoxSliceReturn(element) => {
            (element.as_str(), false, format!("Box<[{element}]>"))
        }
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
    format!(
        "\n#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn {ffi_name}_result_len(result: *const std::ffi::c_void) -> usize {{\n    if result.is_null() {{ return 0; }}\n    return unsafe {{ &*(result as *const {container}) }}.len();\n}}\n#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn {ffi_name}_result_get(result: *const std::ffi::c_void, index: usize) -> {get_return} {{\n    if result.is_null() {{ return std::ptr::null(); }}\n    match unsafe {{ &*(result as *const {container}) }}.get(index) {{\n        Some(value) => {get_value},\n        None => std::ptr::null(),\n    }}\n}}\n#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn {ffi_name}_result_free(result: *mut std::ffi::c_void) {{\n    if !result.is_null() {{ unsafe {{ drop(Box::from_raw(result as *mut {container})); }} }}\n}}"
    )
}

// The caller-owned list behind every `Option<&mut Vec<ImportDiagnostic>>` parameter. C reads an item
// by (list, index) on every access, so no pointer into the Vec survives a call that can grow it.
// A pointer is a list only while its address is in the live-list registry, checked before any
// reference to the list type exists: NULL, another handle type, or a destroyed list collects
// nothing, clear and destroy ignore it, and getters return the empty value (-1, NULL, 0, false or
// NaN), as they do for an index out of range. Strings getters return are owned and freed with
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
         #[unsafe(no_mangle)]\n\
         pub unsafe extern \"C\" fn flight_create_import_diagnostic_list() -> *mut FfiImportDiagnosticList {\n    let list = Box::into_raw(Box::new(FfiImportDiagnosticList { values: Vec::new() }));\n    get_ffi_import_diagnostic_lists().insert(list as usize);\n    list\n}\n\
         #[unsafe(no_mangle)]\n\
         pub unsafe extern \"C\" fn flight_destroy_import_diagnostic_list(list: *mut FfiImportDiagnosticList) {\n    if list.is_null() || !get_ffi_import_diagnostic_lists().remove(&(list as usize)) { return; }\n    unsafe { drop(Box::from_raw(list)); }\n}\n\
         #[unsafe(no_mangle)]\n\
         pub unsafe extern \"C\" fn flight_get_import_diagnostic_list_detail_bool(list: *const FfiImportDiagnosticList, index: usize, detail_index: usize) -> bool {\n    match unsafe { ffi_import_diagnostic_list_detail(list, index, detail_index) } {\n        Some((_, flight_sdk::ImportDiagnosticDetailValue::Bool(value))) => *value,\n        _ => false,\n    }\n}\n\
         #[unsafe(no_mangle)]\n\
         pub unsafe extern \"C\" fn flight_get_import_diagnostic_list_detail_key(list: *const FfiImportDiagnosticList, index: usize, detail_index: usize) -> *mut std::ffi::c_char {\n    match unsafe { ffi_import_diagnostic_list_detail(list, index, detail_index) } {\n        Some((key, _)) => ffi_import_diagnostic_c_string(key),\n        None => std::ptr::null_mut(),\n    }\n}\n\
         // 0 is Bool, 1 is Number and 2 is String.\n\
         #[unsafe(no_mangle)]\n\
         pub unsafe extern \"C\" fn flight_get_import_diagnostic_list_detail_kind(list: *const FfiImportDiagnosticList, index: usize, detail_index: usize) -> i32 {\n    match unsafe { ffi_import_diagnostic_list_detail(list, index, detail_index) } {\n        Some((_, flight_sdk::ImportDiagnosticDetailValue::Bool(_))) => 0,\n        Some((_, flight_sdk::ImportDiagnosticDetailValue::Number(_))) => 1,\n        Some((_, flight_sdk::ImportDiagnosticDetailValue::String(_))) => 2,\n        None => -1,\n    }\n}\n\
         #[unsafe(no_mangle)]\n\
         pub unsafe extern \"C\" fn flight_get_import_diagnostic_list_detail_length(list: *const FfiImportDiagnosticList, index: usize) -> usize {\n    match unsafe { ffi_import_diagnostic_list_item(list, index) } {\n        Some(diagnostic) => diagnostic.detail.as_ref().map_or(0, |detail| detail.len()),\n        None => 0,\n    }\n}\n\
         #[unsafe(no_mangle)]\n\
         pub unsafe extern \"C\" fn flight_get_import_diagnostic_list_detail_number(list: *const FfiImportDiagnosticList, index: usize, detail_index: usize) -> f32 {\n    match unsafe { ffi_import_diagnostic_list_detail(list, index, detail_index) } {\n        Some((_, flight_sdk::ImportDiagnosticDetailValue::Number(value))) => *value,\n        _ => f32::NAN,\n    }\n}\n\
         #[unsafe(no_mangle)]\n\
         pub unsafe extern \"C\" fn flight_get_import_diagnostic_list_detail_string(list: *const FfiImportDiagnosticList, index: usize, detail_index: usize) -> *mut std::ffi::c_char {\n    match unsafe { ffi_import_diagnostic_list_detail(list, index, detail_index) } {\n        Some((_, flight_sdk::ImportDiagnosticDetailValue::String(value))) => ffi_import_diagnostic_c_string(value),\n        _ => std::ptr::null_mut(),\n    }\n}\n\
         #[unsafe(no_mangle)]\n\
         pub unsafe extern \"C\" fn flight_get_import_diagnostic_list_kind(list: *const FfiImportDiagnosticList, index: usize) -> *mut std::ffi::c_char {\n    match unsafe { ffi_import_diagnostic_list_item(list, index) } {\n        Some(diagnostic) => ffi_import_diagnostic_c_string(&diagnostic.kind),\n        None => std::ptr::null_mut(),\n    }\n}\n\
         #[unsafe(no_mangle)]\n\
         pub unsafe extern \"C\" fn flight_get_import_diagnostic_list_length(list: *const FfiImportDiagnosticList) -> usize {\n    if !is_ffi_import_diagnostic_list(list) { return 0; }\n    unsafe { &(*list).values }.len()\n}\n\
         // The `format_import_diagnostic` line: severity, origin, kind and sorted detail.\n\
         #[unsafe(no_mangle)]\n\
         pub unsafe extern \"C\" fn flight_get_import_diagnostic_list_message(list: *const FfiImportDiagnosticList, index: usize) -> *mut std::ffi::c_char {\n    match unsafe { ffi_import_diagnostic_list_item(list, index) } {\n        Some(diagnostic) => ffi_import_diagnostic_c_string(&flight_sdk::format_import_diagnostic(diagnostic)),\n        None => std::ptr::null_mut(),\n    }\n}\n\
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
        writeln!(
            output,
            "unsafe fn ffi_vec_ref_{slug}_values<'a>(handle: *mut FfiVecRefHandle<{inner_ty}>) -> &'a mut Vec<flight_sdk::Ref<{inner_ty}>> {{\n    assert!(!handle.is_null(), \"null Vec<Ref<{slug}>> handle\");\n    let handle = unsafe {{ &mut *handle }};\n    assert_eq!(handle.tag, {tag}, \"wrong Vec<Ref<{slug}>> handle type\");\n    &mut handle.values\n}}\n\
             #[unsafe(no_mangle)]\n\
             pub unsafe extern \"C\" fn flight_vec_ref_{slug}_create() -> *mut FfiVecRefHandle<{inner_ty}> {{\n    Box::into_raw(Box::new(FfiVecRefHandle {{ tag: {tag}, values: Vec::new() }}))\n}}\n\
             #[unsafe(no_mangle)]\n\
             pub unsafe extern \"C\" fn flight_vec_ref_{slug}_len(handle: *const FfiVecRefHandle<{inner_ty}>) -> usize {{\n    if handle.is_null() {{ return 0; }}\n    let handle = unsafe {{ &*handle }};\n    assert_eq!(handle.tag, {tag}, \"wrong Vec<Ref<{slug}>> handle type\");\n    handle.values.len()\n}}\n\
             #[unsafe(no_mangle)]\n\
             pub unsafe extern \"C\" fn flight_vec_ref_{slug}_get(handle: *const FfiVecRefHandle<{inner_ty}>, index: usize) -> *const std::ffi::c_void {{\n    if handle.is_null() {{ return std::ptr::null(); }}\n    let handle = unsafe {{ &*handle }};\n    assert_eq!(handle.tag, {tag}, \"wrong Vec<Ref<{slug}>> handle type\");\n    match handle.values.get(index) {{\n        Some(value) => value as *const _ as *const std::ffi::c_void,\n        None => std::ptr::null(),\n    }}\n}}\n\
             #[unsafe(no_mangle)]\n\
             pub unsafe extern \"C\" fn flight_vec_ref_{slug}_free(handle: *mut FfiVecRefHandle<{inner_ty}>) {{\n    if handle.is_null() {{ return; }}\n    assert_eq!(unsafe {{ (*handle).tag }}, {tag}, \"wrong Vec<Ref<{slug}>> handle type\");\n    unsafe {{ drop(Box::from_raw(handle)); }}\n}}"
        )
        .unwrap();
    }
    output
}

fn categorize_skip(func: &ParsedFn) -> String {
    if func.name.starts_with("initialize_") {
        return "prefix_skip(initialize_)".to_string();
    }
    if SKIP_FNS.contains(&func.name.as_str()) {
        return "fn_skip".to_string();
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
            if SKIP_TYPES.iter().any(|s| resolved.contains(s)) {
                return format!("skip_type_param({})", ty);
            }
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
        if SKIP_TYPES.iter().any(|s| resolved.contains(s)) {
            return format!("skip_type_return({})", ret);
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

// The `flight_free_*` suffix for a boxed return type. The only generic boxed type is `Signal<()>`, an
// owned opaque signal handle whose Rust name has no valid snake-case spelling.
fn boxed_free_suffix(type_name: &str) -> String {
    if type_name == "Signal<()>" {
        return "unit_signal".to_string();
    }
    assert!(
        !type_name.contains('<'),
        "boxed generic type {type_name} needs an explicit free name"
    );
    return to_snake_case(type_name);
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
    if SKIP_TYPES.iter().any(|skip| inner.contains(skip)) {
        return None;
    }
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

fn qualify_type(ty: &str) -> String {
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

fn map_param_to_ffi(name: &str, ty: &str) -> Option<MappedParam> {
    let ty = strip_crate_paths(&strip_lifetimes(&resolve_type_alias(ty.trim())));
    let ty = ty.as_str();

    // Option<&mut Vec<ImportDiagnostic>> -> a nullable, registered diagnostics list. NULL does not collect.
    if ty == "Option<&mut Vec<ImportDiagnostic>>" {
        return mapped_single(
            name,
            "*mut FfiImportDiagnosticList",
            format!("unsafe {{ ffi_import_diagnostic_list_values({name}) }}"),
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
                        "if {ptr_name}.is_null() {{ None }} else {{ Some(unsafe {{ std::slice::from_raw_parts({ptr_name}, {len_name}) }}) }}"
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
                            "    let {binding_name}: Option<Vec<{element_ty}>> = if {ptr_name}.is_null() {{ None }} else {{ Some(unsafe {{ std::slice::from_raw_parts({ptr_name}, {len_name}) }}.iter().map(|handle| {{ assert!(!(*handle).is_null(), \"Ref slice contains a null handle\"); unsafe {{ &*(*handle as *const {element_ty}) }}.clone() }}).collect()) }};"
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
                        "if {ptr_name}.is_null() {{ None }} else {{ Some(unsafe {{ std::slice::from_raw_parts_mut({ptr_name}, {len_name}) }}) }}"
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
            if is_known_enum(inner) && !SKIP_TYPES.iter().any(|s| inner.contains(s)) {
                let qualified = qualify_type(inner);
                return mapped_single(
                    name,
                    "i32",
                    format!(
                        "if {name} < 0 {{ None }} else {{ Some(unsafe {{ std::mem::transmute::<u32, {qualified}>({name} as u32) }}) }}"
                    ),
                );
            }
        }
    }

    // &mut Ref<T> -> *mut c_void (opaque handle to Arc<RwLock<T>>)
    if let Some(inner) = ty.strip_prefix("&mut Ref<") {
        if let Some(inner) = inner.strip_suffix('>') {
            let inner = inner.trim();
            if !inner.contains('<')
                && !inner.contains("::")
                && !SKIP_TYPES.iter().any(|s| inner.contains(s))
            {
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
            if !inner.contains('<')
                && !inner.contains("::")
                && !SKIP_TYPES.iter().any(|s| inner.contains(s))
            {
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
                    "    assert!(!{ptr_name}.is_null() || {len_name} == 0, \"null string array must have length zero\");"
                ),
                format!(
                    "    let {binding_name}_ptrs: &[*const std::ffi::c_char] = if {len_name} == 0 {{ &[] }} else {{ unsafe {{ std::slice::from_raw_parts({ptr_name}, {len_name}) }} }};"
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
                            "    let {binding_name}_handles: &[*const std::ffi::c_void] = if {len_name} == 0 {{ &[] }} else {{ unsafe {{ std::slice::from_raw_parts({ptr_name}, {len_name}) }} }};"
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
                        "unsafe {{ std::slice::from_raw_parts_mut({ptr_name}, {len_name}) }}"
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
                        "unsafe {{ std::slice::from_raw_parts({ptr_name}, {len_name}) }}"
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
            if !inner.contains("dyn ")
                && !inner.contains('<')
                && !inner.contains("::")
                && !SKIP_TYPES.iter().any(|s| inner.contains(s))
            {
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
                && !SKIP_TYPES.iter().any(|s| inner.contains(s))
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
                && !SKIP_TYPES.iter().any(|s| inner.contains(s))
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
                                "unsafe {{ Vec::from_raw_parts({ptr_name}, {len_name}, {len_name}) }}.into_boxed_slice()"
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
                        "if {ptr_name}.is_null() {{ None }} else {{ Some(unsafe {{ std::slice::from_raw_parts({ptr_name}, {len_name}) }}) }}"
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
                        "if {ptr_name}.is_null() {{ None }} else {{ Some(unsafe {{ std::slice::from_raw_parts_mut({ptr_name}, {len_name}) }}) }}"
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
                    && parsed.params.iter().all(|(cty, _)| is_scalar(cty))
                    && (parsed.ret == "void" || is_scalar(&parsed.ret))
                {
                    let fn_name = format!("{name}_fn");
                    let ctx_name = format!("{name}_ctx");
                    let mut ffi_fn_params = vec!["*mut std::ffi::c_void".to_string()];
                    let mut ffi_fn_args_str = Vec::new();
                    let mut outer_closure_params = Vec::new();
                    for (i, (cty, _)) in parsed.params.iter().enumerate() {
                        let arg_name = format!("__a{i}");
                        ffi_fn_params.push(cty.clone());
                        ffi_fn_args_str.push(arg_name.clone());
                        outer_closure_params.push(format!("{arg_name}: {cty}"));
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
        let ffi_ret = if parsed.ret == "void" {
            String::new()
        } else if is_scalar(&parsed.ret) {
            format!(" -> {}", parsed.ret)
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
        let closure_body = if parsed.is_arc {
            format!(
                "{{ let __ctx = {ctx_name} as usize; let __f = {fn_name} as usize; std::sync::Arc::new(move |{outer_params_str}| {{ let __fp: {ffi_fn_sig} = unsafe {{ std::mem::transmute(__f) }}; __fp({arc_call_args}) }}) }}"
            )
        } else if parsed.is_mut {
            format!("&mut |{outer_params_str}| ({fn_name})({inner_args})")
        } else {
            format!("&|{outer_params_str}| ({fn_name})({inner_args})")
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

    if is_known_enum(ty) {
        let qualified = qualify_type(ty);
        return mapped_single(
            name,
            "u32",
            format!("unsafe {{ std::mem::transmute::<u32, {qualified}>({name}) }}"),
        );
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
                        let qualified = qualify_type(elem);
                        return mapped_single(
                            name,
                            &format!("*const {qualified}"),
                            format!(
                                "unsafe {{ std::ptr::read({name} as *const [{qualified}; {size_str}]) }}"
                            ),
                        );
                    }
                }
            }
        }
    }

    // Owned struct T -> *const T (read from pointer)
    if !ty.contains('<') && !ty.contains("::") && !ty.starts_with('[') && !ty.starts_with('(') {
        let qualified = qualify_type(ty);
        return mapped_single(
            name,
            &format!("*const {qualified}"),
            format!("unsafe {{ std::ptr::read({name}) }}"),
        );
    }

    None
}

fn map_return_to_ffi(ty: &str) -> Option<(String, FfiReturn)> {
    let ty = strip_crate_paths(&strip_lifetimes(&resolve_type_alias(ty.trim())));
    let ty = ty.as_str();

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
            if !inner.contains('<')
                && !inner.contains("::")
                && !SKIP_TYPES.iter().any(|s| inner.contains(s))
            {
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
            if !inner.contains('<')
                && !inner.contains("::")
                && !SKIP_TYPES.iter().any(|s| inner.contains(s))
            {
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
            if is_scalar(inner)
                || is_known_enum(inner)
                || (!is_ffi_incompatible(inner) && !inner.contains('<'))
            {
                return Some((
                    " -> *mut std::ffi::c_void".to_string(),
                    FfiReturn::VecReturn(VecReturnSpec {
                        element_ty: qualify_type(inner),
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
            if is_scalar(inner)
                || is_known_enum(inner)
                || (!is_ffi_incompatible(inner) && !inner.contains('<'))
            {
                return Some((
                    " -> *mut std::ffi::c_void".to_string(),
                    FfiReturn::OptionVecReturn(VecReturnSpec {
                        element_ty: qualify_type(inner),
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
            if !inner.contains('<')
                && !inner.contains("::")
                && !inner.starts_with('&')
                && !is_scalar(inner)
                && !SKIP_TYPES.iter().any(|s| inner.contains(s))
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
                    FfiReturn::SliceReturn,
                ));
            }
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

    if ty.starts_with('&') || is_ffi_incompatible(ty) {
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
    let qualified = qualify_type(ty);
    Some((format!(" -> *mut {qualified}"), FfiReturn::BoxReturn))
}
