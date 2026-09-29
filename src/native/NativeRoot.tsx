import React from 'react';
import { useRuntime } from '../runtime/RuntimeProvider';
import { IntakeWizard } from './IntakeWizard';
import { EnrollmentView } from './EnrollmentView';
import { UnlockView } from './UnlockView';
import { SetupWizard } from './SetupWizard';
import { NativeBarShell } from './NativeBarShell';

export function NativeRoot(){const runtime=useRuntime();const {status,session,snapshot}=runtime;if(!status)return <div className="min-h-screen bg-slate-950 p-8 text-white">Opening local ServOS database…</div>;if(!status.enrolled){if(['NEW','INTAKE_IN_PROGRESS'].includes(status.installationStage))return <IntakeWizard/>;return <EnrollmentView/>;}if(!session||!snapshot)return <UnlockView/>;if(snapshot.installationStage!=='LIVE')return <SetupWizard/>;return <NativeBarShell/>}
