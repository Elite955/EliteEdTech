import { Link } from 'react-router-dom'

export default function TeacherCard({ teacher }) {
  const preview = (teacher.availability_preview || teacher.availability || []).slice(0, 3)
  return (
    <div className="card teacher-card">
      <h3>{teacher.name}</h3>
      <div className="tags">
        {(teacher.subjects || []).map((s) => (
          <span key={s} className="tag">
            {s}
          </span>
        ))}
      </div>
      <p className="muted">{teacher.bio}</p>
      <div className="rate">₹{teacher.hourly_rate} / hour</div>
      <div className="avail">
        {preview.length ? (
          preview.map((a, i) => (
            <span key={i} className="chip">
              {a.day} · {a.start}–{a.end}
            </span>
          ))
        ) : (
          <span className="muted">No availability posted yet</span>
        )}
      </div>
      <Link className="btn" to={`/request/${teacher.id}`}>
        Request slot
      </Link>
    </div>
  )
}
