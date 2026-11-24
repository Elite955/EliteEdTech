import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { api, getErrorMessage } from '../lib/api'
import { playUiSound } from '../lib/sound'

type RegisterReply = { user?: { id: string; name: string; email: string; role: string } }

export function RegisterPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    subjects: '',
    bio: '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const set = (key: keyof typeof form) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }))

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api<RegisterReply>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          role: 'teacher',
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          password: form.password,
          subjects: form.subjects.split(',').map((item) => item.trim()).filter(Boolean),
          bio: form.bio.trim() || undefined,
        }),
      })
      setDone(true)
      playUiSound('success')
    } catch (err) {
      setError(getErrorMessage(err))
      playUiSound('error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-page min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-xl">
        <Link to="/sign-in" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 mb-6">
          <ArrowLeft size={16} />
          Back to sign in
        </Link>

        <div className="auth-card bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          <div className="auth-brand">
            <span className="auth-brand-name"><img className="auth-brand-logo" src="/elite-logo-md.png" alt="Elite" /><small>teacher portal</small></span>
          </div>
          <h1 className="auth-title">Create your account</h1>
          <p className="auth-sub">Teach one-to-one classes on your own schedule.</p>

          {done ? (
            <div className="space-y-5">
              <div className="bg-green-50 text-green-800 text-sm px-4 py-4 rounded-lg border border-green-200">
                Your teacher account is ready. Sign in to set your availability and start receiving booking requests.
              </div>
              <button
                type="button"
                onClick={() => navigate('/sign-in?registered=1', { replace: true })}
                className="w-full py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700"
              >
                Go to teacher sign in
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <label className="block sm:col-span-2">
                <span className="block text-sm font-medium text-slate-700 mb-1.5">Full name</span>
                <input required minLength={2} maxLength={80} value={form.name} onChange={set('name')} className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Your name" />
              </label>
              <label className="block">
                <span className="block text-sm font-medium text-slate-700 mb-1.5">Email</span>
                <input required type="email" value={form.email} onChange={set('email')} className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" placeholder="you@example.com" />
              </label>
              <label className="block">
                <span className="block text-sm font-medium text-slate-700 mb-1.5">Phone</span>
                <input required pattern="[+0-9 ()-]{7,20}" value={form.phone} onChange={set('phone')} className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" placeholder="+919000000000" />
              </label>
              <label className="block">
                <span className="block text-sm font-medium text-slate-700 mb-1.5">Subjects you teach</span>
                <input required value={form.subjects} onChange={set('subjects')} className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Mathematics, Algebra" />
                <span className="block text-xs text-slate-400 mt-1">Separate multiple subjects with commas.</span>
              </label>
              <label className="block sm:col-span-2">
                <span className="block text-sm font-medium text-slate-700 mb-1.5">Short bio</span>
                <textarea rows={3} maxLength={600} value={form.bio} onChange={set('bio')} className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Tell students how you teach." />
              </label>
              <label className="block sm:col-span-2">
                <span className="block text-sm font-medium text-slate-700 mb-1.5">Password</span>
                <input required type="password" minLength={12} value={form.password} onChange={set('password')} className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" placeholder="At least 12 characters" />
              </label>
              {error && (
                <div role="alert" className="sm:col-span-2 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg border border-red-200">
                  {error}
                </div>
              )}
              <button type="submit" disabled={busy} className="sm:col-span-2 w-full py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {busy ? <span className="spinner" /> : 'Create teacher account'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
