//! Rust convenience methods for the public spatial lane (D18).

use crate::*;

#[cfg(test)]
mod sugar_tests {
    use super::*;

    fn bounds_2d() -> SpatialAabb2D {
        return SpatialAabb2D {
            min_x: 0.0,
            min_y: 0.0,
            max_x: 4.0,
            max_y: 4.0,
        };
    }
    fn bounds_3d() -> SpatialAabb3D {
        return SpatialAabb3D {
            min_x: 0.0,
            min_y: 0.0,
            min_z: 0.0,
            max_x: 4.0,
            max_y: 4.0,
            max_z: 4.0,
        };
    }
    fn fixture_2d() -> (SpatialIndex2D, SpatialIndex2D) {
        let mut method = create_spatial_index_2d(None);
        let mut free = create_spatial_index_2d(None);
        for index in [&mut method, &mut free] {
            insert_spatial_object_2d(index, 1, &bounds_2d());
            insert_spatial_object_2d(index, 2, &bounds_2d());
        }
        return (method, free);
    }
    fn fixture_3d() -> (SpatialIndex3D, SpatialIndex3D) {
        let mut method = create_spatial_index_3d(None);
        let mut free = create_spatial_index_3d(None);
        for index in [&mut method, &mut free] {
            insert_spatial_object_3d(index, 1, &bounds_3d());
            insert_spatial_object_3d(index, 2, &bounds_3d());
        }
        return (method, free);
    }
    fn snapshot_2d(index: &mut SpatialIndex2D) -> (Vec<SpatialPair>, Vec<SpatialObjectId>) {
        let pairs = query_spatial_pairs_2d(index).to_vec();
        let mut point = Vec::new();
        query_spatial_point_2d(&mut point, index, 1.0, 1.0);
        return (pairs, point);
    }
    fn snapshot_3d(index: &mut SpatialIndex3D) -> (Vec<SpatialPair>, Vec<SpatialObjectId>) {
        let pairs = query_spatial_pairs_3d(index).to_vec();
        let mut point = Vec::new();
        query_spatial_point_3d(&mut point, index, 1.0, 1.0, 1.0);
        return (pairs, point);
    }
    fn notice() -> SpatialIndexingNotice {
        return SpatialIndexingNotice {
            cell_size: 1.0,
            id: 7,
            mode: SpatialIndexingMode::Declined,
            operation: SpatialIndexingOperation::Insert,
            reason: Some(SpatialIndexingReason::NonFiniteBounds),
            would_occupy_bucket_count: 0.0,
        };
    }
    #[test]
    fn index_2d_new_delegates() {
        let mut method = SpatialIndex2D::new(None);
        let mut free = create_spatial_index_2d(None);
        insert_spatial_object_2d(&mut method, 1, &bounds_2d());
        insert_spatial_object_2d(&mut free, 1, &bounds_2d());
        assert_eq!(snapshot_2d(&mut method), snapshot_2d(&mut free));
    }
    #[test]
    fn index_2d_clear_delegates() {
        let (mut method, mut free) = fixture_2d();
        method.clear();
        clear_spatial_index_2d(&mut free);
        assert_eq!(snapshot_2d(&mut method), snapshot_2d(&mut free));
    }
    #[test]
    fn index_2d_remove_delegates() {
        let (mut method, mut free) = fixture_2d();
        method.remove(1);
        remove_spatial_object_2d(&mut free, 1);
        assert_eq!(snapshot_2d(&mut method), snapshot_2d(&mut free));
    }
    #[test]
    fn index_2d_explain_delegates() {
        let (method, free) = fixture_2d();
        assert_eq!(method.explain(1), explain_spatial_indexing_2d(&free, 1));
    }
    #[test]
    fn index_2d_insert_delegates() {
        let (mut method, mut free) = fixture_2d();
        let mut bounds = bounds_2d();
        bounds.min_x = 20.0;
        bounds.max_x = 24.0;
        assert_eq!(
            method.insert(3, &bounds),
            insert_spatial_object_2d(&mut free, 3, &bounds)
        );
        assert_eq!(snapshot_2d(&mut method), snapshot_2d(&mut free));
    }
    #[test]
    fn index_2d_update_delegates() {
        let (mut method, mut free) = fixture_2d();
        let mut bounds = bounds_2d();
        bounds.min_x = 20.0;
        bounds.max_x = 24.0;
        assert_eq!(
            method.update(1, &bounds),
            update_spatial_object_2d(&mut free, 1, &bounds)
        );
        assert_eq!(snapshot_2d(&mut method), snapshot_2d(&mut free));
    }
    #[test]
    fn index_2d_query_pairs_delegates() {
        let (mut method, mut free) = fixture_2d();
        assert_eq!(method.query_pairs(), query_spatial_pairs_2d(&mut free));
    }
    #[test]
    fn index_2d_query_point_delegates() {
        let (mut method, mut free) = fixture_2d();
        let mut actual = vec![99];
        let mut expected = vec![99];
        method.query_point(&mut actual, 1.0, 1.0);
        query_spatial_point_2d(&mut expected, &mut free, 1.0, 1.0);
        assert_eq!(actual, expected);
    }
    #[test]
    fn index_2d_query_ray_delegates() {
        let (mut method, mut free) = fixture_2d();
        let mut actual = vec![99];
        let mut expected = vec![99];
        method.query_ray(&mut actual, -1.0, 1.0, 1.0, 0.0);
        query_spatial_ray_2d(&mut expected, &mut free, -1.0, 1.0, 1.0, 0.0);
        assert_eq!(actual, expected);
    }
    #[test]
    fn index_2d_query_region_delegates() {
        let (mut method, mut free) = fixture_2d();
        let mut actual = vec![99];
        let mut expected = vec![99];
        method.query_region(&mut actual, &bounds_2d());
        query_spatial_region_2d(&mut expected, &mut free, &bounds_2d());
        assert_eq!(actual, expected);
    }
    #[test]
    fn index_3d_new_delegates() {
        let mut method = SpatialIndex3D::new(None);
        let mut free = create_spatial_index_3d(None);
        insert_spatial_object_3d(&mut method, 1, &bounds_3d());
        insert_spatial_object_3d(&mut free, 1, &bounds_3d());
        assert_eq!(snapshot_3d(&mut method), snapshot_3d(&mut free));
    }
    #[test]
    fn index_3d_clear_delegates() {
        let (mut method, mut free) = fixture_3d();
        method.clear();
        clear_spatial_index_3d(&mut free);
        assert_eq!(snapshot_3d(&mut method), snapshot_3d(&mut free));
    }
    #[test]
    fn index_3d_remove_delegates() {
        let (mut method, mut free) = fixture_3d();
        method.remove(1);
        remove_spatial_object_3d(&mut free, 1);
        assert_eq!(snapshot_3d(&mut method), snapshot_3d(&mut free));
    }
    #[test]
    fn index_3d_explain_delegates() {
        let (method, free) = fixture_3d();
        assert_eq!(method.explain(1), explain_spatial_indexing_3d(&free, 1));
    }
    #[test]
    fn index_3d_insert_delegates() {
        let (mut method, mut free) = fixture_3d();
        let mut bounds = bounds_3d();
        bounds.min_x = 20.0;
        bounds.max_x = 24.0;
        assert_eq!(
            method.insert(3, &bounds),
            insert_spatial_object_3d(&mut free, 3, &bounds)
        );
        assert_eq!(snapshot_3d(&mut method), snapshot_3d(&mut free));
    }
    #[test]
    fn index_3d_update_delegates() {
        let (mut method, mut free) = fixture_3d();
        let mut bounds = bounds_3d();
        bounds.min_x = 20.0;
        bounds.max_x = 24.0;
        assert_eq!(
            method.update(1, &bounds),
            update_spatial_object_3d(&mut free, 1, &bounds)
        );
        assert_eq!(snapshot_3d(&mut method), snapshot_3d(&mut free));
    }
    #[test]
    fn index_3d_query_pairs_delegates() {
        let (mut method, mut free) = fixture_3d();
        assert_eq!(method.query_pairs(), query_spatial_pairs_3d(&mut free));
    }
    #[test]
    fn index_3d_query_point_delegates() {
        let (mut method, mut free) = fixture_3d();
        let mut actual = vec![99];
        let mut expected = vec![99];
        method.query_point(&mut actual, 1.0, 1.0, 1.0);
        query_spatial_point_3d(&mut expected, &mut free, 1.0, 1.0, 1.0);
        assert_eq!(actual, expected);
    }
    #[test]
    fn index_3d_query_ray_delegates() {
        let (mut method, mut free) = fixture_3d();
        let mut actual = vec![99];
        let mut expected = vec![99];
        method.query_ray(&mut actual, -1.0, 1.0, 1.0, 1.0, 0.0, 0.0);
        query_spatial_ray_3d(&mut expected, &mut free, -1.0, 1.0, 1.0, 1.0, 0.0, 0.0);
        assert_eq!(actual, expected);
    }
    #[test]
    fn index_3d_query_region_delegates() {
        let (mut method, mut free) = fixture_3d();
        let mut actual = vec![99];
        let mut expected = vec![99];
        method.query_region(&mut actual, &bounds_3d());
        query_spatial_region_3d(&mut expected, &mut free, &bounds_3d());
        assert_eq!(actual, expected);
    }
    #[test]
    fn index_3d_query_sphere_delegates() {
        let (mut method, mut free) = fixture_3d();
        let mut actual = vec![99];
        let mut expected = vec![99];
        method.query_sphere(&mut actual, 0.0, 0.0, 0.0, 10.0);
        query_spatial_sphere_3d(&mut expected, &mut free, 0.0, 0.0, 0.0, 10.0);
        assert_eq!(actual, expected);
    }
    #[test]
    fn index_3d_query_frustum_delegates() {
        let (mut method, mut free) = fixture_3d();
        let frustum = SpatialFrustum3D {
            corners: [
                -10.0, -10.0, 0.0, 10.0, -10.0, 0.0, 10.0, 10.0, 0.0, -10.0, 10.0, 0.0, -10.0,
                -10.0, 10.0, 10.0, -10.0, 10.0, 10.0, 10.0, 10.0, -10.0, 10.0, 10.0,
            ],
        };
        let mut actual = vec![99];
        let mut expected = vec![99];
        method.query_frustum(&mut actual, &frustum, None);
        query_spatial_frustum_3d(&mut expected, &mut free, &frustum, None);
        assert_eq!(actual, expected);
    }
    #[test]
    fn backend_2d_new_delegates() {
        let mut method = create_spatial_index_2d(Some(SpatialIndexBackend2D::new(10.0)));
        let mut free = create_spatial_index_2d(Some(create_uniform_grid_spatial_backend_2d(10.0)));
        insert_spatial_object_2d(&mut method, 1, &bounds_2d());
        insert_spatial_object_2d(&mut free, 1, &bounds_2d());
        assert_eq!(snapshot_2d(&mut method), snapshot_2d(&mut free));
    }
    #[test]
    fn backend_3d_from_bvh_delegates() {
        let mut method = create_spatial_index_3d(Some(SpatialIndexBackend3D::from_bvh(None)));
        let mut free = create_spatial_index_3d(Some(create_bvh_spatial_backend_3d(None)));
        insert_spatial_object_3d(&mut method, 1, &bounds_3d());
        insert_spatial_object_3d(&mut free, 1, &bounds_3d());
        assert_eq!(snapshot_3d(&mut method), snapshot_3d(&mut free));
    }
    #[test]
    fn backend_3d_from_uniform_grid_delegates() {
        let mut method =
            create_spatial_index_3d(Some(SpatialIndexBackend3D::from_uniform_grid(10.0)));
        let mut free = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(10.0)));
        insert_spatial_object_3d(&mut method, 1, &bounds_3d());
        insert_spatial_object_3d(&mut free, 1, &bounds_3d());
        assert_eq!(snapshot_3d(&mut method), snapshot_3d(&mut free));
    }
    #[test]
    fn notice_format_delegates() {
        let notice = notice();
        assert_eq!(notice.format(), format_spatial_indexing_notice(&notice));
    }
    #[test]
    fn notice_report_delegates() {
        let reports = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        let captured = reports.clone();
        let owner = std::thread::current().id();
        set_spatial_indexing_guard(Some(std::sync::Arc::new(move |notice| {
            if std::thread::current().id() == owner { captured.lock().unwrap().push(notice.clone()); }
        })));
        let notice = notice();
        notice.report();
        report_spatial_indexing(&notice);
        set_spatial_indexing_guard(None);
        assert_eq!(*reports.lock().unwrap(), vec![notice.clone(), notice]);
    }
}

impl SpatialIndex2D {
    pub fn new(backend: Option<SpatialIndexBackend2D>) -> Self {
        return create_spatial_index_2d(backend);
    }
    pub fn clear(&mut self) {
        clear_spatial_index_2d(self);
    }
    pub fn explain(&self, id: SpatialObjectId) -> SpatialIndexingExplanation {
        return explain_spatial_indexing_2d(self, id);
    }
    pub fn insert(&mut self, id: SpatialObjectId, bounds: &SpatialAabb2D) -> bool {
        return insert_spatial_object_2d(self, id, bounds);
    }
    pub fn query_pairs(&mut self) -> &[SpatialPair] {
        return query_spatial_pairs_2d(self);
    }
    pub fn query_point(&mut self, out: &mut Vec<SpatialObjectId>, x: f32, y: f32) {
        query_spatial_point_2d(out, self, x, y);
    }
    pub fn query_ray(&mut self, out: &mut Vec<SpatialObjectId>, x: f32, y: f32, dx: f32, dy: f32) {
        query_spatial_ray_2d(out, self, x, y, dx, dy);
    }
    pub fn query_region(&mut self, out: &mut Vec<SpatialObjectId>, region: &SpatialAabb2D) {
        query_spatial_region_2d(out, self, region);
    }
    pub fn remove(&mut self, id: SpatialObjectId) {
        remove_spatial_object_2d(self, id);
    }
    pub fn update(&mut self, id: SpatialObjectId, bounds: &SpatialAabb2D) -> bool {
        return update_spatial_object_2d(self, id, bounds);
    }
}

impl SpatialIndex3D {
    pub fn new(backend: Option<SpatialIndexBackend3D>) -> Self {
        return create_spatial_index_3d(backend);
    }
    pub fn clear(&mut self) {
        clear_spatial_index_3d(self);
    }
    pub fn explain(&self, id: SpatialObjectId) -> SpatialIndexingExplanation {
        return explain_spatial_indexing_3d(self, id);
    }
    pub fn insert(&mut self, id: SpatialObjectId, bounds: &SpatialAabb3D) -> bool {
        return insert_spatial_object_3d(self, id, bounds);
    }
    pub fn query_frustum(
        &mut self,
        out: &mut Vec<SpatialObjectId>,
        frustum: &SpatialFrustum3D,
        slices: Option<u32>,
    ) {
        query_spatial_frustum_3d(out, self, frustum, slices);
    }
    pub fn query_pairs(&mut self) -> &[SpatialPair] {
        return query_spatial_pairs_3d(self);
    }
    pub fn query_point(&mut self, out: &mut Vec<SpatialObjectId>, x: f32, y: f32, z: f32) {
        query_spatial_point_3d(out, self, x, y, z);
    }
    pub fn query_ray(
        &mut self,
        out: &mut Vec<SpatialObjectId>,
        x: f32,
        y: f32,
        z: f32,
        dx: f32,
        dy: f32,
        dz: f32,
    ) {
        query_spatial_ray_3d(out, self, x, y, z, dx, dy, dz);
    }
    pub fn query_region(&mut self, out: &mut Vec<SpatialObjectId>, region: &SpatialAabb3D) {
        query_spatial_region_3d(out, self, region);
    }
    pub fn query_sphere(
        &mut self,
        out: &mut Vec<SpatialObjectId>,
        x: f32,
        y: f32,
        z: f32,
        radius: f32,
    ) {
        query_spatial_sphere_3d(out, self, x, y, z, radius);
    }
    pub fn remove(&mut self, id: SpatialObjectId) {
        remove_spatial_object_3d(self, id);
    }
    pub fn update(&mut self, id: SpatialObjectId, bounds: &SpatialAabb3D) -> bool {
        return update_spatial_object_3d(self, id, bounds);
    }
}

impl SpatialIndexBackend2D {
    pub fn new(cell_size: f32) -> Self {
        return create_uniform_grid_spatial_backend_2d(cell_size);
    }
}

impl SpatialIndexBackend3D {
    pub fn from_bvh(margin: Option<f32>) -> Self {
        return create_bvh_spatial_backend_3d(margin);
    }
    pub fn from_uniform_grid(cell_size: f32) -> Self {
        return create_uniform_grid_spatial_backend_3d(cell_size);
    }
}

impl SpatialIndexingNotice {
    pub fn format(&self) -> String {
        return format_spatial_indexing_notice(self);
    }
    pub fn report(&self) {
        report_spatial_indexing(self);
    }
}

