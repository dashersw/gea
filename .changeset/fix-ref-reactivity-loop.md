---
"@geajs/vite-plugin": patch
---

### @geajs/vite-plugin (patch)

- **Fix ref binding causing infinite re-render loop**: The compiler incorrectly treated `ref={this.myTextarea}` as a reactive template binding, generating both a clone patch entry (setting `ref` as an HTML attribute) and a reactive observer on the ref target property. When `__setupRefs()` assigned the DOM element to `this.myTextarea`, the observer fired `__geaRequestRender()`, which cloned new DOM, called `__setupRefs()` again with a different element, triggering another change — creating an infinite re-render loop. Fixed by: (1) skipping `ref` in `collectClonePatchEntries` so it's not patched as an HTML attribute, (2) skipping `ref` in `analyzeAttributes` so it doesn't create a `propBinding`, and (3) skipping expressions inside `ref={...}` attributes in `collectAllStateAccesses` so the ref target property doesn't get a reactive observer.
- **Fix on-prefixed event names in clone patches**: Event attributes using the `on*` prefix (e.g. `onclick`, `oninput`) were not recognized as events in `collectClonePatchEntries`, causing them to be incorrectly set as HTML attributes in the clone template. Fixed by also checking the normalized form against `EVENT_NAMES`.
