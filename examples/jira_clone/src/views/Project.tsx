import { Component, Outlet } from '@geajs/core'
import { Dialog } from '@geajs/ui'
import { router } from '../router'
import issueStore from '../stores/issue-store'
import NavbarLeft from './NavbarLeft'
import Sidebar from './Sidebar'
import IssueDetails from './IssueDetails'
import IssueCreate from './IssueCreate'
import IssueSearch from './IssueSearch'

export default class Project extends Component {
  searchModalOpen = false
  createModalOpen = false

  get issueId(): string {
    return router.params.issueId || ''
  }

  get showIssueDetail(): boolean {
    return !!this.issueId
  }

  closeIssueDetail() {
    issueStore.clear()
    router.push('/project/board')
  }

  closeSearchModal() {
    this.searchModalOpen = false
  }

  closeCreateModal() {
    this.createModalOpen = false
  }

  template() {
    return (
      <div class="project-page">
        <NavbarLeft
          onSearchClick={() => {
            this.searchModalOpen = true
          }}
          onCreateClick={() => {
            this.createModalOpen = true
          }}
        />
        <Sidebar />

        <div class="page-content">
          <Outlet />
        </div>

        {this.showIssueDetail && (
          <Dialog
            open={true}
            onOpenChange={(d: any) => {
              if (!d.open) this.closeIssueDetail()
            }}
            class="dialog-issue-detail"
          >
            <IssueDetails issueId={this.issueId} onClose={() => this.closeIssueDetail()} />
          </Dialog>
        )}

        {this.searchModalOpen && (
          <Dialog
            open={true}
            onOpenChange={(d: any) => {
              if (!d.open) this.closeSearchModal()
            }}
            class="dialog-search"
          >
            <IssueSearch onClose={() => this.closeSearchModal()} />
          </Dialog>
        )}

        {this.createModalOpen && (
          <Dialog
            open={true}
            onOpenChange={(d: any) => {
              if (!d.open) this.closeCreateModal()
            }}
            class="dialog-create"
          >
            <IssueCreate onClose={() => this.closeCreateModal()} />
          </Dialog>
        )}
      </div>
    )
  }
}
