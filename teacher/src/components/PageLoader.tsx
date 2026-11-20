export function PageLoader({ label = 'Loading…', fullScreen = false }: { label?: string; fullScreen?: boolean }) {
  return (
    <div className={`page-loader${fullScreen ? ' is-fullscreen' : ''}`} role="status" aria-live="polite">
      <div className="page-loader-panel">
        <div className="page-loader-head">
          <span className="page-loader-spinner" aria-hidden="true" />
          <span>
            <strong>Preparing your desk</strong>
            <small>{label}</small>
          </span>
        </div>
        <div className="page-loader-lines" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  )
}
