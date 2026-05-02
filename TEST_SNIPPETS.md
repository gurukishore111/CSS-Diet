/* ============================================================
   CSS Diet — Test Snippets
   Use this file to test your setup in the Extension Dev Host.
   Open this alongside test-project/style.css and run:
     Cmd+Shift+P → "CSS Diet: Scan Project"
   ============================================================ */


/* ── 1. PLAIN HTML ──────────────────────────────────────────── */

/*
   File: index.html
   Expected:
     .btn         → USED
     .btn-primary → USED
     .card        → USED
     .ghost       → UNUSED ❌
*/

/*
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <button class="btn btn-primary">Click me</button>
  <div class="card">
    <p class="card-body">Hello world</p>
  </div>
</body>
</html>
*/


/* ── 2. REACT / JSX ─────────────────────────────────────────── */

/*
   File: Button.jsx
   Tests: StringLiteral, template literal (resolved), ternary, logical
   Expected:
     .btn           → USED  (StringLiteral)
     .btn-sm        → USED  (resolved from const size = 'sm')
     .active        → USED  (ternary + logical)
     .inactive      → USED  (ternary)
     .btn-disabled  → UNUSED ❌
*/

/*
import React, { useState } from 'react';

const size = 'sm';

export default function Button({ disabled }) {
  const [isActive, setIsActive] = useState(false);

  return (
    <button
      className={`btn btn-${size} ${isActive ? 'active' : 'inactive'} ${disabled && 'btn-disabled'}`}
      onClick={() => setIsActive(!isActive)}
    >
      Click
    </button>
  );
}
*/


/* ── 3. REACT / TSX ─────────────────────────────────────────── */

/*
   File: Card.tsx
   Tests: clsx-style array, object, conditional
   Expected:
     .card        → USED
     .card-dark   → USED  (ternary)
     .card-light  → USED  (ternary)
     .elevated    → USED  (object key)
     .card-ghost  → UNUSED ❌
*/

/*
import React from 'react';

type Props = { dark?: boolean; elevated?: boolean };

export default function Card({ dark, elevated }: Props) {
  const theme = dark ? 'card-dark' : 'card-light';

  return (
    <div
      className={[
        'card',
        theme,
        elevated ? { elevated: true } : {},
      ]
        .filter(Boolean)
        .join(' ')}
    >
      Content
    </div>
  );
}
*/


/* ── 4. VUE SFC ─────────────────────────────────────────────── */

/*
   File: MyComponent.vue
   Tests: static class, :class string, :class object, :class array
   Expected:
     .wrapper    → USED  (static)
     .btn        → USED  (:class string)
     .active     → USED  (:class object key)
     .disabled   → USED  (:class object key)
     .btn-ghost  → UNUSED ❌
*/

/*
<template>
  <div class="wrapper">
    <button
      :class="'btn'"
      :class="{ active: isActive, disabled: isDisabled }"
    >
      {{ label }}
    </button>
  </div>
</template>

<script>
export default {
  data() {
    return {
      isActive: false,
      isDisabled: false,
      label: 'Click me',
    };
  },
};
</script>

<style scoped>
.wrapper  { padding: 1rem; }
.btn      { cursor: pointer; }
.active   { font-weight: bold; }
.disabled { opacity: 0.5; }
.btn-ghost { display: none; }    /* UNUSED */
</style>
*/


/* ── 5. ANGULAR TEMPLATE ────────────────────────────────────── */

/*
   File: app.component.html  +  app.component.ts
   Tests: static, [ngClass] string, [ngClass] object, [class.name]
   Expected:
     .container   → USED  (static)
     .btn-primary → USED  ([ngClass] string)
     .active      → USED  ([ngClass] object key)
     .loading     → USED  ([class.loading] binding)
     .btn-ghost   → UNUSED ❌
*/

/*
<!-- app.component.html -->
<div class="container">
  <button
    [ngClass]="'btn-primary'"
    [ngClass]="{ active: isActive, loading: false }"
    [class.loading]="isLoading"
  >
    Submit
  </button>
</div>
*/


/* ── 6. SCSS NESTING ─────────────────────────────────────────── */

/*
   File: components.scss
   Tests: nested selectors, BEM modifiers, pseudo-classes
   Expected:
     .card          → USED  (if referenced in HTML)
     .card__header  → USED
     .card--dark    → USED
     .card__footer  → UNUSED ❌  (not in any markup)
*/

/*
.card {
  padding: 1rem;

  &__header {
    font-weight: bold;
  }

  &__footer {                   // UNUSED if no markup uses .card__footer
    border-top: 1px solid #eee;
  }

  &--dark {
    background: #1a1a1a;
    color: white;
  }

  &:hover {                     // pseudo-class, not a class name — ignored
    box-shadow: 0 2px 8px rgba(0,0,0,.1);
  }
}
*/


/* ── 7. DYNAMIC PATTERN (UNKNOWN VARIABLE) ──────────────────── */

/*
   File: Dynamic.jsx
   Tests: template literal with an unknown (prop-based) variable
   Because `variant` comes from props (not a simple const), the parser
   can't resolve it — it falls back to the pattern "btn-*".
   Expected:
     .btn-sm  → POSSIBLY_USED ⚠️  [matches "btn-*"]
     .btn-lg  → POSSIBLY_USED ⚠️  [matches "btn-*"]
     .btn-xl  → POSSIBLY_USED ⚠️  [matches "btn-*"]
     .ghost   → UNUSED ❌  (doesn't match "btn-*")
*/

/*
export default function Button({ variant }) {
  return <button className={`btn-${variant}`}>Click</button>;
}
*/


/* ── 8. MULTI-VALUE TERNARY RESOLUTION ──────────────────────── */

/*
   File: Theme.tsx
   Tests: const assigned via ternary → both values resolved concretely
   Expected:
     .theme-dark  → USED  (resolved from ternary)
     .theme-light → USED  (resolved from ternary)
     .theme-ghost → UNUSED ❌
*/

/*
const isDark = true;
const theme = isDark ? 'dark' : 'light';

export default function App() {
  return <div className={`theme-${theme}`}>Hello</div>;
}
*/
