import { useEffect, useState } from 'react'
import { api, apiUrl } from '../api/client'
import StatusBadge from '../components/StatusBadge'

export default function PaymentHistory() {
  const [payments, setPayments] = useState(null)
  const [err, setErr] = useState('')
  const [downloading, setDownloading] = useState('')

  async function downloadReceipt(payment) {
    setDownloading(payment.id)
    setErr('')
    try {
      const res = await fetch(apiUrl(`/payments/${payment.id}/receipt`), { credentials: 'include' })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error || `Receipt download failed (${res.status})`)
      }
      const url = URL.createObjectURL(await res.blob())
      const link = document.createElement('a')
      link.href = url
      link.download = `ELITE-receipt-${payment.id.slice(0, 8)}.pdf`
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 0)
    } catch (e) {
      setErr(e.message)
    } finally {
      setDownloading('')
    }
  }

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
              <th>Receipt</th>
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
                <td>
                  <button
                    type="button"
                    className="btn"
                    disabled={downloading === p.id}
                    onClick={() => downloadReceipt(p)}
                  >
                    {downloading === p.id ? 'Preparing…' : 'Download PDF'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
