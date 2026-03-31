/**
 * Component Intermediate Representation.
 *
 * This is the data boundary between analysis and code generation.
 * All types here are plain data — no Babel AST nodes, no side effects.
 * Expressions are stored as source strings so the IR is serializable,
 * loggable, and decoupled from the AST toolchain.
 */

// ─── StorePath ──────────────────────────────────────────────────────────────

/** Identifies a reactive data path in a store or local state. */
export interface StorePath {
  /** Local variable name of the store (e.g. 'counterStore') */
  storeVar: string
  /** Property path parts (e.g. ['todos', '0', 'title']) */
  pathParts: string[]
  /** True when path contains '*' (array item wildcard) */
  isWildcard: boolean
  /** True when the path accesses a store getter */
  isGetter: boolean
  /** For getters: resolved to their underlying state deps */
  getterDeps?: StorePath[]
}

// ─── Template Tree ──────────────────────────────────────────────────────────

export interface TemplateIR {
  root: TemplateNodeIR
  cloneEligible: boolean
  earlyReturns: EarlyReturnIR[]
  /** Template-local const declarations before the return statement */
  setupStatements: SetupStatementIR[]
}

export interface TemplateNodeIR {
  kind: 'element' | 'text' | 'expression' | 'component' | 'conditional' | 'map' | 'fragment'
  /** HTML tag name (for 'element') or component class name (for 'component') */
  tag?: string
  attributes: AttributeIR[]
  children: TemplateNodeIR[]
  /** Binding suffix for getElementById (e.g. 'b0') */
  bindingId?: string
  /** User-provided id attribute expression (use instead of generated id) */
  userIdExpr?: string
  /** For 'expression' nodes: the JS expression string */
  expression?: string
  /** Whether to wrap expression in __escapeHtml */
  isEscaped?: boolean
  /** For 'text' nodes: the static text content (already HTML-escaped) */
  text?: string
  /** For 'component' nodes: index into ComponentIR.children */
  childIndex?: number
  /** For 'conditional' nodes: index into ComponentIR.conditionalSlots */
  condIndex?: number
  /** For 'map' nodes: index into ComponentIR.arrayMaps */
  mapIndex?: number
}

export interface AttributeIR {
  name: string
  kind: 'static' | 'dynamic' | 'boolean' | 'class-static' | 'class-dynamic' | 'class-object'
    | 'style-static' | 'style-dynamic' | 'style-object'
    | 'event' | 'ref' | 'dangerous-html' | 'key' | 'value' | 'checked'
  /** Static value string or dynamic expression string */
  value?: string
  /** For events: index into ComponentIR.eventHandlers */
  eventHandlerIndex?: number
  /** For refs: index into ComponentIR.refs */
  refIndex?: number
  /** For href/src/action: wrap value in __sanitizeAttr */
  isSanitized?: boolean
}

export interface EarlyReturnIR {
  /** Guard expression (e.g. '!project') */
  condition: string
  /** Template for the early-return branch */
  template: TemplateNodeIR
  setupStatements: SetupStatementIR[]
}

export interface SetupStatementIR {
  /** The raw source code of the statement */
  source: string
  /** Variable names this statement declares */
  declaredNames: string[]
}

// ─── Bindings ───────────────────────────────────────────────────────────────

export interface BindingIR {
  /** Binding suffix for getElementById */
  id: string
  type: 'text' | 'attribute' | 'class' | 'checked' | 'value' | 'style' | 'html'
  storePath: StorePath
  /** The JS expression that produces the new value */
  expression: string
  attributeName?: string
  isImportedState: boolean
  isBooleanAttribute: boolean
  userIdExpression?: string
  /** For text nodes with mixed static/dynamic content */
  templateParts?: { statics: string[]; expressions: string[] }
  /** Generate setAttribute equality check before writing */
  equalityGuard: boolean
}

// ─── Array Maps ─────────────────────────────────────────────────────────────

export interface ArrayMapIR {
  id: string
  storePath: StorePath
  itemVar: string
  indexVar?: string
  keyExpression: string
  containerBindingId: string
  containerUserIdExpression?: string
  hasComponentItems: boolean
  itemTemplate: TemplateNodeIR
  itemBindings: BindingIR[]
  relationalBindings: RelationalBindingIR[]
  conditionalBindings: ConditionalMapBindingIR[]
  isUnresolved: boolean
  getItemsExpression?: string
  derivedStages?: DerivedStageIR[]
  setupStatements: SetupStatementIR[]
  itemIdProperty: string
}

export interface DerivedStageIR {
  method: 'filter' | 'slice' | 'sort' | 'reverse'
  predicateExpression?: string
  callbackParams?: string[]
  args?: string[]
}

export interface RelationalBindingIR {
  id: string
  type: 'class'
  expression: string
  attributeName: string
  comparesItemId: boolean
}

export interface ConditionalMapBindingIR {
  condition: string
  truthyExpression: string
  falsyExpression?: string
}

// ─── Child Components ───────────────────────────────────────────────────────

export interface ChildComponentIR {
  className: string
  tagName: string
  instanceVar: string
  propsExpression: string
  observeDeps: StorePath[]
  isLazy: boolean
  isInMap: boolean
  buildPropsMethod?: string
  earlyReturnGuard?: EarlyReturnGuardIR
  dfsIndex: number
  directMappings?: DirectPropMappingIR[]
}

export interface EarlyReturnGuardIR {
  condition: string
  setupStatements: SetupStatementIR[]
}

export interface DirectPropMappingIR {
  parentPropName: string
  childPropName: string
}

// ─── Conditional Slots ──────────────────────────────────────────────────────

export interface ConditionalSlotIR {
  id: string
  kind: 'and' | 'ternary' | 'state-child-swap'
  condition: string
  truthyTemplate: TemplateNodeIR
  falsyTemplate?: TemplateNodeIR
  truthyExpression?: string
  falsyExpression?: string
  dependentProps: string[]
  dependentStorePaths: StorePath[]
  setupStatements: SetupStatementIR[]
  lazyChildren: number[]
  swapChildren?: {
    truthyChildIndex: number
    falsyChildIndex: number
  }
}

// ─── Events ─────────────────────────────────────────────────────────────────

export interface EventHandlerIR {
  id: string
  eventType: string
  targetBindingId: string
  handlerExpression: string
  isPropCallback: boolean
  mapContext?: {
    mapIndex: number
    itemVar: string
    indexVar?: string
  }
  setupStatements: SetupStatementIR[]
}

// ─── Refs ───────────────────────────────────────────────────────────────────

export interface RefIR {
  id: string
  fieldName: string
  markerAttribute: string
}

// ─── Prop Bindings ──────────────────────────────────────────────────────────

export interface PropBindingIR {
  propName: string
  bindingId: string
  type: 'text' | 'class' | 'attribute' | 'value' | 'checked'
  expression: string
  attributeName?: string
  userIdExpression?: string
  stateOnly?: boolean
  setupStatements: SetupStatementIR[]
}

// ─── Observers ──────────────────────────────────────────────────────────────

export interface ObserverIR {
  id: string
  storePath: StorePath
  storeVar: string
  updates: ObserverUpdateIR[]
  isWildcard: boolean
}

export interface ObserverUpdateIR {
  type: 'text' | 'attribute' | 'class' | 'checked' | 'value' | 'style' | 'html'
    | 'child-props' | 'conditional-patch' | 'rerender'
  bindingId?: string
  expression: string
  attributeName?: string
  childInstanceVar?: string
  condSlotId?: string
  equalityGuard: boolean
  isBooleanAttribute?: boolean
  templateParts?: { statics: string[]; expressions: string[] }
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
  initExpression?: string
}

// ─── ComponentIR ────────────────────────────────────────────────────────────

export interface ComponentIR {
  className: string
  isDefaultExport: boolean

  template: TemplateIR
  bindings: BindingIR[]
  observers: ObserverIR[]
  children: ChildComponentIR[]
  arrayMaps: ArrayMapIR[]
  conditionalSlots: ConditionalSlotIR[]
  eventHandlers: EventHandlerIR[]
  refs: RefIR[]

  propBindings: PropBindingIR[]
  rerenderProps: string[]
  rerenderConditions: string[]

  userCreatedHooks: boolean

  imports: Map<string, string>
  storeImports: Map<string, string>
  stateRefs: Map<string, StateRefMeta>
  knownComponentImports: Set<string>
}

// ─── File-level metadata ────────────────────────────────────────────────────

export interface FileMetadata {
  componentClassNames: string[]
  imports: Map<string, string>
  importKinds: Map<string, 'default' | 'named' | 'namespace'>
  isDefaultExport: Map<string, boolean>
  storeImports: Map<string, string>
  knownComponentImports: Set<string>
  hasJSX: boolean
  functionalComponentName?: string
}
