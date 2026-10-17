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
const timerMenu = $('#timerMenu')
const historySection = $('#historySection')
const historyCount = $('#historyCount')
const historyList = $('#historyList')

let workout = null
let timer = null
let audio = null
let deleteModeId = null
let historyTouch = null
let multiPanel = 'summary'
let summaryDeleteMode = false
let homeMode = 'single'

const historyStorageKey = 'ladder-workout-counter-history'
const modeStorageKey = 'ladder-workout-counter-mode'
const multiSetupStorageKey = 'ladder-workout-counter-multi-setup'
const maxHistoryRecords = 10

function readStoredMode() {
  try {
    const saved = localStorage.getItem(modeStorageKey)
    if (saved === 'multi') return 'multi'
    return 'single'
  } catch {
    return 'single'
  }
}

function storeMode(mode) {
  try {
    localStorage.setItem(modeStorageKey, mode)
  } catch {}
}

function modeFromPath(pathname) {
  const path = pathname.replace(/\/+$/, '') || '/'
  if (path === '/multi') return 'multi'
  if (path === '/single') return 'single'
  return null
}

function pathForMode(mode) {
  return mode === 'multi' ? '/multi' : '/single'
}

function syncModeUrl(mode, { replace = false } = {}) {
  const path = pathForMode(mode)
  if (location.pathname === path) return
  if (replace) history.replaceState({ mode }, '', path)
  else history.pushState({ mode }, '', path)
}

function resolveInitialMode() {
  return modeFromPath(location.pathname) || readStoredMode()
}

function readMultiSetup() {
  try {
    const saved = JSON.parse(localStorage.getItem(multiSetupStorageKey))
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return null

    const exercises = saved.exercises
    const restSec = clampPositiveInt(saved.restSec)
    if (!Array.isArray(exercises) || exercises.length < 1 || exercises.length > 20 || !restSec) return null

    const parsed = []
    for (const exercise of exercises) {
      if (!exercise || typeof exercise !== 'object' || typeof exercise.name !== 'string') return null
      const name = exercise.name.trim()
      const maxRep = clampPositiveInt(exercise.maxRep)
      if (!name || !maxRep) return null
      parsed.push({ name, maxRep })
    }

    return { exercises: parsed, restSec }
  } catch {
    return null
  }
}

function storeMultiSetup(exercises, restSec) {
  try {
    localStorage.setItem(multiSetupStorageKey, JSON.stringify({ exercises, restSec }))
  } catch {}
}

function clearMultiSetup() {
  try {
    localStorage.removeItem(multiSetupStorageKey)
  } catch {}
}

function exercisesInRound(exercises, round) {
  return exercises.filter((exercise) => exercise.ladder.length > round)
}

function multiRepHint(workout) {
  const inRound = exercisesInRound(workout.exercises, workout.round)
  if (workout.slot < inRound.length - 1) return 'Tap anywhere to continue'
  return 'Tap anywhere to start rest timer'
}

function ensureRepName() {
  const existing = $('#repName')
  if (existing) return existing

  const el = document.createElement('div')
  el.id = 'repName'
  el.className = 'repName'
  repNumber.before(el)
  return el
}

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
  ensureRepName()
  $('#repName').classList.add('hidden')
  repNumber.textContent = String(reps)
  repView.querySelector('.tapHint').textContent = 'Tap anywhere to start rest timer'
  showView('rep')
}

function renderCurrentMultiRep() {
  const exercise = exercisesInRound(workout.exercises, workout.round)[workout.slot]
  ensureRepName()
  $('#repName').classList.remove('hidden')
  $('#repName').textContent = exercise.name
  repNumber.textContent = String(exercise.ladder[workout.round])
  repView.querySelector('.tapHint').textContent = multiRepHint(workout)
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
      timerHint.textContent = 'Rest over.'
    }
  }

  timer.intervalId = setInterval(tick, 1000)
}

function resetToHome() {
  stopTimer()
  workout = null
  showView('home')
  setHomeMode(homeMode)
}

function startWorkout({ maxRep, restSec }) {
  stopTimer()

  workout = {
    kind: 'single',
    maxRep,
    restSec,
    ladder: makeLadder(maxRep),
    idx: 0,
  }

  renderRep(workout.ladder[workout.idx])
}

function startMultiWorkout({ exercises, restSec }) {
  stopTimer()

  workout = {
    kind: 'multi',
    restSec,
    exercises: exercises.map(({ name, maxRep }) => ({
      name,
      ladder: makeLadder(maxRep),
    })),
    round: 0,
    slot: 0,
  }

  renderCurrentMultiRep()
}

function onMultiRepActivate() {
  const inRound = exercisesInRound(workout.exercises, workout.round)
  if (workout.slot < inRound.length - 1) {
    workout.slot += 1
    renderCurrentMultiRep()
    return
  }
  if (workout.exercises.some((exercise) => exercise.ladder.length > workout.round + 1)) {
    startRestTimer(workout.restSec)
    return
  }
  resetToHome()
}

function advanceMultiAfterRest() {
  workout.round += 1
  workout.slot = 0
  if (exercisesInRound(workout.exercises, workout.round).length === 0) {
    resetToHome()
    return
  }
  renderCurrentMultiRep()
}

function advanceAfterRest() {
  if (!workout) return resetToHome()
  if (workout.kind === 'multi') return advanceMultiAfterRest()

  workout.idx += 1
  if (workout.idx >= workout.ladder.length) {
    resetToHome()
    return
  }

  renderRep(workout.ladder[workout.idx])
}

function reorderExerciseRow(fromIndex, toIndex) {
  const list = $('#exerciseList')
  if (!list || fromIndex === toIndex) return

  const count = list.children.length
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= count || toIndex >= count) return

  const row = list.children[fromIndex]
  const target = list.children[toIndex]
  if (fromIndex < toIndex) target.after(row)
  else target.before(row)
}

function bindExerciseDrag(handle, row) {
  handle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    event.preventDefault()
    handle.setPointerCapture(event.pointerId)

    const onPointerMove = (event) => {
      const list = $('#exerciseList')
      if (!list || list.children.length === 0) return

      let toIndex = 0
      let closest = Infinity
      for (let i = 0; i < list.children.length; i++) {
        const rect = list.children[i].getBoundingClientRect()
        const mid = rect.top + rect.height / 2
        const distance = Math.abs(event.clientY - mid)
        if (distance < closest) {
          closest = distance
          toIndex = i
        }
      }

      const fromIndex = [...list.children].indexOf(row)
      if (fromIndex !== toIndex) reorderExerciseRow(fromIndex, toIndex)
    }

    const onPointerEnd = () => {
      handle.removeEventListener('pointermove', onPointerMove)
      handle.removeEventListener('pointerup', onPointerEnd)
      handle.removeEventListener('pointercancel', onPointerEnd)
    }

    handle.addEventListener('pointermove', onPointerMove)
    handle.addEventListener('pointerup', onPointerEnd)
    handle.addEventListener('pointercancel', onPointerEnd)
  })
}

function createExerciseRow({ name, maxRep }) {
  const row = document.createElement('div')
  row.className = 'exerciseRow'

  const handle = document.createElement('button')
  handle.type = 'button'
  handle.className = 'dragHandle'
  handle.textContent = '≡'
  handle.setAttribute('aria-label', 'Reorder')
  bindExerciseDrag(handle, row)

  const nameInput = document.createElement('input')
  nameInput.type = 'text'
  nameInput.className = 'input'
  nameInput.value = name

  const maxRepInput = document.createElement('input')
  maxRepInput.type = 'number'
  maxRepInput.className = 'input'
  maxRepInput.min = '1'
  maxRepInput.step = '1'
  maxRepInput.inputMode = 'numeric'
  maxRepInput.value = maxRep

  const removeButton = document.createElement('button')
  removeButton.type = 'button'
  removeButton.className = 'exerciseRemove'
  removeButton.textContent = 'Remove'
  removeButton.addEventListener('click', () => removeExerciseRow(row))

  nameInput.addEventListener('input', updateMultiFormValidity)
  maxRepInput.addEventListener('input', updateMultiFormValidity)

  row.append(handle, nameInput, maxRepInput, removeButton)
  return row
}

function syncExerciseControls() {
  const list = $('#exerciseList')
  if (!list) return

  const addExercise = $('#addExercise')
  if (addExercise) addExercise.disabled = list.children.length >= 20

  const hideRemove = list.children.length === 1
  for (const row of list.children) {
    const removeButton = row.querySelector('.exerciseRemove')
    if (removeButton) removeButton.classList.toggle('hidden', hideRemove)
  }
}

function renderExerciseList(rows) {
  const list = $('#exerciseList')
  if (!list) return

  list.replaceChildren(...rows.map((row) => createExerciseRow(row)))
  syncExerciseControls()
}

function readExerciseRows() {
  const list = $('#exerciseList')
  if (!list) return []

  const rows = []
  for (const row of list.children) {
    const [nameInput, maxRepInput] = row.querySelectorAll('input')
    rows.push({
      name: nameInput.value.trim(),
      maxRep: clampPositiveInt(maxRepInput.value),
    })
  }
  return rows
}

function updateMultiFormValidity() {
  const rows = readExerciseRows()
  const restInput = $('#multiRestInput')
  const rest = restInput ? clampPositiveInt(restInput.value) : null
  const valid = Boolean(
    rows.length >= 1
    && rows.length <= 20
    && rows.every((row) => row.name && row.maxRep !== null)
    && rest
  )
  const multiStart = $('#multiStart')
  if (multiStart) multiStart.disabled = !valid
  const multiHint = $('#multiHint')
  if (multiHint) multiHint.textContent = valid ? 'Ready. Tap Start workout.' : 'Enter every exercise and rest to start.'
}

function addExerciseRow() {
  const list = $('#exerciseList')
  if (!list || list.children.length >= 20) return
  list.append(createExerciseRow({ name: '', maxRep: '' }))
  syncExerciseControls()
  updateMultiFormValidity()
}

function removeExerciseRow(row) {
  const list = $('#exerciseList')
  if (!list || list.children.length <= 1) return
  row.remove()
  syncExerciseControls()
  updateMultiFormValidity()
}

function resetMultiForm() {
  const restInput = $('#multiRestInput')
  if (restInput) restInput.value = ''
  renderExerciseList([{ name: '', maxRep: '' }])
  updateMultiFormValidity()
}

function showMultiPanel(panel) {
  multiPanel = panel
  const summary = $('#setupSummary')
  const form = $('#multiForm')
  const back = $('#multiBack')
  if (summary) summary.classList.toggle('hidden', panel !== 'summary')
  if (form) form.classList.toggle('hidden', panel !== 'form')
  if (back) back.classList.toggle('hidden', !readMultiSetup())
}

function setSummaryDeleteMode(on) {
  summaryDeleteMode = on
  const summary = $('#setupSummary')
  if (!summary) return
  summary.classList.toggle('deleteMode', on)
  const deleteButton = summary.querySelector('.summaryDeleteButton')
  if (deleteButton) deleteButton.classList.toggle('hidden', !on)
}

function renderSetupSummary(setup) {
  const summary = $('#setupSummary')
  if (!summary) return

  summary.replaceChildren()

  function clearSummary() {
    clearMultiSetup()
    resetMultiForm()
    showMultiPanel('form')
  }

  for (const exercise of setup.exercises) {
    const row = document.createElement('div')
    row.className = 'summaryRow'

    const label = document.createElement('span')
    label.className = 'summaryLabel'
    label.textContent = exercise.name

    const value = document.createElement('span')
    value.className = 'summaryValue'
    value.textContent = String(exercise.maxRep)

    row.append(label, value)
    summary.append(row)
  }

  const restRow = document.createElement('div')
  restRow.className = 'summaryRow'

  const restLabel = document.createElement('span')
  restLabel.className = 'summaryLabel'
  restLabel.textContent = 'Rest Time'

  const restValue = document.createElement('span')
  restValue.className = 'summaryValue'
  restValue.textContent = String(setup.restSec)

  restRow.append(restLabel, restValue)
  summary.append(restRow)

  const newButton = document.createElement('button')
  newButton.type = 'button'
  newButton.className = 'button'
  newButton.textContent = 'New'
  newButton.onclick = (e) => {
    e.stopPropagation()
    onNewSetup()
  }

  const deleteButton = document.createElement('button')
  deleteButton.type = 'button'
  deleteButton.className = 'summaryDeleteButton hidden'
  deleteButton.textContent = 'Delete'
  deleteButton.onclick = (e) => {
    e.stopPropagation()
    clearSummary()
  }

  summary.append(newButton, deleteButton)
  setSummaryDeleteMode(false)

  let startX = 0
  let startY = 0

  summary.onclick = () => {
    if (summary.dataset.swipeHandled === 'true') {
      delete summary.dataset.swipeHandled
      return
    }
    if (summaryDeleteMode) {
      clearSummary()
      return
    }
    startMultiFromSummary(setup)
  }

  summary.ontouchstart = (e) => {
    const touch = e.changedTouches[0]
    startX = touch.clientX
    startY = touch.clientY
  }

  summary.ontouchend = (e) => {
    const touch = e.changedTouches[0]
    const deltaX = touch.clientX - startX
    const deltaY = touch.clientY - startY
    if (deltaX >= -40 || Math.abs(deltaX) <= Math.abs(deltaY)) return
    summary.dataset.swipeHandled = 'true'
    setSummaryDeleteMode(true)
    setTimeout(() => {
      delete summary.dataset.swipeHandled
    }, 0)
  }
}

function startMultiFromSummary(setup) {
  multiPanel = 'summary'
  resetMultiForm()
  unlockAudioIfNeeded()
  startMultiWorkout(setup)
}

function onMultiSubmit(event) {
  event.preventDefault()
  const rows = readExerciseRows()
  const restInput = $('#multiRestInput')
  const restSec = restInput ? clampPositiveInt(restInput.value) : null
  if (
    rows.length < 1
    || rows.length > 20
    || rows.some((row) => !row.name || row.maxRep === null)
    || !restSec
  ) return

  const exercises = rows.map((row) => ({ name: row.name, maxRep: row.maxRep }))
  storeMultiSetup(exercises, restSec)
  multiPanel = 'summary'
  resetMultiForm()
  unlockAudioIfNeeded()
  startMultiWorkout({ exercises, restSec })
}

function onMultiBack() {
  const setup = readMultiSetup()
  if (!setup) return
  resetMultiForm()
  renderSetupSummary(setup)
  showMultiPanel('summary')
}

function onNewSetup() {
  resetMultiForm()
  showMultiPanel('form')
}

function renderMultiHome() {
  const setup = readMultiSetup()
  if (!setup) {
    showMultiPanel('form')
    return
  }
  if (multiPanel === 'form') {
    showMultiPanel('form')
    return
  }
  renderSetupSummary(setup)
  showMultiPanel('summary')
}

function setHomeMode(mode) {
  homeMode = mode
  storeMode(mode)
  const formSection = document.querySelector('.formSection')
  if (formSection) formSection.classList.toggle('hidden', mode !== 'single')
  const history = $('#historySection')
  if (history) {
    if (mode === 'single') renderHistory()
    else history.classList.add('hidden')
  }
  const multiHome = $('#multiHome')
  if (multiHome) multiHome.classList.toggle('hidden', mode !== 'multi')
  if (mode === 'single') updateHomeValidity()
  else renderMultiHome()
  const modeToggle = $('#modeToggle')
  if (modeToggle) {
    const otherMode = mode === 'single' ? 'multi' : 'single'
    modeToggle.textContent = mode === 'single' ? 'Single' : 'Multiple'
    modeToggle.href = pathForMode(otherMode)
    modeToggle.setAttribute('aria-label', mode === 'single' ? 'Single mode. Switch to multiple.' : 'Multiple mode. Switch to single.')
  }
}

function switchHomeMode(event) {
  if (event) event.preventDefault()
  const next = homeMode === 'single' ? 'multi' : 'single'
  syncModeUrl(next)
  setHomeMode(next)
}

function mountModeToggle() {
  const header = document.querySelector('.header')
  if (!header || $('#modeToggle')) return
  const link = document.createElement('a')
  link.id = 'modeToggle'
  link.className = 'button modeToggle'
  link.textContent = homeMode === 'single' ? 'Single' : 'Multiple'
  link.href = pathForMode(homeMode === 'single' ? 'multi' : 'single')
  link.setAttribute('aria-label', homeMode === 'single' ? 'Single mode. Switch to multiple.' : 'Multiple mode. Switch to single.')
  link.addEventListener('click', switchHomeMode)
  header.append(link)
}

function mountMultiHome() {
  const home = document.querySelector('section.card[data-view="home"]')
  if (!home || $('#multiHome')) return

  const multiHome = document.createElement('div')
  multiHome.id = 'multiHome'
  multiHome.className = 'hidden'

  const setupSummary = document.createElement('div')
  setupSummary.id = 'setupSummary'

  const form = document.createElement('form')
  form.id = 'multiForm'
  form.className = 'form'
  form.addEventListener('submit', onMultiSubmit)

  const exerciseList = document.createElement('div')
  exerciseList.id = 'exerciseList'
  exerciseList.className = 'exerciseList'

  const addExercise = document.createElement('button')
  addExercise.type = 'button'
  addExercise.id = 'addExercise'
  addExercise.className = 'button'
  addExercise.textContent = 'Add exercise'
  addExercise.addEventListener('click', addExerciseRow)

  const restField = document.createElement('label')
  restField.className = 'field'

  const restLabel = document.createElement('span')
  restLabel.className = 'label'
  restLabel.textContent = 'Rest interval (seconds)'

  const restInput = document.createElement('input')
  restInput.type = 'number'
  restInput.id = 'multiRestInput'
  restInput.className = 'input'
  restInput.min = '1'
  restInput.step = '1'
  restInput.inputMode = 'numeric'
  restInput.placeholder = 'e.g. 60'
  restInput.addEventListener('input', updateMultiFormValidity)

  restField.append(restLabel, restInput)

  const back = document.createElement('button')
  back.type = 'button'
  back.id = 'multiBack'
  back.className = 'button hidden'
  back.textContent = 'Back'
  back.addEventListener('click', onMultiBack)

  const start = document.createElement('button')
  start.type = 'submit'
  start.id = 'multiStart'
  start.className = 'button primary'
  start.textContent = 'Start workout'
  start.disabled = true

  const hint = document.createElement('p')
  hint.id = 'multiHint'
  hint.className = 'hint'
  hint.textContent = 'Enter every exercise and rest to start.'

  form.append(exerciseList, addExercise, restField, back, start, hint)
  multiHome.append(setupSummary, form)
  home.append(multiHome)
  resetMultiForm()
}

function onRepActivate() {
  if (!workout) return resetToHome()
  unlockAudioIfNeeded()
  if (workout.kind === 'multi') return onMultiRepActivate()
  if (workout.idx >= workout.ladder.length - 1) {
    resetToHome()
    return
  }
  startRestTimer(workout.restSec)
}

function showCurrentWorkout() {
  if (!workout) return resetToHome()
  if (workout.kind === 'multi') {
    renderCurrentMultiRep()
    return
  }
  renderRep(workout.ladder[workout.idx])
}

function closeTimerMenu() {
  if (!timerMenu.open) return
  timerMenu.close()
}

function onTimerActivate() {
  if (!timer) return
  if (timerMenu.open) return
  timerMenu.showModal()
}

function onTimerPrevious() {
  closeTimerMenu()
  stopTimer()
  showCurrentWorkout()
}

function onTimerNext() {
  closeTimerMenu()
  stopTimer()
  advanceAfterRest()
}

function onTimerCancel() {
  closeTimerMenu()
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
$('#timerPrevious').addEventListener('click', onTimerPrevious)
$('#timerNext').addEventListener('click', onTimerNext)
$('#timerCancel').addEventListener('click', onTimerCancel)

function onDocumentClick(event) {
  if (deleteModeId) {
    const activeItem = [...historyList.children].find((item) => item.dataset.recordId === deleteModeId)
    if (!activeItem?.contains(event.target)) setDeleteMode(null)
  }

  if (summaryDeleteMode) {
    const summary = $('#setupSummary')
    if (summary && !summary.contains(event.target)) setSummaryDeleteMode(false)
  }
}

document.addEventListener('click', onDocumentClick)

window.addEventListener('popstate', () => {
  const mode = modeFromPath(location.pathname) || 'single'
  setHomeMode(mode)
})

function boot() {
  homeMode = resolveInitialMode()
  syncModeUrl(homeMode, { replace: true })
  mountModeToggle()
  mountMultiHome()
  resetToHome()
}

boot()
