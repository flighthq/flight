use std::collections::{BTreeMap, BTreeSet, HashSet};

use syn::visit::Visit;

use super::{
    EXTERNAL_MUT_VEC_PARAMETERS_MARKER, MUT_VEC_PARAMETERS_MARKER, PROVENANCE_SEPARATOR, call_fact,
    external_function_fact, is_internal_type_export, is_lowered_cross_crate_type,
    is_lowered_cross_crate_value, is_string_union, is_transparent_data_union_variant,
    path_owner_and_member, visit_cross_crate_macro_arguments,
};

#[derive(Clone)]
pub(crate) struct CrossCrateSymbol {
    pub(crate) imported: String,
    pub(crate) local: String,
    pub(crate) module: String,
}

pub(super) struct CrossCrateUsageCollector<'a> {
    pub(super) context: &'a HashSet<String>,
    pub(super) symbols: &'a BTreeMap<String, CrossCrateSymbol>,
    pub(super) struct_literals_are_types: bool,
    pub(super) type_names: BTreeSet<String>,
    pub(super) value_names: BTreeSet<String>,
}

impl CrossCrateUsageCollector<'_> {
    pub(super) fn record_type_path(&mut self, path: &syn::Path) {
        let Some(segment) = path.segments.first() else {
            return;
        };
        let name = segment.ident.to_string();
        if self.symbols.contains_key(&name)
            && !is_lowered_cross_crate_type(&name)
            && !is_internal_type_export(self.context, &name)
        {
            self.type_names.insert(name);
        }
    }

    pub(super) fn record_value_path(&mut self, path: &syn::Path) {
        let Some(segment) = path.segments.first() else {
            return;
        };
        let name = segment.ident.to_string();
        if self.symbols.contains_key(&name) && !is_lowered_cross_crate_value(&name) {
            self.value_names.insert(name);
        }
    }
}

impl<'ast> Visit<'ast> for CrossCrateUsageCollector<'_> {
    fn visit_expr_path(&mut self, expression: &'ast syn::ExprPath) {
        if expression.qself.is_none() {
            if let Some((owner, member)) = path_owner_and_member(&expression.path)
                && (is_string_union(self.context, &owner)
                    || is_transparent_data_union_variant(self.context, &owner, &member))
            {
                return;
            }
            self.record_value_path(&expression.path);
        }
        syn::visit::visit_expr_path(self, expression);
    }

    fn visit_expr_struct(&mut self, expression: &'ast syn::ExprStruct) {
        if self.struct_literals_are_types && expression.qself.is_none() {
            self.record_type_path(&expression.path);
        }
        syn::visit::visit_expr_struct(self, expression);
    }

    fn visit_macro(&mut self, mac: &'ast syn::Macro) {
        visit_cross_crate_macro_arguments(self, mac);
        syn::visit::visit_macro(self, mac);
    }

    fn visit_pat_struct(&mut self, pattern: &'ast syn::PatStruct) {
        if pattern.qself.is_none() {
            if let Some((owner, _)) = path_owner_and_member(&pattern.path)
                && is_string_union(self.context, &owner)
            {
                self.record_type_path(&pattern.path);
            } else {
                self.record_value_path(&pattern.path);
            }
        }
        syn::visit::visit_pat_struct(self, pattern);
    }

    fn visit_pat_tuple_struct(&mut self, pattern: &'ast syn::PatTupleStruct) {
        if pattern.qself.is_none() {
            if let Some((owner, member)) = path_owner_and_member(&pattern.path)
                && (is_string_union(self.context, &owner)
                    || is_transparent_data_union_variant(self.context, &owner, &member))
            {
                self.record_type_path(&pattern.path);
            } else {
                self.record_value_path(&pattern.path);
            }
        }
        syn::visit::visit_pat_tuple_struct(self, pattern);
    }

    fn visit_item_fn(&mut self, function: &'ast syn::ItemFn) {
        for element in out_parameter_element_types(&function.block, self.context) {
            self.visit_type(&element);
        }
        syn::visit::visit_item_fn(self, function);
    }

    fn visit_type_path(&mut self, rust_type: &'ast syn::TypePath) {
        if rust_type.qself.is_none() {
            self.record_type_path(&rust_type.path);
        }
        syn::visit::visit_type_path(self, rust_type);
    }
}

// The element types an emitted body names without the Rust source spelling them: an untyped empty
// `Vec` local whose element comes from a `&mut Vec<element>` parameter it is passed to. The emitted
// annotation (`const out: Element[] = []`) needs that type imported.
pub(crate) fn out_parameter_element_types(
    block: &syn::Block,
    context: &HashSet<String>,
) -> Vec<syn::Type> {
    struct Collector<'a> {
        context: &'a HashSet<String>,
        empty_locals: BTreeSet<String>,
        calls: Vec<&'a syn::ExprCall>,
    }
    impl<'a> Visit<'a> for Collector<'a> {
        fn visit_local(&mut self, local: &'a syn::Local) {
            if let syn::Pat::Ident(pattern) = &local.pat
                && let Some(initializer) = &local.init
                && expression_is_empty_vec(&initializer.expr)
            {
                self.empty_locals.insert(pattern.ident.to_string());
            }
            syn::visit::visit_local(self, local);
        }

        fn visit_expr_call(&mut self, call: &'a syn::ExprCall) {
            self.calls.push(call);
            syn::visit::visit_expr_call(self, call);
        }
    }
    let mut collector = Collector {
        context,
        empty_locals: BTreeSet::new(),
        calls: Vec::new(),
    };
    collector.visit_block(block);
    let mut elements = Vec::new();
    for call in collector.calls {
        let syn::Expr::Path(function) = call.func.as_ref() else {
            continue;
        };
        if function.qself.is_some() {
            continue;
        }
        let Some(parameters) =
            call_fact(collector.context, MUT_VEC_PARAMETERS_MARKER, &function.path).or_else(|| {
                external_function_fact(
                    &function.path,
                    collector.context,
                    EXTERNAL_MUT_VEC_PARAMETERS_MARKER,
                )
            })
        else {
            continue;
        };
        for parameter in parameters.split(',') {
            let Some((index, element)) = parameter.split_once('=') else {
                continue;
            };
            let Some(syn::Expr::Reference(reference)) = index
                .parse::<usize>()
                .ok()
                .and_then(|index| call.args.iter().nth(index))
            else {
                continue;
            };
            let passes_empty_local = reference.mutability.is_some()
                && matches!(reference.expr.as_ref(), syn::Expr::Path(local)
                if local.qself.is_none()
                    && local.path.get_ident().is_some_and(|name| {
                        collector.empty_locals.contains(&name.to_string())
                    }));
            if passes_empty_local
                && let Some(spelled) = element.rsplit(PROVENANCE_SEPARATOR).next()
                && let Ok(element) = syn::parse_str::<syn::Type>(spelled)
            {
                elements.push(element);
            }
        }
    }
    return elements;
}

fn expression_is_empty_vec(expression: &syn::Expr) -> bool {
    return match expression {
        syn::Expr::Call(call) => {
            let syn::Expr::Path(path) = call.func.as_ref() else {
                return false;
            };
            let segments = &path.path.segments;
            segments.len() == 2
                && segments[0].ident == "Vec"
                && segments[0].arguments.is_none()
                && matches!(
                    segments[1].ident.to_string().as_str(),
                    "new" | "with_capacity"
                )
        }
        syn::Expr::Macro(invocation) => {
            invocation.mac.path.is_ident("vec") && invocation.mac.tokens.is_empty()
        }
        _ => false,
    };
}
