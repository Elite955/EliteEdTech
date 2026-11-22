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

const testimonialCarousel = document.querySelector('[data-testimonial-carousel]')

if (testimonialCarousel) {
  const storyCount = 6
  // Add each clip under home/public/testimonials and set its path here.
  const videoSources = [null, null, null, null, null, null]
  const hasVideoSources = videoSources.some(Boolean)
  const frame = testimonialCarousel.querySelector('.testimonial-frame')
  const video = testimonialCarousel.querySelector('[data-story-video]')
  const placeholder = testimonialCarousel.querySelector('[data-story-placeholder]')
  const placeholderIndex = testimonialCarousel.querySelector('[data-placeholder-index]')
  const placeholderStoryNumber = testimonialCarousel.querySelector('[data-placeholder-story-number]')
  const placeholderMessage = testimonialCarousel.querySelector('[data-placeholder-message]')
  const currentCount = testimonialCarousel.querySelector('[data-story-current]')
  const soundButton = testimonialCarousel.querySelector('[data-story-sound]')
  const toggleButton = testimonialCarousel.querySelector('[data-story-toggle]')
  const status = testimonialCarousel.querySelector('[data-story-status]')
  const dots = [...testimonialCarousel.querySelectorAll('[data-story-dot]')]
  const previousButton = testimonialCarousel.querySelector('[data-story-previous]')
  const nextButton = testimonialCarousel.querySelector('[data-story-next]')
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  let activeStory = 0
  let slidesPaused = !hasVideoSources || prefersReducedMotion.matches

  toggleButton.hidden = !hasVideoSources
  soundButton.hidden = !hasVideoSources

  const playVideo = () => {
    const playRequest = video.play()
    if (playRequest) {
      playRequest.catch((error) => {
        if (error.name !== 'NotAllowedError') {
          console.error('Unable to play the student testimonial.', error)
        }
      })
    }
  }

  const renderStory = (index, announce = false) => {
    activeStory = (index + storyCount) % storyCount
    const source = videoSources[activeStory]
    const number = String(activeStory + 1).padStart(2, '0')

    video.pause()
    video.removeAttribute('src')
    video.load()
    frame.dataset.orientation = 'default'
    video.hidden = !source
    placeholder.hidden = Boolean(source)
    placeholderIndex.textContent = number
    placeholderStoryNumber.textContent = number
    placeholderMessage.textContent = source ? '' : 'Video clip coming soon'
    currentCount.textContent = number
    soundButton.disabled = !source
    soundButton.textContent = 'Turn sound on'

    dots.forEach((dot, dotIndex) => {
      if (dotIndex === activeStory) dot.setAttribute('aria-current', 'true')
      else dot.removeAttribute('aria-current')
    })

    if (source) {
      video.setAttribute('aria-label', `Student testimonial ${activeStory + 1} of ${storyCount}`)
      video.src = source
      video.muted = true
      video.load()
      if (!prefersReducedMotion.matches && (!slidesPaused || announce)) playVideo()
    }

    status.textContent = announce ? `Student story ${activeStory + 1} of ${storyCount}` : ''
  }

  const setSlidesPaused = (paused) => {
    slidesPaused = paused
    toggleButton.textContent = paused ? 'Play slides' : 'Pause slides'
    toggleButton.setAttribute('aria-pressed', String(paused))
    if (!paused && !video.hidden) {
      if (video.ended) renderStory(activeStory + 1)
      else playVideo()
    }
  }

  setSlidesPaused(slidesPaused)
  previousButton.addEventListener('click', () => renderStory(activeStory - 1, true))
  nextButton.addEventListener('click', () => renderStory(activeStory + 1, true))
  dots.forEach((dot) => {
    dot.addEventListener('click', () => renderStory(Number(dot.dataset.storyDot), true))
  })
  toggleButton.addEventListener('click', () => setSlidesPaused(!slidesPaused))
  soundButton.addEventListener('click', () => {
    video.muted = !video.muted
    soundButton.textContent = video.muted ? 'Turn sound on' : 'Mute video'
  })
  video.addEventListener('ended', () => {
    if (!slidesPaused) renderStory(activeStory + 1)
  })
  video.addEventListener('error', () => {
    if (!video.getAttribute('src')) return
    video.hidden = true
    placeholder.hidden = false
    placeholderMessage.textContent = 'This clip could not be loaded.'
    soundButton.disabled = true
    console.error('Unable to load the student testimonial video.', video.error)
  })
  prefersReducedMotion.addEventListener('change', (event) => {
    if (event.matches) {
      setSlidesPaused(true)
      video.pause()
    }
  })

  video.addEventListener('loadedmetadata', () => {
    const aspectRatio = video.videoWidth / video.videoHeight
    frame.dataset.orientation = aspectRatio < 0.85 ? 'portrait' : aspectRatio > 1.15 ? 'landscape' : 'square'
    video.setAttribute('aria-label', `Student testimonial ${activeStory + 1} of ${storyCount}`)
  })

  renderStory(activeStory)
  if (hasVideoSources) {
    window.setInterval(() => {
      if (slidesPaused || document.hidden || !video.hidden) return
      renderStory(activeStory + 1)
    }, 8000)
  }
}

// Gentle scroll reveals for the marketing sections.
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

const masthead = document.querySelector('.masthead')

if (masthead && !prefersReducedMotion) {
  let lastScrollY = window.scrollY
  let lastDirection = 0
  let directionDistance = 0
  let scrollScheduled = false

  const updateMasthead = () => {
    const currentScrollY = window.scrollY
    const delta = currentScrollY - lastScrollY
    const direction = Math.sign(delta)

    if (currentScrollY <= masthead.offsetHeight) {
      masthead.classList.remove('masthead--hidden')
      masthead.classList.toggle('masthead--translucent', currentScrollY > 0)
      lastDirection = 0
      directionDistance = 0
    } else if (direction !== 0) {
      if (direction !== lastDirection) {
        lastDirection = direction
        directionDistance = 0
      }

      directionDistance += Math.abs(delta)
      if (directionDistance >= 10) {
        if (direction > 0 && !masthead.contains(document.activeElement)) {
          masthead.classList.add('masthead--hidden')
          masthead.classList.remove('masthead--translucent')
        } else if (direction < 0) {
          masthead.classList.remove('masthead--hidden')
          masthead.classList.add('masthead--translucent')
        }
        directionDistance = 0
      }
    }

    lastScrollY = currentScrollY
    scrollScheduled = false
  }

  window.addEventListener(
    'scroll',
    () => {
      if (scrollScheduled) return
      scrollScheduled = true
      window.requestAnimationFrame(updateMasthead)
    },
    { passive: true },
  )

  masthead.addEventListener('focusin', () => {
    masthead.classList.remove('masthead--hidden')
    masthead.classList.toggle('masthead--translucent', window.scrollY > 0)
  })
}

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
