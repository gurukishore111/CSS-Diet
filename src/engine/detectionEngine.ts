import {
  CSSClass,
  ClassReference,
  DynamicPattern,
  ClassUsageResult,
  ScanResult,
  ClassStatus,
} from '../types';
import { matchesDynamicPattern } from '../utils/helpers';

/**
 * Core detection engine.
 *
 * Given:
 *   - cssClasses:    all class definitions found in stylesheets
 *   - classReferences: all class usages found in markup/code
 *   - dynamicPatterns: heuristic patterns from template literals etc.
 *
 * Returns a ScanResult classifying each CSS class as USED, POSSIBLY_USED, or UNUSED.
 */
export function runDetection(
  cssClasses: CSSClass[],
  classReferences: ClassReference[],
  dynamicPatterns: DynamicPattern[],
  enableDynamic: boolean
): ScanResult {
  const start = Date.now();

  // Build fast lookup set of all directly referenced class names
  const referencedNames = new Set<string>(classReferences.map((r) => r.name));

  // Build lookup set of dynamic (isDynamic === true) references as well
  const dynamicRefNames = new Set<string>(
    classReferences.filter((r) => r.isDynamic).map((r) => r.name)
  );

  const usageResults: ClassUsageResult[] = [];

  for (const cssClass of cssClasses) {
    let status: ClassStatus;
    let matchedPattern: DynamicPattern | undefined;

    if (referencedNames.has(cssClass.name)) {
      // Directly found in markup
      status = 'USED';
    } else if (dynamicRefNames.has(cssClass.name)) {
      // Found via a dynamic (possibly-used) reference
      status = 'POSSIBLY_USED';
    } else if (enableDynamic) {
      // Check heuristic dynamic patterns
      matchedPattern = matchesDynamicPattern(cssClass.name, dynamicPatterns);
      status = matchedPattern ? 'POSSIBLY_USED' : 'UNUSED';
    } else {
      status = 'UNUSED';
    }

    usageResults.push({ cssClass, status, matchedPattern });
  }

  return {
    cssClasses,
    classReferences,
    dynamicPatterns,
    usageResults,
    scannedAt: new Date(),
    durationMs: Date.now() - start,
  };
}

/**
 * Summarise results for logging.
 */
export function summariseResults(result: ScanResult): {
  used: number;
  possiblyUsed: number;
  unused: number;
} {
  let used = 0;
  let possiblyUsed = 0;
  let unused = 0;

  for (const r of result.usageResults) {
    if (r.status === 'USED') used++;
    else if (r.status === 'POSSIBLY_USED') possiblyUsed++;
    else unused++;
  }

  return { used, possiblyUsed, unused };
}
