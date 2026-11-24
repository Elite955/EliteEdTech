import { api } from '../api/client'
import { playUiSound } from './sound'

function loadRazorpay() {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true)
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => resolve(true)
    script.onerror = () => resolve(false)
    document.body.appendChild(script)
  })
}

export async function startRazorpayCheckout(booking, user, { onSuccess } = {}) {
  const loaded = await loadRazorpay()
  if (!loaded) throw new Error('Could not load the Razorpay checkout. Check your internet connection and try again.')

  const order = await api.post('/payments/order', { booking_id: booking.id })

  // A teacher can set a ₹0 hourly rate; the server confirms the booking without
  // Razorpay, so there is no checkout to open.
  if (order.free) {
    playUiSound('success')
    await onSuccess?.()
    return true
  }

  return new Promise((resolve) => {
    const rzp = new window.Razorpay({
      key: order.key_id,
      amount: order.amount,
      currency: order.currency || 'INR',
      name: 'ELITE Platform',
      description: `One-to-one class · Booking #${booking.id}`,
      order_id: order.order_id,
      prefill: { name: user?.name, email: user?.email },
      theme: { color: '#3b4fd8' },
      modal: { ondismiss: () => resolve(false) },
      handler: async (response) => {
        try {
          await api.post('/payments/verify', {
            booking_id: booking.id,
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
          })
          playUiSound('success')
          await onSuccess?.()
          resolve(true)
        } catch (error) {
          playUiSound('error')
          resolve(error)
        }
      },
    })
    rzp.open()
  })
}
