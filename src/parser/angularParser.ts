import { ClassReference, DynamicPattern } from '../types';
import { splitClasses } from '../utils/helpers';

/**
 * Parse Angular template files (.html or inline templates) and extract
 * class names from:
 *
 *   Static:
 *     class="btn primary"
 *
 *   ngClass directive:
 *     [ngClass]="'btn primary'"
 *     [ngClass]="{ active: isActive, disabled: isDisabled }"
 *     [ngClass]="['btn', 'primary']"
 *     [ngClass]="someVar"      → skipped (can't statically analyze)
 *
 *   ngClass pipe:
 *     [class.active]="isActive"  → "active" extracted as possibly-used
 */
export function parseAngularClasses(
  content: string,
  filePath: string,
  enableDynamic: boolean
): { references: ClassReference[]; patterns: DynamicPattern[] } {
  const references: ClassReference[] = [];
  const patterns: DynamicPattern[] = [];

  const addRef = (name: string, line: number, isDynamic = false) => {
    if (name.trim()) references.push({ name: name.trim(), filePath, line, isDynamic });
  };

  const getLine = (index: number) =>
    content.substring(0, index).split('\n').length;

  // 1. Static class="..." or [class]="'foo'"
  const staticClassRegex = /(class|\[class\])\s*=\s*(["'])(.*?)(\2)/g;
  let m: RegExpExecArray | null;
  while ((m = staticClassRegex.exec(content)) !== null) {
    const line = getLine(m.index);
    const value = m[3].replace(/['"]/g, ''); // strip inner quotes
    for (const cls of splitClasses(value)) addRef(cls, line);
  }

  if (!enableDynamic) return { references, patterns };

  // 2. [ngClass]="'class-name'" – quoted single string
  const ngClassSingleStr = /\[ngClass\]\s*=\s*["']'([^']+)'["']/g;
  while ((m = ngClassSingleStr.exec(content)) !== null) {
    const line = getLine(m.index);
    for (const cls of splitClasses(m[1])) addRef(cls, line, true);
  }

  // 3. [ngClass]="\"class-name\"" – double-quoted string inside binding
  const ngClassDoubleStr = /\[ngClass\]\s*=\s*'"([^"]+)"'/g;
  while ((m = ngClassDoubleStr.exec(content)) !== null) {
    const line = getLine(m.index);
    for (const cls of splitClasses(m[1])) addRef(cls, line, true);
  }

  // 4. [ngClass]="{ active: ..., disabled: ... }" – object syntax
  const ngClassObjRegex = /\[ngClass\]\s*=\s*["']\{([^}]+)\}["']/g;
  while ((m = ngClassObjRegex.exec(content)) !== null) {
    const line = getLine(m.index);
    const body = m[1];
    const keyRegex = /['"]?(-?[_a-zA-Z][\w-]*)['"]?\s*:/g;
    let km: RegExpExecArray | null;
    while ((km = keyRegex.exec(body)) !== null) {
      addRef(km[1], line, true);
    }
  }

  // 2. [ngClass]="{...}" or [ngClass]="'...' or [...]"
  const ngClassRegex = /\[ngClass\]\s*=\s*(["'])(.*?)(\1)/g;
  while ((m = ngClassRegex.exec(content)) !== null) {
    const line = getLine(m.index);
    const body = m[2];
    const strRegex = /['"]([^'"]+)['"]/g;
    let sm: RegExpExecArray | null;
    while ((sm = strRegex.exec(body)) !== null) {
      for (const cls of splitClasses(sm[1])) addRef(cls, line, true);
    }
  }

  // 6. [class.active]="expr" → "active" is a possibly-used class
  const classDotRegex = /\[class\.(-?[_a-zA-Z][\w-]*)\]\s*=/g;
  while ((m = classDotRegex.exec(content)) !== null) {
    const line = getLine(m.index);
    addRef(m[1], line, true);
  }

  return { references, patterns };
}
