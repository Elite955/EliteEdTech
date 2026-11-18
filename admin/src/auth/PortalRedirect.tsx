import { useEffect } from 'react'

export function PortalRedirect({ url }: { url: string }) {
  useEffect(() => {
    window.location.replace(url)
  }, [url])

  return (
    <div className="app-loading">
      <span className="spinner" /> Opening your portal…
    </div>
  )
}
