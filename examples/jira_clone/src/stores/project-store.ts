import { Store } from '@geajs/core'
import api from '../utils/api'
import { updateArrayItemById } from '../utils/javascript'

class ProjectStore extends Store {
  project: any = null
  isLoading = true
  error: any = null

  async fetchProject(): Promise<void> {
    this.isLoading = true
    try {
      const data = await api.get('/project')
      this.project = data.project
      this.error = null
    } catch (e) {
      this.error = e
    } finally {
      this.isLoading = false
    }
  }

  async updateProject(fields: any): Promise<void> {
    try {
      await api.put('/project', fields)
      await this.fetchProject()
    } catch (e) {
      throw e
    }
  }

  updateLocalProjectIssues(issueId: string, fields: any): void {
    if (!this.project) return
    updateArrayItemById(this.project.issues, issueId, fields)
  }

  async moveIssueToColumn(issueId: string, newStatus: string): Promise<void> {
    if (!this.project) return
    const issue = this.project.issues.find((i: any) => i.id === issueId)
    if (!issue || issue.status === newStatus) return
    const inTarget = this.project.issues.filter((i: any) => i.status === newStatus && i.id !== issueId)
    const nextPosition =
      inTarget.length > 0 ? Math.max(...inTarget.map((i: any) => Number(i.listPosition) || 0)) + 1 : 1
    const fields = { status: newStatus, listPosition: nextPosition }
    this.updateLocalProjectIssues(issueId, fields)
    try {
      await api.put(`/issues/${issueId}`, fields)
    } catch {
      await this.fetchProject()
    }
  }

  async moveIssue(issueId: string, newStatus: string, dropIndex: number): Promise<void> {
    if (!this.project) return
    const issue = this.project.issues.find((i: any) => i.id === issueId)
    if (!issue) return

    const targetIssues = this.project.issues
      .filter((i: any) => i.status === newStatus && i.id !== issueId)
      .sort((a: any, b: any) => a.listPosition - b.listPosition)

    const prevIssue = targetIssues[dropIndex - 1]
    const nextIssue = targetIssues[dropIndex]
    let listPosition: number

    if (!prevIssue && !nextIssue) {
      listPosition = 1
    } else if (!prevIssue) {
      listPosition = nextIssue.listPosition - 1
    } else if (!nextIssue) {
      listPosition = prevIssue.listPosition + 1
    } else {
      listPosition = prevIssue.listPosition + (nextIssue.listPosition - prevIssue.listPosition) / 2
    }

    const fields = { status: newStatus, listPosition }
    this.updateLocalProjectIssues(issueId, fields)
    try {
      await api.put(`/issues/${issueId}`, fields)
    } catch {
      await this.fetchProject()
    }
  }

  async createIssue(data: any): Promise<void> {
    await api.post('/issues', data)
    await this.fetchProject()
  }

  async deleteIssue(issueId: string): Promise<void> {
    await api.delete(`/issues/${issueId}`)
    await this.fetchProject()
  }
}

export default new ProjectStore()
