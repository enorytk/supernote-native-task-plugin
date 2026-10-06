import React, {useCallback, useEffect, useRef, useState} from 'react';
import {AppState, NativeModules, ScrollView, Text, Button, TextInput, View} from 'react-native';
import {changedColumns, observeTask, TaskResult, TaskRow, Watch} from './src/taskState';
const emptyWatch: Watch = {idColumn: '', idValue: '', statusColumn: '', completedValue: ''};
export default function App() {
 const [busy, setBusy] = useState(false);
 const [report, setReport] = useState('Ready. Inspect schema first.');
 const [watch, setWatch] = useState<Watch>(emptyWatch);
 const [monitoring, setMonitoring] = useState(false);
 const [status, setStatus] = useState('No task selected');
 const [baseline, setBaseline] = useState<TaskRow | null>(null);
 const [diff, setDiff] = useState<string[]>([]);
 const inFlight = useRef(false);
 const active = useRef(AppState.currentState === 'active');
 const valid = /^[A-Za-z_][A-Za-z0-9_]*$/.test(watch.idColumn) && !!watch.idValue && !!watch.statusColumn && !!watch.completedValue;
 const run = useCallback(async (operation: () => Promise<unknown>) => {
  if (inFlight.current) return;
  inFlight.current = true; setBusy(true);
  try {
   if (!NativeModules.TaskProviderProbe) throw new Error('Native module missing from plugin package');
   await operation();
  } catch (error) {setStatus('Unknown: ' + String(error)); setReport(String(error));}
  finally {inFlight.current = false; setBusy(false);}
 }, []);
 const refresh = useCallback((capture = false) => run(async () => {
  const result: TaskResult = await NativeModules.TaskProviderProbe.readTask(watch.idColumn, watch.idValue);
  const observation = observeTask(result, watch);
  setStatus(observation.message + (observation.value === null ? '' : ` (value: ${observation.value})`));
  setReport(JSON.stringify(result, null, 2));
  if (result.queryOutcome === 'found' && result.row) {
   if (capture) {setBaseline(result.row); setDiff([]);}
   else if (baseline) setDiff(changedColumns(baseline, result.row));
  } else setDiff([]);
 }), [run, watch, baseline]);
 useEffect(() => {
  const sub = AppState.addEventListener('change', next => {
   active.current = next === 'active';
   if (active.current && monitoring && valid) void refresh();
  });
  const timer = setInterval(() => {if (active.current && monitoring && valid) void refresh();}, 15000);
  return () => {sub.remove(); clearInterval(timer);};
 }, [monitoring, valid, refresh]);
 function edit(key: keyof Watch, value: string) {
  setMonitoring(false); setBaseline(null); setDiff([]); setStatus('Configuration changed; capture a new baseline');
  setWatch(previous => ({...previous, [key]: value}));
 }
 return <ScrollView contentContainerStyle={{padding: 24, gap: 16}}>
  <Text style={{fontSize: 28}}>Native task watcher</Text>
  <Text>Read native task state and compare it before and after completion. No tasks or handwriting are changed.</Text>
  <Button title="Inspect provider and schema" disabled={busy} onPress={() => run(async () => setReport(JSON.stringify(await NativeModules.TaskProviderProbe.inspect(false), null, 2)))} />
  <Button title="Read 5 task samples" disabled={busy} onPress={() => run(async () => setReport(JSON.stringify(await NativeModules.TaskProviderProbe.inspect(true), null, 2)))} />
  <Text>Samples contain private task data. Use the returned schema to configure a specific task. Completion values vary by firmware.</Text>
  {(['idColumn', 'idValue', 'statusColumn', 'completedValue'] as const).map(key =>
   <View key={key}><Text>{({idColumn: 'Task ID column', idValue: 'Task ID value', statusColumn: 'Completion column', completedValue: 'Completed value'})[key]}</Text>
    <TextInput editable={!busy} value={watch[key]} onChangeText={value => edit(key, value)} autoCapitalize="none" autoCorrect={false} style={{borderWidth: 1, padding: 10, fontSize: 18}} />
   </View>)}
  <Button title="Capture baseline" disabled={busy || !valid} onPress={() => refresh(true)} />
  <Button title="Check selected task now" disabled={busy || !valid} onPress={() => refresh()} />
  <Button title={monitoring ? 'Stop watching' : 'Watch every 15 seconds while active'} disabled={busy || !valid} onPress={() => {setMonitoring(!monitoring); if (!monitoring) void refresh();}} />
  <Text style={{fontSize: 22}}>{status}</Text>
  <Text>{baseline ? `Columns changed since baseline: ${diff.join(', ') || 'none'}` : 'Capture a baseline to compare columns.'}</Text>
  <Text>Watch settings last for this screen session. Return from native To-Do and check the task again. Automatic note linking and ink strike-through require a device test.</Text>
  {busy && <Text>Reading… Cancellation is requested after 10 seconds. Close the plugin if the provider hangs.</Text>}
  <Text selectable style={{fontSize: 16}}>{report}</Text>
 </ScrollView>;
}
