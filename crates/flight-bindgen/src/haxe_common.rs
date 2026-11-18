use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::Path;

use crate::ffi_surface::{
    FfiSurface, FieldAccess, contains_ffi_symbol, declaration_matches_ffi_surface,
    get_ffi_field_access,
};
use crate::parse::{
    CrateExports, ParamKind, ParsedFn, ParsedStruct, ReturnKind, classify_param, classify_return,
    to_camel_case, to_pascal_case,
};

pub struct TypeMethod<'a> {
    pub func: &'a ParsedFn,
    pub module: String,
}

pub fn collect_opaque_types(func: &ParsedFn, types: &mut BTreeSet<String>) {
    for param in &func.params {
        if let Some(kind) = classify_param(&param.ty) {
            match kind {
                ParamKind::RefConst(ty)
                | ParamKind::RefMut(ty)
                | ParamKind::OptionRefConst(ty)
                | ParamKind::OptionRefMut(ty) => {
                    if !ty.contains('(') && !ty.contains('[') {
                        types.insert(ty);
                    }
                }
                _ => {}
            }
        }
    }
    if let Some(ref ret) = func.ret {
        if let Some(ReturnKind::Struct(ty)) = classify_return(ret) {
            if !ty.contains('(') && !ty.contains('[') {
                types.insert(ty);
            }
        }
    }
}

pub fn build_struct_map<'a>(
    crate_exports: &'a [CrateExports],
) -> BTreeMap<String, &'a ParsedStruct> {
    let mut map = BTreeMap::new();
    for crate_export in crate_exports {
        for s in &crate_export.structs {
            map.entry(s.name.clone()).or_insert(s);
        }
    }
    map
}

pub fn build_type_methods<'a>(
    crate_exports: &'a [CrateExports],
    known_types: &BTreeSet<String>,
) -> BTreeMap<String, Vec<TypeMethod<'a>>> {
    let mut map: BTreeMap<String, Vec<TypeMethod<'a>>> = BTreeMap::new();
    for crate_export in crate_exports {
        let module = crate_dir_to_module(&crate_export.dir_name, known_types);
        for func in &crate_export.fns {
            if let Some(ty) =
                match_function_to_type(&func.name, &func.params, &func.ret, known_types)
            {
                map.entry(ty).or_default().push(TypeMethod {
                    func,
                    module: module.clone(),
                });
            }
        }
    }
    map
}

fn match_function_to_type(
    fn_name: &str,
    params: &[crate::parse::Param],
    ret: &Option<String>,
    known_types: &BTreeSet<String>,
) -> Option<String> {
    let type_lower_in_name = |ty: &str| -> bool {
        let tl = ty.to_lowercase();
        let suffix = format!("_{tl}");
        let mid = format!("_{tl}_");
        fn_name.ends_with(&suffix) || fn_name.contains(&mid)
    };

    for param in params {
        if let Some(kind) = classify_param(&param.ty) {
            let ty_name = match &kind {
                ParamKind::RefConst(ty)
                | ParamKind::RefMut(ty)
                | ParamKind::OptionRefConst(ty)
                | ParamKind::OptionRefMut(ty) => ty,
                _ => continue,
            };
            if known_types.contains(ty_name)
                && type_lower_in_name(ty_name)
                && derive_method_name(fn_name, ty_name).is_some()
            {
                return Some(ty_name.clone());
            }
        }
    }
    if let Some(ret_ty) = ret {
        if let Some(ReturnKind::Struct(ty_name)) = classify_return(ret_ty) {
            if known_types.contains(&ty_name)
                && fn_name.starts_with("create_")
                && type_lower_in_name(&ty_name)
                && derive_method_name(fn_name, &ty_name).is_some()
            {
                return Some(ty_name);
            }
        }
    }
    None
}

pub fn derive_method_name(fn_name: &str, type_name: &str) -> Option<String> {
    let type_lower = type_name.to_lowercase();
    let suffix = format!("_{type_lower}");

    if fn_name.ends_with(&suffix) {
        let prefix = &fn_name[..fn_name.len() - suffix.len()];
        if prefix.is_empty() {
            return None;
        }
        return Some(to_camel_case(prefix));
    }

    let mid = format!("_{type_lower}_");
    if let Some(pos) = fn_name.find(&mid) {
        let before = &fn_name[..pos];
        let after = &fn_name[pos + mid.len()..];
        let combined = if before.is_empty() {
            after.to_string()
        } else if after.is_empty() {
            before.to_string()
        } else {
            format!("{before}_{after}")
        };
        if combined.is_empty() {
            return None;
        }
        return Some(to_camel_case(&combined));
    }

    None
}

// Removes, from every target at once, each function whose generic HashLink or hxcpp extern would
// disagree with the wrapper flight-ffi actually generated, so no backend binds a wrong-arity call
// and the dispatch layer never names a function one backend lacks. Returns the removed names.
pub fn drop_native_shape_mismatches(
    exports: &mut [CrateExports],
    surface: &FfiSurface,
) -> Vec<String> {
    let mut dropped = Vec::new();
    for crate_export in exports.iter_mut() {
        crate_export.fns.retain(|func| {
            if !contains_ffi_symbol(surface, &format!("flight_{}", func.name)) {
                return true;
            }
            let agrees = [
                ("_hl", crate::haxe_hl::emit_function(func)),
                ("_cpp", crate::haxe_cpp::emit_function(func)),
            ]
            .iter()
            .all(|(backend, declaration)| {
                return declaration
                    .as_deref()
                    .is_none_or(|text| declaration_matches_ffi_surface(surface, backend, text));
            });
            if !agrees {
                dropped.push(func.name.clone());
            }
            return agrees;
        });
    }
    return dropped;
}

// `public var name(get, set):T;` with `never` for a direction that has no binding.
pub fn field_property_declaration(haxe_name: &str, haxe_ty: &str, access: FieldAccess) -> String {
    let get = if access.get { "get" } else { "never" };
    let set = if access.set { "set" } else { "never" };
    return format!("public var {haxe_name}({get}, {set}):{haxe_ty};");
}

pub fn find_self_param(func: &ParsedFn, ty: &str) -> Option<usize> {
    for (i, param) in func.params.iter().enumerate() {
        if let Some(kind) = classify_param(&param.ty) {
            match &kind {
                ParamKind::RefConst(t)
                | ParamKind::RefMut(t)
                | ParamKind::OptionRefConst(t)
                | ParamKind::OptionRefMut(t)
                    if t == ty =>
                {
                    return Some(i);
                }
                _ => {}
            }
        }
    }
    None
}

pub fn crate_dir_to_module(dir_name: &str, known_types: &BTreeSet<String>) -> String {
    let stripped = dir_name.strip_prefix("flight-").unwrap_or(dir_name);
    let candidate = to_pascal_case(stripped);
    // Haxe modules are files. A facade and type differing only in case overwrite one
    // another on Windows and default macOS filesystems. Reuse the SDK type spelling
    // so dispatch emits one module containing both its typedef and free functions.
    known_types
        .iter()
        .find(|name| name.eq_ignore_ascii_case(&candidate))
        .cloned()
        .unwrap_or(candidate)
}

pub fn scalar_to_haxe(ty: &str) -> &str {
    match ty {
        "f32" => "Single",
        "f64" => "Float",
        "bool" => "Bool",
        "i8" | "i16" | "i32" | "isize" => "Int",
        "u8" | "u16" | "u32" | "usize" => "Int",
        "i64" | "u64" => "haxe.Int64",
        _ => "Dynamic",
    }
}

/// The Haxe value a scalar tuple return becomes: an anonymous structure whose `_0`, `_1`, ...
/// fields mirror Rust's `.0`, `.1`, ... and the native ABI's `out_0`, `out_1`, ... parameters.
pub fn tuple_struct_type(elements: &[String], scalar: fn(&str) -> &str) -> String {
    let fields: Vec<String> = elements
        .iter()
        .enumerate()
        .map(|(index, element)| format!("_{index}:{}", scalar(element)))
        .collect();
    return format!("{{ {} }}", fields.join(", "));
}

/// The out-parameter storage types (HashLink, hxcpp) of a tuple element, or `None` when the
/// element has no exact-width type on both native targets. Every backend declines a tuple with
/// such an element, so the HL, C++ and JavaScript surfaces stay identical.
pub fn tuple_element_storage(ty: &str) -> Option<(&'static str, &'static str)> {
    return match ty {
        "f32" => Some(("Single", "cpp.Float32")),
        "f64" => Some(("Float", "cpp.Float64")),
        "i32" => Some(("Int", "cpp.Int32")),
        "u32" => Some(("Int", "cpp.UInt32")),
        "u8" => Some(("hl.UI8", "cpp.UInt8")),
        "u16" => Some(("hl.UI16", "cpp.UInt16")),
        "bool" => Some(("Bool", "Bool")),
        _ => None,
    };
}

pub fn to_snake_case(s: &str) -> String {
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

pub fn has_ffi_function(fn_name: &str, ffi_surface: Option<&FfiSurface>) -> bool {
    return match ffi_surface {
        None => true,
        Some(surface) => contains_ffi_symbol(surface, &format!("flight_{fn_name}")),
    };
}
// Which directions of a struct field may bind to a native accessor; with no FFI surface every
// parsed field is assumed to have both.
pub fn resolve_ffi_field_access(
    type_name: &str,
    field: &crate::parse::StructField,
    ffi_surface: Option<&FfiSurface>,
) -> FieldAccess {
    let Some(surface) = ffi_surface else {
        return FieldAccess {
            get: true,
            set: true,
        };
    };
    let snake = to_snake_case(type_name);
    return get_ffi_field_access(
        surface,
        &format!("flight_get_{snake}_{}", field.name),
        &format!("flight_set_{snake}_{}", field.name),
        &field.ty,
    );
}

pub fn write_if_changed(path: &Path, content: &str) {
    if let Ok(existing) = fs::read_to_string(path) {
        if existing == content {
            return;
        }
    }
    fs::write(path, content).unwrap();
}

#[cfg(test)]
mod portable_module_tests {
    use super::*;
    #[test]
    fn facades_use_canonical_sdk_type_case() {
        for (module, ty) in [
            ("motionpath", "MotionPath"),
            ("movieclip", "MovieClip"),
            ("physics2d-abi", "Physics2DAbi"),
            ("physics3d-abi", "Physics3DAbi"),
            ("quadbatch", "QuadBatch"),
            ("scene2d", "Scene2D"),
            ("skeleton2d", "Skeleton2D"),
            ("textsegment", "TextSegment"),
            ("textureatlas", "TextureAtlas"),
        ] {
            let types = BTreeSet::from([ty.to_string()]);
            assert_eq!(crate_dir_to_module(&format!("flight-{module}"), &types), ty);
        }
        assert_eq!(
            crate_dir_to_module("flight-geometry", &BTreeSet::new()),
            "Geometry"
        );
    }
    #[test]
    fn native_shape_mismatches_are_dropped_from_every_target() {
        let surface = FfiSurface {
            c: crate::ffi_surface::parse_ffi_header(
                "float flight_get_audio_bus_gain(void * arg0);\n\
                 float flight_set_audio_bus_gain(void * arg0, void * arg1, void * arg2, float arg3);",
            ),
            hl: crate::ffi_surface::parse_hl_primitives(
                "DEFINE_PRIM(_F32, flight_get_audio_bus_gain, _BYTES);\n\
                 DEFINE_PRIM(_F32, flight_set_audio_bus_gain, _BYTES _BYTES _BYTES _F32);",
            ),
        };
        let function = |name: &str, params: &[(&str, &str)]| ParsedFn {
            name: name.into(),
            source_name: Some(name.into()),
            params: params
                .iter()
                .map(|(name, ty)| crate::parse::Param {
                    name: name.to_string(),
                    ty: ty.to_string(),
                })
                .collect(),
            ret: Some("f32".into()),
        };
        let mut exports = vec![CrateExports {
            dir_name: "flight-audio".into(),
            fns: vec![
                function("get_audio_bus_gain", &[("bus", "&AudioBus")]),
                function(
                    "set_audio_bus_gain",
                    &[("bus", "&AudioBus"), ("gain", "f32")],
                ),
                function("get_audio_bus_pan", &[("bus", "&AudioBus")]),
            ],
            structs: vec![],
            enums: vec![],
        }];
        let dropped = drop_native_shape_mismatches(&mut exports, &surface);
        assert_eq!(dropped, ["set_audio_bus_gain"]);
        let kept: Vec<&str> = exports[0].fns.iter().map(|f| f.name.as_str()).collect();
        assert_eq!(kept, ["get_audio_bus_gain", "get_audio_bus_pan"]);
    }
}
