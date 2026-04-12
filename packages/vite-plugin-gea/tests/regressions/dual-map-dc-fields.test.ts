/**
 * Two `.map()` blocks in one component must produce distinct `keyedList` calls
 * with separate anchors; the key expression must mirror the JSX key attribute.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { geaPlugin } from '../../src/index.ts'

const TWO_MAPS_SOURCE = `
import { Component } from '@geajs/core'

export default function Tabs({ tabs, activeTabIndex, onTabChange }: {
  tabs: { index: number; title: string; content: () => unknown }[]
  activeTabIndex: number
  onTabChange: (i: number) => void
}) {
  return (
    <div>
      <div class="tab-titles">
        {tabs.map((tab) => (
          <button key={tab.title + '-b'} click={() => onTabChange(tab.index)}>{tab.title}</button>
        ))}
      </div>
      <div class="tab-contents">
        {tabs.map((tab) => (
          <div key={tab.index + '-c'}>{String(tab.index)}</div>
        ))}
      </div>
    </div>
  )
}
`

test('delegated map click uses keyExpression from JSX key attribute', async () => {
  const plugin = geaPlugin()
  const src = `
import { Component } from '@geajs/core'
export default function Tabs({ tabs, activeTabIndex, onTabChange }: {
  tabs: { index: number; title: string }[]
  activeTabIndex: number
  onTabChange: (i: number) => void
}) {
  return (
    <div>
      <div class="tab-titles">
        {tabs.map((tab) => (
          <button key={\`\${tab.title}-button\`} click={() => onTabChange(tab.index)}>{tab.title}</button>
        ))}
      </div>
    </div>
  )
}
`
  const transform = typeof plugin.transform === 'function' ? plugin.transform : plugin.transform!.handler
  const r = await transform!.call({} as never, src, '/virtual/tabs.tsx')
  const code = typeof r === 'string' ? r : r?.code
  assert.ok(code)

  // v2 compiler uses keyedList with the key expression as a function argument
  assert.ok(code!.includes('keyedList'), 'compiled output must use keyedList for .map()')

  // The key function must include the user-provided key expression (title + suffix)
  assert.ok(
    code!.includes('tab.title') && code!.includes('-button'),
    'key function must mirror JSX key expression (title + suffix)',
  )
})

test('two sibling .map() blocks get distinct keyedList calls with separate anchors', async () => {
  const plugin = geaPlugin()
  const transform2 = typeof plugin.transform === 'function' ? plugin.transform : plugin.transform!.handler
  const r = await transform2!.call({} as never, TWO_MAPS_SOURCE, '/virtual/tabs.tsx')
  const code = typeof r === 'string' ? r : r?.code
  assert.ok(code)

  // Count keyedList calls — should have exactly 2 for two .map() blocks
  const keyedListCalls = (code!.match(/keyedList\(/g) || []).length
  assert.equal(keyedListCalls, 2, `expected exactly 2 keyedList calls, got ${keyedListCalls}`)

  // Each keyedList should use a distinct anchor comment node
  const anchorMatches = code!.match(/__anchor\d+/g) || []
  const uniqueAnchors = [...new Set(anchorMatches)]
  assert.ok(
    uniqueAnchors.length >= 2,
    `expected at least 2 distinct anchor variables, got: ${uniqueAnchors.join(', ')}`,
  )

  // Verify that the key expressions are different for each map
  assert.ok(code!.includes("tab.title"), 'first map key should reference tab.title')
  assert.ok(code!.includes("tab.index"), 'second map key should reference tab.index')
})
