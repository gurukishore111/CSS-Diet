import * as vscode from 'vscode';
import { ClassUsageResult } from '../types';

/** Decoration type for UNUSED classes – grey strikethrough */
let unusedDecorationType: vscode.TextEditorDecorationType | undefined;
/** Decoration type for POSSIBLY_USED classes – yellow underline */
let possiblyUsedDecorationType: vscode.TextEditorDecorationType | undefined;

/**
 * Create (or recreate) decoration types.
 * Must be called once during extension activation.
 */
export function createDecorationTypes(): void {
  disposeDecorationTypes();

  unusedDecorationType = vscode.window.createTextEditorDecorationType({
    opacity: '0.4',
    textDecoration: 'line-through',
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    overviewRulerColor: new vscode.ThemeColor('editorWarning.foreground'),
    overviewRulerLane: vscode.OverviewRulerLane.Right,
    light: {
      color: '#888888',
    },
    dark: {
      color: '#666666',
    },
  });

  possiblyUsedDecorationType = vscode.window.createTextEditorDecorationType({
    textDecoration: 'underline wavy',
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    overviewRulerColor: new vscode.ThemeColor('editorInfo.foreground'),
    overviewRulerLane: vscode.OverviewRulerLane.Right,
    light: {
      textDecoration: 'underline wavy #e6a817',
    },
    dark: {
      textDecoration: 'underline wavy #c8a227',
    },
  });
}

/**
 * Apply decorations to a CSS/SCSS editor based on detection results.
 */
export function applyDecorations(
  editor: vscode.TextEditor,
  results: ClassUsageResult[]
): void {
  if (!unusedDecorationType || !possiblyUsedDecorationType) return;

  const filePath = editor.document.uri.fsPath;

  const unusedRanges: vscode.DecorationOptions[] = [];
  const possiblyUsedRanges: vscode.DecorationOptions[] = [];

  for (const result of results) {
    if (result.cssClass.filePath !== filePath) continue;

    // Line numbers from PostCSS are 1-based; VS Code ranges are 0-based
    const lineIndex = Math.max(0, result.cssClass.line - 1);
    const line = editor.document.lineAt(Math.min(lineIndex, editor.document.lineCount - 1));

    const range = findClassRange(line, result.cssClass.name);
    if (!range) continue;

    if (result.status === 'UNUSED') {
      unusedRanges.push({
        range,
        hoverMessage: new vscode.MarkdownString(
          `**CSS Diet**: \`.${result.cssClass.name}\` appears to be **unused**`
        ),
      });
    } else if (result.status === 'POSSIBLY_USED') {
      const patternMsg = result.matchedPattern
        ? ` (matches pattern \`${result.matchedPattern.display}\`)`
        : '';
      possiblyUsedRanges.push({
        range,
        hoverMessage: new vscode.MarkdownString(
          `**CSS Diet**: \`.${result.cssClass.name}\` is **possibly used dynamically**${patternMsg}`
        ),
      });
    }
  }

  editor.setDecorations(unusedDecorationType, unusedRanges);
  editor.setDecorations(possiblyUsedDecorationType, possiblyUsedRanges);
}

/**
 * Remove all decorations from all visible editors.
 */
export function clearDecorations(): void {
  if (unusedDecorationType) {
    vscode.window.visibleTextEditors.forEach((e) =>
      e.setDecorations(unusedDecorationType!, [])
    );
  }
  if (possiblyUsedDecorationType) {
    vscode.window.visibleTextEditors.forEach((e) =>
      e.setDecorations(possiblyUsedDecorationType!, [])
    );
  }
}

/**
 * Dispose decoration types (call on deactivation or recreation).
 */
export function disposeDecorationTypes(): void {
  unusedDecorationType?.dispose();
  possiblyUsedDecorationType?.dispose();
  unusedDecorationType = undefined;
  possiblyUsedDecorationType = undefined;
}

/**
 * Find the range of `.className` within a line's text.
 * Checks for both `.className` (with the dot) first, then just `className`.
 */
function findClassRange(
  line: vscode.TextLine,
  className: string
): vscode.Range | undefined {
  const text = line.text;

  // Try to find ".className" in the selector e.g. ".btn-primary"
  const withDot = `.${className}`;
  let idx = text.indexOf(withDot);
  if (idx !== -1) {
    return new vscode.Range(
      line.lineNumber,
      idx,
      line.lineNumber,
      idx + withDot.length
    );
  }

  // Fallback: search for just the class name
  idx = text.indexOf(className);
  if (idx !== -1) {
    return new vscode.Range(
      line.lineNumber,
      idx,
      line.lineNumber,
      idx + className.length
    );
  }

  // Use the full line as fallback
  return line.range;
}
