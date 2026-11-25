/**
 * Where the app gets its data, fixed per build.
 *
 * - Live (`useMock: false`): the KDC+ backend at `baseUrl` (its /api/v1 root).
 * - Demo (`useMock: true`): the in-app mock backend with fictional bookings
 *   (demo login 9876543210 / OTP 1234). Never use it with real patients.
 *
 * Release builds talk to production unless KDC_API_URL is set at build time. Development builds talk to the backend on
 * the developer's computer (`npm run start:dev` in KDC_backend, port 4000): `localhost`
 * reaches it from the iOS Simulator, and from an Android phone or emulator once
 * `npm run api:reverse` has forwarded the port over USB. Point DEVELOPMENT_API at a
 * staging server to test against that instead.
 */
const PRODUCTION_API = 'https://api.kdcplus.in/api/v1';
const DEVELOPMENT_API = 'http://localhost:4000/api/v1';
/** Set at build time (KDC_API_URL=… ./gradlew assembleRelease) to point any build at another server. */
const BUILD_API = process.env.KDC_API_URL;

export const API_CONFIG = {
  useMock: false,
  baseUrl: BUILD_API || (__DEV__ ? DEVELOPMENT_API : PRODUCTION_API),
  timeoutMs: 20_000,
};
