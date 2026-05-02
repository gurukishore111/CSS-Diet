import postcss from 'postcss';
import postcssScss from 'postcss-scss';
import { CSSClass } from '../types';
import { normaliseClassName } from '../utils/helpers';

/**
 * Extract all class selectors from a CSS or SCSS file's content.
 *
 * Handles:
 *  - Simple selectors:  .btn, .card-primary
 *  - Compound:          .btn.active, .btn:hover
 *  - Nested (SCSS):     .parent { .child { } }
 *  - Comma-separated:   .btn, .card
 */
export function parseCSSClasses(
  content: string,
  filePath: string,
  isSCSS = false
): CSSClass[] {
  const classes: CSSClass[] = [];

  try {
    const root = isSCSS
      ? postcssScss.parse(content)
      : postcss.parse(content);

    root.walk((node) => {
      if (node.type === 'rule') {
        // Resolve full selector for SCSS nesting (e.g. .parent { &__child {} })
        const fullSelector = resolveFullSelector(node as any);
        const line = node.source?.start?.line ?? 0;
        const column = node.source?.start?.column ?? 0;

        extractClassesFromSelector(fullSelector, filePath, line, column, classes);
      }
    });
  } catch (error) {
    // Silently skip files with syntax errors – they may be malformed
  }

  return classes;
}

/**
 * Resolve the full selector string by traversing up the parent chain (SCSS).
 * Handles the '&' parent reference.
 */
function resolveFullSelector(node: postcss.Rule): string {
  let selector = node.selector;
  let current = node.parent;

  while (current) {
    if (current.type === 'rule') {
      const parentSelector = (current as postcss.Rule).selector;
      
      // If the child contains '&', replace it with the parent selector
      if (selector.includes('&')) {
        selector = selector.replace(/&/g, parentSelector);
      } else {
        // Otherwise, it's a standard descendant: ".parent .child"
        selector = `${parentSelector} ${selector}`;
      }
    }
    // Continue up even if it's an AtRule (like @media) to find outer rules
    current = current.parent as any;
  }

  return selector;
}

/**
 * Parse a CSS selector string and extract every class name contained within.
 */
function extractClassesFromSelector(
  selector: string,
  filePath: string,
  line: number,
  column: number,
  out: CSSClass[]
): void {
  // Split by comma to handle ".a, .b { }" style selectors
  const parts = selector.split(',');

  for (const part of parts) {
    // Match all .className occurrences within the selector part
    // This regex matches a dot followed by a valid CSS identifier
    const classRegex = /\.(-?[_a-zA-Z][_a-zA-Z0-9-]*)/g;
    let match: RegExpExecArray | null;

    while ((match = classRegex.exec(part)) !== null) {
      const rawName = match[1];
      const name = normaliseClassName(rawName);

      if (name && !out.some((c) => c.name === name && c.filePath === filePath)) {
        out.push({ name, filePath, line, column });
      }
    }
  }
}
