---
"@geajs/vite-plugin": patch
---

### @geajs/vite-plugin (patch)

- **Unsupported JSX fails the build instead of rendering nothing**: six patterns compiled without a warning and then did nothing at runtime. Each one is now a compile error with the file, line and a hint, in dev, in `vite build` and in the playground compiler:
  - spread props on a component tag (`<Child {...props} />`): the component got its props without them. Pass each prop individually. A spread on an element compiles since #219;
  - a capitalized tag holding a string (`const Tag = 'section'; <Tag />`, or `let Tag; Tag = 'section'`): write the element, or pick one with a conditional. A tag holding a component (`const Icon = cond ? A : B`) still compiles;
  - a callback ref (`ref={(el) => …}`): use an assignable target such as `ref={this.input}`. A ref to a local the compiler inlines (`let el = null; <input ref={el} />`) gets its own error: declare it as `let el` with no initializer;
  - a class `template()` whose JSX isn't the returned root (`return cond ? <a /> : <button />`): wrap the result in an element or a fragment;
  - capture-phase handlers for DOM events (`onClickCapture`, `onclickcapture`, `onPasteCapture`): not supported yet. Custom events whose name ends in "capture" (`onScreenCapture`), `onGotPointerCapture` and `onLostPointerCapture` still compile;
  - a component class declared inside a function: declare it at the top level.
