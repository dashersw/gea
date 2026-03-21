import { Component, Link } from '@geajs/core'
import projectStore from '../stores/project-store'
import api from '../utils/api'
import { sortByNewest } from '../utils/javascript'
import Icon from '../components/Icon'
import IssueTypeIcon from '../components/IssueTypeIcon'
import Spinner from '../components/Spinner'

export default class IssueSearch extends Component {
  searchTerm = ''
  matchingIssues: any[] = []
  isLoading = false
  _debounceTimer: any = null

  handleInput(e: any) {
    this.searchTerm = e.target.value
    clearTimeout(this._debounceTimer)
    if (this.searchTerm.trim()) {
      this._debounceTimer = setTimeout(() => this.doSearch(), 300)
    } else {
      this.matchingIssues = []
    }
  }

  async doSearch() {
    this.isLoading = true
    try {
      const data = await api.get('/issues', { searchTerm: this.searchTerm.trim() })
      this.matchingIssues = data || []
    } catch (e) {
      this.matchingIssues = []
    } finally {
      this.isLoading = false
    }
  }

  template({ onClose }) {
    const project = projectStore.project
    const recentIssues = project ? sortByNewest([...project.issues], 'createdAt').slice(0, 10) : []

    const isSearchEmpty = !this.searchTerm.trim()

    return (
      <div class="issue-search">
        <div class="issue-search-input-cont">
          <Icon type="search" size={22} />
          <input
            class="issue-search-input"
            type="text"
            autofocus
            placeholder="Search issues by summary, description..."
            value={this.searchTerm}
            input={(e: any) => this.handleInput(e)}
          />
          {this.isLoading && <Spinner size={20} />}
        </div>

        {isSearchEmpty && recentIssues.length > 0 && (
          <div class="issue-search-section">
            <div class="issue-search-section-title">Recent Issues</div>
            {recentIssues.map((issue: any) => (
              <div key={issue.id}>
                <Link to={`/project/board/issues/${issue.id}`} class="issue-search-item" onNavigate={() => onClose?.()}>
                  <IssueTypeIcon type={issue.type} size={22} />
                  <div class="issue-search-item-data">
                    <div class="issue-search-item-title">{issue.title}</div>
                    <div class="issue-search-item-id">
                      {issue.type}-{issue.id}
                    </div>
                  </div>
                </Link>
              </div>
            ))}
          </div>
        )}

        {!isSearchEmpty && this.matchingIssues.length > 0 && (
          <div class="issue-search-section">
            <div class="issue-search-section-title">Matching Issues</div>
            {this.matchingIssues.map((issue: any) => (
              <div key={issue.id}>
                <Link to={`/project/board/issues/${issue.id}`} class="issue-search-item" onNavigate={() => onClose?.()}>
                  <IssueTypeIcon type={issue.type} size={22} />
                  <div class="issue-search-item-data">
                    <div class="issue-search-item-title">{issue.title}</div>
                    <div class="issue-search-item-id">
                      {issue.type}-{issue.id}
                    </div>
                  </div>
                </Link>
              </div>
            ))}
          </div>
        )}

        {!isSearchEmpty && !this.isLoading && this.matchingIssues.length === 0 && (
          <div class="issue-search-no-results">
            <p class="issue-search-no-results-title">We couldn't find anything matching your search</p>
            <p class="issue-search-no-results-tip">Try again with a different term.</p>
          </div>
        )}
      </div>
    )
  }
}
