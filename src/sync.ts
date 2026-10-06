import {TaskResult, Watch, observeTask} from './taskState';
export type Point = {x: number; y: number};
export type Size = {width: number; height: number};
export type Ink = {numInPage: number; layerNum: number; type: number; userData?: string; points?: Point[]; maxX?: number; maxY?: number};
export type Binding = Watch & {key: string; enabled: boolean};
export type Page = {path: string; page: number; size: Size};
export type SyncPort = {
 current(): Promise<Page | null>;
 elements(page: Page): Promise<Ink[]>;
 task(binding: Binding): Promise<TaskResult>;
 insert(page: Page, binding: Binding, line: Point[], layer: number): Promise<void>;
};
const anchorPrefix = '\nSNTaskAnchor:';
export const strikeTag = (key: string) => `SNTaskStrike:${key}`;
export function anchorTag(key: string): string {return anchorPrefix + key + '\n';}
export function hasAnchor(ink: Ink, key: string): boolean {return (ink.userData || '').includes(anchorTag(key));}
export function addAnchor(data: string | undefined, key: string): string {
 if ((data || '').includes(anchorPrefix)) throw new Error('This handwriting is already linked to a task');
 return (data || '') + anchorTag(key);
}
export function lineFor(inks: Ink[], size: Size): Point[] {
 if (!(size.width > 1 && size.height > 1)) throw new Error('Invalid page size');
 const points: Point[] = [];
 for (const ink of inks) {
  if (ink.type !== 0 || !ink.maxX || !ink.maxY || !ink.points?.length) throw new Error('Handwriting coordinates are unavailable');
  for (const p of ink.points) {
   const x = size.width - (p.y / ink.maxY) * size.width;
   const y = (p.x / ink.maxX) * size.height;
   if (!Number.isFinite(x) || !Number.isFinite(y) || x < -1 || y < -1 || x > size.width + 1 || y > size.height + 1) throw new Error('Unsupported handwriting coordinates');
   points.push({x, y});
  }
 }
 if (!points.length) throw new Error('Linked handwriting not found');
 let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
 for (const p of points) {left = Math.min(left,p.x);right = Math.max(right,p.x);top = Math.min(top,p.y);bottom = Math.max(bottom,p.y);}
 const y = (top + bottom) / 2;
 if (right - left < 2) throw new Error('Handwriting is too narrow to strike through');
 return [{x: left, y}, {x: right, y}];
}
export function samePage(a: Page | null, b: Page): boolean {
 return !!a && a.path === b.path && a.page === b.page && a.size.width === b.size.width && a.size.height === b.size.height;
}
export class CompletionSync {
 private running = false;
 constructor(private port: SyncPort) {}
 async check(bindings: Binding[]): Promise<string[]> {
  if (this.running) return [];
  this.running = true;
  const messages: string[] = [];
  try {
   const page = await this.port.current();
   if (!page || !bindings.some(b => b.enabled)) return [];
   const elements = await this.port.elements(page);
   for (const binding of bindings.filter(b => b.enabled)) {
    const anchors = elements.filter(e => e.type === 0 && hasAnchor(e, binding.key));
    if (!anchors.length || elements.some(e => e.userData === strikeTag(binding.key))) continue;
    const result = observeTask(await this.port.task(binding), binding);
    if (result.state === 'unknown') {messages.push(`Task ${binding.idValue}: ${result.message}`); continue;}
    if (result.state !== 'complete') continue;
    if (!samePage(await this.port.current(), page)) return messages;
    // Refresh after provider I/O: ink may have been moved or erased meanwhile.
    const fresh = await this.port.elements(page);
    if (fresh.some(e => e.userData === strikeTag(binding.key))) continue;
    const selected = fresh.filter(e => e.type === 0 && hasAnchor(e, binding.key));
    if (!selected.length) continue;
    const layers = new Set(selected.map(e => e.layerNum));
    if (layers.size !== 1) {messages.push('Linked ink spans multiple layers; no mark added'); continue;}
    const line = lineFor(selected, page.size);
    if (!samePage(await this.port.current(), page)) return messages;
    await this.port.insert(page, binding, line, selected[0].layerNum);
    messages.push(`Crossed out task ${binding.idValue}`);
   }
   return messages;
  } finally {this.running = false;}
 }
}
