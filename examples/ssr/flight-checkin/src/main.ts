import { hydrate } from '../../../../packages/gea-ssr/src/client'
import App from '../../../flight-checkin/src/flight-checkin'
import flightStore from '../../../flight-checkin/src/flight-store'
import optionsStore from '../../../flight-checkin/src/options-store'
import paymentStore from '../../../flight-checkin/src/payment-store'

hydrate(App, document.getElementById('app'), {
  storeRegistry: {
    FlightStore: flightStore,
    OptionsStore: optionsStore,
    PaymentStore: paymentStore,
  },
})
