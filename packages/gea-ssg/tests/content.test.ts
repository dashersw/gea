import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { writeFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'

import { preloadContent, clearContentCache, serializeContentCache, ssg, getContentSlugs } from '../src/content'

const tmpDir = join(import.meta.dirname, '.tmp-content-test')

beforeEach(async () => {
  await mkdir(join(tmpDir, 'posts'), { recursive: true })
})

afterEach(async () => {
  clearContentCache()
  await rm(tmpDir, { recursive: true, force: true })
})

describe('preloadContent', () => {
  it('loads all markdown files from subdirectories', async () => {
    await writeFile(
      join(tmpDir, 'posts', 'hello-world.md'),
      '---\ntitle: Hello World\ndate: 2025-03-15\n---\n\n# Introduction\n\nThis is a **bold** paragraph.',
    )
    await writeFile(join(tmpDir, 'posts', 'second-post.md'), '---\ntitle: Second Post\n---\n\n# Second')

    await preloadContent(tmpDir)

    const posts = ssg.content('posts')
    assert.equal(posts.length, 2)
    assert.equal(posts[0].slug, 'hello-world')
    assert.equal(posts[1].slug, 'second-post')
  })

  it('parses frontmatter and renders markdown to html', async () => {
    await writeFile(
      join(tmpDir, 'posts', 'test.md'),
      '---\ntitle: Test Post\ntags:\n  - a\n  - b\n---\n\nA paragraph with *emphasis*.',
    )

    await preloadContent(tmpDir)

    const posts = ssg.content('posts')
    assert.equal(posts[0].frontmatter.title, 'Test Post')
    assert.deepEqual(posts[0].frontmatter.tags, ['a', 'b'])
    assert.ok(posts[0].content.includes('*emphasis*'))
    assert.ok(posts[0].html.includes('<em>emphasis</em>'))
  })

  it('normalizes Date values to ISO strings', async () => {
    await writeFile(join(tmpDir, 'posts', 'dated.md'), '---\ntitle: Dated\ndate: 2025-03-15\n---\n\nContent')

    await preloadContent(tmpDir)

    const posts = ssg.content('posts')
    assert.equal(typeof posts[0].frontmatter.date, 'string')
    assert.ok(posts[0].frontmatter.date.startsWith('2025-03-15'))
  })

  it('handles files without frontmatter', async () => {
    await writeFile(join(tmpDir, 'posts', 'no-meta.md'), '# Just content\n\nSome text.')

    await preloadContent(tmpDir)

    const posts = ssg.content('posts')
    assert.equal(posts[0].slug, 'no-meta')
    assert.deepEqual(posts[0].frontmatter, {})
    assert.ok(posts[0].html.includes('<h1>Just content</h1>'))
  })

  it('ignores non-directory entries', async () => {
    await writeFile(join(tmpDir, 'readme.md'), '# Root file')
    await writeFile(join(tmpDir, 'posts', 'post.md'), '---\ntitle: Post\n---\n# Post')

    await preloadContent(tmpDir)

    const posts = ssg.content('posts')
    assert.equal(posts.length, 1)
    assert.equal(ssg.content('readme.md').length, 0)
  })

  it('ignores non-md files in subdirectories', async () => {
    await writeFile(join(tmpDir, 'posts', 'post.md'), '---\ntitle: MD\n---\n# MD')
    await writeFile(join(tmpDir, 'posts', 'readme.txt'), 'not markdown')

    await preloadContent(tmpDir)

    assert.equal(ssg.content('posts').length, 1)
  })
})

describe('ssg.content', () => {
  it('returns empty array for unknown subdir', async () => {
    await preloadContent(tmpDir)
    assert.deepEqual(ssg.content('unknown'), [])
  })

  it('supports sort option', async () => {
    await writeFile(join(tmpDir, 'posts', 'aaa.md'), '---\norder: 2\n---\n# A')
    await writeFile(join(tmpDir, 'posts', 'bbb.md'), '---\norder: 1\n---\n# B')

    await preloadContent(tmpDir)

    const sorted = ssg.content('posts', {
      sort: (a: any, b: any) => a.frontmatter.order - b.frontmatter.order,
    })
    assert.equal(sorted[0].slug, 'bbb')
    assert.equal(sorted[1].slug, 'aaa')
  })

  it('does not mutate original cache when sorting', async () => {
    await writeFile(join(tmpDir, 'posts', 'bbb.md'), '---\norder: 1\n---\n# B')
    await writeFile(join(tmpDir, 'posts', 'aaa.md'), '---\norder: 2\n---\n# A')

    await preloadContent(tmpDir)

    ssg.content('posts', { sort: (a: any, b: any) => a.frontmatter.order - b.frontmatter.order })

    const unsorted = ssg.content('posts')
    assert.equal(unsorted[0].slug, 'aaa')
  })
})

describe('ssg.file', () => {
  it('finds a file by slug', async () => {
    await writeFile(join(tmpDir, 'posts', 'hello.md'), '---\ntitle: Hello\n---\n# Hello')
    await writeFile(join(tmpDir, 'posts', 'world.md'), '---\ntitle: World\n---\n# World')

    await preloadContent(tmpDir)

    const file = ssg.file('posts', 'hello')
    assert.ok(file)
    assert.equal(file!.frontmatter.title, 'Hello')
  })

  it('returns null for unknown slug', async () => {
    await preloadContent(tmpDir)
    assert.equal(ssg.file('posts', 'nonexistent'), null)
  })

  it('returns null for unknown subdir', async () => {
    await preloadContent(tmpDir)
    assert.equal(ssg.file('unknown', 'anything'), null)
  })
})

describe('getContentSlugs', () => {
  it('returns slugs for a subdir', async () => {
    await writeFile(join(tmpDir, 'posts', 'aaa.md'), '# A')
    await writeFile(join(tmpDir, 'posts', 'bbb.md'), '# B')

    await preloadContent(tmpDir)

    const slugs = getContentSlugs('posts')
    assert.deepEqual(slugs, ['aaa', 'bbb'])
  })

  it('returns empty for unknown subdir', () => {
    assert.deepEqual(getContentSlugs('nope'), [])
  })
})

describe('serializeContentCache', () => {
  it('returns valid JSON', async () => {
    await writeFile(join(tmpDir, 'posts', 'test.md'), '---\ntitle: Test\n---\n# Test')

    await preloadContent(tmpDir)

    const json = serializeContentCache()
    const parsed = JSON.parse(json)
    assert.ok(Array.isArray(parsed.posts))
    assert.equal(parsed.posts[0].slug, 'test')
  })
})

describe('clearContentCache', () => {
  it('clears all cached content', async () => {
    await writeFile(join(tmpDir, 'posts', 'test.md'), '# Test')

    await preloadContent(tmpDir)
    assert.equal(ssg.content('posts').length, 1)

    clearContentCache()
    assert.equal(ssg.content('posts').length, 0)
  })
})
