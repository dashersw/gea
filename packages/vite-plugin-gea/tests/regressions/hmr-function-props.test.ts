import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponentForHmr } from '../helpers/compile'
import * as hmrBindings from '../helpers/gea-hmr-runtime'

describe('HMR: imported function component receives lexical this.props values', { concurrency: false }, () => {
  let restoreDom: () => void
  let prevHot: unknown
  let tempDir: string

  beforeEach(() => {
    restoreDom = installDom()
    tempDir = mkdtempSync(join(tmpdir(), 'gea-hmr-function-props-'))
    prevHot = (globalThis as any).__geaHmrTestHot
    ;(globalThis as any).__geaHmrTestHot = {
      accept() {
        /* test harness no-op */
      },
      invalidate() {
        throw new Error('HMR invalidated unexpectedly')
      },
    }
  })

  afterEach(() => {
    if (prevHot === undefined) delete (globalThis as any).__geaHmrTestHot
    else (globalThis as any).__geaHmrTestHot = prevHot
    rmSync(tempDir, { recursive: true, force: true })
    restoreDom()
  })

  it('renders and hot-swaps a Jira-shaped parent that passes this.props.x into an imported function child', async () => {
    const issueBadgePath = join(tempDir, 'IssueBadge.tsx')
    const issuePanelPath = join(tempDir, 'IssuePanel.tsx')
    const issueBadgeSource = `
      export default function IssueBadge({ issueId }: { issueId: string }) {
        return <span class="issue-badge" data-issue-id={issueId}>{issueId}</span>
      }
    `
    const issuePanelSource = `
      import { Component } from '@geajs/core'
      import IssueBadge from './IssueBadge'

      export default class IssuePanel extends Component<{ issueId: string }> {
        template() {
          return (
            <section class="issue-panel">
              <IssueBadge issueId={this.props.issueId} />
            </section>
          )
        }
      }
    `
    writeFileSync(issueBadgePath, issueBadgeSource)
    writeFileSync(issuePanelPath, issuePanelSource)

    const issuePanelUrl = pathToFileURL(issuePanelPath).href
    const issueBadgeProxyUrl = new URL('./IssueBadge', issuePanelUrl).href
    const IssueBadge = await compileJsxComponentForHmr(
      issueBadgeSource,
      issueBadgePath,
      issueBadgeProxyUrl,
      'IssueBadge',
      {},
      hmrBindings,
    )
    const IssuePanel = await compileJsxComponentForHmr(
      issuePanelSource,
      issuePanelPath,
      issuePanelUrl,
      'IssuePanel',
      { __hmr_IssueBadge: IssueBadge },
      hmrBindings,
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const panel = new IssuePanel()
    panel.props = { issueId: 'GEA-17' }
    panel.render(root)
    await flushMicrotasks()

    assert.equal(root.querySelector('.issue-badge')?.textContent, 'GEA-17')
    assert.equal(root.querySelector('.issue-badge')?.getAttribute('data-issue-id'), 'GEA-17')

    const IssuePanelV2 = await compileJsxComponentForHmr(
      issuePanelSource.replace('class="issue-panel"', 'class="issue-panel hot"'),
      issuePanelPath,
      issuePanelUrl,
      'IssuePanel',
      { __hmr_IssueBadge: IssueBadge },
      hmrBindings,
    )
    assert.equal(hmrBindings.handleComponentUpdate(issuePanelUrl, { default: IssuePanelV2 }), true)
    await flushMicrotasks()

    assert.equal(root.querySelector('.issue-panel.hot .issue-badge')?.textContent, 'GEA-17')
    assert.equal(root.querySelector('.issue-panel.hot .issue-badge')?.getAttribute('data-issue-id'), 'GEA-17')
    panel.dispose()
  })
})
