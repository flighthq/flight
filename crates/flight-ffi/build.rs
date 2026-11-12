use std::collections::BTreeSet;
use std::env;
use std::fmt::Write as _;
use std::fs;
use std::path::{Path, PathBuf};

const QUALIFIER: &str = "flight_sdk";

const SCAN_CRATES: &[&str] = &[
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

const SKIP_FN_PREFIXES: &[&str] = &["initialize_"];
const SKIP_TYPES: &[&str] = &[
    "AttachmentSkin2D",
    "BidiClassKernel",
    "BidiClassKernelExplanation",
    "ClippingAttachment2D",
    "Float32Array",
    "Uint8Array",
    "MarkupTagRegistry",
    "PathMorphBuildResult",
    "PointAttachment2D",
    "Skeleton2DClippingAttachmentSlotRange",
    "Skeleton2DGuardState",
    "StrokePathGeometry",
    "TextMarkupGuardState",
    "Value",
];

fn main() {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let crates_dir = manifest_dir.parent().unwrap();
    let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());

    let mut all_output = String::from("use flight_sdk;\n\n");
    let mut boxed_types: BTreeSet<String> = BTreeSet::new();
    let mut seen_names: BTreeSet<String> = BTreeSet::new();

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
            let ffi_name = format!("flight_{}", func.name);
            if seen_names.contains(&ffi_name) {
                continue;
            }
            if let Some((wrapper, boxed_ty)) = generate_ffi_wrapper(func) {
                writeln!(crate_output, "{wrapper}").unwrap();
                seen_names.insert(ffi_name);
                crate_used = true;
                if let Some(ty) = boxed_ty {
                    boxed_types.insert(ty);
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

    writeln!(all_output, "// free functions").unwrap();
    writeln!(
        all_output,
        "#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn flight_free_string(ptr: *mut std::ffi::c_char) {{\n    if !ptr.is_null() {{\n        unsafe {{ drop(std::ffi::CString::from_raw(ptr)); }}\n    }}\n}}"
    )
    .unwrap();
    for qualified_ty in &boxed_types {
        let type_name = qualified_ty.rsplit("::").next().unwrap_or(qualified_ty);
        let snake = to_snake_case(type_name);
        writeln!(
            all_output,
            "#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn flight_free_{snake}(ptr: *mut {qualified_ty}) {{\n    if !ptr.is_null() {{\n        unsafe {{ drop(Box::from_raw(ptr)); }}\n    }}\n}}"
        )
        .unwrap();
    }

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

        if seen_names.contains(&getter_name) || seen_names.contains(&setter_name) {
            continue;
        }
        seen_names.insert(getter_name.clone());
        seen_names.insert(setter_name.clone());

        let ffi_ty = &field.ty;

        writeln!(
            output,
            "#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn {getter_name}(ptr: *const {qualified}) -> {ffi_ty} {{\n    return unsafe {{ &*ptr }}.{};\n}}",
            field.name
        )
        .unwrap();
        writeln!(
            output,
            "#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn {setter_name}(ptr: *mut {qualified}, value: {ffi_ty}) -> {ffi_ty} {{\n    unsafe {{ &mut *ptr }}.{} = value;\n    return value;\n}}",
            field.name
        )
        .unwrap();
    }
    output
}

fn is_ffi_incompatible(ty: &str) -> bool {
    ty.contains("dyn ")
        || ty.contains("Fn(")
        || ty.contains("FnMut(")
        || ty.contains("FnOnce(")
        || ty.contains('<')
        || ty.contains("::")
        || ty.ends_with("Like")
        || SKIP_TYPES.iter().any(|s| ty.contains(s))
}

fn generate_ffi_wrapper(func: &ParsedFn) -> Option<(String, Option<String>)> {
    if SKIP_FN_PREFIXES.iter().any(|p| func.name.starts_with(p)) {
        return None;
    }

    let mut ffi_params = Vec::new();
    let mut call_args = Vec::new();

    for param in &func.params {
        let (ffi_ty, call_expr) = map_param_to_ffi(&param.name, &param.ty)?;
        ffi_params.push(format!("{}: {ffi_ty}", param.name));
        call_args.push(call_expr);
    }

    let (ret_decl, call_wrap) = match &func.ret {
        None => (String::new(), FfiReturn::Void),
        Some(ty) => map_return_to_ffi(ty)?,
    };

    let boxed_ty = if matches!(call_wrap, FfiReturn::BoxReturn) {
        func.ret.as_ref().map(|ty| qualify_type(ty))
    } else {
        None
    };

    let ffi_name = format!("flight_{}", func.name);
    let call = format!(
        "flight_sdk::{name}({args})",
        name = func.name,
        args = call_args.join(", ")
    );

    let body = match call_wrap {
        FfiReturn::Void => format!("    {call};"),
        FfiReturn::Direct => format!("    return {call};"),
        FfiReturn::BoxReturn => {
            format!("    return Box::into_raw(Box::new({call}));")
        }
        FfiReturn::StringReturn => {
            format!(
                "    let s = {call};\n    \
                     let c_str = std::ffi::CString::new(s).unwrap_or_default();\n    \
                     return c_str.into_raw();"
            )
        }
    };

    Some((
        format!(
            "#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn {ffi_name}({params}){ret_decl} {{\n{body}\n}}",
            params = ffi_params.join(", "),
        ),
        boxed_ty,
    ))
}

enum FfiReturn {
    Void,
    Direct,
    BoxReturn,
    StringReturn,
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

fn qualify_type(ty: &str) -> String {
    if is_scalar(ty) || ty.starts_with('[') || ty.starts_with('(') {
        ty.to_string()
    } else {
        format!("{QUALIFIER}::{ty}")
    }
}

fn map_param_to_ffi(name: &str, ty: &str) -> Option<(String, String)> {
    let ty = ty.trim();

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
        return Some((
            format!("*mut {qualified}"),
            format!("unsafe {{ &mut *{name} }}"),
        ));
    }

    // &T -> *const T
    if let Some(inner) = ty.strip_prefix('&') {
        let inner = inner.trim();
        if inner == "str" || inner.starts_with('[') || is_ffi_incompatible(inner) {
            return None;
        }
        let qualified = qualify_type(inner);
        return Some((
            format!("*const {qualified}"),
            format!("unsafe {{ &*{name} }}"),
        ));
    }

    // Option<f32> -> f32 with NaN sentinel
    if ty == "Option<f32>" {
        return Some((
            "f32".to_string(),
            format!("if {name}.is_nan() {{ None }} else {{ Some({name}) }}"),
        ));
    }

    // Scalar types pass through
    if is_scalar(ty) {
        return Some((ty.to_string(), name.to_string()));
    }

    None
}

fn map_return_to_ffi(ty: &str) -> Option<(String, FfiReturn)> {
    let ty = ty.trim();

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
    let qualified = qualify_type(ty);
    Some((format!(" -> *mut {qualified}"), FfiReturn::BoxReturn))
}
