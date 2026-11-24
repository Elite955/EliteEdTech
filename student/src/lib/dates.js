export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function weekdayIndex(value) {
  if (typeof value === 'number') return value >= 0 && value <= 6 ? value : -1
  const text = String(value ?? '').trim().slice(0, 3).toLowerCase()
  return WEEKDAYS_SHORT.findIndex((day) => day.toLowerCase() === text)
}

export function fromDateInput(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ''))) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return Number.isNaN(date.getTime()) ? null : date
}

export function toDateInput(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// The next calendar date (including today) that falls on a teacher's weekly
// availability day. Turns "Mon" into something a student can actually plan.
export function nextDateForWeekday(value, from = new Date()) {
  const target = weekdayIndex(value)
  if (target < 0) return null
  const date = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  for (let offset = 0; offset < 7; offset += 1) {
    if (date.getDay() === target) return date
    date.setDate(date.getDate() + 1)
  }
  return null
}

export function formatDayMonth(date) {
  if (!date) return ''
  return new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }).format(date)
}

export function formatFullDate(date) {
  if (!date) return ''
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(date)
}
