use std::collections::{BTreeMap, BTreeSet};
use std::fmt::Write as _;
use std::fs;
use std::path::Path;

use crate::parse::{
    CrateExports, ParamKind, ParsedFn, ReturnKind, classify_param, classify_return, to_camel_case,
    to_pascal_case,
};

pub fn generate(crate_exports: &[CrateExports], out_dir: &Path) {
    let flight_dir = out_dir.join("flight");
    fs::create_dir_all(&flight_dir).unwrap();

    let mut all_opaque_types: BTreeSet<String> = BTreeSet::new();
    let mut modules: BTreeMap<String, &[ParsedFn]> = BTreeMap::new();

    for crate_export in crate_exports {
        let module_name = crate_dir_to_module(&crate_export.dir_name);
        modules.insert(module_name, &crate_export.fns);
        for func in &crate_export.fns {
            collect_opaque_types(func, &mut all_opaque_types);
        }
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

    for (module_name, fns) in &modules {
        let has_matching_type = types_that_are_modules.contains(module_name);
        let output = emit_module_dispatch(module_name, fns, has_matching_type);
        if !output.is_empty() {
            let path = flight_dir.join(format!("{module_name}.hx"));
            write_if_changed(&path, &output);
            total_files += 1;
        }
    }

    eprintln!(
        "wrote {total_files} dispatch files to {}",
        flight_dir.display()
    );
}

fn crate_dir_to_module(dir_name: &str) -> String {
    let stripped = dir_name.strip_prefix("flight-").unwrap_or(dir_name);
    to_pascal_case(stripped)
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

fn emit_module_dispatch(module_name: &str, fns: &[ParsedFn], include_typedef: bool) -> String {
    let mut emitted: Vec<(String, String)> = Vec::new();
    for func in fns {
        if let Some((sig, name)) = emit_dispatch_function(module_name, func) {
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

fn emit_dispatch_function(module_name: &str, func: &ParsedFn) -> Option<(String, String)> {
    let haxe_name = to_camel_case(&func.name);

    let mut haxe_params = Vec::new();
    let mut call_args = Vec::new();
    for param in &func.params {
        let kind = classify_param(&param.ty)?;
        let haxe_ty = param_kind_to_haxe(&kind);
        let param_name = to_camel_case(&param.name);
        haxe_params.push(format!("{param_name}:{haxe_ty}"));
        call_args.push(param_name);
    }

    let ret_kind = match &func.ret {
        None => ReturnKind::Void,
        Some(ty) => classify_return(ty)?,
    };
    let haxe_ret = return_kind_to_haxe(&ret_kind);
    let has_return = !matches!(ret_kind, ReturnKind::Void);
    let needs_cast = matches!(ret_kind, ReturnKind::StringReturn);

    let params_str = haxe_params.join(", ");
    let args_str = call_args.join(", ");
    let ret_prefix = if needs_cast {
        "return cast "
    } else if has_return {
        "return "
    } else {
        ""
    };

    let mut sig = String::new();
    writeln!(
        sig,
        "inline function {haxe_name}({params_str}):{haxe_ret} {{"
    )
    .unwrap();
    writeln!(sig, "#if hl").unwrap();
    writeln!(
        sig,
        "\t{ret_prefix}flight._hl._fn.{module_name}.{haxe_name}({args_str});"
    )
    .unwrap();
    writeln!(sig, "#elseif cpp").unwrap();
    writeln!(
        sig,
        "\t{ret_prefix}flight._cpp._fn.{module_name}.{haxe_name}({args_str});"
    )
    .unwrap();
    writeln!(sig, "#elseif (js && flight_esm)").unwrap();
    writeln!(
        sig,
        "\t{ret_prefix}flight._js._fn.{module_name}.{haxe_name}({args_str});"
    )
    .unwrap();
    writeln!(sig, "#else").unwrap();
    writeln!(
        sig,
        "\t#error \"flight.{module_name}: no backend for this target.\""
    )
    .unwrap();
    writeln!(sig, "#end").unwrap();
    write!(sig, "}}").unwrap();

    return Some((sig, haxe_name));
}

fn param_kind_to_haxe(kind: &ParamKind) -> String {
    match kind {
        ParamKind::Scalar(ty) => scalar_to_haxe(ty).to_string(),
        ParamKind::RefConst(ty) | ParamKind::RefMut(ty) => ty.clone(),
        ParamKind::OptionF32 => "Single".to_string(),
    }
}

fn return_kind_to_haxe(kind: &ReturnKind) -> String {
    match kind {
        ReturnKind::Void => "Void".to_string(),
        ReturnKind::Scalar(ty) => scalar_to_haxe(ty).to_string(),
        ReturnKind::Struct(ty) => ty.clone(),
        ReturnKind::StringReturn => "String".to_string(),
    }
}

fn scalar_to_haxe(ty: &str) -> &str {
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

fn collect_opaque_types(func: &ParsedFn, types: &mut BTreeSet<String>) {
    for param in &func.params {
        if let Some(kind) = classify_param(&param.ty) {
            match kind {
                ParamKind::RefConst(ty) | ParamKind::RefMut(ty) => {
                    types.insert(ty);
                }
                _ => {}
            }
        }
    }
    if let Some(ref ret) = func.ret {
        if let Some(ReturnKind::Struct(ty)) = classify_return(ret) {
            types.insert(ty);
        }
    }
}

fn write_if_changed(path: &Path, content: &str) {
    if let Ok(existing) = fs::read_to_string(path) {
        if existing == content {
            return;
        }
    }
    fs::write(path, content).unwrap();
}
