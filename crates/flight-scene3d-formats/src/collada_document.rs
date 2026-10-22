use crate::collada_decoder_family::COLLADA_ALL_ELEMENT_DECODERS;
use crate::collada_parse::parse_collada_with_decoders;
use crate::collada_types::{ColladaImportOptions, ColladaParseResult};

#[cfg(test)]
mod sugar_tests {
    use super::*;
    use crate::collada_material_decoder::COLLADA_MATERIAL_DECODER;
    use flight_image::ImageResourceReference;

    #[test]
    fn options_receiver_delegates_the_original_family_and_resource_base_url_to_the_free_parser() {
        let xml = r##"<COLLADA><library_images><image id="i"><init_from>color.png</init_from></image></library_images><library_effects><effect id="fx"><profile_COMMON><newparam sid="surface"><surface><init_from>i</init_from></surface></newparam><newparam sid="sampler"><sampler2D><source>surface</source></sampler2D></newparam><technique><lambert><diffuse><texture texture="sampler"/></diffuse></lambert></technique></profile_COMMON></effect></library_effects><library_materials><material><instance_effect url="#fx"/></material></library_materials></COLLADA>"##;
        let options = ColladaImportOptions {
            base_url: Some("/models".to_string()),
            decoders: Some(vec![COLLADA_MATERIAL_DECODER.clone()]),
        };
        let receiver = options.parse(xml);
        let free = parse_collada(xml, Some(&options));
        assert_eq!(receiver.up_axis, free.up_axis);
        assert_eq!(receiver.root_transform, free.root_transform);
        assert_eq!(
            *receiver.diagnostics.read().unwrap(),
            *free.diagnostics.read().unwrap()
        );
        for result in [receiver, free] {
            let document = result.document.read().unwrap();
            assert_eq!(document.materials.len(), 1);
            assert_eq!(document.resources.len(), 1);
            let ImageResourceReference::External(resource) = &document.resources[0] else {
                panic!("external source image");
            };
            let resource = resource.reference.read().unwrap();
            assert_eq!(resource.uri, "color.png");
            assert_eq!(resource.base_path.as_deref(), Some("/models"));
            assert_eq!(resource.textures.len(), 1);
        }
        let empty = ColladaImportOptions {
            base_url: None,
            decoders: Some(Vec::new()),
        };
        assert!(
            empty
                .parse(xml)
                .document
                .read()
                .unwrap()
                .materials
                .is_empty()
        );
    }
}

pub fn parse_collada(xml: &str, options: Option<&ColladaImportOptions>) -> ColladaParseResult {
    let decoders = options
        .and_then(|options| options.decoders.as_deref())
        .unwrap_or(COLLADA_ALL_ELEMENT_DECODERS.as_slice());
    return parse_collada_with_decoders(xml, decoders, options);
}

impl ColladaImportOptions {
    pub fn parse(&self, xml: &str) -> ColladaParseResult {
        return parse_collada(xml, Some(self));
    }
}
