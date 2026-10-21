use crate::MeshGeometry;
use crate::MeshSubset;
use crate::PrimitiveTopology;

/// Appends a subset range to the geometry's subset list. The caller owns choosing
/// a non-overlapping range within the index buffer.
pub fn add_mesh_geometry_subset(geometry: &mut MeshGeometry, subset: &MeshSubset) {
    let mut next: Vec<MeshSubset> = Vec::new();
    for i in 0..geometry.subsets.len() {
        next.push(MeshSubset {
            index_count: geometry.subsets[i].index_count,
            index_offset: geometry.subsets[i].index_offset,
        });
    }
    next.push(MeshSubset {
        index_count: subset.index_count,
        index_offset: subset.index_offset,
    });
    geometry.subsets = next;
}

/// Returns the number of triangles a subset spans, derived from its index_count
/// and the geometry's topology. Returns 0 for non-triangle topologies or out-of-range
/// subset indices.
pub fn get_mesh_geometry_subset_triangle_count(geometry: &MeshGeometry, subset_index: i32) -> u32 {
    if subset_index < 0 || subset_index as usize >= geometry.subsets.len() {
        return 0;
    }
    let index_count = geometry.subsets[subset_index as usize].index_count;
    if geometry.topology == PrimitiveTopology::TriangleList {
        return index_count / 3;
    }
    if geometry.topology == PrimitiveTopology::TriangleStrip {
        return if index_count >= 2 { index_count - 2 } else { 0 };
    }
    return 0;
}

/// Returns the subset containing all three elements of a logical triangle, or -1
/// when no subset owns it.
pub fn get_mesh_geometry_triangle_subset_index(geometry: &MeshGeometry, triangle_index: i32) -> i32 {
    if triangle_index < 0 {
        return -1;
    }
    let first_element: u32;
    if geometry.topology == PrimitiveTopology::TriangleList {
        first_element = triangle_index as u32 * 3;
    } else if geometry.topology == PrimitiveTopology::TriangleStrip {
        first_element = triangle_index as u32;
    } else {
        return -1;
    }

    let subsets = &geometry.subsets;
    for subset_index in 0..subsets.len() {
        let subset = &subsets[subset_index];
        if first_element >= subset.index_offset
            && first_element + 3 <= subset.index_offset + subset.index_count
        {
            return subset_index as i32;
        }
    }
    return -1;
}

/// Replaces the geometry's entire subset list with a fresh copy of `subsets`.
pub fn set_mesh_geometry_subsets(geometry: &mut MeshGeometry, subsets: &[MeshSubset]) {
    let mut next: Vec<MeshSubset> = Vec::new();
    for i in 0..subsets.len() {
        next.push(MeshSubset {
            index_count: subsets[i].index_count,
            index_offset: subsets[i].index_offset,
        });
    }
    geometry.subsets = next;
}


