import { traverse, t } from '../utils/babel-interop.ts'
import type { NodePath } from '../utils/babel-interop.ts'
import type {
  ConditionalMapBinding,
  ObserveDependency,
  PathParts,
  PropBinding,
  ReactiveBinding,
  ArrayMapBinding,
  RelationalMapBinding,
  TextExpression,
  UnresolvedMapInfo,
} from '../ir/types.ts'
import {
  buildObserveKey,
  pathPartsToString,
  resolvePath,
} from '../codegen/member-chain.ts'
import { generateSelector } from '../codegen/jsx-utils.ts'
import { callsJSXReturningProperty } from '../codegen/gen-template.ts'
import {
  isEventAttribute,
  isMapCall,
  classifyAttribute,
  getDirectChildElements,
  getJSXTagName,
} from './jsx-walker.ts'
import {
  resolveExpr,
  resolvePropRef,
  applyImportedState,
  isComputedArrayProp,
  addArrayTextBindings,
  extractItemTemplate,
  extractCallbackBodyStatements,
  normalizeDestructuredMapCallback,
  detectItemIdProperty,
  hasRootUserIdAttribute,
  detectContainerSelector,
  hasExplicitItemKey,
  extractKeyExpression,
  ITEM_IS_KEY,
} from './helpers.ts'
import { collectExpressionDependencies, collectTemplateSetupStatements } from './binding-resolver.ts'
import type { StateRefMeta } from '../parse/state-refs.ts'
import {
  resolveHelperCallExpression,
  collectUnresolvedComputationDependencies,
  collectItemTemplateStoreDependencies,
  detectUnresolvedRelationalClassBindings,
} from './dependency-collector.ts'

export function buildTextTemplateExpressionFromParts(
  textTemplate: string,
  textExpressions: TextExpression[],
): t.TemplateLiteral {
  const templateParts = textTemplate.split(/\$\{(\d+)\}/g)
  const quasis: t.TemplateElement[] = []
  const expressions: t.Expression[] = []

  for (let i = 0; i < templateParts.length; i++) {
    if (i % 2 === 0) {
      const raw = templateParts[i] || ''
      quasis.push(t.templateElement({ raw, cooked: raw }, i === templateParts.length - 1))
      continue
    }

    const idx = Number.parseInt(templateParts[i] || '-1', 10)
    const textExpr = textExpressions[idx]
    if (textExpr?.expression) {
      expressions.push(t.cloneNode(textExpr.expression, true) as t.Expression)
    } else {
      expressions.push(t.identifier('undefined'))
    }
  }

  return t.templateLiteral(quasis, expressions)
}

export function analyzeAttributes(
  node: t.JSXElement,
  tagName: string,
  elementPath: string[],
  bindings: ReactiveBinding[],
  propBindings: PropBinding[],
  stateProps: Map<string, PathParts>,
  stateRefs: Map<string, StateRefMeta>,
  propsParamName?: string,
  destructuredPropNames?: Set<string>,
  templateSetupContext?: { params: Array<t.Identifier | t.Pattern | t.RestElement>; statements: t.Statement[] },
  classBody?: t.ClassBody,
) {
  node.openingElement.attributes.forEach((attr) => {
    if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name)) return
    if (!attr.value || !t.isJSXExpressionContainer(attr.value)) return
    const name = attr.name.name
    if (name === 'ref') return
    if (isEventAttribute(name)) return
    if (name === 'dangerouslySetInnerHTML') {
      // Track as a state-dependent binding for reactive innerHTML updates
      const expr = attr.value.expression
      if (templateSetupContext && !t.isJSXEmptyExpression(expr)) {
        const setupStatements = collectTemplateSetupStatements(expr, templateSetupContext)
        const dependencies = collectExpressionDependencies(expr, stateRefs, setupStatements)
        const stateDeps = dependencies.filter(
          (d) => d.storeVar || (d.pathParts.length > 0 && d.pathParts[0] !== 'props'),
        )
        if (stateDeps.length > 0) {
          const selector = generateSelector(elementPath)
          propBindings.push({
            propName: '__state__',
            selector,
            type: 'attribute',
            attributeName: 'dangerouslySetInnerHTML',
            elementPath: [...elementPath],
            expression: t.cloneNode(expr, true) as t.Expression,
            setupStatements: setupStatements.length > 0 ? setupStatements : undefined,
          })
        }
      }
      return
    }
    const expr = attr.value.expression

    const propName = resolvePropRef(expr, propsParamName, destructuredPropNames)
    if (propName) {
      const selector = generateSelector(elementPath)
      if (name === 'class' || name === 'className') {
        propBindings.push({ propName, selector, type: 'class', elementPath: [...elementPath] })
      } else if (name === 'value' || name === 'checked') {
        propBindings.push({
          propName,
          selector,
          type: name as 'value' | 'checked',
          attributeName: name,
          elementPath: [...elementPath],
        })
      } else {
        propBindings.push({ propName, selector, type: 'attribute', attributeName: name, elementPath: [...elementPath] })
      }
      return
    }

    const kind = classifyAttribute(name)
    const attrType =
      kind === 'class'
        ? 'class'
        : kind === 'value' || kind === 'checked'
          ? (name as 'value' | 'checked')
          : 'attribute'
    const derived = buildDerivedPropBindings(
      expr,
      attrType,
      attrType === 'class' ? undefined : name,
      elementPath,
      propsParamName,
      destructuredPropNames,
      templateSetupContext,
      classBody,
    )
    if (derived.length > 0) {
      propBindings.push(...derived)
    }

    const tagNameNode = node.openingElement.name
    const isNativeElement = t.isJSXIdentifier(tagNameNode) && /^[a-z]/.test(tagNameNode.name)
    if (isNativeElement && templateSetupContext && !t.isJSXEmptyExpression(expr)) {
      const setupStatements = collectTemplateSetupStatements(expr, templateSetupContext)
      const dependencies = collectExpressionDependencies(expr, stateRefs, setupStatements)
      const stateDeps = dependencies.filter((d) => d.storeVar || (d.pathParts.length > 0 && d.pathParts[0] !== 'props'))
      if (stateDeps.length > 0) {
        const selector = generateSelector(elementPath)
        propBindings.push({
          propName: '__state__',
          selector,
          type: attrType,
          attributeName: attrType === 'class' ? undefined : name,
          elementPath: [...elementPath],
          expression: t.cloneNode(expr, true) as t.Expression,
          setupStatements: setupStatements.map((s) => t.cloneNode(s, true) as t.Statement),
          stateOnly: true,
        })
        return
      }
    }

    if (derived.length > 0) return

    if (name === 'value' || name === 'checked') {
      const result = resolveExpr(expr, stateRefs)
      if (!result?.parts?.length) return
      const binding: ReactiveBinding = {
        pathParts: result.parts,
        type: name as 'value' | 'checked',
        selector: generateSelector(elementPath),
        attributeName: name,
        elementPath: [...elementPath],
      }
      applyImportedState(binding, result, stateProps)
      bindings.push(binding)
    }
  })
}

export function collectTextChildren(
  node: t.JSXElement,
  stateRefs: Map<string, StateRefMeta>,
  stateProps: Map<string, PathParts>,
) {
  const textChildren: Array<{ type: 'text' | 'expression'; value?: string; expression?: t.Expression }> = []
  let hasExpr = false

  node.children.forEach((child) => {
    if (t.isJSXText(child)) {
      textChildren.push({ type: 'text', value: child.value })
    } else if (t.isJSXExpressionContainer(child) && !t.isJSXEmptyExpression(child.expression)) {
      const expr = child.expression
      const isMap =
        t.isCallExpression(expr) &&
        t.isMemberExpression(expr.callee) &&
        t.isIdentifier(expr.callee.property) &&
        expr.callee.property.name === 'map'
      if (!isMap) {
        // Expand TemplateLiterals into separate text + expression entries
        // so that shouldBuildTextTemplate becomes true and the observer
        // generates the full formatted template expression instead of
        // using just the raw value parameter.
        if (t.isTemplateLiteral(expr)) {
          for (let i = 0; i < expr.quasis.length; i++) {
            const quasi = expr.quasis[i]
            if (quasi.value.raw) {
              textChildren.push({ type: 'text', value: quasi.value.raw })
            }
            if (i < expr.expressions.length) {
              const innerExpr = expr.expressions[i]
              if (t.isExpression(innerExpr)) {
                textChildren.push({ type: 'expression', expression: innerExpr })
                hasExpr = true
              }
            }
          }
        } else {
          textChildren.push({ type: 'expression', expression: expr })
          hasExpr = true
        }
      }
    }
  })

  const exprCount = textChildren.filter((c) => c.type === 'expression').length
  const allTextIsWhitespace = textChildren
    .filter((c) => c.type === 'text')
    .every((c) => !c.value || c.value.trim() === '')
  const shouldBuildTextTemplate =
    hasExpr && (exprCount > 1 || (textChildren.some((c) => c.type === 'text') && !allTextIsWhitespace))

  let textTemplate: string | undefined
  const textExpressions: TextExpression[] = []

  if (shouldBuildTextTemplate) {
    const parts: string[] = []
    let idx = 0
    textChildren.forEach((c) => {
      if (c.type === 'text' && c.value) {
        parts.push(c.value)
        return
      }
      if (c.type !== 'expression' || !c.expression) return
      parts.push(`\${${idx}}`)
      const result = resolveExpr(c.expression, stateRefs)
      textExpressions.push({
        pathParts: result?.parts || [],
        isImportedState: result?.isImportedState || false,
        storeVar: result?.storeVar,
        expression: c.expression,
      })
      if (result?.isImportedState && result.parts) {
        stateProps.set(buildObserveKey(result.parts, result.storeVar), [...result.parts])
      }
      idx++
    })
    textTemplate = parts.join('')
  }

  return { textTemplate, textExpressions, shouldBuildTextTemplate }
}

function parentHasElementChildren(node: t.JSXElement): boolean {
  return node.children.some((c) => t.isJSXElement(c))
}

function getDOMTextNodeIndex(children: t.JSXElement['children'], childIndex: number): number {
  let domIndex = 0
  let inTextRun = false

  for (let i = 0; i < children.length; i++) {
    const child = children[i]

    if (t.isJSXText(child)) {
      if (child.value.trim() === '') continue
      if (!inTextRun) {
        inTextRun = true
        domIndex++
      }
    } else if (t.isJSXExpressionContainer(child)) {
      if (!inTextRun) {
        inTextRun = true
        domIndex++
      }
      if (i === childIndex) return domIndex - 1
    } else if (t.isJSXElement(child) || t.isJSXFragment(child)) {
      inTextRun = false
      domIndex++
    }
  }

  return 0
}

export function analyzeChildren(
  node: t.JSXElement,
  tagName: string,
  elementPath: string[],
  bindings: ReactiveBinding[],
  propBindings: PropBinding[],
  arrayMaps: ArrayMapBinding[],
  stateProps: Map<string, PathParts>,
  stateRefs: Map<string, StateRefMeta>,
  textTemplate: string | undefined,
  textExpressions: TextExpression[],
  shouldBuildTextTemplate: boolean,
  walk: (n: t.JSXElement | t.JSXFragment, ep: string[]) => void,
  onUnresolvedMap: (info: UnresolvedMapInfo) => void,
  classBody?: t.ClassBody,
  propsParamName?: string,
  destructuredPropNames?: Set<string>,
  templateSetupContext?: { params: Array<t.Identifier | t.Pattern | t.RestElement>; statements: t.Statement[] },
  rerenderPropNames?: Set<string>,
  rerenderConditions?: Array<{ expression: t.Expression; setupStatements: t.Statement[] }>,
  conditionalSlots?: import('../ir').ConditionalSlot[],
  templateRoot?: t.JSXElement | null,
  conditionalSlotNodeMap?: Map<t.Node, string>,
) {
  getDirectChildElements(node.children).forEach((child) => {
    walk(child.node, [...elementPath, child.selectorSegment])
  })

  node.children.forEach((child, index) => {
    if (t.isJSXExpressionContainer(child) && !t.isJSXEmptyExpression(child.expression)) {
      const expr = child.expression
      if (isMapCall(expr)) {
        handleArrayMap(
          expr as t.CallExpression,
          tagName,
          node,
          elementPath,
          index,
          arrayMaps,
          stateProps,
          stateRefs,
          onUnresolvedMap,
          classBody,
          templateSetupContext,
          conditionalSlots != null ? conditionalSlots.length : undefined,
        )
      } else {
        // Collect nested maps first, then handle text binding (which may create a
        // conditional slot), then process the maps with the slot ID prefix so
        // their container element paths don't collide with main-template paths.
        const nestedMapCalls = collectNestedMapCalls(expr)
        const hasNestedMapCall = nestedMapCalls.length > 0
        const jsxInTextSiblingGroup = shouldBuildTextTemplate && textSiblingGroupContainsJSX(textExpressions)
        const mixedTextNodeIndex =
          parentHasElementChildren(node) || jsxInTextSiblingGroup
            ? getDOMTextNodeIndex(node.children, index)
            : undefined
        // Call handleTextBinding first -- it may push a conditional slot
        const slotCountBefore = conditionalSlots?.length ?? 0
        handleTextBinding(
          expr,
          node,
          tagName,
          elementPath,
          bindings,
          propBindings,
          stateProps,
          stateRefs,
          textTemplate,
          textExpressions,
          shouldBuildTextTemplate,
          propsParamName,
          destructuredPropNames,
          templateSetupContext,
          rerenderPropNames,
          rerenderConditions,
          conditionalSlots,
          hasNestedMapCall,
          classBody,
          conditionalSlotNodeMap,
          mixedTextNodeIndex,
          jsxInTextSiblingGroup,
        )
        // Determine if a conditional slot was created for this expression
        const slotCountAfter = conditionalSlots?.length ?? 0
        const slotId = slotCountAfter > slotCountBefore ? conditionalSlots![slotCountAfter - 1].slotId : undefined
        if (slotCountAfter > slotCountBefore && conditionalSlots && conditionalSlotNodeMap && templateSetupContext) {
          registerNestedConditionalsInBranches(
            expr,
            stateRefs,
            templateSetupContext,
            conditionalSlots,
            conditionalSlotNodeMap,
            classBody,
          )
        }
        nestedMapCalls.forEach(({ mapExpr, parentElement, containerPath }) => {
          let mapNode = node
          let mapElementPath = elementPath
          let mapTagName = tagName
          if (parentElement) {
            mapNode = parentElement
            mapTagName = getJSXTagName(parentElement.openingElement.name) || tagName
          }
          if (containerPath) {
            // Prefix with the conditional slot ID to avoid path collisions
            // with elements in the main template
            const prefix = slotId ? `__cs_${slotId}` : undefined
            mapElementPath = prefix ? [prefix, ...containerPath] : containerPath
          }
          handleArrayMap(
            mapExpr,
            mapTagName,
            mapNode,
            mapElementPath,
            index,
            arrayMaps,
            stateProps,
            stateRefs,
            onUnresolvedMap,
            classBody,
            templateSetupContext,
          )
        })
      }
    }
  })
}

// isMapCall is now imported from jsx-walker.ts

interface NestedMapInfo {
  mapExpr: t.CallExpression
  parentElement?: t.JSXElement
  /** Element path from the conditional branch root to the map's container element */
  containerPath?: string[]
}

function collectNestedMapCalls(expr: t.Expression | t.JSXEmptyExpression): NestedMapInfo[] {
  if (t.isJSXEmptyExpression(expr)) return []
  const maps: NestedMapInfo[] = []
  const program = t.program([t.expressionStatement(t.cloneNode(expr, true) as t.Expression)])
  traverse(program, {
    noScope: true,
    CallExpression(path: NodePath<t.CallExpression>) {
      if (isMapCall(path.node)) {
        let parentElement: t.JSXElement | undefined
        let parentPath: NodePath | undefined
        let current = path.parentPath
        while (current) {
          if (current.isJSXElement()) {
            parentElement = current.node
            parentPath = current
            break
          }
          current = current.parentPath
        }

        // Compute element path from the conditional branch root to the parent JSX element
        let containerPath: string[] | undefined
        if (parentPath) {
          const segments: string[] = []
          let cur: NodePath = parentPath
          while (cur.parentPath) {
            const par = cur.parentPath
            if (par.isJSXElement() || par.isJSXFragment()) {
              const children = getDirectChildElements(par.node.children)
              const match = children.find((dc) => dc.node === cur.node)
              if (match) segments.unshift(match.selectorSegment)
              if (par.isJSXElement()) {
                cur = par
                continue
              }
            }
            // Reached a non-JSX parent (expression, conditional, etc.) -- stop
            break
          }
          if (segments.length > 0) containerPath = segments
        }

        maps.push({ mapExpr: path.node, parentElement, containerPath })
      }
    },
  })
  return maps
}

function handleArrayMap(
  expr: t.CallExpression,
  tagName: string,
  node: t.JSXElement,
  elementPath: string[],
  index: number,
  arrayMaps: ArrayMapBinding[],
  stateProps: Map<string, PathParts>,
  stateRefs: Map<string, StateRefMeta>,
  onUnresolvedMap: (info: UnresolvedMapInfo) => void,
  classBody?: t.ClassBody,
  templateSetupContext?: { params: Array<t.Identifier | t.Pattern | t.RestElement>; statements: t.Statement[] },
  afterCondSlotIndex?: number,
) {
  const arrayExpr = (expr.callee as t.MemberExpression).object
  const normalizedArrayExpr = resolveHelperCallExpression(arrayExpr as t.Expression, classBody) || arrayExpr

  if (t.isArrowFunctionExpression(expr.arguments?.[0])) {
    const tpl = extractItemTemplate(expr.arguments[0] as t.ArrowFunctionExpression)
    if (tpl && !hasExplicitItemKey(tpl)) {
      const loc = tpl.loc?.start
      const locStr = loc ? ` (line ${loc.line}, col ${loc.column})` : ''
      const err = new Error(
        `[gea] Array .map() items must have a \`key\` prop on the root element${locStr}. ` +
          `Add key={item.id} (or another unique identifier) to the outermost JSX element returned by the .map() callback.`,
      )
      ;(err as any).__geaCompileError = true
      throw err
    }
  }

  const result = resolvePath(normalizedArrayExpr as t.MemberExpression | t.Identifier, stateRefs)
  const isDestructuredNonReactive =
    result?.parts?.length === 1 &&
    result.isImportedState &&
    t.isIdentifier(normalizedArrayExpr) &&
    (() => {
      const ref = stateRefs.get(normalizedArrayExpr.name)
      if (!ref || ref.kind !== 'imported-destructured' || !ref.storeVar || !ref.propName) return false
      const storeRef = stateRefs.get(ref.storeVar)
      return !storeRef?.reactiveFields?.has(ref.propName)
    })()
  if (!result?.parts?.length || isDestructuredNonReactive || !t.isArrowFunctionExpression(expr.arguments[0])) {
    if (t.isArrowFunctionExpression(expr.arguments?.[0])) {
      const arrowFn = expr.arguments[0] as t.ArrowFunctionExpression
      normalizeDestructuredMapCallback(arrowFn)
      const itemVar = t.isIdentifier(arrowFn.params[0]) ? arrowFn.params[0].name : 'item'
      const indexVar = t.isIdentifier(arrowFn.params[1]) ? arrowFn.params[1].name : undefined
      const itemTemplate = extractItemTemplate(arrowFn)
      const itemIdProp = detectItemIdProperty(itemTemplate, itemVar)
      const computationSetupStatements = templateSetupContext
        ? collectTemplateSetupStatements(normalizedArrayExpr as t.Expression, templateSetupContext)
        : []
      const dependencies = collectUnresolvedComputationDependencies(
        normalizedArrayExpr as t.Expression,
        stateRefs,
        computationSetupStatements,
        classBody,
      )
      collectItemTemplateStoreDependencies(itemTemplate, itemVar, stateRefs, dependencies)
      const relationalClassBindings = detectUnresolvedRelationalClassBindings(
        itemTemplate,
        itemVar,
        stateRefs,
        dependencies,
      )
      const cbBodyStmts = extractCallbackBodyStatements(arrowFn)
      onUnresolvedMap({
        containerSelector: detectContainerSelector(node, tagName),
        itemTemplate,
        itemVariable: itemVar,
        ...(indexVar ? { indexVariable: indexVar } : {}),
        itemIdProperty: itemIdProp,
        ...(!itemIdProp && hasExplicitItemKey(itemTemplate)
          ? { keyExpression: t.cloneNode(extractKeyExpression(itemTemplate)!, true) }
          : {}),
        rootHasUserId: hasRootUserIdAttribute(itemTemplate),
        computationExpr: t.cloneNode(normalizedArrayExpr, true),
        computationSetupStatements: computationSetupStatements.map((stmt) => t.cloneNode(stmt, true) as t.Statement),
        dependencies,
        containerElementPath: [...elementPath],
        ...(cbBodyStmts.length > 0 ? { callbackBodyStatements: cbBodyStmts } : {}),
        ...(relationalClassBindings.length > 0 ? { relationalClassBindings } : {}),
        ...(afterCondSlotIndex != null ? { afterCondSlotIndex } : {}),
      })
    }
    return
  }

  if (result.isImportedState) {
    stateProps.set(buildObserveKey(result.parts, result.storeVar), [...result.parts])
  }

  const finalPath = result.parts
  const arrowFn = expr.arguments[0] as t.ArrowFunctionExpression
  normalizeDestructuredMapCallback(arrowFn)
  const itemVar = t.isIdentifier(arrowFn.params[0]) ? arrowFn.params[0].name : 'item'
  const indexVar = t.isIdentifier(arrowFn.params[1]) ? arrowFn.params[1].name : undefined
  const itemTemplate = extractItemTemplate(arrowFn)
  const cbBodyStmts = extractCallbackBodyStatements(arrowFn)
  const itemIdProperty = detectItemIdProperty(itemTemplate, itemVar)
  const relationalIdProperty = itemIdProperty || 'id'
  const isKeyed = hasExplicitItemKey(itemTemplate)
  const containerSelector = detectContainerSelector(node, tagName)
  const itemBindings: ReactiveBinding[] = []
  const relationalBindings: RelationalMapBinding[] = []
  const conditionalBindings: ConditionalMapBinding[] = []

  const storeVar = result.isImportedState ? result.storeVar : undefined
  const walkBody = (body: t.Expression | t.Statement) => {
    let target: t.JSXElement | t.JSXFragment | t.Expression | undefined = body as t.Expression
    if (t.isBlockStatement(body)) {
      const returnStmt = body.body.find((s) => t.isReturnStatement(s)) as t.ReturnStatement | undefined
      target = returnStmt?.argument as t.Expression | undefined
    }
    if (!target) return
    if (t.isConditionalExpression(target))
      target = t.isJSXElement(target.consequent) ? target.consequent : target.alternate
    if (t.isParenthesizedExpression(target)) target = target.expression
    if (t.isJSXElement(target))
      analyzeJSXInMap(
        target,
        finalPath,
        itemVar,
        itemBindings,
        relationalBindings,
        conditionalBindings,
        [],
        result.isImportedState || false,
        relationalIdProperty,
        stateRefs,
        [],
        storeVar,
      )
    else if (t.isJSXFragment(target))
      target.children.forEach((fc) => {
        if (t.isJSXElement(fc))
          analyzeJSXInMap(
            fc,
            finalPath,
            itemVar,
            itemBindings,
            relationalBindings,
            conditionalBindings,
            [],
            result.isImportedState || false,
            relationalIdProperty,
            stateRefs,
            [],
            storeVar,
          )
      })
    else if (t.isParenthesizedExpression(target) && t.isJSXElement(target.expression))
      analyzeJSXInMap(
        target.expression,
        finalPath,
        itemVar,
        itemBindings,
        relationalBindings,
        conditionalBindings,
        [],
        result.isImportedState || false,
        relationalIdProperty,
        stateRefs,
        [],
        storeVar,
      )
  }
  walkBody(arrowFn.body as t.Expression)

  let classToggleName: string | undefined
  itemBindings.forEach((b) => {
    if (b.type === 'class' && b.classToggleName && !classToggleName) classToggleName = b.classToggleName
  })
  relationalBindings.forEach((binding) => {
    stateProps.set(buildObserveKey(binding.observePathParts, binding.storeVar), [...binding.observePathParts])
    if (binding.classToggleName && !classToggleName) classToggleName = binding.classToggleName
  })
  conditionalBindings.forEach((binding) => {
    stateProps.set(binding.observe.observeKey, [...binding.observe.pathParts])
  })

  arrayMaps.push({
    arrayPathParts: finalPath,
    storeVar: result.storeVar,
    itemVariable: itemVar,
    ...(indexVar ? { indexVariable: indexVar } : {}),
    itemBindings,
    relationalBindings,
    containerSelector,
    containerElementPath: [...elementPath],
    itemTemplate,
    isImportedState: result.isImportedState || false,
    isKeyed,
    itemIdProperty: itemIdProperty || (isKeyed ? undefined : 'id'),
    ...(!itemIdProperty && isKeyed ? { keyExpression: t.cloneNode(extractKeyExpression(itemTemplate)!, true) } : {}),
    classToggleName,
    conditionalBindings,
    ...(cbBodyStmts.length > 0 ? { callbackBodyStatements: cbBodyStmts } : {}),
    ...(afterCondSlotIndex != null ? { afterCondSlotIndex } : {}),
  })
}

function handleTextBinding(
  expr: t.Expression | t.JSXEmptyExpression,
  node: t.JSXElement,
  tagName: string,
  elementPath: string[],
  bindings: ReactiveBinding[],
  propBindings: PropBinding[],
  stateProps: Map<string, PathParts>,
  stateRefs: Map<string, StateRefMeta>,
  textTemplate: string | undefined,
  textExpressions: TextExpression[],
  shouldBuildTextTemplate: boolean,
  propsParamName?: string,
  destructuredPropNames?: Set<string>,
  templateSetupContext?: { params: Array<t.Identifier | t.Pattern | t.RestElement>; statements: t.Statement[] },
  rerenderPropNames?: Set<string>,
  rerenderConditions?: Array<{ expression: t.Expression; setupStatements: t.Statement[] }>,
  conditionalSlots?: import('../ir').ConditionalSlot[],
  _hasNestedMapCall: boolean = false,
  classBody?: t.ClassBody,
  conditionalSlotNodeMap?: Map<t.Node, string>,
  textNodeIndex?: number,
  jsxInTextSiblingGroup = false,
) {
  const propName = resolvePropRef(expr, propsParamName, destructuredPropNames)
  if (propName) {
    if (
      shouldBuildTextTemplate &&
      textTemplate &&
      textExpressions.length > 0 &&
      templateSetupContext &&
      !jsxInTextSiblingGroup
    ) {
      const derivedTemplateExpr = buildTextTemplateExpressionFromParts(textTemplate, textExpressions)
      const setupStatements = collectTemplateSetupStatements(derivedTemplateExpr, templateSetupContext)
      const dependentProps = collectDependentPropNames(
        derivedTemplateExpr,
        setupStatements,
        propsParamName,
        destructuredPropNames,
        classBody,
      )
      const selector = generateSelector(elementPath)

      if (dependentProps.length > 0) {
        propBindings.push(
          ...dependentProps.map((prop) => ({
            propName: prop,
            selector,
            type: 'text' as const,
            elementPath: [...elementPath],
            expression: t.cloneNode(derivedTemplateExpr, true) as t.Expression,
            setupStatements: setupStatements.map((statement) => t.cloneNode(statement, true) as t.Statement),
            ...(textNodeIndex !== undefined ? { textNodeIndex } : {}),
          })),
        )
        return
      }
    }

    const selector = generateSelector(elementPath)
    propBindings.push({
      propName,
      selector,
      type: 'text',
      elementPath: [...elementPath],
      ...(textNodeIndex !== undefined ? { textNodeIndex } : {}),
    })
    return
  }
  if (!expressionMayProduceJSX(expr)) {
    if (
      shouldBuildTextTemplate &&
      textTemplate &&
      textExpressions.length > 0 &&
      templateSetupContext &&
      !jsxInTextSiblingGroup
    ) {
      const derivedTemplateExpr = buildTextTemplateExpressionFromParts(textTemplate, textExpressions)
      const setupStatements = collectTemplateSetupStatements(derivedTemplateExpr, templateSetupContext)
      const dependentProps = collectDependentPropNames(
        derivedTemplateExpr,
        setupStatements,
        propsParamName,
        destructuredPropNames,
        classBody,
      )
      if (dependentProps.length > 0) {
        const selector = generateSelector(elementPath)
        propBindings.push(
          ...dependentProps.map((prop) => ({
            propName: prop,
            selector,
            type: 'text' as const,
            elementPath: [...elementPath],
            expression: t.cloneNode(derivedTemplateExpr, true) as t.Expression,
            setupStatements: setupStatements.map((statement) => t.cloneNode(statement, true) as t.Statement),
            ...(textNodeIndex !== undefined ? { textNodeIndex } : {}),
          })),
        )
        return
      }
    }
    const derived = buildDerivedPropBindings(
      expr,
      'text',
      undefined,
      elementPath,
      propsParamName,
      destructuredPropNames,
      templateSetupContext,
      classBody,
    )
    if (derived.length > 0) {
      if (textNodeIndex !== undefined) {
        for (const d of derived) d.textNodeIndex = textNodeIndex
      }
      propBindings.push(...derived)
      return
    }
  }
  if (templateSetupContext && expressionMayProduceJSX(expr) && rerenderPropNames) {
    if (t.isJSXEmptyExpression(expr)) return
    const conditionExpr = extractConditionalControlExpression(expr)
    if (conditionExpr) {
      const condSetupStatements = collectTemplateSetupStatements(conditionExpr, templateSetupContext)
      const fullSetupStatements = collectTemplateSetupStatements(expr, templateSetupContext)
      const allDeps = collectExpressionDependencies(conditionExpr, stateRefs, condSetupStatements)
      // Keep all dependencies (including store) for conditional slots.
      // Store-dependent conditionals like `store.open && <Modal/>` need reactive
      // tracking to insert/remove DOM sections when the condition changes.
      const dependencies = allDeps
      const conditionDependentProps = collectDependentPropNames(
        conditionExpr,
        condSetupStatements,
        propsParamName,
        destructuredPropNames,
        classBody,
      )
      const allDependentProps = collectDependentPropNames(
        expr,
        fullSetupStatements,
        propsParamName,
        destructuredPropNames,
        classBody,
      )
      const dependentProps = [...new Set([...conditionDependentProps, ...allDependentProps])]
      dependentProps.forEach((propName) => rerenderPropNames.add(propName))
      if (dependentProps.length > 0 || dependencies.length > 0) {
        rerenderConditions?.push({
          expression: t.cloneNode(conditionExpr, true),
          setupStatements: condSetupStatements.map((s) => t.cloneNode(s, true) as t.Statement),
        })
        if (conditionalSlots) {
          const slotId = `c${conditionalSlots.length}`
          conditionalSlots.push({
            slotId,
            conditionExpr: t.cloneNode(conditionExpr, true),
            setupStatements: condSetupStatements.map((s) => t.cloneNode(s, true) as t.Statement),
            htmlSetupStatements: fullSetupStatements.map((s) => t.cloneNode(s, true) as t.Statement),
            dependentPropNames: [...dependentProps],
            dependencies: dependencies.map((dep) => ({
              observeKey: dep.observeKey,
              pathParts: [...dep.pathParts],
              ...(dep.storeVar ? { storeVar: dep.storeVar } : {}),
            })),
            originalExpr: t.cloneNode(expr, true) as t.Expression,
          })
          conditionalSlotNodeMap?.set(expr, slotId)
        }
      }
    }
  }
  const result = resolveExpr(expr, stateRefs)
  if (!result?.parts?.length) {
    if (templateSetupContext && !t.isJSXEmptyExpression(expr) && !expressionMayProduceJSX(expr)) {
      const exprToUse =
        shouldBuildTextTemplate && textTemplate && !jsxInTextSiblingGroup
          ? buildTextTemplateExpressionFromParts(textTemplate, textExpressions)
          : expr
      const setupStatements = collectTemplateSetupStatements(exprToUse, templateSetupContext)
      const dependencies = collectExpressionDependencies(exprToUse, stateRefs, setupStatements)
      const stateDeps = dependencies.filter((d) => d.storeVar || (d.pathParts.length > 0 && d.pathParts[0] !== 'props'))
      if (stateDeps.length > 0) {
        const selector = generateSelector(elementPath)
        const isChildrenPropBinding = !t.isJSXEmptyExpression(expr) && callsJSXReturningProperty(expr as t.Expression, classBody)
        propBindings.push({
          propName: '__state__',
          selector,
          type: 'text',
          elementPath: [...elementPath],
          expression: t.cloneNode(exprToUse, true) as t.Expression,
          setupStatements: setupStatements.map((s) => t.cloneNode(s, true) as t.Statement),
          stateOnly: true,
          ...(textNodeIndex !== undefined ? { textNodeIndex } : {}),
          ...(isChildrenPropBinding ? { isChildrenProp: true } : {}),
        })
      }
    }
    return
  }
  const selector = generateSelector(elementPath)

  if (shouldBuildTextTemplate && textTemplate && textExpressions.length > 0 && !jsxInTextSiblingGroup) {
    if (isComputedArrayProp(result.parts, textExpressions, stateRefs)) {
      addArrayTextBindings(
        selector,
        tagName,
        elementPath,
        bindings,
        stateProps,
        stateRefs,
        textTemplate,
        textExpressions,
        result,
      )
      return
    }
  }

  const binding: ReactiveBinding = {
    pathParts: result.parts,
    type: 'text',
    selector: generateSelector(elementPath),
    elementPath: [...elementPath],
    ...(textNodeIndex !== undefined ? { textNodeIndex } : {}),
    ...(!t.isJSXEmptyExpression(expr) && callsJSXReturningProperty(expr as t.Expression, classBody) ? { isChildrenProp: true } : {}),
  }
  applyImportedState(binding, result, stateProps)
  if (shouldBuildTextTemplate && textTemplate && !jsxInTextSiblingGroup) {
    binding.textTemplate = textTemplate
    binding.textExpressionIndex = textExpressions.findIndex(
      (te) => pathPartsToString(te.pathParts) === pathPartsToString(result.parts),
    )
    binding.textExpressions = textExpressions
  }
  bindings.push(binding)
}

function textSiblingGroupContainsJSX(textExpressions: TextExpression[]): boolean {
  return textExpressions.some((te) => te.expression && expressionMayProduceJSX(te.expression))
}

export function expressionMayProduceJSX(expr: t.Expression | t.JSXEmptyExpression): boolean {
  if (t.isJSXEmptyExpression(expr)) return false
  if (t.isJSXElement(expr) || t.isJSXFragment(expr)) return true
  if (t.isLogicalExpression(expr)) {
    return expressionMayProduceJSX(expr.left as t.Expression) || expressionMayProduceJSX(expr.right as t.Expression)
  }
  if (t.isConditionalExpression(expr)) {
    return expressionMayProduceJSX(expr.consequent) || expressionMayProduceJSX(expr.alternate)
  }
  if (t.isParenthesizedExpression(expr)) {
    return expressionMayProduceJSX(expr.expression as t.Expression)
  }
  if (t.isCallExpression(expr)) {
    const callee = expr.callee
    if (t.isArrowFunctionExpression(callee) || t.isFunctionExpression(callee)) {
      if (t.isBlockStatement(callee.body)) {
        return callee.body.body.some(
          (s) => t.isReturnStatement(s) && !!s.argument && expressionMayProduceJSX(s.argument),
        )
      }
      return expressionMayProduceJSX(callee.body as t.Expression)
    }
  }
  return false
}

/**
 * Extract only the condition-controlling sub-expression from a JSX-producing
 * expression.  For `cond && <JSX/>` returns `cond`; for `cond ? <A/> : <B/>`
 * returns `cond`.  Props referenced only inside the JSX bodies are irrelevant
 * to whether the structure changes and must NOT trigger a full re-render.
 */
export function extractConditionalControlExpression(expr: t.Expression): t.Expression | null {
  if (t.isParenthesizedExpression(expr)) {
    return extractConditionalControlExpression(expr.expression as t.Expression)
  }
  if (t.isLogicalExpression(expr) && expr.operator === '&&') {
    if (expressionMayProduceJSX(expr.right as t.Expression)) return expr.left as t.Expression
    if (expressionMayProduceJSX(expr.left as t.Expression)) return expr.right as t.Expression
    return null
  }
  if (t.isLogicalExpression(expr) && expr.operator === '||') {
    return expr.left as t.Expression
  }
  if (t.isConditionalExpression(expr)) {
    return expr.test
  }
  return null
}

function expressionContainsComponentJSX(node: t.Node): boolean {
  if (t.isJSXElement(node)) {
    const name = node.openingElement.name
    if (t.isJSXIdentifier(name) && /^[A-Z]/.test(name.name)) return true
    if (t.isJSXMemberExpression(name)) {
      let cur: t.JSXIdentifier | t.JSXMemberExpression = name
      while (t.isJSXMemberExpression(cur)) cur = cur.object as t.JSXIdentifier | t.JSXMemberExpression
      if (t.isJSXIdentifier(cur) && /^[A-Z]/.test(cur.name)) return true
    }
    for (const c of node.children) {
      if (expressionContainsComponentJSX(c)) return true
    }
    return false
  }
  if (t.isJSXExpressionContainer(node) && !t.isJSXEmptyExpression(node.expression)) {
    return expressionContainsComponentJSX(node.expression)
  }
  if (t.isLogicalExpression(node)) {
    return expressionContainsComponentJSX(node.left) || expressionContainsComponentJSX(node.right)
  }
  if (t.isConditionalExpression(node)) {
    return expressionContainsComponentJSX(node.consequent) || expressionContainsComponentJSX(node.alternate)
  }
  if (t.isParenthesizedExpression(node)) {
    return expressionContainsComponentJSX(node.expression)
  }
  if (t.isJSXFragment(node)) {
    return node.children.some((c) => expressionContainsComponentJSX(c))
  }
  return false
}

export function registerNestedConditionalsInBranches(
  expr: t.Expression,
  stateRefs: Map<string, StateRefMeta>,
  templateSetupContext: { params: Array<t.Identifier | t.Pattern | t.RestElement>; statements: t.Statement[] },
  conditionalSlots: import('../ir').ConditionalSlot[],
  conditionalSlotNodeMap: Map<t.Node, string>,
  classBody?: t.ClassBody,
): void {
  function visitChildren(
    children: readonly (t.JSXText | t.JSXExpressionContainer | t.JSXSpreadChild | t.JSXElement | t.JSXFragment)[],
  ) {
    for (const child of children) {
      if (t.isJSXElement(child)) visitChildren(child.children)
      else if (t.isJSXFragment(child)) visitChildren(child.children)
      else if (t.isJSXExpressionContainer(child) && !t.isJSXEmptyExpression(child.expression)) {
        const innerExpr = child.expression as t.Expression
        if (!expressionMayProduceJSX(innerExpr)) continue
        const conditionExpr = extractConditionalControlExpression(innerExpr)
        if (!conditionExpr) continue
        const condSetupStatements = collectTemplateSetupStatements(conditionExpr, templateSetupContext)
        const fullSetupStatements = collectTemplateSetupStatements(innerExpr, templateSetupContext)
        const allDeps = collectExpressionDependencies(conditionExpr, stateRefs, condSetupStatements)
        if (allDeps.length === 0) continue
        const slotId = `c${conditionalSlots.length}`
        conditionalSlots.push({
          slotId,
          conditionExpr: t.cloneNode(conditionExpr, true) as t.Expression,
          setupStatements: condSetupStatements.map((s) => t.cloneNode(s, true) as t.Statement),
          htmlSetupStatements: fullSetupStatements.map((s) => t.cloneNode(s, true) as t.Statement),
          dependentPropNames: [],
          dependencies: allDeps.map((dep) => ({
            observeKey: dep.observeKey,
            pathParts: [...dep.pathParts],
            ...(dep.storeVar ? { storeVar: dep.storeVar } : {}),
          })),
          originalExpr: t.cloneNode(innerExpr, true) as t.Expression,
        })
        conditionalSlotNodeMap.set(innerExpr, slotId)
        registerNestedConditionalsInBranches(
          innerExpr,
          stateRefs,
          templateSetupContext,
          conditionalSlots,
          conditionalSlotNodeMap,
          classBody,
        )
      }
    }
  }

  function visitBranch(node: t.Expression) {
    if (t.isJSXElement(node)) visitChildren(node.children)
    else if (t.isJSXFragment(node)) visitChildren(node.children)
    else if (t.isParenthesizedExpression(node)) visitBranch(node.expression as t.Expression)
  }

  if (t.isConditionalExpression(expr)) {
    visitBranch(expr.consequent as t.Expression)
    visitBranch(expr.alternate as t.Expression)
  } else if (t.isLogicalExpression(expr) && expr.operator === '&&') {
    visitBranch(expr.right as t.Expression)
  }
}

function buildDerivedPropBindings(
  expr: t.Expression | t.JSXEmptyExpression,
  type: 'text' | 'class' | 'attribute' | 'value' | 'checked',
  attributeName: string | undefined,
  elementPath: string[],
  propsParamName?: string,
  destructuredPropNames?: Set<string>,
  templateSetupContext?: { params: Array<t.Identifier | t.Pattern | t.RestElement>; statements: t.Statement[] },
  classBody?: t.ClassBody,
): PropBinding[] {
  if (t.isJSXEmptyExpression(expr) || !templateSetupContext) return []
  const setupStatements = collectTemplateSetupStatements(expr, templateSetupContext)
  const dependentProps = collectDependentPropNames(
    expr,
    setupStatements,
    propsParamName,
    destructuredPropNames,
    classBody,
  )
  if (dependentProps.length === 0) return []
  const selector = generateSelector(elementPath)
  return dependentProps.map((propName) => ({
    propName,
    selector,
    type,
    attributeName,
    elementPath: [...elementPath],
    expression: t.cloneNode(expr, true) as t.Expression,
    setupStatements: setupStatements.map((statement) => t.cloneNode(statement, true) as t.Statement),
  }))
}

export function collectDependentPropNames(
  expr: t.Expression | t.JSXEmptyExpression,
  setupStatements: t.Statement[],
  propsParamName?: string,
  destructuredPropNames?: Set<string>,
  classBody?: t.ClassBody,
): string[] {
  const names = new Set<string>()
  const program = t.program([
    ...setupStatements.map((statement) => t.cloneNode(statement, true) as t.Statement),
    t.expressionStatement(t.cloneNode(expr, true) as t.Expression),
  ])
  const getterNamesToExpand = new Set<string>()
  traverse(program, {
    noScope: true,
    Identifier(path: NodePath<t.Identifier>) {
      if (!path.isReferencedIdentifier()) return
      if (destructuredPropNames?.has(path.node.name)) names.add(path.node.name)
    },
    MemberExpression(path: NodePath<t.MemberExpression>) {
      const propName = resolvePropRef(path.node, propsParamName, destructuredPropNames)
      if (propName) names.add(propName)
      if (classBody && t.isThisExpression(path.node.object) && t.isIdentifier(path.node.property)) {
        getterNamesToExpand.add(path.node.property.name)
      }
    },
  })
  if (classBody && getterNamesToExpand.size > 0) {
    for (const member of classBody.body) {
      if (
        !t.isClassMethod(member) ||
        member.kind !== 'get' ||
        !t.isIdentifier(member.key) ||
        !getterNamesToExpand.has(member.key.name)
      )
        continue
      const getterProgram = t.program(member.body.body.map((s) => t.cloneNode(s, true) as t.Statement))
      traverse(getterProgram, {
        noScope: true,
        Identifier(path: NodePath<t.Identifier>) {
          if (!path.isReferencedIdentifier()) return
          if (destructuredPropNames?.has(path.node.name)) names.add(path.node.name)
        },
        MemberExpression(path: NodePath<t.MemberExpression>) {
          if (t.isThisExpression(path.node.object) && t.isIdentifier(path.node.property)) {
            if (path.node.property.name === 'props' && t.isMemberExpression(path.parentPath?.node)) {
              const parent = path.parentPath.node as t.MemberExpression
              if (t.isIdentifier(parent.property)) names.add(parent.property.name)
            }
          }
          const propName = resolvePropRef(path.node, propsParamName, destructuredPropNames)
          if (propName) names.add(propName)
        },
      })
    }
  }
  return Array.from(names)
}

// ---------------------------------------------------------------------------
// Map-item analysis (merged from map-analyzer.ts)
// ---------------------------------------------------------------------------

function getItemMemberPath(expr: t.Expression, itemVar: string): string | null {
  const parts: string[] = []
  let current: t.Expression = expr
  while (t.isMemberExpression(current) && !current.computed && t.isIdentifier(current.property)) {
    parts.unshift(current.property.name)
    current = current.object
  }
  if (!t.isIdentifier(current) || current.name !== itemVar || parts.length === 0) return null
  return parts.join('.')
}

function analyzeJSXInMap(
  node: t.JSXElement,
  arrayPath: PathParts,
  itemVar: string,
  itemBindings: ReactiveBinding[],
  relationalBindings: RelationalMapBinding[],
  conditionalBindings: ConditionalMapBinding[],
  elementPath: string[],
  isImportedState: boolean,
  itemIdProperty: string,
  stateRefs: Map<string, StateRefMeta>,
  childIndices: number[] = [],
  storeVar?: string,
): void {
  const context = { inMap: true, mapItemVar: itemVar }

  node.openingElement.attributes.forEach((attr) => {
    if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name)) return
    const attrName = attr.name.name
    if (!attr.value || !t.isJSXExpressionContainer(attr.value)) return
    const expr = attr.value.expression

    if (t.isMemberExpression(expr)) {
      analyzeItemMemberExpr(
        expr,
        attrName,
        arrayPath,
        itemVar,
        itemBindings,
        elementPath,
        isImportedState,
        itemIdProperty,
        node,
        stateRefs,
        context,
        childIndices,
      )
    } else if (t.isConditionalExpression(expr)) {
      const isClassAttr = attrName === 'class' || attrName === 'className'
      analyzeItemConditional(
        expr,
        attrName,
        arrayPath,
        itemVar,
        itemBindings,
        relationalBindings,
        conditionalBindings,
        elementPath,
        isImportedState,
        itemIdProperty,
        node,
        stateRefs,
        childIndices,
        storeVar,
        isClassAttr,
      )
    } else if (t.isTemplateLiteral(expr)) {
      analyzeItemTemplateLiteral(
        expr,
        arrayPath,
        itemVar,
        itemBindings,
        relationalBindings,
        conditionalBindings,
        elementPath,
        isImportedState,
        itemIdProperty,
        node,
        stateRefs,
        childIndices,
        storeVar,
      )
    }
  })

  node.children.forEach((child) => {
    if (t.isJSXExpressionContainer(child) && !t.isJSXEmptyExpression(child.expression)) {
      if (t.isMemberExpression(child.expression)) {
        const propPathResult = resolvePath(child.expression, stateRefs, context)
        if (propPathResult?.parts?.length === 1 && propPathResult.parts[0] !== 'id') {
          const wildcardPath = [...arrayPath, '*', propPathResult.parts[0]]
          const binding: ReactiveBinding = {
            pathParts: wildcardPath,
            type: 'text',
            selector: generateSelector(elementPath),
            elementPath: [...elementPath],
            childPath: [...childIndices],
            ...(isImportedState ? { isImportedState: true } : {}),
          }
          itemBindings.push(binding)
        }
      } else if (t.isConditionalExpression(child.expression)) {
        collectConditionalBindings(
          child.expression,
          'text',
          undefined,
          conditionalBindings,
          arrayPath,
          itemVar,
          elementPath,
          childIndices,
          stateRefs,
          storeVar,
        )
      }
    }
  })

  getDirectChildElements(node.children).forEach((child, idx) => {
    analyzeJSXInMap(
      child.node,
      arrayPath,
      itemVar,
      itemBindings,
      relationalBindings,
      conditionalBindings,
      [...elementPath, child.selectorSegment],
      isImportedState,
      itemIdProperty,
      stateRefs,
      [...childIndices, idx],
      storeVar,
    )
  })
}

function analyzeItemMemberExpr(
  expr: t.MemberExpression,
  attrName: string,
  arrayPath: PathParts,
  itemVar: string,
  itemBindings: ReactiveBinding[],
  elementPath: string[],
  isImportedState: boolean,
  itemIdProperty: string,
  node: t.JSXElement,
  stateRefs: Map<string, StateRefMeta>,
  context: { inMap: boolean; mapItemVar: string },
  childIndices: number[] = [],
) {
  const result = resolvePath(expr, stateRefs, context)
  if (!result?.parts || result.parts.length !== 1 || result.parts[0] === 'id') return
  const wildcardPath = [...arrayPath, '*', result.parts[0]]
  const binding: ReactiveBinding = {
    pathParts: wildcardPath,
    type: attrName === 'checked' ? 'checked' : attrName === 'value' ? 'value' : 'class',
    selector: generateSelector(elementPath),
    attributeName: attrName,
    elementPath: [...elementPath],
    childPath: [...childIndices],
    itemIdProperty,
    ...(isImportedState ? { isImportedState: true } : {}),
  }
  itemBindings.push(binding)
}

function analyzeItemConditional(
  expr: t.ConditionalExpression,
  attrName: string,
  arrayPath: PathParts,
  itemVar: string,
  itemBindings: ReactiveBinding[],
  relationalBindings: RelationalMapBinding[],
  conditionalBindings: ConditionalMapBinding[],
  elementPath: string[],
  isImportedState: boolean,
  itemIdProperty: string,
  node: t.JSXElement,
  stateRefs: Map<string, StateRefMeta>,
  childIndices: number[] = [],
  storeVar?: string,
  isFullClassExpr?: boolean,
) {
  const relationalBinding = buildRelationalClassBinding(expr, elementPath, itemVar, itemIdProperty, stateRefs)
  if (relationalBinding) {
    if (isFullClassExpr) relationalBinding.scopeClassIsPure = true
    relationalBindings.push(relationalBinding)
    return
  }

  const isClassAttribute = attrName === 'class' || attrName === 'className'

  if (
    isClassAttribute &&
    t.isMemberExpression(expr.test) &&
    t.isIdentifier(expr.test.object) &&
    expr.test.object.name === itemVar
  ) {
    const propName = t.isIdentifier(expr.test.property) ? expr.test.property.name : null
    if (!propName) return

    const detectedClassName = extractClassName(expr.consequent) || extractClassName(expr.alternate)
    const wildcardPath = [...arrayPath, '*', propName]
    const binding: ReactiveBinding = {
      pathParts: wildcardPath,
      type: 'class',
      selector: generateSelector(elementPath),
      attributeName: 'class',
      elementPath: [...elementPath],
      childPath: [...childIndices],
      classToggleName: detectedClassName,
      itemIdProperty,
      ...(isImportedState ? { isImportedState: true } : {}),
    }
    itemBindings.push(binding)
    return
  }

  if (
    isClassAttribute &&
    t.isBinaryExpression(expr.test) &&
    (expr.test.operator === '===' || expr.test.operator === '==')
  ) {
    const detectedClassName = extractClassName(expr.consequent) || extractClassName(expr.alternate)
    if (!detectedClassName) return

    const binding: ReactiveBinding = {
      pathParts: [...arrayPath, '*', 'class'],
      type: 'class',
      selector: generateSelector(elementPath),
      attributeName: 'class',
      elementPath: [...elementPath],
      childPath: [...childIndices],
      classToggleName: detectedClassName,
      itemIdProperty,
      ...(isImportedState ? { isImportedState: true } : {}),
    }
    itemBindings.push(binding)
    return
  }

  collectConditionalBindings(
    expr,
    attrName === 'class' || attrName === 'className' ? 'className' : 'attribute',
    attrName,
    conditionalBindings,
    arrayPath,
    itemVar,
    elementPath,
    childIndices,
    stateRefs,
    storeVar,
  )
}

function analyzeItemTemplateLiteral(
  expr: t.TemplateLiteral,
  arrayPath: PathParts,
  itemVar: string,
  itemBindings: ReactiveBinding[],
  relationalBindings: RelationalMapBinding[],
  conditionalBindings: ConditionalMapBinding[],
  elementPath: string[],
  isImportedState: boolean,
  itemIdProperty: string,
  node: t.JSXElement,
  stateRefs: Map<string, StateRefMeta>,
  childIndices: number[] = [],
  storeVar?: string,
) {
  expr.expressions.forEach((innerExpr) => {
    if (!t.isConditionalExpression(innerExpr)) return
    analyzeItemConditional(
      innerExpr,
      'class',
      arrayPath,
      itemVar,
      itemBindings,
      relationalBindings,
      conditionalBindings,
      elementPath,
      isImportedState,
      itemIdProperty,
      node,
      stateRefs,
      childIndices,
      storeVar,
    )
  })
}

function collectConditionalBindings(
  expr: t.ConditionalExpression,
  type: 'text' | 'className' | 'attribute',
  attributeName: string | undefined,
  conditionalBindings: ConditionalMapBinding[],
  arrayPath: PathParts,
  itemVar: string,
  elementPath: string[],
  childPath: number[],
  stateRefs: Map<string, StateRefMeta>,
  storeVar?: string,
) {
  const dependencies = new Map<string, ObserveDependency>()
  const requiresRerender = conditionalExpressionRequiresRerender(expr)
  const program = t.program([t.expressionStatement(t.cloneNode(expr, true))])
  traverse(program, {
    noScope: true,
    MemberExpression(path: NodePath<t.MemberExpression>) {
      const parent = path.parentPath
      if (parent && t.isMemberExpression(parent.node) && parent.node.object === path.node) return

      if (t.isIdentifier(path.node.object) && path.node.object.name === itemVar && t.isIdentifier(path.node.property)) {
        const pathParts = [...arrayPath]
        const observeKey = buildObserveKey(pathParts, storeVar)
        if (!dependencies.has(observeKey)) {
          dependencies.set(observeKey, {
            observeKey,
            pathParts,
            ...(storeVar ? { storeVar } : {}),
          })
        }
        return
      }

      const resolved = resolvePath(path.node, stateRefs)
      if (!resolved?.parts?.length) return
      const observeKey = buildObserveKey(resolved.parts, resolved.isImportedState ? resolved.storeVar : undefined)
      if (!dependencies.has(observeKey)) {
        dependencies.set(observeKey, {
          observeKey,
          pathParts: resolved.parts,
          storeVar: resolved.isImportedState ? resolved.storeVar : undefined,
        })
      }
    },
  })

  dependencies.forEach((observe) => {
    conditionalBindings.push({
      observe,
      type,
      childPath: [...childPath],
      selector: generateSelector(elementPath),
      attributeName,
      expression: t.cloneNode(expr, true),
      requiresRerender,
    })
  })
}

function conditionalExpressionRequiresRerender(expr: t.ConditionalExpression): boolean {
  let needsRerender = false
  const program = t.program([t.expressionStatement(t.cloneNode(expr, true))])
  traverse(program, {
    noScope: true,
    JSXElement(path: NodePath<t.JSXElement>) {
      needsRerender = true
      path.stop()
    },
    JSXFragment(path: NodePath<t.JSXFragment>) {
      needsRerender = true
      path.stop()
    },
  })
  return needsRerender
}

function buildRelationalClassBinding(
  expr: t.ConditionalExpression,
  elementPath: string[],
  itemVar: string,
  itemIdProperty: string,
  stateRefs: Map<string, StateRefMeta>,
): RelationalMapBinding | null {
  const predicate = resolveExternalIdentityPredicate(expr.test, itemVar, itemIdProperty, stateRefs)
  if (!predicate) return null

  const consequentClass = extractClassName(expr.consequent)
  const alternateClass = extractClassName(expr.alternate)
  const consequentEmpty = isEmptyBranch(expr.consequent)
  const alternateEmpty = isEmptyBranch(expr.alternate)

  if (consequentClass && alternateEmpty) {
    return {
      observePathParts: predicate.observePathParts,
      storeVar: predicate.storeVar,
      selector: generateSelector(elementPath),
      type: 'class',
      itemIdProperty,
      classToggleName: consequentClass,
      classWhenMatch: predicate.matchWhenTrue,
    }
  }

  if (alternateClass && consequentEmpty) {
    return {
      observePathParts: predicate.observePathParts,
      storeVar: predicate.storeVar,
      selector: generateSelector(elementPath),
      type: 'class',
      itemIdProperty,
      classToggleName: alternateClass,
      classWhenMatch: !predicate.matchWhenTrue,
    }
  }

  return null
}

function resolveExternalIdentityPredicate(
  test: t.Expression,
  itemVar: string,
  itemIdProperty: string,
  stateRefs: Map<string, StateRefMeta>,
): { observePathParts: PathParts; storeVar?: string; matchWhenTrue: boolean } | null {
  if (!t.isBinaryExpression(test)) return null
  if (!['===', '==', '!==', '!='].includes(test.operator)) return null

  const left = resolveSide(test.left as t.Expression, itemVar, itemIdProperty, stateRefs)
  const right = resolveSide(test.right as t.Expression, itemVar, itemIdProperty, stateRefs)
  if (!left || !right) return null

  const external = left.kind === 'external' ? left : right.kind === 'external' ? right : null
  const item = left.kind === 'item-id' ? left : right.kind === 'item-id' ? right : null
  if (!external || !item) return null

  return {
    observePathParts: external.observePathParts,
    storeVar: external.storeVar,
    matchWhenTrue: test.operator === '===' || test.operator === '==',
  }
}

function resolveSide(
  expr: t.Expression,
  itemVar: string,
  itemIdProperty: string,
  stateRefs: Map<string, StateRefMeta>,
): { kind: 'external'; observePathParts: PathParts; storeVar?: string } | { kind: 'item-id' } | null {
  if (itemIdProperty === ITEM_IS_KEY && t.isIdentifier(expr) && expr.name === itemVar) {
    return { kind: 'item-id' }
  }
  if (getItemMemberPath(expr, itemVar) === itemIdProperty) {
    return { kind: 'item-id' }
  }

  if (!t.isMemberExpression(expr) && !t.isIdentifier(expr)) return null
  const resolved = resolvePath(expr as t.MemberExpression | t.Identifier, stateRefs)
  if (!resolved?.parts) return null
  if (resolved.parts[0] === itemVar) return null

  return {
    kind: 'external',
    observePathParts: resolved.parts,
    storeVar: resolved.storeVar,
  }
}

function isEmptyBranch(node: t.Expression): boolean {
  return (
    (t.isStringLiteral(node) && node.value.trim() === '') ||
    (t.isTemplateLiteral(node) && node.expressions.length === 0 && node.quasis.every((q) => q.value.raw.trim() === ''))
  )
}

function extractClassName(node: t.Expression): string | undefined {
  if (t.isStringLiteral(node)) {
    const cls = node.value.trim()
    return cls ? cls.split(' ')[0] : undefined
  }
  if (t.isTemplateLiteral(node)) {
    const raw = node.quasis[0]?.value.raw.trim()
    return raw ? raw.split(' ')[0] : undefined
  }
  return undefined
}
