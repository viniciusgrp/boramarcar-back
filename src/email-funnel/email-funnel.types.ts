export const EMAIL_FUNNEL_TIME_ZONE = 'America/Sao_Paulo';

export const EMAIL_FUNNEL_STEP_KEYS = [
  'welcome',
  'nudge_agenda',
  'leave_whatsapp',
  'tutorial',
  'video_agenda',
  'trial_mid',
  'trial_ending',
] as const;

export type EmailFunnelStepKey = (typeof EMAIL_FUNNEL_STEP_KEYS)[number];

export type EmailFunnelTriggerType =
  | 'immediate'
  | 'hours_after_signup'
  | 'days_after_signup'
  | 'days_before_trial_end';

export type EmailFunnelSkipReason =
  | 'paid'
  | 'setup_complete'
  | 'opted_out'
  | 'no_email'
  | 'not_due'
  | 'inactive_step'
  | 'already_processed'
  | 'trial_ended';

export type EmailFunnelEligibility = 'send' | EmailFunnelSkipReason;

export interface EmailFunnelStepRow {
  step_key: string;
  step_number: number;
  subject: string;
  title: string;
  body_text: string;
  body_if_setup: string | null;
  steps_json: EmailFunnelTutorialStep[] | null;
  cta_label: string;
  cta_path: string;
  trigger_type: EmailFunnelTriggerType;
  trigger_offset: number;
  send_hour: number | null;
  window_start_hour: number | null;
  window_end_hour: number | null;
  skip_if_setup_complete: boolean;
  is_active: boolean;
  image_url: string | null;
  video_url: string | null;
  updated_at: string;
}

export interface EmailFunnelTutorialStep {
  title: string;
  body: string;
}
