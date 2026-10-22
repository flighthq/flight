use crate::stl_features::{
    BINARY_STL_COUNT_OFFSET, BINARY_STL_HEADER_SIZE, BINARY_STL_TRIANGLE_SIZE,
};
use flight_encoding::encode_utf8;
use flight_entity::Uint8Array;

#[derive(Clone, Debug, PartialEq)]
pub struct StlFixtureFacet {
    pub normal: [f32; 3],
    pub vertices: [[f32; 3]; 3],
}

pub const STL_SQUARE_FACETS: [StlFixtureFacet; 2] = [
    StlFixtureFacet {
        normal: [0.0, 0.0, 1.0],
        vertices: [[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [1.0, 1.0, 0.0]],
    },
    StlFixtureFacet {
        normal: [0.0, 0.0, 1.0],
        vertices: [[0.0, 0.0, 0.0], [1.0, 1.0, 0.0], [0.0, 1.0, 0.0]],
    },
];

pub fn build_ascii_stl(facets: &[StlFixtureFacet], name: Option<&str>) -> String {
    let name = name.unwrap_or("fixture");
    let mut lines = vec![format!("solid {}", name)];
    for facet in facets {
        lines.push(format!(
            "  facet normal {} {} {}",
            facet.normal[0], facet.normal[1], facet.normal[2]
        ));
        lines.push("    outer loop".to_string());
        for vertex in &facet.vertices {
            lines.push(format!(
                "      vertex {} {} {}",
                vertex[0], vertex[1], vertex[2]
            ));
        }
        lines.push("    endloop".to_string());
        lines.push("  endfacet".to_string());
    }
    lines.push(format!("endsolid {}", name));
    return lines.join("\n");
}

pub fn build_binary_stl(facets: &[StlFixtureFacet], header: Option<&str>) -> Box<Uint8Array> {
    let mut bytes = vec![0; BINARY_STL_HEADER_SIZE + facets.len() * BINARY_STL_TRIANGLE_SIZE]
        .into_boxed_slice();
    let header = encode_utf8(header.unwrap_or("binary stl fixture"));
    let length = header.len().min(BINARY_STL_COUNT_OFFSET);
    bytes[..length].copy_from_slice(&header[..length]);
    bytes[BINARY_STL_COUNT_OFFSET..BINARY_STL_HEADER_SIZE]
        .copy_from_slice(&(facets.len() as u32).to_le_bytes());
    for (triangle, facet) in facets.iter().enumerate() {
        let base = BINARY_STL_HEADER_SIZE + triangle * BINARY_STL_TRIANGLE_SIZE;
        for (vector, triple) in std::iter::once(&facet.normal)
            .chain(facet.vertices.iter())
            .enumerate()
        {
            for component in 0..3 {
                let offset = base + vector * 12 + component * 4;
                bytes[offset..offset + 4].copy_from_slice(&triple[component].to_le_bytes());
            }
        }
        bytes[base + 48..base + 50].copy_from_slice(&0_u16.to_le_bytes());
    }
    return bytes;
}
