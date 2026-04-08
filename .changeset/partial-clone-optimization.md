---
"@geajs/vite-plugin": patch
---

### @geajs/vite-plugin (patch)

- **Partial clone optimization for child components**: Components containing child component instances now use the clone optimization path. The compiler emits a placeholder element (`data-gea-child-slot`) in the static HTML template and generates `replaceChild` calls in `__cloneTemplate` to swap each placeholder with the child component's `el` at mount time.
