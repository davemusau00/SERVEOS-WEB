import React, { useState } from 'react';
import { useServOS } from '../../context/ServOSContext';
import { 
  Users, 
  Coins, 
  Clock, 
  Award, 
  DollarSign, 
  AlertCircle, 
  CheckCircle2, 
  ArrowUpRight, 
  ArrowDownLeft,
  X,
  Calendar,
  FileText,
  UserCheck,
  UserPlus,
  Building,
  CreditCard,
  Briefcase,
  ChevronRight,
  Check,
  RefreshCw,
  Wallet,
  PhoneCall,
  Send
} from 'lucide-react';
import { Employee, StaffLeaveRequest, ShiftSchedule, PayrollRun, EmployeePayslip, SalaryAdvance } from '../../types/servos';

export const StaffCashView: React.FC = () => {
  const {
    employees,
    addEmployee,
    updateEmployee,
    deleteEmployee,
    currentUser,
    tillSession,
    openTillSession,
    closeTillSession,
    recordCashPaidInOut,
    leaveRequests,
    submitLeaveRequest,
    approveLeaveRequest,
    rejectLeaveRequest,
    shiftSchedules,
    clockInShift,
    clockOutShift,
    createShiftSchedule,
    payrollRuns,
    generatePayrollRun,
    approvePayrollRun,
    disbursePayrollRun,
    salaryAdvances,
    requestSalaryAdvance,
    approveSalaryAdvance,
    showToast
  } = useServOS();

  // Tab State
  type TabType = 'STAFF' | 'LEAVE' | 'ROSTER' | 'PAYROLL' | 'ADVANCES' | 'TILL' | 'TIPS';
  const [activeTab, setActiveTab] = useState<TabType>('STAFF');

  // Filter States
  const [staffDeptFilter, setStaffDeptFilter] = useState<string>('ALL');
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [isAddStaffModalOpen, setIsAddStaffModalOpen] = useState<boolean>(false);

  // Edit Staff Modal State
  const [isEditStaffModalOpen, setIsEditStaffModalOpen] = useState<boolean>(false);
  const [editEmpId, setEditEmpId] = useState<string>('');
  const [editEmpName, setEditEmpName] = useState<string>('');
  const [editEmpRole, setEditEmpRole] = useState<Employee['role']>('WAITER');
  const [editEmpDept, setEditEmpDept] = useState<Employee['department']>('Food & Beverage');
  const [editEmpEmail, setEditEmpEmail] = useState<string>('');
  const [editEmpPhone, setEditEmpPhone] = useState<string>('');
  const [editEmpBaseSalary, setEditEmpBaseSalary] = useState<number>(0);
  const [editEmpHourlyRate, setEditEmpHourlyRate] = useState<number>(0);
  const [editEmpKraPin, setEditEmpKraPin] = useState<string>('');
  const [editEmpContractType, setEditEmpContractType] = useState<Employee['contractType']>('PERMANENT');
  const [editEmpAttendanceStatus, setEditEmpAttendanceStatus] = useState<Employee['attendanceStatus']>('OFF_DUTY');

  // Leave Management State
  const [leaveFilter, setLeaveFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState<boolean>(false);
  const [newLeaveEmployeeId, setNewLeaveEmployeeId] = useState<string>('emp-dave');
  const [newLeaveType, setNewLeaveType] = useState<StaffLeaveRequest['leaveType']>('ANNUAL');
  const [newLeaveStartDate, setNewLeaveStartDate] = useState<string>('2026-10-01');
  const [newLeaveEndDate, setNewLeaveEndDate] = useState<string>('2026-10-05');
  const [newLeaveDaysCount, setNewLeaveDaysCount] = useState<number>(5);
  const [newLeaveReason, setNewLeaveReason] = useState<string>('Scheduled family vacation');
  const [newLeaveHandover, setNewLeaveHandover] = useState<string>('emp-mixologist');

  // Shift & Roster State
  const [rosterDayFilter, setRosterDayFilter] = useState<string>('ALL');
  const [isNewShiftModalOpen, setIsNewShiftModalOpen] = useState<boolean>(false);
  const [newShiftEmpId, setNewShiftEmpId] = useState<string>('emp-waiter');
  const [newShiftDate, setNewShiftDate] = useState<string>('2026-09-24');
  const [newShiftType, setNewShiftType] = useState<ShiftSchedule['shiftType']>('MORNING');
  const [newShiftStation, setNewShiftStation] = useState<string>('Terrace Tables 1-12');
  const [newShiftStart, setNewShiftStart] = useState<string>('07:00');
  const [newShiftEnd, setNewShiftEnd] = useState<string>('15:30');

  // Payroll State
  const [selectedPayrollRun, setSelectedPayrollRun] = useState<PayrollRun | null>(payrollRuns[0] || null);
  const [inspectingPayslip, setInspectingPayslip] = useState<EmployeePayslip | null>(null);
  const [isGeneratingPayroll, setIsGeneratingPayroll] = useState<boolean>(false);
  const [payrollPeriodInput, setPayrollPeriodInput] = useState<string>('October 2026');

  // Salary Advance State
  const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState<boolean>(false);
  const [advanceEmpId, setAdvanceEmpId] = useState<string>('emp-hk');
  const [advanceAmount, setAdvanceAmount] = useState<number>(4500);
  const [advanceReason, setAdvanceReason] = useState<string>('School uniform & textbook emergency');

  // Till Session State
  const [isCloseShiftOpen, setIsCloseShiftOpen] = useState<boolean>(false);
  const [countedCash, setCountedCash] = useState<number>(0);
  const [closeNotes, setCloseNotes] = useState<string>('Shift handover count');
  const [isPaidInOutOpen, setIsPaidInOutOpen] = useState<boolean>(false);
  const [paidType, setPaidType] = useState<'PAID_IN' | 'PAID_OUT'>('PAID_OUT');
  const [paidAmount, setPaidAmount] = useState<number>(1500);
  const [paidReason, setPaidReason] = useState<string>('Emergency purchase of cocktail ice bags');

  // New Employee Form State
  const [newEmpName, setNewEmpName] = useState<string>('');
  const [newEmpRole, setNewEmpRole] = useState<Employee['role']>('WAITER');
  const [newEmpDept, setNewEmpDept] = useState<Employee['department']>('Food & Beverage');
  const [newEmpEmail, setNewEmpEmail] = useState<string>('');
  const [newEmpPhone, setNewEmpPhone] = useState<string>('+254 7');
  const [newEmpBaseSalary, setNewEmpBaseSalary] = useState<number>(45000);
  const [newEmpHourlyRate, setNewEmpHourlyRate] = useState<number>(300);
  const [newEmpKraPin, setNewEmpKraPin] = useState<string>('A00');
  const [newEmpBank, setNewEmpBank] = useState<string>('Equity Bank Kenya');
  const [newEmpAccount, setNewEmpAccount] = useState<string>('');

  // Calculations for quick metrics
  const activeStaffCount = employees.filter(e => e.attendanceStatus === 'ON_DUTY').length;
  const pendingLeavesCount = leaveRequests.filter(l => l.status === 'PENDING').length;
  const pendingAdvancesCount = salaryAdvances.filter(a => a.status === 'PENDING').length;
  const currentMonthRun = payrollRuns.find(r => r.period === 'September 2026') || payrollRuns[0];

  const openEditStaffModal = (emp: Employee) => {
    setEditEmpId(emp.id);
    setEditEmpName(emp.name);
    setEditEmpRole(emp.role);
    setEditEmpDept(emp.department);
    setEditEmpEmail(emp.email);
    setEditEmpPhone(emp.phone);
    setEditEmpBaseSalary(emp.baseSalary);
    setEditEmpHourlyRate(emp.hourlyRate);
    setEditEmpKraPin(emp.kraPin || '');
    setEditEmpContractType(emp.contractType);
    setEditEmpAttendanceStatus(emp.attendanceStatus);
    setIsEditStaffModalOpen(true);
  };

  const handleSaveEditStaff = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editEmpName.trim()) return;

    updateEmployee(editEmpId, {
      name: editEmpName,
      role: editEmpRole,
      department: editEmpDept,
      email: editEmpEmail,
      phone: editEmpPhone,
      baseSalary: editEmpBaseSalary,
      hourlyRate: editEmpHourlyRate,
      kraPin: editEmpKraPin,
      contractType: editEmpContractType,
      attendanceStatus: editEmpAttendanceStatus
    });

    setIsEditStaffModalOpen(false);
  };

  const handleAddEmployeeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmpName.trim()) {
      showToast('Please enter employee name', 'error');
      return;
    }
    const empCode = `EMP-0${employees.length + 1}`;
    addEmployee({
      code: empCode,
      name: newEmpName,
      email: newEmpEmail || `${newEmpName.toLowerCase().replace(/\s+/g, '.')}@grandnairobi.co.ke`,
      phone: newEmpPhone,
      role: newEmpRole,
      department: newEmpDept,
      permissions: ['order.create', 'order.send', 'payment.cash', 'payment.mpesa'],
      hourlyRate: newEmpHourlyRate,
      baseSalary: newEmpBaseSalary,
      commissionRate: newEmpRole === 'BARTENDER' ? 0.05 : 0.02,
      contractType: 'PERMANENT',
      nationalId: `ID-${Math.floor(10000000 + Math.random() * 90000000)}`,
      kraPin: newEmpKraPin.toUpperCase(),
      nssfNumber: `NSSF-${Math.floor(100000 + Math.random() * 900000)}`,
      nhifNumber: `NHIF-${Math.floor(100000 + Math.random() * 900000)}`,
      leaveBalance: 21,
      leaveTaken: 0,
      attendanceStatus: 'OFF_DUTY',
      bankName: newEmpBank,
      bankAccount: newEmpAccount || '019284719283',
      mpesaDisbursementNumber: newEmpPhone
    });
    setIsAddStaffModalOpen(false);
    setNewEmpName('');
  };

  const handleCreateLeaveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const emp = employees.find(e => e.id === newLeaveEmployeeId);
    if (!emp) return;
    const handoverEmp = employees.find(e => e.id === newLeaveHandover);

    submitLeaveRequest({
      employeeId: emp.id,
      employeeName: emp.name,
      employeeRole: emp.role,
      leaveType: newLeaveType,
      startDate: newLeaveStartDate,
      endDate: newLeaveEndDate,
      daysCount: newLeaveDaysCount,
      reason: newLeaveReason,
      handoverColleagueId: handoverEmp?.id,
      handoverColleagueName: handoverEmp?.name
    });
    setIsLeaveModalOpen(false);
  };

  const handleCreateShiftSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const emp = employees.find(e => e.id === newShiftEmpId);
    if (!emp) return;

    createShiftSchedule({
      employeeId: emp.id,
      employeeName: emp.name,
      role: emp.role,
      department: emp.department,
      date: newShiftDate,
      dayOfWeek: new Date(newShiftDate).toLocaleDateString('en-US', { weekday: 'long' }),
      shiftType: newShiftType,
      startTime: newShiftStart,
      endTime: newShiftEnd,
      station: newShiftStation,
      status: 'SCHEDULED'
    });
    setIsNewShiftModalOpen(false);
  };

  const handleCreateAdvanceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (advanceAmount <= 0) {
      showToast('Advance amount must be greater than zero', 'error');
      return;
    }
    requestSalaryAdvance(advanceEmpId, advanceAmount, advanceReason);
    setIsAdvanceModalOpen(false);
  };

  const filteredEmployees = employees.filter(emp => {
    if (staffDeptFilter === 'ALL') return true;
    return emp.department.toLowerCase().includes(staffDeptFilter.toLowerCase());
  });

  const filteredLeaveRequests = leaveRequests.filter(req => {
    if (leaveFilter === 'ALL') return true;
    return req.status === leaveFilter;
  });

  return (
    <div className="flex-1 h-full min-h-0 flex flex-col bg-slate-950 overflow-hidden">
      {/* Top Banner Navigation */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 py-3 sm:px-6 sm:py-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-amber-400 shrink-0" />
            <h1 className="text-base font-bold text-white tracking-wide">
              Hospitality Staff, Payroll & Attendance Hub
            </h1>
          </div>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            Kenyan Statutory Compliance (PAYE, NSSF, NHIF, Housing Levy), Leave Ledger, Station Roster & Till Cash
          </p>
        </div>

        {/* Tab Navigation (Zero-Pill: Functional square/rounded buttons) */}
        <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 overflow-x-auto scrollbar-none shrink-0">
          <button
            onClick={() => setActiveTab('STAFF')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap min-h-[36px] flex items-center gap-1.5 ${
              activeTab === 'STAFF' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Staff Directory ({employees.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('LEAVE')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap min-h-[36px] flex items-center gap-1.5 ${
              activeTab === 'LEAVE' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Leave & Absence</span>
            {pendingLeavesCount > 0 && (
              <span className={`ml-1 text-[10px] font-mono px-1.5 py-0.2 rounded font-bold ${
                activeTab === 'LEAVE' ? 'bg-slate-950 text-amber-400' : 'bg-amber-500/20 text-amber-400'
              }`}>
                {pendingLeavesCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('ROSTER')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap min-h-[36px] flex items-center gap-1.5 ${
              activeTab === 'ROSTER' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Shift Roster</span>
          </button>

          <button
            onClick={() => setActiveTab('PAYROLL')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap min-h-[36px] flex items-center gap-1.5 ${
              activeTab === 'PAYROLL' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Wallet className="w-3.5 h-3.5" />
            <span>Payroll Engine</span>
          </button>

          <button
            onClick={() => setActiveTab('ADVANCES')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap min-h-[36px] flex items-center gap-1.5 ${
              activeTab === 'ADVANCES' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" />
            <span>Advances</span>
            {pendingAdvancesCount > 0 && (
              <span className={`ml-1 text-[10px] font-mono px-1.5 py-0.2 rounded font-bold ${
                activeTab === 'ADVANCES' ? 'bg-slate-950 text-amber-400' : 'bg-amber-500/20 text-amber-400'
              }`}>
                {pendingAdvancesCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('TILL')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap min-h-[36px] flex items-center gap-1.5 ${
              activeTab === 'TILL' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Coins className="w-3.5 h-3.5" />
            <span>Till & Drawer</span>
          </button>

          <button
            onClick={() => setActiveTab('TIPS')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap min-h-[36px] flex items-center gap-1.5 ${
              activeTab === 'TIPS' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Award className="w-3.5 h-3.5" />
            <span>Tip Pool</span>
          </button>
        </div>
      </div>

      {/* Main View Area */}
      <div className="flex-1 overflow-y-auto p-3.5 sm:p-6 pb-28 md:pb-8">
        
        {/* ================= TAB 1: STAFF DIRECTORY ================= */}
        {activeTab === 'STAFF' && (
          <div className="space-y-6 max-w-7xl mx-auto">
            {/* Action Bar & Department Filters */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-4 rounded-xl">
              <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1 sm:pb-0">
                <span className="text-xs font-mono text-slate-400 uppercase tracking-wider shrink-0 mr-1">Dept:</span>
                {['ALL', 'Food & Beverage', 'Culinary', 'Front Desk', 'Housekeeping', 'Finance', 'Management'].map(dept => (
                  <button
                    key={dept}
                    onClick={() => setStaffDeptFilter(dept)}
                    className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                      staffDeptFilter === dept 
                        ? 'bg-amber-500 text-slate-950 font-bold' 
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {dept}
                  </button>
                ))}
              </div>

              <button
                onClick={() => setIsAddStaffModalOpen(true)}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5 shrink-0 min-h-[40px] w-full sm:w-auto"
              >
                <UserPlus className="w-4 h-4" />
                <span>Onboard New Staff</span>
              </button>
            </div>

            {/* Quick Metrics Bar (Zero-Pill: Clean unboxed metadata) */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl">
                <span className="text-xs text-slate-400 block font-mono">Total Headcount</span>
                <span className="text-xl font-bold text-white mt-1 block">{employees.length} Staff</span>
                <span className="text-xs text-slate-400 mt-0.5 block">Full-time & Contract</span>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl">
                <span className="text-xs text-slate-400 block font-mono">Currently On Duty</span>
                <span className="text-xl font-bold text-emerald-400 mt-1 block">{activeStaffCount} Active</span>
                <span className="text-xs text-slate-400 mt-0.5 block">Clocked into stations</span>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl">
                <span className="text-xs text-slate-400 block font-mono">Monthly Payroll Budget</span>
                <span className="text-xl font-bold text-amber-400 font-mono mt-1 block">KES {currentMonthRun?.totalGross.toLocaleString() || '598,400'}</span>
                <span className="text-xs text-slate-400 mt-0.5 block">Gross wages & statutory</span>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl">
                <span className="text-xs text-slate-400 block font-mono">Pending Leave & Advance</span>
                <span className="text-xl font-bold text-cyan-400 mt-1 block">{pendingLeavesCount + pendingAdvancesCount} Requests</span>
                <span className="text-xs text-slate-400 mt-0.5 block">Awaiting review</span>
              </div>
            </div>

            {/* Staff Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredEmployees.map(emp => (
                <div
                  key={emp.id}
                  className="bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all rounded-xl p-5 flex flex-col justify-between group cursor-pointer"
                  onClick={() => setSelectedEmployee(emp)}
                >
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-amber-400 font-bold">{emp.code}</span>
                          <span className="text-xs font-mono text-slate-400">·</span>
                          <span className="text-xs text-slate-400 font-medium">{emp.contractType}</span>
                        </div>
                        <h3 className="text-base font-bold text-white group-hover:text-amber-400 transition-colors mt-0.5">
                          {emp.name}
                        </h3>
                        <p className="text-xs text-slate-400">{emp.role} · {emp.department}</p>
                      </div>

                      {/* Attendance indicator (Unboxed text style) */}
                      <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded ${
                        emp.attendanceStatus === 'ON_DUTY' 
                          ? 'bg-emerald-500/10 text-emerald-400' 
                          : emp.attendanceStatus === 'ON_LEAVE'
                          ? 'bg-cyan-500/10 text-cyan-400'
                          : 'bg-slate-800 text-slate-400'
                      }`}>
                        {emp.attendanceStatus === 'ON_DUTY' ? '● ON DUTY' : emp.attendanceStatus === 'ON_LEAVE' ? '🌴 ON LEAVE' : 'OFF DUTY'}
                      </span>
                    </div>

                    {/* Metadata & statutory info */}
                    <div className="space-y-1.5 text-xs text-slate-300 font-mono pt-3 border-t border-slate-850">
                      <div className="flex justify-between">
                        <span className="text-slate-400 font-sans">Base Salary:</span>
                        <span className="font-bold text-slate-200">KES {emp.baseSalary.toLocaleString()}/mo</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 font-sans">Hourly Rate:</span>
                        <span className="text-slate-300">KES {emp.hourlyRate}/hr</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 font-sans">Leave Balance:</span>
                        <span className="text-emerald-400 font-bold">{emp.leaveBalance} days remaining</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 font-sans">KRA PIN:</span>
                        <span className="text-slate-400">{emp.kraPin || '—'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-850 flex items-center justify-between text-xs">
                    <span className="text-slate-400 font-mono truncate max-w-[140px]">{emp.phone}</span>
                    <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => openEditStaffModal(emp)}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold text-[11px] rounded flex items-center gap-1 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Remove staff member ${emp.name}?`)) {
                            deleteEmployee(emp.id);
                          }
                        }}
                        className="px-2 py-1 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 font-bold text-[11px] rounded transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ================= TAB 2: LEAVE & ABSENCE ================= */}
        {activeTab === 'LEAVE' && (
          <div className="space-y-6 max-w-6xl mx-auto">
            {/* Header Controls */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-4 rounded-xl">
              <div>
                <h3 className="text-sm font-bold text-white">Staff Leave Applications & Annual Allowances</h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  21 Days Statutory Annual Leave per Kenyan Employment Act with instant balance audit
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs overflow-x-auto scrollbar-none max-w-full">
                  {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map(st => (
                    <button
                      key={st}
                      onClick={() => setLeaveFilter(st)}
                      className={`px-2.5 py-1 rounded font-medium transition-colors whitespace-nowrap ${
                        leaveFilter === st ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setIsLeaveModalOpen(true)}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5 shrink-0 min-h-[38px] w-full sm:w-auto"
                >
                  <Calendar className="w-4 h-4" />
                  <span>Apply for Leave</span>
                </button>
              </div>
            </div>

            {/* Leave Applications Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 font-mono border-b border-slate-800">
                    <tr>
                      <th className="p-3.5">Employee</th>
                      <th className="p-3.5">Leave Type</th>
                      <th className="p-3.5">Period & Days</th>
                      <th className="p-3.5">Reason & Handover</th>
                      <th className="p-3.5">Status</th>
                      <th className="p-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-sans">
                    {filteredLeaveRequests.map(req => {
                      const emp = employees.find(e => e.id === req.employeeId);
                      return (
                        <tr key={req.id} className="hover:bg-slate-850/50 transition-colors">
                          <td className="p-3.5">
                            <span className="font-bold text-slate-100 block">{req.employeeName}</span>
                            <span className="text-slate-400 text-[11px] font-mono">{req.employeeRole} · {emp?.department}</span>
                          </td>
                          <td className="p-3.5 font-mono">
                            <span className="text-amber-400 font-bold">{req.leaveType}</span>
                          </td>
                          <td className="p-3.5 font-mono">
                            <span className="text-slate-200 block">{req.startDate} to {req.endDate}</span>
                            <span className="text-emerald-400 font-bold">{req.daysCount} Working Days</span>
                          </td>
                          <td className="p-3.5 max-w-xs">
                            <p className="text-slate-300 text-xs line-clamp-1">{req.reason}</p>
                            {req.handoverColleagueName && (
                              <p className="text-slate-400 text-[11px] font-mono mt-0.5">
                                Handover: {req.handoverColleagueName}
                              </p>
                            )}
                          </td>
                          <td className="p-3.5">
                            <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded ${
                              req.status === 'APPROVED' 
                                ? 'bg-emerald-500/10 text-emerald-400' 
                                : req.status === 'REJECTED'
                                ? 'bg-rose-500/10 text-rose-400'
                                : 'bg-amber-500/10 text-amber-400'
                            }`}>
                              {req.status}
                            </span>
                          </td>
                          <td className="p-3.5 text-right">
                            {req.status === 'PENDING' ? (
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => approveLeaveRequest(req.id, 'Approved by Management')}
                                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded text-xs transition-colors flex items-center gap-1"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Approve</span>
                                </button>
                                <button
                                  onClick={() => rejectLeaveRequest(req.id, 'Shift coverage conflict')}
                                  className="px-2.5 py-1 bg-slate-800 hover:bg-rose-900/40 text-slate-300 hover:text-rose-300 font-medium rounded text-xs transition-colors"
                                >
                                  Decline
                                </button>
                              </div>
                            ) : (
                              <span className="text-slate-400 text-[11px] font-mono">
                                {req.reviewedBy ? `Reviewed by ${req.reviewedBy}` : 'Completed'}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 3: SHIFT ROSTER & CLOCK-IN ================= */}
        {activeTab === 'ROSTER' && (
          <div className="space-y-6 max-w-6xl mx-auto">
            {/* Header & Station Schedule Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-4 rounded-xl">
              <div>
                <h3 className="text-sm font-bold text-white">Daily Station Rostering & Timesheet Punching</h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  Real-time clock-in/out logging, overtime tracking, and station assignment
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsNewShiftModalOpen(true)}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 min-h-[38px]"
                >
                  <Clock className="w-4 h-4" />
                  <span>Assign Station Shift</span>
                </button>
              </div>
            </div>

            {/* Shift List Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {shiftSchedules.map(shift => (
                <div
                  key={shift.id}
                  className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <span className="text-xs font-mono text-amber-400 font-bold block">{shift.station}</span>
                        <h4 className="text-base font-bold text-white mt-0.5">{shift.employeeName}</h4>
                        <span className="text-xs text-slate-400">{shift.role} · {shift.department}</span>
                      </div>

                      <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded ${
                        shift.status === 'CLOCKED_IN'
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : shift.status === 'COMPLETED'
                          ? 'bg-slate-800 text-slate-300'
                          : 'bg-amber-500/10 text-amber-400'
                      }`}>
                        {shift.status === 'CLOCKED_IN' ? '● ON SHIFT' : shift.status}
                      </span>
                    </div>

                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-850 font-mono text-xs space-y-1.5 mt-3">
                      <div className="flex justify-between text-slate-400">
                        <span>Scheduled:</span>
                        <span className="text-slate-200">{shift.startTime} – {shift.endTime} ({shift.shiftType})</span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Clock In / Out:</span>
                        <span className="text-amber-300">
                          {shift.clockInTime || 'Not clocked in'} {shift.clockOutTime ? `→ ${shift.clockOutTime}` : ''}
                        </span>
                      </div>
                      {shift.hoursWorked && (
                        <div className="flex justify-between text-slate-400">
                          <span>Hours Logged:</span>
                          <span className="text-emerald-400 font-bold">{shift.hoursWorked} hrs</span>
                        </div>
                      )}
                      {shift.notes && (
                        <div className="text-[11px] text-slate-400 font-sans pt-1 border-t border-slate-850">
                          Note: {shift.notes}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Clock In / Out Action Buttons */}
                  <div className="mt-4 pt-3 border-t border-slate-850 flex items-center justify-between gap-2">
                    <span className="text-xs font-mono text-slate-400">{shift.date} ({shift.dayOfWeek})</span>

                    {shift.status === 'SCHEDULED' && (
                      <button
                        onClick={() => clockInShift(shift.id)}
                        className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded transition-colors flex items-center gap-1.5 min-h-[36px]"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>Clock In Staff</span>
                      </button>
                    )}

                    {shift.status === 'CLOCKED_IN' && (
                      <button
                        onClick={() => clockOutShift(shift.id)}
                        className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded transition-colors flex items-center gap-1.5 min-h-[36px]"
                      >
                        <Clock className="w-3.5 h-3.5" />
                        <span>Clock Out & Log Timesheet</span>
                      </button>
                    )}

                    {shift.status === 'COMPLETED' && (
                      <span className="text-xs text-emerald-400 font-mono font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Timesheet Confirmed
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ================= TAB 4: PAYROLL ENGINE & DISBURSEMENT ================= */}
        {activeTab === 'PAYROLL' && (
          <div className="space-y-6 max-w-7xl mx-auto">
            {/* Top Controls: Payroll Runs Selector & Generate Button */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 rounded-xl">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-amber-400" />
                  <span>Hospitality Payroll, Statutory Withholding & manual M-Pesa</span>
                </h3>
                <p className="text-xs text-slate-400 font-mono mt-1">
                  KRA PAYE with personal relief, NSSF Tier 1 & 2, NHIF/SHIF, 1.5% Affordable Housing, Overtime & Tip Pool Additions
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* Period Selector */}
                <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                  {payrollRuns.map(run => (
                    <button
                      key={run.id}
                      onClick={() => setSelectedPayrollRun(run)}
                      className={`px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1.5 ${
                        selectedPayrollRun?.id === run.id ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span>{run.period}</span>
                      <span className={`text-[10px] font-mono px-1 py-0.2 rounded font-bold ${
                        run.status === 'DISBURSED' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                      }`}>
                        {run.status}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Generate New Payroll Run */}
                <button
                  onClick={() => {
                    const nextPeriod = payrollPeriodInput;
                    generatePayrollRun(nextPeriod);
                  }}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 min-h-[40px]"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Re-compute Payroll</span>
                </button>
              </div>
            </div>

            {selectedPayrollRun && (
              <>
                {/* Payroll Run Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
                    <span className="text-xs text-slate-400 font-mono block">Gross Wages & Additions</span>
                    <span className="text-xl font-bold font-mono text-white mt-1 block">
                      KES {selectedPayrollRun.totalGross.toLocaleString()}
                    </span>
                    <span className="text-xs text-amber-400 mt-0.5 block">
                      Incl. KES {selectedPayrollRun.totalAdditions.toLocaleString()} tips & comms
                    </span>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
                    <span className="text-xs text-slate-400 font-mono block">Statutory Deductions</span>
                    <span className="text-xl font-bold font-mono text-rose-400 mt-1 block">
                      KES {selectedPayrollRun.totalDeductions.toLocaleString()}
                    </span>
                    <span className="text-xs text-slate-400 mt-0.5 block">
                      PAYE, NSSF, NHIF & Housing
                    </span>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
                    <span className="text-xs text-slate-400 font-mono block">Net Payable to Staff</span>
                    <span className="text-xl font-bold font-mono text-emerald-400 mt-1 block">
                      KES {selectedPayrollRun.totalNetPay.toLocaleString()}
                    </span>
                    <span className="text-xs text-slate-400 mt-0.5 block">
                      {selectedPayrollRun.employeeCount} Staff Members
                    </span>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col justify-between">
                    <div>
                      <span className="text-xs text-slate-400 font-mono block">Run Status & Workflow</span>
                      <span className={`text-sm font-bold font-mono mt-1 block ${
                        selectedPayrollRun.status === 'DISBURSED' ? 'text-emerald-400' : 'text-amber-400'
                      }`}>
                        {selectedPayrollRun.status}
                      </span>
                    </div>

                    <div className="pt-2 flex items-center gap-2">
                      {selectedPayrollRun.status === 'DRAFT' && (
                        <button
                          onClick={() => approvePayrollRun(selectedPayrollRun.id)}
                          className="w-full py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded transition-colors text-center"
                        >
                          Approve Run
                        </button>
                      )}

                      {selectedPayrollRun.status === 'APPROVED' && (
                        <button
                          onClick={() => disbursePayrollRun(selectedPayrollRun.id)}
                          className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded transition-colors flex items-center justify-center gap-1.5 shadow-md shadow-emerald-950"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Disburse via manual M-Pesa</span>
                        </button>
                      )}

                      {selectedPayrollRun.status === 'DISBURSED' && (
                        <span className="text-xs text-emerald-400 font-mono flex items-center gap-1">
                          <CheckCircle2 className="w-4 h-4" />
                          GL Posted & Disbursed
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Payslips Table */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                  <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                    <h4 className="text-sm font-bold text-white">
                      Itemized Payslips — {selectedPayrollRun.period} ({selectedPayrollRun.payslips.length} Employees)
                    </h4>
                    <span className="text-xs text-slate-400 font-mono">
                      All calculations adhere to KRA Tax Brackets & Statutory Thresholds
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-950 text-slate-400 font-mono border-b border-slate-800">
                        <tr>
                          <th className="p-3.5">Staff & PIN</th>
                          <th className="p-3.5">Basic Pay</th>
                          <th className="p-3.5">Overtime & Tips</th>
                          <th className="p-3.5">Gross Pay</th>
                          <th className="p-3.5">PAYE Tax</th>
                          <th className="p-3.5">NSSF/NHIF/Hous</th>
                          <th className="p-3.5">Advances</th>
                          <th className="p-3.5">Net Pay</th>
                          <th className="p-3.5">Method</th>
                          <th className="p-3.5 text-right">Payslip</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-sans">
                        {selectedPayrollRun.payslips.map(ps => (
                          <tr key={ps.id} className="hover:bg-slate-850/50 transition-colors">
                            <td className="p-3.5">
                              <span className="font-bold text-slate-100 block">{ps.employeeName}</span>
                              <span className="text-[11px] font-mono text-slate-400">{ps.employeeCode} · {ps.kraPin}</span>
                            </td>
                            <td className="p-3.5 font-mono text-slate-300">
                              KES {ps.basicPay.toLocaleString()}
                            </td>
                            <td className="p-3.5 font-mono">
                              <span className="text-amber-400 font-bold block">
                                +KES {(ps.overtimePay + ps.tipShare + ps.bottleCommissions).toLocaleString()}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                OT: {ps.overtimeHours}h | Tip: {ps.tipShare.toLocaleString()}
                              </span>
                            </td>
                            <td className="p-3.5 font-mono font-bold text-white">
                              KES {ps.grossPay.toLocaleString()}
                            </td>
                            <td className="p-3.5 font-mono text-rose-400">
                              -KES {ps.payeTax.toLocaleString()}
                            </td>
                            <td className="p-3.5 font-mono text-slate-300">
                              -KES {(ps.nssfPension + ps.nhifInsurance + ps.housingLevy).toLocaleString()}
                            </td>
                            <td className="p-3.5 font-mono">
                              {ps.advancesDeducted > 0 ? (
                                <span className="text-amber-400 font-bold">-KES {ps.advancesDeducted.toLocaleString()}</span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="p-3.5 font-mono font-bold text-emerald-400 text-sm">
                              KES {ps.netPay.toLocaleString()}
                            </td>
                            <td className="p-3.5">
                              <span className="text-[11px] font-mono font-bold text-slate-300 block">
                                {ps.disbursementMethod}
                              </span>
                              <span className={`text-[10px] font-mono ${
                                ps.disbursementStatus === 'DISBURSED' ? 'text-emerald-400' : 'text-amber-400'
                              }`}>
                                {ps.paymentReference || ps.disbursementStatus}
                              </span>
                            </td>
                            <td className="p-3.5 text-right">
                              <button
                                onClick={() => setInspectingPayslip(ps)}
                                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold text-xs rounded transition-colors"
                              >
                                View P9
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ================= TAB 5: SALARY ADVANCES ================= */}
        {activeTab === 'ADVANCES' && (
          <div className="space-y-6 max-w-5xl mx-auto">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-4 rounded-xl">
              <div>
                <h3 className="text-sm font-bold text-white">Staff Emergency Salary Advances</h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  Pre-payroll disbursements automatically linked to monthly payroll deductions
                </p>
              </div>

              <button
                onClick={() => setIsAdvanceModalOpen(true)}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 min-h-[38px]"
              >
                <DollarSign className="w-4 h-4" />
                <span>Request Salary Advance</span>
              </button>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 font-mono border-b border-slate-800">
                    <tr>
                      <th className="p-3.5">Employee</th>
                      <th className="p-3.5">Amount (KES)</th>
                      <th className="p-3.5">Emergency Justification</th>
                      <th className="p-3.5">Requested At</th>
                      <th className="p-3.5">Deduction Cycle</th>
                      <th className="p-3.5">Status</th>
                      <th className="p-3.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-sans">
                    {salaryAdvances.map(adv => (
                      <tr key={adv.id} className="hover:bg-slate-850/50 transition-colors">
                        <td className="p-3.5 font-bold text-slate-100">
                          {adv.employeeName}
                        </td>
                        <td className="p-3.5 font-mono font-bold text-amber-300 text-sm">
                          KES {adv.amount.toLocaleString()}
                        </td>
                        <td className="p-3.5 text-slate-300 max-w-xs">
                          {adv.reason}
                        </td>
                        <td className="p-3.5 font-mono text-slate-400 text-[11px]">
                          {new Date(adv.requestedAt).toLocaleDateString()}
                        </td>
                        <td className="p-3.5 font-mono text-slate-300">
                          {adv.payrollDeductionPeriod || 'Next Payroll Cycle'}
                        </td>
                        <td className="p-3.5">
                          <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded ${
                            adv.status === 'APPROVED'
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : adv.status === 'RECOVERED'
                              ? 'bg-slate-800 text-slate-400'
                              : 'bg-amber-500/10 text-amber-400'
                          }`}>
                            {adv.status}
                          </span>
                        </td>
                        <td className="p-3.5 text-right">
                          {adv.status === 'PENDING' ? (
                            <button
                              onClick={() => approveSalaryAdvance(adv.id)}
                              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded transition-colors"
                            >
                              Approve Advance
                            </button>
                          ) : (
                            <span className="text-slate-400 text-[11px] font-mono">
                              {adv.approvedBy ? `Approved by ${adv.approvedBy}` : 'Processed'}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 6: TILL & CASH DRAWER ================= */}
        {activeTab === 'TILL' && (
          <div className="space-y-6 max-w-4xl mx-auto">
            {tillSession && tillSession.status === 'OPEN' ? (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
                <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded">
                        SESSION ACTIVE
                      </span>
                      <h3 className="text-base font-bold text-white">
                        Drawer Session: {tillSession.terminalName}
                      </h3>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      Cashier: {tillSession.employeeName} · Started: {new Date(tillSession.openedAt).toLocaleTimeString()}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsPaidInOutOpen(true)}
                      className="px-3 py-1.5 text-xs font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors flex items-center gap-1.5"
                    >
                      <ArrowUpRight className="w-3.5 h-3.5 text-amber-400" />
                      Paid In / Out
                    </button>
                    <button
                      onClick={() => {
                        setCountedCash(tillSession.expectedCashInDrawer);
                        setIsCloseShiftOpen(true);
                      }}
                      className="px-4 py-1.5 text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors shadow-xs"
                    >
                      End Shift & Count
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-850">
                    <span className="text-xs text-slate-400 font-mono block">Opening Float</span>
                    <span className="text-lg font-bold text-white font-mono mt-1 block">
                      KES {tillSession.openingFloat.toLocaleString()}
                    </span>
                  </div>
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-850">
                    <span className="text-xs text-slate-400 font-mono block">Cash Sales</span>
                    <span className="text-lg font-bold text-emerald-400 font-mono mt-1 block">
                      +KES {tillSession.cashSalesTotal.toLocaleString()}
                    </span>
                  </div>
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-850">
                    <span className="text-xs text-slate-400 font-mono block">Paid In / (Out)</span>
                    <span className="text-lg font-bold text-amber-400 font-mono mt-1 block">
                      {(tillSession.cashPaidIn - tillSession.cashPaidOut) >= 0 ? '+' : ''}
                      KES {(tillSession.cashPaidIn - tillSession.cashPaidOut).toLocaleString()}
                    </span>
                  </div>
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-850">
                    <span className="text-xs text-slate-400 font-mono block">Expected in Drawer</span>
                    <span className="text-lg font-bold text-amber-300 font-mono mt-1 block">
                      KES {tillSession.expectedCashInDrawer.toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs space-y-2">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="font-semibold text-slate-300">Auditing Rule (Section 26 Blind Close):</span>
                    <span className="font-mono text-amber-400">Automated Discrepancy Logging</span>
                  </div>
                  <p className="text-slate-400 text-xs">
                    ServOS requires cashiers to enter counted currency blind upon shift close. Variances exceeding ±KES 50 trigger an immutable Anomaly Alert requiring manager review.
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center space-y-4">
                <Coins className="w-12 h-12 text-slate-600 mx-auto" />
                <div>
                  <h3 className="text-base font-bold text-white">No Active Till Session</h3>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                    Open a cash drawer session with an initial opening float to start recording cash receipts.
                  </p>
                </div>
                <button
                  onClick={() => openTillSession(10000)}
                  className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition-colors shadow-sm"
                >
                  Open Till Session (KES 10,000 Float)
                </button>
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 7: TIP POOLING ================= */}
        {activeTab === 'TIPS' && (
          <div className="space-y-6 max-w-4xl mx-auto">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Award className="w-5 h-5 text-amber-400" />
                    <span>FOH / BOH Tip Distribution Pool</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Hour-weighted point allocation across Bartenders, Servers, Kitchen brigade and Cashiers
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-400 font-mono block">Accumulated Shift Tips</span>
                  <span className="text-xl font-bold font-mono text-emerald-400">KES 14,850</span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="p-3">Staff Member</th>
                      <th className="p-3">Role</th>
                      <th className="p-3">Hours Worked</th>
                      <th className="p-3">Weight Factor</th>
                      <th className="p-3">Pooled Tips (KES)</th>
                      <th className="p-3 text-right">Direct Tips (KES)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850">
                    <tr className="hover:bg-slate-850">
                      <td className="p-3 font-bold text-slate-200">David Omondi</td>
                      <td className="p-3 text-slate-400">Bartender</td>
                      <td className="p-3">8.0 hrs</td>
                      <td className="p-3">1.2x (Lead)</td>
                      <td className="p-3 font-bold text-emerald-400">3,450</td>
                      <td className="p-3 text-right font-bold text-amber-300">1,800</td>
                    </tr>
                    <tr className="hover:bg-slate-850">
                      <td className="p-3 font-bold text-slate-200">Faith Mutua</td>
                      <td className="p-3 text-slate-400">Bartender</td>
                      <td className="p-3">7.5 hrs</td>
                      <td className="p-3">1.2x (Lead)</td>
                      <td className="p-3 font-bold text-emerald-400">3,250</td>
                      <td className="p-3 text-right font-bold text-amber-300">1,250</td>
                    </tr>
                    <tr className="hover:bg-slate-850">
                      <td className="p-3 font-bold text-slate-200">Kevin Otieno</td>
                      <td className="p-3 text-slate-400">Floor Server</td>
                      <td className="p-3">8.5 hrs</td>
                      <td className="p-3">1.0x</td>
                      <td className="p-3 font-bold text-emerald-400">3,400</td>
                      <td className="p-3 text-right font-bold text-amber-300">950</td>
                    </tr>
                    <tr className="hover:bg-slate-850">
                      <td className="p-3 font-bold text-slate-200">Joseph Mwangi</td>
                      <td className="p-3 text-slate-400">Chef (BOH)</td>
                      <td className="p-3">8.0 hrs</td>
                      <td className="p-3">0.8x</td>
                      <td className="p-3 font-bold text-emerald-400">2,550</td>
                      <td className="p-3 text-right font-bold text-slate-400">—</td>
                    </tr>
                    <tr className="hover:bg-slate-850">
                      <td className="p-3 font-bold text-slate-200">Alice Wambui</td>
                      <td className="p-3 text-slate-400">Cashier</td>
                      <td className="p-3">8.0 hrs</td>
                      <td className="p-3">0.7x</td>
                      <td className="p-3 font-bold text-emerald-400">2,200</td>
                      <td className="p-3 text-right font-bold text-slate-400">—</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ================= MODAL: EMPLOYEE PROFILE DETAILS ================= */}
      {selectedEmployee && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-lg w-full shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between pb-4 border-b border-slate-800">
              <div>
                <span className="font-mono text-xs text-amber-400 font-bold">{selectedEmployee.code}</span>
                <h3 className="text-lg font-bold text-white mt-0.5">{selectedEmployee.name}</h3>
                <p className="text-xs text-slate-400">{selectedEmployee.role} · {selectedEmployee.department}</p>
              </div>
              <button
                onClick={() => setSelectedEmployee(null)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-4 text-xs font-mono">
              <div className="grid grid-cols-2 gap-3 bg-slate-950 p-3.5 rounded-lg border border-slate-850">
                <div>
                  <span className="text-slate-400 font-sans block text-[11px]">National ID:</span>
                  <span className="text-slate-200 font-bold">{selectedEmployee.nationalId || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-sans block text-[11px]">KRA PIN:</span>
                  <span className="text-slate-200 font-bold">{selectedEmployee.kraPin || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-sans block text-[11px]">NSSF No:</span>
                  <span className="text-slate-200">{selectedEmployee.nssfNumber || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-sans block text-[11px]">NHIF No:</span>
                  <span className="text-slate-200">{selectedEmployee.nhifNumber || '—'}</span>
                </div>
              </div>

              <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-850 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-400 font-sans">Monthly Base Salary:</span>
                  <span className="font-bold text-white">KES {selectedEmployee.baseSalary.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-sans">Hourly Rate:</span>
                  <span className="text-slate-200">KES {selectedEmployee.hourlyRate}/hr</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-sans">Bottle Commission Rate:</span>
                  <span className="text-amber-400 font-bold">{(selectedEmployee.commissionRate * 100).toFixed(0)}%</span>
                </div>
              </div>

              <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-850 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-400 font-sans">Annual Leave Entitlement:</span>
                  <span className="text-slate-200">21 days</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-sans">Days Taken This Year:</span>
                  <span className="text-amber-400">{selectedEmployee.leaveTaken} days</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-sans">Remaining Balance:</span>
                  <span className="text-emerald-400 font-bold">{selectedEmployee.leaveBalance} days</span>
                </div>
              </div>

              <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-850 space-y-1.5">
                <div className="text-slate-400 font-sans font-semibold">Banking & Disbursement:</div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-sans">Bank:</span>
                  <span className="text-slate-200">{selectedEmployee.bankName || 'KCB Bank Kenya'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-sans">Account:</span>
                  <span className="text-slate-200">{selectedEmployee.bankAccount || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-sans">M-PESA Number:</span>
                  <span className="text-emerald-400 font-bold">{selectedEmployee.mpesaDisbursementNumber || selectedEmployee.phone}</span>
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-2 border-t border-slate-800">
              <button
                onClick={() => setSelectedEmployee(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: ITEMIZED PAYSLIP & P9 BREAKDOWN ================= */}
      {inspectingPayslip && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-lg w-full shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between pb-4 border-b border-slate-800">
              <div>
                <span className="text-xs font-mono text-amber-400 font-bold">OFFICIAL PAYSLIP — KENYA STATUTORY P9</span>
                <h3 className="text-lg font-bold text-white mt-0.5">{inspectingPayslip.employeeName}</h3>
                <p className="text-xs text-slate-400 font-mono">
                  PIN: {inspectingPayslip.kraPin} · {inspectingPayslip.role} · {inspectingPayslip.department}
                </p>
              </div>
              <button
                onClick={() => setInspectingPayslip(null)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-4 text-xs font-mono">
              {/* Earnings */}
              <div>
                <h4 className="text-xs font-sans font-bold text-slate-300 uppercase tracking-wider mb-2">Earnings Breakdown</h4>
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-850 space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-sans">Basic Monthly Pay:</span>
                    <span className="text-slate-200">KES {inspectingPayslip.basicPay.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-sans">Overtime ({inspectingPayslip.overtimeHours} hrs @ 1.5x):</span>
                    <span className="text-amber-400 font-bold">+KES {inspectingPayslip.overtimePay.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-sans">Tip Pool Allocation:</span>
                    <span className="text-amber-400 font-bold">+KES {inspectingPayslip.tipShare.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-sans">Bottle Sales Commissions:</span>
                    <span className="text-amber-400 font-bold">+KES {inspectingPayslip.bottleCommissions.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-sans">Duty & Welfare Allowances:</span>
                    <span className="text-amber-400 font-bold">+KES {inspectingPayslip.allowances.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between font-bold pt-1.5 border-t border-slate-800 text-white">
                    <span className="font-sans">Gross Taxable Earnings:</span>
                    <span>KES {inspectingPayslip.grossPay.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Deductions */}
              <div>
                <h4 className="text-xs font-sans font-bold text-slate-300 uppercase tracking-wider mb-2">Statutory & Other Deductions</h4>
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-850 space-y-1.5">
                  <div className="flex justify-between text-rose-400">
                    <span className="text-slate-400 font-sans">KRA PAYE (Income Tax):</span>
                    <span>-KES {inspectingPayslip.payeTax.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-rose-400">
                    <span className="text-slate-400 font-sans">NSSF Pension Contribution:</span>
                    <span>-KES {inspectingPayslip.nssfPension.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-rose-400">
                    <span className="text-slate-400 font-sans">NHIF / SHIF Health Insurance:</span>
                    <span>-KES {inspectingPayslip.nhifInsurance.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-rose-400">
                    <span className="text-slate-400 font-sans">Affordable Housing Levy (1.5%):</span>
                    <span>-KES {inspectingPayslip.housingLevy.toLocaleString()}</span>
                  </div>
                  {inspectingPayslip.advancesDeducted > 0 && (
                    <div className="flex justify-between text-amber-400">
                      <span className="text-slate-400 font-sans">Emergency Salary Advance:</span>
                      <span>-KES {inspectingPayslip.advancesDeducted.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold pt-1.5 border-t border-slate-800 text-rose-400">
                    <span className="font-sans">Total Deductions:</span>
                    <span>-KES {inspectingPayslip.totalDeductions.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Net Pay */}
              <div className="p-4 bg-emerald-950/40 border border-emerald-500/30 rounded-lg flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-300 font-sans block">Net Take-Home Pay</span>
                  <span className="text-xs text-emerald-400 font-mono">
                    Disbursement via {inspectingPayslip.disbursementMethod}
                  </span>
                </div>
                <span className="text-xl font-bold font-mono text-emerald-400">
                  KES {inspectingPayslip.netPay.toLocaleString()}
                </span>
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-2 border-t border-slate-800">
              <button
                onClick={() => setInspectingPayslip(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: ONBOARD NEW STAFF ================= */}
      {isAddStaffModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-md w-full shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-bold text-white mb-1">Onboard New Team Member</h3>
            <p className="text-xs text-slate-400 mb-4">
              Enter staff details to establish KRA compliance, contracts, and station permissions.
            </p>

            <form onSubmit={handleAddEmployeeSubmit} className="space-y-3">
              <div>
                <label className="text-xs text-slate-300 block mb-1">Full Legal Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Grace Wanjiku"
                  value={newEmpName}
                  onChange={e => setNewEmpName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-300 block mb-1">Role</label>
                  <select
                    value={newEmpRole}
                    onChange={e => setNewEmpRole(e.target.value as Employee['role'])}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs text-white"
                  >
                    <option value="WAITER">Waiter</option>
                    <option value="BARTENDER">Bartender</option>
                    <option value="CHEF">Chef</option>
                    <option value="CASHIER">Cashier</option>
                    <option value="RECEPTIONIST">Receptionist</option>
                    <option value="HOUSEKEEPER">Housekeeper</option>
                    <option value="MANAGER">Manager</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-300 block mb-1">Department</label>
                  <select
                    value={newEmpDept}
                    onChange={e => setNewEmpDept(e.target.value as Employee['department'])}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs text-white"
                  >
                    <option value="Food & Beverage">Food & Beverage</option>
                    <option value="Culinary / Kitchen">Culinary / Kitchen</option>
                    <option value="Front Desk & Rooms">Front Desk & Rooms</option>
                    <option value="Housekeeping">Housekeeping</option>
                    <option value="Finance & Admin">Finance & Admin</option>
                    <option value="General Management">General Management</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-300 block mb-1">Base Salary (KES)</label>
                  <input
                    type="number"
                    value={newEmpBaseSalary}
                    onChange={e => setNewEmpBaseSalary(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs font-mono font-bold text-amber-300"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-300 block mb-1">Hourly Rate (KES)</label>
                  <input
                    type="number"
                    value={newEmpHourlyRate}
                    onChange={e => setNewEmpHourlyRate(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs font-mono text-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-300 block mb-1">M-PESA / Mobile Number</label>
                <input
                  type="text"
                  value={newEmpPhone}
                  onChange={e => setNewEmpPhone(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs font-mono text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-300 block mb-1">KRA PIN</label>
                  <input
                    type="text"
                    value={newEmpKraPin}
                    onChange={e => setNewEmpKraPin(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs font-mono uppercase text-white"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-300 block mb-1">Bank Name</label>
                  <input
                    type="text"
                    value={newEmpBank}
                    onChange={e => setNewEmpBank(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddStaffModalOpen(false)}
                  className="px-4 py-2 text-xs text-slate-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg min-h-[38px]"
                >
                  Save & Onboard
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: EDIT STAFF PROFILE ================= */}
      {isEditStaffModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">Edit Staff Details & Contract</h3>
                <p className="text-xs text-slate-400 font-mono">Update role, compensation rates, department & status</p>
              </div>
              <button onClick={() => setIsEditStaffModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditStaff} className="space-y-3">
              <div>
                <label className="text-xs text-slate-300 block mb-1">Full Legal Name</label>
                <input
                  type="text"
                  required
                  value={editEmpName}
                  onChange={e => setEditEmpName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-300 block mb-1">Role Title</label>
                  <select
                    value={editEmpRole}
                    onChange={e => setEditEmpRole(e.target.value as Employee['role'])}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs font-bold text-white"
                  >
                    <option value="ADMIN">System Administrator</option>
                    <option value="MANAGER">General Manager</option>
                    <option value="WAITER">Senior Waiter / Waitress</option>
                    <option value="BARTENDER">Head Mixologist / Bartender</option>
                    <option value="CHEF">Head Chef / Kitchen Lead</option>
                    <option value="CASHIER">Till Cashier</option>
                    <option value="HOUSEKEEPING">Housekeeping Lead</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-300 block mb-1">Department</label>
                  <select
                    value={editEmpDept}
                    onChange={e => setEditEmpDept(e.target.value as Employee['department'])}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs font-bold text-white"
                  >
                    <option value="Management">Management</option>
                    <option value="Food & Beverage">Food & Beverage</option>
                    <option value="Kitchen Operations">Kitchen Operations</option>
                    <option value="Front Office & Rooms">Front Office & Rooms</option>
                    <option value="Finance & Accounts">Finance & Accounts</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-300 block mb-1">Email Address</label>
                  <input
                    type="email"
                    value={editEmpEmail}
                    onChange={e => setEditEmpEmail(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-300 block mb-1">Phone Number</label>
                  <input
                    type="text"
                    value={editEmpPhone}
                    onChange={e => setEditEmpPhone(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs font-mono text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-300 block mb-1">Base Monthly Salary (KES)</label>
                  <input
                    type="number"
                    min="0"
                    value={editEmpBaseSalary}
                    onChange={e => setEditEmpBaseSalary(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm font-mono font-bold text-amber-300"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-300 block mb-1">Hourly Rate (KES)</label>
                  <input
                    type="number"
                    min="0"
                    value={editEmpHourlyRate}
                    onChange={e => setEditEmpHourlyRate(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm font-mono text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-slate-300 block mb-1">KRA PIN</label>
                  <input
                    type="text"
                    value={editEmpKraPin}
                    onChange={e => setEditEmpKraPin(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs font-mono uppercase text-white"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-300 block mb-1">Contract Type</label>
                  <select
                    value={editEmpContractType}
                    onChange={e => setEditEmpContractType(e.target.value as any)}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs text-white"
                  >
                    <option value="PERMANENT">Permanent</option>
                    <option value="CASUAL">Casual / Daily</option>
                    <option value="CONTRACT">Contract</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-300 block mb-1">Duty Status</label>
                  <select
                    value={editEmpAttendanceStatus}
                    onChange={e => setEditEmpAttendanceStatus(e.target.value as any)}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs font-bold text-amber-400"
                  >
                    <option value="ON_DUTY">ON DUTY</option>
                    <option value="OFF_DUTY">OFF DUTY</option>
                    <option value="ON_LEAVE">ON LEAVE</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsEditStaffModalOpen(false)}
                  className="px-4 py-2 text-xs text-slate-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg min-h-[38px]"
                >
                  Save Employee Details
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: APPLY FOR LEAVE ================= */}
      {isLeaveModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-base font-bold text-white mb-1">Submit Leave Application</h3>
            <p className="text-xs text-slate-400 mb-4">
              Deductions are automatically factored against the employee's 21-day statutory entitlement.
            </p>

            <form onSubmit={handleCreateLeaveSubmit} className="space-y-3">
              <div>
                <label className="text-xs text-slate-300 block mb-1">Staff Member</label>
                <select
                  value={newLeaveEmployeeId}
                  onChange={e => setNewLeaveEmployeeId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs text-white"
                >
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.role} - {emp.leaveBalance} days remaining)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-300 block mb-1">Leave Category</label>
                <select
                  value={newLeaveType}
                  onChange={e => setNewLeaveType(e.target.value as StaffLeaveRequest['leaveType'])}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs text-white"
                >
                  <option value="ANNUAL">Annual Leave (Statutory)</option>
                  <option value="SICK">Sick Leave (Medical Certificate)</option>
                  <option value="COMPASSIONATE">Compassionate Leave</option>
                  <option value="MATERNITY_PATERNITY">Maternity / Paternity Leave</option>
                  <option value="UNPAID">Unpaid Leave</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-300 block mb-1">Start Date</label>
                  <input
                    type="date"
                    value={newLeaveStartDate}
                    onChange={e => setNewLeaveStartDate(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-300 block mb-1">End Date</label>
                  <input
                    type="date"
                    value={newLeaveEndDate}
                    onChange={e => setNewLeaveEndDate(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-300 block mb-1">Days Count</label>
                  <input
                    type="number"
                    min="1"
                    max="21"
                    value={newLeaveDaysCount}
                    onChange={e => setNewLeaveDaysCount(parseInt(e.target.value) || 1)}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs font-mono font-bold text-amber-300"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-300 block mb-1">Handover Colleague</label>
                  <select
                    value={newLeaveHandover}
                    onChange={e => setNewLeaveHandover(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs text-white"
                  >
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} ({emp.role})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-300 block mb-1">Reason / Coverage Plan</label>
                <input
                  type="text"
                  required
                  value={newLeaveReason}
                  onChange={e => setNewLeaveReason(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs text-white"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsLeaveModalOpen(false)}
                  className="px-4 py-2 text-xs text-slate-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg min-h-[38px]"
                >
                  Submit Application
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: ASSIGN STATION SHIFT ================= */}
      {isNewShiftModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-base font-bold text-white mb-1">Schedule Station Shift</h3>
            <p className="text-xs text-slate-400 mb-4">
              Allocate staff to station passes, floor tables or bar wells.
            </p>

            <form onSubmit={handleCreateShiftSubmit} className="space-y-3">
              <div>
                <label className="text-xs text-slate-300 block mb-1">Employee</label>
                <select
                  value={newShiftEmpId}
                  onChange={e => setNewShiftEmpId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs text-white"
                >
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.role})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-300 block mb-1">Date</label>
                  <input
                    type="date"
                    value={newShiftDate}
                    onChange={e => setNewShiftDate(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-300 block mb-1">Shift Type</label>
                  <select
                    value={newShiftType}
                    onChange={e => setNewShiftType(e.target.value as ShiftSchedule['shiftType'])}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs text-white"
                  >
                    <option value="MORNING">Morning (07:00-15:30)</option>
                    <option value="AFTERNOON">Afternoon (15:00-23:30)</option>
                    <option value="NIGHT">Night (22:00-06:30)</option>
                    <option value="DOUBLE">Double Shift (08:00-20:00)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-300 block mb-1">Station / Pass</label>
                <input
                  type="text"
                  value={newShiftStation}
                  onChange={e => setNewShiftStation(e.target.value)}
                  placeholder="e.g. Main Bar Station A, Terrace Tables 1-12"
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-300 block mb-1">Start Time</label>
                  <input
                    type="text"
                    value={newShiftStart}
                    onChange={e => setNewShiftStart(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs font-mono text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-300 block mb-1">End Time</label>
                  <input
                    type="text"
                    value={newShiftEnd}
                    onChange={e => setNewShiftEnd(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs font-mono text-white"
                  />
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsNewShiftModalOpen(false)}
                  className="px-4 py-2 text-xs text-slate-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg min-h-[38px]"
                >
                  Assign Shift
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: REQUEST SALARY ADVANCE ================= */}
      {isAdvanceModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-base font-bold text-white mb-1">Emergency Salary Advance</h3>
            <p className="text-xs text-slate-400 mb-4">
              Approved advances will be automatically deducted on the next monthly payroll run.
            </p>

            <form onSubmit={handleCreateAdvanceSubmit} className="space-y-3">
              <div>
                <label className="text-xs text-slate-300 block mb-1">Staff Member</label>
                <select
                  value={advanceEmpId}
                  onChange={e => setAdvanceEmpId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs text-white"
                >
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} (Base: KES {emp.baseSalary.toLocaleString()})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-300 block mb-1">Requested Amount (KES)</label>
                <input
                  type="number"
                  min="500"
                  step="500"
                  value={advanceAmount}
                  onChange={e => setAdvanceAmount(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-base font-mono font-bold text-amber-300"
                />
              </div>

              <div>
                <label className="text-xs text-slate-300 block mb-1">Emergency Justification</label>
                <input
                  type="text"
                  required
                  value={advanceReason}
                  onChange={e => setAdvanceReason(e.target.value)}
                  placeholder="e.g. Hospital outpatient prescription"
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs text-white"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAdvanceModalOpen(false)}
                  className="px-4 py-2 text-xs text-slate-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg min-h-[38px]"
                >
                  Submit Advance Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: CLOSE SHIFT & DRAWER COUNT ================= */}
      {isCloseShiftOpen && tillSession && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-base font-bold text-white mb-1">Close Cash Drawer & Count</h3>
            <p className="text-xs text-slate-400 mb-4">
              Enter the exact counted physical cash in the drawer.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-300 block mb-1">Physical Cash Counted (KES)</label>
                <input
                  type="number"
                  value={countedCash || ''}
                  onChange={e => setCountedCash(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-base font-mono font-bold text-amber-300"
                />
              </div>

              <div>
                <label className="text-xs text-slate-300 block mb-1">Handover Notes</label>
                <input
                  type="text"
                  value={closeNotes}
                  onChange={e => setCloseNotes(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs text-white"
                />
              </div>

              <div className="p-3 bg-slate-950 rounded border border-slate-800 text-xs font-mono space-y-1">
                <div className="flex justify-between text-slate-400">
                  <span>Expected in Drawer:</span>
                  <span>KES {tillSession.expectedCashInDrawer.toLocaleString()}</span>
                </div>
                <div className="flex justify-between font-bold pt-1 border-t border-slate-800">
                  <span>Variance (Over / Short):</span>
                  <span className={countedCash - tillSession.expectedCashInDrawer === 0 ? 'text-emerald-400' : 'text-rose-400'}>
                    KES {(countedCash - tillSession.expectedCashInDrawer).toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  onClick={() => setIsCloseShiftOpen(false)}
                  className="px-4 py-2 text-xs text-slate-400"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    closeTillSession(countedCash);
                    setIsCloseShiftOpen(false);
                    showToast('Shift session closed and drawer count reconciliation posted to General Ledger!', 'success');
                  }}
                  className="px-5 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg min-h-[38px]"
                >
                  Reconcile & Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: PAID IN / PAID OUT ================= */}
      {isPaidInOutOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-base font-bold text-white mb-1">Record Paid In / Paid Out</h3>
            <p className="text-xs text-slate-400 mb-4">Cash disbursements directly from the till drawer.</p>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setPaidType('PAID_OUT')}
                  className={`py-2 text-xs font-bold rounded-lg border transition-colors ${
                    paidType === 'PAID_OUT' ? 'bg-rose-600 text-white border-rose-500' : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  Paid Out (Expense)
                </button>
                <button
                  onClick={() => setPaidType('PAID_IN')}
                  className={`py-2 text-xs font-bold rounded-lg border transition-colors ${
                    paidType === 'PAID_IN' ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  Paid In (Float Top-up)
                </button>
              </div>

              <div>
                <label className="text-xs text-slate-300 block mb-1">Amount (KES)</label>
                <input
                  type="number"
                  value={paidAmount || ''}
                  onChange={e => setPaidAmount(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm font-mono font-bold text-amber-300"
                />
              </div>

              <div>
                <label className="text-xs text-slate-300 block mb-1">Voucher Description / Reason</label>
                <input
                  type="text"
                  value={paidReason}
                  onChange={e => setPaidReason(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs text-white"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  onClick={() => setIsPaidInOutOpen(false)}
                  className="px-4 py-2 text-xs text-slate-400"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    recordCashPaidInOut(paidType === 'PAID_IN' ? 'IN' : 'OUT', paidAmount, paidReason);
                    setIsPaidInOutOpen(false);
                    showToast(`Cash ${paidType === 'PAID_IN' ? 'Paid In' : 'Paid Out'} recorded and expected drawer cash updated!`, 'success');
                  }}
                  className="px-5 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg min-h-[38px]"
                >
                  Record Cash Voucher
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
