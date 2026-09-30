export type HospitalityInterval = {
  roomId?: string;
  startsAt?: string;
  endsAt?: string;
  blockedUntil?: string;
  status?: string;
};

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
