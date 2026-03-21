const http = require('http')

const users = [
  {
    id: 1,
    name: 'Pickle Rick',
    avatarUrl: 'https://i.ibb.co/7JM1P2r/picke-rick.jpg',
    email: 'rick@jira.guest',
    projectId: 1,
  },
  {
    id: 2,
    name: 'Baby Yoda',
    avatarUrl: 'https://i.ibb.co/6n0hLML/baby-yoda.jpg',
    email: 'yoda@jira.guest',
    projectId: 1,
  },
  {
    id: 3,
    name: 'Lord Gaben',
    avatarUrl: 'https://i.ibb.co/6RJ5hq6/gaben.jpg',
    email: 'gaben@jira.guest',
    projectId: 1,
  },
]

let issues = [
  {
    id: 1,
    title: 'This is an issue of type: Task.',
    type: 'task',
    status: 'backlog',
    priority: '2',
    listPosition: 1,
    estimate: 8,
    timeSpent: 4,
    timeRemaining: 4,
    description: '<p>Your teams can collaborate in Jira applications by breaking down pieces of work into issues.</p>',
    reporterId: 2,
    userIds: [1],
    projectId: 1,
    createdAt: '2024-01-15T10:00:00.000Z',
    updatedAt: '2024-03-10T14:30:00.000Z',
  },
  {
    id: 2,
    title: "Click on an issue to see what's behind it.",
    type: 'task',
    status: 'backlog',
    priority: '4',
    listPosition: 2,
    estimate: 5,
    timeSpent: 2,
    timeRemaining: 3,
    description:
      '<h2>Key terms to know</h2><p><br></p><h3>Issues</h3><p>A Jira issue refers to a single work item.</p>',
    reporterId: 3,
    userIds: [1],
    projectId: 1,
    createdAt: '2024-01-16T10:00:00.000Z',
    updatedAt: '2024-03-11T14:30:00.000Z',
  },
  {
    id: 3,
    title: 'Try dragging issues to different columns to transition their status.',
    type: 'story',
    status: 'backlog',
    priority: '3',
    listPosition: 3,
    estimate: 15,
    timeSpent: 12,
    timeRemaining: 3,
    description: "<p>An issue's status indicates its current place in the project's workflow.</p>",
    reporterId: 2,
    userIds: [],
    projectId: 1,
    createdAt: '2024-01-17T10:00:00.000Z',
    updatedAt: '2024-03-12T14:30:00.000Z',
  },
  {
    id: 4,
    title: 'You can use rich text with images in issue descriptions.',
    type: 'story',
    status: 'backlog',
    priority: '4',
    listPosition: 4,
    estimate: 4,
    timeSpent: 4,
    timeRemaining: 0,
    description: '<h1>🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓</h1>',
    reporterId: 1,
    userIds: [3],
    projectId: 1,
    createdAt: '2024-01-18T10:00:00.000Z',
    updatedAt: '2024-03-13T14:30:00.000Z',
  },
  {
    id: 5,
    title: 'Each issue can be assigned priority from lowest to highest.',
    type: 'task',
    status: 'selected',
    priority: '1',
    listPosition: 1,
    estimate: 4,
    timeSpent: 1,
    timeRemaining: 3,
    description: "<p>An issue's priority indicates its relative importance.</p>",
    reporterId: 3,
    userIds: [],
    projectId: 1,
    createdAt: '2024-02-01T10:00:00.000Z',
    updatedAt: '2024-03-14T14:30:00.000Z',
  },
  {
    id: 6,
    title: 'Each issue has a single reporter but can have multiple assignees.',
    type: 'story',
    status: 'selected',
    priority: '2',
    listPosition: 2,
    estimate: 6,
    timeSpent: 3,
    timeRemaining: 3,
    description: '<h2>Try assigning <u>Pickle Rick</u> to this issue. 🥒🥒🥒</h2>',
    reporterId: 2,
    userIds: [2, 3],
    projectId: 1,
    createdAt: '2024-02-05T10:00:00.000Z',
    updatedAt: '2024-03-15T14:30:00.000Z',
  },
  {
    id: 7,
    title: 'You can track how many hours were spent working on an issue, and how many hours remain.',
    type: 'task',
    status: 'inprogress',
    priority: '4',
    listPosition: 1,
    estimate: 12,
    timeSpent: 11,
    timeRemaining: 1,
    description: '<p>Before you start work on an issue, you can set a time or other type of estimate.</p>',
    reporterId: 1,
    userIds: [],
    projectId: 1,
    createdAt: '2024-02-10T10:00:00.000Z',
    updatedAt: '2024-03-16T14:30:00.000Z',
  },
  {
    id: 8,
    title: 'Try leaving a comment on this issue.',
    type: 'task',
    status: 'done',
    priority: '3',
    listPosition: 1,
    estimate: 10,
    timeSpent: 2,
    timeRemaining: 8,
    description: '<p>Adding comments to an issue is a useful way to record additional detail.</p>',
    reporterId: 1,
    userIds: [2],
    projectId: 1,
    createdAt: '2024-02-15T10:00:00.000Z',
    updatedAt: '2024-03-17T14:30:00.000Z',
  },
]

const comments = [
  {
    id: 1,
    body: 'An old silent pond...\nA frog jumps into the pond,\nsplash! Silence again.',
    issueId: 1,
    userId: 3,
    createdAt: '2024-02-01T09:00:00.000Z',
    updatedAt: '2024-02-01T09:00:00.000Z',
  },
  {
    id: 2,
    body: 'Autumn moonlight-\na worm digs silently\ninto the chestnut.',
    issueId: 2,
    userId: 3,
    createdAt: '2024-02-02T09:00:00.000Z',
    updatedAt: '2024-02-02T09:00:00.000Z',
  },
  {
    id: 3,
    body: 'In the twilight rain\nthese brilliant-hued hibiscus -\nA lovely sunset.',
    issueId: 3,
    userId: 3,
    createdAt: '2024-02-03T09:00:00.000Z',
    updatedAt: '2024-02-03T09:00:00.000Z',
  },
]

const project = {
  id: 1,
  name: 'singularity 1.0',
  url: 'https://www.atlassian.com/software/jira',
  description: 'Plan, track, and manage your agile and software development projects in Jira.',
  category: 'software',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-03-16T00:00:00.000Z',
}

let currentUser = users[2]
let nextIssueId = 9
let nextCommentId = 4

function json(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  })
  res.end(JSON.stringify(data))
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk) => {
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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:3000')
  const path = url.pathname
  const method = req.method.toUpperCase()

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    })
    return res.end()
  }

  if (method === 'POST' && path === '/authentication/guest') {
    currentUser = users[2]
    return json(res, { authToken: 'mock-jwt-token', user: currentUser })
  }

  if (method === 'GET' && path === '/currentUser') {
    return json(res, { currentUser })
  }

  if (method === 'GET' && path === '/project') {
    return json(res, {
      project: {
        ...project,
        users,
        issues: issues.map((i) => ({ ...i, users: users.filter((u) => i.userIds.includes(u.id)) })),
      },
    })
  }

  if (method === 'PUT' && path === '/project') {
    const body = await parseBody(req)
    Object.assign(project, body)
    return json(res, { project: { ...project, users, issues } })
  }

  const issueMatch = path.match(/^\/issues\/(\d+)$/)

  if (method === 'GET' && path === '/issues') {
    const searchTerm = url.searchParams.get('searchTerm') || ''
    let result = issues
    if (searchTerm) {
      const t = searchTerm.toLowerCase()
      result = issues.filter(
        (i) => i.title.toLowerCase().includes(t) || (i.description || '').toLowerCase().includes(t),
      )
    }
    return json(res, result)
  }

  if (method === 'GET' && issueMatch) {
    const issue = issues.find((i) => i.id === Number(issueMatch[1]))
    if (!issue) return json(res, { error: { message: 'Issue not found' } }, 404)
    return json(res, {
      issue: {
        ...issue,
        users: users.filter((u) => issue.userIds.includes(u.id)),
        comments: comments
          .filter((c) => c.issueId === issue.id)
          .map((c) => ({
            ...c,
            user: users.find((u) => u.id === c.userId),
          })),
      },
    })
  }

  if (method === 'POST' && path === '/issues') {
    const body = await parseBody(req)
    const newIssue = {
      id: nextIssueId++,
      ...body,
      listPosition: issues.filter((i) => i.status === body.status).length + 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    issues.push(newIssue)
    return json(res, { issue: newIssue })
  }

  if (method === 'PUT' && issueMatch) {
    const body = await parseBody(req)
    const issue = issues.find((i) => i.id === Number(issueMatch[1]))
    if (!issue) return json(res, { error: { message: 'Issue not found' } }, 404)
    Object.assign(issue, body, { updatedAt: new Date().toISOString() })
    return json(res, { issue })
  }

  if (method === 'DELETE' && issueMatch) {
    issues = issues.filter((i) => i.id !== Number(issueMatch[1]))
    return json(res, {})
  }

  const commentMatch = path.match(/^\/comments\/(\d+)$/)

  if (method === 'POST' && path === '/comments') {
    const body = await parseBody(req)
    const comment = {
      id: nextCommentId++,
      ...body,
      userId: currentUser.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    comments.push(comment)
    return json(res, { comment: { ...comment, user: currentUser } })
  }

  if (method === 'PUT' && commentMatch) {
    const body = await parseBody(req)
    const comment = comments.find((c) => c.id === Number(commentMatch[1]))
    if (!comment) return json(res, { error: { message: 'Comment not found' } }, 404)
    Object.assign(comment, body, { updatedAt: new Date().toISOString() })
    return json(res, { comment: { ...comment, user: users.find((u) => u.id === comment.userId) } })
  }

  if (method === 'DELETE' && commentMatch) {
    const idx = comments.findIndex((c) => c.id === Number(commentMatch[1]))
    if (idx >= 0) comments.splice(idx, 1)
    return json(res, {})
  }

  json(res, { error: { message: 'Route not found' } }, 404)
})

server.listen(3000, () => console.log('Mock API running on http://localhost:3000'))
