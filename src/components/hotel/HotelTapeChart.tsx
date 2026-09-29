import React, { useState } from 'react';
import { useServOS } from '../../context/ServOSContext';
import { HotelTapeReservation } from '../../types/servos';
import { 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Search, 
  Bed, 
  Users, 
  DollarSign, 
  CheckCircle2, 
  Clock, 
  ArrowRight,
  Filter,
  Sparkles
} from 'lucide-react';

interface HotelTapeChartProps {
  onSelectReservation?: (res: HotelTapeReservation) => void;
  onNewBooking?: () => void;
}

const INITIAL_TAPE_RESERVATIONS: HotelTapeReservation[] = [
  {
    id: 'res-101',
    resNumber: 'RES-8491',
    guestName: 'Amb. Richard Davis',
    guestPhone: '+254 711 902 448',
    guestEmail: 'r.davis@unon.org',
    roomNumber: '312',
    roomType: 'Deluxe Suite',
    checkInDate: '2026-09-23',
    checkOutDate: '2026-09-27',
    nightsCount: 4,
    adultsCount: 2,
    ratePlan: 'BAR',
    dailyRateKes: 24000,
    totalAmountKes: 96000,
    depositPaidKes: 48000,
    source: 'DIRECT',
    status: 'CHECKED_IN',
    specialRequests: 'Quiet suite, feather pillows, diplomatic protocol'
  },
  {
    id: 'res-102',
    resNumber: 'RES-8492',
    guestName: 'Brenda Cherono',
    guestPhone: '+254 733 410 882',
    guestEmail: 'bcherono@kcbgroup.com',
    roomNumber: '204',
    roomType: 'Executive Room',
    checkInDate: '2026-09-24',
    checkOutDate: '2026-09-26',
    nightsCount: 2,
    adultsCount: 1,
    ratePlan: 'CORPORATE',
    dailyRateKes: 18000,
    totalAmountKes: 36000,
    depositPaidKes: 36000,
    source: 'CORPORATE',
    status: 'CONFIRMED'
  },
  {
    id: 'res-103',
    resNumber: 'RES-8493',
    guestName: 'Marcus Vance',
    guestPhone: '+44 7700 900123',
    guestEmail: 'm.vance@safari.co.uk',
    roomNumber: '101',
    roomType: 'Standard King',
    checkInDate: '2026-09-22',
    checkOutDate: '2026-09-25',
    nightsCount: 3,
    adultsCount: 2,
    ratePlan: 'BAR',
    dailyRateKes: 14000,
    totalAmountKes: 42000,
    depositPaidKes: 42000,
    source: 'BOOKING_COM',
    status: 'CHECKED_IN'
  },
  {
    id: 'res-104',
    resNumber: 'RES-8494',
    guestName: 'Fatima Al-Mansoor',
    guestPhone: '+971 50 123 4567',
    guestEmail: 'fatima@almansoor.ae',
    roomNumber: '401',
    roomType: 'Presidential Penthouse',
    checkInDate: '2026-09-25',
    checkOutDate: '2026-09-29',
    nightsCount: 4,
    adultsCount: 3,
    ratePlan: 'PACKAGE_VIP',
    dailyRateKes: 75000,
    totalAmountKes: 300000,
    depositPaidKes: 150000,
    source: 'DIRECT',
    status: 'CONFIRMED',
    specialRequests: 'Private butler, airport limousine transfer'
  }
];

const ROOMS_LIST = [
  { number: '101', type: 'Standard King', floor: '1st Floor' },
  { number: '102', type: 'Standard Twin', floor: '1st Floor' },
  { number: '103', type: 'Standard King', floor: '1st Floor' },
  { number: '201', type: 'Executive Room', floor: '2nd Floor' },
  { number: '202', type: 'Executive Room', floor: '2nd Floor' },
  { number: '204', type: 'Executive Room', floor: '2nd Floor' },
  { number: '304', type: 'Deluxe Suite', floor: '3rd Floor' },
  { number: '312', type: 'Deluxe Suite', floor: '3rd Floor' },
  { number: '401', type: 'Presidential Penthouse', floor: '4th Floor' }
];

const DATES_TIMELINE = [
  { day: 'Wed', date: '23', isToday: true, fullDate: '2026-09-23' },
  { day: 'Thu', date: '24', isToday: false, fullDate: '2026-09-24' },
  { day: 'Fri', date: '25', isToday: false, fullDate: '2026-09-25' },
  { day: 'Sat', date: '26', isToday: false, fullDate: '2026-09-26' },
  { day: 'Sun', date: '27', isToday: false, fullDate: '2026-09-27' },
  { day: 'Mon', date: '28', isToday: false, fullDate: '2026-09-28' },
  { day: 'Tue', date: '29', isToday: false, fullDate: '2026-09-29' }
];

export const HotelTapeChart: React.FC<HotelTapeChartProps> = ({ onSelectReservation, onNewBooking }) => {
  const { showToast } = useServOS();
  const [reservations, setReservations] = useState<HotelTapeReservation[]>(INITIAL_TAPE_RESERVATIONS);
  const [selectedRes, setSelectedRes] = useState<HotelTapeReservation | null>(null);

  const getReservationForRoomDate = (roomNum: string, dateStr: string) => {
    return reservations.find(r => {
      return r.roomNumber === roomNum && dateStr >= r.checkInDate && dateStr < r.checkOutDate;
    });
  };

  const isCheckInDay = (res: HotelTapeReservation, dateStr: string) => {
    return res.checkInDate === dateStr;
  };

  return (
    <div className="p-4 sm:p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
      {/* Tape Chart Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 text-[10px] font-mono font-bold uppercase">
              RESERVATION TAPE CHART
            </span>
            <span className="text-xs text-slate-400 font-mono">Multi-Room Timeline View</span>
          </div>
          <h2 className="text-lg font-bold text-white mt-1">Room Allocation & Stay Matrix</h2>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onNewBooking}
            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Booking</span>
          </button>
        </div>
      </div>

      {/* Grid Canvas */}
      <div className="overflow-x-auto border border-slate-800 rounded-xl bg-slate-950">
        <table className="w-full text-left text-xs font-mono border-collapse min-w-[700px]">
          <thead>
            <tr className="bg-slate-900 border-b border-slate-800">
              <th className="p-3 text-slate-400 font-bold uppercase w-36 border-r border-slate-800">Room</th>
              {DATES_TIMELINE.map(d => (
                <th
                  key={d.fullDate}
                  className={`p-2.5 text-center font-bold border-r border-slate-800 ${
                    d.isToday ? 'bg-amber-500/10 text-amber-300' : 'text-slate-400'
                  }`}
                >
                  <div className="text-[10px] text-slate-500">{d.day}</div>
                  <div className="text-sm font-black">{d.date}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-850">
            {ROOMS_LIST.map(rm => (
              <tr key={rm.number} className="hover:bg-slate-900/40 transition-colors">
                <td className="p-3 border-r border-slate-800 bg-slate-900/60">
                  <div className="flex items-center gap-2">
                    <span className="font-black text-white text-sm">{rm.number}</span>
                    <span className="text-[10px] text-slate-400 truncate max-w-[80px]">{rm.type}</span>
                  </div>
                </td>

                {DATES_TIMELINE.map(d => {
                  const res = getReservationForRoomDate(rm.number, d.fullDate);
                  const isStart = res ? isCheckInDay(res, d.fullDate) : false;

                  return (
                    <td
                      key={d.fullDate}
                      className={`p-1 border-r border-slate-850 h-12 relative ${
                        d.isToday ? 'bg-amber-500/5' : ''
                      }`}
                    >
                      {res && (
                        <div
                          onClick={() => {
                            setSelectedRes(res);
                            onSelectReservation?.(res);
                          }}
                          className={`h-full w-full rounded-lg p-1.5 cursor-pointer transition-all flex flex-col justify-center ${
                            res.status === 'CHECKED_IN'
                              ? 'bg-emerald-950/70 border border-emerald-500/50 text-emerald-300 hover:bg-emerald-900/80'
                              : 'bg-cyan-950/70 border border-cyan-500/50 text-cyan-300 hover:bg-cyan-900/80'
                          }`}
                        >
                          <div className="text-[10px] font-bold truncate">
                            {isStart ? res.guestName : `● ${res.guestName.split(' ')[0]}`}
                          </div>
                          <div className="text-[9px] text-slate-400 flex items-center justify-between">
                            <span>{res.resNumber}</span>
                            <span>KES {(res.dailyRateKes / 1000).toFixed(0)}k</span>
                          </div>
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Selected Reservation Quick Card */}
      {selectedRes && (
        <div className="p-4 bg-slate-850 border border-slate-750 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-white font-bold text-sm">{selectedRes.guestName}</span>
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono text-[10px] font-bold">
                {selectedRes.status}
              </span>
              <span className="text-xs font-mono text-slate-400">Room {selectedRes.roomNumber} ({selectedRes.roomType})</span>
            </div>
            <p className="text-xs font-mono text-slate-400 mt-1">
              Dates: {selectedRes.checkInDate} → {selectedRes.checkOutDate} ({selectedRes.nightsCount} Nights) • Total: KES {selectedRes.totalAmountKes.toLocaleString()}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                showToast(`Viewing active folio for ${selectedRes.guestName}`, 'info');
              }}
              className="px-3 py-1.5 bg-slate-750 hover:bg-slate-700 text-white rounded-lg text-xs font-mono font-bold"
            >
              Open Folio
            </button>
            <button
              onClick={() => setSelectedRes(null)}
              className="px-2 py-1.5 text-slate-400 hover:text-white text-xs font-mono"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
