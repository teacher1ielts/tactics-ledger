// In the Clear design the game-style names become plain ones. Neon and Tactics keep their original wording.
let plain = false
export const setPlain = (v: boolean) => {
  plain = v
}
export const isPlain = () => plain

const MAP: Record<string, string> = {
  // tabs
  Camp: 'Home',
  Battles: 'Habits',
  Treasury: 'Money',
  Map: 'Goals',
  Intel: 'Insights',
  Command: 'Quick add',
  // home
  "Today's Turn Order": "Today's habits",
  'Next Up': 'Coming up today',
  'Start Here': 'Start here',
  'Active Quests': 'Goals',
  'War Chest · this month': 'Money this month',
  'Weekly Debrief': 'Weekly review',
  'To-Do': 'To-do',
  // habits
  'Recruit a Habit': 'Add a habit',
  // money
  'Record Transaction': 'Add income or spending',
  Repeating: 'Repeating money',
  'Monthly Budget': 'Monthly budget',
  'Import from Bank': 'Import a statement',
  Ledger: 'Transactions',
  // goals
  'World Map': 'Goals',
  'Your Party': 'Your progress',
  'Chart a Quest': 'Add a goal',
  // quick add
  'Confirm Orders': 'Check before saving',
  'Turn Order': "Today's plan",
  'Auto-Organise': 'Plan my tasks',
  // insights
  'Scouting Report': 'What stood out',
  'Battle Heatmap · 8 weeks': 'Habit calendar · 8 weeks',
  'Habit Performance · 30 days': 'Habit results · 30 days',
  'This Month vs Last': 'This month vs last month',
  'Spending by Weekday': 'Spending by weekday',
}

/** Translate a heading or label into the active design's wording. */
export function T(s: string): string {
  if (!plain) return s
  if (MAP[s]) return MAP[s]
  if (s.startsWith('Ledger · ')) return 'Transactions · ' + s.slice('Ledger · '.length)
  return s
}
