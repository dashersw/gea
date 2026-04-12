import { Component } from '@geajs/core'
import BoardingPass from './components/BoardingPass'
import OptionStep from './components/OptionStep'
import SummaryStep from './components/SummaryStep'
import store from './flight-store'
import optionsStore from './options-store'
import paymentStore from './payment-store'
import { BASE_TICKET_PRICE, FLIGHT_INFO, LUGGAGE_OPTIONS, MEAL_OPTIONS, SEAT_OPTIONS } from './shared/flight-data'

type LuggageId = (typeof LUGGAGE_OPTIONS)[number]['id']
type SeatId = (typeof SEAT_OPTIONS)[number]['id']
type MealId = (typeof MEAL_OPTIONS)[number]['id']

export default class FlightCheckin extends Component {
  template() {
    const { step } = store
    const { luggage, seat, meal } = optionsStore
    const { passengerName, cardNumber, expiry, paymentComplete } = paymentStore
    const bp = store.boardingPass

    return (
      <div class="flight-checkin">
        <h1>Flight Check-in</h1>
        <h2>
          {FLIGHT_INFO.departure} → {FLIGHT_INFO.arrival} · {FLIGHT_INFO.date}
        </h2>
        {step === 1 && (
          <OptionStep
            stepNumber={1}
            title="Select Luggage"
            options={LUGGAGE_OPTIONS}
            selectedId={luggage}
            showBack={false}
            nextLabel="Continue"
            onSelect={(id: string) => optionsStore.setLuggage(id as LuggageId)}
            onContinue={() => store.setStep(2)}
          />
        )}

        {step === 2 && (
          <OptionStep
            stepNumber={2}
            title="Select Seat"
            options={SEAT_OPTIONS}
            selectedId={seat}
            showBack={true}
            nextLabel="Continue"
            onSelect={(id: string) => optionsStore.setSeat(id as SeatId)}
            onBack={() => store.setStep(1)}
            onContinue={() => store.setStep(3)}
          />
        )}

        {step === 3 && (
          <OptionStep
            stepNumber={3}
            title="Select Meal"
            options={MEAL_OPTIONS}
            selectedId={meal}
            showBack={true}
            nextLabel="Review & Pay"
            onSelect={(id: string) => optionsStore.setMeal(id as MealId)}
            onBack={() => store.setStep(2)}
            onContinue={() => store.setStep(4)}
          />
        )}

        {step === 4 && (
          <SummaryStep
            basePrice={BASE_TICKET_PRICE}
            luggagePrice={optionsStore.luggagePrice}
            seatPrice={optionsStore.seatPrice}
            mealPrice={optionsStore.mealPrice}
            totalPrice={BASE_TICKET_PRICE + optionsStore.luggagePrice + optionsStore.seatPrice + optionsStore.mealPrice}
            paymentComplete={paymentComplete}
            passengerName={passengerName}
            cardNumber={cardNumber}
            expiry={expiry}
            onPassengerNameChange={(e: Event) => paymentStore.setPassengerName(e)}
            onCardNumberChange={(e: Event) => paymentStore.setCardNumber(e)}
            onExpiryChange={(e: Event) => paymentStore.setExpiry(e)}
            onPay={() => paymentStore.processPayment()}
            onBack={() => store.setStep(3)}
            onViewBoardingPass={() => store.setStep(5)}
          />
        )}

        {step === 5 && bp && <BoardingPass boardingPass={bp} onStartOver={() => store.startOver()} />}
      </div>
    )
  }
}
