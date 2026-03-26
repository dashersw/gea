interface TextInputEvent {
  target: {
    value: string
  }
}

interface PaymentFormProps {
  passengerName: string
  cardNumber: string
  expiry: string
  totalPrice: number
  onPassengerNameChange: (event: TextInputEvent) => void
  onCardNumberChange: (event: TextInputEvent) => void
  onExpiryChange: (event: TextInputEvent) => void
  onPay: () => void
}

export default function PaymentForm({
  passengerName,
  cardNumber,
  expiry,
  totalPrice,
  onPassengerNameChange,
  onCardNumberChange,
  onExpiryChange,
  onPay,
}: PaymentFormProps) {
  const passengerNameValid = passengerName.trim().length >= 2
  const cardNumberValid = cardNumber.replace(/\D/g, '').length === 16
  const expiryValid = /^\d{2}\/\d{2}$/.test(expiry)
  const isValid = passengerNameValid && cardNumberValid && expiryValid
  const showErrors = passengerName !== '' || cardNumber !== '' || expiry !== ''

  return (
    <div class="payment-form" style={{ marginTop: '24px' }}>
      <div class="form-group">
        <input
          value={passengerName}
          input={onPassengerNameChange}
          type="text"
          placeholder="Passenger name"
          class={showErrors && !passengerNameValid ? 'error' : ''}
        />
        {showErrors && !passengerNameValid && <span class="error-msg">At least 2 characters</span>}
      </div>
      <div class="form-group">
        <input
          value={cardNumber}
          input={onCardNumberChange}
          type="text"
          placeholder="Card number (e.g. 4242 4242 4242 4242)"
          class={showErrors && !cardNumberValid ? 'error' : ''}
        />
        {showErrors && !cardNumberValid && <span class="error-msg">16 digits required</span>}
      </div>
      <div class="form-group">
        <input
          value={expiry}
          input={onExpiryChange}
          type="text"
          placeholder="MM/YY"
          class={showErrors && !expiryValid ? 'error' : ''}
        />
        {showErrors && !expiryValid && <span class="error-msg">Format: MM/YY</span>}
      </div>
      <button class="btn btn-primary" disabled={!isValid} click={() => isValid && onPay()}>
        Pay ${totalPrice}
      </button>
    </div>
  )
}
