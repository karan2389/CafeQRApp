# Courista kitchen UI + voice alert patch

This ZIP is self-contained: it includes the previous kitchen dashboard UI, the new voice-alert integration and all 42 MP3 clips. Extract it into the root of the supplied `CafeQRApp-main` project. If the six staff UI files have since changed in your main project, merge those files instead of blindly overwriting local edits. No admin/customer code, API route, database migration, key, or new npm dependency is included.

## Installation

1. Copy all archived files at their included paths, including `public/audio/kitchen/` and `features/kitchen/kitchen-voice-alert.ts`.
2. Use the project's existing dependency installation. Run `pnpm typecheck`, `pnpm lint` and `pnpm build`.
3. Sign in to `/staff`. The speaker control is muted on each fresh session. Click **Muted** once to enable voice alerts and hear the short activation bell. Browsers require this user interaction before allowing sound reliably.

## Voice triggers

| Event | Audio file pattern | When it stops |
| --- | --- | --- |
| New order | `new_order_table_N.mp3` | Plays once on arrival |
| Call staff | `call_staff_table_N.mp3` | Plays once on arrival |
| Water requested | `request_water_table_N.mp3` | Plays once on arrival |
| Bill requested | `request_bill_table_N.mp3` | Plays once on arrival |
| Assistance needed | `request_assistance_table_N.mp3` | Plays once on arrival |
| New/Pending order overdue | `pending_order_table_N.mp3` | Stops when the order starts preparing or is cancelled |
| Open request overdue | `unanswered_request_table_N.mp3` | Stops when acknowledged, resolved or cancelled |

`N` is a table number from 1–6. All 42 recordings are supplied. For a counter, an unknown number, a missing clip or failed playback, the existing synthesized bell provides a fallback. No third-party audio host or online request is needed.

The first overdue reminder qualifies at **10 minutes** from creation. It repeats no more than once every **5 minutes per waiting item**, and only one overdue announcement starts every **15 seconds**, oldest first. Arrival voices also work during the 10-second polling fallback when realtime is unavailable. The initial list is treated as existing work, so opening the panel does not announce every historical item as a fresh arrival. Once sound is enabled, genuinely overdue items can receive reminders.

The on-screen age turns into a delayed/overdue cue at 10 minutes for New/Pending orders and Open requests. Preparing orders keep the existing 15-minute delayed cue but do not receive the “unacknowledged” voice, because preparation already acknowledges them.

## Verify after integration

1. On a spare test table, submit one order and each of the four request types with sound enabled. Verify the table number and message match the recording.
2. Disable realtime in a safe test environment; verify a newly fetched order/request still announces only once through polling.
3. Test an item at 9:59 and 10:00. Confirm a pending order or Open request reminds at ten minutes; starting preparation or acknowledging the request stops later reminders.
4. Mute during a recording; playback should stop. Refresh the page; voice should begin muted until explicitly enabled.
5. Check the browser console for blocked media errors on the actual kitchen device. Do not use a live guest session to test cancellation or bill closure.

Local verification: all 42 files decode as MP3, the event/table grid is complete, reminder-selection checks passed, ESLint and TypeScript passed, and a production build completed successfully. Live audio playback and timing on the deployed kitchen device must be confirmed after installation.
