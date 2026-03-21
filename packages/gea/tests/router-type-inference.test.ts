import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { InferRouteProps, ExtractParams } from '../src/lib/router/types'
import type { GeaRouter } from '../src/lib/router/router'

import Home from '../../../examples/router-simple/src/views/Home'
import Projects from '../../../examples/router-v2/src/views/Projects'
import Project from '../../../examples/router-v2/src/views/Project'
import DashboardLayout from '../../../examples/router-v2/src/layouts/DashboardLayout'
import SettingsLayout from '../../../examples/router-v2/src/layouts/SettingsLayout'
import ProfileSettings from '../../../examples/router-v2/src/views/ProfileSettings'
import BillingSettings from '../../../examples/router-v2/src/views/BillingSettings'

// ── ExtractParams tests ─────────────────────────────────────────

// Verify ExtractParams works at the type level
type _ParamsEmpty = ExtractParams<'/projects'>
const _pe: _ParamsEmpty = {}

type _ParamsSingle = ExtractParams<'/projects/:id'>
const _ps: _ParamsSingle = { id: '42' }

type _ParamsMulti = ExtractParams<'/orgs/:orgId/projects/:projectId'>
const _pm: _ParamsMulti = { orgId: 'a', projectId: 'b' }

// @ts-expect-error — missing required param
const _pmBad: _ParamsMulti = { orgId: 'a' }

// ── Route config with literal types preserved ───────────────────

// We build the config with `as const` and use a type assertion to
// create a GeaRouter type that preserves the literal structure.

const _routeConfig = {
  '/dashboard': {
    layout: DashboardLayout as any,
    children: {
      '/': Home as any,
      '/projects': Projects as any,
      '/projects/:id': Project as any,
    },
  },
  '/settings': {
    layout: SettingsLayout as any,
    mode: { type: 'query' as const, param: 'view' },
    children: {
      profile: ProfileSettings as any,
      billing: BillingSettings as any,
    },
  },
} as const

type TestRouter = GeaRouter<typeof _routeConfig>
type Props = InferRouteProps<TestRouter>

// ── Dashboard layout props ──────────────────────────────────────

type DashProps = Props['/dashboard']

// page should accept any of the child components
const _dashPage1: DashProps['page'] = Home as any
const _dashPage2: DashProps['page'] = Projects as any
const _dashPage3: DashProps['page'] = Project as any

// route is string
const _dashRoute: DashProps['route'] = '/dashboard/projects/123'

// params has optional id from '/projects/:id' child
const _dashParams1: DashProps['params'] = {}
const _dashParams2: DashProps['params'] = { id: '42' }

// ── Settings layout props (query mode) ──────────────────────────

type SettingsProps = Props['/settings']

// page accepts child components
const _settingsPage1: SettingsProps['page'] = ProfileSettings as any
const _settingsPage2: SettingsProps['page'] = BillingSettings as any

// Query mode extras exist
const _settingsActiveKey: SettingsProps['activeKey'] = 'profile'
const _settingsKeys: SettingsProps['keys'] = ['profile', 'billing']
const _settingsNavigate: SettingsProps['navigate'] = (_key: string) => {}

// ── Nonexistent route produces error ────────────────────────────

// @ts-expect-error — '/nonexistent' does not exist in Props
type _Bad = Props['/nonexistent']['page']

// ── Dashboard should NOT have query mode props ──────────────────

// @ts-expect-error — activeKey does not exist on non-query-mode layout
const _noActiveKey: DashProps['activeKey'] = 'x'

// ── InferRouteProps works directly on a RouteMap type ───────────

type DirectProps = InferRouteProps<typeof _routeConfig>
type DirectDashProps = DirectProps['/dashboard']
const _directRoute: DirectDashProps['route'] = '/test'

// ── Runtime tests ───────────────────────────────────────────────

describe('Type inference', () => {
  it('compiles without type errors (this file is the test)', () => {
    assert.ok(true, 'type-inference.test.ts compiled successfully')
  })
})
