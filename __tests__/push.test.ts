/**
 * Push notifications: every kind opens the right screen (from a push, the banner or the inbox),
 * and pushes of unknown kinds open nothing (they only refresh).
 */
import { notificationRoute, pushNotification, pushRoute } from '../src/notifications/push';

const push = (data: Record<string, string>, notification = { title: 'New collection assigned', body: 'Kukatpally · 24 Nov' }) => ({ data, notification });

describe('where a push opens', () => {
  it.each([
    ['agent.booking_assigned', 'lab_booking', 'KDC-DX-00000ABC', { screen: 'booking-details', params: { bookingId: 'KDC-DX-00000ABC' } }],
    ['agent.booking_cancelled', 'lab_booking', 'KDC-DX-00000ABC', { screen: 'home' }],
    ['agent.support_replied', 'support_ticket', 'KDC-ST-0001', { screen: 'notifications' }],
    ['campaign', 'campaign', 'CMP-12', { screen: 'notifications' }],
    ['agent.delivery_assigned', 'delivery', 'KDC-PH-AB12CD34', { screen: 'delivery-details', params: { code: 'KDC-PH-AB12CD34' } }],
    ['agent.delivery_unassigned', 'delivery', 'KDC-PH-AB12CD34', { screen: 'delivery-details', params: { code: 'KDC-PH-AB12CD34' } }],
  ])('%s (%s) → %o', (event, type, code, route) => {
    expect(pushRoute(push({ event, type, code, notificationId: '7' }))).toEqual(route);
  });

  it('a booking push without a code opens the active bookings', () => {
    expect(pushRoute(push({ event: 'agent.booking_assigned', type: 'lab_booking', code: '' }))).toEqual({ screen: 'home' });
  });

  it('a delivery push without a code opens the deliveries list; its code is a delivery code, not a booking id', () => {
    expect(pushRoute(push({ event: 'agent.delivery_assigned', type: 'delivery', code: '' }))).toEqual({ screen: 'home', params: { tab: 'deliveries' } });
    expect(pushNotification(push({ event: 'agent.delivery_assigned', type: 'delivery', code: 'KDC-PH-AB12CD34' }))).toMatchObject({ target: 'delivery', delivery_code: 'KDC-PH-AB12CD34', booking_id: undefined });
  });

  it('opens nothing for an unknown kind or a push without data', () => {
    expect(pushRoute(push({ event: 'agent.something_new', type: 'payout', code: 'X' }))).toBeNull();
    expect(pushRoute(push({}))).toBeNull();
    expect(pushRoute({})).toBeNull();
    expect(pushRoute(null)).toBeNull();
  });

  it('a push becomes the app’s notification for the banner; only a booking’s code is a booking id', () => {
    expect(pushNotification(push({ event: 'agent.booking_assigned', type: 'lab_booking', code: 'KDC-DX-00000ABC', notificationId: '42' }))).toMatchObject({
      id: 42,
      type: 'agent.booking_assigned',
      target: 'lab_booking',
      title: 'New collection assigned',
      message: 'Kukatpally · 24 Nov',
      booking_id: 'KDC-DX-00000ABC',
      read_flag: 0,
    });
    expect(pushNotification(push({ event: 'agent.support_replied', type: 'support_ticket', code: 'KDC-ST-0001' }))?.booking_id).toBeUndefined();
  });
});

describe('where an inbox row opens', () => {
  it('live rows route by their target, like a push', () => {
    expect(notificationRoute({ type: 'agent.booking_assigned', target: 'lab_booking', booking_id: 'KDC-DX-1' })).toEqual({ screen: 'booking-details', params: { bookingId: 'KDC-DX-1' } });
    expect(notificationRoute({ type: 'agent.support_replied', target: 'support_ticket' })).toEqual({ screen: 'notifications' });
    expect(notificationRoute({ type: 'x', target: 'payout' })).toBeNull();
  });

  it('demo rows (spec 9.3): broadcasts and rows without a booking open the inbox, others the booking', () => {
    expect(notificationRoute({ type: 'ADMIN_BROADCAST', booking_id: 'KDC1001' })).toEqual({ screen: 'notifications' });
    expect(notificationRoute({ type: 'BOOKING_ASSIGNED' })).toEqual({ screen: 'notifications' });
    expect(notificationRoute({ type: 'BOOKING_REJECTED', booking_id: 'KDC1001' })).toEqual({ screen: 'booking-details', params: { bookingId: 'KDC1001' } });
  });
});
