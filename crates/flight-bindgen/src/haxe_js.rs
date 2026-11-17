use std::collections::BTreeSet;
use std::fmt::Write as _;
use std::fs;
use std::path::Path;

use crate::haxe_common::{
    TypeMethod, build_struct_map, build_type_methods, collect_opaque_types, crate_dir_to_module,
    derive_method_name, find_self_param, has_ffi_accessor, has_ffi_function, write_if_changed,
};
use crate::parse::{
    CrateExports, ParamKind, ParsedFn, ParsedStruct, ReturnKind, classify_param, classify_return,
    to_camel_case,
};

const PKG: &str = "flight._js";

fn scalar_to_haxe(ty: &str) -> &str {
    match ty {
        "f32" | "f64" | "i64" | "u64" => "Float",
        "bool" => "Bool",
        "i8" | "i16" | "i32" | "isize" | "u8" | "u16" | "u32" | "usize" => "Int",
        _ => "Dynamic",
    }
}

// JavaScript consumes SDK objects, arrays and callbacks directly. Never lower to C pointer/length,
// callback/context pairs or numeric Option sentinels on this target.
fn param_type(ty: &str, prefix: &str) -> Option<String> {
    let trimmed = ty.trim();
    if let Some(inner) = trimmed
        .strip_prefix("Option<")
        .and_then(|s| s.strip_suffix('>'))
    {
        return Some(format!("Null<{}>", param_type(inner, prefix)?));
    }
    Some(match classify_param(ty)? {
        ParamKind::Scalar(t) => scalar_to_haxe(&t).into(),
        ParamKind::RefConst(t) | ParamKind::RefMut(t) | ParamKind::DynMono(t) => {
            format!("{prefix}{t}")
        }
        ParamKind::StrRef | ParamKind::StringParam => "String".into(),
        _ => "Dynamic".into(),
    })
}

fn return_type(ty: Option<&str>, prefix: &str) -> Option<String> {
    let Some(ty) = ty else {
        return Some("Void".into());
    };
    let trimmed = ty.trim();
    if let Some(inner) = trimmed
        .strip_prefix("Option<")
        .and_then(|s| s.strip_suffix('>'))
    {
        // flight-ffi bridges no optional tuple, so neither does the logical JS surface.
        if matches!(classify_return(inner), Some(ReturnKind::Tuple(_))) {
            return None;
        }
        return Some(format!("Null<{}>", return_type(Some(inner), prefix)?));
    }
    Some(match classify_return(ty)? {
        ReturnKind::Void => "Void".into(),
        ReturnKind::Scalar(t) => scalar_to_haxe(&t).into(),
        ReturnKind::Struct(t) => format!("{prefix}{t}"),
        ReturnKind::StringReturn => "String".into(),
        ReturnKind::Tuple(elements) => {
            for element in &elements {
                crate::haxe_common::tuple_element_storage(element)?;
            }
            tuple_array_type(&elements)
        }
        _ => "Dynamic".into(),
    })
}

// The TypeScript SDK returns tuples as readonly arrays (`readonly [number, number]`).
fn tuple_array_type(elements: &[String]) -> String {
    let first = scalar_to_haxe(&elements[0]);
    if elements
        .iter()
        .all(|element| scalar_to_haxe(element) == first)
    {
        return format!("Array<{first}>");
    }
    return "Array<Dynamic>".to_string();
}

/// The structure type the dispatch layer gives a tuple on JavaScript, where every number is a
/// `Float` and there is no `haxe.Int64`.
pub fn tuple_struct_type(elements: &[String]) -> String {
    return crate::haxe_common::tuple_struct_type(elements, scalar_to_haxe);
}

pub fn signature(func: &ParsedFn, prefix: &str) -> Option<(Vec<String>, String)> {
    let params = func
        .params
        .iter()
        .map(|p| {
            Some(format!(
                "{}:{}",
                to_camel_case(&p.name),
                param_type(&p.ty, prefix)?
            ))
        })
        .collect::<Option<Vec<_>>>()?;
    Some((params, return_type(func.ret.as_deref(), prefix)?))
}

pub fn generate(exports: &[CrateExports], out_dir: &Path, ffi_names: Option<&BTreeSet<String>>) {
    let js_dir = out_dir.join("flight").join("_js");
    let fn_dir = js_dir.join("_fn");
    fs::create_dir_all(&fn_dir).unwrap();
    let mut types = BTreeSet::new();
    for package in exports {
        for func in &package.fns {
            collect_opaque_types(func, &mut types);
        }
        for s in &package.structs {
            types.insert(s.name.clone());
        }
    }
    let structs = build_struct_map(exports);
    let methods = build_type_methods(exports, &types);
    for ty in &types {
        let content = emit_type(
            ty,
            structs.get(ty.as_str()).copied(),
            methods.get(ty).map(|v| v.as_slice()).unwrap_or(&[]),
            ffi_names,
        );
        write_if_changed(&js_dir.join(format!("{ty}.hx")), &content);
    }
    for package in exports {
        let module = crate_dir_to_module(&package.dir_name, &types);
        let mut content = format!(
            "package {PKG}._fn;\n\n@:jsRequire(\"@flighthq/{}\")\nextern class {module} {{\n",
            package
                .dir_name
                .strip_prefix("flight-")
                .unwrap_or(&package.dir_name)
        );
        let mut count = 0;
        for func in &package.fns {
            if !has_ffi_function(&func.name, ffi_names) {
                continue;
            }
            if let Some(decl) = emit_function(func) {
                content.push_str(&decl);
                count += 1;
            }
        }
        content.push_str("}\n");
        if count > 0 {
            write_if_changed(&fn_dir.join(format!("{module}.hx")), &content);
        }
    }
    eprintln!(
        "wrote JavaScript ESM bindings for {} packages and {} types",
        exports.len(),
        types.len()
    );
}

fn emit_function(func: &ParsedFn) -> Option<String> {
    let (params, ret) = signature(func, &format!("{PKG}."))?;
    let name = to_camel_case(&func.name);
    let params = params.join(", ");
    if let Some(source_name) = &func.source_name {
        let js_name = flight_compiler::typescript_item_name(source_name);
        Some(format!(
            "\t@:native(\"{js_name}\")\n\tpublic static function {name}({params}):{ret};\n"
        ))
    } else {
        // Box/CString free helpers exist solely for native ownership. JS objects are GC-managed.
        Some(format!(
            "\t/** Native allocation release is unnecessary on JavaScript. */\n\tpublic static inline function {name}({params}):Void {{}}\n"
        ))
    }
}

fn emit_type(
    ty: &str,
    parsed: Option<&ParsedStruct>,
    methods: &[TypeMethod<'_>],
    ffi_names: Option<&BTreeSet<String>>,
) -> String {
    let mut out = format!("package {PKG};\n\nabstract {ty}(Dynamic) {{\n");
    if let Some(parsed) = parsed {
        for field in &parsed.fields {
            if !has_ffi_accessor(ty, &field.name, ffi_names) {
                continue;
            }
            let haxe_name = to_camel_case(&field.name);
            let js_name = flight_compiler::typescript_item_name(&field.name);
            let t = scalar_to_haxe(&field.ty);
            writeln!(out, "\tpublic var {haxe_name}(get, set):{t};").unwrap();
            writeln!(
                out,
                "\tinline function get_{haxe_name}():{t} return untyped this.{js_name};"
            )
            .unwrap();
            writeln!(out, "\tinline function set_{haxe_name}(value:{t}):{t} return untyped this.{js_name} = value;").unwrap();
        }
    }
    let mut seen = BTreeSet::new();
    for tm in methods {
        if !has_ffi_function(&tm.func.name, ffi_names) {
            continue;
        }
        let Some(name) = derive_method_name(&tm.func.name, ty) else {
            continue;
        };
        if !seen.insert(name.clone()) {
            continue;
        }
        let Some((params, ret)) = signature(tm.func, &format!("{PKG}.")) else {
            continue;
        };
        let receiver = find_self_param(tm.func, ty);
        let mut decl = Vec::new();
        let mut args = Vec::new();
        for (index, param) in tm.func.params.iter().enumerate() {
            if Some(index) == receiver {
                args.push("cast this".to_string());
            } else {
                decl.push(params[index].clone());
                args.push(to_camel_case(&param.name));
            }
        }
        let static_kw = if receiver.is_none() { "static " } else { "" };
        let ret_kw = if ret == "Void" { "" } else { "return " };
        writeln!(
            out,
            "\t{static_kw}inline public function {name}({}):{ret} {{",
            decl.join(", ")
        )
        .unwrap();
        writeln!(
            out,
            "\t\t{ret_kw}{PKG}._fn.{}.{}({});",
            tm.module,
            to_camel_case(&tm.func.name),
            args.join(", ")
        )
        .unwrap();
        writeln!(out, "\t}}").unwrap();
    }
    out.push_str("}\n");
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parse::Param;
    fn sample() -> ParsedFn {
        ParsedFn {
            name: "hash_2d".into(),
            source_name: Some("hash_2d".into()),
            params: vec![
                Param {
                    name: "items".into(),
                    ty: "&[f32]".into(),
                },
                Param {
                    name: "callback".into(),
                    ty: "&dyn Fn(f32) -> f32".into(),
                },
            ],
            ret: Some("Option<u32>".into()),
        }
    }
    #[test]
    fn esm_uses_logical_arrays_callbacks_and_options() {
        let (params, ret) = signature(&sample(), "").unwrap();
        assert_eq!(params, ["items:Dynamic", "callback_:Dynamic"]);
        assert_eq!(ret, "Null<Int>");
    }
    #[test]
    fn esm_uses_compiler_acronym_names_and_preserved_generic_name() {
        let mut f = sample();
        f.name = "hash_2d__material".into();
        let text = emit_function(&f).unwrap();
        assert!(text.contains("@:native(\"hash2D\")"));
        assert!(!text.contains("flight_hash"));
    }
    #[test]
    fn esm_scalar_tuple_returns_the_typescript_array() {
        let function = crate::parse::random_gaussian_pair_fixture();
        let (params, ret) = signature(&function, "").unwrap();
        assert_eq!(
            params,
            [
                "random:Dynamic",
                "mean:Null<Float>",
                "standardDeviation:Null<Float>"
            ]
        );
        assert_eq!(ret, "Array<Float>");
        assert_eq!(
            tuple_struct_type(&["f32".into(), "u32".into()]),
            "{ _0:Float, _1:Int }"
        );
    }
    #[test]
    fn esm_optional_tuple_is_not_bridged() {
        let mut function = crate::parse::random_gaussian_pair_fixture();
        function.ret = Some("Option<(f64, f64)>".into());
        assert!(signature(&function, "").is_none());
    }
    #[test]
    fn esm_native_free_is_a_gc_noop() {
        let mut f = sample();
        f.source_name = None;
        f.ret = None;
        assert!(emit_function(&f).unwrap().contains("):Void {}"));
    }
}
