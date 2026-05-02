# CSS Diet 🥗

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/css-diet.css-diet?label=VS%20Code%20Marketplace&logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=css-diet.css-diet)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Eliminate dead CSS code. **CSS Diet** scans your entire workspace to detect unused CSS classes across HTML, React, Vue, and Angular — locally, fast, and with smart dynamic detection.

## 🚀 Key Features

- 🔍 **Universal Scanning** — Scans `.css` and `.scss` against every markup/code file in your project.
- 🎨 **Editor Decorations** — Unused classes are greyed out with **strikethrough**; possibly-used classes get a wavy yellow underline.
- ⚠️ **Problems Panel** — Warning diagnostics show you exactly where unused classes are defined.
- 🧠 **Smart Dynamic Resolution** — Resolves variable values in template literals (e.g., `const size = 'sm'` + `` `btn-${size}` `` → `.btn-sm` is **USED**).
- 🛠️ **Deep SCSS Support** — fully resolves BEM nesting (`&__child`) even across `@media` and other At-Rules.
- ⚡ **Performant** — mtime-based file caching and debounced auto-scan keeps it fast with zero impact on your IDE performance.

## 📦 Framework Support

| Framework           | Supported Syntax                                                                    |
| ------------------- | ----------------------------------------------------------------------------------- |
| **Plain HTML**      | `class="btn primary"`                                                               |
| **React (JSX/TSX)** | `className`, Template Literals, Ternaries, Logical expressions, `clsx`/`classnames` |
| **Vue SFC**         | `class`, `:class` (String, Object keys, Arrays with nested templates)               |
| **Angular**         | `class`, `[class]`, `[class.name]`, `[ngClass]` (Object/Array)                      |
| **CSS/SCSS**        | Standard selectors, BEM nesting (`&`), Comma-lists, Media Queries                   |

## 🕹️ Usage

1. Open any project with CSS or SCSS files.
2. The extension automatically scans on activation and on every file save (debounced).
3. **Manual Scan**: Run `CSS Diet: Scan Project` from the Command Palette (`Cmd+Shift+P`).
4. **Report**: Check the **CSS Diet** output channel for a detailed per-file breakdown.

## ⚙️ Configuration

| Setting                          | Default                          | Description                                   |
| -------------------------------- | -------------------------------- | --------------------------------------------- |
| `cssDiet.enableDynamicDetection` | `true`                           | Resolve variables and patterns (e.g. `btn-*`) |
| `cssDiet.ignoredPatterns`        | `["node_modules","dist",".git"]` | Glob patterns to skip                         |
| `cssDiet.scanOnSave`             | `true`                           | Re-scan automatically when you save a file    |

## 🛠️ How it Works

1. **CSS/SCSS**: Uses **PostCSS** + `postcss-scss` to build a class map, resolving all nesting and BEM references.
2. **JSX/TSX**: Uses **Babel Parser** to track variable assignments and substitute them into template literals.
3. **Vue/Angular**: Uses robust regex with **backreference quote-matching** to correctly capture nested quotes in bound properties.
4. **Engine**: Compares definitions against concrete usages and fuzzy patterns to categorize every class as `USED`, `POSSIBLY_USED`, or `UNUSED`.

## 🧪 Verification

This extension is verified against a suite of 25 standalone test scenarios. You can run the logic verification script yourself:

```bash
node tests/verify_logic.js
```

## License

MIT © [Guru Kishore](https://github.com/gurukishore111)
