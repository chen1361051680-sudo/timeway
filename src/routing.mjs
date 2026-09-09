// Pure recommendation rules; provider requests and secrets belong in adapters.mjs.
export function routeFits(task, route, filter = {}) {
  const known = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  if (filter.distance && (!known(route.distance) || route.distance > Number(filter.distance))) return false;
  if (filter.arrival && (!known(route.minutes) || route.minutes > Number(filter.arrival))) return false;
  if (filter.budget) {
    if (!known(route.minutes) || !known(route.returnMinutes)) return false;
    const buffer = Number(filter.buffer ?? 10),
      budget = Number(filter.budget);
    if (!Number.isFinite(buffer) || buffer < 0 || !Number.isFinite(budget) || budget <= 0) return false;
    const occupied = Math.max(task.minutes, (Date.parse(task.end) - Date.parse(task.start)) / 60000);
    if (occupied + route.minutes + route.returnMinutes + buffer > budget) return false;
  }
  return true;
}
