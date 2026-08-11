# Recipe questions & tappable ingredients — design

2026-08-11

## Problem

While cooking a suggested recipe you run out of an ingredient. Today you must
leave the recipe, search the fridge list, open the item and mark it finished.
There is also no way to ask anything about a suggestion — "the cream is gone,
what do I substitute?", "can I use frozen spinach?" — even though the app
already talks to Claude.

## Design

Two additions to the recipe card, nothing anywhere else.

### 1. Ingredient chips open the item sheet

Chips under "Clears from your fridge" that matched an inventory item become
buttons. Tapping one opens the existing `ItemSheet` (the same sheet as in the
fridge view), which already has count, Finished and Thrown away with undo.

- `App` passes `onSelect={setSelected}` to `RecipesView`; the sheet is already
  rendered at the App level, so it works from the recipes tab as-is.
- Unmatched chips stay plain text — they are not in the inventory, so there is
  nothing to open.
- No new mutation paths: consume/waste/undo all reuse the existing flows.

Rejected: tapping a chip consuming one directly (accidental taps on a chip row
are cheap, and the sheet is only one tap more); an inline per-chip menu (new
surface, no real speed win over the sheet).

### 2. "Ask about this dish" — per-recipe Q&A

Each recipe card gets a collapsed ghost button that expands into a small
thread: previous question/answer pairs plus an input.

- **`askRecipe(recipe, items, chat, question)`** in `ai.js`. Plain-text answer,
  no schema. The system prompt sets the role and rules (short practical
  answers, assume staples, suggest substitutions from the inventory, plain
  text, answer in the app language). The final user message carries the facts:
  the recipe, the inventory *as it is right now* — the whole point is that
  something may just have been marked finished — and the question. Earlier
  exchanges are replayed as bare conversation turns (last 8) so follow-ups
  work without resending context.
- **The run lives in `App`** (`runAsk`), like the suggestion run: the view
  unmounts on every tab switch, and an in-flight answer must not die with it.
  One question at a time, guarded by a ref like `recipesRunning`.
- **Answers persist in the recipe log.** `addChat(log, entryId, index, {q, a})`
  in `recipeLog.js` appends to `recipes[index].chat` and writes through the
  existing quota-safe `write()`. If the entry was deleted while the question
  was in flight, the log is left unchanged and the answer is dropped with it.
- The ask UI only renders when an AI key is present (`aiOk`), same as the
  suggestion controls. The question input keeps its text on failure and clears
  on success, like the wish field.

Rejected: tool use letting the model mutate the inventory ("mark the cream as
finished") — the chips already cover that, and a model with write access to
the household's fridge is a much bigger step than this feature needs.

## Testing

- `recipeLog`: `addChat` appends to the right recipe, leaves siblings alone,
  ignores unknown entry ids, and reaches storage.
- `i18n`: the existing dictionary tests cover the new strings automatically.
- `askRecipe` is a thin prompt-builder over `aiRequest`, verified manually in
  the browser (error paths share `aiRequest`'s existing handling).
