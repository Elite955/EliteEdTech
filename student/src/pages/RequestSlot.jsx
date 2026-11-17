import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/client'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function toMinutes(t) {
  const [h, m] = String(t).split(':').map(Number)
  return h * 60 + m
}

function fmt(mins) {
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
}

function dayIndex(day) {
  if (typeof day === 'number') return day
  return DAYS.indexOf(String(day).slice(0, 3))
}

export default function RequestSlot() {
  const { teacherId } = useParams()
  const [teacher, setTeacher] = useState(null)
  const [date, setDate] = useState('')
  const [start, setStart] = useState('')
  const [duration, setDuration] = useState(0)
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api
      .get(`/teachers/${teacherId}`)
      .then((res) => {
        const t = res.teacher ?? res
        setTeacher(t)
        const availableDays = new Set((t.availability || []).map((a) => dayIndex(a.day)))
        const now = new Date()
        for (let i = 0; i < 7; i += 1) {
          const probe = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i)
          if (availableDays.has(probe.getDay())) {
            setDate(`${probe.getFullYear()}-${String(probe.getMonth() + 1).padStart(2, '0')}-${String(probe.getDate()).padStart(2, '0')}`)
            break
          }
        }
      })
      .catch((e) => setErr(e.message))
  }, [teacherId])

  const weekday = useMemo(
    () => (date ? new Date(`${date}T00:00:00`).getDay() : -1),
    [date]
  )
  const dayWindows = useMemo(
    () => (teacher?.availability || []).filter((a) => dayIndex(a.day) === weekday),
    [teacher, weekday]
  )
  const starts = useMemo(() => {
    const out = []
    for (const a of dayWindows) {
      for (let t = toMinutes(a.start); t + 30 <= toMinutes(a.end); t += 30) {
        out.push({ window: a, value: fmt(t) })
      }
    }
    return out
  }, [dayWindows])

  const chosenWindow = starts.find((s) => s.value === start)?.window
  const durations = useMemo(() => {
    if (!start || !chosenWindow) return []
    const room = toMinutes(chosenWindow.end) - toMinutes(start)
    return [30, 60, 90, 120].filter((d) => d <= room)
  }, [start, chosenWindow])

  useEffect(() => {
    if (start && durations.length && !durations.includes(duration)) {
      setDuration(durations.includes(60) ? 60 : durations[0])
    }
  }, [durations, duration, start])

  const hours = duration / 60
  const slot = start && duration ? { start, end: fmt(toMinutes(start) + duration) } : null
  const today = new Date().toISOString().slice(0, 10)

  async function submit(e) {
    e.preventDefault()
    if (!slot) return
    setBusy(true)
    setErr('')
    try {
      const res = await api.post('/bookings', {
        teacher_id: teacherId,
        date,
        start_time: slot.start,
        end_time: slot.end
      })
      const booking = res.booking || {}
      setNote(
        `Request sent! Booking #${booking.id} is pending teacher approval. ` +
          `Amount: â‚¹${booking.amount} for ${hours} hour${hours === 1 ? '' : 's'} (${slot.start}â€“${slot.end}).`
      )
      setStart('')
      setDuration(0)
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (err && !teacher) {
    return (
      <div>
        <h1>Request a slot</h1>
        <div className="alert error">{err}</div>
        <Link className="link" to="/teachers">â† Back to teachers</Link>
      </div>
    )
  }

  return (
    <div>
      <h1>Request a slot</h1>
      <p className="page-sub">
        {teacher
          ? `With ${teacher.name} â€” â‚¹${teacher.hourly_rate}/hour. The platform computes the final amount from the teacher's rate; it is confirmed on approval.`
          : 'Loading teacherâ€¦'}
      </p>

      {err && <div className="alert error">{err}</div>}
      {note && (
        <div className="alert success">
          {note} <Link className="link" to="/bookings">Track it in My Bookings â†’</Link>
        </div>
      )}

      <div className="card" style={{ maxWidth: 620 }}>
        <div className="field">
          <label htmlFor="date">Class date</label>
          <input
            id="date"
            type="date"
            min={today}
            required
            value={date}
            onChange={(e) => {
              setDate(e.target.value)
              setStart('')
              setDuration(0)
            }}
          />
        </div>

        {date && dayWindows.length === 0 && (
          <p className="muted">The teacher has no availability on this weekday. Try another date.</p>
        )}

        {date && starts.length > 0 && (
          <>
            <div className="field">
              <label htmlFor="start">Start time ({DAYS[weekday]})</label>
              <select
                id="start"
                required
                value={start}
                onChange={(e) => {
                  setStart(e.target.value)
                  setDuration(0)
                }}
              >
                <option value="">Choose a start timeâ€¦</option>
                {starts.map((s, i) => (
                  <option key={i} value={s.value}>
                    {s.value} â€” window {s.window.start}â€“{s.window.end}
                  </option>
                ))}
              </select>
            </div>

            {start && (
              <div className="field">
                <label htmlFor="duration">Session length</label>
                <select
                  id="duration"
                  required
                  value={duration || ''}
                  onChange={(e) => setDuration(Number(e.target.value))}
                >
                  <option value="">Choose a lengthâ€¦</option>
                  {durations.map((d) => (
                    <option key={d} value={d}>{d} minutes</option>
                  ))}
                </select>
              </div>
            )}
          </>
        )}

        {slot && (
          <p className="muted" style={{ marginBottom: 10 }}>
            Selected: {DAYS[weekday]} {slot.start}â€“{slot.end} ({hours} hour{hours === 1 ? '' : 's'}) â€”
            estimated â‚¹{((hours * (teacher?.hourly_rate || 0)) * 100 / 100).toFixed(2)}
          </p>
        )}

        <form onSubmit={submit}>
          <button className="btn" disabled={!slot || busy}>
            {busy ? 'Sendingâ€¦' : 'Request this timing'}
          </button>
        </form>
        <p className="muted" style={{ marginTop: 12 }}>
          Your request goes to the teacher's booking queue. Once approved, you pay via Razorpay
          from <Link className="link" to="/bookings">My Bookings</Link>.
        </p>
      </div>
    </div>
  )
}
