/** Every screen renders, inside real navigation, from the demo data. */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SCREENS } from '../src/navigation/RootNavigator';
import { resetMockDb } from '../src/api/mockServer';
import { useSession } from '../src/store/session';
import { Button } from '../src/components/ui/Button';

jest.setTimeout(30000);

const PARAMS: Record<string, object> = {
  otp: { mobile: '9876543210' },
  'test-details': { bookingId: 'KDC-HC-10415' },
  sample: { bookingId: 'KDC-HC-10415', patientKey: 'other-502' },
  'collect-payment': { bookingId: 'KDC-HC-10418', mode: 'booking', completeAfter: true },
  'booking-details': { bookingId: 'KDC-HC-10421' },
  'delivery-details': { code: 'KDC-PH-7K2M9Q1A' },
  policy: { path: 'privacy-policy', title: 'Privacy Policy' },
};

const Stack = createNativeStackNavigator();

beforeAll(() => {
  resetMockDb();
  useSession.setState({ token: 'test-token' });
});

it('registers the 14 screens (spec’s 14 minus the removed wallet, plus delivery details)', () => {
  expect(SCREENS).toHaveLength(14);
});

async function mount(name: string, params?: object, ms = 900) {
  const screen = SCREENS.find((x) => x.name === name)!;
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name={screen.name} component={screen.component} initialParams={params} />
        </Stack.Navigator>
      </NavigationContainer>,
    );
    await new Promise<void>((r) => setTimeout(r, 50));
  });
  // Screens fetch once focused; the demo backend answers after up to 600 ms.
  await ReactTestRenderer.act(async () => {
    await new Promise<void>((r) => setTimeout(r, ms));
  });
  return tree!;
}

/** Every string rendered, for "does the screen say X". */
function texts(tree: ReactTestRenderer.ReactTestRenderer): string {
  const out: string[] = [];
  const walk = (n: any) => {
    if (n === null || n === undefined) return;
    if (typeof n === 'string') {
      out.push(n);
      return;
    }
    if (Array.isArray(n)) return n.forEach(walk);
    walk(n.children);
  };
  walk(tree.toJSON());
  return out.join(' ').replace(/\s+/g, ' ');
}

/** Presses the Button labelled `label`. */
const pressButton = async (tree: ReactTestRenderer.ReactTestRenderer, label: string) => {
  const [hit] = tree.root.findAll((n) => n.type === Button && n.props.children === label);
  if (!hit) throw new Error(`no button “${label}”`);
  await ReactTestRenderer.act(async () => {
    hit.props.onClick();
    await new Promise<void>((r) => setTimeout(r, 50));
  });
};

for (const s of SCREENS) {
  it(`${s.name} renders`, async () => {
    const tree = await mount(s.name, PARAMS[s.name]);
    expect(tree.toJSON()).toBeTruthy();
    await ReactTestRenderer.act(async () => tree.unmount());
  });
}

describe('deliveries', () => {
  it('Home switches to deliveries: cards with pickup → drop, cash to collect, prepaid, bring back', async () => {
    const tree = await mount('home', { tab: 'deliveries' }, 2000);
    const t = texts(tree);
    expect(t).toContain('Today’s deliveries');
    expect(t).toContain('Collections');
    expect(t).toContain('KDC-PH-7K2M9Q1A');
    expect(t).toContain('Apollo Pharmacy');
    expect(t).toContain('Kondapur, Hyderabad');
    expect(t).toContain('Collect ₹486');
    expect(t).toContain('Prepaid');
    expect(t).toContain('Bring the parcel back to Apollo Pharmacy');
    await ReactTestRenderer.act(async () => tree.unmount());
  });

  it('History lists past deliveries', async () => {
    const tree = await mount('history', { tab: 'deliveries' }, 2000);
    const t = texts(tree);
    expect(t).toContain('Past deliveries');
    expect(t).toContain('KDC-PH-2HD7K5PC');
    expect(t).toContain('Cash collected · ₹312');
    await ReactTestRenderer.act(async () => tree.unmount());
  });

  it('the profile shows the agent’s skills', async () => {
    const tree = await mount('profile', undefined, 2000);
    const t = texts(tree);
    expect(t).toContain('Home sample collection');
    expect(t).toContain('Medicine delivery');
    await ReactTestRenderer.act(async () => tree.unmount());
  });

  it('delivery details: pickup and drop cards; Deliver asks for the patient’s code and confirms the cash', async () => {
    const tree = await mount('delivery-details', { code: 'KDC-PH-7K2M9Q1A' }, 2000);
    let t = texts(tree);
    expect(t).toContain('Pick up');
    expect(t).toContain('Plot 12, Hitech City Road, Madhapur, Hyderabad, 500081');
    expect(t).toContain('Deliver to');
    expect(t).toContain('Lakshmi Reddy');
    expect(t).toContain('Picked up the parcel');
    expect(t).toContain('Couldn’t deliver');
    await pressButton(tree, 'Deliver');
    t = texts(tree);
    expect(t).toContain('Enter the delivery code');
    expect(t).toContain('I collected ₹486 in cash from the patient');
    expect(t).toContain('Take a photo of the parcel');
    await ReactTestRenderer.act(async () => tree.unmount());
  });

  it('a failed delivery shows why and where the parcel goes', async () => {
    const tree = await mount('delivery-details', { code: 'KDC-PH-9TR4B6WN' }, 2000);
    const t = texts(tree);
    expect(t).toContain('Couldn’t deliver: Patient not at home');
    expect(t).toContain('Bring the parcel back to Apollo Pharmacy.');
    expect(t).not.toContain('Mark delivered');
    await ReactTestRenderer.act(async () => tree.unmount());
  });
});
