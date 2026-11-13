export type AsaasOnboardingStepStatus =
  | 'CONCLUIDO'
  | 'EM_ANALISE'
  | 'PENDENTE'
  | 'RECUSADO';

export interface AsaasOnboardingStep {
  key: 'commercialInfo' | 'bankAccountInfo' | 'documentation' | 'general';
  label: string;
  status: AsaasOnboardingStepStatus;
  statusLabel: string;
  actionLabel: string | null;
}

export interface AsaasOnboardingSteps {
  title: string;
  steps: AsaasOnboardingStep[];
}

const STEP_DEFINITIONS: Array<{
  key: AsaasOnboardingStep['key'];
  label: string;
  pendingAction: string;
  rejectedAction: string;
}> = [
  {
    key: 'commercialInfo',
    label: 'Dados comerciais',
    pendingAction: 'Completar dados comerciais',
    rejectedAction: 'Corrigir dados comerciais',
  },
  {
    key: 'bankAccountInfo',
    label: 'Conta bancária',
    pendingAction: 'Informar conta bancária',
    rejectedAction: 'Corrigir conta bancária',
  },
  {
    key: 'documentation',
    label: 'Documentos',
    pendingAction: 'Enviar documentos',
    rejectedAction: 'Reenviar documentos',
  },
  {
    key: 'general',
    label: 'Aprovação geral',
    pendingAction: 'Aguardar análise',
    rejectedAction: 'Revisar pendências',
  },
];

function mapStepStatus(raw?: string | null): AsaasOnboardingStepStatus {
  const value = raw?.trim().toUpperCase() ?? '';

  if (value === 'APPROVED') {
    return 'CONCLUIDO';
  }

  if (value === 'AWAITING_APPROVAL' || value === 'IN_ANALYSIS') {
    return 'EM_ANALISE';
  }

  if (value === 'REJECTED') {
    return 'RECUSADO';
  }

  return 'PENDENTE';
}

function statusLabel(status: AsaasOnboardingStepStatus): string {
  if (status === 'CONCLUIDO') {
    return 'Concluído';
  }

  if (status === 'EM_ANALISE') {
    return 'Em análise';
  }

  if (status === 'RECUSADO') {
    return 'Recusado';
  }

  return 'Pendente';
}

export function buildAsaasOnboardingSteps(input: {
  commercialInfo?: string | null;
  bankAccountInfo?: string | null;
  documentation?: string | null;
  general?: string | null;
  hasAccount: boolean;
}): AsaasOnboardingSteps {
  const values: Record<AsaasOnboardingStep['key'], string | null | undefined> =
    {
      commercialInfo: input.commercialInfo,
      bankAccountInfo: input.bankAccountInfo,
      documentation: input.documentation,
      general: input.general,
    };

  const steps: AsaasOnboardingStep[] = STEP_DEFINITIONS.map((definition) => {
    const status = input.hasAccount
      ? mapStepStatus(values[definition.key])
      : 'PENDENTE';

    return {
      key: definition.key,
      label: definition.label,
      status,
      statusLabel: statusLabel(status),
      actionLabel: null,
    };
  });

  const nextAction = steps.find(
    (step) => step.status === 'PENDENTE' || step.status === 'RECUSADO',
  );

  if (nextAction) {
    const definition = STEP_DEFINITIONS.find(
      (item) => item.key === nextAction.key,
    );

    if (!input.hasAccount && nextAction.key === 'commercialInfo') {
      nextAction.actionLabel = 'Começar cadastro';
    } else if (definition) {
      nextAction.actionLabel =
        nextAction.status === 'RECUSADO'
          ? definition.rejectedAction
          : definition.pendingAction;
    }
  }

  const ready = steps.every((step) => step.status === 'CONCLUIDO');

  return {
    title: ready
      ? 'Pronta para receber pagamentos online'
      : 'Falta pouco para receber pagamentos online',
    steps,
  };
}
