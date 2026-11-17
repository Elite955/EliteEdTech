import { useEffect, useState } from 'react'
import { api } from '../api/client'
import TeacherCard from '../components/TeacherCard'

export default function BrowseTeachers() {
  const [teachers, setTeachers] = useState(null)
  const [query, setQuery] = useState('')
  const [err, setErr] = useState('')

  function load(q = '') {
    const search = q ? `?search=${encodeURIComponent(q)}` : ''
    api
      .get(`/teachers${search}`)
      .then((res) => setTeachers(res.teachers || []))
      .catch((e) => setErr(e.message))
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <div>
      <h1>Browse teachers</h1>
      <p className="page-sub">Find a teacher by subject and request a one-to-one class slot.</p>

      {err && <div className="alert error">{err}</div>}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          load(query)
        }}
        style={{ marginBottom: 20 }}
        className="row"
      >
        <input
          placeholder="Search by subject or name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: 1, maxWidth: 380, padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14 }}
        />
        <button className="btn small">Search</button>
        {query && (
          <button
            type="button"
            className="btn small ghost"
            onClick={() => {
              setQuery('')
              load()
            }}
          >
            Clear
          </button>
        )}
      </form>

      {teachers === null ? (
        <div className="loading">Loading teachers…</div>
      ) : teachers.length === 0 ? (
        <div className="empty">No teachers match your search.</div>
      ) : (
        <div className="grid2">
          {teachers.map((t) => (
            <TeacherCard key={t.id} teacher={t} />
          ))}
        </div>
      )}
    </div>
  )
}
