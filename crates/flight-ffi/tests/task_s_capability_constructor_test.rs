//! Independent Task S source and generated-constructor oracle.

use quote::ToTokens;
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};
use syn::{Fields, GenericArgument, Item, PathArguments, ReturnType, Type, TypeParamBound};

const PRIORITY_CAPABILITIES: &[(&str, &str, usize)] = &[
    ("window", "HostWindowAppearanceCapability", 3),
    ("window", "HostWindowAttachCapability", 1),
    ("window", "HostWindowAttentionCapability", 2),
    ("window", "HostWindowContentProtectionCapability", 1),
    ("window", "HostWindowFocusCapability", 1),
    ("window", "HostWindowFullscreenCapability", 1),
    ("window", "HostWindowGeometryCapability", 6),
    ("window", "HostWindowHierarchyCapability", 1),
    ("window", "HostWindowLifecycleCapability", 3),
    ("window", "HostWindowProgressCapability", 1),
    ("window", "HostWindowShadowCapability", 1),
    ("window", "HostWindowShellCapability", 2),
    ("window", "HostWindowSizeConstraintsCapability", 3),
    ("window", "HostWindowStateCapability", 3),
    ("window", "HostWindowVisibilityCapability", 3),
    ("window", "HostWindowZOrderCapability", 1),
    ("screen", "HostScreenChangeCapability", 1),
    ("screen", "HostScreenDetailsCapability", 2),
    ("screen", "HostScreenPermissionChangeCapability", 1),
    ("screen", "HostScreenQueryCapability", 4),
    ("device", "HostDeviceCapability", 6),
    ("input-ingress", "HostInputIngressCapability", 6),
    ("lifecycle", "HostLifecycleCapability", 4),
    ("timer", "HostTimerCapability", 3),
    ("surface", "HostCanvasCapability", 5),
    ("surface", "HostGlCapability", 4),
    ("surface", "HostSurfaceDisplayCapability", 1),
    ("surface", "HostSurfaceResizeCapability", 1),
    ("surface", "HostWgpuCapability", 5),
];

#[derive(Clone, Debug)]
struct Callback {
    optional: bool,
    signature: String,
    arguments: String,
    result: String,
    asynchronous: bool,
    borrow: &'static str,
    carrier: &'static str,
}

#[derive(Clone, Debug)]
struct CapabilityField {
    name: String,
    ty: String,
    callback: Option<Callback>,
}

#[derive(Clone, Debug)]
struct Capability {
    crate_name: String,
    source: String,
    name: String,
    root_public: bool,
    fields: Vec<CapabilityField>,
}

#[derive(Debug)]
struct GeneratedField {
    name: String,
    kind: String,
    signature: Option<String>,
    ty: String,
    decision: Option<(String, String)>,
}

#[derive(Debug)]
struct GeneratedCapability {
    crate_name: String,
    source: String,
    name: String,
    rust_public: bool,
    ffi_constructor: bool,
    declared_fields: usize,
    declared_callbacks: usize,
    fields: Vec<GeneratedField>,
}

#[derive(Debug)]
struct GeneratedInventory {
    capabilities: Vec<GeneratedCapability>,
    families: BTreeMap<String, usize>,
}

#[derive(Default)]
struct SourceIndex {
    aliases: BTreeMap<(String, String), Type>,
    global_aliases: BTreeMap<String, Vec<Type>>,
    capabilities: Vec<Capability>,
}

#[derive(Clone)]
enum CallbackType {
    Closure(syn::TypeTraitObject),
    Function(syn::TypeBareFn),
}

fn workspace_root() -> PathBuf {
    if let Some(root) = option_env!("TASK_S_WORKSPACE_ROOT") {
        return PathBuf::from(root);
    }
    return PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
}

fn test_output_dir() -> PathBuf {
    return std::env::var_os("CARGO_TARGET_TMPDIR")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);
}

fn rust_files(dir: &Path) -> Vec<PathBuf> {
    fn visit(dir: &Path, out: &mut Vec<PathBuf>) {
        for entry in fs::read_dir(dir).unwrap() {
            let path = entry.unwrap().path();
            if path.is_dir() {
                visit(&path, out);
            } else if path.extension().and_then(|value| value.to_str()) == Some("rs") {
                out.push(path);
            }
        }
    }

    let mut out = Vec::new();
    visit(dir, &mut out);
    out.sort();
    return out;
}

fn normalize_tokens<T: ToTokens>(value: &T) -> String {
    return value
        .to_token_stream()
        .to_string()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
}

fn collect_items(crate_name: &str, source: &str, items: &[Item], index: &mut SourceIndex) {
    for item in items {
        match item {
            Item::Type(alias) => {
                let name = alias.ident.to_string();
                index
                    .aliases
                    .insert((crate_name.to_string(), name.clone()), (*alias.ty).clone());
                index
                    .global_aliases
                    .entry(name)
                    .or_default()
                    .push((*alias.ty).clone());
            }
            Item::Mod(module) => {
                if let Some((_, nested)) = &module.content {
                    collect_items(crate_name, source, nested, index);
                }
            }
            Item::Struct(item_struct)
                if item_struct.ident.to_string().starts_with("Host")
                    && item_struct.ident.to_string().contains("Capabilit") =>
            {
                let fields = match &item_struct.fields {
                    Fields::Named(fields) => fields
                        .named
                        .iter()
                        .map(|field| CapabilityField {
                            name: field.ident.as_ref().unwrap().to_string(),
                            ty: normalize_tokens(&field.ty),
                            callback: None,
                        })
                        .collect(),
                    Fields::Unnamed(fields) => fields
                        .unnamed
                        .iter()
                        .enumerate()
                        .map(|(field_index, field)| CapabilityField {
                            name: field_index.to_string(),
                            ty: normalize_tokens(&field.ty),
                            callback: None,
                        })
                        .collect(),
                    Fields::Unit => Vec::new(),
                };
                let name = item_struct.ident.to_string();
                // The net/share capability carriers are contract-lane declarations even though
                // their crates expose the surrounding types module. They are not constructor
                // candidates in flight-ffi's public SDK scan.
                let contract_only = crate_name == "flight-net" || crate_name == "flight-share";
                index.capabilities.push(Capability {
                    crate_name: crate_name.to_string(),
                    source: source.to_string(),
                    name,
                    root_public: !contract_only,
                    fields,
                });
            }
            _ => {}
        }
    }
}

fn callback_trait(ty: &Type) -> Option<&syn::TypeTraitObject> {
    let Type::Path(path) = ty else {
        return None;
    };
    let segment = path.path.segments.last()?;
    if segment.ident != "Arc" {
        return None;
    }
    let PathArguments::AngleBracketed(arguments) = &segment.arguments else {
        return None;
    };
    let Some(GenericArgument::Type(Type::TraitObject(trait_object))) = arguments.args.first()
    else {
        return None;
    };
    let is_callback = trait_object.bounds.iter().any(|bound| {
        let TypeParamBound::Trait(bound) = bound else {
            return false;
        };
        return bound.path.segments.last().is_some_and(|segment| {
            segment.ident == "Fn" || segment.ident == "FnMut" || segment.ident == "FnOnce"
        });
    });
    if !is_callback {
        return None;
    }
    return Some(trait_object);
}

fn option_inner(ty: &Type) -> Option<&Type> {
    let Type::Path(path) = ty else {
        return None;
    };
    let segment = path.path.segments.last()?;
    if segment.ident != "Option" {
        return None;
    }
    let PathArguments::AngleBracketed(arguments) = &segment.arguments else {
        return None;
    };
    let Some(GenericArgument::Type(inner)) = arguments.args.first() else {
        return None;
    };
    return Some(inner);
}

fn alias_type(
    crate_name: &str,
    ty: &Type,
    aliases: &BTreeMap<(String, String), Type>,
    global_aliases: &BTreeMap<String, Vec<Type>>,
) -> Option<Type> {
    let Type::Path(path) = ty else {
        return None;
    };
    if path.qself.is_some() {
        return None;
    }
    let segment = path.path.segments.last()?;
    if !matches!(segment.arguments, PathArguments::None) {
        return None;
    }
    let name = segment.ident.to_string();
    if let Some(found) = aliases.get(&(crate_name.to_string(), name.clone())) {
        return Some(found.clone());
    }
    let global = global_aliases.get(&name)?;
    if global.len() == 1
        || global
            .windows(2)
            .all(|pair| normalize_tokens(&pair[0]) == normalize_tokens(&pair[1]))
    {
        return global.first().cloned();
    }
    return None;
}

fn find_callback(
    crate_name: &str,
    ty: &Type,
    aliases: &BTreeMap<(String, String), Type>,
    global_aliases: &BTreeMap<String, Vec<Type>>,
    optional: bool,
    seen: &mut BTreeSet<String>,
) -> Option<(bool, CallbackType)> {
    if let Some(inner) = option_inner(ty) {
        return find_callback(crate_name, inner, aliases, global_aliases, true, seen);
    }
    if let Some(callback) = callback_trait(ty) {
        return Some((optional, CallbackType::Closure(callback.clone())));
    }
    if let Type::BareFn(function) = ty {
        return Some((optional, CallbackType::Function(function.clone())));
    }
    let key = normalize_tokens(ty);
    if !seen.insert(key) {
        return None;
    }
    let resolved = alias_type(crate_name, ty, aliases, global_aliases)?;
    return find_callback(
        crate_name,
        &resolved,
        aliases,
        global_aliases,
        optional,
        seen,
    );
}

fn callback_signature(optional: bool, callback: &CallbackType) -> Callback {
    let (argument_types, output): (Vec<String>, &ReturnType) = match callback {
        CallbackType::Closure(callback) => {
            let function = callback.bounds.iter().find_map(|bound| {
                let TypeParamBound::Trait(bound) = bound else {
                    return None;
                };
                let segment = bound.path.segments.last()?;
                if segment.ident != "Fn" && segment.ident != "FnMut" && segment.ident != "FnOnce" {
                    return None;
                }
                let PathArguments::Parenthesized(arguments) = &segment.arguments else {
                    return None;
                };
                return Some(arguments);
            });
            let function = function.expect("Arc<dyn callback> has no Fn bound");
            (
                function.inputs.iter().map(normalize_tokens).collect(),
                &function.output,
            )
        }
        CallbackType::Function(function) => (
            function
                .inputs
                .iter()
                .map(|argument| normalize_tokens(&argument.ty))
                .collect(),
            &function.output,
        ),
    };
    let arguments = argument_types.join(", ");
    let result = match output {
        ReturnType::Default => String::from("()"),
        ReturnType::Type(_, ty) => normalize_tokens(ty.as_ref()),
    };
    let signature = format!("fn({arguments}) -> {result}");
    let asynchronous = result.contains("Future") || result.contains("Pin < Box < dyn Future");
    let has_mut = arguments.contains("& mut ");
    let has_shared = arguments.contains('&');
    let borrow = match (has_mut, has_shared) {
        (true, true) => "shared+mut",
        (true, false) => "mut",
        (false, true) => "shared",
        (false, false) => "none",
    };
    let carrier = if asynchronous {
        "unsupported:future"
    } else if arguments.contains("dyn Fn") || arguments.contains("Listener") {
        "needs:nested-callback"
    } else if result.contains("dyn Fn")
        || result.contains("Unsubscribe")
        || result.contains("Release")
    {
        "needs:callback-return"
    } else if arguments.contains("< Target") || result.contains("< Target") {
        "unsupported:generic"
    } else if arguments.contains("& mut ") {
        "mapped:out-pointer"
    } else if arguments.contains("& str") || result == "String" {
        "mapped:string"
    } else if arguments.contains('&') || result.contains("Option <") {
        "mapped:pointer"
    } else {
        "mapped:scalar"
    };
    return Callback {
        optional,
        signature,
        arguments,
        result,
        asynchronous,
        borrow,
        carrier,
    };
}

fn source_inventory() -> Vec<Capability> {
    let root = workspace_root();
    let crates = root.join("crates");
    let mut index = SourceIndex::default();
    for crate_dir in fs::read_dir(&crates).unwrap() {
        let crate_dir = crate_dir.unwrap().path();
        let crate_name = crate_dir.file_name().unwrap().to_str().unwrap();
        if !crate_name.starts_with("flight-") || !crate_dir.join("src").is_dir() {
            continue;
        }
        for path in rust_files(&crate_dir.join("src")) {
            let text = fs::read_to_string(&path).unwrap();
            let file = syn::parse_file(&text)
                .unwrap_or_else(|error| panic!("failed to parse {}: {error}", path.display()));
            let source = path
                .strip_prefix(&root)
                .unwrap()
                .to_string_lossy()
                .replace('\\', "/");
            collect_items(crate_name, &source, &file.items, &mut index);
        }
    }
    for capability in &mut index.capabilities {
        for field in &mut capability.fields {
            let parsed: Type = syn::parse_str(&field.ty).unwrap();
            if let Some((optional, callback)) = find_callback(
                &capability.crate_name,
                &parsed,
                &index.aliases,
                &index.global_aliases,
                false,
                &mut BTreeSet::new(),
            ) {
                field.callback = Some(callback_signature(optional, &callback));
            }
        }
    }
    index.capabilities.sort_by(|left, right| {
        (&left.crate_name, &left.source, &left.name).cmp(&(
            &right.crate_name,
            &right.source,
            &right.name,
        ))
    });
    return index.capabilities;
}

fn render_inventory(capabilities: &[Capability]) -> String {
    let callback_count: usize = capabilities
        .iter()
        .map(|capability| {
            capability
                .fields
                .iter()
                .filter(|field| field.callback.is_some())
                .count()
        })
        .sum();
    let required = capabilities
        .iter()
        .flat_map(|capability| &capability.fields)
        .filter_map(|field| field.callback.as_ref())
        .filter(|callback| !callback.optional)
        .count();
    let optional = callback_count - required;
    let families: BTreeMap<String, usize> = capabilities
        .iter()
        .flat_map(|capability| &capability.fields)
        .filter_map(|field| field.callback.as_ref())
        .fold(BTreeMap::new(), |mut out, callback| {
            *out.entry(callback.signature.clone()).or_default() += 1;
            out
        });
    let total_fields: usize = capabilities
        .iter()
        .map(|capability| capability.fields.len())
        .sum();
    let root_public = capabilities
        .iter()
        .filter(|capability| capability.root_public)
        .count();
    let mut out = format!(
        "# task-s capability inventory v1\n# structs={} root_public={} contract_only={} fields={} callbacks={} required={} optional={} families={}\n",
        capabilities.len(),
        root_public,
        capabilities.len() - root_public,
        total_fields,
        callback_count,
        required,
        optional,
        families.len()
    );
    out.push_str("kind\tcrate\tsource\tstruct\troot_lane\tfield_index\tfield\trequirement\ttype_or_signature\targuments\treturn\tasync\tborrow\tcarrier\n");
    for capability in capabilities {
        out.push_str(&format!(
            "struct\t{}\t{}\t{}\t{}\t\t\t\t{} fields\t\t\t\t\t\n",
            capability.crate_name,
            capability.source,
            capability.name,
            if capability.root_public {
                "public"
            } else {
                "contract-only"
            },
            capability.fields.len()
        ));
        for (field_index, field) in capability.fields.iter().enumerate() {
            if let Some(callback) = &field.callback {
                out.push_str(&format!(
                    "callback\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\n",
                    capability.crate_name,
                    capability.source,
                    capability.name,
                    if capability.root_public {
                        "public"
                    } else {
                        "contract-only"
                    },
                    field_index,
                    field.name,
                    if callback.optional {
                        "optional"
                    } else {
                        "required"
                    },
                    callback.signature,
                    callback.arguments,
                    callback.result,
                    if callback.asynchronous { "yes" } else { "no" },
                    callback.borrow,
                    callback.carrier
                ));
            } else {
                out.push_str(&format!(
                    "field\t{}\t{}\t{}\t{}\t{}\t{}\tnon-callback\t{}\t\t\t\t\t\n",
                    capability.crate_name,
                    capability.source,
                    capability.name,
                    if capability.root_public {
                        "public"
                    } else {
                        "contract-only"
                    },
                    field_index,
                    field.name,
                    field.ty
                ));
            }
        }
    }
    for (family_index, (signature, count)) in families.iter().enumerate() {
        out.push_str(&format!(
            "family\t\t\tF{:03}\t\t\t\t{} uses\t{}\t\t\t\t\t\n",
            family_index + 1,
            count,
            signature
        ));
    }
    return out;
}

#[test]
fn structural_inventory_matches_the_frozen_task_s_oracle() {
    let capabilities = source_inventory();
    let inventory = render_inventory(&capabilities);
    let expected = include_str!("task_s_capability_inventory.tsv");
    if inventory != expected {
        let output = test_output_dir().join("task_s_capability_inventory.tsv");
        fs::write(&output, &inventory).unwrap();
        panic!(
            "Task S structural inventory changed; actual written to {}",
            output.display()
        );
    }
}

#[test]
fn structural_inventory_has_the_exact_accepted_census() {
    let capabilities = source_inventory();
    let fields: usize = capabilities
        .iter()
        .map(|capability| capability.fields.len())
        .sum();
    let callbacks: Vec<&Callback> = capabilities
        .iter()
        .flat_map(|capability| &capability.fields)
        .filter_map(|field| field.callback.as_ref())
        .collect();
    let families: BTreeSet<&str> = callbacks
        .iter()
        .map(|callback| callback.signature.as_str())
        .collect();
    assert_eq!(capabilities.len(), 242);
    assert_eq!(
        capabilities.iter().filter(|item| item.root_public).count(),
        237
    );
    assert_eq!(fields, 795);
    assert_eq!(callbacks.len(), 438);
    assert_eq!(callbacks.iter().filter(|item| !item.optional).count(), 360);
    assert_eq!(callbacks.iter().filter(|item| item.optional).count(), 78);
    assert_eq!(families.len(), 304);
}

#[test]
fn host_lime_priorities_resolve_to_the_exact_29_leaves_and_76_callbacks() {
    let capabilities = source_inventory();
    let mut groups = BTreeMap::<&str, (usize, usize)>::new();
    for (group, name, expected_callbacks) in PRIORITY_CAPABILITIES {
        let matches: Vec<&Capability> = capabilities
            .iter()
            .filter(|capability| capability.name == *name)
            .collect();
        assert_eq!(
            matches.len(),
            1,
            "priority type {name} must resolve exactly once"
        );
        let capability = matches[0];
        assert!(
            capability.root_public,
            "priority type {name} must be public"
        );
        let callbacks = capability
            .fields
            .iter()
            .filter(|field| field.callback.is_some())
            .count();
        assert_eq!(
            callbacks, *expected_callbacks,
            "priority callback drift for {name}"
        );
        let totals = groups.entry(group).or_default();
        totals.0 += 1;
        totals.1 += callbacks;
    }
    assert_eq!(
        groups,
        BTreeMap::from([
            ("device", (1, 6)),
            ("input-ingress", (1, 6)),
            ("lifecycle", (1, 4)),
            ("screen", (4, 8)),
            ("surface", (5, 16)),
            ("timer", (1, 3)),
            ("window", (16, 33)),
        ])
    );
    assert_eq!(PRIORITY_CAPABILITIES.len(), 29);
    assert_eq!(
        PRIORITY_CAPABILITIES
            .iter()
            .map(|item| item.2)
            .sum::<usize>(),
        76
    );
}

fn generated_file(name: &str) -> String {
    let out_dir = option_env!("OUT_DIR")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("TASK_S_GENERATED_OUT_DIR").map(PathBuf::from))
        .unwrap_or_else(|| {
            panic!("Task S generated-output test requires Cargo OUT_DIR while reading {name}")
        });
    let path = out_dir.join(name);
    return fs::read_to_string(&path).unwrap_or_else(|error| {
        panic!("Task S generator did not emit {}: {error}", path.display())
    });
}

fn parse_key_value<T: std::str::FromStr>(field: &str, prefix: &str) -> T
where
    T::Err: std::fmt::Debug,
{
    return field
        .strip_prefix(prefix)
        .unwrap_or_else(|| panic!("expected {prefix:?} in {field:?}"))
        .parse()
        .unwrap();
}

fn parse_generated_inventory() -> GeneratedInventory {
    let report = generated_file("host_capability_inventory.txt");
    assert_eq!(
        report.lines().next(),
        Some(
            "Host capability inventory: 242 structs, 795 fields, 438 callback fields (360 required, 78 optional), 304 signature families"
        )
    );
    let mut capabilities = Vec::<GeneratedCapability>::new();
    let mut families = BTreeMap::new();
    for raw_line in report.lines().skip(1) {
        let line = raw_line.trim_start();
        let parts: Vec<&str> = line.split('|').collect();
        match parts.first().copied() {
            Some("struct") => {
                assert_eq!(parts.len(), 8, "malformed generated struct row: {line}");
                capabilities.push(GeneratedCapability {
                    crate_name: parts[1].to_string(),
                    source: parts[2].to_string(),
                    name: parts[3].to_string(),
                    rust_public: parse_key_value(parts[4], "rust_public="),
                    ffi_constructor: parse_key_value(parts[5], "ffi_constructor="),
                    declared_fields: parse_key_value(parts[6], "fields="),
                    declared_callbacks: parse_key_value(parts[7], "callbacks="),
                    fields: Vec::new(),
                });
            }
            Some("field") => {
                let capability = capabilities.last_mut().expect("field before struct");
                assert!(
                    parts.len() == 4 || parts.len() == 5,
                    "malformed field row: {line}"
                );
                let callback = parts[2] == "required-callback" || parts[2] == "optional-callback";
                assert_eq!(parts.len(), if callback { 5 } else { 4 });
                capability.fields.push(GeneratedField {
                    name: parts[1].to_string(),
                    kind: parts[2].to_string(),
                    signature: callback.then(|| parts[3].to_string()),
                    ty: parts[if callback { 4 } else { 3 }].to_string(),
                    decision: None,
                });
            }
            Some("decision") => {
                assert_eq!(parts.len(), 4, "malformed decision row: {line}");
                let field = capabilities
                    .last_mut()
                    .expect("decision before struct")
                    .fields
                    .last_mut()
                    .expect("decision before field");
                assert_eq!(
                    parts[1], field.name,
                    "decision must be adjacent to its field"
                );
                assert!(
                    field.decision.is_none(),
                    "duplicate decision for {}",
                    field.name
                );
                assert!(!parts[3].is_empty(), "decision rationale must be named");
                field.decision = Some((parts[2].to_string(), parts[3].to_string()));
            }
            Some("signature") => {
                assert_eq!(parts.len(), 3, "malformed signature row: {line}");
                assert!(
                    families
                        .insert(canonical_signature(parts[2]), parts[1].parse().unwrap())
                        .is_none(),
                    "duplicate signature family {}",
                    parts[2]
                );
            }
            Some(other) => panic!("unknown generated inventory row {other:?}: {line}"),
            None => {}
        }
    }
    return GeneratedInventory {
        capabilities,
        families,
    };
}

fn compact_tokens(value: &str) -> String {
    return value
        .chars()
        .filter(|value| !value.is_whitespace())
        .collect::<String>()
        .replace(",)", ")")
        .replace(",>", ">");
}

fn canonical_signature(value: &str) -> String {
    let mut value = compact_tokens(value).replace("Fn(", "fn(");
    if !value.contains("->") {
        value.push_str("->()");
    }
    return value;
}

fn capability_key(crate_name: &str, name: &str) -> String {
    return format!("{crate_name}|{name}");
}

#[test]
fn generated_inventory_is_exhaustive_and_every_decision_is_reasoned() {
    let source = source_inventory();
    let generated = parse_generated_inventory();
    assert_eq!(generated.capabilities.len(), source.len());

    let generated_by_key: BTreeMap<String, &GeneratedCapability> = generated
        .capabilities
        .iter()
        .map(|capability| {
            (
                capability_key(&capability.crate_name, &capability.name),
                capability,
            )
        })
        .collect();
    assert_eq!(generated_by_key.len(), generated.capabilities.len());

    for expected in &source {
        let key = capability_key(&expected.crate_name, &expected.name);
        let actual = generated_by_key
            .get(&key)
            .unwrap_or_else(|| panic!("missing generated inventory struct {key}"));
        assert_eq!(actual.source, expected.source.trim_start_matches("crates/"));
        assert_eq!(actual.rust_public, expected.root_public);
        assert_eq!(actual.declared_fields, expected.fields.len());
        assert_eq!(actual.fields.len(), expected.fields.len());
        assert_eq!(
            actual.declared_callbacks,
            expected
                .fields
                .iter()
                .filter(|field| field.callback.is_some())
                .count()
        );
        assert!(!actual.ffi_constructor || actual.rust_public);

        for (field_index, (expected_field, actual_field)) in
            expected.fields.iter().zip(&actual.fields).enumerate()
        {
            assert_eq!(
                actual_field.name, expected_field.name,
                "{key} field {field_index} declaration order drifted"
            );
            assert_eq!(
                compact_tokens(&actual_field.ty),
                compact_tokens(&expected_field.ty)
            );
            if let Some(callback) = &expected_field.callback {
                assert_eq!(
                    actual_field.kind,
                    if callback.optional {
                        "optional-callback"
                    } else {
                        "required-callback"
                    }
                );
                assert_eq!(
                    canonical_signature(actual_field.signature.as_ref().unwrap()),
                    canonical_signature(&callback.signature),
                    "{key}.{} signature drifted",
                    expected_field.name
                );
            } else {
                assert_eq!(actual_field.kind, "data");
                assert!(actual_field.signature.is_none());
            }
            let (support, rationale) = actual_field.decision.as_ref().unwrap_or_else(|| {
                panic!("{key}.{} lacks a mapping decision", expected_field.name)
            });
            assert!(!rationale.is_empty());
            assert_eq!(
                support,
                if actual.ffi_constructor {
                    "supported"
                } else {
                    "unsupported"
                },
                "{key}.{} disagrees with its constructor roll-up",
                expected_field.name
            );
        }
    }

    let expected_families: BTreeMap<String, usize> = source
        .iter()
        .flat_map(|capability| &capability.fields)
        .filter_map(|field| field.callback.as_ref())
        .fold(BTreeMap::new(), |mut out, callback| {
            *out.entry(canonical_signature(&callback.signature))
                .or_default() += 1;
            out
        });
    assert_eq!(generated.families, expected_families);

    let priority: BTreeSet<&str> = PRIORITY_CAPABILITIES
        .iter()
        .map(|(_, name, _)| *name)
        .collect();
    for name in priority {
        let capability = generated
            .capabilities
            .iter()
            .find(|capability| capability.name == name)
            .unwrap();
        assert!(
            capability.ffi_constructor,
            "priority constructor missing for {name}"
        );
    }
}

fn snake_case(name: &str) -> String {
    let chars: Vec<char> = name.chars().collect();
    let mut out = String::new();
    for (index, value) in chars.iter().copied().enumerate() {
        if value.is_ascii_uppercase() {
            let previous_lower = index > 0 && chars[index - 1].is_ascii_lowercase();
            if previous_lower {
                out.push('_');
            }
            out.push(value.to_ascii_lowercase());
        } else {
            out.push(value);
        }
    }
    return out;
}

fn occurrence_count(text: &str, needle: &str) -> usize {
    return text.match_indices(needle).count();
}

fn generated_function_block<'a>(wrappers: &'a str, symbol: &str) -> &'a str {
    let marker = format!("pub unsafe extern \"C\" fn {symbol}(");
    let start = wrappers
        .find(&marker)
        .unwrap_or_else(|| panic!("missing generated Rust symbol {symbol}"));
    let end = wrappers[start + marker.len()..]
        .find("\n#[unsafe(no_mangle)]")
        .map(|offset| start + marker.len() + offset)
        .unwrap_or(wrappers.len());
    return &wrappers[start..end];
}

#[test]
fn constructor_free_c_and_hashlink_surfaces_are_exact_and_owned() {
    let inventory = parse_generated_inventory();
    let wrappers = generated_file("ffi_generated.rs");
    let header = generated_file("flight_ffi.h");
    let shim = generated_file("flight_hl.c");
    let stats = generated_file("ffi_stats.txt");
    let context_contract = "the context value identifies one provider across capability constructors and is retained as an integer-backed shared carrier";
    let distinct_context_contract = "use distinct stable values for distinct providers";
    let cloned_context_contract = "must remain valid and thread-safe until both the matching capability free and every sdk value that retained a clone are released";

    let string_create = generated_function_block(&wrappers, "flight_create_string");
    assert!(string_create.contains("std::ffi::CStr::from_ptr(value)"));
    assert!(string_create.contains("if value.to_str().is_err()"));
    assert!(string_create.contains("value.to_owned().into_raw()"));
    assert_eq!(
        occurrence_count(&header, "char * flight_create_string(const char * arg0);"),
        1
    );
    assert!(header.contains(
        "Copies a borrowed, NUL-terminated UTF-8 string into a Rust-owned callback-return carrier. NULL or invalid UTF-8 returns NULL."
    ));
    assert!(header.contains("Caller owns the return value; call flight_free_string when done."));
    assert_eq!(
        occurrence_count(&shim, "DEFINE_PRIM(_BYTES, flight_create_string, _BYTES);"),
        1
    );

    for capability in inventory
        .capabilities
        .iter()
        .filter(|capability| capability.ffi_constructor)
    {
        let stem = snake_case(&capability.name);
        let create = format!("flight_create_{stem}");
        let free = format!("flight_free_{stem}");
        let create_marker = format!("pub unsafe extern \"C\" fn {create}(");
        let free_marker = format!("pub unsafe extern \"C\" fn {free}(");
        assert_eq!(
            occurrence_count(&wrappers, &create_marker),
            1,
            "duplicate {create}"
        );
        assert_eq!(
            occurrence_count(&wrappers, &free_marker),
            1,
            "duplicate {free}"
        );

        let create_block = generated_function_block(&wrappers, &create);
        assert!(create_block.starts_with(&format!("pub unsafe extern \"C\" fn {create}(context:")));
        assert!(create_block.contains("let context = context as usize;"));
        assert!(create_block.contains(&format!(
            "Box::into_raw(Box::new(flight_sdk::{} {{",
            capability.name
        )));
        assert!(!create_block.contains("Box::from_raw(context)"));
        assert!(!create_block.contains("drop(context)"));
        if capability
            .fields
            .iter()
            .any(|field| field.name == "provider" && field.kind == "data")
        {
            assert!(
                create_block.contains("provider: ffi_host_provider(context)"),
                "{create} must intern provider identity by context value"
            );
            assert!(!create_block.contains("provider: std::sync::Arc::new(context)"));
        }

        let return_marker = format!(") -> *mut flight_sdk::{}", capability.name);
        let signature_end = create_block
            .find(&return_marker)
            .expect("constructor return type");
        let signature = &create_block[..signature_end];
        let mut prior = 0;
        for field in capability
            .fields
            .iter()
            .filter(|field| field.kind != "data")
        {
            let parameter = format!("{}_fn", field.name);
            let position = signature
                .find(&parameter)
                .unwrap_or_else(|| panic!("{create} omits callback parameter {parameter}"));
            assert!(
                position > prior,
                "{create} callback order drifted at {parameter}"
            );
            prior = position;
            if field.kind == "required-callback" {
                assert!(
                    create_block.contains(&format!(
                        "let Some({0}_callback) = {0}_fn else {{ return std::ptr::null_mut(); }};",
                        field.name
                    )),
                    "{create} must reject required NULL {} before allocation",
                    field.name
                );
            } else {
                assert!(
                    create_block.contains(&format!("{}_fn.map(|callback|", field.name)),
                    "{create} must map optional NULL {} to None",
                    field.name
                );
            }
        }

        let free_block = generated_function_block(&wrappers, &free);
        assert!(free_block.contains("if !ptr.is_null()"));
        assert!(free_block.contains("drop(Box::from_raw(ptr))"));

        let prototype_lines: Vec<&str> = header
            .lines()
            .filter(|line| line.starts_with(&format!("void * {create}(")))
            .collect();
        assert_eq!(
            prototype_lines.len(),
            1,
            "strict-C prototype count for {create}"
        );
        assert!(
            prototype_lines[0].contains("(void * arg0"),
            "context must be first for {create}"
        );
        assert_eq!(
            header
                .lines()
                .filter(|line| line.starts_with(&format!("void {free}(")))
                .count(),
            1
        );
        let prototype_offset = header.find(prototype_lines[0]).unwrap();
        let comment_prefix = &header[..prototype_offset];
        let comment_start = comment_prefix
            .rfind("/* The context value identifies")
            .unwrap_or_else(|| panic!("{create} lacks adjacent context contract"));
        let comments = &comment_prefix[comment_start..];
        assert!(comments.to_ascii_lowercase().contains(context_contract));
        assert!(
            comments
                .to_ascii_lowercase()
                .contains(distinct_context_contract),
            "{create} must document distinct stable provider contexts"
        );
        assert!(
            comments
                .to_ascii_lowercase()
                .contains(cloned_context_contract),
            "{create} must document context lifetime through retained SDK clones"
        );
        assert!(comments.contains(&format!("call {free} when done")));
        assert!(comments.contains(
            "Produce owned string returns with flight_create_string and disposer returns with flight_create_disposer."
        ));
        let mut prior_comment = 0;
        for field in capability
            .fields
            .iter()
            .filter(|field| field.kind != "data")
        {
            let rationale = &field.decision.as_ref().unwrap().1;
            let comment = format!("Callback field {} maps as {rationale}.", field.name);
            let position = comments
                .find(&comment)
                .unwrap_or_else(|| panic!("{create} C contract omits {comment}"));
            assert!(
                position >= prior_comment,
                "{create} C callback comments drifted in order"
            );
            prior_comment = position;
        }

        let callback_count = capability.declared_callbacks;
        let hl_args = std::iter::repeat_n("_BYTES", callback_count + 1)
            .collect::<Vec<_>>()
            .join(" ");
        let hl_create = format!("DEFINE_PRIM(_BYTES, {create}, {hl_args});");
        assert_eq!(
            occurrence_count(&shim, &hl_create),
            1,
            "HashLink arity for {create}"
        );
        assert_eq!(
            occurrence_count(&shim, &format!("DEFINE_PRIM(_VOID, {free}, _BYTES);")),
            1,
            "HashLink free for {free}"
        );
        assert!(
            !stats.contains(&format!("public skip: {create}"))
                && !stats.contains(&format!("public skip: {free}")),
            "Task S symbol leaked into the public skip ledger"
        );
    }
}

#[test]
fn mapping_report_is_pinned_to_the_frozen_inventory() {
    let report = include_str!("task_s_capability_mapping.md");
    for evidence in [
        "242 structs",
        "795 fields",
        "438 callable fields",
        "360 required",
        "78 optional",
        "304 canonical signature families",
        "29 callback-bearing leaf structs",
        "76 callbacks",
    ] {
        assert!(
            report.contains(evidence),
            "mapping report omitted {evidence}"
        );
    }
}
