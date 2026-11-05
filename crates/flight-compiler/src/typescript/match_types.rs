use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub(super) enum RuntimeCategory {
    Null,
    Boolean,
    Number,
    String,
    Array,
    Record,
    Function,
    Object,
}

pub(super) struct DataUnionPatternTest {
    pub(super) bindings: Vec<(String, String)>,
    pub(super) predicate: Option<String>,
}

pub(super) struct TaggedDataUnionPattern {
    pub(super) bindings: BTreeMap<String, String>,
    pub(super) owner: String,
    pub(super) variant: String,
}

pub(super) enum TaggedDataUnionPatternAnalysis {
    CatchAll(Option<String>),
    Ordinary,
    Variants(Vec<TaggedDataUnionPattern>),
}

pub(super) struct TaggedDataUnionMatchArm {
    pub(super) catch_all_binding: Option<String>,
    pub(super) otherwise: bool,
    pub(super) variants: Vec<TaggedDataUnionPattern>,
}

pub(super) struct ReservedKeyDataUnionPattern {
    pub(super) binding: Option<String>,
    pub(super) fallback: bool,
    pub(super) keys: BTreeSet<String>,
    pub(super) owner: String,
    pub(super) payload_type: String,
    pub(super) variant: String,
}

pub(super) enum ReservedKeyDataUnionPatternAnalysis {
    CatchAll(Option<String>),
    Ordinary,
    Variants(Vec<ReservedKeyDataUnionPattern>),
}

pub(super) struct DataUnionMatchArm {
    pub(super) binding: Option<String>,
    pub(super) binding_type: Option<String>,
    pub(super) categories: BTreeSet<RuntimeCategory>,
    pub(super) catch_all: bool,
    pub(super) reserved_key_variants: Vec<(BTreeSet<String>, bool)>,
}

pub(super) struct DataUnionPattern {
    pub(super) binding: Option<String>,
    pub(super) categories: BTreeSet<RuntimeCategory>,
    pub(super) owner: String,
    pub(super) variant: String,
}

pub(super) enum DataUnionPatternAnalysis {
    CatchAll(Option<String>),
    Ordinary,
    Variants(Vec<DataUnionPattern>),
}

pub(super) struct InferredTaggedDataUnionMatchArm {
    pub(super) binding: Option<String>,
    pub(super) catch_all: bool,
    pub(super) field_bindings: Vec<(String, String)>,
    pub(super) variants: Vec<String>,
}

pub(super) struct OptionMatchArm {
    pub(super) binding: Option<String>,
    pub(super) present: bool,
}

pub(super) struct OptionWrappedInferredDataUnionMatchArm {
    pub(super) binding: Option<String>,
    pub(super) field_bindings: Vec<(String, String)>,
    pub(super) none_arm: bool,
    pub(super) variants: Vec<String>,
}

pub(super) enum TupleOptionElement {
    SomeBinding(String),
    SomeWild,
    None,
    Wild,
}

pub(super) struct TupleOptionMatchArm {
    pub(super) elements: Vec<TupleOptionElement>,
    pub(super) catch_all: bool,
}

pub(super) enum GeneralTupleElementCondition {
    Literal(String),
    EnumVariant(String),
    DataUnionKind(String),
    OptionSome(String),
    OptionNone(String),
    Wild,
}

pub(super) struct GeneralTupleElement {
    pub(super) condition: GeneralTupleElementCondition,
    pub(super) binding: Option<String>,
    pub(super) field_bindings: Vec<(String, String)>,
}

pub(super) struct GeneralTupleAlternative {
    pub(super) elements: Vec<GeneralTupleElement>,
}

pub(super) struct GeneralTupleMatchArm {
    pub(super) catch_all: bool,
    pub(super) alternatives: Vec<GeneralTupleAlternative>,
}

pub(super) struct ExternalIdentityAlias {
    pub(super) module: String,
    pub(super) tag: String,
}

impl RuntimeCategory {
    pub(super) fn name(self) -> &'static str {
        return match self {
            Self::Null => "null",
            Self::Boolean => "boolean",
            Self::Number => "number",
            Self::String => "string",
            Self::Array => "array",
            Self::Record => "record",
            Self::Function => "function",
            Self::Object => "object",
        };
    }

    pub(super) fn parse(name: &str) -> Option<Self> {
        return match name {
            "null" => Some(Self::Null),
            "boolean" => Some(Self::Boolean),
            "number" => Some(Self::Number),
            "string" => Some(Self::String),
            "array" => Some(Self::Array),
            "record" => Some(Self::Record),
            "function" => Some(Self::Function),
            "object" => Some(Self::Object),
            _ => None,
        };
    }
}
