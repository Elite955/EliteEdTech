import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { playUiSound } from '../lib/sound'
import StatusBadge from '../components/StatusBadge'
import CompletionEffect from '../components/CompletionEffect'

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

export default function MyBookings() {
  const { user } = useAuth()
  const [bookings, setBookings] = useState(null)
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')
  const [payingId, setPayingId] = useState(null)

  const load = () =>
    api
      .get('/bookings/mine')
      .then((res) => setBookings(res.bookings || []))
      .catch((e) => setErr(e.message))

  useEffect(() => {
    load()
  }, [])

  async function payNow(booking) {
    setPayingId(booking.id)
    setErr('')
    setNote('')
    try {
      const ok = await loadRazorpay()
      if (!ok) throw new Error('Could not load the Razorpay checkout. Check your internet connection and try again.')
      const order = await api.post('/payments/order', { booking_id: booking.id })
      const rzp = new window.Razorpay({
        key: order.key_id,
        amount: order.amount,
        currency: order.currency || 'INR',
        name: 'EDTECH Platform',
        description: `One-to-one class · Booking #${booking.id}`,
        order_id: order.order_id,
        prefill: { name: user?.name, email: user?.email },
        theme: { color: '#2563eb' },
        handler: async (resp) => {
          try {
            await api.post('/payments/verify', {
              booking_id: booking.id,
              razorpay_order_id: resp.razorpay_order_id,
              razorpay_payment_id: resp.razorpay_payment_id,
              razorpay_signature: resp.razorpay_signature
            })
            setNote(`Payment successful — booking #${booking.id} is confirmed. See it under Sessions once scheduled.`)
            playUiSound('success')
            load()
          } catch (e) {
            setErr(`Payment verification failed: ${e.message}`)
            playUiSound('error')
            load()
          }
        }
      })
      rzp.open()
    } catch (e) {
      setErr(e.message)
      playUiSound('error')
    } finally {
      setPayingId(null)
    }
  }

  return (
    <div>
      <h1>My bookings</h1>
      <p className="page-sub">Track every request from pending approval to completed class.</p>

      {err && <div className="alert error">{err}</div>}
      {note && <div className="alert success">{note}</div>}

      {bookings === null ? (
        <div className="loading">Loading bookings…</div>
      ) : bookings.length === 0 ? (
        <div className="card empty">
          No bookings yet. <Link className="link" to="/teachers">Browse teachers</Link> to request your first slot.
        </div>
      ) : (
        <div className="slist">
          {bookings.map((b) => (
            <div key={b.id} className="card session-card">
              {b.status === 'completed' && (
                <CompletionEffect bookingId={b.id} detail={`Your session with ${b.teacher?.name || 'your teacher'} is complete.`} />
              )}
              <div className="spread">
                <div>
                  <strong>{b.teacher?.name || 'Teacher'}</strong> <StatusBadge status={b.status} />
                  <div className="muted" style={{ marginTop: 6 }}>
                    {b.date} · {b.start_time}–{b.end_time}
                    {b.amount != null && <> · ₹{b.amount}</>}
                  </div>
                </div>
                <div className="row">
                  {b.status === 'pending' && <span className="muted">Waiting for teacher approval</span>}
                  {b.status === 'rejected' && <span className="muted">The teacher declined this request</span>}
                  {b.status === 'approved' && (
                    <button className="btn small" disabled={payingId === b.id} onClick={() => payNow(b)}>
                      {payingId === b.id ? 'Opening checkout…' : 'Pay now'}
                    </button>
                  )}
                  {b.status === 'paid' && <span className="muted">Paid — class confirmed</span>}
                  {b.status === 'completed' && (
                    <Link className="btn small ghost" to={`/feedback?booking=${b.id}`}>
                      Leave feedback
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
