import {AppRegistry, Image} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import {PluginManager} from 'sn-plugin-lib';
import {captureSelection, startSync, toast, checkNow} from './src/runtime';
AppRegistry.registerComponent(appName, () => App);
PluginManager.init();
const icon = Image.resolveAssetSource(require('./assets/icon.png')).uri;
PluginManager.registerButton(1, ['NOTE'], {id: 81001, name: 'Native Task Sync', icon, showType: 1});
PluginManager.registerButton(2, ['NOTE'], {id: 81002, name: 'Link native task', icon, editDataTypes: [0], showType: 1});
PluginManager.registerButtonListener({async onButtonPress(event) {
 try {
  if (event?.id === 81002) {await captureSelection(); await PluginManager.showPluginView();}
  if (event?.id === 81001) {await PluginManager.showPluginView(); await checkNow();}
 } catch (error) {toast(error);}
}});
startSync();
