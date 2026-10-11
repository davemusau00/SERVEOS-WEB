import React, {useState, useEffect, useRef} from 'react';
import {X, Minus, Plus, CheckCircle2, CreditCard, Landmark, User, MoreHorizontal, Loader2} from 'lucide-react';
import type {BusinessRecord} from '../session';
import {parseMoneyToMinor} from '../../utils/fiscal';

interface PaySheetProps {
  isOpen: boolean;
  onClose: () => void;
  order: BusinessRecord;
  till: BusinessRecord;
  accounts: BusinessRecord[];
  onPaymentSubmit: (payment: PaymentData) => void;
  disabled?: boolean;
}

interface PaymentData {
  tenders: Tender[];
}

interface Tender {
  id: string;
  accountId: string;
  amountMinor: number;
  cashTenderedMinor?: number;
  reference?: string;
  manuallyConfirmed?: boolean;
  receivedAmountMinor?: number;
  receivedAt?: string;
}

const formatMoney = (minor: number) => 
  (minor / 100).toLocaleString('en-KE', {style: 'currency', currency: 'KES'});
