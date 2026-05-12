---
theme: black
customCSS:
  - ".slides-ng-custom-css-marker { display: block; }"
  - ".reveal h1 { color: hotpink !important; }"
---

# Custom CSS fixture

This deck applies two custom rules via `customCSS:` deck headmatter. The
heading should render in hotpink. A marker class lets E2E assert the
custom rule made it into the iframe srcdoc.

---

# Second slide

Same custom CSS applies deck-wide.
