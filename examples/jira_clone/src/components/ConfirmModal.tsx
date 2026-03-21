import { Component } from '@geajs/core'
import { Dialog, Button } from '@geajs/ui'

export default class ConfirmModal extends Component {
  isOpen = false

  open() {
    this.isOpen = true
  }

  close() {
    this.isOpen = false
  }

  handleConfirm() {
    this.props.onConfirm?.()
    this.close()
  }

  template({ title = 'Confirm', message = 'Are you sure?', confirmText = 'Confirm', cancelText = 'Cancel' }) {
    return (
      <div class="confirm-modal-wrapper">
        <Dialog
          class="[&_button.dialog-trigger]:hidden"
          open={this.isOpen}
          onOpenChange={(d: { open: boolean }) => {
            if (!d.open) this.close()
          }}
          title={title}
          description={message}
          triggerLabel=""
        >
          <div class="confirm-modal-actions flex gap-2 justify-end mt-4">
            <Button variant="default" click={() => this.handleConfirm()}>
              {confirmText}
            </Button>
            <Button variant="ghost" click={() => this.close()}>
              {cancelText}
            </Button>
          </div>
        </Dialog>
      </div>
    )
  }
}
