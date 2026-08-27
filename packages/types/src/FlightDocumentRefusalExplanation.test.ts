import { FlightDocumentRefusalReason } from './FlightDocumentRefusalExplanation';

describe('FlightDocumentRefusalReason', () => {
  it('keeps alias and anchor refusals distinct', () => {
    expect(FlightDocumentRefusalReason.AliasUnsupported).toBe('flight-document.unsupported.alias');
    expect(FlightDocumentRefusalReason.AnchorUnsupported).toBe('flight-document.unsupported.anchor');
    expect(FlightDocumentRefusalReason.AliasUnsupported).not.toBe(FlightDocumentRefusalReason.AnchorUnsupported);
  });

  it('pins the six fixed parser limit identities', () => {
    expect([
      FlightDocumentRefusalReason.CollectionEntriesLimitExceeded,
      FlightDocumentRefusalReason.DocumentCodeUnitsLimitExceeded,
      FlightDocumentRefusalReason.KeyCodeUnitsLimitExceeded,
      FlightDocumentRefusalReason.NestingDepthLimitExceeded,
      FlightDocumentRefusalReason.ScalarCodeUnitsLimitExceeded,
      FlightDocumentRefusalReason.TotalNodesLimitExceeded,
    ]).toEqual([
      'flight-document.limit.collection-entries',
      'flight-document.limit.document-code-units',
      'flight-document.limit.key-code-units',
      'flight-document.limit.nesting-depth',
      'flight-document.limit.scalar-code-units',
      'flight-document.limit.total-nodes',
    ]);
  });

  it('names root-dimension and singleton-light refusals independently', () => {
    expect(FlightDocumentRefusalReason.RootKindMismatch).toBe('flight-document.structure.root-kind-mismatch');
    expect(FlightDocumentRefusalReason.DuplicateAmbientLight).toBe('flight-document.structure.duplicate-ambient-light');
    expect(FlightDocumentRefusalReason.DuplicateDirectionalLight).toBe(
      'flight-document.structure.duplicate-directional-light',
    );
  });
});
