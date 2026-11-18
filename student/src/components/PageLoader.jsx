export default function PageLoader({ label = 'Loading your workspace…' }) {
  return (
    <div className="page-loader" role="status" aria-live="polite">
      <div className="page-loader-head">
        <span className="page-loader-spinner" aria-hidden="true" />
        <div>
          <strong>{label}</strong>
          <span>One moment while we get things ready.</span>
        </div>
      </div>
      <div className="page-loader-lines" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  )
}
