import { handleRequest } from '../../../packages/gea-ssr/src/handle-request'
import App from '../../flight-checkin/src/flight-checkin'
import flightStore from '../../flight-checkin/src/flight-store'
import optionsStore from '../../flight-checkin/src/options-store'
import paymentStore from '../../flight-checkin/src/payment-store'

export default handleRequest(App, {
  storeRegistry: {
    FlightStore: flightStore,
    OptionsStore: optionsStore,
    PaymentStore: paymentStore,
  },
})
