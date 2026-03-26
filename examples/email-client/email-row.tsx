import { Component } from '@geajs/core'
import { Avatar } from '@geajs/ui'
import store, { LABEL_COLORS } from './store'
import type { Email } from './store'

function formatDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 86400000) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export default class EmailRow extends Component {
  declare props: { email: Email }

  template({ email }: { email: Email }) {
    const isActive = store.activeEmailId === email.id

    return (
      <div
        class={`email-row ${!email.read ? 'unread' : ''} ${isActive ? 'active' : ''}`}
        click={() => store.selectEmail(email.id)}
        data-email-id={email.id}
      >
        <div class="email-row-left">
          <Avatar name={email.from} />
        </div>
        <div class="email-row-content">
          <div class="email-row-top">
            <span class="email-sender">{email.from}</span>
            <span class="email-date">{formatDate(email.date)}</span>
          </div>
          <p class="email-subject">{email.subject}</p>
          <p class="email-preview">{email.preview}</p>
          <div class="email-tags">
            {(email.labels || []).map((l) => (
              <span key={l} class="email-label" style={{ background: `${LABEL_COLORS[l]}22`, color: LABEL_COLORS[l] }}>
                {l}
              </span>
            ))}
          </div>
        </div>
        <div class="email-row-actions">
          <button
            class={`star-btn ${email.starred ? 'starred' : ''}`}
            click={(e: Event) => {
              e.stopPropagation()
              store.toggleStar(email.id)
            }}
            aria-label={email.starred ? 'Unstar' : 'Star'}
          >
            ★
          </button>
        </div>
      </div>
    )
  }
}
