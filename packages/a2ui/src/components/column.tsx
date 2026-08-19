import { Component } from '@geajs/core'

/**
 * A2UI `Column`. Renders an empty element; the interpreter appends children
 * into `inst.el` directly (see instantiate.ts).
 *
 * Deliberately no `{props.children}` expression: the compiler turns a child
 * expression into a reactive text marker, and when no `children` thunk is
 * passed the marker's placeholder ("0") stays in the DOM as a literal text
 * node. A container the interpreter fills has no use for the slot anyway.
 */
export default class Column extends Component {
  template() {
    return <div class="a2ui-column"></div>
  }
}
