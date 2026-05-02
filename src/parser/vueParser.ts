import { ClassReference, DynamicPattern } from '../types';
import { splitClasses, templateLiteralToPattern } from '../utils/helpers';

/**
 * Parse a Vue Single File Component (.vue) and extract class names from:
 *
 *   Static:
 *     class="btn primary"
 *     :class="'btn primary'"          → quoted string
 *
 *   Object syntax:
 *     :class="{ active: isActive }"   → object keys become class names
 *
 *   Array syntax:
 *     :class="['btn', { active: ok }]"
 *
 *   Template sections:
 *     <template>, <script>, <style> blocks handled separately.
 */
export function parseVueClasses(
  content: string,
  filePath: string,
  enableDynamic: boolean
): { references: ClassReference[]; patterns: DynamicPattern[] } {
  const references: ClassReference[] = [];
  const patterns: DynamicPattern[] = [];
  const lines = content.split('\n');

  const addRef = (name: string, line: number, isDynamic = false) => {
    if (name.trim()) references.push({ name: name.trim(), filePath, line, isDynamic });
  };

  const getLine = (index: number) =>
    content.substring(0, index).split('\n').length;

  // 1. Static class="..."
  const staticClassRegex = /\bclass\s*=\s*(["'])(.*?)(\1)/g;
  let m: RegExpExecArray | null;
  while ((m = staticClassRegex.exec(content)) !== null) {
    const line = getLine(m.index);
    for (const cls of splitClasses(m[2])) addRef(cls, line);
  }

  if (!enableDynamic) return { references, patterns };

  // 2. :class="'single-class'" or :class="'a b'"
  const boundSingleStringRegex = /:class\s*=\s*(["'])(.*?)\1/g;
  while ((m = boundSingleStringRegex.exec(content)) !== null) {
    const line = getLine(m.index);
    // m[2] is "'single-class'" -> strip inner quotes
    const val = m[2].replace(/['"]/g, '');
    for (const cls of splitClasses(val)) addRef(cls, line, true);
  }

  // 3. :class="{...}" – object syntax
  const boundObjectRegex = /:class\s*=\s*(["'])\{(.*?)\}\1/g;
  while ((m = boundObjectRegex.exec(content)) !== null) {
    const line = getLine(m.index);
    const objectBody = m[2];
    // Extract keys: "active: ..., disabled: ..."
    const keyRegex = /(['"]?)(-?[_a-zA-Z][\w-]*)(\1)\s*:/g;
    let km: RegExpExecArray | null;
    while ((km = keyRegex.exec(objectBody)) !== null) {
      addRef(km[2], line, true);
    }
  }

  // 4. :class="[...]" – array syntax (basic): ['btn', {'active': ok}]
  const boundArrayRegex = /:class\s*=\s*(["'])\[(.*?)\]\1/g;
  while ((m = boundArrayRegex.exec(content)) !== null) {
    const line = getLine(m.index);
    const body = m[2];

    // Extract string literals within the array
    const strRegex = /['"]([^'"]+)['"]/g;
    let sm: RegExpExecArray | null;
    while ((sm = strRegex.exec(body)) !== null) {
      for (const cls of splitClasses(sm[1])) addRef(cls, line, true);
    }

    // Extract object keys within the array: {active: ok}
    const objKeyRegex = /\{\s*([^}]+)\}/g;
    let ok: RegExpExecArray | null;
    while ((ok = objKeyRegex.exec(body)) !== null) {
      const keyRegex2 = /(-?[_a-zA-Z][\w-]*)\s*:/g;
      let km2: RegExpExecArray | null;
      while ((km2 = keyRegex2.exec(ok[1])) !== null) {
        addRef(km2[1], line, true);
      }
    }

    // Extract template literals within the array: `theme-${t}`
    const innerTemplateRegex = /`([^`]+)`/g;
    let tm: RegExpExecArray | null;
    while ((tm = innerTemplateRegex.exec(body)) !== null) {
      const raw = tm[1];
      const staticParts = raw.split(/\$\{[^}]*\}/);
      for (const part of staticParts) {
        for (const cls of splitClasses(part)) addRef(cls, line, true);
      }
      const dp = templateLiteralToPattern(raw.trim());
      if (dp) patterns.push({ ...dp, filePath, line });
    }
  }


  // 5. Template literals in bound class expressions
  const templateLiteralRegex = /:class\s*=\s*["`]`([^`]+)`["`]/g;
  while ((m = templateLiteralRegex.exec(content)) !== null) {
    const line = getLine(m.index);
    const raw = m[1];
    const staticParts = raw.split(/\$\{[^}]*\}/);
    for (const part of staticParts) {
      for (const cls of splitClasses(part)) addRef(cls, line, true);
    }
    const dp = templateLiteralToPattern(raw.trim());
    if (dp) patterns.push({ ...dp, filePath, line });
  }

  // 6. Also run the HTML parser on the template section
  const templateMatch = content.match(/<template[^>]*>([\s\S]*?)<\/template>/);
  if (templateMatch) {
    const templateContent = templateMatch[1];
    const { references: htmlRefs } = parseStaticHTMLSection(
      templateContent,
      filePath,
      content.indexOf(templateMatch[1])
    );
    references.push(...htmlRefs);
  }

  return { references, patterns };
}

/**
 * Extract static class="..." from an HTML section, adjusting line numbers
 * relative to `baseOffset` characters into the original content.
 */
function parseStaticHTMLSection(
  section: string,
  filePath: string,
  baseOffset: number
): { references: ClassReference[] } {
  const references: ClassReference[] = [];
  const regex = /\bclass\s*=\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;

  while ((m = regex.exec(section)) !== null) {
    const absoluteIndex = baseOffset + m.index;
    // Calculate the line within the full file based on newlines up to absoluteIndex
    const line = section.substring(0, m.index).split('\n').length;
    for (const cls of m[1].split(/\s+/).filter(Boolean)) {
      references.push({ name: cls, filePath, line, isDynamic: false });
    }
  }

  return { references };
}
