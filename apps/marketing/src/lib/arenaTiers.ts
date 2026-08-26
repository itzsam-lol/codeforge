/**
 * Codeforces-style rating tiers, shared everywhere a rating renders as a
 * colored handle: the leaderboard, contest standings, and profile pages.
 * Extracted from the leaderboard page's original inline TIERS array.
 */
export const ARENA_TIERS: [number, string, string][] = [
  [2100, "Grandmaster", "text-rose-400"],
  [1800, "Master", "text-orange-400"],
  [1600, "Expert", "text-violet-400"],
  [1400, "Specialist", "text-sky-400"],
  [1200, "Pupil", "text-emerald-400"],
  [0, "Newbie", "text-slate-400"],
];

export function tierFor(rating: number): [number, string, string] {
  return ARENA_TIERS.find(([min]) => rating >= min) ?? ARENA_TIERS[ARENA_TIERS.length - 1];
}
