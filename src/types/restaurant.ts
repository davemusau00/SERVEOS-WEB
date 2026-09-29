// Restaurant Front-of-House Extended Types (Seats, Coursing, Host Stand, Reservations)

export type CourseStatus = 'HELD' | 'FIRED' | 'PREPARING' | 'READY' | 'SERVED';

export interface DiningSeat {
  id: string;
  tableId: string;
  label: string; // e.g. "Seat 1", "Seat 2", "Shared Table"
  position: number;
}

export interface OrderCourse {
  id: string;
  orderId: string;
  name: string; // "Drinks", "Starters", "Mains", "Dessert"
  sequence: number;
  status: CourseStatus;
  firedAt?: string;
  readyAt?: string;
  servedAt?: string;
}

export type ReservationStatus = 
  | 'BOOKED' 
  | 'CONFIRMED' 
  | 'ARRIVED' 
  | 'SEATED' 
  | 'COMPLETED' 
  | 'NO_SHOW' 
  | 'CANCELLED';

export interface RestaurantReservation {
  id: string;
  guestName: string;
  guestPhone: string;
  guestEmail?: string;
  partySize: number;
  reservationDate: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  durationMinutes: number;
  assignedTableId?: string;
  assignedTableName?: string;
  section: string; // "Main Bar", "VIP Lounge", "Terrace", "Dining Room"
  source: 'PHONE' | 'WALK_IN' | 'WEBSITE' | 'GOOGLE' | 'HOTEL_CONCIERGE' | 'CORPORATE';
  status: ReservationStatus;
  depositAmount: number;
  isDepositPaid: boolean;
  dietaryNotes?: string;
  occasion?: string;
  specialRequests?: string;
  isVip: boolean;
}

export type WaitlistStatus = 'WAITING' | 'NOTIFIED' | 'SEATED' | 'CANCELLED' | 'WALKED_AWAY';

export interface WaitlistParty {
  id: string;
  guestName: string;
  guestPhone: string;
  partySize: number;
  preferredSection: string;
  quotedWaitMinutes: number;
  elapsedWaitMinutes: number;
  status: WaitlistStatus;
  joinedAt: string;
  notifiedAt?: string;
  notes?: string;
  isVip?: boolean;
}
