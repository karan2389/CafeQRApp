import fs from "node:fs";
import path from "node:path";
import {
  selectPendingReminder,
  REMINDER_AFTER_MS,
  REMINDER_REPEAT_MS,
  type ReminderCandidate,
} from "../features/kitchen/kitchen-voice-alert";

async function verifyVoiceAlerts() {
  console.log("=================================================================");
  console.log("   KITCHEN VOICE ALERT INTEGRATION VERIFICATION");
  console.log("=================================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(desc: string, condition: boolean) {
    if (condition) {
      console.log(`  ✓ PASS: ${desc}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${desc}`);
      failed++;
    }
  }

  // 1. Verify 42 MP3 files in public/audio/kitchen/
  console.log("--- 1. Audio Asset Verification (42 MP3 Files) ---");
  const audioDir = path.resolve(process.cwd(), "public/audio/kitchen");
  assert("Audio directory exists", fs.existsSync(audioDir));

  const expectedKinds = [
    "call_staff",
    "new_order",
    "pending_order",
    "request_assistance",
    "request_bill",
    "request_water",
    "unanswered_request",
  ];

  let totalFiles = 0;
  for (const kind of expectedKinds) {
    for (let table = 1; table <= 6; table++) {
      const filename = `${kind}_table_${table}.mp3`;
      const fullPath = path.join(audioDir, filename);
      const exists = fs.existsSync(fullPath);
      if (exists) {
        const stats = fs.statSync(fullPath);
        if (stats.size > 1000) {
          totalFiles++;
        }
      }
    }
  }
  assert("All 42 table MP3 files exist and are valid (>1KB)", totalFiles === 42);

  // 2. Overdue Order Reminder Timing and Filtering
  console.log("\n--- 2. Overdue Order Reminder Timing & Logic ---");
  const now = Date.now();
  const nineMinAgo = new Date(now - 9 * 60 * 1000).toISOString();
  const tenMinAgo = new Date(now - 10 * 60 * 1000).toISOString();
  const fifteenMinAgo = new Date(now - 15 * 60 * 1000).toISOString();

  const lastSpoken = new Map<string, number>();

  // A 9-minute-old order should NOT be overdue
  const candidateUnder10: ReminderCandidate[] = [
    {
      key: "order:1",
      kind: "PENDING_ORDER",
      status: "NEW",
      createdAt: nineMinAgo,
      tableNumber: 1,
    },
  ];
  assert(
    "Order under 10 minutes does not qualify for overdue reminder",
    selectPendingReminder(candidateUnder10, lastSpoken, now) === null
  );

  // A 10-minute-old NEW order SHOULD be overdue
  const candidate10Min: ReminderCandidate[] = [
    {
      key: "order:1",
      kind: "PENDING_ORDER",
      status: "NEW",
      createdAt: tenMinAgo,
      tableNumber: 1,
    },
  ];
  const reminder1 = selectPendingReminder(candidate10Min, lastSpoken, now);
  assert(
    "Order >= 10 minutes qualifies for overdue reminder",
    reminder1 !== null && reminder1.key === "order:1"
  );

  // Oldest first prioritization
  const candidateMultiple: ReminderCandidate[] = [
    {
      key: "order:newer",
      kind: "PENDING_ORDER",
      status: "NEW",
      createdAt: tenMinAgo,
      tableNumber: 2,
    },
    {
      key: "order:older",
      kind: "PENDING_ORDER",
      status: "NEW",
      createdAt: fifteenMinAgo,
      tableNumber: 3,
    },
  ];
  const reminderOldest = selectPendingReminder(candidateMultiple, lastSpoken, now);
  assert(
    "Selects oldest waiting candidate first (FIFO)",
    reminderOldest !== null && reminderOldest.key === "order:older"
  );

  // Repeat reminder interval (5 minutes)
  lastSpoken.set("order:older", now - 4 * 60 * 1000); // spoken 4 min ago (< 5 min)
  const reminderTooSoon = selectPendingReminder([candidateMultiple[1]], lastSpoken, now);
  assert(
    "Does not repeat reminder if spoken less than 5 minutes ago",
    reminderTooSoon === null
  );

  lastSpoken.set("order:older", now - 5 * 60 * 1000); // spoken 5 min ago
  const reminderAllowed = selectPendingReminder([candidateMultiple[1]], lastSpoken, now);
  assert(
    "Repeats reminder once 5 minutes have elapsed since last spoken",
    reminderAllowed !== null && reminderAllowed.key === "order:older"
  );

  // 3. Stop reminders on status transition
  console.log("\n--- 3. Stop Reminders on Status Transition ---");
  const preparingOrder: ReminderCandidate[] = [
    {
      key: "order:prep",
      kind: "PENDING_ORDER",
      status: "PREPARING",
      createdAt: fifteenMinAgo,
      tableNumber: 1,
    },
  ];
  assert(
    "Stops overdue reminder when order transitions to PREPARING",
    selectPendingReminder(preparingOrder, lastSpoken, now) === null
  );

  const cancelledOrder: ReminderCandidate[] = [
    {
      key: "order:canc",
      kind: "PENDING_ORDER",
      status: "CANCELLED",
      createdAt: fifteenMinAgo,
      tableNumber: 1,
    },
  ];
  assert(
    "Stops overdue reminder when order is CANCELLED",
    selectPendingReminder(cancelledOrder, lastSpoken, now) === null
  );

  const ackedRequest: ReminderCandidate[] = [
    {
      key: "req:ack",
      kind: "UNANSWERED_REQUEST",
      status: "ACKNOWLEDGED",
      createdAt: fifteenMinAgo,
      tableNumber: 1,
    },
  ];
  assert(
    "Stops overdue reminder when service request is ACKNOWLEDGED",
    selectPendingReminder(ackedRequest, lastSpoken, now) === null
  );

  const resolvedRequest: ReminderCandidate[] = [
    {
      key: "req:res",
      kind: "UNANSWERED_REQUEST",
      status: "RESOLVED",
      createdAt: fifteenMinAgo,
      tableNumber: 1,
    },
  ];
  assert(
    "Stops overdue reminder when service request is RESOLVED",
    selectPendingReminder(resolvedRequest, lastSpoken, now) === null
  );

  console.log("\n=================================================================");
  console.log(`   VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("=================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

verifyVoiceAlerts().catch((err) => {
  console.error("Verification error:", err);
  process.exit(1);
});
