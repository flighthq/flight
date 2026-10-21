use flight_entity::Uint8Array;

use crate::types::*;

const INSTANCE_PROTECTED_NAMESPACE: u8 = 0x08;
const MAX_ENTRIES: usize = 1_000_000;
const METHOD_HAS_OPTIONAL: u8 = 0x08;
const METHOD_HAS_PARAM_NAMES: u8 = 0x80;
const TRAIT_ATTRIBUTE_METADATA: u8 = 0x04;
const VAR_UINT_MAX_BYTES: usize = 5;

struct AbcReader<'a> {
    pos: usize,
    source: &'a Uint8Array,
    valid: bool,
}

fn create_abc_multiname(kind: u8) -> AbcMultiname {
    return AbcMultiname {
        kind,
        name: 0,
        namespace: 0,
        namespace_set: 0,
        parameters: Vec::new(),
        type_name: 0,
    };
}

fn create_abc_reader(source: &Uint8Array) -> AbcReader<'_> {
    return AbcReader {
        pos: 0,
        source,
        valid: true,
    };
}

fn read_abc_class(reader: &mut AbcReader) -> Option<AbcClass> {
    let initializer = reader.read_var_uint();
    let traits = read_abc_traits(reader)?;
    return Some(AbcClass {
        initializer,
        traits,
    });
}

fn read_abc_constant_pool(reader: &mut AbcReader) -> Option<AbcConstantPool> {
    let mut integers = vec![0];
    let integer_count = reader.read_var_uint();
    if !reader.valid || integer_count > MAX_ENTRIES {
        return None;
    }
    for _ in 1..integer_count {
        integers.push(reader.read_var_int());
    }

    let mut unsigned_integers = vec![0];
    let unsigned_integer_count = reader.read_var_uint();
    if !reader.valid || unsigned_integer_count > MAX_ENTRIES {
        return None;
    }
    for _ in 1..unsigned_integer_count {
        unsigned_integers.push(reader.read_var_uint() as u32);
    }

    let mut doubles = vec![f64::NAN];
    let double_count = reader.read_var_uint();
    if !reader.valid || double_count > MAX_ENTRIES {
        return None;
    }
    for _ in 1..double_count {
        doubles.push(read_double(reader));
    }

    let mut strings = vec![String::new()];
    let string_count = reader.read_var_uint();
    if !reader.valid || string_count > MAX_ENTRIES {
        return None;
    }
    for _ in 1..string_count {
        strings.push(reader.read_string());
    }

    let mut namespaces = vec![AbcNamespace { kind: 0, name: 0 }];
    let namespace_count = reader.read_var_uint();
    if !reader.valid || namespace_count > MAX_ENTRIES {
        return None;
    }
    for _ in 1..namespace_count {
        namespaces.push(AbcNamespace {
            kind: reader.read_uint8(),
            name: reader.read_var_uint(),
        });
        if !reader.valid {
            return None;
        }
    }

    let mut namespace_sets = vec![Vec::new()];
    let namespace_set_count = reader.read_var_uint();
    if !reader.valid || namespace_set_count > MAX_ENTRIES {
        return None;
    }
    for _ in 1..namespace_set_count {
        let count = reader.read_var_uint();
        if !reader.valid || count > MAX_ENTRIES {
            return None;
        }
        let mut set = Vec::new();
        for _ in 0..count {
            set.push(reader.read_var_uint());
        }
        if !reader.valid {
            return None;
        }
        namespace_sets.push(set);
    }

    let mut multinames = vec![create_abc_multiname(0)];
    let multiname_count = reader.read_var_uint();
    if !reader.valid || multiname_count > MAX_ENTRIES {
        return None;
    }
    for _ in 1..multiname_count {
        multinames.push(read_abc_multiname(reader)?);
    }

    if !reader.valid {
        return None;
    }
    return Some(AbcConstantPool {
        doubles,
        integers,
        multinames,
        namespace_sets,
        namespaces,
        strings,
        unsigned_integers,
    });
}

pub fn read_abc_file(source: &Uint8Array) -> Option<AbcFile> {
    let mut reader = AbcReader::new(source);
    let minor_version = reader.read_uint16();
    let major_version = reader.read_uint16();
    if !reader.valid {
        return None;
    }

    let constant_pool = read_abc_constant_pool(&mut reader)?;

    let method_count = reader.read_var_uint();
    if !reader.valid || method_count > MAX_ENTRIES {
        return None;
    }
    let mut methods = Vec::new();
    for _ in 0..method_count {
        methods.push(read_abc_method(&mut reader)?);
    }

    let metadata_count = reader.read_var_uint();
    if !reader.valid || metadata_count > MAX_ENTRIES {
        return None;
    }
    let mut metadata = Vec::new();
    for _ in 0..metadata_count {
        metadata.push(read_abc_metadata(&mut reader)?);
    }

    let class_count = reader.read_var_uint();
    if !reader.valid || class_count > MAX_ENTRIES {
        return None;
    }
    let mut instances = Vec::new();
    for _ in 0..class_count {
        instances.push(read_abc_instance(&mut reader)?);
    }
    let mut classes = Vec::new();
    for _ in 0..class_count {
        classes.push(read_abc_class(&mut reader)?);
    }

    let script_count = reader.read_var_uint();
    if !reader.valid || script_count > MAX_ENTRIES {
        return None;
    }
    let mut scripts = Vec::new();
    for _ in 0..script_count {
        scripts.push(read_abc_script(&mut reader)?);
    }

    let body_count = reader.read_var_uint();
    if !reader.valid || body_count > MAX_ENTRIES {
        return None;
    }
    let mut method_bodies = Vec::new();
    for _ in 0..body_count {
        method_bodies.push(read_abc_method_body(&mut reader)?);
    }

    if !reader.valid {
        return None;
    }
    return Some(AbcFile {
        classes,
        constant_pool,
        instances,
        major_version,
        metadata,
        method_bodies,
        methods,
        minor_version,
        scripts,
    });
}

fn read_abc_instance(reader: &mut AbcReader) -> Option<AbcInstance> {
    let name = reader.read_var_uint();
    let super_name = reader.read_var_uint();
    let flags = reader.read_uint8();
    let protected_namespace = if flags & INSTANCE_PROTECTED_NAMESPACE != 0 {
        reader.read_var_uint()
    } else {
        0
    };
    let interface_count = reader.read_var_uint();
    if !reader.valid || interface_count > MAX_ENTRIES {
        return None;
    }
    let mut interfaces = Vec::new();
    for _ in 0..interface_count {
        interfaces.push(reader.read_var_uint());
    }
    let initializer = reader.read_var_uint();
    let traits = read_abc_traits(reader)?;
    return Some(AbcInstance {
        flags,
        initializer,
        interfaces,
        name,
        protected_namespace,
        super_name,
        traits,
    });
}

fn read_abc_metadata(reader: &mut AbcReader) -> Option<AbcMetadata> {
    let name = reader.read_var_uint();
    let count = reader.read_var_uint();
    if !reader.valid || count > MAX_ENTRIES {
        return None;
    }
    let mut items = Vec::new();
    for _ in 0..count {
        items.push(AbcMetadataItem {
            key: reader.read_var_uint(),
            value: reader.read_var_uint(),
        });
    }
    if !reader.valid {
        return None;
    }
    return Some(AbcMetadata { items, name });
}

fn read_abc_method(reader: &mut AbcReader) -> Option<AbcMethod> {
    let parameter_count = reader.read_var_uint();
    if !reader.valid || parameter_count > MAX_ENTRIES {
        return None;
    }
    let return_type = reader.read_var_uint();
    let mut parameter_types = Vec::new();
    for _ in 0..parameter_count {
        parameter_types.push(reader.read_var_uint());
    }
    let name = reader.read_var_uint();
    let flags = reader.read_uint8();
    if !reader.valid {
        return None;
    }

    let mut optional_values = Vec::new();
    if flags & METHOD_HAS_OPTIONAL != 0 {
        let count = reader.read_var_uint();
        if !reader.valid || count > MAX_ENTRIES {
            return None;
        }
        for _ in 0..count {
            optional_values.push(AbcOptionalValue {
                kind: 0,
                value: reader.read_var_uint(),
            });
        }
        for optional in &mut optional_values {
            optional.kind = reader.read_uint8();
        }
    }

    let mut parameter_names = Vec::new();
    if flags & METHOD_HAS_PARAM_NAMES != 0 {
        for _ in 0..parameter_count {
            parameter_names.push(reader.read_var_uint());
        }
    }
    if !reader.valid {
        return None;
    }
    return Some(AbcMethod {
        flags,
        name,
        parameter_names,
        parameter_types,
        optional_values,
        return_type,
    });
}

fn read_abc_method_body(reader: &mut AbcReader) -> Option<AbcMethodBody> {
    let method = reader.read_var_uint();
    let max_stack = reader.read_var_uint();
    let local_count = reader.read_var_uint();
    let init_scope_depth = reader.read_var_uint();
    let max_scope_depth = reader.read_var_uint();
    let code_length = reader.read_var_uint();
    if !reader.valid || code_length > reader.remaining() {
        return None;
    }
    let code = reader.read_bytes(code_length);

    let exception_count = reader.read_var_uint();
    if !reader.valid || exception_count > MAX_ENTRIES {
        return None;
    }
    let mut exceptions = Vec::new();
    for _ in 0..exception_count {
        exceptions.push(AbcException {
            from: reader.read_var_uint(),
            to: reader.read_var_uint(),
            target: reader.read_var_uint(),
            exception_type: reader.read_var_uint(),
            variable_name: reader.read_var_uint(),
        });
    }

    let traits = read_abc_traits(reader)?;
    return Some(AbcMethodBody {
        code,
        exceptions,
        init_scope_depth,
        local_count,
        max_scope_depth,
        max_stack,
        method,
        traits,
    });
}

fn read_abc_multiname(reader: &mut AbcReader) -> Option<AbcMultiname> {
    let mut multiname = create_abc_multiname(reader.read_uint8());
    if multiname.kind == AbcMultinameKind::QName as u8
        || multiname.kind == AbcMultinameKind::QNameA as u8
    {
        multiname.namespace = reader.read_var_uint();
        multiname.name = reader.read_var_uint();
    } else if multiname.kind == AbcMultinameKind::RtqName as u8
        || multiname.kind == AbcMultinameKind::RtqNameA as u8
    {
        multiname.name = reader.read_var_uint();
    } else if multiname.kind == AbcMultinameKind::RtqNameL as u8
        || multiname.kind == AbcMultinameKind::RtqNameLA as u8
    {
    } else if multiname.kind == AbcMultinameKind::Multiname as u8
        || multiname.kind == AbcMultinameKind::MultinameA as u8
    {
        multiname.name = reader.read_var_uint();
        multiname.namespace_set = reader.read_var_uint();
    } else if multiname.kind == AbcMultinameKind::MultinameL as u8
        || multiname.kind == AbcMultinameKind::MultinameLA as u8
    {
        multiname.namespace_set = reader.read_var_uint();
    } else if multiname.kind == AbcMultinameKind::TypeName as u8 {
        multiname.type_name = reader.read_var_uint();
        let count = reader.read_var_uint();
        if count > MAX_ENTRIES {
            return None;
        }
        for _ in 0..count {
            multiname.parameters.push(reader.read_var_uint());
        }
    } else {
        return None;
    }
    if !reader.valid {
        return None;
    }
    return Some(multiname);
}

fn read_abc_script(reader: &mut AbcReader) -> Option<AbcScript> {
    let initializer = reader.read_var_uint();
    let traits = read_abc_traits(reader)?;
    return Some(AbcScript {
        initializer,
        traits,
    });
}

fn read_abc_trait(reader: &mut AbcReader) -> Option<AbcTrait> {
    let name = reader.read_var_uint();
    let packed = reader.read_uint8();
    if !reader.valid {
        return None;
    }
    let kind = packed & 0x0f;
    let mut trait_value = AbcTrait {
        attributes: packed >> 4,
        class_index: 0,
        dispatch_id: 0,
        method_index: 0,
        metadata: Vec::new(),
        name,
        kind,
        slot_id: 0,
        type_name: 0,
        value_index: 0,
        value_kind: 0,
    };

    if kind == AbcTraitKind::Slot as u8 || kind == AbcTraitKind::Const as u8 {
        trait_value.slot_id = reader.read_var_uint();
        trait_value.type_name = reader.read_var_uint();
        trait_value.value_index = reader.read_var_uint();
        if trait_value.value_index != 0 {
            trait_value.value_kind = reader.read_uint8();
        }
    } else if kind == AbcTraitKind::Class as u8 {
        trait_value.slot_id = reader.read_var_uint();
        trait_value.class_index = reader.read_var_uint();
    } else if kind == AbcTraitKind::Function as u8 {
        trait_value.slot_id = reader.read_var_uint();
        trait_value.method_index = reader.read_var_uint();
    } else if kind == AbcTraitKind::Method as u8
        || kind == AbcTraitKind::Getter as u8
        || kind == AbcTraitKind::Setter as u8
    {
        trait_value.dispatch_id = reader.read_var_uint();
        trait_value.method_index = reader.read_var_uint();
    } else {
        return None;
    }

    if trait_value.attributes & TRAIT_ATTRIBUTE_METADATA != 0 {
        let count = reader.read_var_uint();
        if !reader.valid || count > MAX_ENTRIES {
            return None;
        }
        for _ in 0..count {
            trait_value.metadata.push(reader.read_var_uint());
        }
    }
    if !reader.valid {
        return None;
    }
    return Some(trait_value);
}

fn read_abc_traits(reader: &mut AbcReader) -> Option<Vec<AbcTrait>> {
    let count = reader.read_var_uint();
    if !reader.valid || count > MAX_ENTRIES {
        return None;
    }
    let mut traits = Vec::new();
    for _ in 0..count {
        traits.push(read_abc_trait(reader)?);
    }
    return Some(traits);
}

fn read_bytes(reader: &mut AbcReader, count: usize) -> Box<Uint8Array> {
    if count > reader.remaining() {
        reader.valid = false;
        return Vec::new().into_boxed_slice();
    }
    let value = reader.source[reader.pos..reader.pos + count]
        .to_vec()
        .into_boxed_slice();
    reader.pos += count;
    return value;
}

// flight-lint: allow(f64) ABC double constants are read as exact IEEE-754 binary64 values
fn read_double(reader: &mut AbcReader) -> f64 {
    if reader.remaining() < 8 {
        reader.valid = false;
        return 0.0;
    }
    let mut bytes = [0u8; 8];
    bytes.copy_from_slice(&reader.source[reader.pos..reader.pos + 8]);
    reader.pos += 8;
    return f64::from_le_bytes(bytes);
}

fn read_string(reader: &mut AbcReader) -> String {
    let length = reader.read_var_uint();
    if !reader.valid {
        return String::new();
    }
    let bytes = reader.read_bytes(length);
    return String::from_utf8_lossy(&bytes).into_owned();
}

fn read_uint16(reader: &mut AbcReader) -> u16 {
    let low = reader.read_uint8() as u16;
    return low + (reader.read_uint8() as u16) * 0x100;
}

fn read_uint8(reader: &mut AbcReader) -> u8 {
    if reader.pos >= reader.source.len() {
        reader.valid = false;
        return 0;
    }
    let value = reader.source[reader.pos];
    reader.pos += 1;
    return value;
}

fn read_var_int(reader: &mut AbcReader) -> i32 {
    return reader.read_var_uint() as u32 as i32;
}

fn read_var_uint(reader: &mut AbcReader) -> usize {
    let mut value = 0usize;
    for i in 0..VAR_UINT_MAX_BYTES {
        let byte = reader.read_uint8();
        value = value.wrapping_add(((byte & 0x7f) as usize).wrapping_shl((7 * i) as u32));
        if byte & 0x80 == 0 {
            break;
        }
    }
    return if reader.valid { value } else { 0 };
}

fn remaining(reader: &AbcReader) -> usize {
    return reader.source.len() - reader.pos;
}

impl<'a> AbcReader<'a> {
    fn new(source: &'a Uint8Array) -> Self {
        return create_abc_reader(source);
    }

    fn read_bytes(&mut self, count: usize) -> Box<Uint8Array> {
        return read_bytes(self, count);
    }

    fn read_string(&mut self) -> String {
        return read_string(self);
    }

    fn read_uint16(&mut self) -> u16 {
        return read_uint16(self);
    }

    fn read_uint8(&mut self) -> u8 {
        return read_uint8(self);
    }

    fn read_var_int(&mut self) -> i32 {
        return read_var_int(self);
    }

    fn read_var_uint(&mut self) -> usize {
        return read_var_uint(self);
    }

    fn remaining(&self) -> usize {
        return remaining(self);
    }
}
