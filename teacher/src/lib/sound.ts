type SoundKind = 'click' | 'success' | 'error' | 'open' | 'close'
type Tone = [frequency: number, start: number, duration: number, gain: number, type: OscillatorType, endFrequency?: number]

let context: AudioContext | null = null
let installed = false

function tone(audio: AudioContext, frequency: number, start: number, duration: number, gain: number, type: OscillatorType, endFrequency?: number) {
  const oscillator = audio.createOscillator()
  const level = audio.createGain()
  const from = audio.currentTime + start
  const to = from + duration

  oscillator.type = type
  oscillator.frequency.setValueAtTime(frequency, from)
  if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, to)
  level.gain.setValueAtTime(0.0001, from)
  level.gain.exponentialRampToValueAtTime(gain, from + 0.012)
  level.gain.exponentialRampToValueAtTime(0.0001, to)
  oscillator.connect(level).connect(audio.destination)
  oscillator.start(from)
  oscillator.stop(to + 0.02)
}

const patterns: Record<SoundKind, Tone[]> = {
  click: [
    [520, 0, 0.07, 0.022, 'sine', 340],
  ],
  success: [
    [523.25, 0, 0.1, 0.018, 'triangle'],
    [659.25, 0.06, 0.1, 0.018, 'triangle'],
    [783.99, 0.12, 0.12, 0.016, 'triangle'],
  ],
  error: [
    [190, 0, 0.09, 0.02, 'sine', 150],
    [145, 0.1, 0.12, 0.018, 'sine'],
  ],
  open: [
    [380, 0, 0.09, 0.016, 'sine', 520],
  ],
  close: [
    [520, 0, 0.09, 0.014, 'sine', 360],
  ],
}

export function playUiSound(kind: string = 'click') {
  const pattern = patterns[kind as SoundKind] || patterns.click
  const AudioContextClass = window.AudioContext
    ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextClass) return
  try {
    context ||= new AudioContextClass()
    if (context.state === 'suspended') void context.resume()
    for (const [frequency, start, duration, gain, type, endFrequency] of pattern) {
      tone(context, frequency, start, duration, gain, type, endFrequency)
    }
  } catch {}
}

export function installUiSounds() {
  if (installed) return
  installed = true

  document.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    const target = event.target
    if (!(target instanceof Element)) return
    if (target.closest('[data-ui-sound="none"]')) return

    const control = target.closest('button, a, [role="button"], [data-ui-sound]')
    if (!control) return
    if (control.hasAttribute('disabled') || control.getAttribute('aria-disabled') === 'true') return

    const kind = control.getAttribute('data-ui-sound') || 'click'
    if (kind !== 'none') playUiSound(kind)
  }, { passive: true })
}
