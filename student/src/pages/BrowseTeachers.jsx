import { useEffect, useState } from 'react'
import { api } from '../api/client'
import TeacherCard from '../components/TeacherCard'
import { Icon } from '../components/icons'

const skeletons = Array.from({ length: 6 })

export default function BrowseTeachers() {
  const [teachers, setTeachers] = useState(null)
  const [query, setQuery] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)

  function load(q = '') {
    const search = q ? `?search=${encodeURIComponent(q)}` : ''
    setLoading(true)
    setErr('')
    api
      .get(`/teachers${search}`)
      .then((res) => setTeachers(res.teachers || []))
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false))
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
        className="teacher-search card"
        onSubmit={(e) => {
          e.preventDefault()
          load(query)
        }}
      >
        <label className="sr-only" htmlFor="teacher-search">Search teachers</label>
        <div className="teacher-search-field">
          <Icon name="search" size={17} />
          <input
            id="teacher-search"
            placeholder="Search by subject or name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
        </div>
        <button className="btn small" disabled={loading}>Search</button>
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

      {!loading && teachers?.length > 0 && (
        <p className="teacher-results" role="status">
          {teachers.length} teacher{teachers.length === 1 ? '' : 's'} available
        </p>
      )}

      {loading ? (
        <>
          <span className="sr-only" role="status">Loading teachers…</span>
          <div className="teacher-grid" aria-hidden="true">
            {skeletons.map((_, index) => (
              <div key={index} className="card teacher-card teacher-skeleton">
                <div className="teacher-card-head">
                  <span className="teacher-skeleton-avatar" />
                  <span className="teacher-skeleton-line short" />
                </div>
                <span className="teacher-skeleton-line" />
                <span className="teacher-skeleton-line" />
                <span className="teacher-skeleton-line medium" />
                <span className="teacher-skeleton-button" />
              </div>
            ))}
          </div>
        </>
      ) : !teachers || teachers.length === 0 ? (
        <div className="empty card teacher-empty">
          <strong>No teachers match your search.</strong>
          <span>Try a different subject or clear the search to see everyone.</span>
          {query && (
            <button
              type="button"
              className="btn small ghost"
              onClick={() => {
                setQuery('')
                load()
              }}
            >
              Clear search
            </button>
          )}
        </div>
      ) : (
        <div className="teacher-grid">
          {teachers.map((teacher) => (
            <TeacherCard key={teacher.id} teacher={teacher} />
          ))}
        </div>
      )}
    </div>
  )
}
