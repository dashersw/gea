---
"@geajs/vite-plugin": minor
---

### @geajs/vite-plugin (minor)

- **Warnings for JSX the compiler can't compile, and a `strict` option that fails the build on it**: six patterns compiled silently and then did nothing at runtime. Each one is now a warning with the file, line, column and a hint, in the `vite` terminal, in `vite build` output and in the playground preview. The code still compiles as before, so existing projects keep building. With `geaPlugin({ strict: true })`, each one is a compile error instead, in dev, in `vite build` and in the playground compiler (`compileForBrowser(files, { strict: true })`):
  - spread props on a component tag (`<Child {...props} />`): the component got its props without them. Pass each prop individually. A spread on an element compiles since #219;
  - a capitalized tag holding a string (`const Tag = 'section'; <Tag />`, or `let Tag; Tag = 'section'`): write the element, or pick one with a conditional. A tag holding a component (`const Icon = cond ? A : B`) compiles without a warning;
  - a callback ref (`ref={(el) => …}`): use an assignable target such as `ref={this.input}`. A ref to a local the compiler inlines (`let el = null; <input ref={el} />`) gets its own message: declare it as `let el` with no initializer;
  - a class `template()` whose JSX isn't the returned root (`return cond ? <a /> : <button />`): wrap the result in an element or a fragment;
  - capture-phase handlers for DOM events (`onClickCapture`, `onclickcapture`, `onPasteCapture`): not supported yet. Custom events whose name ends in "capture" (`onScreenCapture`), `onGotPointerCapture` and `onLostPointerCapture` compile without a warning;
  - a component class declared inside a function: declare it at the top level.
