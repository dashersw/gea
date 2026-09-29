---
"@geajs/vite-plugin": patch
---

### @geajs/vite-plugin (patch)

- **Unsupported JSX fails the build instead of rendering nothing**: five patterns compiled without a warning and then did nothing at runtime. Each one is now a compile error with the file, line and a hint, in dev, in `vite build` and in the playground compiler:
  - a capitalized tag holding a string (`const Tag = 'section'; <Tag />`): write the element, or pick one with a conditional. A tag holding a component (`const Icon = cond ? A : B`) still compiles;
  - a callback ref (`ref={(el) => …}`): use an assignable target such as `ref={this.input}`;
  - a class `template()` whose JSX isn't the returned root (`return cond ? <a /> : <button />`): wrap the result in an element or a fragment;
  - capture-phase handlers (`onClickCapture`): not supported yet. `onGotPointerCapture` and `onLostPointerCapture` are real events and still compile;
  - a component class declared inside a function: declare it at the top level.
