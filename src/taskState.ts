export type TaskRow = Record<string, string | null>;
export type TaskResult = {queryOutcome: string; row?: TaskRow; error?: string};
export type Watch = {idColumn: string; idValue: string; statusColumn: string; completedValue: string};
export type Observation = {state: 'complete' | 'open' | 'unknown'; value: string | null; message: string};
export function observeTask(result: TaskResult, watch: Watch): Observation {
 if (result.queryOutcome !== 'found' || !result.row) {
  return {state: 'unknown', value: null, message: result.error || result.queryOutcome};
 }
 const row = result.row;
 if (row[watch.idColumn] !== watch.idValue) {
  return {state: 'unknown', value: null, message: 'Returned task identity does not match'};
 }
 if (!Object.prototype.hasOwnProperty.call(row, watch.statusColumn) || row[watch.statusColumn] === null) {
  return {state: 'unknown', value: null, message: 'Completion column is missing or null'};
 }
 const value = row[watch.statusColumn];
 return {state: value === watch.completedValue ? 'complete' : 'open', value,
  message: value === watch.completedValue ? 'Task is complete' : 'Task does not match the configured completed value'};
}
export function changedColumns(before: TaskRow, after: TaskRow): string[] {
 return [...new Set([...Object.keys(before), ...Object.keys(after)])]
  .filter(key => before[key] !== after[key]).sort();
}
