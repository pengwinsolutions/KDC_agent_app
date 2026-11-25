/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { registerBackgroundPush } from './src/notifications/push';
import { name as appName } from './app.json';

// Push that arrives while the app is closed (on only when Firebase is configured).
registerBackgroundPush();

AppRegistry.registerComponent(appName, () => App);
