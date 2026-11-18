import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import StatusBadge from '../components/StatusBadge'
import { playUiSound } from '../lib/sound'

export default function Feedback() {
  const [params] = useSearchParams()
  const [bookings, setBookings] = useState(null)
  const [mine, setMine] = useState([])
  const [bookingId, setBookingId] = useState(params.get('booking') || '')
  const [rating, setRating] = useState(0)
  const [text, setText] = useState('')
  const [allowDisplay, setAllowDisplay] = useState(true)
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    Promise.all([api.get('/bookings/mine'), api.get('/feedback/mine')])
      .then(([b, f]) => {
        setBookings(b.bookings || [])
        setMine(f.feedback || [])
      })
      .catch((e) => setErr(e.message))
  }, [])

  const doneBookings = (bookings || []).filter((b) => b.status === 'completed')
  const submitted = new Set(mine.map((f) => String(f.booking_id)))
  const eligible = doneBookings.filter((b) => !submitted.has(String(b.id)))

  useEffect(() => {
    const wanted = params.get('booking')
    if (wanted && bookings && doneBookings.some((b) => String(b.id) === wanted) && !submitted.has(wanted)) {
      setBookingId(wanted)
    }
  }, [bookings])

  async function submit(e) {
    e.preventDefault()
    if (!bookingId || !rating) {
      setErr('Pick a completed class and a star rating first.')
      return
    }
    setBusy(true)
    setErr('')
    setNote('')
    try {
      await api.post('/feedback', {
        booking_id: bookingId,
        rating,
        testimony_text: text.trim(),
        allow_display: allowDisplay
      })
      setNote('Thank you! Your testimony was submitted.')
      setRating(0)
      setText('')
      const f = await api.get('/feedback/mine')
      setMine(f.feedback || [])
      playUiSound('success')
    } catch (e) {
      setErr(e.message)
      playUiSound('error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <h1>Testimony & feedback</h1>
      <p className="page-sub">Rate a completed one-to-one class and share your experience.</p>

      {err && <div className="alert error">{err}</div>}
      {note && <div className="alert success">{note}</div>}

      <div className="grid2" style={{ alignItems: 'start' }}>
        <div className="card">
          <h2>Submit feedback</h2>
          {eligible.length === 0 ? (
            <p className="muted">
              No completed classes are waiting for feedback yet. Feedback opens after a class status
              becomes “completed”.
            </p>
          ) : (
            <form onSubmit={submit}>
              <div className="field">
                <label htmlFor="bk">Class</label>
                <select id="bk" value={bookingId} onChange={(e) => setBookingId(e.target.value)} required>
                  <option value="">Select a completed class…</option>
                  {eligible.map((b) => (
                    <option key={b.id} value={b.id}>
                      #{b.id} · {b.teacher?.name || 'Teacher'} · {b.date} {b.start_time}–{b.end_time}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Rating</label>
                <div className="stars">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" className={`star ${n <= rating ? 'on' : ''}`} onClick={() => setRating(n)}>
                      ★
                    </button>
                  ))}
                </div>
              </div>
              <div className="field">
                <label htmlFor="tst">Your testimony</label>
                <textarea
                  id="tst"
                  rows={4}
                  maxLength={600}
                  placeholder="How was the class?"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              </div>
              <label className="checkbox">
                <input type="checkbox" checked={allowDisplay} onChange={(e) => setAllowDisplay(e.target.checked)} />
                Allow my testimony to be shown on the platform's promotional page
              </label>
              <button className="btn" disabled={busy}>
                {busy ? 'Submitting…' : 'Submit feedback'}
              </button>
            </form>
          )}
        </div>

        <div className="card">
          <h2>Your submitted feedback</h2>
          {mine.length === 0 ? (
            <p className="muted">Nothing submitted yet.</p>
          ) : (
            <div className="slist">
              {mine.map((f) => {
                const b = doneBookings.find((x) => String(x.id) === String(f.booking_id))
                return (
                  <div key={f.booking_id}>
                    <div className="row">
                      <span style={{ color: '#f59e0b' }}>{'★'.repeat(f.rating)}{'☆'.repeat(5 - f.rating)}</span>
                      {b && <StatusBadge status={b.status} />}
                    </div>
                    <p className="muted" style={{ marginTop: 4 }}>
                      {f.testimony_text || '—'} {f.allow_display ? '· shown on promo page' : ''}
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
