import { useEffect, useState } from 'react'
import { api } from '../api/client'
import StatusBadge from '../components/StatusBadge'

export default function PaymentHistory() {
  const [payments, setPayments] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    api
      .get('/payments/mine')
      .then((res) => setPayments(res.payments || []))
      .catch((e) => setErr(e.message))
  }, [])

  return (
    <div>
      <h1>Payment history</h1>
      <p className="page-sub">Every Razorpay transaction for your bookings, with receipts.</p>

      {err && <div className="alert error">{err}</div>}

      {payments === null ? (
        <div className="loading">Loading payments…</div>
      ) : payments.length === 0 ? (
        <div className="empty">No payments yet.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Booking</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Payment ID</th>
              <th>Order ID</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p, i) => (
              <tr key={p.provider_transaction_id || i}>
                <td>{p.created_at ? new Date(p.created_at).toLocaleString() : '—'}</td>
                <td>#{p.booking_id}</td>
                <td>₹{p.amount}</td>
                <td>
                  <StatusBadge status={p.status} />
                </td>
                <td style={{ fontSize: 12 }}>{p.provider_transaction_id || '—'}</td>
                <td style={{ fontSize: 12 }}>{p.provider_order_id || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
