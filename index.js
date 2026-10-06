import {AppRegistry, Image} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import {PluginManager} from 'sn-plugin-lib';
AppRegistry.registerComponent(appName, () => App);
PluginManager.init();
PluginManager.registerButton(1, ['NOTE'], {id: 81001, name: 'Task provider probe', icon: Image.resolveAssetSource(require('./assets/icon.png')).uri, showType: 1});
PluginManager.registerButtonListener({onButtonPress(event) {if (event?.id === 81001) PluginManager.showPluginView();}});
