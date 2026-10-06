let mockRows: any[];
let mockInk: any[];
let mockSaved: string;
let mockDone: string;
let mockPermission: number;
let mockTaskOutcome: string;
jest.mock('react-native', () => ({
 NativeModules: {TaskProviderProbe: {
  loadBindings: jest.fn(async () => mockSaved),
  saveBindings: jest.fn(async (json: string) => {mockSaved = json;return true;}),
  readTask: jest.fn(async () => ({queryOutcome: mockTaskOutcome,row:{id:'t1',done:mockDone}})),
 }},
 ToastAndroid: {show: jest.fn(),LONG:1},
}));
jest.mock('sn-plugin-lib', () => ({
 PluginManager: {hasPermission: jest.fn(async () => mockPermission),requestPermission: jest.fn(async () => 0)},
 PluginCommAPI: {
  getCurrentFilePath: jest.fn(async () => ({success:true,result:'/Note/test.note'})),
  getCurrentPageNum: jest.fn(async () => ({success:true,result:0})),
  getPageDisplaySize: jest.fn(async () => ({success:true,result:{width:100,height:200}})),
  getLassoElements: jest.fn(async () => ({success:true,result:mockInk.filter(e => e.type === 0).map(e => ({...e}))})),
  modifyPageElements: jest.fn(async (elements: any[]) => {mockInk = mockInk.map(e => elements.find(x => x.numInPage === e.numInPage) || e);return {success:true,result:true};}),
  createElement: jest.fn(async () => ({success:true,result:{uuid:'line',numInPage:1}})),
  insertPageElements: jest.fn(async (elements: any[]) => {mockRows = elements;mockInk.push(...elements.map(e => ({...e,numInPage:2})));return {success:true,result:true};}),
 },
 PluginFileAPI: {getElements: jest.fn(async () => ({success:true,result:mockInk.map(e => ({...e}))}))},
}));
let runtime: typeof import('./runtime');
beforeEach(() => {
 jest.resetModules();
 mockRows=[];mockSaved='[]';mockDone='0';mockPermission=1;mockTaskOutcome='found';
 mockInk=[{type:0,numInPage:1,layerNum:0,userData:'existing metadata',maxX:2000,maxY:1000,stroke:{points:[{x:500,y:800},{x:700,y:200}]}}];
 runtime=require('./runtime');
});
const watch={idColumn:'id',idValue:'t1',statusColumn:'done',completedValue:'1'};
test('SDK adapter persists lasso binding and writes a tagged strike only after native completion', async () => {
 await runtime.captureSelection();await runtime.bindSelection(watch);
 expect(mockRows).toHaveLength(0);
 expect(JSON.parse(mockSaved)[0].enabled).toBe(true);
 expect(mockInk[0].userData).toContain('existing metadata');
 mockDone='1';await runtime.checkNow();await runtime.checkNow();
 expect(mockInk.filter(e => e.type === 700)).toHaveLength(1);
 expect(mockRows[0].geometry.points).toEqual([{x:20,y:60},{x:80,y:60}]);
 expect(mockRows[0].userData).toMatch(/^SNTaskStrike:/);
});
test('saved links resume after runtime reload without adding duplicate geometry', async () => {
 await runtime.captureSelection();await runtime.bindSelection(watch);mockDone='1';await runtime.checkNow();
 jest.resetModules();runtime=require('./runtime');await runtime.initialize();await runtime.checkNow();
 expect(runtime.state().bindings).toHaveLength(1);
 expect(mockInk.filter(e => e.type === 700)).toHaveLength(1);
});
test('provider denial after binding leaves original ink intact', async () => {
 await runtime.captureSelection();await runtime.bindSelection(watch);mockTaskOutcome='permission_denied';mockDone='1';await runtime.checkNow();
 expect(mockInk.filter(e => e.type === 700)).toHaveLength(0);
});
test('note permission revocation prevents insertion', async () => {
 await runtime.captureSelection();await runtime.bindSelection(watch);mockPermission=0;mockDone='1';await runtime.checkNow();
 expect(mockRows).toHaveLength(0);
});
test('firmware losing anchor metadata never enables the binding', async () => {
 const sdk=require('sn-plugin-lib');sdk.PluginCommAPI.modifyPageElements.mockImplementation(async () => ({success:true,result:true}));
 await runtime.captureSelection();await expect(runtime.bindSelection(watch)).rejects.toThrow('anchor tags');
 expect(JSON.parse(mockSaved)[0].enabled).toBe(false);expect(mockRows).toHaveLength(0);
});
