import { Component } from '@geajs/core'
import { Avatar, Badge, Button, Separator, ToastStore } from '@geajs/ui'
import store, { LABEL_COLORS } from './store'

export default class EmailDetail extends Component {
  template() {
    const email = store.activeEmail
    if (!email) {
      return (
        <div class="email-empty">
          <p>Select an email to read</p>
        </div>
      )
    }

    return (
      <div class="email-detail">
        <div class="detail-header">
          <h2 class="detail-subject">{email.subject}</h2>
          <div class="detail-actions">
            <Button
              variant="ghost"
              size="sm"
              click={() => {
                store.openCompose()
                store.composeTo = email.fromEmail
                store.composeSubject = `Re: ${email.subject}`
              }}
            >
              Reply
            </Button>
            <Button
              variant="ghost"
              size="sm"
              click={() => {
                store.deleteEmail(email.id)
                ToastStore.success({ title: 'Deleted', description: 'Email moved to trash.' })
              }}
            >
              Delete
            </Button>
          </div>
        </div>

        <div class="detail-meta">
          <Avatar name={email.from} />
          <div class="detail-sender-info">
            <p class="detail-sender-name">{email.from}</p>
            <p class="detail-sender-email">{email.fromEmail}</p>
          </div>
          <span class="detail-date">{new Date(email.date).toLocaleString()}</span>
        </div>

        <div class="detail-labels">
          {email.labels.map((l) => (
            <Badge key={l} variant="outline" style={{ color: LABEL_COLORS[l], borderColor: `${LABEL_COLORS[l]}40` }}>
              {l}
            </Badge>
          ))}
        </div>

        <Separator />

        <div class="detail-body">
          <pre class="email-body-text">{email.body}</pre>
        </div>
      </div>
    )
  }
}
