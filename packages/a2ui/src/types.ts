/** A2UI v0.9.1 protocol types. Anchored to specification/v0_9_1/json/*.json. */

export type ComponentId = string

/** `version` is enum ["v0.9", "v0.9.1"] — accept both. */
export type ProtocolVersion = 'v0.9' | 'v0.9.1'

export interface DataBinding {
  /** A JSON Pointer. Relative (no leading `/`) is legal inside a collection scope. */
  path: string
}

export type ReturnType_ = 'string' | 'number' | 'boolean' | 'array' | 'object' | 'any' | 'void'

export interface FunctionCall {
  call: string
  /** Optional per schema — only `call` is required. */
  args?: Record<string, DynamicValue>
  /** Optional; schema default is "boolean". */
  returnType?: ReturnType_
}

export type DynamicValue = string | number | boolean | unknown[] | DataBinding | FunctionCall

export interface TemplateChildList {
  componentId: ComponentId
  path: string
}

export type ChildList = ComponentId[] | TemplateChildList

export interface ComponentDefinition {
  id: ComponentId
  component: string
  child?: ComponentId
  children?: ChildList
  [prop: string]: unknown
}

export interface EventAction {
  event: { name: string; context?: Record<string, DynamicValue> }
}
export interface FunctionCallAction {
  functionCall: FunctionCall
}
export type Action = EventAction | FunctionCallAction

export interface CreateSurfacePayload {
  surfaceId: string
  catalogId: string
  theme?: unknown
  sendDataModel?: boolean
}
export interface UpdateComponentsPayload {
  surfaceId: string
  /** minItems: 1; exactly one component must have id === "root". */
  components: ComponentDefinition[]
}
export interface UpdateDataModelPayload {
  surfaceId: string
  path?: string
  value?: unknown
}
export interface DeleteSurfacePayload {
  surfaceId: string
}

export type ServerEnvelope =
  | { version: ProtocolVersion; createSurface: CreateSurfacePayload }
  | { version: ProtocolVersion; updateComponents: UpdateComponentsPayload }
  | { version: ProtocolVersion; updateDataModel: UpdateDataModelPayload }
  | { version: ProtocolVersion; deleteSurface: DeleteSurfacePayload }

export interface ClientAction {
  name: string
  surfaceId: string
  sourceComponentId: ComponentId
  timestamp: string
  context: Record<string, unknown>
}

export interface Transport {
  sendAction(action: ClientAction): void
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** DataBinding is `{ path }` with additionalProperties:false — exactly one key. */
export function isDataBinding(v: unknown): v is DataBinding {
  if (!isPlainObject(v)) return false
  const keys = Object.keys(v)
  return keys.length === 1 && keys[0] === 'path' && typeof v.path === 'string'
}

/** FunctionCall requires only `call`. */
export function isFunctionCall(v: unknown): v is FunctionCall {
  return isPlainObject(v) && typeof v.call === 'string'
}

/** ChildList template branch: `{ componentId, path }`, both required. */
export function isTemplateChildList(v: unknown): v is TemplateChildList {
  return isPlainObject(v) && typeof v.componentId === 'string' && typeof v.path === 'string'
}
