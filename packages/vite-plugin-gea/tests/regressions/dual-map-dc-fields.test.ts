/**
 * Two `.map()` blocks in one component must not share the same `#__dc` template-cache field;
 * that caused the second map to bind to the first map's container and wipe tab contents on update.
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

test('delegated map click uses keyExpression for item lookup (not default id)', async () => {
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
  const helper = code!.slice(code!.indexOf('__getMapItemFromEvent'), code!.indexOf('__getMapItemFromEvent') + 900)
  assert.ok(
    helper.includes('__candidate.title') && helper.includes('-button'),
    'lookup must mirror JSX key expression (title + suffix), not .id',
  )
  assert.ok(
    !helper.includes('__candidate?.id ?? __candidate'),
    'must not use default id path when keyExpression is set',
  )
})

test('two sibling .map() blocks get distinct #__dc_* private fields', async () => {
  const plugin = geaPlugin()
  const transform2 = typeof plugin.transform === 'function' ? plugin.transform : plugin.transform!.handler
  const r = await transform2!.call({} as never, TWO_MAPS_SOURCE, '/virtual/tabs.tsx')
  const code = typeof r === 'string' ? r : r?.code
  assert.ok(code)
  const dcFields = [...code!.matchAll(/#__(dc_[a-z0-9_]+)/gi)].map((m) => m[1])
  const unique = [...new Set(dcFields)]
  assert.ok(unique.length >= 2, `expected at least two distinct __dc_* fields, got: ${unique.join(', ')}`)
  assert.match(code!, /#__dc_[^;]+ \|\| \(this\.#__dc_[^ ]+ = this\.____unresolved_0_container\)/)
  assert.match(code!, /#__dc_[^;]+ \|\| \(this\.#__dc_[^ ]+ = this\.____unresolved_1_container\)/)
})
