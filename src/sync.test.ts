import {Binding, CompletionSync, Ink, Page, SyncPort, addAnchor, anchorTag, lineFor, strikeTag} from './sync';
const b: Binding = {key:'a',enabled:true,idColumn:'id',idValue:'1',statusColumn:'done',completedValue:'1'};
const page: Page = {path:'/Note/test.note',page:0,size:{width:100,height:200}};
const ink: Ink = {type:0,numInPage:1,layerNum:0,userData:anchorTag('a'),maxX:2000,maxY:1000,points:[{x:500,y:800},{x:700,y:200}]};
function fixture(outcome = 'found', done = '1') {
 const elements: Ink[] = [ink];
 const port: SyncPort = {current:jest.fn(async () => page),elements:jest.fn(async () => elements),task:jest.fn(async () => ({queryOutcome:outcome,row:{id:'1',done}})),insert:jest.fn(async (_p,binding) => {elements.push({type:700,numInPage:2,layerNum:0,userData:strikeTag(binding.key)});})};
 return {port,sync:new CompletionSync(port)};
}
test('native completion inserts one strike-through, including after engine restart', async () => {
 const {port,sync} = fixture(); await sync.check([b]); await sync.check([b]); await new CompletionSync(port).check([b]);
 expect(port.insert).toHaveBeenCalledTimes(1);
 expect(port.insert).toHaveBeenCalledWith(page,b,[{x:20,y:60},{x:80,y:60}],0);
});
test.each(['permission_denied','not_found','ambiguous','error'])('%s never changes handwriting', async outcome => {
 const {port,sync} = fixture(outcome); await sync.check([b]); expect(port.insert).not.toHaveBeenCalled();
});
test('open task, disabled link and unrelated handwriting are untouched', async () => {
 const {port,sync} = fixture('found','0');await sync.check([b]);await sync.check([{...b,enabled:false}]);await sync.check([{...b,key:'other'}]);
 expect(port.insert).not.toHaveBeenCalled();
});
test('note switch during task lookup aborts insertion', async () => {
 const {port,sync} = fixture(); (port.current as jest.Mock).mockResolvedValueOnce(page).mockResolvedValue({...page,path:'/Note/other.note'});
 await sync.check([b]);expect(port.insert).not.toHaveBeenCalled();
});
test('erased anchor during task lookup causes no stale mark', async () => {
 const {port,sync} = fixture(); (port.elements as jest.Mock).mockResolvedValueOnce([ink]).mockResolvedValue([]);
 await sync.check([b]);expect(port.insert).not.toHaveBeenCalled();
});
test('uses moved handwriting coordinates when drawing', async () => {
 const {port,sync} = fixture();const moved = {...ink,points:[{x:1000,y:800},{x:1200,y:200}]};
 (port.elements as jest.Mock).mockResolvedValueOnce([ink]).mockResolvedValueOnce([moved]);
 await sync.check([b]);expect(port.insert).toHaveBeenCalledWith(page,b,[{x:20,y:110},{x:80,y:110}],0);
});
test('preserves existing element metadata and rejects conflicting links', () => {
 expect(addAnchor('other-plugin', 'a')).toBe('other-plugin'+anchorTag('a'));
 expect(() => addAnchor(anchorTag('a'),'b')).toThrow();
});
test('invalid coordinates never yield a mark', () => {
 expect(() => lineFor([{...ink,maxX:0}],page.size)).toThrow();
});
test('overlapping completion checks cannot insert duplicate marks', async () => {
 const {port,sync} = fixture();let release!: () => void;
 (port.task as jest.Mock).mockImplementation(() => new Promise(resolve => {release = () => resolve({queryOutcome:'found',row:{id:'1',done:'1'}});}));
 const first = sync.check([b]);
 // Let the first check reach provider I/O, then simulate a lifecycle tick.
 await Promise.resolve();await Promise.resolve();await sync.check([b]);
 release();await first;
 expect(port.task).toHaveBeenCalledTimes(1);expect(port.insert).toHaveBeenCalledTimes(1);
});
test('ink across layers is never changed', async () => {
 const {port,sync} = fixture(); (port.elements as jest.Mock).mockResolvedValue([ink,{...ink,numInPage:2,layerNum:1}]);
 await sync.check([b]);expect(port.insert).not.toHaveBeenCalled();
});
