import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { resolveRedirect } from '../src/router/redirect'

describe('resolveRedirect', () => {
  it('resolves static string redirect', () => {
    const r = resolveRedirect('/dashboard', {}, '/old')
    assert.equal(r.target, '/dashboard')
    assert.equal(r.method, 'replace')
  })

  it('resolves RedirectConfig with function', () => {
    const config = {
      redirect: (params: any) => `/projects/${params.id}`,
      method: 'push' as const,
      status: 301,
    }
    const r = resolveRedirect(config, { id: '42' }, '/old/42')
    assert.equal(r.target, '/projects/42')
    assert.equal(r.method, 'push')
    assert.equal(r.status, 301)
  })

  it('resolves RedirectConfig with static string', () => {
    const config = { redirect: '/new' }
    const r = resolveRedirect(config, {}, '/old')
    assert.equal(r.target, '/new')
    assert.equal(r.method, 'replace')
  })

  it('passes wildcard path to redirect function', () => {
    const config = {
      redirect: (_: any, path: string) => `https://blog.example.com${path}`,
    }
    const r = resolveRedirect(config, { '*': 'my-post' }, '/blog/my-post')
    assert.equal(r.target, 'https://blog.example.com/blog/my-post')
  })
})
