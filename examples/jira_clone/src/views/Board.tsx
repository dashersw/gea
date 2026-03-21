import { Component } from '@geajs/core'
import projectStore from '../stores/project-store'
import filtersStore from '../stores/filters-store'
import authStore from '../stores/auth-store'
import { IssueStatus } from '../constants/issues'
import { Avatar } from '@geajs/ui'
import Breadcrumbs from '../components/Breadcrumbs'
import BoardColumn from '../components/BoardColumn'

const statusList = [
  { id: IssueStatus.BACKLOG, label: 'Backlog' },
  { id: IssueStatus.SELECTED, label: 'Selected' },
  { id: IssueStatus.INPROGRESS, label: 'In Progress' },
  { id: IssueStatus.DONE, label: 'Done' },
]

function filterIssues(
  issues: any[],
  status: string,
  searchTerm: string,
  userIds: string[],
  myOnly: boolean,
  recentOnly: boolean,
  currentUser: any,
): any[] {
  let result = issues.filter((i: any) => i.status === status)

  if (searchTerm) {
    const term = searchTerm.toLowerCase()
    result = result.filter(
      (i: any) => i.title.toLowerCase().includes(term) || i.description?.toLowerCase().includes(term),
    )
  }

  if (userIds.length > 0) {
    result = result.filter((i: any) => i.userIds.some((uid: string) => userIds.includes(uid)))
  }

  if (myOnly && currentUser) {
    result = result.filter((i: any) => i.userIds.includes(currentUser.id))
  }

  if (recentOnly) {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
    result = result.filter((i: any) => i.updatedAt > threeDaysAgo)
  }

  return result.sort((a: any, b: any) => a.listPosition - b.listPosition)
}

export default class Board extends Component {
  template() {
    const project = projectStore.project
    if (!project) return <div></div>

    return (
      <div class="board">
        <Breadcrumbs items={['Projects', project.name, 'Kanban Board']} />
        <div class="board-header">
          <h1 class="board-header-title">Kanban board</h1>
          <a href="https://github.com/oldboyxx/jira_clone" target="_blank" rel="noreferrer noopener">
            <button class="button button--secondary">
              <i class="icon icon-github" style="margin-right:7px;font-size:18px"></i>Github Repo
            </button>
          </a>
        </div>

        <div class="board-filters">
          <div class="board-filters-search">
            <i class="icon icon-search board-filters-search-icon"></i>
            <input
              type="text"
              placeholder="Search"
              value={filtersStore.searchTerm}
              input={(e: any) => filtersStore.setSearchTerm(e.target.value)}
            />
          </div>
          <div class="board-filters-avatars">
            {project.users.map((user: any) => (
              <div
                key={user.id}
                class={`board-filters-avatar ${filtersStore.userIds.includes(user.id) ? 'active' : ''}`}
                click={() => filtersStore.toggleUserId(user.id)}
              >
                <Avatar src={user.avatarUrl} name={user.name} class="!h-8 !w-8" />
              </div>
            ))}
          </div>
          <button
            class={`board-filters-button ${filtersStore.myOnly ? 'active' : ''}`}
            click={() => filtersStore.toggleMyOnly()}
          >
            Only My Issues
          </button>
          <button
            class={`board-filters-button ${filtersStore.recentOnly ? 'active' : ''}`}
            click={() => filtersStore.toggleRecentOnly()}
          >
            Recently Updated
          </button>
          {!filtersStore.areFiltersCleared && (
            <div class="board-filters-clear" click={() => filtersStore.clearAll()}>
              Clear all
            </div>
          )}
        </div>

        <div class="board-lists">
          {statusList.map((col) => (
            <BoardColumn
              key={col.id}
              status={col.id}
              issues={filterIssues(
                project.issues,
                col.id,
                filtersStore.searchTerm,
                filtersStore.userIds,
                filtersStore.myOnly,
                filtersStore.recentOnly,
                authStore.currentUser,
              )}
            />
          ))}
        </div>
      </div>
    )
  }
}
