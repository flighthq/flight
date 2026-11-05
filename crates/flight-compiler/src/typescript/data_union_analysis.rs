use std::collections::{BTreeMap, BTreeSet, HashSet};
use std::fmt::Write;

use syn::Pat;

use crate::{CompileError, compile_error};

use super::{
    DataUnionMatchArm, DataUnionPattern, DataUnionPatternAnalysis, DataUnionPatternTest,
    HoistedMatchAction, InferredTaggedDataUnionMatchArm, OptionWrappedInferredDataUnionMatchArm,
    ReservedKeyDataUnionPattern, ReservedKeyDataUnionPatternAnalysis, RuntimeCategory,
    TaggedDataUnionMatchArm, TaggedDataUnionPattern, TaggedDataUnionPatternAnalysis,
    data_union_unit, data_union_variant_categories, emit_expression, emit_hoisted_match_arm_body,
    emit_match_scrutinee, emit_member, is_data_union_variant, is_tagged_data_union_variant,
    js_string_literal, lexical_pattern_context, lower_camel_from_upper_camel, option_absent_value,
    path_owner_and_member, reserved_key_data_union_variant_keys,
    reserved_key_data_union_variant_type, reserved_key_data_union_variants,
    runtime_categories_predicate, runtime_category_predicate, snake_to_lower_camel,
    tagged_data_union_variants, write_indent,
};

pub(super) fn tagged_data_union_field_binding(
    pattern: &Pat,
) -> Result<Option<String>, CompileError> {
    return match pattern {
        Pat::Ident(identifier) if identifier.subpat.is_none() => {
            Ok(Some(snake_to_lower_camel(&identifier.ident.to_string())))
        }
        Pat::Reference(reference) => tagged_data_union_field_binding(&reference.pat),
        Pat::Wild(_) => Ok(None),
        _ => Err(compile_error(
            "tagged data union field pattern must be an identifier or `_`",
        )),
    };
}

pub(super) fn analyze_tagged_data_union_pattern(
    pattern: &Pat,
    entities: &HashSet<String>,
) -> Result<TaggedDataUnionPatternAnalysis, CompileError> {
    return match pattern {
        Pat::Ident(identifier) if identifier.subpat.is_none() => {
            let name = identifier.ident.to_string();
            if name == "None" {
                return Ok(TaggedDataUnionPatternAnalysis::Ordinary);
            }
            Ok(TaggedDataUnionPatternAnalysis::CatchAll(Some(
                snake_to_lower_camel(&name),
            )))
        }
        Pat::Or(or_pattern) => {
            let mut variants = Vec::new();
            for pattern in &or_pattern.cases {
                match analyze_tagged_data_union_pattern(pattern, entities)? {
                    TaggedDataUnionPatternAnalysis::Variants(patterns) => variants.extend(patterns),
                    TaggedDataUnionPatternAnalysis::CatchAll(_) => {
                        return Ok(TaggedDataUnionPatternAnalysis::Ordinary);
                    }
                    TaggedDataUnionPatternAnalysis::Ordinary => {
                        return Ok(TaggedDataUnionPatternAnalysis::Ordinary);
                    }
                }
            }
            Ok(TaggedDataUnionPatternAnalysis::Variants(variants))
        }
        Pat::Paren(paren) => analyze_tagged_data_union_pattern(&paren.pat, entities),
        Pat::Path(path) => {
            let Some((owner, variant)) = path_owner_and_member(&path.path) else {
                return Ok(TaggedDataUnionPatternAnalysis::Ordinary);
            };
            if !is_tagged_data_union_variant(entities, &owner, &variant) {
                return Ok(TaggedDataUnionPatternAnalysis::Ordinary);
            }
            if !data_union_unit(entities, &owner, &variant) {
                return Err(compile_error(format!(
                    "tagged data union payload variant `{owner}::{variant}` needs a field pattern"
                )));
            }
            Ok(TaggedDataUnionPatternAnalysis::Variants(vec![
                TaggedDataUnionPattern {
                    bindings: BTreeMap::new(),
                    owner,
                    variant,
                },
            ]))
        }
        Pat::Reference(reference) => analyze_tagged_data_union_pattern(&reference.pat, entities),
        Pat::Struct(pattern) => {
            let Some((owner, variant)) = path_owner_and_member(&pattern.path) else {
                return Ok(TaggedDataUnionPatternAnalysis::Ordinary);
            };
            if !is_tagged_data_union_variant(entities, &owner, &variant) {
                return Ok(TaggedDataUnionPatternAnalysis::Ordinary);
            }
            if data_union_unit(entities, &owner, &variant) {
                return Err(compile_error(format!(
                    "tagged data union unit variant `{owner}::{variant}` cannot declare field patterns"
                )));
            }
            let mut bindings = BTreeMap::new();
            for field in &pattern.fields {
                let Some(binding) = tagged_data_union_field_binding(&field.pat)? else {
                    continue;
                };
                let source = emit_member(&field.member);
                if bindings.insert(binding.clone(), source).is_some() {
                    return Err(compile_error(format!(
                        "tagged data union pattern binds `{binding}` more than once"
                    )));
                }
            }
            Ok(TaggedDataUnionPatternAnalysis::Variants(vec![
                TaggedDataUnionPattern {
                    bindings,
                    owner,
                    variant,
                },
            ]))
        }
        Pat::TupleStruct(pattern) => {
            let Some((owner, variant)) = path_owner_and_member(&pattern.path) else {
                return Ok(TaggedDataUnionPatternAnalysis::Ordinary);
            };
            if !is_tagged_data_union_variant(entities, &owner, &variant) {
                return Ok(TaggedDataUnionPatternAnalysis::Ordinary);
            }
            if data_union_unit(entities, &owner, &variant) {
                return Err(compile_error(format!(
                    "tagged data union unit variant `{owner}::{variant}` cannot declare field patterns"
                )));
            }
            let mut bindings = BTreeMap::new();
            if pattern.elems.len() == 1 {
                if let Some(binding) = tagged_data_union_field_binding(&pattern.elems[0])? {
                    bindings.insert(binding, "@self".to_string());
                }
            }
            Ok(TaggedDataUnionPatternAnalysis::Variants(vec![
                TaggedDataUnionPattern {
                    bindings,
                    owner,
                    variant,
                },
            ]))
        }
        Pat::Wild(_) => Ok(TaggedDataUnionPatternAnalysis::CatchAll(None)),
        _ => Ok(TaggedDataUnionPatternAnalysis::Ordinary),
    };
}

pub(super) fn analyze_tagged_data_union_match(
    arms: &[syn::Arm],
    entities: &HashSet<String>,
) -> Result<Option<Vec<TaggedDataUnionMatchArm>>, CompileError> {
    let analyses = arms
        .iter()
        .map(|arm| analyze_tagged_data_union_pattern(&arm.pat, entities))
        .collect::<Result<Vec<_>, _>>()?;
    if !analyses
        .iter()
        .any(|analysis| matches!(analysis, TaggedDataUnionPatternAnalysis::Variants(_)))
    {
        return Ok(None);
    }
    let mut owner = None;
    let mut handled = BTreeMap::<String, String>::new();
    let mut output = Vec::new();
    let mut has_catch_all = false;
    for (arm_index, analysis) in analyses.into_iter().enumerate() {
        match analysis {
            TaggedDataUnionPatternAnalysis::CatchAll(binding) => {
                if arm_index + 1 != arms.len() {
                    return Err(compile_error(
                        "tagged data union catch-all match arm must be last",
                    ));
                }
                output.push(TaggedDataUnionMatchArm {
                    catch_all_binding: binding,
                    otherwise: true,
                    variants: Vec::new(),
                });
                has_catch_all = true;
            }
            TaggedDataUnionPatternAnalysis::Ordinary => {
                return Err(compile_error(
                    "tagged data union match cannot mix data union and ordinary patterns",
                ));
            }
            TaggedDataUnionPatternAnalysis::Variants(patterns) => {
                let expected_bindings = patterns
                    .first()
                    .map(|pattern| pattern.bindings.keys().cloned().collect::<BTreeSet<_>>())
                    .unwrap_or_default();
                for pattern in &patterns {
                    if let Some(expected) = &owner {
                        if expected != &pattern.owner {
                            return Err(compile_error(format!(
                                "tagged data union match cannot mix `{expected}` and `{}` variants",
                                pattern.owner
                            )));
                        }
                    } else {
                        owner = Some(pattern.owner.clone());
                    }
                    let bindings = pattern.bindings.keys().cloned().collect::<BTreeSet<_>>();
                    if bindings != expected_bindings {
                        return Err(compile_error(
                            "tagged data union alternatives must bind the same field names",
                        ));
                    }
                    let label = format!("{}::{}", pattern.owner, pattern.variant);
                    if let Some(previous) = handled.insert(pattern.variant.clone(), label.clone()) {
                        return Err(compile_error(format!(
                            "tagged data union match arm `{label}` is unreachable after `{previous}`"
                        )));
                    }
                }
                output.push(TaggedDataUnionMatchArm {
                    catch_all_binding: None,
                    otherwise: false,
                    variants: patterns,
                });
            }
        }
    }
    if !has_catch_all {
        let owner = owner.expect("tagged data union match has a tagged variant");
        let missing = tagged_data_union_variants(entities, &owner)
            .into_iter()
            .filter(|variant| !handled.contains_key(variant))
            .collect::<Vec<_>>();
        if !missing.is_empty() {
            return Err(compile_error(format!(
                "tagged data union match is not exhaustive; missing {}",
                missing
                    .iter()
                    .map(|variant| format!("`{owner}::{variant}`"))
                    .collect::<Vec<_>>()
                    .join(", ")
            )));
        }
        output
            .last_mut()
            .expect("tagged data union match has an arm")
            .otherwise = true;
    }
    return Ok(Some(output));
}

pub(super) fn analyze_reserved_key_data_union_pattern(
    pattern: &Pat,
    entities: &HashSet<String>,
) -> Result<ReservedKeyDataUnionPatternAnalysis, CompileError> {
    return match pattern {
        Pat::Ident(identifier) if identifier.subpat.is_none() => {
            let name = identifier.ident.to_string();
            if name == "None" {
                return Ok(ReservedKeyDataUnionPatternAnalysis::Ordinary);
            }
            Ok(ReservedKeyDataUnionPatternAnalysis::CatchAll(Some(
                snake_to_lower_camel(&name),
            )))
        }
        Pat::Or(or_pattern) => {
            let mut variants = Vec::new();
            for pattern in &or_pattern.cases {
                match analyze_reserved_key_data_union_pattern(pattern, entities)? {
                    ReservedKeyDataUnionPatternAnalysis::Variants(patterns) => {
                        variants.extend(patterns);
                    }
                    ReservedKeyDataUnionPatternAnalysis::CatchAll(_) => {
                        return Ok(ReservedKeyDataUnionPatternAnalysis::Ordinary);
                    }
                    ReservedKeyDataUnionPatternAnalysis::Ordinary => {
                        return Ok(ReservedKeyDataUnionPatternAnalysis::Ordinary);
                    }
                }
            }
            Ok(ReservedKeyDataUnionPatternAnalysis::Variants(variants))
        }
        Pat::Paren(paren) => analyze_reserved_key_data_union_pattern(&paren.pat, entities),
        Pat::Reference(reference) => {
            analyze_reserved_key_data_union_pattern(&reference.pat, entities)
        }
        Pat::TupleStruct(pattern) => {
            let Some((owner, variant)) = path_owner_and_member(&pattern.path) else {
                return Ok(ReservedKeyDataUnionPatternAnalysis::Ordinary);
            };
            let Some(keys) = reserved_key_data_union_variant_keys(entities, &owner, &variant)
            else {
                return Ok(ReservedKeyDataUnionPatternAnalysis::Ordinary);
            };
            let payload_type = reserved_key_data_union_variant_type(entities, &owner, &variant)
                .expect("reserved-key data union variants carry their payload type");
            if pattern.elems.len() != 1 {
                return Err(compile_error(format!(
                    "reserved-key data union pattern `{owner}::{variant}` expects exactly one payload"
                )));
            }
            Ok(ReservedKeyDataUnionPatternAnalysis::Variants(vec![
                ReservedKeyDataUnionPattern {
                    binding: data_union_payload_binding(&pattern.elems[0])?,
                    fallback: keys.is_empty(),
                    keys,
                    owner,
                    payload_type,
                    variant,
                },
            ]))
        }
        Pat::Wild(_) => Ok(ReservedKeyDataUnionPatternAnalysis::CatchAll(None)),
        _ => Ok(ReservedKeyDataUnionPatternAnalysis::Ordinary),
    };
}

pub(super) fn reserved_key_data_union_keys_predicate(
    keys: &BTreeSet<String>,
    value: &str,
) -> String {
    return keys
        .iter()
        .map(|key| format!("Object.hasOwn({value}, {})", js_string_literal(key)))
        .collect::<Vec<_>>()
        .join(" || ");
}

pub(super) fn reserved_key_data_union_predicate(
    variants: &[(BTreeSet<String>, bool)],
    value: &str,
) -> String {
    let predicates = variants
        .iter()
        .map(|(keys, fallback)| {
            let predicate = reserved_key_data_union_keys_predicate(keys, value);
            if *fallback {
                format!("!({predicate})")
            } else {
                predicate
            }
        })
        .collect::<Vec<_>>();
    return if predicates.len() == 1 {
        predicates.into_iter().next().unwrap_or_default()
    } else {
        format!("({})", predicates.join(" || "))
    };
}

pub(super) fn analyze_reserved_key_data_union_match(
    arms: &[syn::Arm],
    entities: &HashSet<String>,
) -> Result<Option<Vec<DataUnionMatchArm>>, CompileError> {
    let analyses = arms
        .iter()
        .map(|arm| analyze_reserved_key_data_union_pattern(&arm.pat, entities))
        .collect::<Result<Vec<_>, _>>()?;
    if !analyses
        .iter()
        .any(|analysis| matches!(analysis, ReservedKeyDataUnionPatternAnalysis::Variants(_)))
    {
        return Ok(None);
    }
    let mut owner = None;
    let mut handled = BTreeMap::<String, String>::new();
    let mut output = Vec::new();
    let mut has_catch_all = false;
    for (arm_index, analysis) in analyses.into_iter().enumerate() {
        match analysis {
            ReservedKeyDataUnionPatternAnalysis::CatchAll(binding) => {
                if arm_index + 1 != arms.len() {
                    return Err(compile_error(
                        "reserved-key data union catch-all match arm must be last",
                    ));
                }
                output.push(DataUnionMatchArm {
                    binding,
                    binding_type: None,
                    categories: BTreeSet::new(),
                    catch_all: true,
                    reserved_key_variants: Vec::new(),
                });
                has_catch_all = true;
            }
            ReservedKeyDataUnionPatternAnalysis::Ordinary => {
                return Err(compile_error(
                    "reserved-key data union match cannot mix data union and ordinary patterns",
                ));
            }
            ReservedKeyDataUnionPatternAnalysis::Variants(patterns) => {
                let mut binding = None::<Option<String>>;
                let mut binding_types = BTreeSet::new();
                let mut variants = Vec::new();
                for pattern in patterns {
                    if let Some(expected) = &owner {
                        if expected != &pattern.owner {
                            return Err(compile_error(format!(
                                "reserved-key data union match cannot mix `{expected}` and `{}` variants",
                                pattern.owner
                            )));
                        }
                    } else {
                        owner = Some(pattern.owner.clone());
                    }
                    if binding
                        .as_ref()
                        .is_some_and(|binding| binding != &pattern.binding)
                    {
                        return Err(compile_error(
                            "reserved-key data union alternatives must bind the same payload name",
                        ));
                    }
                    binding.get_or_insert(pattern.binding);
                    binding_types.insert(pattern.payload_type);
                    let label = format!("{}::{}", pattern.owner, pattern.variant);
                    if let Some(previous) = handled.insert(pattern.variant, label.clone()) {
                        return Err(compile_error(format!(
                            "reserved-key data union match arm `{label}` is unreachable after `{previous}`"
                        )));
                    }
                    let discriminator_keys = if pattern.fallback {
                        reserved_key_data_union_variants(entities, &pattern.owner)
                            .into_values()
                            .find(|keys| !keys.is_empty())
                            .expect("validated reserved-key data union has discriminator keys")
                    } else {
                        pattern.keys
                    };
                    variants.push((discriminator_keys, pattern.fallback));
                }
                let binding = binding.flatten();
                output.push(DataUnionMatchArm {
                    binding_type: binding
                        .as_ref()
                        .map(|_| binding_types.into_iter().collect::<Vec<_>>().join(" | ")),
                    binding,
                    categories: BTreeSet::new(),
                    catch_all: false,
                    reserved_key_variants: variants,
                });
            }
        }
    }
    if !has_catch_all {
        let owner = owner.expect("reserved-key data union match has a variant");
        let missing = reserved_key_data_union_variants(entities, &owner)
            .into_keys()
            .filter(|variant| !handled.contains_key(variant))
            .collect::<Vec<_>>();
        if !missing.is_empty() {
            return Err(compile_error(format!(
                "reserved-key data union match is not exhaustive; missing {}",
                missing
                    .iter()
                    .map(|variant| format!("`{owner}::{variant}`"))
                    .collect::<Vec<_>>()
                    .join(", ")
            )));
        }
        output
            .last_mut()
            .expect("reserved-key data union match has an arm")
            .catch_all = true;
    }
    return Ok(Some(output));
}

// Lowers one data union pattern applied to `value` into a runtime predicate (`None` for a
// catch-all) and the `(binding, expression)` pairs it introduces; `None` for an ordinary pattern.
pub(super) fn data_union_pattern_test(
    pattern: &Pat,
    value: &str,
    entities: &HashSet<String>,
) -> Result<Option<DataUnionPatternTest>, CompileError> {
    if let ReservedKeyDataUnionPatternAnalysis::Variants(patterns) =
        analyze_reserved_key_data_union_pattern(pattern, entities)?
    {
        let binding = patterns[0].binding.clone();
        if patterns.iter().any(|pattern| pattern.binding != binding) {
            return Err(compile_error(
                "reserved-key data union alternatives must bind the same payload name",
            ));
        }
        let owner = &patterns[0].owner;
        if patterns.iter().any(|pattern| &pattern.owner != owner) {
            return Err(compile_error(
                "reserved-key data union alternatives cannot mix enum owners",
            ));
        }
        let payload_type = patterns
            .iter()
            .map(|pattern| pattern.payload_type.clone())
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect::<Vec<_>>()
            .join(" | ");
        let variants = patterns
            .into_iter()
            .map(|pattern| {
                let keys = if pattern.fallback {
                    reserved_key_data_union_variants(entities, &pattern.owner)
                        .into_values()
                        .find(|keys| !keys.is_empty())
                        .expect("validated reserved-key data union has discriminator keys")
                } else {
                    pattern.keys
                };
                (keys, pattern.fallback)
            })
            .collect::<Vec<_>>();
        return Ok(Some(DataUnionPatternTest {
            bindings: binding
                .map(|binding| (binding, format!("({value} as {payload_type})")))
                .into_iter()
                .collect(),
            predicate: Some(reserved_key_data_union_predicate(&variants, value)),
        }));
    }
    if let TaggedDataUnionPatternAnalysis::Variants(variants) =
        analyze_tagged_data_union_pattern(pattern, entities)?
    {
        let expected = variants[0].bindings.keys().collect::<BTreeSet<_>>();
        if variants
            .iter()
            .any(|variant| variant.bindings.keys().collect::<BTreeSet<_>>() != expected)
        {
            return Err(compile_error(
                "tagged data union alternatives must bind the same field names",
            ));
        }
        let predicate = tagged_data_union_predicate(&variants, value);
        return Ok(Some(DataUnionPatternTest {
            bindings: tagged_data_union_bindings(&variants, value),
            predicate: Some(if variants.len() > 1 {
                format!("({predicate})")
            } else {
                predicate
            }),
        }));
    }
    return match analyze_data_union_pattern(pattern, entities)? {
        DataUnionPatternAnalysis::CatchAll(binding) => Ok(Some(DataUnionPatternTest {
            bindings: binding
                .map(|binding| (binding, value.to_string()))
                .into_iter()
                .collect(),
            predicate: None,
        })),
        DataUnionPatternAnalysis::Ordinary => {
            if let Some(test) = inferred_data_union_pattern_test(pattern, value, entities) {
                return Ok(Some(test));
            }
            Ok(None)
        }
        DataUnionPatternAnalysis::Variants(patterns) => {
            let binding = patterns[0].binding.clone();
            if patterns.iter().any(|pattern| pattern.binding != binding) {
                return Err(compile_error(
                    "transparent data union alternatives must bind the same payload name",
                ));
            }
            let categories = patterns
                .into_iter()
                .flat_map(|pattern| pattern.categories)
                .collect::<BTreeSet<_>>();
            let predicate = match categories.iter().collect::<Vec<_>>().as_slice() {
                [category] => runtime_category_predicate(**category, value),
                _ => format!("({})", runtime_categories_predicate(&categories, value)),
            };
            Ok(Some(DataUnionPatternTest {
                bindings: binding
                    .map(|binding| (binding, value.to_string()))
                    .into_iter()
                    .collect(),
                predicate: Some(predicate),
            }))
        }
    };
}

pub(super) fn inferred_data_union_pattern_test(
    pattern: &Pat,
    value: &str,
    entities: &HashSet<String>,
) -> Option<DataUnionPatternTest> {
    match pattern {
        Pat::TupleStruct(ts) => {
            let (owner, variant) = path_owner_and_member(&ts.path)?;
            if is_data_union_variant(entities, &owner, &variant)
                || is_tagged_data_union_variant(entities, &owner, &variant)
            {
                return None;
            }
            if ts.elems.len() != 1 {
                return None;
            }
            let binding = match &ts.elems[0] {
                Pat::Ident(id) if id.subpat.is_none() => {
                    Some(snake_to_lower_camel(&id.ident.to_string()))
                }
                Pat::Wild(_) => None,
                Pat::Reference(r) => match r.pat.as_ref() {
                    Pat::Ident(id) if id.subpat.is_none() => {
                        Some(snake_to_lower_camel(&id.ident.to_string()))
                    }
                    Pat::Wild(_) => None,
                    _ => return None,
                },
                Pat::Struct(inner_struct) => {
                    let mut bindings = Vec::new();
                    for field in &inner_struct.fields {
                        let source = snake_to_lower_camel(&emit_member(&field.member));
                        let binding_name = match field.pat.as_ref() {
                            Pat::Ident(id) if id.subpat.is_none() => {
                                snake_to_lower_camel(&id.ident.to_string())
                            }
                            Pat::Wild(_) => continue,
                            Pat::Reference(r) => match r.pat.as_ref() {
                                Pat::Ident(id) if id.subpat.is_none() => {
                                    snake_to_lower_camel(&id.ident.to_string())
                                }
                                Pat::Wild(_) => continue,
                                _ => return None,
                            },
                            _ => return None,
                        };
                        bindings.push((binding_name, format!("{value}.{source}")));
                    }
                    let kind = lower_camel_from_upper_camel(&variant);
                    return Some(DataUnionPatternTest {
                        bindings,
                        predicate: Some(format!("{value}.kind === {}", js_string_literal(&kind))),
                    });
                }
                _ => return None,
            };
            let kind = lower_camel_from_upper_camel(&variant);
            Some(DataUnionPatternTest {
                bindings: binding
                    .map(|b| (b, value.to_string()))
                    .into_iter()
                    .collect(),
                predicate: Some(format!("{value}.kind === {}", js_string_literal(&kind))),
            })
        }
        Pat::Struct(s) => {
            let (owner, variant) = path_owner_and_member(&s.path)?;
            if is_data_union_variant(entities, &owner, &variant)
                || is_tagged_data_union_variant(entities, &owner, &variant)
            {
                return None;
            }
            let mut bindings = Vec::new();
            for field in &s.fields {
                let source = snake_to_lower_camel(&emit_member(&field.member));
                let binding_name = match field.pat.as_ref() {
                    Pat::Ident(id) if id.subpat.is_none() => {
                        snake_to_lower_camel(&id.ident.to_string())
                    }
                    Pat::Wild(_) => continue,
                    Pat::Reference(r) => match r.pat.as_ref() {
                        Pat::Ident(id) if id.subpat.is_none() => {
                            snake_to_lower_camel(&id.ident.to_string())
                        }
                        Pat::Wild(_) => continue,
                        _ => return None,
                    },
                    _ => return None,
                };
                bindings.push((binding_name, format!("{value}.{source}")));
            }
            let kind = lower_camel_from_upper_camel(&variant);
            Some(DataUnionPatternTest {
                bindings,
                predicate: Some(format!("{value}.kind === {}", js_string_literal(&kind))),
            })
        }
        Pat::Or(or) => {
            let mut all_bindings = Vec::new();
            let mut predicates = Vec::new();
            for case in &or.cases {
                let test = inferred_data_union_pattern_test(case, value, entities)?;
                all_bindings = test.bindings;
                if let Some(predicate) = test.predicate {
                    predicates.push(predicate);
                }
            }
            if predicates.is_empty() {
                return None;
            }
            Some(DataUnionPatternTest {
                bindings: all_bindings,
                predicate: Some(predicates.join(" || ")),
            })
        }
        _ => None,
    }
}

pub(super) fn tagged_data_union_predicate(
    patterns: &[TaggedDataUnionPattern],
    value: &str,
) -> String {
    return patterns
        .iter()
        .map(|pattern| {
            format!(
                "{value}.kind === {}",
                js_string_literal(&lower_camel_from_upper_camel(&pattern.variant))
            )
        })
        .collect::<Vec<_>>()
        .join(" || ");
}

pub(super) fn tagged_data_union_bindings(
    patterns: &[TaggedDataUnionPattern],
    value: &str,
) -> Vec<(String, String)> {
    let Some(first) = patterns.first() else {
        return Vec::new();
    };
    return first
        .bindings
        .keys()
        .map(|binding| {
            let fields = patterns
                .iter()
                .map(|pattern| {
                    (
                        lower_camel_from_upper_camel(&pattern.variant),
                        pattern
                            .bindings
                            .get(binding)
                            .expect("tagged alternatives have identical binding names"),
                    )
                })
                .collect::<Vec<_>>();
            let field_value = |field: &str| -> String {
                if field == "@self" {
                    value.to_string()
                } else {
                    format!("{value}.{field}")
                }
            };
            let expression = if fields.iter().all(|(_, field)| *field == fields[0].1) {
                field_value(fields[0].1)
            } else {
                let mut expression =
                    field_value(fields.last().expect("tagged match arm has a variant").1);
                for (variant, field) in fields.iter().rev().skip(1) {
                    let fv = field_value(field);
                    expression = format!(
                        "{value}.kind === {} ? {fv} : {expression}",
                        js_string_literal(variant)
                    );
                }
                expression
            };
            (binding.clone(), expression)
        })
        .collect();
}

pub(super) fn data_union_payload_binding(pattern: &Pat) -> Result<Option<String>, CompileError> {
    return match pattern {
        Pat::Ident(identifier) if identifier.subpat.is_none() => {
            Ok(Some(snake_to_lower_camel(&identifier.ident.to_string())))
        }
        Pat::Reference(reference) => data_union_payload_binding(&reference.pat),
        Pat::Rest(_) | Pat::Wild(_) => Ok(None),
        _ => Err(compile_error(
            "transparent data union payload pattern must be an identifier or `_`",
        )),
    };
}

pub(super) fn analyze_data_union_pattern(
    pattern: &Pat,
    entities: &HashSet<String>,
) -> Result<DataUnionPatternAnalysis, CompileError> {
    return match pattern {
        Pat::Ident(identifier) if identifier.subpat.is_none() => {
            let name = identifier.ident.to_string();
            if name == "None" {
                return Ok(DataUnionPatternAnalysis::Ordinary);
            }
            Ok(DataUnionPatternAnalysis::CatchAll(Some(
                snake_to_lower_camel(&name),
            )))
        }
        Pat::Or(or_pattern) => {
            let mut variants = Vec::new();
            for pattern in &or_pattern.cases {
                match analyze_data_union_pattern(pattern, entities)? {
                    DataUnionPatternAnalysis::Variants(patterns) => variants.extend(patterns),
                    DataUnionPatternAnalysis::CatchAll(_) => {
                        return Ok(DataUnionPatternAnalysis::Ordinary);
                    }
                    DataUnionPatternAnalysis::Ordinary => {
                        return Ok(DataUnionPatternAnalysis::Ordinary);
                    }
                }
            }
            Ok(DataUnionPatternAnalysis::Variants(variants))
        }
        Pat::Paren(paren) => analyze_data_union_pattern(&paren.pat, entities),
        Pat::Path(path) => {
            let Some((owner, variant)) = path_owner_and_member(&path.path) else {
                return Ok(DataUnionPatternAnalysis::Ordinary);
            };
            let Some(categories) = data_union_variant_categories(entities, &owner, &variant) else {
                return Ok(DataUnionPatternAnalysis::Ordinary);
            };
            if reserved_key_data_union_variant_keys(entities, &owner, &variant).is_some() {
                return Ok(DataUnionPatternAnalysis::Ordinary);
            }
            if !data_union_unit(entities, &owner, &variant) {
                return Err(compile_error(format!(
                    "transparent data union payload variant `{owner}::{variant}` needs a payload pattern"
                )));
            }
            Ok(DataUnionPatternAnalysis::Variants(vec![DataUnionPattern {
                binding: None,
                categories,
                owner,
                variant,
            }]))
        }
        Pat::Reference(reference) => analyze_data_union_pattern(&reference.pat, entities),
        Pat::TupleStruct(pattern) => {
            let Some((owner, variant)) = path_owner_and_member(&pattern.path) else {
                return Ok(DataUnionPatternAnalysis::Ordinary);
            };
            let Some(categories) = data_union_variant_categories(entities, &owner, &variant) else {
                return Ok(DataUnionPatternAnalysis::Ordinary);
            };
            if reserved_key_data_union_variant_keys(entities, &owner, &variant).is_some() {
                return Ok(DataUnionPatternAnalysis::Ordinary);
            }
            if data_union_unit(entities, &owner, &variant) || pattern.elems.len() != 1 {
                return Err(compile_error(format!(
                    "transparent data union pattern `{owner}::{variant}` expects exactly one payload"
                )));
            }
            Ok(DataUnionPatternAnalysis::Variants(vec![DataUnionPattern {
                binding: data_union_payload_binding(&pattern.elems[0])?,
                categories,
                owner,
                variant,
            }]))
        }
        Pat::Wild(_) => Ok(DataUnionPatternAnalysis::CatchAll(None)),
        _ => Ok(DataUnionPatternAnalysis::Ordinary),
    };
}

pub(super) fn analyze_data_union_match(
    arms: &[syn::Arm],
    entities: &HashSet<String>,
) -> Result<Option<Vec<DataUnionMatchArm>>, CompileError> {
    if let Some(arms) = analyze_reserved_key_data_union_match(arms, entities)? {
        return Ok(Some(arms));
    }
    let analyses = arms
        .iter()
        .map(|arm| analyze_data_union_pattern(&arm.pat, entities))
        .collect::<Result<Vec<_>, _>>()?;
    if !analyses
        .iter()
        .any(|analysis| matches!(analysis, DataUnionPatternAnalysis::Variants(_)))
    {
        return Ok(None);
    }
    let mut owner = None;
    let mut handled = BTreeMap::<RuntimeCategory, String>::new();
    let mut output = Vec::new();
    for (arm_index, analysis) in analyses.into_iter().enumerate() {
        match analysis {
            DataUnionPatternAnalysis::CatchAll(binding) => {
                if arm_index + 1 != arms.len() {
                    return Err(compile_error(
                        "transparent data union catch-all match arm must be last",
                    ));
                }
                output.push(DataUnionMatchArm {
                    binding,
                    binding_type: None,
                    categories: BTreeSet::new(),
                    catch_all: true,
                    reserved_key_variants: Vec::new(),
                });
            }
            DataUnionPatternAnalysis::Ordinary => {
                return Err(compile_error(
                    "transparent data union match cannot mix data union and ordinary patterns",
                ));
            }
            DataUnionPatternAnalysis::Variants(patterns) => {
                let mut categories = BTreeSet::new();
                let mut binding = None::<Option<String>>;
                let mut labels = BTreeMap::<RuntimeCategory, String>::new();
                for pattern in patterns {
                    if let Some(expected) = &owner {
                        if expected != &pattern.owner {
                            return Err(compile_error(format!(
                                "transparent data union match cannot mix `{expected}` and `{}` variants",
                                pattern.owner
                            )));
                        }
                    } else {
                        owner = Some(pattern.owner.clone());
                    }
                    if binding
                        .as_ref()
                        .is_some_and(|binding| binding != &pattern.binding)
                    {
                        return Err(compile_error(
                            "transparent data union alternatives must bind the same payload name",
                        ));
                    }
                    binding.get_or_insert(pattern.binding);
                    let label = format!("{}::{}", pattern.owner, pattern.variant);
                    for category in pattern.categories {
                        categories.insert(category);
                        labels.entry(category).or_insert_with(|| label.clone());
                    }
                }
                for category in &categories {
                    let label = labels
                        .get(category)
                        .expect("every data union runtime category has a source variant");
                    if let Some(previous) = handled.get(category) {
                        return Err(compile_error(format!(
                            "transparent data union match arm `{label}` is unreachable after `{previous}` because both lower to the TypeScript `{}` runtime category",
                            category.name()
                        )));
                    }
                    handled.insert(*category, label.clone());
                }
                output.push(DataUnionMatchArm {
                    binding: binding.flatten(),
                    binding_type: None,
                    categories,
                    catch_all: false,
                    reserved_key_variants: Vec::new(),
                });
            }
        }
    }
    return Ok(Some(output));
}

pub(super) fn analyze_inferred_tagged_data_union_match(
    arms: &[syn::Arm],
    entities: &HashSet<String>,
) -> Option<Vec<InferredTaggedDataUnionMatchArm>> {
    let mut output = Vec::new();
    let mut owner: Option<String> = None;
    let mut has_variant = false;
    let mut has_payload = false;
    for arm in arms {
        match inferred_tagged_data_union_pattern(&arm.pat) {
            InferredPattern::Variants(variants, binding, field_bindings, payload) => {
                for (variant_owner, _) in &variants {
                    if let Some(expected) = &owner {
                        if expected != variant_owner {
                            return None;
                        }
                    } else {
                        owner = Some(variant_owner.clone());
                    }
                }
                if variants.iter().any(|(vo, vn)| {
                    is_data_union_variant(entities, vo, vn)
                        || is_tagged_data_union_variant(entities, vo, vn)
                }) {
                    return None;
                }
                has_variant = true;
                if payload {
                    has_payload = true;
                }
                output.push(InferredTaggedDataUnionMatchArm {
                    binding,
                    catch_all: false,
                    field_bindings,
                    variants: variants.into_iter().map(|(_, v)| v).collect(),
                });
            }
            InferredPattern::CatchAll(binding) => {
                output.push(InferredTaggedDataUnionMatchArm {
                    binding,
                    catch_all: true,
                    field_bindings: Vec::new(),
                    variants: Vec::new(),
                });
            }
            InferredPattern::NotEnum => return None,
        }
    }
    if !has_variant || !has_payload {
        return None;
    }
    return Some(output);
}

pub(super) enum InferredPattern {
    CatchAll(Option<String>),
    NotEnum,
    Variants(
        Vec<(String, String)>,
        Option<String>,
        Vec<(String, String)>,
        bool,
    ),
}

pub(super) fn inferred_tagged_data_union_pattern(pattern: &Pat) -> InferredPattern {
    match pattern {
        Pat::TupleStruct(ts) => {
            let Some((owner, variant)) = path_owner_and_member(&ts.path) else {
                return InferredPattern::NotEnum;
            };
            let binding = if ts.elems.len() == 1 {
                match &ts.elems[0] {
                    Pat::Ident(id) if id.subpat.is_none() => {
                        Some(snake_to_lower_camel(&id.ident.to_string()))
                    }
                    Pat::Wild(_) => None,
                    Pat::Reference(r) => match r.pat.as_ref() {
                        Pat::Ident(id) if id.subpat.is_none() => {
                            Some(snake_to_lower_camel(&id.ident.to_string()))
                        }
                        Pat::Wild(_) => None,
                        _ => return InferredPattern::NotEnum,
                    },
                    Pat::Struct(inner_struct) => {
                        let mut fields = Vec::new();
                        for field in &inner_struct.fields {
                            let source = emit_member(&field.member);
                            let binding_name = match field.pat.as_ref() {
                                Pat::Ident(id) if id.subpat.is_none() => {
                                    snake_to_lower_camel(&id.ident.to_string())
                                }
                                Pat::Wild(_) => continue,
                                Pat::Reference(r) => match r.pat.as_ref() {
                                    Pat::Ident(id) if id.subpat.is_none() => {
                                        snake_to_lower_camel(&id.ident.to_string())
                                    }
                                    Pat::Wild(_) => continue,
                                    _ => return InferredPattern::NotEnum,
                                },
                                _ => return InferredPattern::NotEnum,
                            };
                            fields.push((binding_name, snake_to_lower_camel(&source)));
                        }
                        return InferredPattern::Variants(
                            vec![(owner, variant)],
                            None,
                            fields,
                            true,
                        );
                    }
                    _ => return InferredPattern::NotEnum,
                }
            } else {
                return InferredPattern::NotEnum;
            };
            InferredPattern::Variants(vec![(owner, variant)], binding, Vec::new(), true)
        }
        Pat::Struct(s) => {
            let Some((owner, variant)) = path_owner_and_member(&s.path) else {
                return InferredPattern::NotEnum;
            };
            let mut fields = Vec::new();
            for field in &s.fields {
                let source = emit_member(&field.member);
                let binding_name = match field.pat.as_ref() {
                    Pat::Ident(id) if id.subpat.is_none() => {
                        snake_to_lower_camel(&id.ident.to_string())
                    }
                    Pat::Wild(_) => continue,
                    Pat::Reference(r) => match r.pat.as_ref() {
                        Pat::Ident(id) if id.subpat.is_none() => {
                            snake_to_lower_camel(&id.ident.to_string())
                        }
                        Pat::Wild(_) => continue,
                        _ => return InferredPattern::NotEnum,
                    },
                    _ => return InferredPattern::NotEnum,
                };
                fields.push((binding_name, snake_to_lower_camel(&source)));
            }
            InferredPattern::Variants(vec![(owner, variant)], None, fields, true)
        }
        Pat::Path(path) => {
            let Some((owner, variant)) = path_owner_and_member(&path.path) else {
                return InferredPattern::NotEnum;
            };
            InferredPattern::Variants(vec![(owner, variant)], None, Vec::new(), false)
        }
        Pat::Or(or) => {
            let mut all_variants = Vec::new();
            let mut binding = None;
            let mut field_bindings = Vec::new();
            let mut any_payload = false;
            for case in &or.cases {
                match inferred_tagged_data_union_pattern(case) {
                    InferredPattern::Variants(variants, b, fb, payload) => {
                        if binding.is_none() {
                            binding = b;
                        }
                        if field_bindings.is_empty() && !fb.is_empty() {
                            field_bindings = fb;
                        }
                        if payload {
                            any_payload = true;
                        }
                        all_variants.extend(variants);
                    }
                    InferredPattern::CatchAll(_) | InferredPattern::NotEnum => {
                        return InferredPattern::NotEnum;
                    }
                }
            }
            InferredPattern::Variants(all_variants, binding, field_bindings, any_payload)
        }
        Pat::Ident(id) if id.subpat.is_none() => {
            InferredPattern::CatchAll(Some(snake_to_lower_camel(&id.ident.to_string())))
        }
        Pat::Reference(r) => inferred_tagged_data_union_pattern(&r.pat),
        Pat::Paren(p) => inferred_tagged_data_union_pattern(&p.pat),
        Pat::Wild(_) => InferredPattern::CatchAll(None),
        _ => InferredPattern::NotEnum,
    }
}

pub(super) fn analyze_option_wrapped_inferred_data_union_match(
    arms: &[syn::Arm],
    _entities: &HashSet<String>,
) -> Option<Vec<OptionWrappedInferredDataUnionMatchArm>> {
    let mut output = Vec::new();
    let mut owner: Option<String> = None;
    let mut has_variant = false;
    let mut has_none = false;
    for arm in arms {
        let info = match &arm.pat {
            Pat::TupleStruct(ts)
                if (ts.path.is_ident("Some") || ts.path.is_ident("Ok")) && ts.elems.len() == 1 =>
            {
                match inferred_tagged_data_union_pattern(&ts.elems[0]) {
                    InferredPattern::Variants(variants, binding, field_bindings, _) => {
                        for (variant_owner, _) in &variants {
                            if let Some(expected) = &owner {
                                if expected != variant_owner {
                                    return None;
                                }
                            } else {
                                owner = Some(variant_owner.clone());
                            }
                        }
                        has_variant = true;
                        OptionWrappedInferredDataUnionMatchArm {
                            binding,
                            field_bindings,
                            none_arm: false,
                            variants: variants.into_iter().map(|(_, v)| v).collect(),
                        }
                    }
                    InferredPattern::CatchAll(binding) => OptionWrappedInferredDataUnionMatchArm {
                        binding,
                        field_bindings: Vec::new(),
                        none_arm: false,
                        variants: Vec::new(),
                    },
                    InferredPattern::NotEnum => return None,
                }
            }
            Pat::Path(path) if path.path.is_ident("None") => {
                has_none = true;
                OptionWrappedInferredDataUnionMatchArm {
                    binding: None,
                    field_bindings: Vec::new(),
                    none_arm: true,
                    variants: Vec::new(),
                }
            }
            Pat::Ident(id) if id.ident == "None" && id.subpat.is_none() => {
                has_none = true;
                OptionWrappedInferredDataUnionMatchArm {
                    binding: None,
                    field_bindings: Vec::new(),
                    none_arm: true,
                    variants: Vec::new(),
                }
            }
            Pat::TupleStruct(ts) if ts.path.is_ident("Err") && ts.elems.len() == 1 => {
                has_none = true;
                OptionWrappedInferredDataUnionMatchArm {
                    binding: None,
                    field_bindings: Vec::new(),
                    none_arm: true,
                    variants: Vec::new(),
                }
            }
            Pat::Wild(_) => {
                has_none = true;
                OptionWrappedInferredDataUnionMatchArm {
                    binding: None,
                    field_bindings: Vec::new(),
                    none_arm: true,
                    variants: Vec::new(),
                }
            }
            Pat::Ident(id) if id.subpat.is_none() => {
                has_none = true;
                OptionWrappedInferredDataUnionMatchArm {
                    binding: Some(snake_to_lower_camel(&id.ident.to_string())),
                    field_bindings: Vec::new(),
                    none_arm: true,
                    variants: Vec::new(),
                }
            }
            Pat::Or(or_pattern) => {
                let mut arm_variants = Vec::new();
                let mut arm_none = false;
                let mut arm_binding = None;
                let mut arm_field_bindings = Vec::new();
                for case in &or_pattern.cases {
                    match case {
                        Pat::Path(path) if path.path.is_ident("None") => {
                            arm_none = true;
                        }
                        Pat::Ident(id) if id.ident == "None" && id.subpat.is_none() => {
                            arm_none = true;
                        }
                        Pat::Wild(_) => {
                            arm_none = true;
                        }
                        Pat::TupleStruct(ts)
                            if (ts.path.is_ident("Some") || ts.path.is_ident("Ok"))
                                && ts.elems.len() == 1 =>
                        {
                            match inferred_tagged_data_union_pattern(&ts.elems[0]) {
                                InferredPattern::Variants(variants, binding, field_bindings, _) => {
                                    for (variant_owner, _) in &variants {
                                        if let Some(expected) = &owner {
                                            if expected != variant_owner {
                                                return None;
                                            }
                                        } else {
                                            owner = Some(variant_owner.clone());
                                        }
                                    }
                                    arm_variants.extend(variants.into_iter().map(|(_, v)| v));
                                    if arm_binding.is_none() {
                                        arm_binding = binding;
                                    }
                                    if arm_field_bindings.is_empty() {
                                        arm_field_bindings = field_bindings;
                                    }
                                }
                                InferredPattern::CatchAll(_) => {}
                                InferredPattern::NotEnum => return None,
                            }
                        }
                        _ => return None,
                    }
                }
                if arm_none {
                    has_none = true;
                }
                if !arm_variants.is_empty() {
                    has_variant = true;
                }
                OptionWrappedInferredDataUnionMatchArm {
                    binding: arm_binding,
                    field_bindings: arm_field_bindings,
                    none_arm: arm_none,
                    variants: arm_variants,
                }
            }
            _ => return None,
        };
        output.push(info);
    }
    if !has_variant || !has_none {
        return None;
    }
    return Some(output);
}

pub(super) fn emit_option_wrapped_data_union_match_body(
    out: &mut String,
    expression: &syn::ExprMatch,
    option_du_arms: &[OptionWrappedInferredDataUnionMatchArm],
    action: &HoistedMatchAction<'_>,
    entities: &HashSet<String>,
    indent: usize,
) -> Result<(), CompileError> {
    let has_guards = expression.arms.iter().any(|arm| arm.guard.is_some());
    let absent = option_absent_value(&expression.expr, entities);
    write_indent(out, indent);
    out.push_str("{\n");
    let scrutinee = emit_match_scrutinee(out, expression, entities, indent + 1)?;
    if has_guards {
        write_indent(out, indent + 1);
        out.push_str("let $matched = false;\n");
    }
    for (index, (arm, info)) in expression.arms.iter().zip(option_du_arms).enumerate() {
        write_indent(out, indent + 1);
        if info.none_arm && info.variants.is_empty() {
            let predicate = format!("{scrutinee} === {absent}");
            if has_guards {
                writeln!(out, "if (!$matched && {predicate}) {{")
                    .expect("writing to a String cannot fail");
            } else {
                let prefix = if index == 0 { "if" } else { "else if" };
                writeln!(out, "{prefix} ({predicate}) {{")
                    .expect("writing to a String cannot fail");
            }
        } else if info.none_arm && !info.variants.is_empty() {
            let kind_predicate = info
                .variants
                .iter()
                .map(|variant| {
                    format!(
                        "{scrutinee}.kind === {}",
                        js_string_literal(&lower_camel_from_upper_camel(variant))
                    )
                })
                .collect::<Vec<_>>()
                .join(" || ");
            let predicate = if info.variants.len() == 1 {
                format!("{scrutinee} === {absent} || {scrutinee} !== {absent} && {kind_predicate}")
            } else {
                format!(
                    "{scrutinee} === {absent} || {scrutinee} !== {absent} && ({kind_predicate})"
                )
            };
            if has_guards {
                writeln!(out, "if (!$matched && ({predicate})) {{")
                    .expect("writing to a String cannot fail");
            } else {
                let prefix = if index == 0 { "if" } else { "else if" };
                writeln!(out, "{prefix} ({predicate}) {{")
                    .expect("writing to a String cannot fail");
            }
        } else if !info.variants.is_empty() {
            let kind_predicate = info
                .variants
                .iter()
                .map(|variant| {
                    format!(
                        "{scrutinee}.kind === {}",
                        js_string_literal(&lower_camel_from_upper_camel(variant))
                    )
                })
                .collect::<Vec<_>>()
                .join(" || ");
            let predicate = if info.variants.len() == 1 {
                format!("{scrutinee} !== {absent} && {kind_predicate}")
            } else {
                format!("{scrutinee} !== {absent} && ({kind_predicate})")
            };
            if has_guards {
                writeln!(out, "if (!$matched && {predicate}) {{")
                    .expect("writing to a String cannot fail");
            } else {
                let prefix = if index == 0 { "if" } else { "else if" };
                writeln!(out, "{prefix} ({predicate}) {{")
                    .expect("writing to a String cannot fail");
            }
        } else {
            if has_guards {
                out.push_str("if (!$matched) {\n");
            } else if index == 0 {
                out.push_str("{\n");
            } else {
                out.push_str("else {\n");
            }
        }
        if let Some(binding) = &info.binding {
            write_indent(out, indent + 2);
            writeln!(out, "const {binding} = {scrutinee};")
                .expect("writing to a String cannot fail");
        }
        for (binding_name, source_field) in &info.field_bindings {
            write_indent(out, indent + 2);
            writeln!(out, "const {binding_name} = {scrutinee}.{source_field};")
                .expect("writing to a String cannot fail");
        }
        let arm_context = lexical_pattern_context(entities, &arm.pat);
        let body_indent = if let Some((_, guard)) = &arm.guard {
            let guard_expr = emit_expression(guard, &arm_context)?;
            write_indent(out, indent + 2);
            writeln!(out, "if ({guard_expr}) {{").expect("writing to a String cannot fail");
            write_indent(out, indent + 3);
            out.push_str("$matched = true;\n");
            indent + 3
        } else {
            if has_guards {
                write_indent(out, indent + 2);
                out.push_str("$matched = true;\n");
            }
            indent + 2
        };
        emit_hoisted_match_arm_body(out, &arm.body, action, &arm_context, body_indent)?;
        if arm.guard.is_some() {
            write_indent(out, indent + 2);
            out.push_str("}\n");
        }
        write_indent(out, indent + 1);
        out.push_str("}\n");
    }
    write_indent(out, indent);
    out.push_str("}\n");
    return Ok(());
}
