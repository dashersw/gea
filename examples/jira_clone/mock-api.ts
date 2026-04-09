import type { ViteDevServer } from 'vite'

const users = [
  { id: 'u1', name: 'Pickle Rick', avatarUrl: 'https://i.ibb.co/7JM1P2r/picke-rick.jpg', email: 'rick@jira.guest' },
  { id: 'u2', name: 'Lord Gaben', avatarUrl: 'https://i.ibb.co/6RJ5hq6/gaben.jpg', email: 'gaben@jira.guest' },
  { id: 'u3', name: 'Baby Yoda', avatarUrl: 'https://i.ibb.co/6n0hLML/baby-yoda.jpg', email: 'yoda@jira.guest' },
]

function seedIssues() {
  return [
    {
      id: '1',
      title: 'Investigate login page performance',
      description: '<p>The login page is loading slowly. We need to investigate and optimize.</p>',
      type: 'task',
      status: 'backlog',
      priority: '3',
      listPosition: 1,
      estimate: 8,
      timeSpent: 2,
      timeRemaining: 6,
      reporterId: 'u1',
      userIds: ['u1', 'u2'],
      createdAt: '2024-01-15T10:00:00Z',
      updatedAt: '2024-03-10T14:30:00Z',
      comments: [
        {
          id: 'c1',
          body: 'I noticed this too, especially on mobile.',
          userId: 'u2',
          issueId: '1',
          createdAt: '2024-02-01T09:00:00Z',
          updatedAt: '2024-02-01T09:00:00Z',
        },
      ],
    },
    {
      id: '2',
      title: 'Fix bug in user registration flow',
      description: '<p>Users are getting an error when trying to register with certain email domains.</p>',
      type: 'bug',
      status: 'selected',
      priority: '4',
      listPosition: 1,
      estimate: 4,
      timeSpent: 0,
      timeRemaining: 4,
      reporterId: 'u1',
      userIds: ['u2'],
      createdAt: '2024-02-20T08:00:00Z',
      updatedAt: '2024-03-12T11:00:00Z',
      comments: [],
    },
    {
      id: '3',
      title: 'Implement dark mode toggle',
      description: '<p>Add a dark mode option to the user settings page.</p>',
      type: 'story',
      status: 'inprogress',
      priority: '3',
      listPosition: 1,
      estimate: 16,
      timeSpent: 8,
      timeRemaining: 8,
      reporterId: 'u3',
      userIds: ['u1', 'u3'],
      createdAt: '2024-01-10T12:00:00Z',
      updatedAt: '2024-03-14T16:45:00Z',
      comments: [
        {
          id: 'c2',
          body: 'Started working on this. The CSS variables approach looks promising.',
          userId: 'u1',
          issueId: '3',
          createdAt: '2024-03-01T10:00:00Z',
          updatedAt: '2024-03-01T10:00:00Z',
        },
        {
          id: 'c3',
          body: 'Great progress! Looks good on the preview.',
          userId: 'u3',
          issueId: '3',
          createdAt: '2024-03-05T15:00:00Z',
          updatedAt: '2024-03-05T15:00:00Z',
        },
      ],
    },
    {
      id: '4',
      title: 'Update API documentation',
      description: '<p>The API docs are outdated. Need to update with new endpoints.</p>',
      type: 'task',
      status: 'done',
      priority: '2',
      listPosition: 1,
      estimate: 6,
      timeSpent: 6,
      timeRemaining: 0,
      reporterId: 'u2',
      userIds: ['u2'],
      createdAt: '2024-02-05T14:00:00Z',
      updatedAt: '2024-03-08T09:30:00Z',
      comments: [],
    },
    {
      id: '5',
      title: 'Add search functionality to dashboard',
      description: '<p>Users should be able to search across all their projects from the main dashboard.</p>',
      type: 'story',
      status: 'backlog',
      priority: '3',
      listPosition: 2,
      estimate: 20,
      timeSpent: 0,
      timeRemaining: 20,
      reporterId: 'u1',
      userIds: ['u1', 'u3'],
      createdAt: '2024-03-01T11:00:00Z',
      updatedAt: '2024-03-15T10:00:00Z',
      comments: [],
    },
    {
      id: '6',
      title: 'Memory leak in notification service',
      description: '<p>The notification service has a memory leak that causes the app to slow down over time.</p>',
      type: 'bug',
      status: 'inprogress',
      priority: '5',
      listPosition: 2,
      estimate: 10,
      timeSpent: 4,
      timeRemaining: 6,
      reporterId: 'u2',
      userIds: ['u1'],
      createdAt: '2024-03-05T09:00:00Z',
      updatedAt: '2024-03-16T08:00:00Z',
      comments: [],
    },
    {
      id: '7',
      title: 'Refactor authentication middleware',
      description: '',
      type: 'task',
      status: 'selected',
      priority: '2',
      listPosition: 2,
      estimate: 12,
      timeSpent: 0,
      timeRemaining: 12,
      reporterId: 'u3',
      userIds: ['u3'],
      createdAt: '2024-03-10T13:00:00Z',
      updatedAt: '2024-03-13T17:00:00Z',
      comments: [],
    },
    {
      id: '8',
      title: 'Set up CI/CD pipeline',
      description: '<p>Configure GitHub Actions for automated testing and deployment.</p>',
      type: 'task',
      status: 'done',
      priority: '4',
      listPosition: 2,
      estimate: 8,
      timeSpent: 8,
      timeRemaining: 0,
      reporterId: 'u1',
      userIds: ['u2', 'u3'],
      createdAt: '2024-01-20T10:00:00Z',
      updatedAt: '2024-02-28T14:00:00Z',
      comments: [],
    },
  ]
}

let issues = seedIssues()

const project = {
  id: 'p1',
  name: 'Project Singularity',
  url: 'https://singularity.dev',
  description: '<p>A next-generation project management tool.</p>',
  category: 'software',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-03-16T00:00:00Z',
  users,
  issues,
}

const currentUser = users[0]
let nextIssueId = 9
let nextCommentId = 4

function resetState() {
  issues = seedIssues()
  project.issues = issues
  nextIssueId = 9
  nextCommentId = 4
}

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

function json(res: any, data: any, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...corsHeaders })
  res.end(JSON.stringify(data))
}

function parseBody(req: any): Promise<any> {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk: string) => {
      body += chunk
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(body))
      } catch {
        resolve({})
      }
    })
  })
}

export function mockApiMiddleware(server: ViteDevServer) {
  server.middlewares.use(async (req: any, res: any, next: any) => {
    const url = req.url || ''
    const method = req.method?.toUpperCase() || 'GET'
    const parsedUrl = new URL(url, 'http://localhost')

    const path = parsedUrl.pathname.startsWith('/api/') ? parsedUrl.pathname.replace('/api', '') : parsedUrl.pathname

    const apiPaths = ['/__reset', '/authentication/guest', '/currentUser', '/project', '/issues', '/comments']
    const isApiRoute = apiPaths.some((p) => path === p || path.startsWith(p + '/') || path.startsWith(p + '?'))
    if (!isApiRoute) return next()

    if (method === 'OPTIONS') {
      res.writeHead(204, corsHeaders)
      return res.end()
    }

    if (method === 'POST' && path === '/__reset') {
      resetState()
      return json(res, { ok: true })
    }

    if (method === 'POST' && path === '/authentication/guest') {
      return json(res, { authToken: 'mock-jwt-token' })
    }

    if (method === 'GET' && path === '/currentUser') {
      return json(res, { currentUser })
    }

    if (method === 'GET' && path === '/project') {
      return json(res, { project: { ...project, issues } })
    }

    if (method === 'PUT' && path === '/project') {
      const body = await parseBody(req)
      Object.assign(project, body)
      return json(res, { project: { ...project, issues } })
    }

    const issueMatch = path.match(/^\/issues\/(\w+)$/)
    if (method === 'GET' && path === '/issues') {
      const searchParams = parsedUrl.searchParams
      const searchTerm = searchParams.get('searchTerm') || ''
      if (searchTerm) {
        const term = searchTerm.toLowerCase()
        const matched = issues.filter(
          (i) => i.title.toLowerCase().includes(term) || i.description.toLowerCase().includes(term),
        )
        return json(res, matched)
      }
      return json(res, issues)
    }

    if (method === 'GET' && issueMatch) {
      const issue = issues.find((i) => i.id === issueMatch[1])
      if (issue) return json(res, { issue: { ...issue, users: users.filter((u) => issue.userIds.includes(u.id)) } })
      return json(res, { error: { message: 'Issue not found' } }, 404)
    }

    if (method === 'POST' && path === '/issues') {
      const body = await parseBody(req)
      const newIssue = {
        id: String(nextIssueId++),
        ...body,
        listPosition: issues.filter((i) => i.status === body.status).length + 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        comments: [],
      }
      issues.push(newIssue)
      return json(res, { issue: newIssue })
    }

    if (method === 'PUT' && issueMatch) {
      const body = await parseBody(req)
      const issue = issues.find((i) => i.id === issueMatch[1])
      if (issue) {
        Object.assign(issue, body, { updatedAt: new Date().toISOString() })
        return json(res, { issue })
      }
      return json(res, { error: { message: 'Issue not found' } }, 404)
    }

    if (method === 'DELETE' && issueMatch) {
      issues = issues.filter((i) => i.id !== issueMatch[1])
      return json(res, {})
    }

    if (method === 'POST' && path === '/comments') {
      const body = await parseBody(req)
      const issue = issues.find((i) => i.id === body.issueId)
      if (issue) {
        const comment = {
          id: `c${nextCommentId++}`,
          ...body,
          userId: currentUser.id,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        issue.comments.push(comment)
        return json(res, { comment })
      }
      return json(res, { error: { message: 'Issue not found' } }, 404)
    }

    const commentMatch = path.match(/^\/comments\/(\w+)$/)
    if (method === 'PUT' && commentMatch) {
      const body = await parseBody(req)
      for (const issue of issues) {
        const comment = issue.comments.find((c: any) => c.id === commentMatch[1])
        if (comment) {
          Object.assign(comment, body, { updatedAt: new Date().toISOString() })
          return json(res, { comment })
        }
      }
      return json(res, { error: { message: 'Comment not found' } }, 404)
    }

    if (method === 'DELETE' && commentMatch) {
      for (const issue of issues) {
        issue.comments = issue.comments.filter((c: any) => c.id !== commentMatch[1])
      }
      return json(res, {})
    }

    next()
  })
}
