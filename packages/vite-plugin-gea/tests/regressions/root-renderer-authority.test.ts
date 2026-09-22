import assert from 'node:assert/strict'
import { it } from 'node:test'
import { posix } from 'node:path'
import { geaPlugin } from '../../src/index.ts'

async function collect(root: string, multiEntry = false, aliases = ['@one', '@two'], external = false) {
  const plugin = geaPlugin({ ir: { enabled: true } }) as any
  plugin.configResolved({ root, command: 'build', build: {} })
  const panel = `import { Component } from '@geajs/core'; export class Panel extends Component { template() { return <div /> } }`
  const one = external ? '/dependencies/one.tsx' : `${root}/src/one.tsx`
  const two = external ? '/dependencies/two.tsx' : `${root}/src/two.tsx`
  const sources: Record<string, string> = {
    [`${root}/src/main.ts`]: `import { Panel as A } from '${aliases[0]}'; import { Panel as B } from '${aliases[1]}';`,
    [one]: `import './main'; ${panel}`,
    [two]: panel,
  }
  for (const [id, source] of Object.entries(sources)) plugin.transform.call({}, source, id)
  const entries = multiEntry ? ['one.tsx', 'two.tsx'] : ['main.ts']
  const bundle = Object.fromEntries(
    entries.map((entry, index) => [
      `${index}.js`,
      {
        type: 'chunk',
        isEntry: true,
        facadeModuleId: `${root}/src/${entry}`,
        fileName: `${index}.js`,
        modules: Object.fromEntries(Object.keys(sources).map((id) => [id, {}])),
      },
    ]),
  )
  let ir: any
  let resolutions = 0
  await plugin.generateBundle.call(
    {
      emitFile(asset: any) {
        ir = JSON.parse(asset.source)
      },
      async resolve(specifier: string, importer: string) {
        assert.ok(++resolutions < 20, 'cyclic imports must terminate')
        if (specifier === aliases[0]) return { id: one }
        if (specifier === aliases[1]) return { id: two }
        if (specifier.startsWith('.')) return { id: posix.resolve(posix.dirname(importer), specifier) + '.ts' }
        return null
      },
    },
    {},
    bundle,
  )
  return ir.components
    .map((component: any) => component.rootRendererAuthority)
    .filter(Boolean)
    .sort((a: any, b: any) => a.component.moduleSpecifier.localeCompare(b.component.moduleSpecifier))
}

it('keeps same-named components from separate aliases distinct and visits cycles once', async () => {
  const authorities = await collect('/first/checkout')
  assert.equal(authorities.length, 2)
  assert.notEqual(authorities[0].rendererResourceId, authorities[1].rendererResourceId)
  assert.deepEqual(
    authorities.map((a: any) => a.component.moduleSpecifier),
    ['/src/one.tsx', '/src/two.tsx'],
  )
})

it('keeps identity stable across checkout moves, alias spelling and entry layout', async () => {
  const baseline = await collect('/first/checkout')
  assert.deepEqual(await collect('/elsewhere/project', false, ['@renamed/a', '@renamed/b']), baseline)
  assert.deepEqual(await collect('/elsewhere/project', true), baseline)
  assert.ok(!JSON.stringify(baseline).includes('/first/checkout'))
})

it('retains separate package namespaces for modules outside the project root', async () => {
  const authorities = await collect('/app', false, ['@one', '@two'], true)
  assert.deepEqual(
    authorities.map((a: any) => a.component.moduleSpecifier),
    ['/@modules/@one', '/@modules/@two'],
  )
  assert.notEqual(authorities[0].rendererResourceId, authorities[1].rendererResourceId)
})

it('does not publish an absolute external checkout path as a logical identity', async () => {
  assert.deepEqual(await collect('/app', false, ['/dependencies/one.tsx', '/dependencies/two.tsx'], true), [])
})
