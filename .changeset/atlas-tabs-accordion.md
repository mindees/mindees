---
"@mindees/atlas": minor
---

Add **`Tabs`** and **`Accordion`** components (RN ships neither built-in). Both compose from primitives
(web + native), are accessible (`role="tablist"`/`"tab"`/`"tabpanel"`; `aria-expanded` headers), and
stay fine-grained — switching a tab or toggling a section re-runs only that panel region. `Tabs`
(controlled, with content panels), `Accordion` (single- or multi-open, `defaultOpen`, lazy panels).
