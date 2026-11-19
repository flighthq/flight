use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::Path;

// The C ABI flight-ffi actually generated, read from its build output rather than inferred from
// names: `flight_ffi.h` carries each symbol's C signature and `flight_hl.c` carries the HashLink
// primitive (`DEFINE_PRIM`) carriers. A callback crosses as a function-pointer + context pair, so
// its logical arity of one is two physical carriers on both surfaces.
pub struct FfiSurface {
    pub c: BTreeMap<String, FfiSignature>,
    pub hl: BTreeMap<String, FfiSignature>,
    // Symbols present on the C surface whose generic HashLink/hxcpp lowering is known to disagree
    // with the hand-lowered flight-ffi wrapper. Native backends skip them; JS/ESM never consults
    // this set because it binds the TypeScript SDK, not the C ABI.
    pub native_skips: BTreeSet<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct FfiSignature {
    pub ret: String,
    pub params: Vec<String>,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct FieldAccess {
    pub get: bool,
    pub set: bool,
}

#[derive(Debug, Default)]
pub struct ExternVerification {
    pub checked: usize,
    pub mismatches: Vec<String>,
}

#[derive(Debug, PartialEq)]
struct NativeExtern {
    symbol: String,
    params: Vec<String>,
    ret: String,
}

fn c_param_type(param: &str) -> String {
    let param = param.trim();
    if param.contains("(*") {
        return "fn *".to_string();
    }
    // Strip the trailing `argN` name; the remainder is the type.
    let ty = match param.rfind([' ', '*']) {
        Some(i) if param[i + 1..].starts_with("arg") => &param[..=i],
        _ => param,
    };
    normalize_c_type(ty)
}

fn c_signature_to_class(signature: &FfiSignature) -> Option<FfiSignature> {
    Some(FfiSignature {
        ret: c_type_class(&signature.ret)?,
        params: signature
            .params
            .iter()
            .map(|p| c_type_class(p))
            .collect::<Option<Vec<_>>>()?,
    })
}

// hxcpp calls the C symbol from C++ source, so integer width is converted by the compiler while
// pointer/scalar class, float precision, and arity must agree exactly.
fn c_type_class(c_ty: &str) -> Option<String> {
    let class = match c_ty {
        "void" => "void",
        "bool" => "bool",
        "float" => "f32",
        "double" => "f64",
        "int64_t" | "uint64_t" => "i64",
        "int8_t" | "uint8_t" | "int16_t" | "uint16_t" | "int32_t" | "uint32_t" | "size_t" => "int",
        "const char *" | "char *" => "cstr",
        "float *" => "f32 *",
        "double *" => "f64 *",
        "int32_t *" | "uint32_t *" => "int *",
        "void *" | "fn *" => "ptr",
        other if other.ends_with('*') => "ptr",
        _ => return None,
    };
    Some(class.to_string())
}

// Compares one emitted extern's physical carriers with the native surface of its backend.
fn check_native_extern(
    ext: &NativeExtern,
    backend: &str,
    surface: &FfiSurface,
) -> Result<(), String> {
    let (expected, actual) = if backend == "_hl" {
        (
            surface.hl.get(&ext.symbol).cloned(),
            haxe_signature_to_hl(ext),
        )
    } else {
        (
            surface.c.get(&ext.symbol).and_then(c_signature_to_class),
            haxe_signature_to_c_class(ext),
        )
    };
    let Some(expected) = expected else {
        return Err(format!("{} has no native symbol", ext.symbol));
    };
    if actual.as_ref() != Some(&expected) {
        return Err(format!(
            "{} declared {actual:?} but native is {expected:?}",
            ext.symbol
        ));
    }
    return Ok(());
}

fn collect_hx_files(dir: &Path) -> Vec<std::path::PathBuf> {
    let mut out = Vec::new();
    let mut entries: Vec<_> = fs::read_dir(dir).unwrap().filter_map(|e| e.ok()).collect();
    entries.sort_by_key(|e| e.file_name());
    for entry in entries {
        let path = entry.path();
        if path.is_dir() {
            out.extend(collect_hx_files(&path));
        } else if path.extension().is_some_and(|ext| ext == "hx") {
            out.push(path);
        }
    }
    out
}

pub fn contains_ffi_symbol(surface: &FfiSurface, name: &str) -> bool {
    surface.c.contains_key(name)
}

// True when every native extern in an emitted declaration agrees with the surface. A Rust
// signature whose flight-ffi wrapper is hand-lowered differently (a status `bool` around a
// callback, parallel arrays for a tuple slice) must not be bound by its generic lowering.
pub fn declaration_matches_ffi_surface(
    surface: &FfiSurface,
    backend: &str,
    declaration: &str,
) -> bool {
    return parse_native_externs(declaration, backend)
        .iter()
        .all(|ext| check_native_extern(ext, backend, surface).is_ok());
}

// A field accessor is only bound when the symbol named like one also has accessor shape on BOTH
// native surfaces: `T get(handle)` and `T set(handle, T)` in flight_ffi.h, and the matching
// `DEFINE_PRIM` carriers in flight_hl.c. An SDK function may share the name with different
// parameters (`set_audio_bus_gain(mixer, bus, ramp, gain)`), and binding it as a setter would call
// it with the wrong arity; a carrier that drifted on one surface only must not bind either. Each
// direction is judged on its own.
pub fn get_ffi_field_access(
    surface: &FfiSurface,
    getter_symbol: &str,
    setter_symbol: &str,
    rust_ty: &str,
) -> FieldAccess {
    let (Some(c_ty), Some(hl_ty)) = (rust_scalar_to_c(rust_ty), rust_scalar_to_hl(rust_ty)) else {
        return FieldAccess::default();
    };
    let c_get = surface.c.get(getter_symbol);
    let c_set = surface.c.get(setter_symbol);
    let hl_get = surface.hl.get(getter_symbol);
    let hl_set = surface.hl.get(setter_symbol);
    return FieldAccess {
        get: c_get.is_some_and(|s| s.ret == c_ty && s.params == ["void *"])
            && hl_get.is_some_and(|s| s.ret == hl_ty && s.params == ["_BYTES"]),
        set: c_set.is_some_and(|s| s.ret == c_ty && s.params == ["void *", c_ty])
            && hl_set.is_some_and(|s| s.ret == hl_ty && s.params == ["_BYTES", hl_ty]),
    };
}

// True when a native (HashLink/hxcpp) backend may bind `symbol`: it is on the C surface and not a
// reviewed native skip.
pub fn has_native_ffi_symbol(surface: &FfiSurface, symbol: &str) -> bool {
    return surface.c.contains_key(symbol) && !surface.native_skips.contains(symbol);
}

// True when `symbol` carries a retained callback as flight-ffi lowers it: a callback, its context,
// and the nullable release that context is handed to exactly once, as three consecutive C
// parameters (`fn *`, `void *`, `fn *`) that HashLink carries as three `_BYTES` at the same
// positions. A borrowed callback is only a callback + context pair, so it never matches.
pub fn has_retained_callback_carrier(surface: &FfiSurface, symbol: &str) -> bool {
    let (Some(c), Some(hl)) = (surface.c.get(symbol), surface.hl.get(symbol)) else {
        return false;
    };
    if c.params.len() != hl.params.len() {
        return false;
    }
    return (2..c.params.len()).any(|end| {
        let start = end - 2;
        return c.params[start..=end] == ["fn *", "void *", "fn *"]
            && hl.params[start..=end].iter().all(|param| param == "_BYTES");
    });
}

fn haxe_signature_to_c_class(ext: &NativeExtern) -> Option<FfiSignature> {
    Some(FfiSignature {
        ret: haxe_type_to_c_class(&ext.ret)?,
        params: ext
            .params
            .iter()
            .map(|p| haxe_type_to_c_class(p))
            .collect::<Option<Vec<_>>>()?,
    })
}

fn haxe_signature_to_hl(ext: &NativeExtern) -> Option<FfiSignature> {
    Some(FfiSignature {
        ret: haxe_type_to_hl(&ext.ret)?,
        params: ext
            .params
            .iter()
            .map(|p| haxe_type_to_hl(p))
            .collect::<Option<Vec<_>>>()?,
    })
}

fn haxe_type_to_c_class(ty: &str) -> Option<String> {
    let class = match ty {
        "Void" => "void",
        "Bool" => "bool",
        "Single" => "f32",
        "Float" => "f64",
        "Int" => "int",
        "haxe.Int64" => "i64",
        "cpp.ConstCharStar" => "cstr",
        "cpp.RawPointer<cpp.Float32>" => "f32 *",
        "cpp.RawPointer<cpp.Float64>" => "f64 *",
        "cpp.RawPointer<cpp.Int32>" => "int *",
        "cpp.Star<cpp.Void>" => "ptr",
        other if other.starts_with("flight._cpp.") => "ptr",
        _ => return None,
    };
    Some(class.to_string())
}

fn haxe_type_to_hl(ty: &str) -> Option<String> {
    let code = match ty {
        "Void" => "_VOID",
        "Bool" => "_BOOL",
        "Single" => "_F32",
        "Float" => "_F64",
        "Int" => "_I32",
        "haxe.Int64" => "_I64",
        "hl.Bytes" => "_BYTES",
        "hl.NativeArray<Float>" => "_ARR",
        "hl.Ref<Single>" => "_REF(_F32)",
        "hl.Ref<Float>" => "_REF(_F64)",
        "hl.Ref<Int>" => "_REF(_I32)",
        other if other.starts_with("flight._hl.") => "_BYTES",
        _ => return None,
    };
    Some(code.to_string())
}

pub fn load_ffi_surface(ffi_dir: &Path) -> FfiSurface {
    let read = |name: &str| {
        let path = ffi_dir.join(name);
        fs::read_to_string(&path)
            .unwrap_or_else(|e| panic!("could not read {}: {e}", path.display()))
    };
    FfiSurface {
        c: parse_ffi_header(&read("flight_ffi.h")),
        hl: parse_hl_primitives(&read("flight_hl.c")),
        native_skips: BTreeSet::new(),
    }
}

fn normalize_c_type(ty: &str) -> String {
    let collapsed = ty.split_whitespace().collect::<Vec<_>>().join(" ");
    collapsed
        .replace(" *", "*")
        .replace('*', " *")
        .trim()
        .to_string()
}

pub fn parse_ffi_header(text: &str) -> BTreeMap<String, FfiSignature> {
    let mut out = BTreeMap::new();
    for line in text.lines() {
        let line = strip_c_comments(line);
        let Some(body) = line.trim().strip_suffix(");") else {
            continue;
        };
        let Some(name_start) = body.find("flight_") else {
            continue;
        };
        let Some(open) = body[name_start..].find('(').map(|i| i + name_start) else {
            continue;
        };
        let ret = normalize_c_type(&body[..name_start]);
        if ret.is_empty() || ret.contains('(') {
            continue;
        }
        let name = body[name_start..open].to_string();
        let params = split_top_level(&body[open + 1..])
            .into_iter()
            .map(|param| c_param_type(&param))
            .collect();
        out.insert(name, FfiSignature { ret, params });
    }
    out
}

fn parse_haxe_function_signature(line: &str) -> Option<(Vec<String>, String)> {
    let start = line.find("function ")?;
    let open = line[start..].find('(')? + start;
    let close = line.rfind("):")?;
    let ret = line[close + 2..]
        .trim()
        .trim_end_matches(';')
        .trim()
        .to_string();
    let params = split_top_level(&line[open + 1..close])
        .into_iter()
        .map(|param| {
            param
                .split_once(':')
                .map(|(_, ty)| ty.trim().to_string())
                .unwrap_or_default()
        })
        .collect();
    Some((params, ret))
}

pub fn parse_hl_primitives(text: &str) -> BTreeMap<String, FfiSignature> {
    let mut out = BTreeMap::new();
    for line in text.lines() {
        let Some(body) = line
            .trim()
            .strip_prefix("DEFINE_PRIM(")
            .and_then(|rest| rest.strip_suffix(");"))
        else {
            continue;
        };
        let mut parts = body.splitn(3, ',').map(str::trim);
        let (Some(ret), Some(name), Some(args)) = (parts.next(), parts.next(), parts.next()) else {
            continue;
        };
        let params = if args == "_NO_ARG" {
            Vec::new()
        } else {
            args.split_whitespace().map(str::to_string).collect()
        };
        out.insert(
            name.to_string(),
            FfiSignature {
                ret: ret.to_string(),
                params,
            },
        );
    }
    out
}

// Reads `@:hlNative("flight", "sym")` / `@:native("sym")` declarations and the Haxe function
// signature that follows on the same or next line.
fn parse_native_externs(content: &str, backend: &str) -> Vec<NativeExtern> {
    let lines: Vec<&str> = content.lines().collect();
    let mut out = Vec::new();
    for (i, line) in lines.iter().enumerate() {
        let symbol = if backend == "_hl" {
            line.trim()
                .strip_prefix("@:hlNative(\"flight\", \"")
                .and_then(|rest| rest.split('"').next())
        } else {
            line.trim()
                .strip_prefix("@:native(\"")
                .and_then(|rest| rest.split('"').next())
                .filter(|symbol| symbol.starts_with("flight_"))
        };
        let Some(symbol) = symbol else {
            continue;
        };
        let declaration = if line.contains("function ") {
            *line
        } else {
            lines.get(i + 1).copied().unwrap_or("")
        };
        if let Some((params, ret)) = parse_haxe_function_signature(declaration) {
            out.push(NativeExtern {
                symbol: symbol.to_string(),
                params,
                ret,
            });
        }
    }
    out
}

fn rust_scalar_to_c(rust_ty: &str) -> Option<&'static str> {
    Some(match rust_ty {
        "f32" => "float",
        "f64" => "double",
        "bool" => "bool",
        "i8" => "int8_t",
        "i16" => "int16_t",
        "i32" => "int32_t",
        "i64" => "int64_t",
        "u8" => "uint8_t",
        "u16" => "uint16_t",
        "u32" => "uint32_t",
        "u64" => "uint64_t",
        "usize" => "size_t",
        _ => return None,
    })
}

fn rust_scalar_to_hl(rust_ty: &str) -> Option<&'static str> {
    return Some(match rust_ty {
        "f32" => "_F32",
        "f64" => "_F64",
        "bool" => "_BOOL",
        "i8" | "i16" | "i32" | "u8" | "u16" | "u32" | "usize" => "_I32",
        "i64" | "u64" => "_I64",
        _ => return None,
    });
}

fn split_top_level(list: &str) -> Vec<String> {
    let mut parts = Vec::new();
    let mut depth = 0i32;
    let mut current = String::new();
    for c in list.chars() {
        match c {
            '(' | '<' => depth += 1,
            ')' | '>' => depth -= 1,
            ',' if depth == 0 => {
                parts.push(std::mem::take(&mut current));
                continue;
            }
            _ => {}
        }
        current.push(c);
    }
    if !current.trim().is_empty() {
        parts.push(current);
    }
    parts
        .into_iter()
        .map(|p| p.trim().to_string())
        .filter(|p| !p.is_empty() && p != "void")
        .collect()
}

// Checks every native extern bindgen wrote against the surface it binds: HashLink externs must
// carry exactly the `DEFINE_PRIM` codes, hxcpp externs must match each C parameter's carrier
// class and arity, and no native symbol may be declared by more than one `_fn` module.
// Ownership notes ride inline as `/* ... */` after a parameter; they are not part of the type.
fn strip_c_comments(line: &str) -> String {
    let mut out = String::new();
    let mut rest = line;
    while let Some(start) = rest.find("/*") {
        out.push_str(&rest[..start]);
        rest = match rest[start..].find("*/") {
            Some(end) => &rest[start + end + 2..],
            None => "",
        };
    }
    out.push_str(rest);
    return out;
}

pub fn verify_generated_externs(out_dir: &Path, surface: &FfiSurface) -> ExternVerification {
    let mut report = ExternVerification::default();
    let mut module_symbols: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for backend in ["_hl", "_cpp"] {
        let dir = out_dir.join("flight").join(backend);
        if !dir.is_dir() {
            continue;
        }
        for path in collect_hx_files(&dir) {
            let relative = path.strip_prefix(out_dir).unwrap().display().to_string();
            let in_module = relative.contains("/_fn/");
            let content = fs::read_to_string(&path).unwrap();
            for ext in parse_native_externs(&content, backend) {
                report.checked += 1;
                if in_module {
                    module_symbols
                        .entry(format!("{backend}:{}", ext.symbol))
                        .or_default()
                        .push(relative.clone());
                }
                if let Err(reason) = check_native_extern(&ext, backend, surface) {
                    report.mismatches.push(format!("{relative}: {reason}"));
                }
            }
        }
    }
    for (symbol, files) in module_symbols {
        if files.len() > 1 {
            report.mismatches.push(format!(
                "{symbol} declared by {} modules: {files:?}",
                files.len()
            ));
        }
    }
    return report;
}
