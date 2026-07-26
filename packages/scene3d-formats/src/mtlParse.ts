import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import type { ImportDiagnostic, ObjMaterial, ObjMaterialLibrary } from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';

// Parses a Wavefront MTL material library from its text source. Every recognized directive
// (`newmtl`, `Ka`, `Kd`, `Ks`, `Ns`, `d`, `Tr`, `illum`, `map_Kd`, `map_Ka`, `map_Ks`,
// `map_Bump`/`bump`) is read; unrecognized directives are silently skipped. Malformed values
// record a diagnostic and fall back to defaults rather than throwing. Repeated malformed lines are
// aggregated into one crumb per (kind, discriminator) — the collector contract forbids a per-line report.
export function parseObjMaterialLibrary(source: string, diagnostics?: ImportDiagnostic[]): ObjMaterialLibrary {
  const materials = new Map<string, ObjMaterial>();
  let current: ObjMaterial | null = null;
  const lines = source.split('\n');

  // Tallied during the loop and flushed once after — null (every tally a no-op) when no collector is engaged.
  const mtlDrops = diagnostics ? new Map<string, MtlDropTally>() : null;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (raw.length === 0 || raw.charCodeAt(0) === 35) continue; // skip empty and # comments

    const spaceIndex = raw.indexOf(' ');
    if (spaceIndex < 0) {
      // A bare recognized directive carries no value — a data-dropping branch, not a silent no-op. Before a
      // material it is a directive-before-material drop; after one, its value/filename is simply missing.
      if (raw === 'newmtl') {
        tallyMtlDrop(mtlDrops, ImportDiagnosticSeverity.Drop, 'mtl.newmtl-no-name', '', { firstLine: i + 1 });
      } else if (raw === 'Ka' || raw === 'Kd' || raw === 'Ks') {
        if (current === null) tallyDirectiveBeforeMaterial(mtlDrops, raw, i);
        else
          tallyMtlDrop(mtlDrops, ImportDiagnosticSeverity.Recover, 'mtl.color-malformed', 'too-few-components', {
            firstDirective: raw,
            firstLine: i + 1,
            reason: 'too-few-components',
          });
      } else if (raw === 'Ns' || raw === 'd' || raw === 'Tr' || raw === 'illum') {
        if (current === null) tallyDirectiveBeforeMaterial(mtlDrops, raw, i);
        else tallyInvalidValue(mtlDrops, raw, i);
      } else if (raw === 'map_Kd' || raw === 'map_Ka' || raw === 'map_Ks' || raw === 'map_Bump' || raw === 'bump') {
        if (current === null) tallyDirectiveBeforeMaterial(mtlDrops, raw, i);
        else
          tallyMtlDrop(mtlDrops, ImportDiagnosticSeverity.Drop, 'mtl.map-no-filename', raw, {
            directive: raw,
            firstLine: i + 1,
          });
      }
      continue;
    }

    const directive = raw.slice(0, spaceIndex);
    const args = raw.slice(spaceIndex + 1).trim();

    switch (directive) {
      case 'newmtl': {
        current = createDefaultObjMaterial(args);
        materials.set(args, current);
        break;
      }
      case 'Ka': {
        if (current === null) {
          tallyDirectiveBeforeMaterial(mtlDrops, directive, i);
          break;
        }
        const c = parseColor(args, mtlDrops, directive, i);
        if (c !== null) current.ambient = c;
        break;
      }
      case 'Kd': {
        if (current === null) {
          tallyDirectiveBeforeMaterial(mtlDrops, directive, i);
          break;
        }
        const c = parseColor(args, mtlDrops, directive, i);
        if (c !== null) current.diffuse = c;
        break;
      }
      case 'Ks': {
        if (current === null) {
          tallyDirectiveBeforeMaterial(mtlDrops, directive, i);
          break;
        }
        const c = parseColor(args, mtlDrops, directive, i);
        if (c !== null) current.specular = c;
        break;
      }
      case 'Ns': {
        if (current === null) {
          tallyDirectiveBeforeMaterial(mtlDrops, directive, i);
          break;
        }
        const v = parseFloat(args);
        if (Number.isFinite(v)) current.specularExponent = v;
        else tallyInvalidValue(mtlDrops, directive, i);
        break;
      }
      case 'd': {
        if (current === null) {
          tallyDirectiveBeforeMaterial(mtlDrops, directive, i);
          break;
        }
        const v = parseFloat(args);
        if (Number.isFinite(v)) current.dissolve = v;
        else tallyInvalidValue(mtlDrops, directive, i);
        break;
      }
      case 'Tr': {
        if (current === null) {
          tallyDirectiveBeforeMaterial(mtlDrops, directive, i);
          break;
        }
        const v = parseFloat(args);
        if (Number.isFinite(v)) current.dissolve = 1 - v;
        else tallyInvalidValue(mtlDrops, directive, i);
        break;
      }
      case 'illum': {
        if (current === null) {
          tallyDirectiveBeforeMaterial(mtlDrops, directive, i);
          break;
        }
        const v = parseInt(args, 10);
        if (Number.isFinite(v)) current.illumination = v;
        else tallyInvalidValue(mtlDrops, directive, i);
        break;
      }
      case 'map_Kd': {
        if (current === null) {
          tallyDirectiveBeforeMaterial(mtlDrops, directive, i);
          break;
        }
        current.mapDiffuse = args;
        break;
      }
      case 'map_Ka': {
        if (current === null) {
          tallyDirectiveBeforeMaterial(mtlDrops, directive, i);
          break;
        }
        current.mapAmbient = args;
        break;
      }
      case 'map_Ks': {
        if (current === null) {
          tallyDirectiveBeforeMaterial(mtlDrops, directive, i);
          break;
        }
        current.mapSpecular = args;
        break;
      }
      case 'map_Bump':
      case 'bump': {
        if (current === null) {
          tallyDirectiveBeforeMaterial(mtlDrops, directive, i);
          break;
        }
        current.mapBump = args;
        break;
      }
      default:
        break;
    }
  }

  // Emit the aggregated tallies here in parseObjMaterialLibrary (the emitting function, so it is the crumbs'
  // origin per the collector contract) — one crumb per (kind, discriminator) with its total count.
  if (mtlDrops !== null) {
    for (const tally of mtlDrops.values()) {
      reportImportDiagnostic(diagnostics, tally.severity, tally.kind, 'parseObjMaterialLibrary', {
        ...tally.detail,
        count: tally.count,
      });
    }
  }
  return { materials };
}

function createDefaultObjMaterial(name: string): ObjMaterial {
  return {
    ambient: [0, 0, 0],
    diffuse: [0.8, 0.8, 0.8],
    dissolve: 1,
    illumination: 2,
    mapAmbient: null,
    mapBump: null,
    mapDiffuse: null,
    mapSpecular: null,
    name,
    specular: [0, 0, 0],
    specularExponent: 0,
  };
}

// Reads a color triple, tallying a `mtl.color-malformed` drop (keyed by failure reason, first directive
// kept as an example) and returning null on malformed input so the caller keeps the material's default.
function parseColor(
  args: string,
  mtlDrops: Map<string, MtlDropTally> | null,
  directive: string,
  lineIndex: number,
): readonly [number, number, number] | null {
  const parts = args.split(/\s+/);
  if (parts.length < 3) {
    tallyMtlDrop(mtlDrops, ImportDiagnosticSeverity.Recover, 'mtl.color-malformed', 'too-few-components', {
      firstDirective: directive,
      firstLine: lineIndex + 1,
      reason: 'too-few-components',
    });
    return null;
  }
  const r = parseFloat(parts[0]);
  const g = parseFloat(parts[1]);
  const b = parseFloat(parts[2]);
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
    tallyMtlDrop(mtlDrops, ImportDiagnosticSeverity.Recover, 'mtl.color-malformed', 'non-numeric', {
      firstDirective: directive,
      firstLine: lineIndex + 1,
      reason: 'non-numeric',
    });
    return null;
  }
  return [r, g, b];
}

// A directive carrying (or missing) a value before any `newmtl` drops it — no material to attach to.
// Aggregated as one crumb; the first offending directive is kept as an example.
function tallyDirectiveBeforeMaterial(
  mtlDrops: Map<string, MtlDropTally> | null,
  directive: string,
  lineIndex: number,
): void {
  tallyMtlDrop(mtlDrops, ImportDiagnosticSeverity.Drop, 'mtl.directive-before-material', '', {
    firstDirective: directive,
    firstLine: lineIndex + 1,
  });
}

// A non-numeric (or missing) Ns/d/Tr/illum value is dropped and the material keeps its default (Recover).
// Keyed by the directive so each property's failures aggregate separately.
function tallyInvalidValue(mtlDrops: Map<string, MtlDropTally> | null, directive: string, lineIndex: number): void {
  tallyMtlDrop(mtlDrops, ImportDiagnosticSeverity.Recover, 'mtl.invalid-value', directive, {
    directive,
    firstLine: lineIndex + 1,
  });
}

// One accumulated MTL drop: a total `count` plus the first offender's `detail`, keyed by kind + discriminator.
// No origin is stored — the tallies are flushed (physically reported) by parseObjMaterialLibrary, so it is
// every aggregated crumb's origin per the collector's emitting-function contract; `kind` carries granularity.
interface MtlDropTally {
  count: number;
  detail: Record<string, boolean | number | string>;
  kind: string;
  severity: ImportDiagnosticSeverity;
}

// Records one offender against its (kind, discriminator) tally — the aggregate-once alternative to a
// per-line `reportImportDiagnostic`. No-op (never allocates) when no collector is engaged. `firstDetail` is
// kept from the FIRST offender; later ones only bump the count.
function tallyMtlDrop(
  tallies: Map<string, MtlDropTally> | null,
  severity: ImportDiagnosticSeverity,
  kind: string,
  discriminator: string,
  firstDetail: Record<string, boolean | number | string>,
): void {
  if (tallies === null) return;
  const key = `${kind}|${discriminator}`;
  const existing = tallies.get(key);
  if (existing === undefined) tallies.set(key, { count: 1, detail: firstDetail, kind, severity });
  else existing.count++;
}
