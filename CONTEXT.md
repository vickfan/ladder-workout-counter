# Ladder Workout Counter

## Glossary

**Single mode** — One exercise. Ladder from its max reps. Rest between rungs. The final rung ends the session with no rest.

**Multi mode** — One or more exercises (max 20), each with a name and its own ladder. One shared rest timer.

**Exercise list** — Each row is a name and max reps. Add sits after the last row and above the rest field, and disables at 20. Each row has Remove, hidden when only one row remains. A handle on the row starts a drag for touch or mouse; the inputs stay editable. Dropping reorders immediately. Session order is the form order after the drop.

**Saved setup** — The one stored multi session: ordered exercise names and max reps, plus the shared rest. A new multi start replaces it. Separate from single-mode history.

**Single history** — Up to 10 single-mode records. Shown only on the single-mode home.

**Setup summary** — No date. One row per exercise, in form order: name on the left, max reps on the right. Last row: “Rest Time” on the left, rest seconds on the right.

**Multi home** — No saved setup: show the exercise form. Saved setup: show the setup summary first. A New button reveals the form. Tapping the summary starts that workout. Swipe-to-delete clears it.

**New setup form** — Blank form: one empty exercise row and an empty rest field. If a saved setup exists, back returns to the summary and drops unsaved edits. Start stays disabled until every name is trimmed and non-empty, every max reps is an integer ≥ 1, and the shared rest is an integer ≥ 1. Duplicate names are allowed. The filled form survives a mode switch in the same visit. Back, reload, and a successful start clear it.

**Mode URLs** — Single home is `/single`. Multi home is `/multi`. `/` opens the last home mode (or single on first visit) and replaces to that mode’s URL. The mode toggle is a link in the home header (top right) to the other mode URL. Hidden during a workout, so the mode cannot change mid-session. Reload drops an in-progress workout and returns home for the current URL.

**Workout screen** — Multi mode shows the exercise name centered above the big rep number. Single mode stays the number only. Hint is “Tap anywhere to continue” while another exercise remains in the round. Hint is “Tap anywhere to start rest timer” when the next tap starts rest, and on the final exercise.

**Ladder** — Rep targets `1, 2, … max, … 2, 1` for a max reps value.

**Round** — One pass over every exercise that still has a ladder rung left, in form order. A shorter ladder drops out of later rounds.

**Rest** — The shared countdown after a round. The final round has no rest; its last exercise ends the session. Tapping during the countdown cancels it and returns to the exercise that started that rest, on the same rung. The next tap starts the rest again. The round does not advance.
