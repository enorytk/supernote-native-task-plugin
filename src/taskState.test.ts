import {observeTask, changedColumns, Watch} from './taskState';
const watch: Watch = {idColumn: 'id', idValue: 'task-1', statusColumn: 'done', completedValue: '1'};
test('recognizes the configured completion value without assuming cloud schema', () => {
 expect(observeTask({queryOutcome: 'found', row: {id: 'task-1', done: '0'}}, watch).state).toBe('open');
 expect(observeTask({queryOutcome: 'found', row: {id: 'task-1', done: '1'}}, watch).state).toBe('complete');
});
test.each(['permission_denied', 'not_found', 'ambiguous', 'error'])('%s is unknown rather than completed', outcome => {
 expect(observeTask({queryOutcome: outcome}, watch).state).toBe('unknown');
});
test('rejects missing completion data and mismatched identity', () => {
 expect(observeTask({queryOutcome: 'found', row: {id: 'task-1'}}, watch).state).toBe('unknown');
 expect(observeTask({queryOutcome: 'found', row: {id: 'other', done: '1'}}, watch).state).toBe('unknown');
});
test('detects changed and removed columns', () => {
 expect(changedColumns({id: 'x', done: '0', old: 'y'}, {id: 'x', done: '1'})).toEqual(['done', 'old']);
});
