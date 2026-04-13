import type { Expression, Statement } from '@babel/types'
import { t } from '../../utils/babel-interop.ts'

const SVG_TEMPLATE_ROOT_TAGS = new Set([
  'svg',
  'animate',
  'animatemotion',
  'animatetransform',
  'circle',
  'clippath',
  'defs',
  'ellipse',
  'feblend',
  'fecolormatrix',
  'fecomponenttransfer',
  'fecomposite',
  'feconvolvematrix',
  'fediffuselighting',
  'fedisplacementmap',
  'fedistantlight',
  'fedropshadow',
  'feflood',
  'fefunca',
  'fefuncb',
  'fefuncg',
  'fefuncr',
  'fegaussianblur',
  'feimage',
  'femerge',
  'femergenode',
  'femorphology',
  'feoffset',
  'fepointlight',
  'fespecularlighting',
  'fespotlight',
  'fetile',
  'feturbulence',
  'filter',
  'foreignobject',
  'g',
  'image',
  'line',
  'lineargradient',
  'marker',
  'mask',
  'metadata',
  'mpath',
  'path',
  'pattern',
  'polygon',
  'polyline',
  'radialgradient',
  'rect',
  'set',
  'stop',
  'symbol',
  'text',
  'textpath',
  'tspan',
  'use',
])

function isSvgTemplateHtml(html: string): boolean {
  const match = /^<([A-Za-z][\w:-]*)[\s/>]/.exec(html.trimStart())
  return !!match && SVG_TEMPLATE_ROOT_TAGS.has(match[1].toLowerCase())
}

function parseTinyTextElementHtml(html: string): { tag: string; text: string } | null {
  const match = /^<([a-z][\w:-]*)>([^<&]*)$/.exec(html)
  if (!match) return null
  return { tag: match[1], text: match[2] }
}

/**
 * Emit the module-top lazy template root cache:
 *   let _tpl<N>_root = null
 *   function _tpl<N>_create() {
 *     const t = document.createElement('template')
 *     t.innerHTML = '<...>'
 *     return t.content.firstChild
 *   }
 */
export function emitTemplateDecl(html: string, tplName: string): Statement[] {
  const tiny = parseTinyTextElementHtml(html)
  if (tiny) {
    const el = t.identifier('e')
    const body: Statement[] = [
      t.variableDeclaration('const', [
        t.variableDeclarator(
          el,
          t.callExpression(t.memberExpression(t.identifier('document'), t.identifier('createElement')), [
            t.stringLiteral(tiny.tag),
          ]),
        ),
      ]),
    ]
    if (tiny.text) {
      body.push(
        t.expressionStatement(
          t.assignmentExpression('=', t.memberExpression(el, t.identifier('textContent')), t.stringLiteral(tiny.text)),
        ),
      )
    }
    body.push(t.returnStatement(el))
    return [t.functionDeclaration(t.identifier(tplName + '_create'), [], t.blockStatement(body))]
  }

  const rootName = tplName + '_root'
  const createName = tplName + '_create'
  const tl = t.identifier('t')
  const statements: Statement[] = [
    t.variableDeclaration('const', [
      t.variableDeclarator(
        tl,
        t.callExpression(t.memberExpression(t.identifier('document'), t.identifier('createElement')), [
          t.stringLiteral('template'),
        ]),
      ),
    ]),
  ]
  if (isSvgTemplateHtml(html)) {
    const svg = t.identifier('s')
    statements.push(
      t.variableDeclaration('const', [
        t.variableDeclarator(
          svg,
          t.callExpression(t.memberExpression(t.identifier('document'), t.identifier('createElementNS')), [
            t.stringLiteral('http://www.w3.org/2000/svg'),
            t.stringLiteral('svg'),
          ]),
        ),
      ]),
      t.expressionStatement(
        t.assignmentExpression('=', t.memberExpression(svg, t.identifier('innerHTML')), t.stringLiteral(html)),
      ),
      t.whileStatement(
        t.memberExpression(svg, t.identifier('firstChild')),
        t.blockStatement([
          t.expressionStatement(
            t.callExpression(
              t.memberExpression(t.memberExpression(tl, t.identifier('content')), t.identifier('appendChild')),
              [t.memberExpression(svg, t.identifier('firstChild'))],
            ),
          ),
        ]),
      ),
    )
  } else {
    statements.push(
      t.expressionStatement(
        t.assignmentExpression('=', t.memberExpression(tl, t.identifier('innerHTML')), t.stringLiteral(html)),
      ),
    )
  }
  statements.push(
    t.returnStatement(t.memberExpression(t.memberExpression(tl, t.identifier('content')), t.identifier('firstChild'))),
  )
  return [
    t.variableDeclaration('let', [t.variableDeclarator(t.identifier(rootName), t.nullLiteral())]),
    t.functionDeclaration(t.identifier(createName), [], t.blockStatement(statements)),
  ]
}

export function emitTemplateCloneExpression(tplName: string, html?: string): Expression {
  if (html && parseTinyTextElementHtml(html)) return t.callExpression(t.identifier(tplName + '_create'), [])

  const rootId = t.identifier(tplName + '_root')
  const lazyRoot = t.logicalExpression(
    '||',
    rootId,
    t.assignmentExpression('=', t.cloneNode(rootId), t.callExpression(t.identifier(tplName + '_create'), [])),
  )
  return t.callExpression(t.memberExpression(lazyRoot, t.identifier('cloneNode')), [t.booleanLiteral(true)])
}
