import { Component } from '@geajs/core'
import type { BoardingPass as BoardingPassData } from '../shared/flight-data'

interface BoardingPassProps {
  boardingPass: BoardingPassData
  onStartOver: () => void
}

export default class BoardingPass extends Component {
  declare props: BoardingPassProps
  copyTimeout?: ReturnType<typeof setTimeout>
  copiedConfirmationCode = false

  copyConfirmationCode(code: string): void {
    if (!code) return

    navigator.clipboard
      ?.writeText(code)
      .then(() => {
        this.copiedConfirmationCode = true
        if (this.copyTimeout) clearTimeout(this.copyTimeout)
        this.copyTimeout = setTimeout(() => {
          this.copiedConfirmationCode = false
        }, 2000)
      })
      .catch(() => {})
  }

  template({ boardingPass, onStartOver }: BoardingPassProps) {
    const copied = this.copiedConfirmationCode

    return (
      <section class="section-card">
        <div class="success-message">✓ Check-in complete!</div>
        <div class="boarding-pass">
          <div class="boarding-pass-header">
            <span class="flight-route">
              {boardingPass.departure} → {boardingPass.arrival}
            </span>
            <div class="confirmation-actions">
              <span class="confirmation-code">{boardingPass.confirmationCode}</span>
              <button
                class={`confirmation-copy-button${copied ? ' copied' : ''}`}
                title={copied ? 'Confirmation code copied' : 'Copy confirmation code'}
                click={() => this.copyConfirmationCode(boardingPass.confirmationCode)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  {copied ? (
                    <path d="M9.55 17.2L4.8 12.45l1.4-1.4 3.35 3.35 8.25-8.25 1.4 1.4z" fill="currentColor" />
                  ) : (
                    <path
                      d="M16 1H6a2 2 0 00-2 2v12h2V3h10zm3 4H10a2 2 0 00-2 2v14a2 2 0 002 2h9a2 2 0 002-2V7a2 2 0 00-2-2m0 16H10V7h9z"
                      fill="currentColor"
                    />
                  )}
                </svg>
              </button>
            </div>
          </div>
          <div class="boarding-pass-details">
            <div class="boarding-pass-item">
              <span class="label">Passenger</span>
              <span class="value">{boardingPass.passengerName}</span>
            </div>
            <div class="boarding-pass-item">
              <span class="label">Flight</span>
              <span class="value">{boardingPass.flightNumber}</span>
            </div>
            <div class="boarding-pass-item">
              <span class="label">Seat</span>
              <span class="value">{boardingPass.seat}</span>
            </div>
            <div class="boarding-pass-item">
              <span class="label">Gate</span>
              <span class="value">{boardingPass.gate}</span>
            </div>
            <div class="boarding-pass-item">
              <span class="label">Boarding</span>
              <span class="value">Group {boardingPass.boardingGroup}</span>
            </div>
            <div class="boarding-pass-item">
              <span class="label">Departure</span>
              <span class="value">{boardingPass.departureTime}</span>
            </div>
          </div>
        </div>
        <div class="nav-buttons" style={{ marginTop: '24px' }}>
          <button class="btn btn-primary" click={onStartOver}>
            New Check-in
          </button>
        </div>
      </section>
    )
  }
}
