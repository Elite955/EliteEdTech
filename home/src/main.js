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
