import React from 'react';
import {WebApiPaymentPanel} from '../WebApiPaymentPanel';
/** Uses the existing verified payment implementation, including split and external evidence. */
export function PaySheet(props:React.ComponentProps<typeof WebApiPaymentPanel>){return <WebApiPaymentPanel {...props} compact/>;}
