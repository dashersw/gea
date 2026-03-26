import { Component, router } from '@geajs/core'
import { Badge, Button, Input, Label, Separator, Textarea, Toaster, ToastStore } from '@geajs/ui'
import store, { LABEL_COLORS } from './store'
import type { Folder, Label as LabelType } from './store'
import EmailRow from './email-row'
import EmailDetail from './email-detail'

const VALID_FOLDERS = ['inbox', 'sent', 'drafts', 'trash']

export default class App extends Component {
  created() {
    // Set up routes for folder navigation
    router.setRoutes({
      '/': App,
      '/:folder': App,
    })

    // Sync router path to store folder
    router.observe('path', () => {
      const folder = router.params.folder
      if (folder && VALID_FOLDERS.includes(folder) && folder !== store.activeFolder) {
        store.selectFolder(folder as Folder)
      }
    })

    // Sync initial path
    const folder = router.params.folder
    if (folder && VALID_FOLDERS.includes(folder)) {
      store.selectFolder(folder as Folder)
    }
  }

  template() {
    const folders: { id: Folder; label: string; icon: string }[] = [
      { id: 'inbox', label: 'Inbox', icon: '📥' },
      { id: 'sent', label: 'Sent', icon: '📤' },
      { id: 'drafts', label: 'Drafts', icon: '📝' },
      { id: 'trash', label: 'Trash', icon: '🗑' },
    ]

    const labels: { id: LabelType; label: string }[] = [
      { id: 'work', label: 'Work' },
      { id: 'personal', label: 'Personal' },
      { id: 'finance', label: 'Finance' },
      { id: 'travel', label: 'Travel' },
    ]

    return (
      <div class="email-layout">
        {/* Sidebar */}
        <aside class="email-sidebar">
          <div class="email-sidebar-header">
            <h1 class="email-brand">✉ Mail</h1>
            <Button size="sm" click={store.openCompose}>
              Compose
            </Button>
          </div>

          <nav class="folder-nav">
            {folders.map((f) => (
              <button
                key={f.id}
                class={`folder-btn ${store.activeFolder === f.id ? 'active' : ''}`}
                click={() => {
                  store.selectFolder(f.id)
                  router.push(`/${f.id}`)
                }}
                data-folder={f.id}
              >
                <span class="folder-icon">{f.icon}</span>
                <span class="folder-label">{f.label}</span>
                {f.id === 'inbox' && store.inboxUnread > 0 && <Badge class="folder-badge">{store.inboxUnread}</Badge>}
                {f.id !== 'inbox' && store.folderCount(f.id) > 0 && (
                  <span class="folder-count">{store.folderCount(f.id)}</span>
                )}
              </button>
            ))}
          </nav>

          <Separator class="my-3" />

          <div class="label-section">
            <p class="label-section-title">Labels</p>
            {labels.map((l) => (
              <button
                key={l.id}
                type="button"
                class={`label-item ${store.activeLabelFilter === l.id ? 'active' : ''}`}
                click={() => store.toggleLabelFilter(l.id)}
                data-label={l.id}
              >
                <span class="label-dot" style={{ background: LABEL_COLORS[l.id] }} />
                <span class="label-name">{l.label}</span>
              </button>
            ))}
          </div>
        </aside>

        {/* Email List */}
        <div class="email-list-panel">
          <div class="email-list-header">
            <h2 class="email-list-title">
              {store.activeFolder.charAt(0).toUpperCase() + store.activeFolder.slice(1)}
              {store.activeLabelFilter && (
                <>
                  {' · '}
                  <span class="email-list-label-filter">
                    {labels.find((x) => x.id === store.activeLabelFilter)?.label}
                  </span>
                </>
              )}
            </h2>
            <Input placeholder="Search…" value={store.searchQuery} onInput={store.setSearch} class="email-search" />
          </div>
          <Separator />
          <div class="email-list">
            {store.folderEmails.length === 0 ? (
              <div class="list-empty">
                <p>
                  {store.searchQuery && store.activeLabelFilter
                    ? 'No emails match your search and label filter.'
                    : store.searchQuery
                      ? 'No emails matching your search.'
                      : store.activeLabelFilter
                        ? 'No emails with this label in this folder.'
                        : 'No emails.'}
                </p>
              </div>
            ) : (
              store.folderEmails.map((email) => <EmailRow key={email.id} email={email} />)
            )}
          </div>
        </div>

        {/* Email Detail */}
        <div class="email-detail-panel">
          <EmailDetail />
        </div>

        {/* Compose Modal */}
        {store.composeOpen && (
          <div class="modal-backdrop" click={store.closeCompose}>
            <div class="modal-box compose-box" click={(e) => e.stopPropagation()}>
              <div class="compose-header">
                <h3 class="modal-title">New Message</h3>
                <button class="modal-close" click={store.closeCompose}>
                  ✕
                </button>
              </div>

              <div class="form-field">
                <Label htmlFor="comp-to">To</Label>
                <Input
                  inputId="comp-to"
                  type="email"
                  placeholder="recipient@example.com"
                  value={store.composeTo}
                  onInput={store.setComposeTo}
                />
              </div>
              <div class="form-field">
                <Label htmlFor="comp-subject">Subject</Label>
                <Input
                  inputId="comp-subject"
                  placeholder="Subject"
                  value={store.composeSubject}
                  onInput={store.setComposeSubject}
                />
              </div>
              <div class="form-field">
                <Textarea
                  placeholder="Write your message…"
                  rows={8}
                  value={store.composeBody}
                  onInput={store.setComposeBody}
                />
              </div>

              <div class="compose-actions">
                <Button variant="outline" size="sm" click={store.closeCompose}>
                  Discard
                </Button>
                <Button
                  size="sm"
                  disabled={!store.composeValid}
                  click={() => {
                    store.sendEmail()
                    ToastStore.success({ title: 'Email sent', description: `Message to ${store.composeTo} sent.` })
                  }}
                >
                  Send
                </Button>
              </div>
            </div>
          </div>
        )}

        <Toaster />
      </div>
    )
  }
}
