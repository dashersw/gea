import type { Statement, Expression } from '@babel/types'
import { t } from '../../utils/babel-interop.ts'

export interface DirectFnComponentParams {
  props: string[]
  locals: string[]
}

export interface DirectFnEventTypes {
  eventTypes: Set<string>
  fastEventTypes: Set<string>
}

export interface EmitContext {
  /** Accumulated module-top template decls (hoisted `_tpl<N>` consts). */
  templateDecls: Statement[]
  /** Set of compiler-runtime helper names used (compiler adds imports for these). */
  importsNeeded: Set<string>
  /** Monotonic template counter. */
  tplCounter: number
  /** Monotonic list counter (for stable listId strings). */
  listCounter: number
  /** Monotonic counter for relational-class optimizations (per-compilation
   *  unique `__rowEls_<id>` suffixes). */
  relClassCounter: number
  /** Scratch list used by the event-slot grouper (set during one template's
   *  compileJsxToBlock pass, cleared before the next). */
  _pendingEvents?: Array<{ eventType: string; slotIndex: number; needsCurrentTarget: boolean; handler?: Expression }>
  /** When true, the current compileJsxToBlock is building a keyed-list row's
   *  createItem body. Events are emitted as direct expando assignments
   *  (`el.__on_type = handler`) instead of a `delegateEvent(root, type, pairs,
   *  d)` call — saves one function call + 3 array allocations per row at
   *  1000-row list scale (01_run1k / 07_create10k hot path). The enclosing
   *  keyed-list emitter collects the event types used into
   *  `_rowEventTypes` and emits one install-only `delegateEvent` call at
   *  the LIST scope to guarantee the document listener is attached. */
  _inKeyedListRow?: boolean
  /** Set of event types accumulated from the current keyed-list row's
   *  createItem body (only populated while `_inKeyedListRow` is true). */
  _rowEventTypes?: Set<string>
  /** Keyed-list row event types whose handlers can use the fast dispatcher. */
  _rowFastEventTypes?: Set<string>
  /** For each eventType, a Map<slotIdx, hN_identifier_name>. Populated by
   *  compileJsxToBlock in the keyed-list row path and consumed by
   *  emitKeyedListSlot to build the `delegateKeyedListEvent(container, type,
   *  [handlers], d)` call at list scope. Slot index matches the
   *  `data-gea-<type>="<slotIdx>"` attribute baked into the template HTML
   *  by the generator. */
  _rowEventHandlers?: Record<string, Map<number, string>>
  /** input event slot index -> same-element value expression. Used to fold
   *  value reconciliation into the existing delegated input handler. */
  _inputValueExprByEventSlot?: Map<number, any>
  /** Whether the current JSX block already guarantees a document click
   *  delegate for fast `__gc` handlers. */
  _documentClickDelegateInstalled?: boolean
  /**
   * Expression used as the reactive root (`this` for class components,
   * `props` for function components, or an Identifier pointing to a loop var
   * inside a keyed-list item template).
   */
  reactiveRoot: Expression
  /**
   * Destructuring bindings in scope. Map from identifier name to the source
   * MemberExpression it aliases. E.g. `const { scores } = props` produces
   * `bindings.set('scores', props.scores)`; expressions like `scores.X` in JSX
   * get rewritten to `props.scores.X` so reactive tracking resolves to the
   * real store path.
   */
  bindings: Map<string, Expression>
  /**
   * Names of `get`-accessor methods on the current class. Used to force
   * getter-form for `this.X` reactive bindings when `X` is a derived value —
   * path form would only track `this.X` but derived getters frequently read
   * from foreign stores whose changes path-form can't observe.
   */
  classGetters: Set<string>
  /** Local function components that can be called as direct DOM factories. */
  directFnComponents?: Set<string>
  /** Positional prop order for direct local function component factories. */
  directFnComponentParams?: Map<string, DirectFnComponentParams>
  /** Compile `props.*` expressions as one-shot reads instead of reactive bindings. */
  oneShotProps?: boolean
  /** Positional direct-factory prop locals in the current function component. */
  oneShotPropLocals?: Set<string>
  /** Direct-factory prop locals whose callsites always pass string literals. */
  oneShotStringPropLocals?: Set<string>
  /** Static string prop facts for direct local function component factories. */
  directFnStringProps?: Map<string, Set<string>>
  /** Direct local function component factories whose generated bodies do not read disposer `d`. */
  directFnNoDisposer?: Set<string>
  /** Static direct local function components that can be called through a generated factory. */
  directFnFactoryAliases?: Map<string, string>
  /** Event types written directly by direct function factories. Call sites install delegation once. */
  directFnEventTypes?: Map<string, DirectFnEventTypes>
  /** Class components proven safe for compiler-emitted direct construction. */
  directClassComponents?: Set<string>
  /** Imported function components already compiled to DOM factory functions. */
  directFactoryComponents?: Set<string>
}

export function createEmitContext(reactiveRoot?: Expression): EmitContext {
  return {
    templateDecls: [],
    importsNeeded: new Set(),
    tplCounter: 0,
    listCounter: 0,
    relClassCounter: 0,
    reactiveRoot: reactiveRoot ?? t.thisExpression(),
    bindings: new Map(),
    classGetters: new Set(),
  }
}

/**
 * Scan preceding statements for destructuring declarations and populate the
 * EmitContext's bindings map. Called by the file-level transformer before JSX
 * emission so member-chain substitution knows about them.
 *
 * Handles:
 *   - `const { a, b } = expr`                  → a → expr.a, b → expr.b
 *   - `const { a: x, b: y } = expr`            → x → expr.a, y → expr.b
 *   - `const { a, ...rest } = expr`            → a → expr.a (rest ignored)
 *   - `const a = expr.path`                    → a → expr.path
 * Non-reactive sources (literals, numeric exprs) are still recorded; the
 * substitution just passes them through, which is harmless.
 */
export function collectBindings(stmts: Statement[], bindings: Map<string, Expression>): void {
  for (const stmt of stmts) {
    if (!t.isVariableDeclaration(stmt)) continue
    for (const decl of stmt.declarations) {
      if (!decl.init) continue
      if (t.isObjectPattern(decl.id)) {
        for (const prop of decl.id.properties) {
          if (!t.isObjectProperty(prop)) continue
          if (!t.isIdentifier(prop.key)) continue
          const sourceKey = prop.key.name
          let localName: string
          if (t.isIdentifier(prop.value)) localName = prop.value.name
          else continue
          // Build MemberExpression: <init>.sourceKey
          const mem = t.memberExpression(cloneExpr(decl.init), t.identifier(sourceKey))
          bindings.set(localName, mem)
        }
      } else if (t.isIdentifier(decl.id)) {
        bindings.set(decl.id.name, cloneExpr(decl.init as Expression))
      }
    }
  }
}

/** Shallow clone to avoid AST aliasing hazards when substituting. */
function cloneExpr(expr: Expression): Expression {
  return t.cloneNode(expr) as Expression
}
