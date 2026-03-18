const $ = (sel) => document.querySelector(sel)

const homeForm = $('#homeForm')
const maxRepInput = $('#maxRepInput')
const restSecInput = $('#restSecInput')
const startButton = $('#startButton')
const homeHint = $('#homeHint')

const repView = $('#repView')
const repNumber = $('#repNumber')

const timerView = $('#timerView')
const timerNumber = $('#timerNumber')
const timerLabel = $('#timerLabel')
const timerHint = $('#timerHint')

let workout = null
let timer = null
let audio = null

function clampPositiveInt(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  const i = Math.floor(n)
  if (i < 1) return null
  return i
}

function makeLadder(maxRep) {
  const up = []
  for (let i = 1; i <= maxRep; i++) up.push(i)

  const down = []
  for (let i = maxRep - 1; i >= 1; i--) down.push(i)

  return up.concat(down)
}

function showView(name) {
  const views = document.querySelectorAll('[data-view]')
  for (const v of views) v.classList.toggle('hidden', v.dataset.view !== name)
}

function stopTimer() {
  if (!timer) return
  clearInterval(timer.intervalId)
  timer = null
}

function stopTimerInterval() {
  if (!timer) return
  if (!timer.intervalId) return
  clearInterval(timer.intervalId)
  timer.intervalId = null
}

function ensureAudio() {
  if (audio) return audio

  const AudioCtx = window.AudioContext || window.webkitAudioContext
  if (!AudioCtx) return null

  audio = {
    ctx: new AudioCtx(),
    unlocked: false,
  }

  return audio
}

async function unlockAudioIfNeeded() {
  const a = ensureAudio()
  if (!a) return
  if (a.unlocked) return

  if (a.ctx.state === 'suspended') {
    try {
      await a.ctx.resume()
    } catch {}
  }

  a.unlocked = true
}

function beep() {
  const a = ensureAudio()
  if (!a) return

  const ctx = a.ctx
  const g = ctx.createGain()
  g.gain.value = 0
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 1400
  filter.Q.value = 0.7

  g.connect(filter)
  filter.connect(ctx.destination)

  const t0 = ctx.currentTime + 0.01
  const durationSec = 1.0
  const pulseSec = 0.26
  const pulses = Math.floor(durationSec / pulseSec)
  const maxGain = 0.12

  for (let i = 0; i < pulses; i++) {
    const start = t0 + i * pulseSec
    const stop = start + pulseSec
    const freq = i % 2 === 0 ? 880 : 660

    const o = ctx.createOscillator()
    o.type = 'triangle'
    o.frequency.setValueAtTime(freq, start)
    o.connect(g)

    g.gain.setValueAtTime(0, start)
    g.gain.linearRampToValueAtTime(maxGain, start + 0.04)
    g.gain.setValueAtTime(maxGain, stop - 0.06)
    g.gain.linearRampToValueAtTime(0, stop)

    o.start(start)
    o.stop(stop)
  }
}

function setHomeValidityUI(maxRep, restSec) {
  const ok = Boolean(maxRep && restSec)
  startButton.disabled = !ok
  homeHint.textContent = ok ? 'Ready. Tap Start workout.' : 'Enter both values to start.'
}

function updateHomeValidity() {
  const maxRep = clampPositiveInt(maxRepInput.value)
  const restSec = clampPositiveInt(restSecInput.value)
  setHomeValidityUI(maxRep, restSec)
}

function renderRep(reps) {
  repNumber.textContent = String(reps)
  showView('rep')
}

function startRestTimer(seconds) {
  stopTimer()
  timerNumber.textContent = String(seconds)
  timerLabel.textContent = seconds === 1 ? 'second' : 'seconds'
  timerHint.textContent = 'Resting...'
  showView('timer')

  timer = {
    remaining: seconds,
    done: false,
    intervalId: null,
  }

  const tick = () => {
    if (!timer) return
    if (timer.done) return

    timer.remaining = Math.max(0, timer.remaining - 1)
    timerNumber.textContent = String(timer.remaining)
    timerLabel.textContent = timer.remaining === 1 ? 'second' : 'seconds'

    if (timer.remaining === 0) {
      timer.done = true
      stopTimerInterval()
      beep()
      timerHint.textContent = 'Rest over. Tap to continue.'
    }
  }

  timer.intervalId = setInterval(tick, 1000)
}

function resetToHome() {
  stopTimer()
  workout = null
  showView('home')
  updateHomeValidity()
}

function startWorkout({ maxRep, restSec }) {
  stopTimer()

  workout = {
    maxRep,
    restSec,
    ladder: makeLadder(maxRep),
    idx: 0,
  }

  renderRep(workout.ladder[workout.idx])
}

function advanceAfterRest() {
  if (!workout) return resetToHome()

  workout.idx += 1
  if (workout.idx >= workout.ladder.length) {
    resetToHome()
    return
  }

  renderRep(workout.ladder[workout.idx])
}

function onRepActivate() {
  if (!workout) return resetToHome()
  unlockAudioIfNeeded()
  if (workout.idx >= workout.ladder.length - 1) {
    resetToHome()
    return
  }
  startRestTimer(workout.restSec)
}

function onTimerActivate() {
  if (!timer) return
  if (!timer.done) {
    stopTimer()
    timerHint.textContent = 'Tap anywhere to cancel and go back'
    showView('rep')
    return
  }

  stopTimer()
  advanceAfterRest()
}

function bindTap(el, handler) {
  el.addEventListener('click', handler)
  el.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    handler()
  })
}

maxRepInput.addEventListener('input', updateHomeValidity)
restSecInput.addEventListener('input', updateHomeValidity)

homeForm.addEventListener('submit', (e) => {
  e.preventDefault()
  const maxRep = clampPositiveInt(maxRepInput.value)
  const restSec = clampPositiveInt(restSecInput.value)
  setHomeValidityUI(maxRep, restSec)
  if (!maxRep || !restSec) return

  unlockAudioIfNeeded()
  startWorkout({ maxRep, restSec })
})

bindTap(repView, onRepActivate)
bindTap(timerView, onTimerActivate)

resetToHome()
