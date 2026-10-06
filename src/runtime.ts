import {NativeModules, ToastAndroid} from 'react-native';
import {PluginCommAPI, PluginFileAPI, PluginManager} from 'sn-plugin-lib';
import {Binding, CompletionSync, Ink, Page, Point, addAnchor, hasAnchor, samePage, strikeTag} from './sync';
import {Watch, observeTask} from './taskState';
const native = () => NativeModules.TaskProviderProbe;
export function unwrap<T>(value: any): T {
 if (!value?.success) throw new Error(value?.error?.message || 'Supernote API failed');
 return value.result as T;
}
let bindings: Binding[] = [];
let pending: {page: Page; elements: any[]} | null = null;
let message = 'Lasso handwriting and choose Link native task to get started.';
const listeners = new Set<() => void>();
let loaded: Promise<void> | null = null;
const notify = () => listeners.forEach(fn => fn());
export function subscribe(fn: () => void): () => void {listeners.add(fn); return () => {listeners.delete(fn);};}
export const state = () => ({bindings: [...bindings], pending: !!pending, message});
export function initialize(): Promise<void> {
 if (!loaded) loaded = (async () => {
  const parsed = JSON.parse(await native().loadBindings());
  if (!Array.isArray(parsed) || parsed.some(b => typeof b.key !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(b.idColumn) || ['idValue','statusColumn','completedValue'].some(k => typeof b[k] !== 'string'))) throw new Error('Stored task links are invalid');
  bindings = parsed; notify();
 })();
 return loaded;
}
async function persist(next: Binding[]) {await native().saveBindings(JSON.stringify(next)); bindings = next; notify();}
async function permissions(prompt: boolean): Promise<boolean> {
 for (const permission of ['plugin.permission.FILE:READ','plugin.permission.FILE:WRITE']) {
  if (await PluginManager.hasPermission(permission) === 1) continue;
  if (!prompt) return false;
  const grant = await PluginManager.requestPermission(permission, 'Read linked handwriting and add strike-through marks when native tasks are complete.');
  if (grant !== 1 && grant !== 2) throw new Error('Note permissions were denied');
 }
 return true;
}
async function current(): Promise<Page | null> {
 const path = unwrap<string>(await PluginCommAPI.getCurrentFilePath());
 if (!path?.endsWith('.note')) return null;
 const page = unwrap<number>(await PluginCommAPI.getCurrentPageNum());
 const size = unwrap<{width: number; height: number}>(await PluginCommAPI.getPageDisplaySize());
 if (!Number.isInteger(page) || page < 0) return null;
 return {path, page, size};
}
async function recycle(elements: any[]) {for (const e of elements) if (e.recycle) await e.recycle();}
async function points(value: any): Promise<Point[]> {
 if (Array.isArray(value)) return value;
 if (!value?.size || !value?.getRange) throw new Error('Stroke point accessor is unavailable');
 const count = await value.size();
 if (count < 1 || count > 100000) throw new Error('Unsupported stroke point count');
 return value.getRange(0, count);
}
async function elements(page: Page): Promise<Ink[]> {
 const raw = unwrap<any[]>(await PluginFileAPI.getElements(page.page, page.path));
 try {
  const result: Ink[] = [];
  for (const e of raw) result.push({numInPage: e.numInPage, layerNum: e.layerNum, type: e.type,
   userData: e.userData, maxX: e.maxX, maxY: e.maxY,
   points: e.type === 0 && bindings.some(b => b.enabled && hasAnchor(e, b.key)) ? await points(e.stroke?.points) : undefined});
  return result;
 } finally {await recycle(raw);}
}
const sync = new CompletionSync({current, elements,
 task: binding => native().readTask(binding.idColumn, binding.idValue),
 async insert(page, binding, line, layer) {
  const el = unwrap<any>(await PluginCommAPI.createElement(700));
  try {
   el.type = 700; el.pageNum = page.page; el.layerNum = layer;
   el.userData = strikeTag(binding.key);
   el.geometry = {type: 'straightLine', penColor: 0, penType: 10, penWidth: 150, points: line};
   if (!samePage(await current(), page)) throw new Error('Note changed before mark insertion');
   unwrap(await PluginCommAPI.insertPageElements([el], page.page, layer));
   const after = await elements(page);
   if (!after.some(e => e.userData === strikeTag(binding.key))) {
    // Metadata retention is essential for idempotence. Never retry an untagged mark.
    await persist(bindings.map(b => b.key === binding.key ? {...b, enabled: false} : b));
    throw new Error('Firmware did not retain the strike-through tag; this task link was paused to prevent duplicate marks');
   }
  } finally {await recycle([el]);}
 }
});
export async function captureSelection(): Promise<void> {
 await initialize(); await permissions(true);
 const page = await current();
 if (!page) throw new Error('Open a handwritten note first');
 const selected = unwrap<any[]>(await PluginCommAPI.getLassoElements());
 if (!selected.length || selected.some(e => e.type !== 0)) {await recycle(selected); throw new Error('Lasso only the handwriting for one task');}
 if (pending) await recycle(pending.elements);
 pending = {page, elements: selected};
 message = 'Choose the corresponding native task and save this link.'; notify();
}
export async function bindSelection(watch: Watch): Promise<void> {
 await initialize();
 if (!pending || !samePage(await current(), pending.page)) throw new Error('Lasso the task handwriting again in its source note');
 if (!watch.idValue || !watch.statusColumn || !watch.completedValue) throw new Error('Configure task identity and completion value');
 const result = await native().readTask(watch.idColumn, watch.idValue);
 if (observeTask(result, watch).state === 'unknown') throw new Error('Task identity or completion column could not be verified');
 const key = Date.now().toString(36) + Math.random().toString(36).slice(2,10);
 const binding: Binding = {...watch, key, enabled: false};
 // Validate all elements before writing any metadata.
 if (new Set(pending.elements.map(e => e.layerNum)).size !== 1) throw new Error('Select handwriting on a single layer');
 const tags = pending.elements.map(e => addAnchor(e.userData, key));
 await persist([...bindings, binding]);
 const page = pending.page, selected = pending.elements;
 try {
  selected.forEach((e,i) => {e.userData = tags[i];});
  if (!samePage(await current(), page)) throw new Error('Note changed while linking');
  unwrap(await PluginCommAPI.modifyPageElements(selected, page.page, selected[0].layerNum));
  const saved = await elements(page);
  if (saved.filter(e => hasAnchor(e,key)).length !== selected.length) throw new Error('Firmware did not preserve task anchor tags; link remains paused');
  await persist(bindings.map(b => b.key === key ? {...b,enabled:true} : b));
  message = 'Linked. Checking this task in native To-Do will cross out this handwriting when its page is open.';
 } finally {await recycle(selected); pending = null; notify();}
 await checkNow();
}
export async function removeBinding(key: string) {await initialize(); await persist(bindings.filter(b => b.key !== key));}
export async function checkNow(): Promise<void> {
 await initialize();
 if (!bindings.some(b => b.enabled)) return;
 if (!await permissions(false)) {message = 'Allow note read/write permissions to resume task sync.';notify();return;}
 const messages = await sync.check(bindings);
 if (messages.length) {message = messages.join('\n');notify();}
}
export function reportError(error: unknown) {message = String(error);notify();}
let started = false;
export function startSync() {
 if (started) return; started = true;
 // No note-open event is exposed in SDK 0.1.65. Check the visible note/page
 // periodically and on plugin lifecycle transitions. Never navigate/edit closed notes.
 const tick = () => {checkNow().catch(reportError);};
 initialize().then(tick).catch(reportError);
 setInterval(tick, 5000);
 PluginManager.registerPluginLifeListener({onMsg() {tick();}});
}
export function toast(error: unknown) {reportError(error);ToastAndroid.show(String(error),ToastAndroid.LONG);}
