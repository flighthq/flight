use crate::{RenderProxy, RenderState};

pub fn update_render_proxy_material<S: RenderState>(
    _state: &S,
    data: &mut RenderProxy<S>,
    _parent_data: Option<&RenderProxy<S>>,
) {
    let (material, material_data) = {
        let source = data.source.read().unwrap();
        match source.as_material_node() {
            Some(material) => {
                let view = material.material_view();
                (view.material.clone(), view.material_data.clone())
            }
            None => (None, None),
        }
    };
    data.material = material;
    data.material_data = material_data;
}
// flight-lint: allow-file(contract-vocabulary) D12/D17 approved generic RenderState and backend-typed callback families are IR dispatch contracts
