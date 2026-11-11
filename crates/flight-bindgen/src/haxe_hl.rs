use std::collections::BTreeSet;
use std::fmt::Write as _;
use std::fs;
use std::path::Path;

use crate::parse::{
    CrateExports, ParamKind, ParsedFn, ReturnKind, classify_param, classify_return, to_camel_case,
};

const LIB_NAME: &str = "flight";

pub fn generate(crate_exports: &[CrateExports], out_dir: &Path) {
    fs::create_dir_all(out_dir).unwrap();

    let mut all_fns: Vec<(&str, &ParsedFn)> = Vec::new();
    let mut opaque_types: BTreeSet<String> = BTreeSet::new();

    for crate_export in crate_exports {
        for func in &crate_export.fns {
            all_fns.push((&crate_export.dir_name, func));
            collect_opaque_types(func, &mut opaque_types);
        }
    }

    let mut output = String::new();
    writeln!(output, "package flight;").unwrap();
    writeln!(output).unwrap();

    for ty in &opaque_types {
        writeln!(output, "abstract {ty}(hl.Bytes) {{}}").unwrap();
    }
    if !opaque_types.is_empty() {
        writeln!(output).unwrap();
    }

    writeln!(output, "class Flight {{").unwrap();

    let mut current_crate = "";
    for (crate_name, func) in &all_fns {
        if *crate_name != current_crate {
            writeln!(output).unwrap();
            writeln!(output, "\t// {crate_name}").unwrap();
            current_crate = crate_name;
        }
        if let Some(decl) = emit_function(func) {
            writeln!(output, "{decl}").unwrap();
        }
    }

    writeln!(output).unwrap();
    writeln!(output, "\t// free functions").unwrap();
    writeln!(
        output,
        "\t@:hlNative(\"{LIB_NAME}\", \"flight_free_string\")"
    )
    .unwrap();
    writeln!(
        output,
        "\tpublic static function freeString(ptr:hl.Bytes):Void;"
    )
    .unwrap();

    for ty in &opaque_types {
        let ffi_name = format!("flight_free_{}", to_snake_case(ty));
        let haxe_name = format!("free{ty}");
        writeln!(output, "\t@:hlNative(\"{LIB_NAME}\", \"{ffi_name}\")").unwrap();
        writeln!(
            output,
            "\tpublic static function {haxe_name}(ptr:{ty}):Void;"
        )
        .unwrap();
    }

    writeln!(output, "}}").unwrap();

    let out_path = out_dir.join("Flight.hx");
    fs::write(&out_path, &output).unwrap();
    eprintln!("wrote {}", out_path.display());
}

fn emit_function(func: &ParsedFn) -> Option<String> {
    let ffi_name = format!("flight_{}", func.name);
    let haxe_name = to_camel_case(&func.name);

    let mut haxe_params = Vec::new();
    for param in &func.params {
        let kind = classify_param(&param.ty)?;
        let haxe_ty = param_kind_to_haxe(&kind);
        haxe_params.push(format!("{}:{}", to_camel_case(&param.name), haxe_ty));
    }

    let ret_kind = match &func.ret {
        None => ReturnKind::Void,
        Some(ty) => classify_return(ty)?,
    };
    let haxe_ret = return_kind_to_haxe(&ret_kind);

    let params_str = haxe_params.join(", ");
    return Some(format!(
        "\t@:hlNative(\"{LIB_NAME}\", \"{ffi_name}\")\n\tpublic static function {haxe_name}({params_str}):{haxe_ret};"
    ));
}

fn param_kind_to_haxe(kind: &ParamKind) -> String {
    match kind {
        ParamKind::Scalar(ty) => scalar_to_haxe(ty).to_string(),
        ParamKind::RefConst(ty) => ty.clone(),
        ParamKind::RefMut(ty) => ty.clone(),
        ParamKind::OptionF32 => "Single".to_string(),
    }
}

fn return_kind_to_haxe(kind: &ReturnKind) -> String {
    match kind {
        ReturnKind::Void => "Void".to_string(),
        ReturnKind::Scalar(ty) => scalar_to_haxe(ty).to_string(),
        ReturnKind::Struct(ty) => ty.clone(),
        ReturnKind::StringReturn => "hl.Bytes".to_string(),
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
