export type HospitalityInterval = {
  roomId?: string;
  startsAt?: string;
  endsAt?: string;
  blockedUntil?: string;
  status?: string;
};

export function stayCheckoutBlocker({
  stayStatus,
  reservationStatus,
  folioStatus,
  balanceMinor,
  depositMinor,
  units,
  accommodationPeriods,
}: {
  stayStatus?: string;
  reservationStatus?: string;
  folioStatus?: string;
  balanceMinor?: number;
  depositMinor?: number;
  units?: number;
  accommodationPeriods: number[];
}) {
  if (!folioStatus) return 'The guest folio is not available. Refresh Guest Accounts before attempting checkout.';
  if (stayStatus !== 'CHECKED_IN' || reservationStatus !== 'CHECKED_IN' || folioStatus !== 'OPEN') return 'This stay or folio is not open for checkout. Refresh the workspace or ask a manager to review the stay.';
  const requiredUnits = Number(units);
  if (!Number.isInteger(requiredUnits) || requiredUnits < 1 || requiredUnits > 366) return 'Booked accommodation periods are unavailable. Open Guest Accounts and review the reservation before checkout.';
  const posted = new Set(accommodationPeriods);
  if (Array.from({length:requiredUnits},(_,period)=>period).some(period=>!posted.has(period))) return 'Post all booked accommodation periods in Guest Accounts before checkout.';
  if (Number(balanceMinor||0) !== 0) return 'Settle the remaining guest-account balance in Guest Accounts before checkout.';
  if (Number(depositMinor||0) !== 0) return 'Apply or refund the remaining deposit in Guest Accounts before checkout.';
  return null;
}

export function roomMoveBlocker({
  stayId, currentRoomId, destinationRoomId, startsAt, endsAt, guestCount, capacity, maintenanceState,
  housekeepingState, reservations, blocks,
}: {
  stayId: string; currentRoomId: string; destinationRoomId: string; startsAt: string; endsAt: string; guestCount: number; capacity: number;
  maintenanceState: string; housekeepingState: string;
  reservations: Array<{ id: string; roomId: string; startsAt: string; endsAt: string; blockedUntil?: string; status: string }>;
  blocks: Array<{ roomId: string; startsAt: string; endsAt: string; status: string }>;
}): string | null {
  if (!destinationRoomId) return 'Choose a destination room.';
  if (destinationRoomId === currentRoomId) return "Choose a different room from the guest's current room.";
  if (!Number.isFinite(guestCount) || guestCount < 1 || guestCount > capacity) return 'This room does not have enough guest capacity.';
  if (maintenanceState === 'OUT_OF_ORDER') return 'This room is out of service. Choose another room.';
  if (housekeepingState !== 'CLEAN') return 'This room must be inspected and clean before a guest can move in.';
  const start = Date.parse(startsAt), end = Date.parse(endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 'The stay dates are unavailable; refresh Front Desk and retry.';
  const overlaps = (left: string, right: string) => {
    const a = Date.parse(left), b = Date.parse(right);
    return Number.isFinite(a) && Number.isFinite(b) && start < b && a < end;
  };
  if (reservations.some(item => item.id !== stayId && item.roomId === destinationRoomId && ['RESERVED', 'CHECKED_IN'].includes(item.status) && overlaps(item.startsAt, item.blockedUntil || item.endsAt))) return 'This room is already reserved or occupied during the stay.';
  if (blocks.some(item => item.roomId === destinationRoomId && ['ACTIVE', 'OPEN'].includes(item.status) && overlaps(item.startsAt, item.endsAt))) return 'This room has an active block during the stay.';
  return null;
}

/** Advisory only: the room command rechecks all intervals authoritatively. */
export function roomReservationBlocker({
  roomId,
  roomTypeId,
  configuredRoomTypeId,
  maintenanceState,
  startsAt,
  endsAt,
  reservations,
  blocks,
}: {
  roomId: string;
  roomTypeId: string;
  configuredRoomTypeId?: string | null;
  maintenanceState?: string;
  startsAt: string;
  endsAt: string;
  reservations: HospitalityInterval[];
  blocks: HospitalityInterval[];
}) {
  const start = Date.parse(startsAt), end = Date.parse(endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 'Enter a valid arrival and departure interval.';
  if (configuredRoomTypeId && roomTypeId !== configuredRoomTypeId) return 'This room does not match the configured room-stay type.';
  if (maintenanceState === 'OUT_OF_ORDER') return 'This room is out of service.';
  const overlaps = (interval: HospitalityInterval, occupiedUntil = interval.endsAt) => {
    const intervalStart = Date.parse(interval.startsAt || ''), intervalEnd = Date.parse(occupiedUntil || '');
    return Number.isFinite(intervalStart) && Number.isFinite(intervalEnd) && start < intervalEnd && end > intervalStart;
  };
  if (reservations.some(reservation => reservation.roomId === roomId && ['RESERVED', 'CHECKED_IN'].includes(reservation.status || '') && overlaps(reservation, reservation.blockedUntil || reservation.endsAt))) return 'Another reservation or its turnaround occupies this interval.';
  if (blocks.some(block => block.roomId === roomId && (block.status === 'ACTIVE' || !block.status) && overlaps(block))) return 'An active room block overlaps this interval.';
  return null;
}
