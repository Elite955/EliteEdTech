import EliteLoader from './EliteLoader'

export default function PageLoader({ label = 'Loading your workspace…' }) {
  return <EliteLoader label={label} />
}
