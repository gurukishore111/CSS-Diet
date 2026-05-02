import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';
import { ClassReference, DynamicPattern } from '../types';
import { splitClasses, templateLiteralToPattern } from '../utils/helpers';

/**
 * Parse a JSX or TSX file using @babel/parser and extract class names from
 * all className prop occurrences.
 *
 * Handles:
 *   className="btn primary"          → StringLiteral
 *   className={'btn'}                 → StringLiteral in JSXExpressionContainer
 *   className={`btn ${active}`}       → TemplateLiteral
 *   className={isActive && 'active'}  → LogicalExpression
 *   className={ok ? 'a' : 'b'}        → ConditionalExpression
 *   className={['btn', cond && 'x']}  → ArrayExpression
 *   clsx('btn', { active: isActive }) → CallExpression (basic)
 */
export function parseJSXClasses(
  content: string,
  filePath: string,
  enableDynamic: boolean
): { references: ClassReference[]; patterns: DynamicPattern[] } {
  const references: ClassReference[] = [];
  const patterns: DynamicPattern[] = [];

  let ast: ReturnType<typeof parse>;
  try {
    ast = parse(content, {
      sourceType: 'module',
      plugins: [
        'jsx',
        'typescript',
        'classProperties',
        'decorators-legacy',
        'optionalChaining',
        'nullishCoalescingOperator',
      ],
      errorRecovery: true,
    });
  } catch {
    // Fall back to regex-based extraction if Babel fails
    return fallbackRegexExtract(content, filePath);
  }

  // Pass 1: collect simple variable string assignments → used to resolve template literals
  const knownVars = enableDynamic ? collectVariableValues(ast) : new Map<string, string[]>();

  const addRef = (name: string, line: number, isDynamic = false) => {
    if (name.trim()) {
      references.push({ name: name.trim(), filePath, line, isDynamic });
    }
  };

  const processNode = (node: t.Node, line: number) => {
    if (t.isStringLiteral(node)) {
      for (const cls of splitClasses(node.value)) {
        addRef(cls, line);
      }
    } else if (t.isTemplateLiteral(node) && enableDynamic) {
      const { concrete, rawTemplate } = resolveTemplateLiteral(node, knownVars);

      if (concrete.length > 0) {
        // We know the exact values — emit concrete class names (no pattern needed)
        for (const cls of concrete) {
          for (const part of splitClasses(cls)) addRef(part, line, false);
        }
      } else {
        // Unknown variable — extract static quasis and emit a heuristic pattern
        for (const quasi of node.quasis) {
          for (const cls of splitClasses(quasi.value.raw)) addRef(cls, line);
        }
        const dp = templateLiteralToPattern(rawTemplate);
        if (dp) patterns.push({ ...dp, filePath, line });
      }
    } else if (t.isLogicalExpression(node) && enableDynamic) {
      processNode(node.right, line);
    } else if (t.isConditionalExpression(node) && enableDynamic) {
      processNode(node.consequent, line);
      processNode(node.alternate, line);
    } else if (t.isArrayExpression(node) && enableDynamic) {
      for (const el of node.elements) {
        if (el) processNode(el, line);
      }
    } else if (t.isObjectExpression(node) && enableDynamic) {
      // { active: isActive } → treat keys as class names
      for (const prop of node.properties) {
        if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
          addRef(prop.key.name, line, true);
        } else if (t.isObjectProperty(prop) && t.isStringLiteral(prop.key)) {
          addRef(prop.key.value, line, true);
        }
      }
    } else if (t.isCallExpression(node)) {
      // Handle clsx(...) / classnames(...)
      for (const arg of node.arguments) {
        if (t.isExpression(arg)) processNode(arg, line);
      }
    }
  };

  traverse(ast, {
    JSXAttribute(path) {
      const nameProp = path.node.name;
      const attrName = t.isJSXIdentifier(nameProp)
        ? nameProp.name
        : t.isJSXNamespacedName(nameProp)
        ? nameProp.name.name
        : '';

      if (attrName !== 'className') return;

      const value = path.node.value;
      const line = path.node.loc?.start.line ?? 0;

      if (!value) return;

      if (t.isStringLiteral(value)) {
        for (const cls of splitClasses(value.value)) {
          addRef(cls, line);
        }
      } else if (t.isJSXExpressionContainer(value)) {
        const expr = value.expression;
        if (t.isJSXEmptyExpression(expr)) return;
        processNode(expr, line);
      }
    },
  });

  return { references, patterns };
}

/**
 * Pass 1 – collect all simple string/number literal variable bindings in the file.
 * e.g. `const size = 'sm'`  →  { size: ['sm'] }
 *      `const mode = active ? 'dark' : 'light'` → { mode: ['dark', 'light'] }
 */
function collectVariableValues(ast: ReturnType<typeof parse>): Map<string, string[]> {
  const vars = new Map<string, string[]>();

  traverse(ast, {
    VariableDeclarator(path) {
      const id = path.node.id;
      const init = path.node.init;
      if (!t.isIdentifier(id) || !init) return;

      const values = extractStringValues(init);
      if (values.length > 0) {
        vars.set(id.name, values);
      }
    },
  });

  return vars;
}

/** Recursively pull concrete string values out of simple expressions. */
function extractStringValues(node: t.Node): string[] {
  if (t.isStringLiteral(node)) return [node.value];
  if (t.isNumericLiteral(node)) return [String(node.value)];
  if (t.isTemplateLiteral(node) && node.expressions.length === 0) {
    return [node.quasis[0].value.cooked ?? node.quasis[0].value.raw];
  }
  if (t.isConditionalExpression(node)) {
    return [
      ...extractStringValues(node.consequent),
      ...extractStringValues(node.alternate),
    ];
  }
  if (t.isArrayExpression(node)) {
    return node.elements.flatMap((el) => (el ? extractStringValues(el) : []));
  }
  return [];
}

/**
 * Resolve a TemplateLiteral to a set of concrete class strings when we know
 * the variable values; falls back to the broad pattern if unknown.
 *
 * `btn-${size}`  +  { size: ['sm', 'lg'] }  →  ['btn-sm', 'btn-lg']
 * `btn-${x}`     +  { }                      →  pattern 'btn-*'
 */
function resolveTemplateLiteral(
  node: t.TemplateLiteral,
  knownVars: Map<string, string[]>
): { concrete: string[]; rawTemplate: string } {
  // Gather per-slot candidate values
  const slots: string[][] = node.expressions.map((expr) => {
    if (t.isIdentifier(expr)) {
      const known = knownVars.get(expr.name);
      if (known && known.length > 0) return known;
    }
    // Unknown — use a sentinel so we know we need the pattern
    return [];
  });

  const allResolved = slots.every((s) => s.length > 0);

  // Build the raw template string for pattern fallback
  let rawTemplate = '';
  for (let i = 0; i < node.quasis.length; i++) {
    rawTemplate += node.quasis[i].value.raw;
    if (i < node.expressions.length) rawTemplate += '${expr}';
  }

  if (!allResolved) {
    return { concrete: [], rawTemplate };
  }

  // Cartesian product across all slots
  let results: string[] = [node.quasis[0].value.raw];
  for (let i = 0; i < slots.length; i++) {
    const next: string[] = [];
    for (const prefix of results) {
      for (const val of slots[i]) {
        next.push(prefix + val + node.quasis[i + 1].value.raw);
      }
    }
    results = next;
  }

  return { concrete: results, rawTemplate };
}


/**
 * Fallback: use regex to pull className="..." out of JSX when parsing fails.
 */
function fallbackRegexExtract(
  content: string,
  filePath: string
): { references: ClassReference[]; patterns: DynamicPattern[] } {
  const references: ClassReference[] = [];
  const patterns: DynamicPattern[] = [];
  const lines = content.split('\n');
  const regex = /className\s*=\s*["']([^"']+)["']/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const lineNum = content.substring(0, match.index).split('\n').length;
    for (const cls of splitClasses(match[1])) {
      references.push({ name: cls, filePath, line: lineNum, isDynamic: false });
    }
  }

  return { references, patterns };
}
