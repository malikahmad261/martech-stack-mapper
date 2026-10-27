// Dates and story beats for the BrightPath Solar demo dataset.
// Data covers 90 days ending END_DATE; the latest scan runs the morning after.

export const DAYS = 90;
export const END_DATE = '2026-10-26';
export const LATEST_SCAN_AT = '2026-10-27T06:00:00Z';

export function dateAt(dayIndex: number): string {
  const end = new Date(`${END_DATE}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() - (DAYS - 1 - dayIndex));
  return end.toISOString().slice(0, 10);
}

export function dayIndexOf(date: string): number {
  const end = new Date(`${END_DATE}T00:00:00Z`).getTime();
  const d = new Date(`${date}T00:00:00Z`).getTime();
  return DAYS - 1 - Math.round((end - d) / 86_400_000);
}

export const BEATS = {
  searchBudgetRaised: dayIndexOf('2026-09-22'),
  capiScheduleBrokenFrom: dayIndexOf('2026-09-27'),
  capiScheduleFixedOn: dayIndexOf('2026-09-30'),
  retargetingPausedFrom: dayIndexOf('2026-10-01'),
  retargetingResumedOn: dayIndexOf('2026-10-06'),
  consultKeyEventRemoved: dayIndexOf('2026-10-06'),
  botTrafficFrom: dayIndexOf('2026-10-08'),
  botTrafficTo: dayIndexOf('2026-10-14'),
  lastOfflineUpload: dayIndexOf('2026-10-10'),
  quoteTriggerBroken: dayIndexOf('2026-10-18'),
};
