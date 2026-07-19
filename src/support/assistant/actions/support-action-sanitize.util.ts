import {
  buildWallClockDateTime,
  wallClockToStorageIso,
} from '../../../schedule/utils/wall-clock-datetime.util';
import {
  SUPPORT_ACTION_TYPES,
  type SupportActionPayload,
  type SupportActionType,
  type SupportCancelAppointmentPayload,
  type SupportCreateAbsencePayload,
  type SupportParsedActionPropose,
} from './support-action.types';

/** [ACTION_PROPOSE:create_absence|{...json...}] */
export const SUPPORT_ACTION_PROPOSE_REGEX =
  /\[ACTION_PROPOSE:(create_absence|delete_absence|cancel_appointment)\|(\{[\s\S]*?\})\]/gi;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isActionType(value: string): value is SupportActionType {
  return (SUPPORT_ACTION_TYPES as readonly string[]).includes(value);
}

function sanitizeCreateAbsence(
  raw: Record<string, unknown>,
): SupportCreateAbsencePayload | null {
  const date = typeof raw.date === 'string' ? raw.date.trim() : '';
  if (!DATE_RE.test(date)) {
    return null;
  }

  const payload: SupportCreateAbsencePayload = { date };

  if (raw.allDay === true) {
    payload.allDay = true;
  }

  if (typeof raw.startTime === 'string' && TIME_RE.test(raw.startTime.trim())) {
    payload.startTime = raw.startTime.trim();
  }
  if (typeof raw.endTime === 'string' && TIME_RE.test(raw.endTime.trim())) {
    payload.endTime = raw.endTime.trim();
  }

  if (!payload.allDay && (!payload.startTime || !payload.endTime)) {
    payload.allDay = true;
  }

  if (typeof raw.reason === 'string') {
    const reason = raw.reason.trim().slice(0, 200);
    if (reason) {
      payload.reason = reason;
    }
  }

  if (
    typeof raw.professionalId === 'string' &&
    UUID_RE.test(raw.professionalId.trim())
  ) {
    payload.professionalId = raw.professionalId.trim();
  }

  return payload;
}

function sanitizeCancelAppointment(
  raw: Record<string, unknown>,
): SupportCancelAppointmentPayload | null {
  const payload: SupportCancelAppointmentPayload = {};

  if (
    typeof raw.appointmentId === 'string' &&
    UUID_RE.test(raw.appointmentId.trim())
  ) {
    payload.appointmentId = raw.appointmentId.trim();
  }

  if (typeof raw.date === 'string' && DATE_RE.test(raw.date.trim())) {
    payload.date = raw.date.trim();
  }

  if (typeof raw.time === 'string' && TIME_RE.test(raw.time.trim())) {
    payload.time = raw.time.trim();
  }

  if (typeof raw.customerNameHint === 'string') {
    const hint = raw.customerNameHint.trim().slice(0, 80);
    if (hint) {
      payload.customerNameHint = hint;
    }
  }

  if (payload.appointmentId) {
    return { appointmentId: payload.appointmentId };
  }

  if (!payload.date) {
    return null;
  }

  return payload;
}

export function sanitizeSupportActionPayload(
  type: SupportActionType,
  rawJson: string,
): SupportActionPayload | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }

  const record = parsed as Record<string, unknown>;

  if (type === 'create_absence' || type === 'delete_absence') {
    return sanitizeCreateAbsence(record);
  }

  return sanitizeCancelAppointment(record);
}

/**
 * Extrai no máximo 1 ACTION_PROPOSE válido e remove todos os marcadores do texto.
 */
export function extractSupportActionPropose(content: string): {
  displayContent: string;
  action: SupportParsedActionPropose | null;
  removedInvalid: number;
} {
  let action: SupportParsedActionPropose | null = null;
  let removedInvalid = 0;

  let displayContent = content.replace(
    SUPPORT_ACTION_PROPOSE_REGEX,
    (_full, rawType: string, rawJson: string) => {
      if (!isActionType(rawType)) {
        removedInvalid += 1;
        return '';
      }
      const payload = sanitizeSupportActionPayload(rawType, rawJson);
      if (!payload) {
        removedInvalid += 1;
        return '';
      }
      if (action) {
        removedInvalid += 1;
        return '';
      }
      action = { type: rawType, payload };
      return '';
    },
  );

  displayContent = displayContent
    .replace(/\[ACTION_PROPOSE:[^\]]*\]/gi, () => {
      removedInvalid += 1;
      return '';
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { displayContent, action, removedInvalid };
}

export function buildAbsenceRangeIso(payload: SupportCreateAbsencePayload): {
  startsAt: string;
  endsAt: string;
} {
  // Mesma convenção do restante do app: hora de parede no componente UTC
  // (ex.: 08:00 no salão → …T08:00:00.000Z). Ver wall-clock-datetime.util.ts.
  if (payload.allDay !== false && (!payload.startTime || !payload.endTime)) {
    const dayEnd = buildWallClockDateTime(payload.date, '23:59');
    dayEnd.setSeconds(59);

    return {
      startsAt: wallClockToStorageIso(
        buildWallClockDateTime(payload.date, '00:00'),
      ),
      endsAt: wallClockToStorageIso(dayEnd),
    };
  }

  return {
    startsAt: wallClockToStorageIso(
      buildWallClockDateTime(payload.date, payload.startTime as string),
    ),
    endsAt: wallClockToStorageIso(
      buildWallClockDateTime(payload.date, payload.endTime as string),
    ),
  };
}
