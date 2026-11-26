# KDC+ Agent

The field-agent (phlebotomist) app for KDC+ home sample collection. It is a bare React Native CLI app for Android and iOS, with no Expo. It uses the same KDC+ design system as the patient and doctor apps.

It follows the agent flow spec: assignment, trip, collection, barcode scanning of each tube, payment and completion. The wallet from the spec has been removed at the client’s request.

Agents with the `medicine_delivery` skill also deliver medicine orders for KDC+ pharmacies (backend contract: `../docs/delivery-fleet-api.md`). Their Home and History get a **Collections | Deliveries** switch; agents with one skill see only theirs.

It runs on the KDC+ backend (`../kdc-backend`). A demo build can instead use the in-app mock server, which implements every endpoint in the spec with fictional bookings.

## Run

```bash
npm install
npm start                      # Metro
npm run android                # or: npm run ios  (run `cd ios && pod install` first)
```

### Live or demo

`src/api/config.ts` decides, per build:

- **Live** (`useMock: false`, the default): set `baseUrl` to the backend's API root, e.g. `https://api.kdcplus.in/api/v1`. Operations register each agent in the admin panel (Field agents), and the agent signs in with an SMS code.
- **Demo** (`useMock: true`): mobile `98765 43210`, OTP `1234`. Profile → **Reset demo data** restores the sample bookings. Never use the demo with real patients.

## Screens

These are 13 routes from spec section 4 (the spec’s Wallet screen is removed) plus delivery details, in one native stack. Back-swipe is off.

| Route | Screen |
| --- | --- |
| `splash` | Splash and session check |
| `login` | Agent Login (mobile number) |
| `otp` | OTP, 4 digits, with a working Resend and a 30 s timer |
| `home` | Active bookings: status badges, tube and payment chips, directions, call, slide-to-confirm, reject. Delivery agents: a Collections / Deliveries switch; delivery cards show pharmacy → drop area, window, items, “Collect ₹…” or Prepaid, attempt n/3 |
| `test-details` | Patients with Pending/Done and progress, Add Patient, cash-due banner, Proceed decision table |
| `sample` | Tube slots (with Urine when needed), camera barcode scan with an editable confirm, upload |
| `collect-payment` | Cash or UPI QR, booking and cash-due modes, the confirm sequence, success |
| `profile` | The agent’s skills; menu: history, help, call us, policies, delete account, logout |
| `history` | Past bookings with totals; past deliveries for delivery agents |
| `booking-details` | Tubes (scan and submit), plan, customer (call countdown, directions), other patients, tests |
| `delivery-details` | Pick-up card (pharmacy, directions, call, *Picked up*), drop card (patient, directions, call), items, cash, attempts; *Deliver* (the patient’s 4-digit code, tries left / locked, optional “handed to” and proof photo, cash confirmation) and *Couldn’t deliver* (reason + note) |
| `notifications` | Inbox with infinite scroll, unread highlighting, relative time, tap routing |
| `help` | Support request with subject chips and a 10–500 character description |
| `policy` | Policy pages, rendered natively |

App-wide: an offline overlay (NetInfo), toasts, a confirm dialog, the slide button, a heads-up banner for pushes, an unread badge, and two- or three-column lists on tablets.

## Where things live

| Path | What |
| --- | --- |
| `src/api/config.ts` | Live or demo, and the backend address |
| `src/api/client.ts` | The app's `{ code, message, data }` envelope (code 0 = success). Live: calls the backend, translates its envelope, refreshes expired access tokens once (one refresh at a time), signs out once when the session has ended, and never on an outage. |
| `src/api/live.ts` | The spec's functions on the backend: its bookings mapped to the app's shape, codes ↔ numeric ids, tube colours ↔ tube types |
| `src/api/endpoints.ts` | One function per endpoint in spec section 11, live or demo |
| `src/store/secure.ts` | The refresh token in the iOS Keychain / Android Keystore (`react-native-keychain`). The access token is in memory only. |
| `src/api/mockServer.ts` | The demo backend: status order, agent OTP on ONGOING, cash-due gate, paging |
| `src/domain/rules.ts` | Business rules: status normalising, time resolution, the cash-due gate, the Proceed decision, tube colours and slots, the UPI intent, list paging |
| `src/notifications/push.ts` | Push pipeline: badge, heads-up banner, tap routing, cold-start queue |
| `src/components/agent/` | Booking card, slide button, scanner, UPI sheet, dialogs, offline overlay |
| `src/screens/` | The screens |

## Live mode

How the live app differs from the spec's backend, by design:

- **Collection code:** the agent never receives it. At the door, *Slide to collect samples* asks for the 4-digit code the customer reads from their KDC+ app. The server checks it, and five wrong codes lock the booking until operations reset it.
- **UPI:** each booking gets a single-use QR from the payment provider. The sheet waits for the bank's confirmation; there's no "Payment received" button, and an expired QR can be replaced.
- **Calls:** there's no bridged calling. *Call* dials the collection address's phone, which the backend shares only while the visit is under way. Each attempt is logged.
- **Session:**
  - The refresh token lives in the Keychain / Keystore, readable only after the device's first unlock and never backed up. The access token is never written to disk.
  - Launching the app restores the session; *Logout* ends it on the server.
  - When the backend can't be reached, the agent stays signed in.
- **Delivery code:** as with the collection code, the agent never receives it; the patient reads it out. Five wrong codes lock the delivery until KDC+ resets it. The proof photo uses the scanner's camera (`react-native-camera-kit` capture) and goes up as `POST /files` with `purpose: delivery_proof`.
- **Delete Account** files a request with support, who handle it: agents' accounts belong to operations.
- **Hidden in live builds:** the demo login hint and *Reset demo data*.

**Still to do before push works:** add `@react-native-firebase/messaging` and `notifee` with the KDC+ Firebase files. Send the FCM token to `registerDevice()`, and forward incoming and opened messages to `receivePush()` and `openFromPush()`. Until then, live builds register the device without a push token, and notifications appear in the app's list.

## Improvements over the source app (spec 14.6)

- OTP Resend works and has a timer.
- Delete Account calls a deletion request instead of logging out.
- The cash-due mode is always passed to the payment screen.
- No tokens are logged.
- Only the permissions actually used are requested: camera, notifications and network state. Location and microphone are not.

## Tests

`npm test` covers:
- Business rules.
- The full booking flow against the mock backend: online, cash, added-patient due, reject and paging.
- A render of every screen.
- The live layer against a fake server (mapping, the envelope, refresh, sign-out).

Against a running backend:
- `__tests__/live.contract.test.ts` runs a whole visit through the app's own code: sign-in, the code at the door, an added person, samples, cash due, UPI by QR, notifications, help, pages, refresh and sign-out.
- `__tests__/live.load.test.ts` runs many agents at once.

Both are skipped unless `AGENT_LIVE_URL` and `AGENT_DATA` are set; see each file's header.
