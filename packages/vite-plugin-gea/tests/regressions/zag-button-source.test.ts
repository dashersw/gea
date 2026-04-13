import assert from 'node:assert/strict'
import { it } from 'node:test'
import { transformFile } from '../../src/closure-codegen/transform.ts'
import { readGeaUiSource } from '../helpers/compile'

it('@geajs/ui Button.tsx still closure-transforms (Zag + plugin pipeline smoke)', () => {
  const src = readGeaUiSource('components', 'button.tsx')
  const { code, changed, rewritten } = transformFile(src, '/virtual/packages/gea-ui/src/components/button.tsx')
  assert.equal(changed, true)
  assert.ok(rewritten?.includes('Button'), 'Button class should be rewritten')
  assert.match(code, /GEA_CREATE_TEMPLATE|gea\.component\.createTemplate/)
})
