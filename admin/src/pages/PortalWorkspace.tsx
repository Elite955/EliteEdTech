import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarClock, Check, Clock3, LogOut, Plus, ShieldCheck, Video } from 'lucide-react'
import { useAuth } from '../auth/useAuth'
import { api, getErrorMessage } from '../lib/api'

type Teacher = { id: string; name: string; subjects: string[]; hourly_rate: number | null }
type Slot = { id: string; starts_at: string; ends_at: string }
type Booking = {
  id: string
  status: string
  starts_at: string
  ends_at: string
  teacher_name?: string
  student_name?: string
  amount: number
  session_id?: string | null
  meeting_ready?: boolean
}
type Session = Booking & { session_id: string; meeting_ready: boolean }

function dateLabel(value: string) {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function useCountdown(startsAt: string) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  const remaining = Math.max(0, new Date(startsAt).getTime() - now)
  const totalSeconds = Math.floor(remaining / 1000)
  return {
    ready: remaining === 0,
    label: `${Math.floor(totalSeconds / 3600)}h ${Math.floor((totalSeconds % 3600) / 60)}m ${totalSeconds % 60}s`,
  }
}

function SessionTile({ session, onJoin }: { session: Session; onJoin: (id: string) => void }) {
  const countdown = useCountdown(session.starts_at)
  return (
    <article id={`session-${session.session_id}`} className="portal-session-row">
      <div className="portal-session-icon"><Video size={18} /></div>
      <div className="portal-session-main">
        <strong>{session.teacher_name || session.student_name || 'Class session'}</strong>
        <span>{dateLabel(session.starts_at)} · {session.status}</span>
        {session.status === 'scheduled' && !countdown.ready && (
          <small className="portal-countdown"><Clock3 size={13} /> Session starts in {countdown.label}</small>
        )}
        {session.status === 'scheduled' && !session.meeting_ready && (
          <small className="portal-muted">Meeting link is being prepared. Check again closer to the start time.</small>
        )}
      </div>
      {session.status === 'scheduled' && (
        <button className="primary-button" disabled={!countdown.ready || !session.meeting_ready} onClick={() => onJoin(session.session_id)}>
          <Video size={15} /> Join class
        </button>
      )}
    </article>
  )
}

export function PortalWorkspace({ role }: { role: 'student' | 'teacher' }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [slots, setSlots] = useState<Slot[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [selectedTeacher, setSelectedTeacher] = useState('')
  const [selectedSlot, setSelectedSlot] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [availabilityStart, setAvailabilityStart] = useState('')
  const [availabilityEnd, setAvailabilityEnd] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function loadWorkspace() {
    setError('')
    try {
      if (role === 'student') {
        const [teacherData, bookingData, sessionData] = await Promise.all([
          api<{ teachers: Teacher[] }>('/student/teachers'),
          api<{ bookings: Booking[] }>('/student/bookings'),
          api<{ sessions: Session[] }>('/student/sessions'),
        ])
        setTeachers(teacherData.teachers)
        setBookings(bookingData.bookings)
        setSessions(sessionData.sessions)
      } else {
        const [bookingData, availabilityData] = await Promise.all([
          api<{ bookings: Booking[] }>('/teacher/bookings'),
          api<{ availability: Slot[] }>('/teacher/availability'),
        ])
        setBookings(bookingData.bookings)
        setSlots(availabilityData.availability)
      }
    } catch (loadError) {
      setError(getErrorMessage(loadError))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadWorkspace() }, [role])

  useEffect(() => {
    const sessionId = new URLSearchParams(window.location.search).get('sessionId')
    if (!sessionId) return
    document.getElementById(`session-${sessionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [sessions])

  useEffect(() => {
    if (role !== 'student' || !selectedTeacher || !date) {
      setSlots([])
      return
    }
    let active = true
    setSelectedSlot('')
    void api<{ slots: Slot[] }>(`/student/teachers/${selectedTeacher}/slots?date=${encodeURIComponent(date)}`)
      .then((data) => { if (active) setSlots(data.slots) })
      .catch((loadError: unknown) => { if (active) setError(getErrorMessage(loadError)) })
    return () => { active = false }
  }, [role, selectedTeacher, date])

  async function submitBooking(event: FormEvent) {
    event.preventDefault()
    if (!selectedSlot) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await api('/student/bookings', { method: 'POST', body: JSON.stringify({ availability_id: selectedSlot }) })
      setNotice('Your session request was sent. We’ll email and message you when the teacher responds.')
      setSelectedSlot('')
      await loadWorkspace()
    } catch (submitError) {
      setError(getErrorMessage(submitError))
    } finally {
      setBusy(false)
    }
  }

  async function submitAvailability(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await api('/teacher/availability', {
        method: 'POST',
        body: JSON.stringify({ starts_at: new Date(availabilityStart).toISOString(), ends_at: new Date(availabilityEnd).toISOString() }),
      })
      setNotice('Available time added.')
      setAvailabilityStart('')
      setAvailabilityEnd('')
      await loadWorkspace()
    } catch (submitError) {
      setError(getErrorMessage(submitError))
    } finally {
      setBusy(false)
    }
  }

  async function decideBooking(id: string, action: 'approve' | 'reject') {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await api(`/teacher/bookings/${id}`, { method: 'PATCH', body: JSON.stringify({ action }) })
      setNotice(action === 'approve' ? 'Session approved. The student has been notified.' : 'Booking request declined.')
      await loadWorkspace()
    } catch (actionError) {
      setError(getErrorMessage(actionError))
    } finally {
      setBusy(false)
    }
  }

  async function joinSession(id: string) {
    setBusy(true)
    setError('')
    try {
      const result = await api<{ join_url: string }>(`/student/sessions/${id}/join`, { method: 'POST' })
      window.open(result.join_url, '_blank', 'noopener,noreferrer')
    } catch (joinError) {
      setError(getErrorMessage(joinError))
      await loadWorkspace()
    } finally {
      setBusy(false)
    }
  }

  async function signOut() {
    try {
      await logout()
      navigate('/sign-in', { replace: true })
    } catch (signOutError) {
      setError(getErrorMessage(signOutError))
    }
  }

  return (
    <main className="portal-page">
      <header className="portal-topbar">
        <a className="portal-brand" href={role === 'student' ? '/student/dashboard' : '/teacher/dashboard'}>
          <span className="brand-logo"><span>e</span></span>
          <span><strong>EdTech</strong><small>{role} workspace</small></span>
        </a>
        <button className="secondary-button" onClick={() => void signOut()}><LogOut size={15} /> Sign out</button>
      </header>
      <div className="portal-content">
        <div className="portal-intro">
          <div>
            <p className="eyebrow">{role === 'student' ? 'YOUR LEARNING' : 'YOUR TEACHING'}</p>
            <h1>Welcome, {user?.name}</h1>
            <p>{role === 'student' ? 'Book a time with a teacher and keep your upcoming classes in one place.' : 'Set your available times and respond to incoming session requests.'}</p>
          </div>
          <span className="portal-secure"><ShieldCheck size={15} /> Secure portal</span>
        </div>

        {error && <div role="alert" className="alert alert-error">{error}</div>}
        {notice && <div role="status" className="alert alert-success">{notice}</div>}
        {loading ? <div className="portal-loading">Loading your workspace…</div> : role === 'student' ? (
          <div className="portal-grid">
            <section className="portal-panel">
              <div className="portal-panel-heading"><div><p className="eyebrow">FIND A TIME</p><h2>Book a session</h2></div><CalendarClock size={19} /></div>
              <form className="portal-form" onSubmit={(event) => void submitBooking(event)}>
                <label>Teacher<select required value={selectedTeacher} onChange={(event) => setSelectedTeacher(event.target.value)}><option value="">Choose a teacher</option>{teachers.map((teacher) => <option value={teacher.id} key={teacher.id}>{teacher.name}{teacher.subjects.length ? ` · ${teacher.subjects.join(', ')}` : ''}</option>)}</select></label>
                <label>Date<input type="date" min={new Date().toISOString().slice(0, 10)} value={date} onChange={(event) => setDate(event.target.value)} /></label>
                <label>Available slot<select required value={selectedSlot} onChange={(event) => setSelectedSlot(event.target.value)} disabled={!slots.length}><option value="">{slots.length ? 'Choose a time' : 'No available times for this date'}</option>{slots.map((slot) => <option value={slot.id} key={slot.id}>{new Date(slot.starts_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} – {new Date(slot.ends_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</option>)}</select></label>
                <button className="primary-button" disabled={busy || !selectedSlot}><CalendarClock size={15} /> Request session</button>
              </form>
            </section>
            <section className="portal-panel">
              <div className="portal-panel-heading"><div><p className="eyebrow">UPCOMING</p><h2>My sessions</h2></div><span className="portal-count">{sessions.length}</span></div>
              {sessions.length ? <div className="portal-list">{sessions.map((session) => <SessionTile key={session.session_id} session={session} onJoin={(id) => void joinSession(id)} />)}</div> : <div className="portal-empty">Confirmed sessions will appear here.</div>}
            </section>
            <section className="portal-panel portal-wide">
              <div className="portal-panel-heading"><div><p className="eyebrow">REQUESTS</p><h2>Booking history</h2></div></div>
              {bookings.length ? <div className="portal-list">{bookings.map((booking) => <div className="portal-session-row" key={booking.id}><div className="portal-session-icon"><Clock3 size={17} /></div><div className="portal-session-main"><strong>{booking.teacher_name || 'Teacher'}</strong><span>{dateLabel(booking.starts_at)}</span></div><span className={`portal-status status-${booking.status}`}>{booking.status}</span></div>)}</div> : <div className="portal-empty">Your booking requests will appear here.</div>}
            </section>
          </div>
        ) : (
          <div className="portal-grid">
            <section className="portal-panel">
              <div className="portal-panel-heading"><div><p className="eyebrow">AVAILABILITY</p><h2>Add a time</h2></div><Plus size={19} /></div>
              <form className="portal-form" onSubmit={(event) => void submitAvailability(event)}>
                <label>Starts<input required type="datetime-local" value={availabilityStart} onChange={(event) => setAvailabilityStart(event.target.value)} /></label>
                <label>Ends<input required type="datetime-local" min={availabilityStart || undefined} value={availabilityEnd} onChange={(event) => setAvailabilityEnd(event.target.value)} /></label>
                <button className="primary-button" disabled={busy || !availabilityStart || !availabilityEnd}><Plus size={15} /> Add available time</button>
              </form>
              <div className="portal-list portal-availability">{slots.map((slot) => <div className="portal-session-row" key={slot.id}><div className="portal-session-icon"><CalendarClock size={17} /></div><div className="portal-session-main"><strong>{dateLabel(slot.starts_at)}</strong><span>Until {new Date(slot.ends_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span></div></div>)}{!slots.length && <div className="portal-empty">Your available times will appear here.</div>}</div>
            </section>
            <section className="portal-panel">
              <div className="portal-panel-heading"><div><p className="eyebrow">BOOKING QUEUE</p><h2>Requests</h2></div><span className="portal-count">{bookings.filter((booking) => booking.status === 'pending').length}</span></div>
              {bookings.length ? <div className="portal-list">{bookings.map((booking) => <div className="portal-session-row" key={booking.id}><div className="portal-session-icon"><Clock3 size={17} /></div><div className="portal-session-main"><strong>{booking.student_name || 'Student'}</strong><span>{dateLabel(booking.starts_at)} · {booking.status}</span></div>{booking.status === 'pending' && <div className="portal-actions"><button className="table-action" disabled={busy} title="Approve request" onClick={() => void decideBooking(booking.id, 'approve')}><Check size={14} /></button><button className="table-action danger-action" disabled={busy} title="Decline request" onClick={() => void decideBooking(booking.id, 'reject')}>Decline</button></div>}</div>)}</div> : <div className="portal-empty">New booking requests will appear here.</div>}
            </section>
          </div>
        )}
      </div>
    </main>
  )
}