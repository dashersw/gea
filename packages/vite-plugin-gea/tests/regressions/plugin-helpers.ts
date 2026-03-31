import assert from 'node:assert/strict'
import babelGenerator from '@babel/generator'
import * as t from '@babel/types'
import {
  GEA_APPLY_LIST_CHANGES,
  GEA_DOM_ITEM,
  GEA_DOM_KEY,
  GEA_DOM_PROPS,
  GEA_ENSURE_ARRAY_CONFIGS,
  GEA_MAP_CONFIG_TPL,
} from '@geajs/core'
import { JSDOM } from 'jsdom'
import { generateArrayHandlers, generateEnsureArrayConfigsMethod } from '../../src/codegen/gen-array.ts'
export { generateObserveHandler } from '../../src/codegen/gen-observe-helpers.ts'
import type { ArrayMapBinding } from '../../src/ir/types.ts'
import { geaPlugin } from '../../src/index'
import { parseSource } from '../../src/parse/parser.ts'
import type { StateRefMeta } from '../../src/parse/state-refs.ts'
import { transformComponentFile } from '../../src/codegen/generator.ts'
import { generatePatchItemMethod, generateCreateItemMethod } from '../../src/codegen/gen-array-patch.ts'
import { getObserveMethodName } from '../../src/codegen/member-chain.ts'
import { getJSXTagName } from '../../src/codegen/jsx-utils.ts'
import { applyListChanges } from '../../../gea/src/lib/base/list'

/** Injected into `new Function` eval so generated harness code can use `this[GEA_*]()` / `el[GEA_DOM_KEY]`. */
const HARNESS_GEA_SYMBOLS = {
  GEA_APPLY_LIST_CHANGES,
  GEA_DOM_ITEM,
  GEA_DOM_KEY,
  GEA_DOM_PROPS,
  GEA_ENSURE_ARRAY_CONFIGS,
  GEA_MAP_CONFIG_TPL,
} as const

const HARNESS_GEA_PRELUDE = `const { ${Object.keys(HARNESS_GEA_SYMBOLS).join(', ')} } = geaSyms;`

export { t, getJSXTagName, getObserveMethodName, parseSource, geaPlugin, transformComponentFile }
export type { ArrayMapBinding, StateRefMeta }

export const generate = 'default' in babelGenerator ? babelGenerator.default : babelGenerator

export function withDom<T>(run: (dom: JSDOM) => T): T {
  const dom = new JSDOM('<!doctype html><html><body></body></html>')
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    Node: globalThis.Node,
    NodeFilter: globalThis.NodeFilter,
    Event: globalThis.Event,
    CustomEvent: globalThis.CustomEvent,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
  }

  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    NodeFilter: dom.window.NodeFilter,
    Event: dom.window.Event,
    CustomEvent: dom.window.CustomEvent,
    requestAnimationFrame: (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0),
    cancelAnimationFrame: (id: number) => clearTimeout(id),
  })

  try {
    return run(dom)
  } finally {
    Object.assign(globalThis, previous)
    dom.window.close()
  }
}

export function createArrayObserverHarness(arrayMap: ArrayMapBinding) {
  const arrayPath = arrayMap.arrayPathParts.join('.')
  const methodName = `render${arrayPath.charAt(0).toUpperCase() + arrayPath.slice(1)}Item`
  const observeMethodName = getObserveMethodName(arrayMap.arrayPathParts, arrayMap.storeVar)
  const handlersResult = generateArrayHandlers(arrayMap, observeMethodName)
  const { methods } = handlersResult
  const capName = arrayPath.charAt(0).toUpperCase() + arrayPath.slice(1).replace(/\./g, '')
  const patchName = `patch${capName}Item`
  const createName = `create${capName}Item`
  const extraMethods: t.ClassMethod[] = []
  const allPrivateFields = new Set<string>(handlersResult.privateFields)
  const patchResult = generatePatchItemMethod(arrayMap)
  for (const f of patchResult.privateFields) allPrivateFields.add(f)
  if (patchResult.method) {
    extraMethods.push(patchResult.method)
  } else {
    extraMethods.push(
      t.classMethod(
        'method',
        t.identifier(patchName),
        [t.identifier('el'), t.identifier('item')],
        t.blockStatement([
          t.expressionStatement(
            t.assignmentExpression(
              '=',
              t.memberExpression(t.identifier('el'), t.identifier('GEA_DOM_ITEM'), true),
              t.identifier('item'),
            ),
          ),
          t.expressionStatement(
            t.assignmentExpression(
              '=',
              t.memberExpression(t.identifier('el'), t.identifier('textContent')),
              t.memberExpression(t.identifier('item'), t.identifier('label')),
            ),
          ),
        ]),
      ),
    )
  }
  const createResult = generateCreateItemMethod(arrayMap)
  for (const f of createResult.privateFields) allPrivateFields.add(f)
  if (createResult.method) {
    extraMethods.push(createResult.method)
  } else {
    extraMethods.push(
      t.classMethod(
        'method',
        t.identifier(createName),
        [t.identifier('item')],
        t.blockStatement([
          t.variableDeclaration('var', [
            t.variableDeclarator(
              t.identifier('__tw'),
              t.callExpression(
                t.memberExpression(
                  t.memberExpression(t.thisExpression(), t.identifier(`__${arrayPath.replace(/\./g, '_')}_container`)),
                  t.identifier('cloneNode'),
                ),
                [t.booleanLiteral(false)],
              ),
            ),
          ]),
          t.expressionStatement(
            t.assignmentExpression(
              '=',
              t.memberExpression(t.identifier('__tw'), t.identifier('innerHTML')),
              t.callExpression(t.memberExpression(t.thisExpression(), t.identifier(methodName)), [
                t.identifier('item'),
              ]),
            ),
          ),
          t.variableDeclaration('var', [
            t.variableDeclarator(
              t.identifier('el'),
              t.memberExpression(t.identifier('__tw'), t.identifier('firstElementChild')),
            ),
          ]),
          t.returnStatement(t.identifier('el')),
        ]),
      ),
    )
  }
  const privateFieldDecls = [...allPrivateFields].map((name) =>
    t.classPrivateProperty(t.privateName(t.identifier(name))),
  )
  const classAst = t.program([
    t.classDeclaration(
      t.identifier('Harness'),
      null,
      t.classBody([
        ...privateFieldDecls,
        t.classMethod(
          'method',
          t.identifier('__applyListChanges'),
          [t.identifier('container'), t.identifier('array'), t.identifier('changes'), t.identifier('config')],
          t.blockStatement([
            t.returnStatement(
              t.callExpression(t.identifier('applyListChanges'), [
                t.identifier('container'),
                t.identifier('array'),
                t.identifier('changes'),
                t.identifier('config'),
              ]),
            ),
          ]),
        ),
        t.classMethod(
          'method',
          t.identifier('GEA_APPLY_LIST_CHANGES'),
          [t.identifier('container'), t.identifier('array'), t.identifier('changes'), t.identifier('config')],
          t.blockStatement([
            t.returnStatement(
              t.callExpression(t.identifier('applyListChanges'), [
                t.identifier('container'),
                t.identifier('array'),
                t.identifier('changes'),
                t.identifier('config'),
              ]),
            ),
          ]),
          true,
        ),
        t.classMethod(
          'method',
          t.identifier('$'),
          [t.identifier('selector')],
          t.blockStatement([
            t.returnStatement(
              t.conditionalExpression(
                t.logicalExpression(
                  '||',
                  t.binaryExpression('===', t.identifier('selector'), t.stringLiteral(':scope')),
                  t.binaryExpression('==', t.identifier('selector'), t.nullLiteral()),
                ),
                t.memberExpression(t.thisExpression(), t.identifier('root')),
                t.callExpression(
                  t.memberExpression(
                    t.memberExpression(t.thisExpression(), t.identifier('root')),
                    t.identifier('querySelector'),
                  ),
                  [t.identifier('selector')],
                ),
              ),
            ),
          ]),
        ),
        t.classMethod(
          'method',
          t.identifier(methodName),
          [t.identifier('item')],
          t.blockStatement([
            t.returnStatement(
              t.templateLiteral(
                [
                  t.templateElement({
                    raw: '<li data-gea-item-id="',
                    cooked: '<li data-gea-item-id="',
                  }),
                  t.templateElement({ raw: '">', cooked: '">' }),
                  t.templateElement({ raw: '</li>', cooked: '</li>' }, true),
                ],
                [
                  t.memberExpression(t.identifier('item'), t.identifier(arrayMap.itemIdProperty || 'id')),
                  t.memberExpression(t.identifier('item'), t.identifier('label')),
                ],
              ),
            ),
          ]),
        ),
        ...extraMethods,
        ...(generateEnsureArrayConfigsMethod([arrayMap]) ? [generateEnsureArrayConfigsMethod([arrayMap])!] : []),
        ...methods,
      ]),
    ),
  ])

  const source = generate(classAst).code
  const Harness = new Function('applyListChanges', 'geaSyms', `${HARNESS_GEA_PRELUDE}\n${source}; return Harness;`)(
    applyListChanges,
    HARNESS_GEA_SYMBOLS,
  ) as new () => {
    root: HTMLElement
  } & Record<string, any>

  return new Harness()
}

export function renderInitialList(
  harness: ReturnType<typeof createArrayObserverHarness>,
  items: Array<{ [key: string]: unknown }>,
) {
  harness.root = document.createElement('ul')
  harness[getObserveMethodName('todos')](items, [
    {
      type: 'update',
      pathParts: ['todos'],
      newValue: items,
    },
  ])
}

export function transformComponentSource(source: string, knownComponentImports?: Set<string>): string {
  const parsed = parseSource(source)
  assert.ok(parsed)
  assert.ok(parsed.componentClassName)

  const original = parseSource(source)
  assert.ok(original)
  const storeImports = new Map<string, string>()

  parsed.imports.forEach((importSource, localName) => {
    if (parsed.importKinds.get(localName) !== 'default') return
    if (!/store/i.test(importSource)) return
    storeImports.set(localName, importSource)
  })

  const transformed = transformComponentFile(
    parsed.ast,
    parsed.imports,
    storeImports,
    parsed.componentClassName,
    '/virtual/test-component.jsx',
    original.ast,
    new Set(),
    knownComponentImports,
  )

  assert.equal(transformed, true)
  return generate(parsed.ast).code
}

export async function transformWithPlugin(source: string, id: string): Promise<string | null> {
  const plugin = geaPlugin()
  const transform = typeof plugin.transform === 'function' ? plugin.transform : plugin.transform?.handler
  const result = await transform?.call({} as never, source, id)
  if (!result) return null
  return typeof result === 'string' ? result : result.code
}

export function createObserveHarness(methodSource: string, setupSource = '', scopeVars: Record<string, any> = {}) {
  const source = `
    class Harness {
      constructor() {
        ${setupSource}
      }
      $(selector) {
        return this.root.querySelector(selector)
      }
      ${methodSource}
    }
    return Harness;
  `
  const paramNames = Object.keys(scopeVars)
  const paramValues = Object.values(scopeVars)
  const Harness = new Function(...paramNames, source)(...paramValues) as new () => {
    root: HTMLElement
    props?: Record<string, unknown>
  } & Record<string, any>
  return new Harness()
}
