import React, { useEffect } from 'react';
import { Linking, StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { devLaunchScreen, devLink, navigationRef, resetAction, resetRoot } from './navigation';
import type { RouteName } from './routes';
import * as Auth from '../screens/auth';
import { HomeScreen } from '../screens/home';
import { SampleScreen, TestDetailsScreen } from '../screens/collection';
import { CollectPaymentScreen } from '../screens/payment';
import { BookingDetailsScreen } from '../screens/details';
import { DeliveryDetailsScreen } from '../screens/deliveries';
import * as Account from '../screens/account';
import { setSessionExpiredHandler } from '../api/client';
import { flushPendingPush, pausePush, startPush } from '../notifications/push';
import { useSession } from '../store/session';
import { showToast } from '../store/toast';

const Stack = createNativeStackNavigator();

/** The spec's screens (less the wallet) and delivery details, one stack. */
export const SCREENS: { name: RouteName; component: React.ComponentType<any>; title: string }[] = [
  { name: 'splash', component: Auth.SplashScreen, title: 'Splash' },
  { name: 'login', component: Auth.LoginScreen, title: 'Agent Login' },
  { name: 'otp', component: Auth.OtpScreen, title: 'OTP Verification' },
  { name: 'home', component: HomeScreen, title: 'Active Bookings' },
  { name: 'test-details', component: TestDetailsScreen, title: 'Test Details' },
  { name: 'sample', component: SampleScreen, title: 'Sample Collection' },
  { name: 'collect-payment', component: CollectPaymentScreen, title: 'Collect Payment' },
  { name: 'profile', component: Account.ProfileScreen, title: 'Profile' },
  { name: 'history', component: Account.HistoryScreen, title: 'Booking History' },
  { name: 'booking-details', component: BookingDetailsScreen, title: 'Booking Details' },
  { name: 'delivery-details', component: DeliveryDetailsScreen, title: 'Delivery Details' },
  { name: 'notifications', component: Account.NotificationsScreen, title: 'Notifications' },
  { name: 'help', component: Account.HelpScreen, title: 'Need Help' },
  { name: 'policy', component: Account.PolicyScreen, title: 'Policy' },
];

/** Development only: `kdcagent://s/<screen>?bookingId=…` opens a screen for QA. */
function useDevDeepLink() {
  useEffect(() => {
    if (!__DEV__) return;
    const open = (url: string | null) => {
      const m = url?.match(/:\/\/s\/([\w-]+)(?:\?(.*))?/);
      if (!m || !navigationRef.isReady()) return;
      const params: Record<string, string> = {};
      for (const kv of (m[2] ?? '').split('&').filter(Boolean)) {
        const [k, v] = kv.split('=');
        params[decodeURIComponent(k)] = decodeURIComponent(v ?? '');
      }
      devLink.active = true;
      if (!useSession.getState().token && !['splash', 'login', 'otp'].includes(m[1])) useSession.getState().setToken('kdc-agent-dev');
      navigationRef.dispatch(resetAction(m[1], params));
    };
    const sub = Linking.addEventListener('url', (e) => open(e.url));
    return () => sub.remove();
  }, []);
}

/**
 * Push while signed in: after the OTP, and on launch once the session is restored. Registers this
 * phone (with its FCM token) and links the sign-in to it. Sign-out unregisters it (account.tsx).
 */
function usePush() {
  const signedIn = useSession((s) => Boolean(s.token));
  useEffect(() => {
    if (!signedIn) return;
    startPush();
    return pausePush;
  }, [signedIn]);
}

export function RootNavigator() {
  useDevDeepLink();
  usePush();
  useEffect(() => {
    setSessionExpiredHandler(() => {
      showToast('Your session has expired. Please log in again.', 'critical');
      resetRoot('login');
    });
  }, []);

  return (
    <NavigationContainer
      ref={navigationRef}
      onReady={() => {
        const id = devLaunchScreen();
        if (id) navigationRef.dispatch(resetAction(id));
        flushPendingPush();
      }}
      onStateChange={flushPendingPush}
    >
      <StatusBar barStyle="dark-content" />
      <Stack.Navigator
        initialRouteName="splash"
        screenOptions={{ headerShown: false, gestureEnabled: false, animation: 'slide_from_right' }}
      >
        {SCREENS.map((s) => (
          <Stack.Screen key={s.name} name={s.name} component={s.component} options={s.name === 'splash' || s.name === 'home' ? { animation: 'fade' } : undefined} />
        ))}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
