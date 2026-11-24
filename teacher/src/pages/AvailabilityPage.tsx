import { useCallback, useEffect, useState } from 'react'
import { Calendar, Plus, Trash2, Save } from 'lucide-react'
import { api, getErrorMessage } from '../lib/api'
import { formatDayMonth, nextDateForWeekday } from '../lib/dates'

interface Slot {
  id?: string
  day_of_week: number
  start_time: string
  end_time: string
  subject: string | null
  hourly_rate: number | null
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function AvailabilityPage() {
  const [slots, setSlots] = useState<Slot[]>([])
  const [subjects, setSubjects] = useState<string[]>([])
  const [defaultRate, setDefaultRate] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const load = useCallback(async () => {
    try {
      const [slotData, profile] = await Promise.all([
        api<{ items: Slot[] }>('/teacher/availability'),
        api<{ profile: { subjects?: string[]; hourly_rate?: number | null } }>('/teacher/profile'),
      ])
      setSlots(slotData.items)
      setSubjects(profile.profile.subjects ?? [])
      setDefaultRate(profile.profile.hourly_rate ?? 0)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const addSlot = () => {
    setSlots(prev => [
      ...prev,
      {
        day_of_week: 1,
        start_time: '09:00',
        end_time: '10:00',
        subject: subjects[0] ?? null,
        hourly_rate: defaultRate,
      },
    ])
  }

  const removeSlot = (index: number) => {
    setSlots(prev => prev.filter((_, i) => i !== index))
  }

  const updateSlot = (index: number, field: keyof Slot, value: string | number | null) => {
    setSlots(prev =>
      prev.map((slot, i) => (i === index ? { ...slot, [field]: value } : slot))
    )
  }

  const handleSave = async () => {
    setError('')
    setSuccess('')
    setSaving(true)
    try {
      await api('/teacher/availability', {
        method: 'PUT',
        body: JSON.stringify({
          slots: slots.map((slot) => ({
            day_of_week: slot.day_of_week,
            start_time: slot.start_time,
            end_time: slot.end_time,
            subject: slot.subject,
            hourlyRate: Number(slot.hourly_rate ?? 0),
          })),
        }),
      })
      setSuccess('Availability saved successfully!')
      setTimeout(() => setSuccess(''), 3000)
      await load()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  // Group by day for the visual grid
  const slotsByDay = DAYS.map((day, i) => ({
    day,
    dayIndex: i,
    slots: slots
      .map((slot, originalIndex) => ({ ...slot, originalIndex }))
      .filter(s => s.day_of_week === i),
  }))

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="spinner" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Set Availability</h2>
          <p className="text-slate-500 mt-1">Configure your weekly teaching slots. Students will see these when booking.</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={addSlot}
            className="inline-flex items-center gap-2 px-4 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <Plus size={16} />
            Add Slot
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? <span className="spinner" /> : <Save size={16} />}
            Save
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg border border-red-200">{error}</div>
      )}
      {success && (
        <div className="bg-green-50 text-green-700 text-sm px-4 py-3 rounded-lg border border-green-200">{success}</div>
      )}

      {/* Weekly grid view */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-7 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
          {slotsByDay.map(({ day, dayIndex, slots: daySlots }) => (
            <div key={dayIndex} className="min-h-[120px]">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                <h4 className="text-sm font-semibold text-slate-700">{day}</h4>
                <span className="block text-[11px] font-normal text-slate-400">{formatDayMonth(nextDateForWeekday(dayIndex))}</span>
              </div>
              <div className="p-3 space-y-2">
                {daySlots.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-4">No slots</p>
                )}
                {daySlots.map(s => (
                  <div
                    key={s.originalIndex}
                    className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-blue-800">{s.start_time}–{s.end_time}</span>
                      <button
                        onClick={() => removeSlot(s.originalIndex)}
                        className="text-red-400 hover:text-red-600"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <div className="mt-1 text-[11px] text-blue-700">{formatDayMonth(nextDateForWeekday(s.day_of_week))}</div>
                    <div className="mt-0.5 text-[11px] text-blue-700">{s.subject || 'Any subject'}</div>
                    <div className="mt-0.5 text-[11px] font-semibold text-blue-900">₹{s.hourly_rate ?? 0}/hr</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Editable list */}
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="px-6 py-4 border-b border-slate-200">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2">
            <Calendar size={18} className="text-blue-500" />
            All Slots ({slots.length})
          </h3>
        </div>
        {slots.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-slate-400">
            No availability slots yet. Click "Add Slot" to create your first one.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {slots.map((slot, i) => (
              <div key={i} className="px-6 py-4 flex items-center gap-4 flex-wrap">
                <select
                  value={slot.day_of_week}
                  onChange={e => updateSlot(i, 'day_of_week', parseInt(e.target.value))}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  {DAYS.map((d, di) => (
                    <option key={di} value={di}>{d}</option>
                  ))}
                </select>
                <select
                  value={slot.subject ?? ''}
                  onChange={e => updateSlot(i, 'subject', e.target.value || null)}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="">Any subject</option>
                  {subjects.map((subject) => <option key={subject} value={subject}>{subject}</option>)}
                </select>
                <input
                  type="number"
                  min={0}
                  max={4999}
                  step={1}
                  value={slot.hourly_rate ?? ''}
                  onChange={e => updateSlot(i, 'hourly_rate', e.target.value === '' ? null : Number(e.target.value))}
                  className="w-24 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  aria-label="Hourly rate in rupees"
                />
                <span className="text-xs text-slate-400">₹/hr</span>
                <input
                  type="time"
                  value={slot.start_time}
                  onChange={e => updateSlot(i, 'start_time', e.target.value)}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
                <span className="text-[11px] text-slate-400">{formatDayMonth(nextDateForWeekday(slot.day_of_week))}</span>
                <span className="text-slate-400">to</span>
                <input
                  type="time"
                  value={slot.end_time}
                  onChange={e => updateSlot(i, 'end_time', e.target.value)}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
                <button
                  onClick={() => removeSlot(i)}
                  className="ml-auto text-red-400 hover:text-red-600 p-2 rounded-lg hover:bg-red-50 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
