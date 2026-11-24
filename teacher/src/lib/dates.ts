export function nextDateForWeekday(weekday: number, from = new Date()): Date {
  const date = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  for (let offset = 0; offset < 7; offset += 1) {
    if (date.getDay() === weekday) return date;
    date.setDate(date.getDate() + 1);
  }
  return date;
}

export function formatDayMonth(date: Date): string {
  return new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }).format(date);
}
