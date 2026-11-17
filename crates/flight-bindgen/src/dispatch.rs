use std::collections::{BTreeMap, BTreeSet};
use std::fmt::Write as _;
use std::fs;
use std::path::Path;

use crate::haxe_common::{
    crate_dir_to_module, has_ffi_function, tuple_element_storage, tuple_struct_type,
};
use crate::parse::{
    CrateExports, ParamKind, ParsedEnum, ParsedFn, ReturnKind, classify_param, classify_return,
    to_camel_case,
};

pub fn generate(
    crate_exports: &[CrateExports],
    out_dir: &Path,
    ffi_names: Option<&BTreeSet<String>>,
) {
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
            ffi_names,
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
    ffi_names: Option<&BTreeSet<String>>,
    emitted_enums: &BTreeSet<String>,
) -> String {
    let mut emitted: Vec<(String, String)> = Vec::new();
    for func in fns {
        if !has_ffi_function(&func.name, ffi_names) {
            continue;
        }
        if let Some((sig, name)) = emit_dispatch_function(module_name, func, emitted_enums) {
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

fn emit_dispatch_function(
    module_name: &str,
    func: &ParsedFn,
    emitted_enums: &BTreeSet<String>,
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
    if let Some(elements) = &tuple_elements {
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
    if let Some(elements) = &tuple_elements {
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
        let ffi_names = BTreeSet::from([
            "flight_random_gaussian_pair".to_string(),
            "flight_get_last_point".to_string(),
        ]);
        generate(&exports, &directory, Some(&ffi_names));
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
}
