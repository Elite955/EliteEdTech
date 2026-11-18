import { Link } from 'react-router-dom'

function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

export default function TeacherCard({ teacher }) {
  const preview = (teacher.availability_preview || teacher.availability || []).slice(0, 3)
  const subjects = teacher.subjects || []

  return (
    <article className="card teacher-card">
      <div className="teacher-card-head">
        <span className="teacher-avatar" aria-hidden="true">{initials(teacher.name)}</span>
        <div className="teacher-identity">
          <h3>{teacher.name}</h3>
          <p className="teacher-rate">
            ₹{teacher.hourly_rate} <span>/ hour</span>
          </p>
        </div>
      </div>

      <div className="tags">
        {subjects.length ? (
          subjects.map((subject) => (
            <span key={subject} className="tag">{subject}</span>
          ))
        ) : (
          <span className="tag tag-quiet">Subject pending</span>
        )}
      </div>

      <p className="teacher-bio">{teacher.bio || 'This teacher is still writing their introduction.'}</p>

      <div className="teacher-avail">
        <span className="teacher-avail-label">Availability</span>
        <div className="avail">
          {preview.length ? (
            preview.map((slot, index) => (
              <span key={index} className="chip">
                {slot.day} · {slot.start}–{slot.end}
              </span>
            ))
          ) : (
            <span className="teacher-avail-empty">No slots posted yet</span>
          )}
        </div>
      </div>

      <Link className="btn teacher-cta" to={`/request/${teacher.id}`}>
        Request a slot
      </Link>
    </article>
  )
}
