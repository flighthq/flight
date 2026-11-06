/**
 * Where a facet's normal comes from.
 *
 * ★ STL STORES A NORMAL AND ALSO STORES THE WINDING, AND THEY DISAGREE IN REAL FILES. Every facet carries an
 * explicit normal vector, and every facet also carries three vertices whose winding implies one. Exporters write
 * zeros, write unnormalized vectors, and write normals that contradict their own winding; a loader that silently
 * picks one source hides which.
 *
 * `RecomputeFromVertices` derives the normal from the vertex winding, so it can never disagree with the triangle
 * it belongs to. `FileNormals` keeps the authored vector, for a caller who needs the file's own claim preserved.
 *
 * In BOTH policies a normal that cannot be used — zero-length or non-finite — falls back to the computed one.
 * That is not a third policy: a zero vector is the absence of a normal, not a normal worth trusting, and a
 * geometry carrying one would light as a black facet. The policy chooses between two real answers; it does not
 * choose to emit a broken one.
 */
export type StlNormalPolicy = 'FileNormals' | 'RecomputeFromVertices';

/**
 * How an STL import reads a file.
 *
 * One field, because STL has one decision in it. There is no handler family here and no registry: the format is
 * a list of triangles, every one of which is read the same way, so a selectable family would be a shape invented
 * for symmetry with richer formats rather than something a caller could use.
 *
 * Omitting `normals` takes the default (`RecomputeFromVertices`). `stlFullImportOptions` states it explicitly.
 */
export interface StlImportOptions {
  readonly normals?: StlNormalPolicy;
}
