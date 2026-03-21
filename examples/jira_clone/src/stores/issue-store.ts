import { Store } from '@geajs/core'
import api from '../utils/api'
import projectStore from './project-store'

class IssueStore extends Store {
  issue: any = null
  isLoading = false

  async fetchIssue(issueId: string): Promise<void> {
    this.isLoading = true
    try {
      const data = await api.get(`/issues/${issueId}`)
      this.issue = data.issue
    } catch (e) {
      console.error('Failed to fetch issue:', e)
    } finally {
      this.isLoading = false
    }
  }

  async updateIssue(fields: any): Promise<void> {
    if (!this.issue) return
    const currentFields = { ...this.issue }
    Object.assign(this.issue, fields)
    projectStore.updateLocalProjectIssues(this.issue.id, fields)
    try {
      await api.put(`/issues/${this.issue.id}`, fields)
    } catch {
      Object.assign(this.issue, currentFields)
      projectStore.updateLocalProjectIssues(this.issue.id, currentFields)
    }
  }

  async createComment(issueId: string, body: string): Promise<void> {
    const data = await api.post('/comments', { issueId, body })
    if (this.issue && data.comment) {
      if (!this.issue.comments) this.issue.comments = []
      this.issue.comments.push(data.comment)
    }
  }

  async updateComment(commentId: string, body: string, issueId: string): Promise<void> {
    await api.put(`/comments/${commentId}`, { body })
    await this.fetchIssue(issueId)
  }

  async deleteComment(commentId: string, issueId: string): Promise<void> {
    await api.delete(`/comments/${commentId}`)
    await this.fetchIssue(issueId)
  }

  clear(): void {
    this.issue = null
    this.isLoading = false
  }
}

export default new IssueStore()
