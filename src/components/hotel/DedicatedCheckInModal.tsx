import React, { useState } from 'react';
import { useServOS } from '../../context/ServOSContext';
import { 
  Bed, 
  User, 
  CreditCard, 
  Key, 
  Car, 
  CheckCircle2, 
  ShieldCheck, 
  X, 
  ArrowRight, 
  Sparkles,
  Phone,
  Mail,
  FileText
} from 'lucide-react';

interface DedicatedCheckInModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DedicatedCheckInModal: React.FC<DedicatedCheckInModalProps> = ({ isOpen, onClose }) => {
  const { showToast } = useServOS();
  const [step, setStep] = useState<number>(1);

  // Form state
  const [guestName, setGuestName] = useState<string>('Amb. Richard Davis');
  const [guestPhone, setGuestPhone] = useState<string>('+254 711 902 448');
  const [guestEmail, setGuestEmail] = useState<string>('r.davis@unon.org');
  const [idPassport, setIdPassport] = useState<string>('DIP-US-992144');
  const [selectedRoom, setSelectedRoom] = useState<string>('312');
  const [roomType, setRoomType] = useState<string>('Deluxe Suite');
  const [nights, setNights] = useState<number>(3);
  const [dailyRate, setDailyRate] = useState<number>(24000);
  const [depositAmount, setDepositAmount] = useState<number>(20000);
  const [depositMethod, setDepositMethod] = useState<string>('CARD');
  const [vehiclePlate, setVehiclePlate] = useState<string>('KDD 123X');
  const [keyCardId, setKeyCardId] = useState<string>('RFID-KEY-312A');

  if (!isOpen) return null;

  const handleCompleteCheckIn = () => {
    showToast(`Guest ${guestName} checked into Room ${selectedRoom}! RFID Key ${keyCardId} encoded.`, 'success');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-750 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Bed className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Full Guest Check-In Wizard</h3>
              <p className="text-xs text-slate-400 font-mono">10-Point Hospitality Identity & Folio Verification</p>
            </div>
          </div>

          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Wizard Steps Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Step checklist overview */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs font-mono">
            <div className="p-2 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">1. Guest Details</span>
            </div>
            <div className="p-2 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">2. ID / Passport</span>
            </div>
            <div className="p-2 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">3. Room 312</span>
            </div>
            <div className="p-2 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">4. KES 20k Deposit</span>
            </div>
            <div className="p-2 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">5. Key Issuance</span>
            </div>
          </div>

          {/* Form Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
            <div className="space-y-1">
              <label className="text-slate-400">Guest Full Name</label>
              <input
                type="text"
                value={guestName}
                onChange={e => setGuestName(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl p-2.5"
              />
            </div>

            <div className="space-y-1">
              <label className="text-slate-400">ID / Passport Number</label>
              <input
                type="text"
                value={idPassport}
                onChange={e => setIdPassport(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-amber-300 rounded-xl p-2.5 font-bold"
              />
            </div>

            <div className="space-y-1">
              <label className="text-slate-400">Mobile Phone</label>
              <input
                type="text"
                value={guestPhone}
                onChange={e => setGuestPhone(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl p-2.5"
              />
            </div>

            <div className="space-y-1">
              <label className="text-slate-400">Email Address</label>
              <input
                type="email"
                value={guestEmail}
                onChange={e => setGuestEmail(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl p-2.5"
              />
            </div>

            <div className="space-y-1">
              <label className="text-slate-400">Assigned Room</label>
              <select
                value={selectedRoom}
                onChange={e => setSelectedRoom(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl p-2.5 font-bold"
              >
                <option value="312">Room 312 (Deluxe Suite)</option>
                <option value="204">Room 204 (Executive Room)</option>
                <option value="101">Room 101 (Standard King)</option>
                <option value="401">Room 401 (Presidential Penthouse)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-slate-400">Duration (Nights)</label>
              <input
                type="number"
                value={nights}
                onChange={e => setNights(Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl p-2.5"
              />
            </div>

            <div className="space-y-1">
              <label className="text-slate-400">Incidental Deposit (KES)</label>
              <input
                type="number"
                value={depositAmount}
                onChange={e => setDepositAmount(Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 text-emerald-400 font-bold rounded-xl p-2.5"
              />
            </div>

            <div className="space-y-1">
              <label className="text-slate-400">Vehicle Registration Plate</label>
              <input
                type="text"
                value={vehiclePlate}
                onChange={e => setVehiclePlate(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl p-2.5 uppercase"
              />
            </div>
          </div>

          {/* Keycard Encoder status */}
          <div className="p-4 bg-slate-850 border border-slate-750 rounded-xl flex items-center justify-between font-mono text-xs">
            <div className="flex items-center gap-3">
              <Key className="w-5 h-5 text-amber-400" />
              <div>
                <span className="text-white font-bold block">Assa Abloy RFID Keycard Ready</span>
                <span className="text-slate-400 text-[11px]">Encoded for Room 312 & VIP Lounge Entry</span>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
              KEY PAIRED
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold"
          >
            Cancel
          </button>
          <button
            onClick={handleCompleteCheckIn}
            className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow-md transition-all font-mono"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Complete Check-In & Open Folio</span>
          </button>
        </div>
      </div>
    </div>
  );
};
