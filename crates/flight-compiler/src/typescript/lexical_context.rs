use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};

use quote::ToTokens;
use syn::parse::Parser;
use syn::punctuated::Punctuated;
use syn::visit::Visit;
use syn::{Expr, FnArg, ItemFn, ItemStruct, Lit, Pat, ReturnType, Token, Type, UnOp};

use crate::model::Program;
use crate::{CompileError, compile_error};

use super::{
    BINDING_FACT_MARKER, BINDING_MARKER, BINDING_SITE_MARKER, BindingFact, DATA_UNION_UNIT_MARKER,
    DIRECT_LOCK_GUARD_REPLACED_MARKER, EMPTY_SEQUENCE_ELEMENT_TYPE_MARKER,
    ERASED_CELL_WRITTEN_MARKER, ERASED_SHARED_CELL_FIELD_MARKER, EXTERNAL_STRUCT_BINDING_MARKER,
    EmptyVecInitializer, HASH_COLLECTION_FIELD_MARKER, MUTEX_GUARD_BINDING_MARKER,
    NULLABLE_OPTION_BINDING_MARKER, NULLABLE_OPTION_CALLABLE_BINDING_MARKER,
    NULLABLE_OPTION_CALLABLE_MAP_FIELD_MARKER, NULLABLE_OPTION_RETURN_MARKER,
    NUMERIC_FIELD_TYPE_MARKER, OPTION_FIELD_MARKER, OPTION_RETURN_MARKER, PROVENANCE_SEPARATOR,
    RECORD_MAP_VARIANT_MARKER, REF_ALIAS_RECEIVER_CAPTURE_MARKER, REF_ALIAS_TARGET_MARKER,
    RETURN_BINDING_FACT_MARKER, RuntimeCategory, SEQUENCE_FIELD_ELEMENT_MARKER,
    SEQUENCE_FIELD_MARKER, SEQUENCE_RETURN_MARKER, SHARED_IDENTITY_BINDING_MARKER,
    STRUCT_FIELD_TYPE_MARKER, STRUCT_OWNER_MARKER, STRUCT_RETURN_MARKER,
    TAGGED_DATA_UNION_VARIANT_MARKER, TYPE_ALIAS_DEFINITION_MARKER, TYPE_ALIAS_OWNER_MARKER,
    TYPED_ARRAY_SEQUENCE_FIELD_MARKER, binary_operator_assigns, binding_fact_from_marker,
    binding_fact_marker, binding_fact_typescript_type, binding_site_key, call_fact,
    call_returns_shared_identity, context_type_identity, current_source, data_union_variant_marker,
    direct_lock_guard_receiver, emit_type, empty_vec_initializer, entity_ref_data_union,
    expression_constructs_rw_lock_cell, expression_is_associated_path,
    expression_is_identity_payload, expression_is_path, expression_is_plain_place,
    expression_is_type_script_nullable_option_field,
    expression_is_type_script_nullable_option_return, expression_typed_array,
    external_struct_return, external_struct_type, fixed_typed_array_type,
    hash_collection_construction, hash_collection_type, is_string_keyed_hash_map,
    is_type_script_nullable_option_field, literal_numeric_suffix, local_pattern_name,
    mutex_guard_receiver, numeric_associated_call_type, option_inner_type,
    owner_method_delegation_fact, parse_vec_repeat, pattern_identifiers, pattern_is_mutable,
    peel_reference_and_paren, peel_shared_view, primitive_type_identity,
    referenced_path_identifier, reserved_key_data_union_variant_marker,
    reserved_key_data_union_variant_type_marker, reserved_key_record_fields, resolve_path_owner,
    result_ok_type, runtime_categories_for_type, rust_type_is_erased_shared_cell,
    rust_type_is_shared_identity, safe_collection_element_typescript_type, sequence_inner_type,
    snake_to_lower_camel, standard_vec_inner_type, transparent_data_union,
    typed_array_element_primitive, typed_binding_name, uint8_array_parameter, unique_marker_suffix,
    vitest_path_binding_name, vitest_struct_owner,
};
pub(super) fn insert_data_union_context(
    context: &mut HashSet<String>,
    programs: &[&Program],
    external_record_structs: &[ItemStruct],
) -> Result<(), CompileError> {
    return insert_data_union_context_for(
        context,
        programs,
        programs,
        external_record_structs,
        false,
    );
}

// Data unions declared by `owners`, resolving payload types through `programs`. Dependency owners
// (`tolerant`) contribute only the unions this crate can lower exactly: one whose payload does not
// classify, a reserved-key union, or a name this crate declares itself is left unlowered instead of
// failing the dependent's compilation.
pub(super) fn insert_data_union_context_for(
    context: &mut HashSet<String>,
    owners: &[&Program],
    programs: &[&Program],
    external_record_structs: &[ItemStruct],
    tolerant: bool,
) -> Result<(), CompileError> {
    for program in owners {
        for rust_enum in &program.enums {
            let owner = rust_enum.ident.to_string();
            if !program.data_unions.contains(&owner) {
                continue;
            }
            if tolerant
                && (program.reserved_key_data_unions.contains(&owner)
                    || programs
                        .iter()
                        .filter(|other| !owners.iter().any(|owner| std::ptr::eq(*owner, **other)))
                        .any(|local| local.type_names.contains(&owner)))
            {
                continue;
            }
            if !transparent_data_union(rust_enum) || entity_ref_data_union(rust_enum, programs) {
                for variant in &rust_enum.variants {
                    let variant_name = variant.ident.to_string();
                    context.insert(format!(
                        "{TAGGED_DATA_UNION_VARIANT_MARKER}{owner}:{variant_name}"
                    ));
                    if matches!(variant.fields, syn::Fields::Unit) {
                        context.insert(format!("{DATA_UNION_UNIT_MARKER}{owner}:{variant_name}"));
                    }
                }
                continue;
            }
            if program.reserved_key_data_unions.contains(&owner) {
                let variants = rust_enum.variants.iter().collect::<Vec<_>>();
                let payload_types = variants
                    .iter()
                    .map(|variant| {
                        let syn::Fields::Unnamed(fields) = &variant.fields else {
                            unreachable!(
                                "reserved-key data union validation requires payload variants"
                            )
                        };
                        &fields.unnamed[0].ty
                    })
                    .collect::<Vec<_>>();
                let reserved_fields = reserved_key_record_fields(
                    payload_types[0],
                    programs,
                    external_record_structs,
                    &mut BTreeSet::new(),
                )?;
                let fallback_fields = reserved_key_record_fields(
                    payload_types[1],
                    programs,
                    external_record_structs,
                    &mut BTreeSet::new(),
                )?;
                let keys = reserved_fields
                    .difference(&fallback_fields)
                    .cloned()
                    .collect::<BTreeSet<_>>();
                if keys.is_empty() {
                    return Err(compile_error(format!(
                        "reserved-key data union `{owner}` has no first-variant property absent from its fallback payload"
                    )));
                }
                for (index, variant) in variants.into_iter().enumerate() {
                    let variant_name = variant.ident.to_string();
                    context.insert(data_union_variant_marker(
                        &owner,
                        &variant_name,
                        &BTreeSet::from([RuntimeCategory::Record]),
                    ));
                    let empty = BTreeSet::new();
                    context.insert(reserved_key_data_union_variant_marker(
                        &owner,
                        &variant_name,
                        if index == 0 { &keys } else { &empty },
                    ));
                    let payload_type = emit_type(payload_types[index], context)?;
                    context.insert(reserved_key_data_union_variant_type_marker(
                        &owner,
                        &variant_name,
                        &payload_type,
                    ));
                }
                continue;
            }
            let mut skip_enum = false;
            let mut variant_markers = Vec::new();
            for variant in &rust_enum.variants {
                let variant_name = variant.ident.to_string();
                let record_map = program
                    .record_map_variants
                    .contains(&(owner.clone(), variant_name.clone()));
                let categories = match &variant.fields {
                    syn::Fields::Unit => BTreeSet::from([RuntimeCategory::Null]),
                    syn::Fields::Unnamed(fields) if record_map => {
                        if !is_string_keyed_hash_map(&fields.unnamed[0].ty) {
                            return Err(compile_error(format!(
                                "`flight-compiler: record-map {owner}::{variant_name}` requires a `HashMap<String, V>` payload"
                            )));
                        }
                        variant_markers
                            .push(format!("{RECORD_MAP_VARIANT_MARKER}{owner}:{variant_name}"));
                        BTreeSet::from([RuntimeCategory::Record])
                    }
                    syn::Fields::Unnamed(fields) => {
                        match runtime_categories_for_type(
                            &fields.unnamed[0].ty,
                            programs,
                            &mut BTreeSet::new(),
                        ) {
                            Ok(categories) => categories,
                            Err(error) => {
                                let is_auto = programs
                                    .iter()
                                    .any(|program| program.auto_data_unions.contains(&owner));
                                if is_auto || tolerant {
                                    skip_enum = true;
                                    break;
                                }
                                return Err(error);
                            }
                        }
                    }
                    syn::Fields::Named(_) => {
                        unreachable!("transparent data union changed after directive validation")
                    }
                };
                variant_markers.push(data_union_variant_marker(
                    &owner,
                    &variant_name,
                    &categories,
                ));
                if matches!(variant.fields, syn::Fields::Unit) {
                    variant_markers.push(format!("{DATA_UNION_UNIT_MARKER}{owner}:{variant_name}"));
                }
            }
            if skip_enum {
                if !tolerant {
                    context.insert(format!("@data-union-skip:{owner}"));
                }
            } else {
                context.extend(variant_markers);
            }
        }
    }
    return Ok(());
}

// Resolves every value binding of `function` lexically, in source order: parameters, `let` (bound
// after its initializer, so the initializer sees the outer binding; a let-else's else block too),
// closure parameters, `for`, `if let` / `while let` (bound for the condition's remainder and the
// body), and `match` arms (bound for the guard and body), each through nested and tuple patterns.
// Each site gets a canonical BindingId and the fact its declared type or initializer proves: a typed
// `Vec`/slice/array, `Option`, or resolved struct; a bare move inherits the moved binding's fact; a
// call yields a function's return fact only when no lexical binding of the callee's name is in scope,
// because a local value always shadows an imported or sibling function. Parameters are left bound in
// the returned context; every other site is bound during emission by `lexical_pattern_context`.
pub(super) fn insert_lexical_binding_context(function: &ItemFn, context: &mut HashSet<String>) {
    struct ReservedIdentifierCollector {
        names: HashSet<String>,
    }

    impl<'ast> Visit<'ast> for ReservedIdentifierCollector {
        fn visit_ident(&mut self, identifier: &'ast syn::Ident) {
            self.names
                .insert(snake_to_lower_camel(&identifier.to_string()));
        }
    }

    struct Resolver<'a> {
        closure_depth: usize,
        context: &'a HashSet<String>,
        declaration_counts: HashMap<String, usize>,
        dereferenced: HashSet<String>,
        direct_guards: HashMap<String, Expr>,
        empty_sequence_authoritative: BTreeSet<String>,
        empty_sequence_bindings: BTreeSet<String>,
        empty_sequence_candidates: BTreeMap<String, BTreeSet<String>>,
        empty_sequence_unproven: BTreeSet<String>,
        erased_cells: HashSet<String>,
        facts: Vec<(String, BindingFact)>,
        function: String,
        mutex_guards: HashSet<String>,
        nullable_callable_bindings: HashSet<String>,
        nullable_callable_options: HashSet<String>,
        nullable_option_bindings: HashSet<String>,
        ordinal: usize,
        ref_aliases: Vec<(String, String)>,
        ref_alias_receiver_captures: Vec<(String, String, String)>,
        reserved_identifiers: HashSet<String>,
        scopes: Vec<BTreeMap<String, String>>,
        external_structs: BTreeMap<String, String>,
        shared_identities: BTreeSet<String>,
        sites: Vec<(String, String)>,
        replaced_guards: HashSet<String>,
        result_element_type: Option<String>,
        result_is_standard_vec: bool,
        written_cell_names: HashSet<String>,
        written_cells: HashSet<String>,
    }

    // The names of cells whose whole value a lock guard replaces, by name, before bindings resolve:
    // `*cell.write().unwrap() op= ..`, or `*guard op= ..` for `let guard = cell.write().unwrap()`. A
    // clone of an erased cell aliases its original only when it is one of these.
    struct GuardWrittenNames {
        guards: HashMap<String, String>,
        names: HashSet<String>,
    }

    impl GuardWrittenNames {
        fn mark(&mut self, left: &Expr) {
            let Expr::Unary(unary) = peel_reference_and_paren(left) else {
                return;
            };
            if !matches!(unary.op, UnOp::Deref(_)) {
                return;
            }
            let name = match direct_lock_guard_receiver(&unary.expr) {
                Some(receiver) => single_path_identifier(peel_reference_and_paren(receiver)),
                None => single_path_identifier(&unary.expr)
                    .and_then(|guard| self.guards.get(&guard).cloned()),
            };
            if let Some(name) = name {
                self.names.insert(name);
            }
        }
    }

    impl<'ast> Visit<'ast> for GuardWrittenNames {
        fn visit_expr_assign(&mut self, assign: &'ast syn::ExprAssign) {
            self.mark(&assign.left);
            syn::visit::visit_expr_assign(self, assign);
        }

        fn visit_expr_binary(&mut self, binary: &'ast syn::ExprBinary) {
            if binary_operator_assigns(&binary.op) {
                self.mark(&binary.left);
            }
            syn::visit::visit_expr_binary(self, binary);
        }

        fn visit_local(&mut self, local: &'ast syn::Local) {
            if let Some(initializer) = &local.init
                && let Some(receiver) = direct_lock_guard_receiver(&initializer.expr)
                && let Some(cell) = single_path_identifier(peel_reference_and_paren(receiver))
                && let Some(guard) = local_pattern_name(&local.pat)
            {
                self.guards.insert(guard, cell);
            }
            syn::visit::visit_local(self, local);
        }
    }

    struct DeclarationCounter {
        counts: HashMap<String, usize>,
    }

    impl<'ast> Visit<'ast> for DeclarationCounter {
        fn visit_pat_ident(&mut self, pattern: &'ast syn::PatIdent) {
            *self.counts.entry(pattern.ident.to_string()).or_insert(0) += 1;
            syn::visit::visit_pat_ident(self, pattern);
        }
    }

    impl Resolver<'_> {
        // A non-`mut` binding holding an erased shared cell, declared once in the function, so its
        // name always means this binding: a `.clone()` of it is the same cell and lowers as an alias.
        fn erased_cell_binding(&self, expression: &Expr) -> Option<String> {
            let name = single_path_identifier(peel_reference_and_paren(expression))?;
            if self.declaration_counts.get(&name).copied() != Some(1) {
                return None;
            }
            let id = self.binding_id(&name)?;
            return self.erased_cells.contains(&id).then_some(id);
        }

        // Records the binding whose whole value an assignment through a lock guard replaces:
        // `*cell.write().unwrap() = ..` or `*guard op= ..` for a guard over `cell`, following a
        // clone alias back to its original.
        fn mark_guard_write(&mut self, left: &Expr) {
            let Expr::Unary(unary) = peel_reference_and_paren(left) else {
                return;
            };
            if !matches!(unary.op, UnOp::Deref(_)) {
                return;
            }
            let receiver = match direct_lock_guard_receiver(&unary.expr) {
                Some(receiver) => receiver.clone(),
                None => {
                    let Some(id) =
                        single_path_identifier(&unary.expr).and_then(|name| self.binding_id(&name))
                    else {
                        return;
                    };
                    let Some(receiver) = self.direct_guards.get(&id).cloned() else {
                        return;
                    };
                    self.replaced_guards.insert(id);
                    receiver
                }
            };
            let Some(mut id) = single_path_identifier(peel_reference_and_paren(&receiver))
                .and_then(|name| self.binding_id(&name))
            else {
                return;
            };
            if let Some((_, target)) = self.ref_aliases.iter().find(|(alias, _)| *alias == id) {
                // An alias writes through to its target; only a variable target needs `let`.
                let Some(original) = syn::parse_str::<Expr>(target)
                    .ok()
                    .and_then(|target| single_path_identifier(&target))
                    .and_then(|name| self.binding_id(&name))
                else {
                    return;
                };
                id = original;
            }
            self.written_cells.insert(id);
        }

        fn bind(&mut self, identifier: &syn::Ident, fact: BindingFact) -> String {
            let id = format!("{}#b{}", self.function, self.ordinal);
            self.ordinal += 1;
            if let Some(scope) = self.scopes.last_mut() {
                scope.insert(identifier.to_string(), id.clone());
            }
            self.facts.push((id.clone(), fact));
            self.sites.push((binding_site_key(identifier), id.clone()));
            return id;
        }

        fn bind_pattern(&mut self, pattern: &Pat, fact: BindingFact) {
            match pattern {
                Pat::Ident(identifier) => {
                    self.bind(&identifier.ident, fact.clone());
                    if let Some((_, subpattern)) = &identifier.subpat {
                        self.bind_pattern(subpattern, fact);
                    }
                }
                Pat::Paren(paren) => self.bind_pattern(&paren.pat, fact),
                Pat::Reference(reference) => self.bind_pattern(&reference.pat, fact),
                Pat::Slice(slice) => {
                    let BindingFact::Sequence(element) = fact else {
                        self.bind_unresolved_pattern(pattern);
                        return;
                    };
                    if slice
                        .elems
                        .iter()
                        .any(|element| matches!(element, Pat::Rest(_)))
                    {
                        self.bind_unresolved_pattern(pattern);
                        return;
                    }
                    for pattern in &slice.elems {
                        self.bind_pattern(pattern, (*element).clone());
                    }
                }
                Pat::Struct(structure) => {
                    let BindingFact::Structure(identity) = fact else {
                        self.bind_unresolved_pattern(pattern);
                        return;
                    };
                    for field in &structure.fields {
                        let syn::Member::Named(name) = &field.member else {
                            self.bind_unresolved_pattern(&field.pat);
                            continue;
                        };
                        let option_prefix = format!(
                            "{OPTION_FIELD_MARKER}{identity}{PROVENANCE_SEPARATOR}{name}{PROVENANCE_SEPARATOR}"
                        );
                        let field_fact = unique_marker_suffix(self.context, &option_prefix)
                            .map(|payload| {
                                BindingFact::Option(Box::new(
                                    binding_fact_from_marker(&payload),
                                ))
                            })
                            .or_else(|| {
                                self.context
                                    .contains(&format!(
                                        "{SEQUENCE_FIELD_MARKER}{identity}{PROVENANCE_SEPARATOR}{name}"
                                    ))
                                    .then(|| {
                                        let element = unique_marker_suffix(
                                            self.context,
                                            &format!(
                                                "{SEQUENCE_FIELD_ELEMENT_MARKER}{identity}{PROVENANCE_SEPARATOR}{name}{PROVENANCE_SEPARATOR}"
                                            ),
                                        )
                                        .map(|fact| binding_fact_from_marker(&fact))
                                        .unwrap_or(BindingFact::Unknown);
                                        BindingFact::Sequence(Box::new(element))
                                    })
                            })
                            .unwrap_or(BindingFact::UnresolvedPattern);
                        self.bind_pattern(&field.pat, field_fact);
                    }
                }
                Pat::Tuple(tuple) => {
                    let BindingFact::Tuple(facts) = fact else {
                        self.bind_unresolved_pattern(pattern);
                        return;
                    };
                    if tuple.elems.len() != facts.len()
                        || tuple
                            .elems
                            .iter()
                            .any(|element| matches!(element, Pat::Rest(_)))
                    {
                        self.bind_unresolved_pattern(pattern);
                        return;
                    }
                    for (pattern, fact) in tuple.elems.iter().zip(facts) {
                        self.bind_pattern(pattern, fact);
                    }
                }
                Pat::TupleStruct(tuple)
                    if tuple.path.segments.last().is_some_and(|segment| {
                        segment.ident == "Some" || segment.ident == "Ok"
                    }) && tuple.elems.len() == 1 =>
                {
                    let BindingFact::Option(payload) = fact else {
                        self.bind_unresolved_pattern(pattern);
                        return;
                    };
                    self.bind_pattern(&tuple.elems[0], *payload);
                }
                Pat::Type(typed) => {
                    self.bind_pattern(&typed.pat, self.typed_fact(&typed.ty));
                }
                Pat::Wild(_) | Pat::Rest(_) => {}
                _ => self.bind_unresolved_pattern(pattern),
            }
        }

        fn bind_unresolved_pattern(&mut self, pattern: &Pat) {
            for identifier in pattern_identifiers(pattern) {
                self.bind(identifier, BindingFact::UnresolvedPattern);
            }
        }

        fn binding_id(&self, name: &str) -> Option<String> {
            return self
                .scopes
                .iter()
                .rev()
                .find_map(|scope| scope.get(name).cloned());
        }

        // An initializer proven to produce an identity-bearing object that is not a source struct: a
        // shared allocation of one, or a clone of a binding already proven to hold one.
        fn initializer_is_shared_identity(&self, expression: &Expr) -> bool {
            let expression = peel_shared_view(expression);
            return match expression {
                Expr::Call(call)
                    if (expression_is_associated_path(&call.func, "Arc", "new")
                        || expression_is_associated_path(&call.func, "Rc", "new"))
                        && call.args.len() == 1 =>
                {
                    self.payload_is_identity(&call.args[0])
                }
                Expr::Call(call) => {
                    call_returns_shared_identity(self.context, &call.func)
                        || self.expression_structure_identity(expression).is_some()
                }
                Expr::Path(path) if path.qself.is_none() && path.path.segments.len() == 1 => {
                    let name = path.path.segments[0].ident.to_string();
                    self.binding_id(&name)
                        .is_some_and(|id| self.shared_identities.contains(&id))
                        || matches!(
                            self.fact_of(&name),
                            Some(
                                BindingFact::Structure(_)
                                    | BindingFact::HashMap
                                    | BindingFact::HashSet
                            )
                        )
                }
                _ => false,
            };
        }

        // `shared_payload_is_identity` over the bindings this resolver has proven so far.
        fn payload_is_identity(&self, payload: &Expr) -> bool {
            return match payload {
                Expr::Group(group) => self.payload_is_identity(&group.expr),
                Expr::Paren(paren) => self.payload_is_identity(&paren.expr),
                Expr::Call(call)
                    if expression_is_associated_path(&call.func, "RwLock", "new")
                        && call.args.len() == 1 =>
                {
                    self.payload_is_identity(&call.args[0])
                }
                payload => {
                    expression_is_identity_payload(payload)
                        || self.expression_structure_identity(payload).is_some()
                }
            };
        }

        fn mark_external_struct(&mut self, pattern: &Pat, rust_type: &Type) {
            let Some(name) = typed_binding_name(pattern) else {
                return;
            };
            if let Some(external) = external_struct_type(self.context, rust_type)
                && let Some(id) = self.binding_id(&name)
            {
                self.external_structs.insert(id, external);
            }
        }

        fn mark_shared_identity(&mut self, pattern: &Pat, proven: bool) {
            let name = match pattern {
                Pat::Ident(identifier) => identifier.ident.to_string(),
                Pat::Type(typed) => match typed.pat.as_ref() {
                    Pat::Ident(identifier) => identifier.ident.to_string(),
                    _ => return,
                },
                _ => return,
            };
            if proven && let Some(id) = self.binding_id(&name) {
                self.shared_identities.insert(id);
            }
        }

        fn fact_of(&self, name: &str) -> Option<BindingFact> {
            let id = self.binding_id(name)?;
            return self
                .facts
                .iter()
                .rev()
                .find(|(fact_id, _)| *fact_id == id)
                .map(|(_, fact)| fact.clone());
        }

        fn expression_typescript_type(&self, expression: &Expr) -> Option<String> {
            if let Expr::Lit(literal) = peel_reference_and_paren(expression) {
                return match literal.lit {
                    Lit::Bool(_) => Some("boolean".to_string()),
                    Lit::Byte(_) | Lit::Float(_) | Lit::Int(_) => Some("number".to_string()),
                    Lit::ByteStr(_) => None,
                    Lit::Char(_) | Lit::Str(_) => Some("string".to_string()),
                    _ => None,
                };
            }
            return binding_fact_typescript_type(&self.initializer_fact(expression), self.context);
        }

        fn record_empty_sequence_candidate(
            &mut self,
            id: &str,
            candidate: Option<String>,
            authoritative: bool,
        ) {
            if !self.empty_sequence_bindings.contains(id) {
                return;
            }
            if authoritative {
                if self.empty_sequence_authoritative.insert(id.to_string()) {
                    // A declared or result type is authoritative Rust provenance. Receiver evidence
                    // collected before it is only inference and cannot override that type.
                    self.empty_sequence_candidates.remove(id);
                    self.empty_sequence_unproven.remove(id);
                }
            } else if self.empty_sequence_authoritative.contains(id) {
                return;
            }
            match candidate {
                Some(candidate) => {
                    self.empty_sequence_candidates
                        .entry(id.to_string())
                        .or_default()
                        .insert(candidate);
                }
                None => {
                    self.empty_sequence_unproven.insert(id.to_string());
                }
            }
        }

        fn fresh_ref_alias_receiver(&mut self, alias: &str) -> String {
            for index in 0.. {
                let candidate = if index == 0 {
                    format!("{alias}_receiver")
                } else {
                    format!("{alias}_receiver_{index}")
                };
                if self
                    .reserved_identifiers
                    .insert(snake_to_lower_camel(&candidate))
                {
                    return candidate;
                }
            }
            unreachable!("an unbounded candidate sequence always yields an unused identifier")
        }

        fn replace_struct_call_receiver(
            &self,
            expression: &Expr,
            replacement: &Expr,
        ) -> Option<(Expr, Expr)> {
            return match expression {
                Expr::Field(field) => {
                    let (capture, base) =
                        self.replace_struct_call_receiver(&field.base, replacement)?;
                    let mut stabilized = field.clone();
                    stabilized.base = Box::new(base);
                    Some((capture, Expr::Field(stabilized)))
                }
                Expr::Group(group) => {
                    let (capture, inner) =
                        self.replace_struct_call_receiver(&group.expr, replacement)?;
                    let mut stabilized = group.clone();
                    stabilized.expr = Box::new(inner);
                    Some((capture, Expr::Group(stabilized)))
                }
                Expr::Paren(paren) => {
                    let (capture, inner) =
                        self.replace_struct_call_receiver(&paren.expr, replacement)?;
                    let mut stabilized = paren.clone();
                    stabilized.expr = Box::new(inner);
                    Some((capture, Expr::Paren(stabilized)))
                }
                Expr::Reference(reference) => {
                    let (capture, inner) =
                        self.replace_struct_call_receiver(&reference.expr, replacement)?;
                    let mut stabilized = reference.clone();
                    stabilized.expr = Box::new(inner);
                    Some((capture, Expr::Reference(stabilized)))
                }
                Expr::Unary(unary) if matches!(unary.op, UnOp::Deref(_)) => {
                    let (capture, inner) =
                        self.replace_struct_call_receiver(&unary.expr, replacement)?;
                    let mut stabilized = unary.clone();
                    stabilized.expr = Box::new(inner);
                    Some((capture, Expr::Unary(stabilized)))
                }
                Expr::Call(_) if self.expression_structure_identity(expression).is_some() => {
                    Some((expression.clone(), replacement.clone()))
                }
                _ => None,
            };
        }

        fn stabilize_ref_alias_target(
            &mut self,
            expression: &Expr,
            alias: &str,
        ) -> Option<(String, Expr, Expr)> {
            let placeholder: Expr = syn::parse_str("__flight_ref_alias_receiver").ok()?;
            self.replace_struct_call_receiver(expression, &placeholder)?;
            let stable = self.fresh_ref_alias_receiver(alias);
            let replacement = syn::parse_str::<Expr>(&stable).ok()?;
            let (capture, target) = self.replace_struct_call_receiver(expression, &replacement)?;
            return Some((stable, capture, target));
        }

        fn expression_structure_identity(&self, expression: &Expr) -> Option<String> {
            return match peel_reference_and_paren(expression) {
                Expr::Call(call) => {
                    let Expr::Path(path) = call.func.as_ref() else {
                        return None;
                    };
                    if path.qself.is_some()
                        || single_path_identifier(&call.func)
                            .is_some_and(|name| self.fact_of(&name).is_some())
                    {
                        return None;
                    }
                    call_fact(self.context, STRUCT_RETURN_MARKER, &path.path)
                        .filter(|identity| !identity.is_empty())
                }
                Expr::Field(field) => {
                    let syn::Member::Named(field_name) = &field.member else {
                        return None;
                    };
                    let owner = self.expression_structure_identity(&field.base)?;
                    unique_marker_suffix(
                        self.context,
                        &format!(
                            "{STRUCT_FIELD_TYPE_MARKER}{owner}{PROVENANCE_SEPARATOR}{field_name}{PROVENANCE_SEPARATOR}"
                        ),
                    )
                }
                Expr::Path(path) if path.qself.is_none() && path.path.segments.len() == 1 => {
                    let name = path.path.segments.first()?.ident.to_string();
                    let BindingFact::Structure(identity) = self.fact_of(&name)? else {
                        return None;
                    };
                    Some(identity)
                }
                Expr::Unary(unary) if matches!(unary.op, UnOp::Deref(_)) => {
                    self.expression_structure_identity(&unary.expr)
                }
                Expr::MethodCall(call) => {
                    let owner = self.expression_structure_identity(&call.receiver)?;
                    owner_method_delegation_fact(
                        self.context,
                        &owner,
                        &call.method.to_string(),
                        STRUCT_RETURN_MARKER,
                    )
                    .filter(|identity| !identity.is_empty())
                }
                _ => None,
            };
        }

        fn expression_is_type_script_nullable_option_field(&self, expression: &Expr) -> bool {
            let Expr::Field(field) = expression else {
                return false;
            };
            let syn::Member::Named(field_name) = &field.member else {
                return false;
            };
            let Some(structure) = self.expression_structure_identity(&field.base) else {
                return false;
            };
            return is_type_script_nullable_option_field(self.context, &structure, field_name);
        }

        // The return fact of a method call forwarded to a free function by a delegating impl method.
        fn delegated_method_fact(&self, call: &syn::ExprMethodCall) -> Option<BindingFact> {
            let owner = self.expression_structure_identity(&call.receiver)?;
            return owner_method_delegation_fact(
                self.context,
                &owner,
                &call.method.to_string(),
                RETURN_BINDING_FACT_MARKER,
            )
            .map(|fact| binding_fact_from_marker(&fact));
        }

        fn erased_shared_cell_field(&self, expression: &Expr) -> bool {
            let Expr::Field(field) = peel_reference_and_paren(expression) else {
                return false;
            };
            let syn::Member::Named(field_name) = &field.member else {
                return false;
            };
            let Some(identity) = self.expression_structure_identity(&field.base) else {
                return false;
            };
            return self.context.contains(&format!(
                "{ERASED_SHARED_CELL_FIELD_MARKER}{identity}{PROVENANCE_SEPARATOR}{field_name}"
            ));
        }

        fn initializer_fact(&self, expression: &Expr) -> BindingFact {
            if let Some(array_type) = expression_typed_array(expression, self.context) {
                return BindingFact::TypedArray(array_type);
            }
            if let Some(kind) = hash_collection_construction(expression, self.context) {
                return kind;
            }
            if let Some(kind) = self.hash_collection_field_fact(expression) {
                return kind;
            }
            if let Some(receiver) = direct_lock_guard_receiver(expression) {
                return self.initializer_fact(receiver);
            }
            if let Expr::MethodCall(call) = expression
                && let Some(fact) = self.delegated_method_fact(call)
            {
                return fact;
            }
            return match expression {
                Expr::Array(array) => {
                    let element_facts: Vec<_> = array
                        .elems
                        .iter()
                        .map(|element| self.initializer_fact(element))
                        .collect();
                    let merged = self.merged_facts(element_facts.iter().cloned());
                    let element_fact = if matches!(merged, BindingFact::Unknown) {
                        element_facts
                            .into_iter()
                            .find(|f| matches!(f, BindingFact::Structure(_)))
                            .unwrap_or(BindingFact::Unknown)
                    } else {
                        merged
                    };
                    BindingFact::Sequence(Box::new(element_fact))
                }
                Expr::Call(call) => {
                    if (expression_is_path(&call.func, "Some")
                        || expression_is_path(&call.func, "Ok"))
                        && call.args.len() == 1
                    {
                        let payload = self.initializer_fact(&call.args[0]);
                        return if payload.has_source_structure() {
                            BindingFact::Option(Box::new(payload))
                        } else {
                            BindingFact::Unknown
                        };
                    }
                    let Expr::Path(path) = call.func.as_ref() else {
                        return BindingFact::Unknown;
                    };
                    if let Some(numeric) = numeric_associated_call_type(&call.func) {
                        return BindingFact::Structure(numeric);
                    }
                    if path.qself.is_none() && path.path.segments.len() == 2 {
                        let owner = path.path.segments[0].ident.to_string();
                        let method = path.path.segments[1].ident.to_string();
                        if (owner == "Vec" || owner == "BTreeSet")
                            && matches!(method.as_str(), "new" | "with_capacity")
                        {
                            return BindingFact::Sequence(Box::new(BindingFact::Unknown));
                        }
                        if owner == "String"
                            && matches!(method.as_str(), "new" | "with_capacity" | "from")
                        {
                            return BindingFact::Structure("String".to_string());
                        }
                        if (owner == "HashMap" || owner == "BTreeMap")
                            && matches!(method.as_str(), "new" | "with_capacity")
                        {
                            return BindingFact::HashMap;
                        }
                        if owner == "HashSet"
                            && matches!(method.as_str(), "new" | "with_capacity")
                        {
                            return BindingFact::HashSet;
                        }
                    }
                    if path.qself.is_some() {
                        return BindingFact::Unknown;
                    }
                    if single_path_identifier(&call.func)
                        .is_some_and(|name| self.fact_of(&name).is_some())
                    {
                        return BindingFact::Unknown;
                    }
                    if let Some(fact) =
                        call_fact(self.context, RETURN_BINDING_FACT_MARKER, &path.path)
                    {
                        return binding_fact_from_marker(&fact);
                    }
                    if call_fact(self.context, SEQUENCE_RETURN_MARKER, &path.path).is_some() {
                        return BindingFact::Sequence(Box::new(BindingFact::Unknown));
                    }
                    if let Some(identity) =
                        call_fact(self.context, STRUCT_RETURN_MARKER, &path.path)
                            .filter(|identity| !identity.is_empty())
                    {
                        return BindingFact::Structure(identity);
                    }
                    call_fact(self.context, OPTION_RETURN_MARKER, &path.path).map_or(
                        BindingFact::Unknown,
                        |payload| {
                            BindingFact::Option(Box::new(if payload.is_empty() {
                                BindingFact::Unknown
                            } else {
                                BindingFact::Structure(payload)
                            }))
                        },
                    )
                }
                Expr::Group(group) => self.initializer_fact(&group.expr),
                Expr::Field(field) => self
                    .expression_structure_identity(expression)
                    .map(BindingFact::Structure)
                    .or_else(|| self.option_fact(expression))
                    .or_else(|| {
                        let syn::Member::Named(field_name) = &field.member else {
                            return None;
                        };
                        let owner = self.expression_structure_identity(&field.base)?;
                        if let Some(array_type) = unique_marker_suffix(
                            self.context,
                            &format!(
                                "{TYPED_ARRAY_SEQUENCE_FIELD_MARKER}{owner}{PROVENANCE_SEPARATOR}{field_name}{PROVENANCE_SEPARATOR}"
                            ),
                        ) {
                            return Some(BindingFact::TypedArray(array_type));
                        }
                        if self.context.contains(&format!(
                            "{SEQUENCE_FIELD_MARKER}{owner}{PROVENANCE_SEPARATOR}{field_name}"
                        )) {
                            let element = unique_marker_suffix(
                                self.context,
                                &format!(
                                    "{SEQUENCE_FIELD_ELEMENT_MARKER}{owner}{PROVENANCE_SEPARATOR}{field_name}{PROVENANCE_SEPARATOR}"
                                ),
                            )
                            .map(|fact| binding_fact_from_marker(&fact))
                            .unwrap_or(BindingFact::Unknown);
                            return Some(BindingFact::Sequence(Box::new(element)));
                        }
                        let numeric = unique_marker_suffix(
                            self.context,
                            &format!(
                                "{NUMERIC_FIELD_TYPE_MARKER}{owner}{PROVENANCE_SEPARATOR}{field_name}{PROVENANCE_SEPARATOR}"
                            ),
                        )?;
                        Some(BindingFact::Structure(numeric))
                    })
                    .unwrap_or(BindingFact::Unknown),
                Expr::Macro(invocation) if invocation.mac.path.is_ident("vec") => {
                    if invocation.mac.tokens.is_empty() {
                        return BindingFact::Sequence(Box::new(BindingFact::Unknown));
                    }
                    let element = if let Ok((value, _)) = parse_vec_repeat(&invocation.mac) {
                        self.initializer_fact(&value)
                    } else if let Ok(values) = Punctuated::<Expr, Token![,]>::parse_terminated
                        .parse2(invocation.mac.tokens.clone())
                    {
                        self.merged_facts(values.iter().map(|value| self.initializer_fact(value)))
                    } else {
                        BindingFact::Unknown
                    };
                    BindingFact::Sequence(Box::new(element))
                }
                Expr::Paren(paren) => self.initializer_fact(&paren.expr),
                Expr::Reference(reference) => self.initializer_fact(&reference.expr),
                Expr::MethodCall(call)
                    if (call.args.is_empty()
                        && matches!(
                            call.method.to_string().as_str(),
                            "collect" | "iter" | "into_iter"
                        ))
                        || (call.args.len() == 1
                            && matches!(
                                call.method.to_string().as_str(),
                                "filter" | "map" | "skip"
                            )) =>
                {
                    match self.initializer_fact(&call.receiver) {
                        BindingFact::Sequence(element) if call.method != "map" => {
                            BindingFact::Sequence(element)
                        }
                        BindingFact::TypedArray(ref name) => {
                            let element = typed_array_element_primitive(name)
                                .map(|p| BindingFact::Structure(p.to_string()))
                                .unwrap_or(BindingFact::Unknown);
                            BindingFact::Sequence(Box::new(element))
                        }
                        BindingFact::Sequence(_) => {
                            BindingFact::Sequence(Box::new(BindingFact::Unknown))
                        }
                        _ => BindingFact::Unknown,
                    }
                }
                Expr::MethodCall(call)
                    if call.args.is_empty() && call.method == "enumerate" =>
                {
                    let element = match self.initializer_fact(&call.receiver) {
                        BindingFact::Sequence(element) => Some(*element),
                        BindingFact::TypedArray(ref name) => typed_array_element_primitive(name)
                            .map(|p| BindingFact::Structure(p.to_string())),
                        _ => None,
                    };
                    match element {
                        Some(element) => BindingFact::Sequence(Box::new(BindingFact::Tuple(vec![
                            BindingFact::Structure("usize".to_string()),
                            element,
                        ]))),
                        None => BindingFact::Unknown,
                    }
                }
                Expr::MethodCall(call)
                    if call.args.is_empty()
                        && matches!(
                            call.method.to_string().as_str(),
                            "abs" | "as_mut"
                                | "as_ref"
                                | "clone"
                                | "cloned"
                                | "copied"
                                | "signum"
                                | "unsigned_abs"
                                | "wrapping_neg"
                                | "wrapping_abs"
                                | "saturating_neg"
                                | "saturating_abs"
                        ) =>
                {
                    if let Some(fact) = self.option_fact(expression) {
                        return fact;
                    }
                    self.initializer_fact(&call.receiver)
                }
                Expr::MethodCall(call)
                    if call.args.len() == 1
                        && matches!(
                            call.method.to_string().as_str(),
                            "checked_add"
                                | "checked_div"
                                | "checked_mul"
                                | "checked_rem"
                                | "checked_sub"
                                | "div_euclid"
                                | "max"
                                | "min"
                                | "pow"
                                | "rem_euclid"
                                | "saturating_add"
                                | "saturating_mul"
                                | "saturating_sub"
                                | "wrapping_add"
                                | "wrapping_mul"
                                | "wrapping_sub"
                        ) =>
                {
                    self.initializer_fact(&call.receiver)
                }
                Expr::MethodCall(call)
                    if call.args.len() == 2
                        && call.method == "clamp" =>
                {
                    self.initializer_fact(&call.receiver)
                }
                Expr::Struct(structure) if structure.qself.is_none() => {
                    let identity = match current_source(self.context) {
                        Some(current) => resolve_path_owner(
                            self.context,
                            STRUCT_OWNER_MARKER,
                            &current,
                            &structure.path,
                        )
                        .map(|(module, declaration)| {
                            format!("{module}{PROVENANCE_SEPARATOR}{declaration}")
                        }),
                        None => vitest_path_binding_name(&structure.path, self.context)
                            .and_then(|name| vitest_struct_owner(self.context, &name)),
                    };
                    identity.map_or(BindingFact::Unknown, BindingFact::Structure)
                }
                Expr::Tuple(tuple) => BindingFact::Tuple(
                    tuple
                        .elems
                        .iter()
                        .map(|element| self.initializer_fact(element))
                        .collect(),
                ),
                Expr::Binary(binary) => {
                    let left = self.initializer_fact(&binary.left);
                    let right = self.initializer_fact(&binary.right);
                    if left == right {
                        return left;
                    }
                    match (&left, &right) {
                        (BindingFact::Structure(_), BindingFact::Unknown) => left,
                        (BindingFact::Unknown, BindingFact::Structure(_)) => right,
                        _ => self.merged_facts([left, right].into_iter()),
                    }
                }
                Expr::Block(block) => block
                    .block
                    .stmts
                    .last()
                    .and_then(|stmt| match stmt {
                        syn::Stmt::Expr(expr, None) => Some(self.initializer_fact(expr)),
                        _ => None,
                    })
                    .unwrap_or(BindingFact::Unknown),
                Expr::Cast(cast) => primitive_type_identity(&cast.ty)
                    .map(BindingFact::Structure)
                    .unwrap_or(BindingFact::Unknown),
                Expr::If(if_expr) => {
                    let then_fact = if_expr
                        .then_branch
                        .stmts
                        .last()
                        .and_then(|stmt| match stmt {
                            syn::Stmt::Expr(expr, None) => Some(self.initializer_fact(expr)),
                            _ => None,
                        })
                        .unwrap_or(BindingFact::Unknown);
                    if let Some((_, else_expr)) = &if_expr.else_branch {
                        let else_fact = self.initializer_fact(else_expr);
                        self.merged_facts([then_fact, else_fact].into_iter())
                    } else {
                        then_fact
                    }
                }
                Expr::Lit(literal) => literal_numeric_suffix(literal)
                    .map(BindingFact::Structure)
                    .unwrap_or(BindingFact::Unknown),
                Expr::Match(match_expr) => {
                    let arm_facts = match_expr.arms.iter().filter_map(|arm| {
                        match arm.body.as_ref() {
                            Expr::Block(block) => block.block.stmts.last().and_then(|stmt| {
                                match stmt {
                                    syn::Stmt::Expr(expr, None) => {
                                        Some(self.initializer_fact(expr))
                                    }
                                    _ => None,
                                }
                            }),
                            expr => Some(self.initializer_fact(expr)),
                        }
                    });
                    self.merged_facts(arm_facts)
                }
                Expr::MethodCall(call)
                    if call.args.is_empty()
                        && matches!(
                            call.method.to_string().as_str(),
                            "clone" | "cloned" | "copied"
                        ) =>
                {
                    self.initializer_fact(&call.receiver)
                }
                Expr::MethodCall(call)
                    if call.args.is_empty()
                        && matches!(
                            call.method.to_string().as_str(),
                            "to_string" | "to_owned"
                        ) =>
                {
                    BindingFact::Structure("String".to_string())
                }
                Expr::MethodCall(call)
                    if call.args.is_empty() && call.method == "to_vec" =>
                {
                    match self.initializer_fact(&call.receiver) {
                        BindingFact::Sequence(element) => BindingFact::Sequence(element),
                        BindingFact::TypedArray(ref name) => {
                            let element = typed_array_element_primitive(name)
                                .map(|p| BindingFact::Structure(p.to_string()))
                                .unwrap_or(BindingFact::Unknown);
                            BindingFact::Sequence(Box::new(element))
                        }
                        _ => BindingFact::Sequence(Box::new(BindingFact::Unknown)),
                    }
                }
                Expr::MethodCall(call)
                    if call.args.is_empty()
                        && matches!(
                            call.method.to_string().as_str(),
                            "iter" | "into_iter"
                        ) =>
                {
                    self.initializer_fact(&call.receiver)
                }
                Expr::MethodCall(call)
                    if call.args.is_empty()
                        && matches!(
                            call.method.to_string().as_str(),
                            "collect"
                        ) =>
                {
                    let receiver_fact = self.initializer_fact(&call.receiver);
                    if matches!(
                        receiver_fact,
                        BindingFact::Sequence(_) | BindingFact::TypedArray(_)
                    ) {
                        receiver_fact
                    } else {
                        BindingFact::Unknown
                    }
                }
                Expr::MethodCall(call)
                    if call.args.len() == 1
                        && matches!(
                            call.method.to_string().as_str(),
                            "chain" | "filter" | "map" | "flat_map" | "filter_map" | "skip"
                                | "take" | "skip_while" | "take_while"
                        ) =>
                {
                    self.initializer_fact(&call.receiver)
                }
                Expr::MethodCall(call)
                    if call.args.is_empty()
                        && matches!(
                            call.method.to_string().as_str(),
                            "flatten" | "rev" | "enumerate" | "peekable"
                                | "sorted" | "dedup" | "keys" | "values"
                        ) =>
                {
                    self.initializer_fact(&call.receiver)
                }
                Expr::MethodCall(call)
                    if matches!(
                        call.method.to_string().as_str(),
                        "split" | "splitn" | "rsplitn" | "split_terminator"
                            | "split_whitespace" | "split_ascii_whitespace" | "lines"
                    ) && matches!(
                        self.initializer_fact(&call.receiver),
                        BindingFact::Structure(ref s) if s == "String" || s == "str"
                    ) =>
                {
                    BindingFact::Sequence(Box::new(BindingFact::Structure("str".to_string())))
                }
                Expr::MethodCall(call)
                    if call.args.is_empty()
                        && matches!(
                            call.method.to_string().as_str(),
                            "chars" | "bytes"
                        )
                        && matches!(
                            self.initializer_fact(&call.receiver),
                            BindingFact::Structure(ref s) if s == "String" || s == "str"
                        ) =>
                {
                    BindingFact::Sequence(Box::new(BindingFact::Unknown))
                }
                Expr::MethodCall(call)
                    if call.args.is_empty()
                        && matches!(
                            call.method.to_string().as_str(),
                            "count" | "len"
                        ) =>
                {
                    BindingFact::Structure("usize".to_string())
                }
                Expr::MethodCall(call)
                    if call.args.is_empty()
                        && matches!(
                            call.method.to_string().as_str(),
                            "unwrap" | "expect"
                        ) =>
                {
                    match self.initializer_fact(&call.receiver) {
                        BindingFact::Option(payload) => *payload,
                        other => other,
                    }
                }
                Expr::MethodCall(call)
                    if call.args.len() == 1
                        && matches!(
                            call.method.to_string().as_str(),
                            "unwrap_or" | "unwrap_or_else"
                        ) =>
                {
                    match self.initializer_fact(&call.receiver) {
                        BindingFact::Option(payload) => *payload,
                        other => other,
                    }
                }
                Expr::Index(index) => {
                    match self.initializer_fact(&index.expr) {
                        BindingFact::Sequence(element) => *element,
                        BindingFact::TypedArray(ref name) => typed_array_element_primitive(name)
                            .map(|p| BindingFact::Structure(p.to_string()))
                            .unwrap_or(BindingFact::Unknown),
                        BindingFact::Tuple(elements) => {
                            if let Expr::Lit(syn::ExprLit {
                                lit: Lit::Int(int_lit),
                                ..
                            }) = index.index.as_ref()
                            {
                                int_lit
                                    .base10_parse::<usize>()
                                    .ok()
                                    .and_then(|i| elements.into_iter().nth(i))
                                    .unwrap_or(BindingFact::Unknown)
                            } else {
                                BindingFact::Unknown
                            }
                        }
                        _ => BindingFact::Unknown,
                    }
                }
                Expr::Unary(unary) => self.initializer_fact(&unary.expr),
                expression => single_path_identifier(expression)
                    .and_then(|name| self.fact_of(&name))
                    .unwrap_or(BindingFact::Unknown),
            };
        }

        fn initializer_retains_nullable_option(&self, expression: &Expr) -> bool {
            return match expression {
                Expr::Call(call) => {
                    let Expr::Path(path) = call.func.as_ref() else {
                        return false;
                    };
                    if path.qself.is_some() {
                        return false;
                    }
                    if let Some(name) = single_path_identifier(&call.func)
                        && let Some(id) = self.binding_id(&name)
                    {
                        return self.nullable_callable_bindings.contains(&id);
                    }
                    return call_fact(self.context, NULLABLE_OPTION_RETURN_MARKER, &path.path)
                        .is_some();
                }
                Expr::Group(group) => self.initializer_retains_nullable_option(&group.expr),
                Expr::MethodCall(call) if call.args.is_empty() && call.method == "clone" => {
                    self.initializer_retains_nullable_option(&call.receiver)
                }
                Expr::Paren(paren) => self.initializer_retains_nullable_option(&paren.expr),
                Expr::Field(_) => self.expression_is_type_script_nullable_option_field(expression),
                Expr::Path(path) if path.qself.is_none() && path.path.segments.len() == 1 => self
                    .binding_id(&path.path.segments[0].ident.to_string())
                    .is_some_and(|id| self.nullable_option_bindings.contains(&id)),
                Expr::Reference(reference) => {
                    self.initializer_retains_nullable_option(&reference.expr)
                }
                _ => false,
            };
        }

        fn initializer_is_nullable_callable_return(&self, expression: &Expr) -> bool {
            let Expr::Call(call) = peel_reference_and_paren(expression) else {
                return false;
            };
            let Some(name) = single_path_identifier(&call.func) else {
                return false;
            };
            return self
                .binding_id(&name)
                .is_some_and(|id| self.nullable_callable_bindings.contains(&id));
        }

        fn initializer_is_nullable_callable_option(&self, expression: &Expr) -> bool {
            let expression = peel_reference_and_paren(expression);
            let expression = match expression {
                Expr::MethodCall(call)
                    if call.args.is_empty()
                        && matches!(call.method.to_string().as_str(), "cloned" | "copied") =>
                {
                    peel_reference_and_paren(call.receiver.as_ref())
                }
                expression => expression,
            };
            let Expr::MethodCall(get) = expression else {
                return false;
            };
            if get.method != "get" {
                return false;
            }
            let Expr::Field(field) = peel_reference_and_paren(get.receiver.as_ref()) else {
                return false;
            };
            let syn::Member::Named(field_name) = &field.member else {
                return false;
            };
            let Some(identity) = self.expression_structure_identity(&field.base) else {
                return false;
            };
            let marker = |owner: &str| {
                format!(
                    "{NULLABLE_OPTION_CALLABLE_MAP_FIELD_MARKER}{owner}{PROVENANCE_SEPARATOR}{field_name}"
                )
            };
            return self.context.contains(&marker(&identity))
                || identity
                    .rsplit(PROVENANCE_SEPARATOR)
                    .next()
                    .is_some_and(|owner| self.context.contains(&marker(owner)));
        }

        // A field of a lexically known structure declared as `HashSet` / `HashMap`.
        fn hash_collection_field_fact(&self, expression: &Expr) -> Option<BindingFact> {
            return match expression {
                Expr::Field(field) => {
                    let syn::Member::Named(field_name) = &field.member else {
                        return None;
                    };
                    let base = single_path_identifier(&field.base)?;
                    let BindingFact::Structure(identity) = self.fact_of(&base)? else {
                        return None;
                    };
                    [BindingFact::HashMap, BindingFact::HashSet]
                        .into_iter()
                        .find(|kind| {
                            self.context.contains(&format!(
                                "{HASH_COLLECTION_FIELD_MARKER}{identity}{PROVENANCE_SEPARATOR}{field_name}{PROVENANCE_SEPARATOR}{}",
                                binding_fact_marker(kind)
                            ))
                        })
                }
                Expr::Group(group) => self.hash_collection_field_fact(&group.expr),
                Expr::Paren(paren) => self.hash_collection_field_fact(&paren.expr),
                _ => None,
            };
        }

        fn option_fact(&self, expression: &Expr) -> Option<BindingFact> {
            return match expression {
                Expr::Call(call) => {
                    let Expr::Path(path) = call.func.as_ref() else {
                        return None;
                    };
                    let payload = call_fact(self.context, OPTION_RETURN_MARKER, &path.path)?;
                    Some(BindingFact::Option(Box::new(binding_fact_from_marker(
                        &payload,
                    ))))
                }
                Expr::Field(field) => {
                    let syn::Member::Named(field_name) = &field.member else {
                        return None;
                    };
                    let base = single_path_identifier(&field.base)?;
                    let BindingFact::Structure(identity) = self.fact_of(&base)? else {
                        return None;
                    };
                    let payload = unique_marker_suffix(
                        self.context,
                        &format!(
                            "{OPTION_FIELD_MARKER}{identity}{PROVENANCE_SEPARATOR}{field_name}{PROVENANCE_SEPARATOR}"
                        ),
                    )?;
                    Some(BindingFact::Option(Box::new(binding_fact_from_marker(
                        &payload,
                    ))))
                }
                Expr::Group(group) => self.option_fact(&group.expr),
                Expr::MethodCall(call)
                    if call.args.is_empty()
                        && matches!(
                            call.method.to_string().as_str(),
                            "as_mut" | "as_ref" | "clone" | "cloned" | "copied"
                        ) =>
                {
                    self.option_fact(&call.receiver)
                }
                Expr::Paren(paren) => self.option_fact(&paren.expr),
                Expr::Path(path) if path.qself.is_none() && path.path.segments.len() == 1 => {
                    match self.fact_of(&path.path.segments[0].ident.to_string())? {
                        fact @ BindingFact::Option(_) => Some(fact),
                        _ => None,
                    }
                }
                Expr::Reference(reference) => self.option_fact(&reference.expr),
                _ => None,
            };
        }

        fn merged_facts(&self, facts: impl Iterator<Item = BindingFact>) -> BindingFact {
            let collected: Vec<_> = facts.collect();
            if collected.is_empty() {
                return BindingFact::Unknown;
            }
            if collected.iter().all(|f| f == &collected[0]) {
                return collected.into_iter().next().unwrap();
            }
            if let Some(len) = collected.iter().find_map(|f| {
                if let BindingFact::Tuple(elems) = f {
                    Some(elems.len())
                } else {
                    None
                }
            }) {
                if collected
                    .iter()
                    .all(|f| matches!(f, BindingFact::Tuple(e) if e.len() == len))
                {
                    let tuples: Vec<_> = collected
                        .iter()
                        .map(|f| match f {
                            BindingFact::Tuple(e) => e.as_slice(),
                            _ => unreachable!(),
                        })
                        .collect();
                    let merged: Vec<_> = (0..len)
                        .map(|i| {
                            let known: Vec<_> = tuples
                                .iter()
                                .map(|t| &t[i])
                                .filter(|f| !matches!(f, BindingFact::Unknown))
                                .collect();
                            if known.is_empty() {
                                BindingFact::Unknown
                            } else if known.iter().all(|f| *f == known[0]) {
                                known[0].clone()
                            } else {
                                BindingFact::Unknown
                            }
                        })
                        .collect();
                    return BindingFact::Tuple(merged);
                }
            }
            return BindingFact::Unknown;
        }

        fn typed_fact(&self, rust_type: &Type) -> BindingFact {
            self.typed_fact_at_depth(rust_type, 0)
        }

        fn typed_fact_at_depth(&self, rust_type: &Type, depth: usize) -> BindingFact {
            if depth > 16 {
                return BindingFact::Unknown;
            }
            if let Some(kind) = hash_collection_type(rust_type, self.context) {
                return kind;
            }
            if let Some(inner) = option_inner_type(rust_type) {
                return BindingFact::Option(Box::new(self.typed_fact_at_depth(inner, depth)));
            }
            if let Some(ok_type) = result_ok_type(rust_type) {
                return BindingFact::Option(Box::new(self.typed_fact_at_depth(ok_type, depth)));
            }
            if let Some(array_type) = fixed_typed_array_type(rust_type) {
                return BindingFact::TypedArray(array_type.to_string());
            }
            if let Some(inner) = sequence_inner_type(rust_type) {
                let element = self.typed_fact_at_depth(inner, depth);
                return BindingFact::Sequence(Box::new(
                    if element.has_source_structure()
                        || matches!(element, BindingFact::TypedArray(_))
                    {
                        element
                    } else {
                        BindingFact::Unknown
                    },
                ));
            }
            if let Type::Group(group) = rust_type {
                return self.typed_fact_at_depth(&group.elem, depth);
            }
            if let Type::Paren(paren) = rust_type {
                return self.typed_fact_at_depth(&paren.elem, depth);
            }
            if let Type::Reference(reference) = rust_type {
                return self.typed_fact_at_depth(&reference.elem, depth);
            }
            if let Type::Tuple(tuple) = rust_type {
                return BindingFact::Tuple(
                    tuple
                        .elems
                        .iter()
                        .map(|element| self.typed_fact_at_depth(element, depth))
                        .collect(),
                );
            }
            if let Some(name) = primitive_type_identity(rust_type) {
                return BindingFact::Structure(name);
            }
            if let Type::Path(path) = rust_type
                && path.qself.is_none()
            {
                if let Some(resolved) = self.resolve_type_alias_definition(&path.path) {
                    if !matches!(&resolved, Type::Path(_)) {
                        return self.typed_fact_at_depth(&resolved, depth + 1);
                    }
                }
            }
            return context_type_identity(self.context, rust_type)
                .map_or(BindingFact::Unknown, BindingFact::Structure);
        }

        fn resolve_type_alias_definition(&self, path: &syn::Path) -> Option<Type> {
            let from = current_source(self.context)?;
            let (owner, alias) =
                resolve_path_owner(self.context, TYPE_ALIAS_OWNER_MARKER, &from, path)?;
            let definition = unique_marker_suffix(
                self.context,
                &format!(
                    "{TYPE_ALIAS_DEFINITION_MARKER}{owner}{PROVENANCE_SEPARATOR}{alias}{PROVENANCE_SEPARATOR}"
                ),
            )?;
            syn::parse_str::<Type>(&definition).ok()
        }
    }

    impl<'ast> syn::visit::Visit<'ast> for Resolver<'_> {
        fn visit_block(&mut self, block: &'ast syn::Block) {
            self.scopes.push(BTreeMap::new());
            syn::visit::visit_block(self, block);
            self.scopes.pop();
        }

        fn visit_expr_closure(&mut self, closure: &'ast syn::ExprClosure) {
            self.closure_depth += 1;
            self.scopes.push(BTreeMap::new());
            for input in &closure.inputs {
                self.bind_pattern(input, BindingFact::Unknown);
            }
            self.visit_expr(&closure.body);
            self.scopes.pop();
            self.closure_depth -= 1;
        }

        fn visit_expr_method_call(&mut self, call: &'ast syn::ExprMethodCall) {
            self.visit_expr(&call.receiver);
            let method = call.method.to_string();
            let is_iterator_adapter = matches!(
                method.as_str(),
                "map"
                    | "flat_map"
                    | "filter"
                    | "filter_map"
                    | "for_each"
                    | "find"
                    | "find_map"
                    | "any"
                    | "all"
                    | "position"
                    | "inspect"
                    | "take_while"
                    | "skip_while"
                    | "partition"
                    | "fold"
                    | "reduce"
                    | "scan"
                    | "try_fold"
                    | "try_for_each"
            );
            if is_iterator_adapter {
                if let Some(Expr::Closure(closure)) = call.args.first() {
                    let element_fact = match self.initializer_fact(&call.receiver) {
                        BindingFact::Sequence(element) => *element,
                        BindingFact::TypedArray(ref name) => typed_array_element_primitive(name)
                            .map(|p| BindingFact::Structure(p.to_string()))
                            .unwrap_or(BindingFact::Unknown),
                        _ => BindingFact::Unknown,
                    };
                    self.scopes.push(BTreeMap::new());
                    let mut inputs = closure.inputs.iter();
                    if method == "fold" || method == "try_fold" || method == "scan" {
                        if let Some(first) = inputs.next() {
                            self.bind_pattern(first, BindingFact::Unknown);
                        }
                    }
                    if let Some(element_param) = inputs.next() {
                        self.bind_pattern(element_param, element_fact);
                    }
                    for remaining in inputs {
                        self.bind_pattern(remaining, BindingFact::Unknown);
                    }
                    self.visit_expr(&closure.body);
                    self.scopes.pop();
                    for arg in call.args.iter().skip(1) {
                        self.visit_expr(arg);
                    }
                    return;
                }
            }
            for arg in &call.args {
                self.visit_expr(arg);
            }
            if method == "push"
                && call.args.len() == 1
                && let Some(receiver) =
                    single_path_identifier(peel_reference_and_paren(&call.receiver))
                && let Some(id) = self.binding_id(&receiver)
                && self.empty_sequence_bindings.contains(&id)
            {
                let candidate = self.expression_typescript_type(&call.args[0]);
                self.record_empty_sequence_candidate(&id, candidate, false);
            }
        }

        fn visit_expr_return(&mut self, expression: &'ast syn::ExprReturn) {
            if self.closure_depth == 0
                && self.result_is_standard_vec
                && let Some(returned) = &expression.expr
                && let Some(name) = single_path_identifier(peel_reference_and_paren(returned))
                && let Some(id) = self.binding_id(&name)
                && self.empty_sequence_bindings.contains(&id)
            {
                self.record_empty_sequence_candidate(&id, self.result_element_type.clone(), true);
            }
            syn::visit::visit_expr_return(self, expression);
        }

        fn visit_expr_for_loop(&mut self, expression: &'ast syn::ExprForLoop) {
            self.visit_expr(&expression.expr);
            let fact = match self.initializer_fact(&expression.expr) {
                BindingFact::Sequence(element) => *element,
                BindingFact::TypedArray(ref name) => typed_array_element_primitive(name)
                    .map(|p| BindingFact::Structure(p.to_string()))
                    .unwrap_or(BindingFact::UnresolvedPattern),
                _ => BindingFact::UnresolvedPattern,
            };
            self.scopes.push(BTreeMap::new());
            self.bind_pattern(&expression.pat, fact);
            self.visit_block(&expression.body);
            self.scopes.pop();
        }

        fn visit_expr_if(&mut self, expression: &'ast syn::ExprIf) {
            self.scopes.push(BTreeMap::new());
            self.visit_expr(&expression.cond);
            self.visit_block(&expression.then_branch);
            self.scopes.pop();
            if let Some((_, otherwise)) = &expression.else_branch {
                self.visit_expr(otherwise);
            }
        }

        fn visit_expr_let(&mut self, expression: &'ast syn::ExprLet) {
            self.visit_expr(&expression.expr);
            let fact = match self.initializer_fact(&expression.expr) {
                BindingFact::Unknown => BindingFact::UnresolvedPattern,
                fact => fact,
            };
            self.bind_pattern(&expression.pat, fact);
        }

        fn visit_expr_match(&mut self, expression: &'ast syn::ExprMatch) {
            self.visit_expr(&expression.expr);
            let nullable_callable_option = single_path_identifier(&expression.expr)
                .and_then(|name| self.binding_id(&name))
                .is_some_and(|id| self.nullable_callable_options.contains(&id));
            let fact = match self.initializer_fact(&expression.expr) {
                BindingFact::Unknown => BindingFact::UnresolvedPattern,
                fact => fact,
            };
            for arm in &expression.arms {
                self.scopes.push(BTreeMap::new());
                self.bind_pattern(&arm.pat, fact.clone());
                if nullable_callable_option
                    && let Pat::TupleStruct(tuple) = &arm.pat
                    && tuple
                        .path
                        .segments
                        .last()
                        .is_some_and(|segment| segment.ident == "Some")
                    && tuple.elems.len() == 1
                    && let Pat::Ident(binding) = tuple.elems.first().expect("one element")
                    && let Some(id) = self.binding_id(&binding.ident.to_string())
                {
                    self.nullable_callable_bindings.insert(id);
                }
                if let Some((_, guard)) = &arm.guard {
                    self.visit_expr(guard);
                }
                self.visit_expr(&arm.body);
                self.scopes.pop();
            }
        }

        fn visit_expr_while(&mut self, expression: &'ast syn::ExprWhile) {
            self.scopes.push(BTreeMap::new());
            self.visit_expr(&expression.cond);
            self.visit_block(&expression.body);
            self.scopes.pop();
        }

        fn visit_expr_assign(&mut self, assign: &'ast syn::ExprAssign) {
            self.mark_guard_write(&assign.left);
            syn::visit::visit_expr_assign(self, assign);
        }

        fn visit_expr_binary(&mut self, binary: &'ast syn::ExprBinary) {
            if binary_operator_assigns(&binary.op) {
                self.mark_guard_write(&binary.left);
            }
            syn::visit::visit_expr_binary(self, binary);
        }

        fn visit_expr_unary(&mut self, unary: &'ast syn::ExprUnary) {
            if matches!(unary.op, UnOp::Deref(_))
                && let Some(name) = referenced_path_identifier(&unary.expr)
                && let Some(id) = self.binding_id(&name)
            {
                self.dereferenced.insert(id);
            }
            syn::visit::visit_expr_unary(self, unary);
        }

        fn visit_item_fn(&mut self, _function: &'ast ItemFn) {}

        fn visit_local(&mut self, local: &'ast syn::Local) {
            let nullable_callable_option = local.init.as_ref().is_some_and(|initializer| {
                initializer.diverge.is_none()
                    && self.initializer_is_nullable_callable_option(&initializer.expr)
            });
            let mutex_guard = local
                .init
                .as_ref()
                .is_some_and(|initializer| mutex_guard_receiver(&initializer.expr).is_some());
            let erased_cell = match &local.pat {
                Pat::Type(typed) => rust_type_is_erased_shared_cell(&typed.ty, self.context),
                _ => local.init.as_ref().is_some_and(|initializer| {
                    initializer.diverge.is_none()
                        && (expression_constructs_rw_lock_cell(&initializer.expr)
                            || matches!(initializer.expr.as_ref(), Expr::MethodCall(clone)
                                if clone.method == "clone"
                                    && clone.args.is_empty()
                                    && self.erased_cell_binding(&clone.receiver).is_some()))
                }),
            };
            let mut ref_alias_target = None;
            let mut ref_alias_receiver_capture = None;
            if let Some(initializer) = &local.init
                && let Expr::MethodCall(clone) = initializer.expr.as_ref()
                && clone.method == "clone"
                && clone.args.is_empty()
                && (self.erased_shared_cell_field(&clone.receiver)
                    || (self.erased_cell_binding(&clone.receiver).is_some()
                        && local_pattern_name(&local.pat)
                            .is_some_and(|name| self.written_cell_names.contains(&name))))
            {
                let target = clone.receiver.as_ref().clone();
                if let Some(alias) = local_pattern_name(&local.pat)
                    && let Some((stable, capture, stabilized)) =
                        self.stabilize_ref_alias_target(&target, &alias)
                {
                    ref_alias_target = Some(stabilized.to_token_stream().to_string());
                    ref_alias_receiver_capture =
                        Some((stable, capture.to_token_stream().to_string()));
                } else {
                    ref_alias_target = Some(target.to_token_stream().to_string());
                }
            }
            let mut fact = BindingFact::Unknown;
            let mut retains_nullable_option = false;
            if let Some(initializer) = &local.init {
                self.visit_expr(&initializer.expr);
                if let Some((_, diverge)) = &initializer.diverge {
                    self.visit_expr(diverge);
                }
                fact = self.initializer_fact(&initializer.expr);
                if initializer.diverge.is_none() {
                    let retains = self.initializer_retains_nullable_option(&initializer.expr);
                    retains_nullable_option = if current_source(self.context).is_some() {
                        expression_is_type_script_nullable_option_return(
                            &initializer.expr,
                            self.context,
                        ) || self.expression_is_type_script_nullable_option_field(&initializer.expr)
                            || self.initializer_is_nullable_callable_return(&initializer.expr)
                    } else {
                        matches!(&fact, BindingFact::Option(_)) && retains
                    };
                }
            }
            if matches!(fact, BindingFact::Unknown)
                && let Pat::Type(typed) = &local.pat
            {
                let typed_fallback = self.typed_fact(&typed.ty);
                if !matches!(typed_fallback, BindingFact::Unknown) {
                    fact = typed_fallback;
                }
            }
            let shared_identity = match &local.pat {
                Pat::Type(typed) => rust_type_is_shared_identity(self.context, &typed.ty),
                _ => local.init.as_ref().is_some_and(|initializer| {
                    initializer.diverge.is_none()
                        && self.initializer_is_shared_identity(&initializer.expr)
                }),
            };
            let returned_external_struct = local.init.as_ref().and_then(|initializer| {
                initializer
                    .diverge
                    .is_none()
                    .then(|| external_struct_return(&initializer.expr, self.context))
                    .flatten()
            });
            self.bind_pattern(&local.pat, fact);
            if let Some(initializer) = &local.init
                && let Some(kind) = empty_vec_initializer(&initializer.expr, self.context)
                && let Some(name) = local_pattern_name(&local.pat)
                && let Some(id) = self.binding_id(&name)
            {
                self.empty_sequence_bindings.insert(id.clone());
                match kind {
                    EmptyVecInitializer::Standard(constructor_element) => {
                        let declared_element = match &local.pat {
                            Pat::Type(typed) => {
                                let element = standard_vec_inner_type(&typed.ty, self.context);
                                if element.is_none() {
                                    self.record_empty_sequence_candidate(&id, None, true);
                                }
                                element
                            }
                            _ => None,
                        };
                        for element in [declared_element, constructor_element]
                            .into_iter()
                            .flatten()
                        {
                            let candidate =
                                safe_collection_element_typescript_type(element, self.context);
                            self.record_empty_sequence_candidate(&id, candidate, true);
                        }
                    }
                    EmptyVecInitializer::UnprovenOwner => {
                        self.record_empty_sequence_candidate(&id, None, true);
                    }
                }
            }
            if nullable_callable_option
                && let Some(name) = local_pattern_name(&local.pat)
                && let Some(id) = self.binding_id(&name)
            {
                self.nullable_callable_options.insert(id);
            }
            self.mark_shared_identity(&local.pat, shared_identity);
            if let Pat::Type(typed) = &local.pat {
                self.mark_external_struct(&typed.pat, &typed.ty);
            } else if let Some(external) = returned_external_struct
                && let Some(name) = local_pattern_name(&local.pat)
                && let Some(id) = self.binding_id(&name)
            {
                self.external_structs.insert(id, external);
            }
            if retains_nullable_option
                && let Some(name) = local_pattern_name(&local.pat)
                && let Some(id) = self.binding_id(&name)
            {
                self.nullable_option_bindings.insert(id);
            }
            if let Some(target) = ref_alias_target
                && let Some(name) = local_pattern_name(&local.pat)
                && let Some(id) = self.binding_id(&name)
            {
                if let Some((stable, capture)) = ref_alias_receiver_capture {
                    self.ref_alias_receiver_captures
                        .push((id.clone(), stable, capture));
                }
                self.ref_aliases.push((id, target));
            }
            if mutex_guard
                && let Some(name) = local_pattern_name(&local.pat)
                && let Some(id) = self.binding_id(&name)
            {
                self.mutex_guards.insert(id);
            }
            if let Some(initializer) = &local.init
                && let Some(receiver) = direct_lock_guard_receiver(&initializer.expr)
                && expression_is_plain_place(receiver)
                && let Some(name) = local_pattern_name(&local.pat)
                && let Some(id) = self.binding_id(&name)
            {
                self.direct_guards.insert(id, receiver.clone());
            }
            if erased_cell
                && !pattern_is_mutable(&local.pat)
                && let Some(name) = local_pattern_name(&local.pat)
                && let Some(id) = self.binding_id(&name)
            {
                self.erased_cells.insert(id);
            }
        }
    }

    fn single_path_identifier(expression: &Expr) -> Option<String> {
        let Expr::Path(path) = expression else {
            return None;
        };
        if path.qself.is_some() || path.path.segments.len() != 1 {
            return None;
        }
        return Some(path.path.segments[0].ident.to_string());
    }

    let mut reserved_identifiers = ReservedIdentifierCollector {
        names: HashSet::new(),
    };
    reserved_identifiers.visit_item_fn(function);
    let function_name = function.sig.ident.to_string();
    let mut declaration_counter = DeclarationCounter {
        counts: HashMap::new(),
    };
    declaration_counter.visit_item_fn(function);
    let mut guard_written_names = GuardWrittenNames {
        guards: HashMap::new(),
        names: HashSet::new(),
    };
    guard_written_names.visit_item_fn(function);
    let result_element = match &function.sig.output {
        ReturnType::Type(_, rust_type) => standard_vec_inner_type(rust_type, context),
        ReturnType::Default => None,
    };
    let result_is_standard_vec = result_element.is_some();
    let result_element_type = result_element
        .and_then(|element| safe_collection_element_typescript_type(element, context));
    let mut resolver = Resolver {
        closure_depth: 0,
        context,
        declaration_counts: declaration_counter.counts,
        dereferenced: HashSet::new(),
        direct_guards: HashMap::new(),
        empty_sequence_authoritative: BTreeSet::new(),
        empty_sequence_bindings: BTreeSet::new(),
        empty_sequence_candidates: BTreeMap::new(),
        empty_sequence_unproven: BTreeSet::new(),
        erased_cells: HashSet::new(),
        facts: Vec::new(),
        function: match current_source(context) {
            Some(module) => format!("{module}::{function_name}"),
            None => function_name,
        },
        mutex_guards: HashSet::new(),
        nullable_callable_bindings: HashSet::new(),
        nullable_callable_options: HashSet::new(),
        nullable_option_bindings: HashSet::new(),
        ordinal: 0,
        ref_aliases: Vec::new(),
        ref_alias_receiver_captures: Vec::new(),
        reserved_identifiers: reserved_identifiers.names,
        scopes: vec![BTreeMap::new()],
        external_structs: BTreeMap::new(),
        shared_identities: BTreeSet::new(),
        sites: Vec::new(),
        replaced_guards: HashSet::new(),
        result_element_type,
        result_is_standard_vec,
        written_cell_names: guard_written_names.names,
        written_cells: HashSet::new(),
    };
    for fn_argument in &function.sig.inputs {
        let FnArg::Typed(argument) = fn_argument else {
            continue;
        };
        let fact = if uint8_array_parameter(function, fn_argument, context).is_some() {
            BindingFact::TypedArray("Uint8Array".to_string())
        } else {
            resolver.typed_fact(&argument.ty)
        };
        resolver.bind_pattern(&argument.pat, fact);
        let cell_type = match argument.ty.as_ref() {
            Type::Reference(reference) if reference.mutability.is_none() => reference.elem.as_ref(),
            rust_type => rust_type,
        };
        if !pattern_is_mutable(&argument.pat)
            && rust_type_is_erased_shared_cell(cell_type, context)
            && let Some(name) = local_pattern_name(&argument.pat)
            && let Some(id) = resolver.binding_id(&name)
        {
            resolver.erased_cells.insert(id);
        }
        let shared_identity = rust_type_is_shared_identity(context, &argument.ty);
        resolver.mark_shared_identity(&argument.pat, shared_identity);
        resolver.mark_external_struct(&argument.pat, &argument.ty);
    }
    let parameters = resolver.scopes[0].clone();
    syn::visit::Visit::visit_block(&mut resolver, &function.block);
    let mut markers = Vec::new();
    for id in &resolver.empty_sequence_bindings {
        let candidates = resolver.empty_sequence_candidates.get(id);
        if let Some(candidates) = candidates
            && candidates.len() == 1
            && (resolver.empty_sequence_authoritative.contains(id)
                || !resolver.empty_sequence_unproven.contains(id))
        {
            markers.push(format!(
                "{EMPTY_SEQUENCE_ELEMENT_TYPE_MARKER}{id}{PROVENANCE_SEPARATOR}{}",
                candidates.first().expect("one candidate")
            ));
        }
    }
    for (site, id) in resolver.sites {
        markers.push(format!("{BINDING_SITE_MARKER}{site}={id}"));
    }
    for (id, fact) in resolver.facts {
        markers.push(format!(
            "{BINDING_FACT_MARKER}{id}={}",
            binding_fact_marker(&fact)
        ));
    }
    for id in &resolver.shared_identities {
        markers.push(format!("{SHARED_IDENTITY_BINDING_MARKER}{id}"));
    }
    for (id, external) in &resolver.external_structs {
        markers.push(format!(
            "{EXTERNAL_STRUCT_BINDING_MARKER}{id}{PROVENANCE_SEPARATOR}{external}"
        ));
    }
    for (id, target) in resolver.ref_aliases {
        markers.push(format!(
            "{REF_ALIAS_TARGET_MARKER}{id}{PROVENANCE_SEPARATOR}{target}"
        ));
    }
    for (id, stable, capture) in resolver.ref_alias_receiver_captures {
        markers.push(format!(
            "{REF_ALIAS_RECEIVER_CAPTURE_MARKER}{id}{PROVENANCE_SEPARATOR}{stable}{PROVENANCE_SEPARATOR}{capture}"
        ));
    }
    for (name, id) in parameters {
        markers.push(format!("{BINDING_MARKER}{name}={id}"));
    }
    for id in &resolver.written_cells {
        markers.push(format!("{ERASED_CELL_WRITTEN_MARKER}{id}"));
    }
    for id in &resolver.replaced_guards {
        markers.push(format!("{DIRECT_LOCK_GUARD_REPLACED_MARKER}{id}"));
    }
    for id in resolver.mutex_guards.intersection(&resolver.dereferenced) {
        markers.push(format!("{MUTEX_GUARD_BINDING_MARKER}{id}"));
    }
    for id in resolver.nullable_option_bindings {
        markers.push(format!("{NULLABLE_OPTION_BINDING_MARKER}{id}"));
    }
    for id in resolver.nullable_callable_bindings {
        markers.push(format!("{NULLABLE_OPTION_CALLABLE_BINDING_MARKER}{id}"));
    }
    context.extend(markers);
}
