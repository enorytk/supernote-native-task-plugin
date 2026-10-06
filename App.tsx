import React, {useEffect, useState} from 'react';
import {NativeModules, ScrollView, Text, Button, TextInput, View} from 'react-native';
import {Watch, TaskRow} from './src/taskState';
import {bindSelection, checkNow, initialize, removeBinding, state, subscribe, reportError} from './src/runtime';
export default function App() {
 const [busy,setBusy] = useState(false);
 const [view,setView] = useState(state());
 const [watch,setWatch] = useState<Watch>({idColumn:'',idValue:'',statusColumn:'',completedValue:''});
 const [rows,setRows] = useState<TaskRow[]>([]);
 const [columns,setColumns] = useState<string[]>([]);
 const [report,setReport] = useState('');
 useEffect(() => {
  const stop = subscribe(() => setView(state()));
  initialize().then(() => {setView(state()); const saved = state().bindings[0]; if (saved) setWatch({...saved,idValue:''});}).catch(reportError);
  return stop;
 },[]);
 async function run(action: () => Promise<void>) {
  if (busy) return;setBusy(true);
  try {await action();} catch(error) {reportError(error);} finally {setBusy(false);}
 }
 return <ScrollView contentContainerStyle={{padding:24,gap:14}}>
  <Text style={{fontSize:28}}>Native Task Sync</Text>
  <Text>{view.message}</Text>
  <Text>Check a linked task in the native To-Do app, then open its source note page. The plugin adds one strike-through across the linked handwriting. Original ink is preserved.</Text>
  <Button title="Check this note now" disabled={busy} onPress={() => run(checkNow)} />
  {view.bindings.map(b => <View key={b.key} style={{borderWidth:1,padding:10}}>
   <Text>Task {b.idValue}: {b.enabled ? 'automatic sync enabled' : 'paused'}</Text>
   <Button title="Stop tracking this task" disabled={busy} onPress={() => run(() => removeBinding(b.key))} />
  </View>)}
  <Text style={{fontSize:22}}>Link handwriting to a native task</Text>
  <Text>{view.pending ? 'Handwriting selected. Choose its existing native task below.' : 'First create the task using native lasso-to-task. Then lasso the same handwriting and tap Link native task.'}</Text>
  <Button title="Load native tasks and columns" disabled={busy} onPress={() => run(async () => {
   const result = await NativeModules.TaskProviderProbe.inspect(true);
   setReport(JSON.stringify(result,null,2));setRows(result.samples || []);setColumns(result.columns || []);
  })} />
  <Text>Columns: {columns.join(', ') || 'load tasks first'}</Text>
  <Text>For this firmware, enter the task ID column, completion column, and completed value once. Use before/after records to verify the completed value; it is not assumed.</Text>
  {(['idColumn','idValue','statusColumn','completedValue'] as const).map(key => <View key={key}>
   <Text>{({idColumn:'Task ID column',idValue:'Task ID',statusColumn:'Completion column',completedValue:'Completed value'})[key]}</Text>
   <TextInput editable={!busy} value={watch[key]} autoCapitalize="none" autoCorrect={false} onChangeText={value => setWatch(prev => ({...prev,[key]:value}))} style={{borderWidth:1,padding:10,fontSize:18}} />
  </View>)}
  {!!watch.idColumn && rows.filter(row => row[watch.idColumn] != null).map((row,index) => <View key={index} style={{borderWidth:1,padding:8}}>
   <Text>{Object.entries(row).filter(([key]) => /title|name|content|status|complete|done/i.test(key)).map(([key,value]) => `${key}: ${String(value).slice(0,150)}`).join('\n') || `Task ${row[watch.idColumn]}`}</Text>
   <Button title={`Choose ${row[watch.idColumn]}`} disabled={busy} onPress={() => setWatch(prev => ({...prev,idValue:row[prev.idColumn] || ''}))} />
  </View>)}
  <Button title="Save link and enable automatic strike-through" disabled={busy || !view.pending || !watch.idValue || !watch.completedValue} onPress={() => run(() => bindSelection(watch))} />
  <Text>Task preview is capped at 200 records. Settings are saved on-device. Unchecking a task does not erase existing strike-through; use note undo or the eraser. If the host stops the plugin, open Native Task Sync once to resume.</Text>
  <Text selectable>{report}</Text>
 </ScrollView>;
}
