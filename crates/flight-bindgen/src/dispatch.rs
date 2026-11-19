use std::collections::{BTreeMap, BTreeSet};
use std::fmt::Write as _;
use std::fs;
use std::path::Path;

use crate::byte_result::{
    BYTE_RESULT_TYPE, byte_result_return, get_byte_result_optional, has_byte_results,
};
use crate::ffi_surface::FfiSurface;
use crate::haxe_common::{
    crate_dir_to_module, has_ffi_function, has_native_ffi_function, tuple_element_storage,
    tuple_struct_type,
};
use crate::parse::{
    CrateExports, ParamKind, ParsedEnum, ParsedFn, ReturnKind, classify_param, classify_return,
    to_camel_case,
};

pub fn generate(crate_exports: &[CrateExports], out_dir: &Path, ffi_surface: Option<&FfiSurface>) {
    let flight_dir = out_dir.join("flight");
    fs::create_dir_all(&flight_dir).unwrap();

    let mut all_opaque_types: BTreeSet<String> = BTreeSet::new();
    let mut modules: BTreeMap<String, &[ParsedFn]> = BTreeMap::new();

    for crate_export in crate_exports {
        for func in &crate_export.fns {
            collect_opaque_types(func, &mut all_opaque_types);
        }
        for s in &crate_export.structs {
            all_opaque_types.insert(s.name.clone());
        }
    }

    for crate_export in crate_exports {
        let module_name = crate_dir_to_module(&crate_export.dir_name, &all_opaque_types);
        modules.insert(module_name, &crate_export.fns);
    }

    let mut total_files = 0usize;

    if has_byte_results(crate_exports) {
        write_if_changed(
            &flight_dir.join(format!("{BYTE_RESULT_TYPE}.hx")),
            &emit_type_dispatch(BYTE_RESULT_TYPE),
        );
        total_files += 1;
    }

    let types_that_are_modules: BTreeSet<&String> = all_opaque_types
        .iter()
        .filter(|t| modules.contains_key(t.as_str()))
        .collect();

    for ty in &all_opaque_types {
        if types_that_are_modules.contains(ty) {
            continue;
        }
        let output = emit_type_dispatch(ty);
        let path = flight_dir.join(format!("{ty}.hx"));
        write_if_changed(&path, &output);
        total_files += 1;
    }

    let mut enum_seen = BTreeSet::new();
    let mut emitted_enums: BTreeSet<String> = BTreeSet::new();
    let mut enum_count = 0usize;
    for crate_export in crate_exports {
        for parsed_enum in &crate_export.enums {
            if all_opaque_types.contains(&parsed_enum.name)
                || modules.contains_key(parsed_enum.name.as_str())
            {
                continue;
            }
            if !enum_seen.insert(&parsed_enum.name) {
                continue;
            }
            let output = emit_enum_file(parsed_enum);
            let path = flight_dir.join(format!("{}.hx", parsed_enum.name));
            write_if_changed(&path, &output);
            emitted_enums.insert(parsed_enum.name.clone());
            total_files += 1;
            enum_count += 1;
        }
    }

    for (module_name, fns) in &modules {
        let has_matching_type = types_that_are_modules.contains(module_name);
        let output = emit_module_dispatch(
            module_name,
            fns,
            has_matching_type,
            ffi_surface,
            &emitted_enums,
        );
        if !output.is_empty() {
            let path = flight_dir.join(format!("{module_name}.hx"));
            write_if_changed(&path, &output);
            total_files += 1;
        }
    }

    eprintln!(
        "wrote {total_files} dispatch files ({enum_count} enum abstracts) to {}",
        flight_dir.display()
    );
}

fn emit_type_dispatch(ty: &str) -> String {
    let mut output = String::new();
    writeln!(output, "package flight;").unwrap();
    writeln!(output).unwrap();
    writeln!(output, "#if hl").unwrap();
    writeln!(output).unwrap();
    writeln!(output, "typedef {ty} = flight._hl.{ty};").unwrap();
    writeln!(output).unwrap();
    writeln!(output, "#elseif cpp").unwrap();
    writeln!(output).unwrap();
    writeln!(output, "typedef {ty} = flight._cpp.{ty};").unwrap();
    writeln!(output).unwrap();
    writeln!(output, "#elseif (js && flight_esm)").unwrap();
    writeln!(output).unwrap();
    writeln!(output, "typedef {ty} = flight._js.{ty};").unwrap();
    writeln!(output).unwrap();
    writeln!(output, "#elseif js").unwrap();
    writeln!(output).unwrap();
    writeln!(output, "#error \"flight.{ty} on js requires flight_esm.\"").unwrap();
    writeln!(output).unwrap();
    writeln!(output, "#else").unwrap();
    writeln!(output).unwrap();
    writeln!(
        output,
        "#error \"flight.{ty}: no backend for this target.\""
    )
    .unwrap();
    writeln!(output).unwrap();
    writeln!(output, "#end").unwrap();
    output
}

fn emit_module_dispatch(
    module_name: &str,
    fns: &[ParsedFn],
    include_typedef: bool,
    ffi_surface: Option<&FfiSurface>,
    emitted_enums: &BTreeSet<String>,
) -> String {
    let mut emitted: Vec<(String, String)> = Vec::new();
    for func in fns {
        if !has_ffi_function(&func.name, ffi_surface) {
            continue;
        }
        let native = has_native_ffi_function(&func.name, ffi_surface);
        if let Some((sig, name)) = emit_dispatch_function(module_name, func, emitted_enums, native)
        {
            emitted.push((sig, name));
        }
    }
    if emitted.is_empty() && !include_typedef {
        return String::new();
    }

    let mut output = String::new();
    writeln!(output, "package flight;").unwrap();
    writeln!(output).unwrap();

    if include_typedef {
        writeln!(output, "#if hl").unwrap();
        writeln!(output).unwrap();
        writeln!(output, "typedef {module_name} = flight._hl.{module_name};").unwrap();
        writeln!(output).unwrap();
        writeln!(output, "#elseif cpp").unwrap();
        writeln!(output).unwrap();
        writeln!(output, "typedef {module_name} = flight._cpp.{module_name};").unwrap();
        writeln!(output).unwrap();
        writeln!(output, "#elseif (js && flight_esm)").unwrap();
        writeln!(output).unwrap();
        writeln!(output, "typedef {module_name} = flight._js.{module_name};").unwrap();
        writeln!(output).unwrap();
        writeln!(output, "#elseif js").unwrap();
        writeln!(output).unwrap();
        writeln!(
            output,
            "#error \"flight.{module_name} on js requires flight_esm.\""
        )
        .unwrap();
        writeln!(output).unwrap();
        writeln!(output, "#else").unwrap();
        writeln!(output).unwrap();
        writeln!(
            output,
            "#error \"flight.{module_name}: no backend for this target.\""
        )
        .unwrap();
        writeln!(output).unwrap();
        writeln!(output, "#end").unwrap();
        writeln!(output).unwrap();
    }

    for (sig, _name) in &emitted {
        writeln!(output, "{sig}").unwrap();
    }

    output
}

// `native` is false for a reviewed native skip: the function then exists only for JS/ESM, whose
// binding is the TypeScript SDK export rather than the C ABI.
fn emit_dispatch_function(
    module_name: &str,
    func: &ParsedFn,
    emitted_enums: &BTreeSet<String>,
    native: bool,
) -> Option<(String, String)> {
    let haxe_name = to_camel_case(&func.name);

    let mut haxe_params = Vec::new();
    let mut call_args = Vec::new();
    let mut native_call_args = Vec::new();
    let mut has_str_params = false;
    for param in &func.params {
        let kind = classify_param(&param.ty)?;
        let param_name = to_camel_case(&param.name);
        match &kind {
            ParamKind::SliceConst(_)
            | ParamKind::SliceMut(_)
            | ParamKind::OptionSliceConst(_)
            | ParamKind::OptionSliceMut(_)
            | ParamKind::BoxSlice(_) => {
                haxe_params.push(format!("{param_name}:Dynamic"));
                haxe_params.push(format!("{param_name}Len:Int"));
                call_args.push(param_name.clone());
                call_args.push(format!("{param_name}Len"));
                native_call_args.push(param_name.clone());
                native_call_args.push(format!("{param_name}Len"));
            }
            ParamKind::FixedArrayConst(_, _) | ParamKind::FixedArrayMut(_, _) => {
                haxe_params.push(format!("{param_name}:Dynamic"));
                call_args.push(param_name.clone());
                native_call_args.push(param_name.clone());
            }
            ParamKind::Closure | ParamKind::OptionClosure => {
                haxe_params.push(format!("{param_name}Fn:Dynamic"));
                haxe_params.push(format!("{param_name}Ctx:Dynamic"));
                call_args.push(format!("{param_name}Fn"));
                call_args.push(format!("{param_name}Ctx"));
                native_call_args.push(format!("{param_name}Fn"));
                native_call_args.push(format!("{param_name}Ctx"));
            }
            _ => {
                let haxe_ty = param_kind_to_haxe(&kind, emitted_enums);
                haxe_params.push(format!("{param_name}:{haxe_ty}"));
                if needs_native_str_cast(&kind) {
                    has_str_params = true;
                    native_call_args.push(format!("cast {param_name}"));
                } else {
                    native_call_args.push(param_name.clone());
                }
                call_args.push(param_name);
            }
        }
    }

    let ret_kind = match &func.ret {
        None => ReturnKind::Void,
        Some(ty) => classify_return(ty)?,
    };
    let tuple_elements = match &ret_kind {
        ReturnKind::Tuple(elements) | ReturnKind::OptionTuple(elements) => {
            for element in elements {
                tuple_element_storage(element)?;
            }
            Some(elements.clone())
        }
        _ => None,
    };
    let tuple_optional = matches!(ret_kind, ReturnKind::OptionTuple(_));
    let byte_result = get_byte_result_optional(func);
    let haxe_ret = return_kind_to_haxe(&ret_kind, emitted_enums);
    let has_return = !matches!(ret_kind, ReturnKind::Void);
    let needs_ret_cast = matches!(
        ret_kind,
        ReturnKind::StringReturn | ReturnKind::OptionString
    );

    let params_str = haxe_params.join(", ");
    let js_args_str = call_args.join(", ");
    let native_args_str = if has_str_params {
        native_call_args.join(", ")
    } else {
        js_args_str.clone()
    };
    let ret_prefix = if needs_ret_cast {
        "return cast "
    } else if has_return {
        "return "
    } else {
        ""
    };

    let mut sig = String::new();
    // Logical JavaScript SDK signatures differ from native ABI carriers (arrays, callbacks,
    // options). Keep that difference in the producer instead of requiring a fake C ABI JS module.
    let (js_params, mut js_ret) = crate::haxe_js::signature(func, "")?;
    let js_args = func
        .params
        .iter()
        .map(|p| to_camel_case(&p.name))
        .collect::<Vec<_>>()
        .join(", ");
    let js_ret_prefix = if js_ret == "Void" { "" } else { "return " };
    let js_call = format!("flight._js._fn.{module_name}.{haxe_name}({js_args})");
    writeln!(sig, "#if (js && flight_esm)").unwrap();
    if let Some(elements) = &tuple_elements {
        js_ret = crate::haxe_js::tuple_struct_type(elements);
        if tuple_optional {
            js_ret = format!("Null<{js_ret}>");
        }
    }
    writeln!(
        sig,
        "extern inline function {haxe_name}({}):{js_ret} {{",
        js_params.join(", ")
    )
    .unwrap();
    if let Some(elements) = &tuple_elements {
        write!(
            sig,
            "{}",
            js_tuple_body(&js_call, elements.len(), tuple_optional)
        )
        .unwrap();
    } else {
        writeln!(sig, "\t{js_ret_prefix}{js_call};").unwrap();
    }
    if !native {
        write!(sig, "}}\n#end").unwrap();
        return Some((sig, haxe_name));
    }
    writeln!(sig, "}}\n#else").unwrap();
    writeln!(
        sig,
        "extern inline function {haxe_name}({params_str}):{haxe_ret} {{"
    )
    .unwrap();
    let hl_call = format!("flight._hl._fn.{module_name}.{haxe_name}({native_args_str}");
    let cpp_call = format!("flight._cpp._fn.{module_name}.{haxe_name}({native_args_str}");
    let inner_js_call = format!("flight._js._fn.{module_name}.{haxe_name}({js_args_str})");
    writeln!(sig, "#if hl").unwrap();
    if let Some(optional) = byte_result {
        let hl_byte_call = format!("{hl_call})");
        let statement =
            byte_result_return("flight._hl", module_name, func, &hl_byte_call, optional);
        writeln!(sig, "\t{statement}").unwrap();
    } else if let Some(elements) = &tuple_elements {
        write!(
            sig,
            "{}",
            native_tuple_body(&hl_call, elements, tuple_optional, NativeTarget::Hl)
        )
        .unwrap();
    } else {
        writeln!(sig, "\t{ret_prefix}{hl_call});").unwrap();
    }
    writeln!(sig, "#elseif cpp").unwrap();
    if let Some(optional) = byte_result {
        let cpp_byte_call = format!("{cpp_call})");
        let statement =
            byte_result_return("flight._cpp", module_name, func, &cpp_byte_call, optional);
        writeln!(sig, "\t{statement}").unwrap();
    } else if let Some(elements) = &tuple_elements {
        write!(
            sig,
            "{}",
            native_tuple_body(&cpp_call, elements, tuple_optional, NativeTarget::Cpp)
        )
        .unwrap();
    } else {
        writeln!(sig, "\t{ret_prefix}{cpp_call});").unwrap();
    }
    writeln!(sig, "#elseif (js && flight_esm)").unwrap();
    if let Some(elements) = &tuple_elements {
        write!(
            sig,
            "{}",
            js_tuple_body(&inner_js_call, elements.len(), tuple_optional)
        )
        .unwrap();
    } else {
        writeln!(sig, "\t{ret_prefix}{inner_js_call};").unwrap();
    }
    writeln!(sig, "#else").unwrap();
    writeln!(
        sig,
        "\t#error \"flight.{module_name}: no backend for this target.\""
    )
    .unwrap();
    writeln!(sig, "#end").unwrap();
    write!(sig, "}}").unwrap();
    write!(sig, "\n#end").unwrap();

    return Some((sig, haxe_name));
}

enum NativeTarget {
    Hl,
    Cpp,
}

// The native ABI writes tuple element `i` through a trailing `out_i` pointer. `call` is the extern
// call still missing its closing parenthesis, so the out-parameter addresses can be appended.
fn native_tuple_body(
    call: &str,
    elements: &[String],
    optional: bool,
    target: NativeTarget,
) -> String {
    let mut body = String::new();
    let mut addresses = Vec::new();
    for (index, element) in elements.iter().enumerate() {
        let (hl_storage, cpp_storage) = tuple_element_storage(element).unwrap();
        let (storage, address) = match target {
            NativeTarget::Hl => (hl_storage, format!("hl.Ref.make(out{index})")),
            NativeTarget::Cpp => (cpp_storage, format!("cpp.RawPointer.addressOf(out{index})")),
        };
        let zero = if element == "bool" { "false" } else { "0" };
        writeln!(body, "\tvar out{index}:{storage} = {zero};").unwrap();
        addresses.push(address);
    }
    let separator = if call.ends_with('(') { "" } else { ", " };
    let addresses = addresses.join(", ");
    if optional {
        // The native call returns presence; absent leaves the outputs untouched.
        writeln!(body, "\tif (!{call}{separator}{addresses})) return null;").unwrap();
    } else {
        writeln!(body, "\t{call}{separator}{addresses});").unwrap();
    }
    writeln!(
        body,
        "\treturn {};",
        tuple_literal(elements.len(), |i| format!("out{i}"))
    )
    .unwrap();
    return body;
}

// The TypeScript SDK returns a readonly array; the Haxe surface returns the same structure as the
// native targets.
fn js_tuple_body(call: &str, arity: usize, optional: bool) -> String {
    let absent = if optional {
        "\tif (result == null) return null;\n"
    } else {
        ""
    };
    return format!(
        "\tvar result = {call};\n{absent}\treturn {};\n",
        tuple_literal(arity, |i| format!("result[{i}]"))
    );
}

fn tuple_literal(arity: usize, value: impl Fn(usize) -> String) -> String {
    let fields: Vec<String> = (0..arity).map(|i| format!("_{i}: {}", value(i))).collect();
    return format!("{{ {} }}", fields.join(", "));
}

fn param_kind_to_haxe(kind: &ParamKind, emitted_enums: &BTreeSet<String>) -> String {
    match kind {
        ParamKind::Scalar(ty) => scalar_to_haxe(ty).to_string(),
        ParamKind::RefConst(ty)
        | ParamKind::RefMut(ty)
        | ParamKind::OptionRefConst(ty)
        | ParamKind::OptionRefMut(ty) => ty.clone(),
        ParamKind::ArcRef | ParamKind::ArcRefMut => "Dynamic".to_string(),
        ParamKind::OptionF32 => "Float".to_string(),
        ParamKind::OptionF64 => "Float".to_string(),
        ParamKind::OptionI32 => "Int".to_string(),
        ParamKind::OptionBool => "Int".to_string(),
        ParamKind::StrRef
        | ParamKind::StringParam
        | ParamKind::OptionStr
        | ParamKind::OptionStringParam => "String".to_string(),
        ParamKind::SliceConst(_)
        | ParamKind::SliceMut(_)
        | ParamKind::OptionSliceConst(_)
        | ParamKind::OptionSliceMut(_) => "Dynamic".to_string(),
        ParamKind::FixedArrayConst(_, _) | ParamKind::FixedArrayMut(_, _) => "Dynamic".to_string(),
        ParamKind::Enum(name) => {
            if emitted_enums.contains(name) {
                format!("flight.{name}")
            } else {
                "Int".to_string()
            }
        }
        ParamKind::DynOpaque(_) => "Dynamic".to_string(),
        ParamKind::DynMono(ty) => ty.clone(),
        ParamKind::VecMut(_) | ParamKind::VecConst(_) | ParamKind::VecOwned(_) => {
            "Dynamic".to_string()
        }
        ParamKind::Closure | ParamKind::OptionClosure => "Dynamic".to_string(),
        ParamKind::BoxSlice(_) => "Dynamic".to_string(),
    }
}

fn return_kind_to_haxe(kind: &ReturnKind, emitted_enums: &BTreeSet<String>) -> String {
    match kind {
        ReturnKind::Void => "Void".to_string(),
        ReturnKind::Scalar(ty) => scalar_to_haxe(ty).to_string(),
        ReturnKind::Struct(ty) => ty.clone(),
        ReturnKind::StringReturn | ReturnKind::OptionString => "String".to_string(),
        ReturnKind::ArcRefReturn | ReturnKind::OptionArcRefReturn => "Dynamic".to_string(),
        ReturnKind::Enum(name) => {
            if emitted_enums.contains(name) {
                format!("flight.{name}")
            } else {
                "Int".to_string()
            }
        }
        ReturnKind::BoxSliceReturn(element) | ReturnKind::VecReturn(element) if element == "u8" => {
            BYTE_RESULT_TYPE.to_string()
        }
        ReturnKind::OptionBoxSliceReturn(element) | ReturnKind::OptionVecReturn(element)
            if element == "u8" =>
        {
            format!("Null<{BYTE_RESULT_TYPE}>")
        }
        ReturnKind::VecReturn(_) | ReturnKind::OptionVecReturn(_) => "Dynamic".to_string(),
        ReturnKind::BoxSliceReturn(_) | ReturnKind::OptionBoxSliceReturn(_) => {
            "Dynamic".to_string()
        }
        ReturnKind::FixedArrayReturn(_, _) => "Dynamic".to_string(),
        ReturnKind::OptionStruct(ty) => ty.clone(),
        ReturnKind::Tuple(elements) => tuple_struct_type(elements, scalar_to_haxe),
        ReturnKind::OptionTuple(elements) => {
            format!("Null<{}>", tuple_struct_type(elements, scalar_to_haxe))
        }
    }
}

fn needs_native_str_cast(kind: &ParamKind) -> bool {
    matches!(
        kind,
        ParamKind::StrRef
            | ParamKind::StringParam
            | ParamKind::OptionStr
            | ParamKind::OptionStringParam
    )
}

fn scalar_to_haxe(ty: &str) -> &str {
    match ty {
        "f32" | "f64" => "Float",
        "bool" => "Bool",
        "i8" | "i16" | "i32" | "isize" => "Int",
        "u8" | "u16" | "u32" | "usize" => "Int",
        "i64" | "u64" => "haxe.Int64",
        _ => "Dynamic",
    }
}

fn collect_opaque_types(func: &ParsedFn, types: &mut BTreeSet<String>) {
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

fn emit_enum_file(parsed_enum: &ParsedEnum) -> String {
    let name = &parsed_enum.name;
    let mut output = String::new();
    writeln!(output, "package flight;").unwrap();
    writeln!(output).unwrap();
    writeln!(output, "abstract {name}(Int) from Int to Int {{").unwrap();
    for v in &parsed_enum.variants {
        writeln!(
            output,
            "\tpublic static inline var {}:{name} = {};",
            v.name, v.value
        )
        .unwrap();
    }
    writeln!(output, "}}").unwrap();
    output
}

fn write_if_changed(path: &Path, content: &str) {
    if let Ok(existing) = fs::read_to_string(path) {
        if existing == content {
            return;
        }
    }
    fs::write(path, content).unwrap();
}

#[cfg(test)]
mod portable_dispatch_tests {
    use super::*;
    use crate::parse::ParsedStruct;
    #[test]
    fn scalar_and_optional_tuples_return_structures_on_every_target() {
        let directory =
            std::env::temp_dir().join(format!("flight-dispatch-tuple-{}", std::process::id()));
        fs::create_dir_all(&directory).unwrap();
        let mut optional = crate::parse::random_gaussian_pair_fixture();
        optional.name = "get_last_point".into();
        optional.source_name = Some("get_last_point".into());
        optional.ret = Some("Option<(f64, f64)>".into());
        let exports = vec![CrateExports {
            dir_name: "flight-math".into(),
            fns: vec![crate::parse::random_gaussian_pair_fixture(), optional],
            structs: vec![],
            enums: vec![],
        }];
        let ffi_surface = FfiSurface {
            c: crate::ffi_surface::parse_ffi_header(
                "void flight_random_gaussian_pair(void (*arg0)(void *), void * arg1, double arg2, double arg3, double * arg4, double * arg5);\n\
                 bool flight_get_last_point(double * arg0, double * arg1);",
            ),
            hl: BTreeMap::new(),
            native_skips: BTreeSet::new(),
        };
        generate(&exports, &directory, Some(&ffi_surface));
        let content = fs::read_to_string(directory.join("flight/Math.hx")).unwrap();
        fs::remove_dir_all(&directory).unwrap();
        let expected = "\
#if (js && flight_esm)
extern inline function randomGaussianPair(random:Dynamic, mean:Null<Float>, standardDeviation:Null<Float>):{ _0:Float, _1:Float } {
	var result = flight._js._fn.Math.randomGaussianPair(random, mean, standardDeviation);
	return { _0: result[0], _1: result[1] };
}
#else
extern inline function randomGaussianPair(randomFn:Dynamic, randomCtx:Dynamic, mean:Float, standardDeviation:Float):{ _0:Float, _1:Float } {
#if hl
	var out0:Single = 0;
	var out1:Single = 0;
	flight._hl._fn.Math.randomGaussianPair(randomFn, randomCtx, mean, standardDeviation, hl.Ref.make(out0), hl.Ref.make(out1));
	return { _0: out0, _1: out1 };
#elseif cpp
	var out0:cpp.Float32 = 0;
	var out1:cpp.Float32 = 0;
	flight._cpp._fn.Math.randomGaussianPair(randomFn, randomCtx, mean, standardDeviation, cpp.RawPointer.addressOf(out0), cpp.RawPointer.addressOf(out1));
	return { _0: out0, _1: out1 };
#elseif (js && flight_esm)
	var result = flight._js._fn.Math.randomGaussianPair(randomFn, randomCtx, mean, standardDeviation);
	return { _0: result[0], _1: result[1] };
#else
	#error \"flight.Math: no backend for this target.\"
#end
}
#end
";
        assert!(content.contains(expected), "{content}");
        let expected_optional = "\
#if (js && flight_esm)
extern inline function getLastPoint(random:Dynamic, mean:Null<Float>, standardDeviation:Null<Float>):Null<{ _0:Float, _1:Float }> {
	var result = flight._js._fn.Math.getLastPoint(random, mean, standardDeviation);
	if (result == null) return null;
	return { _0: result[0], _1: result[1] };
}
#else
extern inline function getLastPoint(randomFn:Dynamic, randomCtx:Dynamic, mean:Float, standardDeviation:Float):Null<{ _0:Float, _1:Float }> {
#if hl
	var out0:Float = 0;
	var out1:Float = 0;
	if (!flight._hl._fn.Math.getLastPoint(randomFn, randomCtx, mean, standardDeviation, hl.Ref.make(out0), hl.Ref.make(out1))) return null;
	return { _0: out0, _1: out1 };
#elseif cpp
	var out0:cpp.Float64 = 0;
	var out1:cpp.Float64 = 0;
	if (!flight._cpp._fn.Math.getLastPoint(randomFn, randomCtx, mean, standardDeviation, cpp.RawPointer.addressOf(out0), cpp.RawPointer.addressOf(out1))) return null;
	return { _0: out0, _1: out1 };
#elseif (js && flight_esm)
	var result = flight._js._fn.Math.getLastPoint(randomFn, randomCtx, mean, standardDeviation);
	if (result == null) return null;
	return { _0: result[0], _1: result[1] };
#else
	#error \"flight.Math: no backend for this target.\"
#end
}
#end
";
        assert!(content.contains(expected_optional), "{content}");
        assert!(
            !content.contains("(f32") && !content.contains("(f64"),
            "{content}"
        );
    }
    #[test]
    fn texture_atlas_has_one_module_with_type_and_functions() {
        let directory =
            std::env::temp_dir().join(format!("flight-dispatch-case-{}", std::process::id()));
        fs::create_dir_all(&directory).unwrap();
        let exports = vec![CrateExports {
            dir_name: "flight-textureatlas".into(),
            fns: vec![ParsedFn {
                name: "create_texture_atlas".into(),
                source_name: Some("create_texture_atlas".into()),
                params: vec![],
                ret: Some("TextureAtlas".into()),
            }],
            structs: vec![ParsedStruct {
                name: "TextureAtlas".into(),
                fields: vec![],
            }],
            enums: vec![],
        }];
        generate(&exports, &directory, None);
        let files: Vec<_> = fs::read_dir(directory.join("flight"))
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().to_string())
            .collect();
        assert_eq!(files, ["TextureAtlas.hx"]);
        let content = fs::read_to_string(directory.join("flight/TextureAtlas.hx")).unwrap();
        assert!(content.contains("typedef TextureAtlas = flight._hl.TextureAtlas;"));
        assert!(content.contains("function createTextureAtlas("));
        assert!(content.contains("flight._cpp._fn.TextureAtlas.createTextureAtlas("));
        assert!(content.contains("flight._js._fn.TextureAtlas.createTextureAtlas("));
        fs::remove_dir_all(directory).unwrap();
    }
    #[test]
    fn retained_callback_carrier_skip_emits_no_partial_native_binding() {
        let directory =
            std::env::temp_dir().join(format!("flight-dispatch-carrier-{}", std::process::id()));
        let _ = fs::remove_dir_all(&directory);
        let function = |name: &str, ty: &str| ParsedFn {
            name: name.into(),
            source_name: Some(name.into()),
            params: vec![crate::parse::Param {
                name: "value".into(),
                ty: ty.into(),
            }],
            ret: None,
        };
        let exports = vec![CrateExports {
            dir_name: "flight-audio".into(),
            fns: vec![
                function("set_audio_volume", "f32"),
                function("watch_audio_volume", "Arc<dyn Fn(f32) + Send + Sync>"),
            ],
            structs: vec![],
            enums: vec![],
        }];
        let mut surface = FfiSurface {
            c: crate::ffi_surface::parse_ffi_header(
                "void flight_set_audio_volume(float arg0);\n\
                 void flight_watch_audio_volume(void (*arg0)(void *, float), void * arg1, void (*arg2)(void *));",
            ),
            hl: crate::ffi_surface::parse_hl_primitives(
                "DEFINE_PRIM(_VOID, flight_set_audio_volume, _F32);\n\
                 DEFINE_PRIM(_VOID, flight_watch_audio_volume, _BYTES _BYTES _BYTES);",
            ),
            native_skips: BTreeSet::new(),
        };
        let policy = crate::haxe_common::enforce_native_binding_policy(
            &exports,
            &mut surface,
            &[("watch_audio_volume", "retained listener carrier")],
            &[],
            &["watch_audio_volume"],
        );
        assert_eq!(policy, Ok(()));
        crate::haxe_hl::generate(&exports, &directory, &BTreeMap::new(), Some(&surface));
        crate::haxe_cpp::generate(&exports, &directory, Some(&surface));
        crate::haxe_js::generate(&exports, &directory, Some(&surface));
        generate(&exports, &directory, Some(&surface));
        let read = |path: &str| fs::read_to_string(directory.join(path)).unwrap();
        let hl = read("flight/_hl/_fn/Audio.hx");
        let cpp = read("flight/_cpp/_fn/Audio.hx");
        let js = read("flight/_js/_fn/Audio.hx");
        let facade = read("flight/Audio.hx");
        fs::remove_dir_all(&directory).unwrap();
        assert!(hl.contains("flight_set_audio_volume"), "{hl}");
        assert!(cpp.contains("flight_set_audio_volume"), "{cpp}");
        for native in [&hl, &cpp] {
            assert!(!native.contains("watch_audio_volume"), "{native}");
            assert!(!native.contains("watchAudioVolume"), "{native}");
        }
        assert!(js.contains("watchAudioVolume("), "{js}");
        let start = facade.find("function watchAudioVolume(").unwrap();
        let branch_open = facade[..start].rfind("#if").unwrap();
        assert_eq!(
            &facade[branch_open..facade[branch_open..].find('\n').unwrap() + branch_open],
            "#if (js && flight_esm)",
            "{facade}"
        );
        let body = &facade[start..];
        let body = &body[..body.find("\n#end").unwrap()];
        assert!(
            body.contains("flight._js._fn.Audio.watchAudioVolume("),
            "{body}"
        );
        assert!(
            !body.contains("flight._hl") && !body.contains("flight._cpp"),
            "{body}"
        );
        assert_eq!(
            facade.matches("function watchAudioVolume(").count(),
            1,
            "{facade}"
        );
    }
    #[test]
    fn native_skip_keeps_only_the_js_esm_branch() {
        let function = crate::parse::random_gaussian_pair_fixture();
        let (native, _) =
            emit_dispatch_function("Math", &function, &BTreeSet::new(), true).unwrap();
        assert!(native.contains("flight._hl._fn.Math.randomGaussianPair("));
        let (js_only, _) =
            emit_dispatch_function("Math", &function, &BTreeSet::new(), false).unwrap();
        assert!(js_only.starts_with("#if (js && flight_esm)\n"), "{js_only}");
        assert!(js_only.contains("flight._js._fn.Math.randomGaussianPair("));
        assert!(!js_only.contains("flight._hl"), "{js_only}");
        assert!(!js_only.contains("flight._cpp"), "{js_only}");
        assert!(js_only.ends_with("}\n#end"), "{js_only}");
    }
    #[test]
    fn byte_results_generate_typed_and_verified_on_every_backend() {
        let (directory, bound) = generate_byte_result_fixture("typed");
        assert_eq!(
            crate::byte_result::verify_byte_result_modules(&directory, &bound),
            Vec::<String>::new()
        );
        let externs =
            crate::ffi_surface::verify_generated_externs(&directory, &byte_result_surface());
        assert!(externs.mismatches.is_empty(), "{:?}", externs.mismatches);
        let facade = fs::read_to_string(directory.join("flight/Compression.hx")).unwrap();
        assert!(facade.contains(
            "extern inline function compressDeflate(bytes:Dynamic, bytesLen:Int):ByteResult {\n#if hl\n\
             \treturn new flight._hl._fn.Compression.CompressDeflateByteResult(flight._hl._fn.Compression.compressDeflate(bytes, bytesLen));\n\
             #elseif cpp\n\
             \treturn new flight._cpp._fn.Compression.CompressDeflateByteResult(flight._cpp._fn.Compression.compressDeflate(bytes, bytesLen));"
        ), "{facade}");
        assert!(
            facade.contains(
                "extern inline function decompressDeflate(compressed:Dynamic):Null<ByteResult> {\n\
             \treturn flight._js._fn.Compression.decompressDeflate(compressed);"
            ),
            "{facade}"
        );
        let js = fs::read_to_string(directory.join("flight/_js/_fn/Compression.hx")).unwrap();
        assert!(
            js.contains(
                "public static function compressDeflate(bytes:Dynamic):flight._js.ByteResult;"
            ),
            "{js}"
        );
        assert!(js.contains(
            "public static function decompressDeflate(compressed:Dynamic):Null<flight._js.ByteResult>;"
        ), "{js}");
        for backend in ["_hl", "_cpp", "_js"] {
            assert!(
                directory
                    .join(format!("flight/{backend}/ByteResult.hx"))
                    .is_file()
            );
        }
        assert!(
            fs::read_to_string(directory.join("flight/ByteResult.hx"))
                .unwrap()
                .contains("typedef ByteResult = flight._hl.ByteResult;")
        );
        fs::remove_dir_all(directory).unwrap();
    }
    #[test]
    fn byte_result_generation_is_byte_identical() {
        let (first, _) = generate_byte_result_fixture("first");
        let (second, _) = generate_byte_result_fixture("second");
        assert_eq!(read_generated_tree(&first), read_generated_tree(&second));
        fs::remove_dir_all(first).unwrap();
        fs::remove_dir_all(second).unwrap();
    }

    // A required and an optional owned-byte producer with the exact triples flight-ffi emits.
    fn byte_result_surface() -> FfiSurface {
        let mut header = String::new();
        let mut hl = String::new();
        for name in ["compress_deflate", "decompress_deflate"] {
            header.push_str(&format!(
                "void * flight_{name}(void * arg0, size_t arg1);\n\
                 size_t flight_{name}_result_len(void * arg0);\n\
                 void * flight_{name}_result_get(void * arg0, size_t arg1);\n\
                 void flight_{name}_result_free(void * arg0);\n"
            ));
            hl.push_str(&format!(
                "DEFINE_PRIM(_BYTES, flight_{name}, _BYTES _I32);\n\
                 DEFINE_PRIM(_I32, flight_{name}_result_len, _BYTES);\n\
                 DEFINE_PRIM(_BYTES, flight_{name}_result_get, _BYTES _I32);\n\
                 DEFINE_PRIM(_VOID, flight_{name}_result_free, _BYTES);\n"
            ));
        }
        return FfiSurface {
            c: crate::ffi_surface::parse_ffi_header(&header),
            hl: crate::ffi_surface::parse_hl_primitives(&hl),
            native_skips: BTreeSet::new(),
        };
    }

    // Generates the fixture through every backend exactly as `main` does.
    fn generate_byte_result_fixture(name: &str) -> (std::path::PathBuf, Vec<String>) {
        let directory = std::env::temp_dir().join(format!(
            "flight-dispatch-byte-result-{name}-{}",
            std::process::id()
        ));
        if directory.exists() {
            fs::remove_dir_all(&directory).unwrap();
        }
        let function = |name: &str, ret: &str| ParsedFn {
            name: name.into(),
            source_name: Some(name.into()),
            params: vec![crate::parse::Param {
                name: if name == "compress_deflate" {
                    "bytes"
                } else {
                    "compressed"
                }
                .into(),
                ty: "&Uint8Array".into(),
            }],
            ret: Some(ret.into()),
        };
        let exports = vec![CrateExports {
            dir_name: "flight-compression".into(),
            fns: vec![
                function("compress_deflate", "Box<Uint8Array>"),
                function("decompress_deflate", "Option<Box<Uint8Array>>"),
            ],
            structs: vec![],
            enums: vec![],
        }];
        let surface = byte_result_surface();
        let triples = crate::byte_result::enforce_byte_result_triples(&exports, &surface);
        assert!(triples.errors.is_empty(), "{triples:?}");
        crate::haxe_hl::generate(&exports, &directory, &BTreeMap::new(), Some(&surface));
        crate::haxe_cpp::generate(&exports, &directory, Some(&surface));
        crate::haxe_js::generate(&exports, &directory, Some(&surface));
        generate(&exports, &directory, Some(&surface));
        return (directory, triples.bound);
    }

    fn read_generated_tree(directory: &Path) -> BTreeMap<String, String> {
        let mut out = BTreeMap::new();
        let mut pending = vec![directory.to_path_buf()];
        while let Some(dir) = pending.pop() {
            for entry in fs::read_dir(&dir).unwrap() {
                let path = entry.unwrap().path();
                if path.is_dir() {
                    pending.push(path);
                } else {
                    let relative = path.strip_prefix(directory).unwrap().display().to_string();
                    out.insert(relative, fs::read_to_string(&path).unwrap());
                }
            }
        }
        return out;
    }
}
