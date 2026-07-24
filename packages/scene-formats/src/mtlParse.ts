import { reportImportDiagnostic } from '@flighthq/importdiagnostics';
import type { ImportDiagnostic, ObjMaterial, ObjMaterialLibrary } from '@flighthq/types';
import { ImportDiagnosticSeverity } from '@flighthq/types';

// Parses a Wavefront MTL material library from its text source. Every recognized directive
// (`newmtl`, `Ka`, `Kd`, `Ks`, `Ns`, `d`, `Tr`, `illum`, `map_Kd`, `map_Ka`, `map_Ks`,
// `map_Bump`/`bump`) is read; unrecognized directives are silently skipped. Malformed values
// record a diagnostic and fall back to defaults rather than throwing.
export function parseObjMaterialLibrary(source: string, diagnostics?: ImportDiagnostic[]): ObjMaterialLibrary {
  const materials = new Map<string, ObjMaterial>();
  let current: ObjMaterial | null = null;
  const lines = source.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (raw.length === 0 || raw.charCodeAt(0) === 35) continue; // skip empty and # comments

    const spaceIndex = raw.indexOf(' ');
    if (spaceIndex < 0) {
      // A directive with no argument — only `newmtl` requires one.
      if (raw === 'newmtl') {
        reportImportDiagnostic(
          diagnostics,
          ImportDiagnosticSeverity.Drop,
          'mtl.newmtl-no-name',
          'parseObjMaterialLibrary',
          {
            line: i + 1,
          },
        );
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
          reportObjDirectiveBeforeMaterial(diagnostics, directive, i);
          break;
        }
        const c = parseColor(args, diagnostics, directive, i);
        if (c !== null) current.ambient = c;
        break;
      }
      case 'Kd': {
        if (current === null) {
          reportObjDirectiveBeforeMaterial(diagnostics, directive, i);
          break;
        }
        const c = parseColor(args, diagnostics, directive, i);
        if (c !== null) current.diffuse = c;
        break;
      }
      case 'Ks': {
        if (current === null) {
          reportObjDirectiveBeforeMaterial(diagnostics, directive, i);
          break;
        }
        const c = parseColor(args, diagnostics, directive, i);
        if (c !== null) current.specular = c;
        break;
      }
      case 'Ns': {
        if (current === null) {
          reportObjDirectiveBeforeMaterial(diagnostics, directive, i);
          break;
        }
        const v = parseFloat(args);
        if (Number.isFinite(v)) current.specularExponent = v;
        else
          reportImportDiagnostic(
            diagnostics,
            ImportDiagnosticSeverity.Recover,
            'mtl.invalid-value',
            'parseObjMaterialLibrary',
            {
              directive: 'Ns',
              line: i + 1,
            },
          );
        break;
      }
      case 'd': {
        if (current === null) {
          reportObjDirectiveBeforeMaterial(diagnostics, directive, i);
          break;
        }
        const v = parseFloat(args);
        if (Number.isFinite(v)) current.dissolve = v;
        else
          reportImportDiagnostic(
            diagnostics,
            ImportDiagnosticSeverity.Recover,
            'mtl.invalid-value',
            'parseObjMaterialLibrary',
            {
              directive: 'd',
              line: i + 1,
            },
          );
        break;
      }
      case 'Tr': {
        if (current === null) {
          reportObjDirectiveBeforeMaterial(diagnostics, directive, i);
          break;
        }
        const v = parseFloat(args);
        if (Number.isFinite(v)) current.dissolve = 1 - v;
        else
          reportImportDiagnostic(
            diagnostics,
            ImportDiagnosticSeverity.Recover,
            'mtl.invalid-value',
            'parseObjMaterialLibrary',
            {
              directive: 'Tr',
              line: i + 1,
            },
          );
        break;
      }
      case 'illum': {
        if (current === null) {
          reportObjDirectiveBeforeMaterial(diagnostics, directive, i);
          break;
        }
        const v = parseInt(args, 10);
        if (Number.isFinite(v)) current.illumination = v;
        else
          reportImportDiagnostic(
            diagnostics,
            ImportDiagnosticSeverity.Recover,
            'mtl.invalid-value',
            'parseObjMaterialLibrary',
            {
              directive: 'illum',
              line: i + 1,
            },
          );
        break;
      }
      case 'map_Kd': {
        if (current === null) {
          reportObjDirectiveBeforeMaterial(diagnostics, directive, i);
          break;
        }
        current.mapDiffuse = args;
        break;
      }
      case 'map_Ka': {
        if (current === null) {
          reportObjDirectiveBeforeMaterial(diagnostics, directive, i);
          break;
        }
        current.mapAmbient = args;
        break;
      }
      case 'map_Ks': {
        if (current === null) {
          reportObjDirectiveBeforeMaterial(diagnostics, directive, i);
          break;
        }
        current.mapSpecular = args;
        break;
      }
      case 'map_Bump':
      case 'bump': {
        if (current === null) {
          reportObjDirectiveBeforeMaterial(diagnostics, directive, i);
          break;
        }
        current.mapBump = args;
        break;
      }
      default:
        break;
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

function parseColor(
  args: string,
  diagnostics: ImportDiagnostic[] | undefined,
  directive: string,
  lineIndex: number,
): readonly [number, number, number] | null {
  const parts = args.split(/\s+/);
  if (parts.length < 3) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Recover, 'mtl.color-malformed', 'parseColor', {
      directive,
      line: lineIndex + 1,
      reason: 'too-few-components',
    });
    return null;
  }
  const r = parseFloat(parts[0]);
  const g = parseFloat(parts[1]);
  const b = parseFloat(parts[2]);
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Recover, 'mtl.color-malformed', 'parseColor', {
      directive,
      line: lineIndex + 1,
      reason: 'non-numeric',
    });
    return null;
  }
  return [r, g, b];
}

function reportObjDirectiveBeforeMaterial(
  diagnostics: ImportDiagnostic[] | undefined,
  directive: string,
  lineIndex: number,
): void {
  reportImportDiagnostic(
    diagnostics,
    ImportDiagnosticSeverity.Drop,
    'mtl.directive-before-material',
    'parseObjMaterialLibrary',
    {
      directive,
      line: lineIndex + 1,
    },
  );
}
