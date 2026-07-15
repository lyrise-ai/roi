-- Report-ending "Quick gut check" credibility question (alpha only).
-- Replaces the old floating "Finish Tour" -> "Before you go..." modal ->
-- /alpha-survey treadmill with a single inline question on the report page
-- itself. alpha_feedback isn't tracked by an earlier migration (it predates
-- this repo's migration history), so these columns are added defensively.

alter table public.alpha_feedback
  add column if not exists step_credibility_choice text,
  add column if not exists step_credibility_comment text;
