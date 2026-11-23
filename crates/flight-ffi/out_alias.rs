// Out-parameter aliasing at the C boundary. The SDK's out-parameter functions are written to be
// safe when `out` is also an input, but Rust's signature `(out: &mut T, source: &T)` makes that
// call impossible to express in Rust, while C can pass one pointer twice. Turning both into
// references would create a `&mut T` and a `&T` to the same object, which is undefined behavior.
//
// Every generated wrapper that takes a mutable `*mut T` and a shared `*const T` of the same
// clonable SDK type is rewritten here: both pointers are refused when NULL, and a shared input
// equal to `out` is cloned before the call, so the SDK reads the input's value as it was when the
// call began and writes `out` exactly as for distinct objects.

use std::collections::BTreeSet;

pub const ALIAS_CONTRACT: &str = "An input may be the same object as out: the call reads its value as it was before the call and writes out as for distinct objects. NULL out or input is refused without writing anything.";

const QUALIFIER: &str = "flight_sdk::";

struct Wrapper<'a> {
    name: &'a str,
    params: Vec<(&'a str, &'a str)>,
    returns: &'a str,
}

fn parse_signature(line: &str) -> Option<Wrapper<'_>> {
    let signature = line.strip_prefix("pub unsafe extern \"C\" fn ")?;
    let open = signature.find('(')?;
    let close = signature.rfind(')')?;
    let params = signature[open + 1..close]
        .split(", ")
        .filter_map(|param| param.split_once(": "))
        .collect();
    return Some(Wrapper {
        name: &signature[..open],
        params,
        returns: signature[close + 1..].trim().trim_end_matches('{').trim(),
    });
}

fn failure_return(returns: &str) -> &'static str {
    return match returns.strip_prefix("-> ").map(str::trim) {
        None => "return;",
        Some("bool") => "return false;",
        Some(ty) if ty.starts_with("*mut ") => "return std::ptr::null_mut();",
        Some(ty) if ty.starts_with("*const ") => "return std::ptr::null();",
        Some(_) => "return Default::default();",
    };
}

// The `(out, inputs)` alias groups of a wrapper: each mutable SDK-type pointer and the shared
// pointers of the same clonable type.
fn alias_groups<'a>(
    wrapper: &Wrapper<'a>,
    clone_types: &BTreeSet<String>,
) -> Vec<(&'a str, Vec<&'a str>)> {
    let mut groups = Vec::new();
    for (out, ty) in &wrapper.params {
        let Some(pointee) = ty.strip_prefix("*mut ") else {
            continue;
        };
        let Some(name) = pointee.strip_prefix(QUALIFIER) else {
            continue;
        };
        if !clone_types.contains(name) {
            continue;
        }
        let shared = format!("*const {pointee}");
        let inputs: Vec<&str> = wrapper
            .params
            .iter()
            .filter(|(_, other)| *other == shared)
            .map(|(param, _)| *param)
            .collect();
        if !inputs.is_empty() {
            groups.push((*out, inputs));
        }
    }
    return groups;
}

/// Rewrites every aliasing wrapper in `generated`; returns the rewritten source and the names of
/// the wrappers it guarded.
pub fn guard_out_parameter_aliases(
    generated: &str,
    clone_types: &BTreeSet<String>,
) -> (String, Vec<String>) {
    let mut out = String::with_capacity(generated.len());
    let mut guarded = Vec::new();
    let mut body: Option<Vec<(String, String)>> = None;
    for line in generated.split_inclusive('\n') {
        if let Some(inputs) = &body {
            if line == "}\n" {
                body = None;
                out.push_str(line);
                continue;
            }
            let mut rewritten = line.to_string();
            for (input, local) in inputs {
                rewritten = rewritten.replace(
                    &format!("unsafe {{ &*{input} }}"),
                    &format!("{local}.as_ref().unwrap_or_else(|| unsafe {{ &*{input} }})"),
                );
            }
            out.push_str(&rewritten);
            continue;
        }
        let Some(wrapper) = parse_signature(line) else {
            out.push_str(line);
            continue;
        };
        let groups = alias_groups(&wrapper, clone_types);
        if groups.is_empty() {
            out.push_str(line);
            continue;
        }
        let attribute = "#[unsafe(no_mangle)]\n";
        if out.ends_with(attribute) {
            out.truncate(out.len() - attribute.len());
            out.push_str(&format!(
                "#[doc = \"flight-ffi contract|{ALIAS_CONTRACT}\"]\n"
            ));
            out.push_str(attribute);
        }
        out.push_str(line);
        let failure = failure_return(wrapper.returns);
        let mut required: BTreeSet<&str> = BTreeSet::new();
        let mut locals = Vec::new();
        let mut snapshots = String::new();
        for (target, inputs) in &groups {
            required.insert(target);
            for input in inputs {
                required.insert(input);
                let local = format!("ffi_alias_{input}");
                snapshots.push_str(&format!(
                    "    let {local} = if std::ptr::eq({input}, {target} as *const _) {{ Some(Clone::clone(unsafe {{ &*{input} }})) }} else {{ None }};\n"
                ));
                locals.push((input.to_string(), local));
            }
        }
        let checks: Vec<String> = required
            .iter()
            .map(|param| format!("{param}.is_null()"))
            .collect();
        out.push_str(&format!("    if {} {{ {failure} }}\n", checks.join(" || ")));
        out.push_str(&snapshots);
        guarded.push(wrapper.name.to_string());
        body = Some(locals);
    }
    return (out, guarded);
}
