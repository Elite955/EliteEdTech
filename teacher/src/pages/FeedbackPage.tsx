import { useEffect, useState } from 'react'
import { Star, MessageSquare } from 'lucide-react'
import { api, getErrorMessage } from '../lib/api'
import type { Feedback } from '../lib/types'

export function FeedbackPage() {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const data = await api<{ items: Feedback[] }>('/teacher/feedback')
        setFeedbacks(data.items)
      } catch (err) {
        setError(getErrorMessage(err))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const averageRating =
    feedbacks.length > 0
      ? (feedbacks.reduce((sum, f) => sum + f.rating, 0) / feedbacks.length).toFixed(1)
      : null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Student Feedback</h2>
          <p className="text-slate-500 mt-1">See what your students are saying about your classes.</p>
        </div>
        {averageRating && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-3 flex items-center gap-3">
            <Star size={24} className="text-blue-500 fill-blue-400" />
            <div>
              <p className="text-2xl font-bold text-blue-700">{averageRating}</p>
              <p className="text-xs text-blue-600">{feedbacks.length} review{feedbacks.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg border border-red-200">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <span className="spinner" />
        </div>
      ) : feedbacks.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 px-6 py-16 text-center">
          <MessageSquare size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm text-slate-500">No feedback yet. Completed sessions will show feedback here.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {feedbacks.map(f => (
            <div key={f.id} className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                      <span className="text-blue-700 font-semibold text-xs">
                        {f.student_name?.charAt(0).toUpperCase() ?? 'S'}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{f.student_name}</p>
                      <p className="text-xs text-slate-500">
                        {new Date(f.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {Array.from({ length: 5 }, (_, i) => (
                    <Star
                      key={i}
                      size={16}
                      className={i < f.rating ? 'text-blue-400 fill-blue-400' : 'text-slate-200'}
                    />
                  ))}
                </div>
              </div>
              {f.testimony_text && (
                <p className="mt-4 text-sm text-slate-700 leading-relaxed">
                  "{f.testimony_text}"
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
