import { ClassReference, DynamicPattern } from '../types';
import { splitClasses, templateLiteralToPattern } from '../utils/helpers';

/**
 * Extract class names from plain HTML content using regex.
 *
 * Handles:
 *   - class="foo bar"
 *   - className="foo bar"   (JSX in .html files)
 *   - id="..." (ignored)
 */
export function parseHTMLClasses(
  content: string,
  filePath: string
): { references: ClassReference[]; patterns: DynamicPattern[] } {
  const references: ClassReference[] = [];
  const patterns: DynamicPattern[] = [];
  const lines = content.split('\n');

  // Match both class="..." and className="..." with single or double quotes
  const staticAttrRegex = /(?:class|className)\s*=\s*["']([^"']+)["']/g;
  let match: RegExpExecArray | null;

  while ((match = staticAttrRegex.exec(content)) !== null) {
    const value = match[1];
    const line = getLineNumber(content, match.index, lines);
    const classNames = splitClasses(value);

    for (const name of classNames) {
      references.push({ name, filePath, line, isDynamic: false });
    }
  }

  // Match template literal style class expressions: class=`foo ${bar}`
  const templateAttrRegex = /(?:class|className)\s*=\s*`([^`]+)`/g;
  while ((match = templateAttrRegex.exec(content)) !== null) {
    const value = match[1];
    const line = getLineNumber(content, match.index, lines);

    // Extract static parts outside ${ }
    const staticParts = value.split(/\$\{[^}]*\}/);
    for (const part of staticParts) {
      for (const name of splitClasses(part)) {
        references.push({ name, filePath, line, isDynamic: false });
      }
    }

    // Build the overall pattern for heuristic matching
    const overallPattern = templateLiteralToPattern(value.trim());
    if (overallPattern) {
      patterns.push({ ...overallPattern, filePath, line });
    }
  }

  return { references, patterns };
}

function getLineNumber(content: string, index: number, lines: string[]): number {
  const substring = content.substring(0, index);
  return substring.split('\n').length;
}
