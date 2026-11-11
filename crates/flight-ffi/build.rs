use std::collections::BTreeSet;
use std::env;
use std::fmt::Write as _;
use std::fs;
use std::path::{Path, PathBuf};

fn main() {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let crates_dir = manifest_dir.parent().unwrap();
    let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());

    let crates: &[(&str, &str)] = &[
        ("flight_color", "flight-color"),
        ("flight_geometry", "flight-geometry"),
        ("flight_math", "flight-math"),
    ];

    let mut all_output = String::new();
    let mut boxed_types: BTreeSet<String> = BTreeSet::new();

    for &(rust_name, dir_name) in crates {
        let src_dir = crates_dir.join(dir_name).join("src");
        if !src_dir.exists() {
            continue;
        }
        println!("cargo::rerun-if-changed={}", src_dir.display());

        let fns = collect_pub_fns(&src_dir);
        if fns.is_empty() {
            continue;
        }

        writeln!(all_output, "// {dir_name}").unwrap();
        for func in &fns {
            if let Some((wrapper, boxed_ty)) = generate_ffi_wrapper(rust_name, func) {
                writeln!(all_output, "{wrapper}").unwrap();
                if let Some(ty) = boxed_ty {
                    boxed_types.insert(ty);
                }
            }
        }
        writeln!(all_output).unwrap();
    }

    writeln!(all_output, "// free functions").unwrap();
    writeln!(
        all_output,
        "#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn ffi_free_string(ptr: *mut std::ffi::c_char) {{\n    if !ptr.is_null() {{\n        unsafe {{ drop(std::ffi::CString::from_raw(ptr)); }}\n    }}\n}}"
    )
    .unwrap();
    for qualified_ty in &boxed_types {
        let snake = qualified_ty.replace("::", "_");
        writeln!(
            all_output,
            "#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn ffi_free_{snake}(ptr: *mut {qualified_ty}) {{\n    if !ptr.is_null() {{\n        unsafe {{ drop(Box::from_raw(ptr)); }}\n    }}\n}}"
        )
        .unwrap();
    }

    fs::write(out_dir.join("ffi_generated.rs"), all_output).unwrap();
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

fn collect_pub_fns(src_dir: &Path) -> Vec<ParsedFn> {
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
        let content = fs::read_to_string(entry.path()).unwrap();
        // Skip contract.rs (re-exports only) and mod-only files
        if entry.file_name().to_string_lossy() == "contract.rs" {
            continue;
        }
        parse_pub_fns(&content, &mut fns);
    }
    fns
}

fn parse_pub_fns(content: &str, out: &mut Vec<ParsedFn>) {
    let lines: Vec<&str> = content.lines().collect();
    let mut i = 0;
    let mut brace_depth: i32 = 0;
    while i < lines.len() {
        let line = lines[i].trim();

        // Track brace depth to skip functions inside impl/struct/mod blocks
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

        // Collect the full signature (may span multiple lines until `{`)
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
    // Extract: pub fn name(params) -> RetType {
    let sig = sig.trim();
    let after_pub_fn = sig.strip_prefix("pub fn ")?;

    // Find the function name (stop at `<` for generics or `(` for params)
    let name_end = after_pub_fn.find(|c: char| c == '(' || c == '<')?;
    let name = after_pub_fn[..name_end].trim().to_string();

    // Skip generic functions — they can't cross FFI
    if after_pub_fn.as_bytes().get(name_end) == Some(&b'<') {
        return None;
    }

    // Extract params between the outermost ()
    let params_start = after_pub_fn.find('(')?;
    let params_end = find_matching_paren(after_pub_fn, params_start)?;
    let params_str = &after_pub_fn[params_start + 1..params_end];

    let params = parse_params(params_str)?;

    // Extract return type
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
    // Split on commas, respecting nested angle brackets and parens
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
    // Last param
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

const SKIP_PREFIXES: &[&str] = &["initialize_"];
const SKIP_TYPES: &[&str] = &["Float32Array"];

fn generate_ffi_wrapper(crate_name: &str, func: &ParsedFn) -> Option<(String, Option<String>)> {
    if SKIP_PREFIXES.iter().any(|p| func.name.starts_with(p)) {
        return None;
    }
    let all_types = func
        .params
        .iter()
        .map(|p| p.ty.as_str())
        .chain(func.ret.as_deref());
    if all_types
        .clone()
        .any(|ty| SKIP_TYPES.iter().any(|s| ty.contains(s)))
    {
        return None;
    }

    let mut ffi_params = Vec::new();
    let mut call_args = Vec::new();

    for param in &func.params {
        let (ffi_ty, call_expr) = map_param_to_ffi(crate_name, &param.name, &param.ty)?;
        ffi_params.push(format!("{}: {ffi_ty}", param.name));
        call_args.push(call_expr);
    }

    let (ret_decl, call_wrap) = match &func.ret {
        None => (String::new(), FfiReturn::Void),
        Some(ty) => map_return_to_ffi(crate_name, ty)?,
    };

    let boxed_ty = if matches!(call_wrap, FfiReturn::BoxReturn) {
        func.ret.as_ref().map(|ty| qualify_type(crate_name, ty))
    } else {
        None
    };

    let ffi_name = format!("ffi_{crate_name}_{}", func.name);
    let call = format!(
        "{crate_name}::{name}({args})",
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
    "f32", "f64", "i32", "i64", "u8", "u16", "u32", "u64", "usize", "isize", "bool",
];

fn is_scalar(ty: &str) -> bool {
    SCALARS.contains(&ty)
}

fn qualify_type(crate_name: &str, ty: &str) -> String {
    if is_scalar(ty) || ty.starts_with('[') || ty.starts_with('(') {
        ty.to_string()
    } else {
        format!("{crate_name}::{ty}")
    }
}

fn map_param_to_ffi(crate_name: &str, name: &str, ty: &str) -> Option<(String, String)> {
    let ty = ty.trim();

    // Skip unsupported types: dyn, &str, slices, closures
    if ty.contains("dyn ") || ty.contains("Fn(") || ty.contains("FnMut(") || ty.contains("FnOnce(")
    {
        return None;
    }

    // &mut T -> *mut T
    if let Some(inner) = ty.strip_prefix("&mut ") {
        let inner = inner.trim();
        if inner == "str" || inner.starts_with('[') {
            return None;
        }
        let qualified = qualify_type(crate_name, inner);
        return Some((
            format!("*mut {qualified}"),
            format!("unsafe {{ &mut *{name} }}"),
        ));
    }

    // Option<&T> -> *const T (null = None)
    if ty.starts_with("Option<&") && ty.ends_with('>') {
        let inner = ty.strip_prefix("Option<&")?.strip_suffix('>')?.trim();
        if inner == "str" || inner.starts_with('[') {
            return None;
        }
        let qualified = qualify_type(crate_name, inner);
        return Some((
            format!("*const {qualified}"),
            format!("if {name}.is_null() {{ None }} else {{ unsafe {{ Some(&*{name}) }} }}"),
        ));
    }

    // Option<&mut T> -> *mut T (null = None)
    if ty.starts_with("Option<&mut ") && ty.ends_with('>') {
        let inner = ty.strip_prefix("Option<&mut ")?.strip_suffix('>')?.trim();
        let qualified = qualify_type(crate_name, inner);
        return Some((
            format!("*mut {qualified}"),
            format!("if {name}.is_null() {{ None }} else {{ unsafe {{ Some(&mut *{name}) }} }}"),
        ));
    }

    // &T -> *const T
    if let Some(inner) = ty.strip_prefix('&') {
        let inner = inner.trim();
        if inner == "str" || inner.starts_with('[') {
            return None;
        }
        let qualified = qualify_type(crate_name, inner);
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

    // Unknown type — skip
    None
}

fn map_return_to_ffi(crate_name: &str, ty: &str) -> Option<(String, FfiReturn)> {
    let ty = ty.trim();

    // Skip unsupported return types
    if ty.contains("dyn ")
        || ty.contains("Fn(")
        || ty.starts_with("Option<")
        || ty == "&'static str"
    {
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
    // Fixed-size array returns (like [f32; 20]) — skip for now
    if ty.starts_with('[') {
        return None;
    }
    // Struct return — box it and return a qualified pointer
    let qualified = qualify_type(crate_name, ty);
    Some((format!(" -> *mut {qualified}"), FfiReturn::BoxReturn))
}
