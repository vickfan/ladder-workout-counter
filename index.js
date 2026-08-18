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
const historySection = $('#historySection')
const historyCount = $('#historyCount')
const historyList = $('#historyList')

let workout = null
let timer = null
let audio = null
let deleteModeId = null
let historyTouch = null

const historyStorageKey = 'ladder-workout-counter-history'
const maxHistoryRecords = 10

function clampPositiveInt(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  const i = Math.floor(n)
  if (i < 1) return null
  return i
}

function readHistory() {
  try {
    const saved = JSON.parse(localStorage.getItem(historyStorageKey) || '[]')
    if (!Array.isArray(saved)) return []

    return saved
      .filter((record) => clampPositiveInt(record.maxRep) && clampPositiveInt(record.restSec) && record.startedAt)
      .slice(0, maxHistoryRecords)
  } catch {
    return []
  }
}

function saveHistory(maxRep, restSec) {
  const records = [
    {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      maxRep,
      restSec,
      startedAt: new Date().toISOString(),
    },
    ...readHistory(),
  ].slice(0, maxHistoryRecords)

  try {
    localStorage.setItem(historyStorageKey, JSON.stringify(records))
  } catch {}

  renderHistory(records)
}

function formatHistoryDate(isoDate) {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) return 'Unknown date'

  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function renderHistory(records = readHistory()) {
  historyList.replaceChildren()
  historySection.classList.toggle('hidden', records.length === 0)
  historyCount.textContent = records.length ? `${records.length}/${maxHistoryRecords}` : ''

  for (const record of records) {
    const item = document.createElement('li')
    item.className = 'historyItem'
    item.classList.toggle('deleteMode', record.id === deleteModeId)
    item.tabIndex = 0
    item.dataset.recordId = record.id

    const details = document.createElement('div')
    details.className = 'historyDetails'

    const date = document.createElement('span')
    date.className = 'historyDate'
    date.textContent = formatHistoryDate(record.startedAt)

    const setup = document.createElement('span')
    setup.className = 'historySetup'
    setup.textContent = `Max ${record.maxRep} reps · ${record.restSec}s rest`

    const deleteButton = document.createElement('button')
    deleteButton.className = 'historyDeleteButton'
    deleteButton.type = 'button'
    deleteButton.textContent = 'Delete'

    const startWorkoutFromHistory = () => {
      if (deleteModeId === record.id) {
        deleteHistoryRecord(record.id)
        return
      }

      const maxRep = clampPositiveInt(record.maxRep)
      const restSec = clampPositiveInt(record.restSec)
      if (!maxRep || !restSec) return
      unlockAudioIfNeeded()
      startWorkout({ maxRep, restSec })
    }

    details.append(date, setup)
    item.append(details, deleteButton)
    item.addEventListener('click', (e) => {
      if (e.target === deleteButton) return
      if (item.dataset.swipeHandled === 'true') {
        delete item.dataset.swipeHandled
        return
      }
      if (deleteModeId && deleteModeId !== record.id) {
        setDeleteMode(null)
        return
      }
      startWorkoutFromHistory()
    })
    item.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return
      e.preventDefault()
      if (deleteModeId && deleteModeId !== record.id) {
        setDeleteMode(null)
        return
      }
      startWorkoutFromHistory()
    })
    item.addEventListener(
      'touchstart',
      (e) => {
        const touch = e.changedTouches[0]
        historyTouch = { item, startX: touch.clientX, startY: touch.clientY }
      },
      { passive: true },
    )
    item.addEventListener(
      'touchend',
      (e) => {
        if (!historyTouch || historyTouch.item !== item) return

        const touch = e.changedTouches[0]
        const deltaX = touch.clientX - historyTouch.startX
        const deltaY = touch.clientY - historyTouch.startY
        historyTouch = null

        if (deltaX >= -40 || Math.abs(deltaX) <= Math.abs(deltaY)) return

        item.dataset.swipeHandled = 'true'
        setDeleteMode(record.id)
        setTimeout(() => {
          delete item.dataset.swipeHandled
        }, 0)
      },
      { passive: true },
    )
    deleteButton.addEventListener('click', (e) => {
      e.stopPropagation()
      deleteHistoryRecord(record.id)
    })
    historyList.append(item)
  }
}

function setDeleteMode(id) {
  deleteModeId = id
  for (const item of historyList.children) {
    item.classList.toggle('deleteMode', item.dataset.recordId === id)
  }
}

function deleteHistoryRecord(id) {
  const records = readHistory().filter((record) => record.id !== id)

  try {
    localStorage.setItem(historyStorageKey, JSON.stringify(records))
  } catch {}

  deleteModeId = null
  renderHistory(records)
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
  saveHistory(maxRep, restSec)
  startWorkout({ maxRep, restSec })
})

bindTap(repView, onRepActivate)
bindTap(timerView, onTimerActivate)

document.addEventListener('click', (e) => {
  if (!deleteModeId) return
  const activeItem = [...historyList.children].find((item) => item.dataset.recordId === deleteModeId)
  if (!activeItem?.contains(e.target)) setDeleteMode(null)
})

resetToHome()
renderHistory()
