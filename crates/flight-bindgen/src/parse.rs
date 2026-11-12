use std::collections::BTreeSet;
use std::fs;
use std::path::Path;

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

pub const SKIP_FN_PREFIXES: &[&str] = &["initialize_"];

pub const SKIP_TYPES: &[&str] = &[
    "AttachmentSkin2D",
    "BidiClassKernel",
    "BidiClassKernelExplanation",
    "BoundsRectangleRuntimeMethods",
    "ClippingAttachment2D",
    "DateTimeFormatOptions",
    "Float32Array",
    "MarkupTagRegistry",
    "NodeRef",
    "NumberFormatOptions",
    "PathMeshPool",
    "PathMorphBuildResult",
    "PluralRulesOptions",
    "PointAttachment2D",
    "RelativeTimeFormatOptions",
    "ShapeJsonFormatOptions",
    "ShapeJsonParseOptions",
    "Skeleton2DClippingAttachmentSlotRange",
    "Skeleton2DGuardState",
    "StrokePathGeometry",
    "TextLayoutContext",
    "TextMarkupGuardState",
    "Transform2DRuntimeMethods",
    "Uint8Array",
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

pub fn is_ffi_incompatible(ty: &str) -> bool {
    ty.contains("dyn ")
        || ty.contains("Fn(")
        || ty.contains("FnMut(")
        || ty.contains("FnOnce(")
        || ty.contains('<')
        || ty.contains("::")
        || ty.ends_with("Like")
        || SKIP_TYPES.iter().any(|s| ty.contains(s))
}

pub fn scan_all_crates(crates_dir: &Path) -> Vec<CrateExports> {
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
            let ffi_name = format!("flight_{}", func.name);
            if seen_names.contains(&ffi_name) {
                continue;
            }
            if has_ffi_compatible_signature(&func) {
                seen_names.insert(ffi_name);
                exported_fns.push(func);
            }
        }

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
pub enum ParamKind {
    Scalar(String),
    RefConst(String),
    RefMut(String),
    OptionF32,
    OptionF64,
    OptionI32,
    OptionBool,
    StrRef,
    OptionStr,
    OptionStringParam,
    OptionRefConst(String),
    OptionRefMut(String),
    ArcRef,
    ArcRefMut,
}

#[derive(Debug, Clone)]
pub enum ReturnKind {
    Void,
    Scalar(String),
    Struct(String),
    StringReturn,
    OptionString,
    ArcRefReturn,
    OptionArcRefReturn,
}

pub fn classify_param(ty: &str) -> Option<ParamKind> {
    let ty = ty.trim();

    if ty == "&str" {
        return Some(ParamKind::StrRef);
    }
    if ty == "Option<f64>" {
        return Some(ParamKind::OptionF64);
    }
    if ty == "Option<i32>" {
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

    if is_ffi_incompatible(ty) {
        return None;
    }

    if let Some(inner) = ty.strip_prefix("&mut ") {
        let inner = inner.trim();
        if inner == "str" || inner.starts_with('[') || is_ffi_incompatible(inner) {
            return None;
        }
        return Some(ParamKind::RefMut(inner.to_string()));
    }

    if let Some(inner) = ty.strip_prefix('&') {
        let inner = inner.trim();
        if inner == "str" || inner.starts_with('[') || is_ffi_incompatible(inner) {
            return None;
        }
        return Some(ParamKind::RefConst(inner.to_string()));
    }

    if ty == "Option<f32>" {
        return Some(ParamKind::OptionF32);
    }

    if is_scalar(ty) {
        return Some(ParamKind::Scalar(ty.to_string()));
    }

    None
}

pub fn classify_return(ty: &str) -> Option<ReturnKind> {
    let ty = ty.trim();

    if ty == "Option<String>" {
        return Some(ReturnKind::OptionString);
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

    if ty.starts_with('&') || is_ffi_incompatible(ty) {
        return None;
    }

    if is_scalar(ty) {
        return Some(ReturnKind::Scalar(ty.to_string()));
    }
    if ty == "String" {
        return Some(ReturnKind::StringReturn);
    }
    if ty.starts_with('[') {
        return None;
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
