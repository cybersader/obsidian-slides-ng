---
theme: black
---

# Backgrounds fixture

Plain slide for baseline.

---

<!-- slide data-background-color="#1a3b5c" -->

# Solid color

Reveal applies the data-background-color directly.

---

<!-- slide data-background-image="https://picsum.photos/1280/720" -->

# Remote image

External URL — passes through the resolver without rewriting.

---

<!-- slide data-background-image="attachments/missing-but-named.png" -->

# Vault-relative path

The plugin's resolveImage callback rewrites this to an `app://` URL when
the named file is in the vault. (For E2E this file may not exist; the
test just asserts the resolver was called and the raw path was rewritten.)
