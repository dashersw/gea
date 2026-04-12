import type * as t from '@babel/types'

export type PathParts = string[]

export interface ReactiveBinding {
  pathParts: PathParts
  type: 'text' | 'attribute' | 'class' | 'checked' | 'value'
  selector: string
  /** Unique id suffix for getElementById (this.id + '-' + bindingId). Empty for root. */
  bindingId?: string
  /** When set, the user provided an explicit `id` attribute — use this for getElementById lookups instead of the framework-generated ID. */
  userIdExpr?: t.Expression
  attributeName?: string
  elementPath: string[]
  isImportedState?: boolean
  storeVar?: string
  classToggleName?: string
  itemIdProperty?: string
  textTemplate?: string
  textExpressionIndex?: number
  textExpressions?: TextExpression[]
  childPath?: number[]
  expression?: t.Expression
  /** When true, the binding value contains HTML and must update via innerHTML (not textContent). */
  isChildrenProp?: boolean
  textNodeIndex?: number
  isObjectClass?: boolean
  isBooleanAttr?: boolean
  isUrlAttr?: boolean
}

export interface TextExpression {
  pathParts: PathParts
  isImportedState?: boolean
  storeVar?: string
  expression?: t.Expression
}

export interface HandlerPropInMap {
  propName: string
  handlerExpression: t.ArrowFunctionExpression | t.FunctionExpression
  itemIdProperty: string
}

export interface EventHandler {
  eventType: string
  handlerExpression?: t.Expression
  elementId?: number
  selector?: string
  selectorExpression?: t.Expression
  methodName?: string
  delegatedPropName?: string
  usesTargetComponent?: boolean
  mapContext?: {
    arrayPathParts: PathParts
    itemIdProperty: string
    /** When the map uses a non-trivial `key` (e.g. template literal), use this for DOM-item lookup. */
    keyExpression?: t.Expression
    itemVariable: string
    indexVariable?: string
    isImportedState: boolean
    storeVar?: string
    itemRefProperty?: string
    containerBindingId?: string
  }
}

export interface ObserveDependency {
  observeKey: string
  pathParts: PathParts
  storeVar?: string
}

export interface RelationalMapBinding {
  observePathParts: PathParts
  storeVar?: string
  selector: string
  type: 'class'
  itemIdProperty: string
  classToggleName: string
  classWhenMatch: boolean
  scopeClassIsPure?: boolean
}

export interface ConditionalMapBinding {
  observe: ObserveDependency
  type: 'text' | 'className' | 'attribute'
  childPath: number[]
  selector: string
  expression: t.Expression
  attributeName?: string
  requiresRerender?: boolean
}

export interface ArrayMapBinding {
  arrayPathParts: PathParts
  storeVar?: string
  itemVariable: string
  indexVariable?: string
  itemBindings: ReactiveBinding[]
  relationalBindings?: RelationalMapBinding[]
  containerSelector: string
  /** Path for id injection; when set, containerBindingId is assigned and getElementById is used */
  containerElementPath?: string[]
  containerBindingId?: string
  containerUserIdExpr?: t.Expression
  itemTemplate?: t.JSXElement | t.JSXFragment
  isImportedState?: boolean
  isKeyed?: boolean
  itemIdProperty?: string
  /** Full key expression AST when key is not a simple item.prop (e.g. template literals, concatenation) */
  keyExpression?: t.Expression
  classToggleName?: string
  /** Index of the first conditional slot that follows this map in JSX source order. */
  afterCondSlotIndex?: number
  conditionalBindings?: ConditionalMapBinding[]
  callbackBodyStatements?: t.Statement[]
}

export interface ChildComponent {
  tagName: string
  instanceVar: string
  slotId: string
  propsExpression: t.ObjectExpression
  dependencies: ObserveDependency[]
  setupStatements?: t.Statement[]
  earlyReturnGuards?: t.IfStatement[]
  guardSetupStatements?: t.Statement[]
  lazy?: boolean
  directMappings?: { parentPropName: string; childPropName: string }[]
  /** DFS traversal index — used to order constructor instantiation (leaves before parents) */
  dfsIndex?: number
}

export interface PropBinding {
  propName: string
  selector: string
  type: 'text' | 'class' | 'attribute' | 'value' | 'checked'
  attributeName?: string
  expression?: t.Expression
  setupStatements?: t.Statement[]
  /** Path for id injection; when set, bindingId is assigned and getElementById is used */
  elementPath?: string[]
  bindingId?: string
  /** When set, the user provided an explicit `id` attribute — use this for getElementById lookups instead of the framework-generated ID. */
  userIdExpr?: t.Expression
  /** When true, the binding depends solely on local/imported state, not on props */
  stateOnly?: boolean
  /** When true, the binding value contains HTML and must update via innerHTML (not textContent). */
  isChildrenProp?: boolean
  textNodeIndex?: number
}

export interface ConditionalSlot {
  slotId: string
  conditionExpr: t.Expression
  setupStatements: t.Statement[]
  /** Setup statements needed by the truthy/falsy HTML expressions (may include extra vars) */
  htmlSetupStatements?: t.Statement[]
  dependentPropNames: string[]
  dependencies: ObserveDependency[]
  /** The original JSX expression from the template (the full conditional expression) */
  originalExpr: t.Expression
  /** The transformed HTML expression for the truthy branch (populated after template transform) */
  truthyHtmlExpr?: t.Expression
  /** The transformed HTML expression for the falsy branch when present */
  falsyHtmlExpr?: t.Expression
}

export interface UnresolvedRelationalClassBinding {
  observeKey: string
  classToggleName: string
  matchWhenEqual: boolean
  /** Property on the item to compare (e.g. 'id'). undefined means the item itself is the key (primitives). */
  itemProperty?: string
}

export interface UnresolvedMapInfo {
  containerSelector: string
  itemTemplate?: t.JSXElement | t.JSXFragment
  itemVariable: string
  indexVariable?: string
  itemIdProperty?: string
  /** Full key expression AST when key is not a simple item.prop (e.g. template literals, concatenation) */
  keyExpression?: t.Expression
  computationExpr?: t.Expression
  rootHasUserId?: boolean
  /** Expression that appears as the map's object in the template (for replacement matching). When computationExpr is inlined from const x = y, this stays as identifier x. */
  mapObjectExpr?: t.Expression
  computationSetupStatements?: t.Statement[]
  /** Path for id injection; when set, containerBindingId is assigned and getElementById is used */
  containerElementPath?: string[]
  containerBindingId?: string
  containerUserIdExpr?: t.Expression
  dependencies?: ObserveDependency[]
  /** Statements from the map callback body that precede the JSX return (e.g. variable lookups, early-return guards) */
  callbackBodyStatements?: t.Statement[]
  /** Per-item class toggles that can be patched surgically without full list rebuild */
  relationalClassBindings?: UnresolvedRelationalClassBinding[]
  /** Index of the first conditional slot that follows this map in JSX source order.
   *  The runtime uses this to insert list items before `<!--{id}-c{N}-->` instead of
   *  blindly using the first conditional marker (which may precede the map). */
  afterCondSlotIndex?: number
}

// ─── State Refs ─────────────────────────────────────────────────────────────

export type StateRefKind =
  | 'local'
  | 'imported'
  | 'imported-destructured'
  | 'local-destructured'
  | 'store-alias'
  | 'derived'

export interface StateRefMeta {
  kind: StateRefKind
  source?: string
  storeVar?: string
  propName?: string
  getterDeps?: Map<string, string[][]>
  reactiveFields?: Set<string>
  initExpression?: t.Expression
}
