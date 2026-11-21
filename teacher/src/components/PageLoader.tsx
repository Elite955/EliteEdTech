import EliteLoader from './EliteLoader'

export function PageLoader({ label = 'Loading…' }: { label?: string; fullScreen?: boolean }) {
  return <EliteLoader label={label} />
}
