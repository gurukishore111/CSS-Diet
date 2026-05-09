const fs = require('fs');
const path = require('path');
const Module = require('module');

// Mock vscode module before importing our logic
const vscodeMock = {
    workspace: {
        getConfiguration: () => ({
            get: (key, def) => def
        }),
        asRelativePath: (p) => p
    },
    Uri: {
        file: (p) => ({ fsPath: p })
    },
    window: {
        createOutputChannel: () => ({
            appendLine: (msg) => console.log(msg)
        })
    }
};

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
    if (request === 'vscode') { return vscodeMock; }
    return originalLoad.apply(this, arguments);
};

const { parseCSSClasses } = require('../out/parser/cssParser');
const { parseHTMLClasses } = require('../out/parser/htmlParser');
const { parseJSXClasses } = require('../out/parser/jsParser');
const { parseVueClasses } = require('../out/parser/vueParser');
const { parseAngularClasses } = require('../out/parser/angularParser');
const { runDetection } = require('../out/engine/detectionEngine');

async function runTests() {
    console.log('🚀 Starting Standalone Logic Verification...\n');

    const results = {
        passed: 0,
        failed: 0
    };

    function assert(condition, message) {
        if (condition) {
            console.log(`✅ PASS: ${message}`);
            results.passed++;
        } else {
            console.log(`❌ FAIL: ${message}`);
            results.failed++;
        }
    }

    // ── 1. CSS Parsing ──
    const cssContent = `
        .btn { color: red; }
        .btn-primary { background: blue; }
        .btn-unused { color: green; }
        .card { padding: 10px; }
        .btn-sm { font-size: 12px; }
        .btn-lg { font-size: 18px; }
    `;
    const cssClasses = parseCSSClasses(cssContent, 'style.css');
    assert(cssClasses.length === 6, 'Should extract 6 CSS classes');

    // ── 2. HTML Parsing ──
    const htmlContent = `<div class="btn btn-primary card">Hello</div>`;
    const htmlResult = parseHTMLClasses(htmlContent, 'index.html');
    assert(htmlResult.references.length === 3, 'HTML: Should find 3 references');

    // ── 3. JSX Parsing with Variable Tracking ──
    const jsxContent = `
        const size = 'sm';
        export default function App() {
            return <div className={\`btn btn-\${size}\`} />;
        }
    `;
    const jsxResult = parseJSXClasses(jsxContent, 'App.jsx', true);
    assert(jsxResult.references.some(r => r.name === 'btn-sm'), 'JSX: Should resolve btn-sm from variable');
    assert(jsxResult.references.some(r => r.name === 'btn'), 'JSX: Should find static btn');

    // ── 4. Vue SFC Parsing ──
    const vueContent = `
        <template>
          <div class="wrapper" :class="{ active: isActive }"></div>
        </template>
    `;
    const vueResult = parseVueClasses(vueContent, 'App.vue', true);
    assert(vueResult.references.some(r => r.name === 'wrapper'), 'Vue: Should find static wrapper');
    assert(vueResult.references.some(r => r.name === 'active'), 'Vue: Should find dynamic active');

    // ── 5. Angular Parsing ──
    const angContent = `<div [ngClass]="{'active': true}" [class.loading]="isLoading"></div>`;
    const angResult = parseAngularClasses(angContent, 'app.component.html', true);
    assert(angResult.references.some(r => r.name === 'active'), 'Angular: Should find active from ngClass');
    assert(angResult.references.some(r => r.name === 'loading'), 'Angular: Should find loading from [class.loading]');

    // ── 6. Detection Engine ──
    const allRefs = [...htmlResult.references, ...jsxResult.references, ...vueResult.references, ...angResult.references];
    const allPatterns = [...htmlResult.patterns, ...jsxResult.patterns, ...vueResult.patterns, ...angResult.patterns];

    const detection = runDetection(cssClasses, allRefs, allPatterns, true);
    
    const unusedResult = detection.usageResults.find(r => r.cssClass.name === 'btn-unused');
    const usedSmResult = detection.usageResults.find(r => r.cssClass.name === 'btn-sm');
    const usedPrimaryResult = detection.usageResults.find(r => r.cssClass.name === 'btn-primary');

    assert(usedSmResult.status === 'USED', 'Engine: .btn-sm should be USED (resolved via variable)');
    assert(unusedResult.status === 'UNUSED', 'Engine: .btn-unused should be UNUSED');
    assert(usedPrimaryResult.status === 'USED', 'Engine: .btn-primary should be USED');

    // ── 7. Dynamic Pattern Fallback ──
    const unknownJsx = `export default function App({ variant }) { return <div className={\`btn-\${variant}\`} />; }`;
    const unknownResult = parseJSXClasses(unknownJsx, 'Dynamic.jsx', true);
    const detection2 = runDetection(cssClasses, unknownResult.references, unknownResult.patterns, true);
    const posUsed = detection2.usageResults.find(r => r.cssClass.name === 'btn-lg');
    assert(posUsed.status === 'POSSIBLY_USED', 'Engine: .btn-lg should be POSSIBLY_USED when variable is unknown');

    // ── 8. SCSS Deep Nesting & BEM ──
    const scssContent = `
        .container {
            padding: 10px;
            .card {
                &__title { font-weight: bold; }
                &--active { color: blue; }
                &:hover { opacity: 0.8; }
            }
        }
    `;
    const scssClasses = parseCSSClasses(scssContent, 'layout.scss', true);
    assert(scssClasses.some(c => c.name === 'container'), 'SCSS: Found .container');
    assert(scssClasses.some(c => c.name === 'card'), 'SCSS: Found nested .card');
    assert(scssClasses.some(c => c.name === 'card__title'), 'SCSS: Found BEM .card__title');
    assert(scssClasses.some(c => c.name === 'card--active'), 'SCSS: Found BEM .card--active');

    // ── 9. TSX with Types ──
    const tsxContent = `
        interface Props { cls: string }
        const App = ({ cls }: Props) => <div className={cls as any} />
    `;
    const tsxResult = parseJSXClasses(tsxContent, 'App.tsx', true);
    // Note: We can't resolve 'cls' because it's a prop, but we check if the parser handles the TS cast
    assert(tsxResult.references.length === 0, 'TSX: Handled file with type casting without crashing');

    // ── 10. Advanced Vue :class Array ──
    const vueAdvContent = `
        <template>
            <div :class="['base', { 'is-active': active, 'is-loading': loading }, \`theme-\${t}\`]"></div>
        </template>
    `;
    const vueAdvResult = parseVueClasses(vueAdvContent, 'Advanced.vue', true);
    assert(vueAdvResult.references.some(r => r.name === 'base'), 'Vue Adv: Found base in array');
    assert(vueAdvResult.references.some(r => r.name === 'is-active'), 'Vue Adv: Found object key in array');
    assert(vueAdvResult.references.some(r => r.name === 'is-loading'), 'Vue Adv: Found second object key in array');
    assert(vueAdvResult.patterns.length > 0, 'Vue Adv: Found dynamic pattern for theme-*');

    // ── 11. Angular [class] and [class.name] ──
    const angAdvContent = `
        <div [class]="'static-class'"></div>
        <div [class.active]="condition"></div>
    `;
    const angAdvResult = parseAngularClasses(angAdvContent, 'adv.html', true);
    assert(angAdvResult.references.some(r => r.name === 'static-class'), 'Angular Adv: Found [class] string');
    assert(angAdvResult.references.some(r => r.name === 'active'), 'Angular Adv: Found [class.name]');

    // ── 12. SCSS Nesting in Media Queries ──
    const mqContent = `
        .parent {
            @media (min-width: 600px) {
                &__child { color: blue; }
            }
        }
    `;
    const mqClasses = parseCSSClasses(mqContent, 'responsive.scss', true);
    assert(mqClasses.some(c => c.name === 'parent'), 'MQ: Found .parent');
    assert(mqClasses.some(c => c.name === 'parent__child'), 'MQ: Found nested .parent__child inside @media');

    console.log(`\n📊 Verification Summary: ${results.passed} Passed, ${results.failed} Failed`);

    if (results.failed > 0) process.exit(1);
}

runTests().catch(err => {
    console.error('💥 Test Suite Failed with Error:');
    console.error(err);
    process.exit(1);
});
