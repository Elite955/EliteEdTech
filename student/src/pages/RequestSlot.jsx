import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { playUiSound } from '../lib/sound'
import {
  WEEKDAYS_SHORT,
  formatFullDate,
  fromDateInput,
  toDateInput,
  weekdayIndex,
} from '../lib/dates'

function toMinutes(t) {
  const [h, m] = String(t).split(':').map(Number)
  return h * 60 + m
}

function fmt(mins) {
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
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
    let firstLoad = true
    const load = () => {
      api
        .get(`/teachers/${teacherId}`)
        .then((res) => {
          const t = res.teacher ?? res
          setTeacher(t)
          if (firstLoad) {
            firstLoad = false
            const availableDays = new Set((t.availability || []).map((a) => weekdayIndex(a.day)))
            const now = new Date()
            for (let i = 0; i < 7; i += 1) {
              const probe = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i)
              if (availableDays.has(probe.getDay())) {
                setDate(`${probe.getFullYear()}-${String(probe.getMonth() + 1).padStart(2, '0')}-${String(probe.getDate()).padStart(2, '0')}`)
                break
              }
            }
          }
        })
        .catch((e) => setErr(e.message))
    }
    load()
    const interval = window.setInterval(load, 5000)
    return () => window.clearInterval(interval)
  }, [teacherId])

  const weekday = useMemo(
    () => (date ? (fromDateInput(date)?.getDay() ?? -1) : -1),
    [date]
  )
  const dayWindows = useMemo(
    () => (teacher?.availability || []).filter((a) => weekdayIndex(a.day) === weekday),
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

  const availableDates = useMemo(() => {
    if (!teacher?.availability?.length) return []
    const days = new Set(teacher.availability.map((a) => weekdayIndex(a.day)))
    const today = new Date()
    const out = []
    for (let offset = 0; offset < 14; offset += 1) {
      const probe = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset)
      if (!days.has(probe.getDay())) continue
      out.push({ value: toDateInput(probe), date: probe })
    }
    return out
  }, [teacher])

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
          `Amount: ₹${booking.amount} for ${hours} hour${hours === 1 ? '' : 's'} (${slot.start}–${slot.end}).`
      )
      setStart('')
      setDuration(0)
      playUiSound('success')
    } catch (e) {
      setErr(e.message)
      playUiSound('error')
    } finally {
      setBusy(false)
    }
  }

  if (err && !teacher) {
    return (
      <div>
        <h1>Request a slot</h1>
        <div className="alert error">{err}</div>
        <Link className="link" to="/teachers">← Back to teachers</Link>
      </div>
    )
  }

  return (
    <div>
      <h1>Request a slot</h1>
      <p className="page-sub">
        {teacher
          ? `With ${teacher.name} — ₹${teacher.hourly_rate}/hour. The platform computes the final amount from the teacher's rate; it is confirmed on approval.`
          : 'Loading teacher…'}
      </p>

      {err && <div className="alert error">{err}</div>}
      {note && (
        <div className="alert success">
          {note} <Link className="link" to="/bookings">Track it in My Bookings →</Link>
        </div>
      )}

      <div className="card" style={{ maxWidth: 620 }}>
        <div className="field">
          <label htmlFor="date">
            Class date{date ? ` — ${formatFullDate(fromDateInput(date))}` : ''}
          </label>
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

        {availableDates.length > 0 && (
          <div className="field">
            <span className="field-label">Quick pick the next available date</span>
            <div className="date-chips">
              {availableDates.map((option) => (
                <button
                  type="button"
                  key={option.value}
                  className={`date-chip${date === option.value ? ' is-active' : ''}`}
                  onClick={() => {
                    setDate(option.value)
                    setStart('')
                    setDuration(0)
                  }}
                >
                  <strong>{option.date.getDate()}</strong>
                  <span>
                    {WEEKDAYS_SHORT[option.date.getDay()]}{' '}
                    {new Intl.DateTimeFormat('en-IN', { month: 'short' }).format(option.date)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {date && dayWindows.length === 0 && (
          <p className="muted">The teacher has no availability on this weekday. Try another date.</p>
        )}

        {date && starts.length > 0 && (
          <>
            <div className="field">
              <label htmlFor="start">Start time ({WEEKDAYS_SHORT[weekday]}{date ? `, ${fromDateInput(date)?.getDate()} ${new Intl.DateTimeFormat("en-IN", { month: "short" }).format(fromDateInput(date))}` : ""})</label>
              <select
                id="start"
                required
                value={start}
                onChange={(e) => {
                  setStart(e.target.value)
                  setDuration(0)
                }}
              >
                <option value="">Choose a start time…</option>
                {starts.map((s, i) => (
                  <option key={i} value={s.value}>
                    {s.value} — window {s.window.start}–{s.window.end}
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
                  <option value="">Choose a length…</option>
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
            Selected: {WEEKDAYS_SHORT[weekday]} {slot.start}–{slot.end} ({hours} hour{hours === 1 ? '' : 's'}) —
            estimated ₹{((hours * (teacher?.hourly_rate || 0)) * 100 / 100).toFixed(2)}
          </p>
        )}

        <form onSubmit={submit}>
          <button className="btn" disabled={!slot || busy}>
            {busy ? 'Sending…' : 'Request this timing'}
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
