const colors = {
  pending: '#b45309',
  approved: '#1d4ed8',
  rejected: '#b91c1c',
  paid: '#047857',
  succeeded: '#047857',
  completed: '#047857',
  created: '#6d28d9',
  captured: '#047857',
  refunded: '#7c3aed',
  failed: '#b91c1c'
}

export default function StatusBadge({ status }) {
  return (
    <span className="badge" style={{ background: colors[status] || '#475569' }}>
      {status}
    </span>
  )
}
