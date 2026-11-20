const host = window.location.hostname || 'localhost'
const studentBase = import.meta.env.VITE_STUDENT_PORTAL_URL || `http://${host}:5175`
const teacherBase = import.meta.env.VITE_TEACHER_PORTAL_URL || `http://${host}:5174`

const links = {
  student: new URL('/login', studentBase).href,
  'student-register': new URL('/register', studentBase).href,
  teacher: new URL('/', teacherBase).href,
  'teacher-register': new URL('/register', teacherBase).href,
}

document.querySelectorAll('[data-portal]').forEach((element) => {
  const target = links[element.dataset.portal]
  if (target) element.href = target
})

document.getElementById('year').textContent = String(new Date().getFullYear())

// Gentle scroll reveals for the marketing sections.
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

if (!prefersReducedMotion && 'IntersectionObserver' in window) {
  document.body.classList.add('reveal-ready')

  const sections = document.querySelectorAll('main > section')
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        entry.target.classList.add('is-visible')
        observer.unobserve(entry.target)
      }
    },
    { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
  )

  sections.forEach((section) => observer.observe(section))
}
