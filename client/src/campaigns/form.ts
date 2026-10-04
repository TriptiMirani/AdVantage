import type { CampaignBody } from "../api/campaigns";
import type { ApiError } from "../api/http";
import type { CampaignDetail, CampaignStatus } from "../types";

export const STATUSES: CampaignStatus[] = ["DRAFT", "ACTIVE", "PAUSED", "ENDED"];

// Values exactly as typed. Conversion to API units happens only in validateValues.
export type FormValues = {
  name: string;
  status: CampaignStatus;
  budget: string;
  costPerImpressionMicros: string;
  costPerClickCents: string;
  targetingJson: string;
  creativeUrl: string;
  startDate: string;
  endDate: string;
};

export type Field = keyof FormValues;

export type FieldErrors = Partial<Record<Field, string>> & { form?: string };

export function emptyValues(today: string): FormValues {
  return {
    name: "",
    status: "DRAFT",
    budget: "",
    costPerImpressionMicros: "",
    costPerClickCents: "",
    targetingJson: "{}",
    creativeUrl: "",
    startDate: today,
    endDate: "",
  };
}

export function valuesFromCampaign(campaign: CampaignDetail): FormValues {
  return {
    name: campaign.name,
    status: campaign.status,
    budget: centsToDollars(campaign.budgetCents),
    costPerImpressionMicros: String(campaign.costPerImpressionMicros),
    costPerClickCents: String(campaign.costPerClickCents),
    targetingJson: JSON.stringify(campaign.targetAudience, null, 2),
    creativeUrl: campaign.creativeUrl,
    startDate: campaign.startDate.slice(0, 10),
    endDate: campaign.endDate.slice(0, 10),
  };
}

// Dollars as typed ("1250", "1250.5", "1250.50") to whole cents, using string arithmetic only.
export function dollarsToCents(text: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

export function centsToDollars(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

const WHOLE_NUMBER = /^\d+$/;
const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/;

function wholeNumber(text: string): number | null {
  const trimmed = text.trim();
  if (!WHOLE_NUMBER.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) ? value : null;
}

function isCalendarDay(text: string): boolean {
  if (!CALENDAR_DAY.test(text)) return false;
  const ms = Date.parse(`${text}T00:00:00.000Z`);
  return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === text;
}

// Same rule the server applies: absolute http or https URL.
function isHttpUrl(text: string): boolean {
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

// Mirrors server/src/schemas/campaign.ts. Returns the request body only when every field is valid.
export function validateValues(values: FormValues): { errors: FieldErrors; body: CampaignBody | null } {
  const errors: FieldErrors = {};

  const name = values.name.trim();
  if (name.length < 1 || name.length > 200) {
    errors.name = "Enter a name of 1 to 200 characters.";
  }

  const budgetCents = dollarsToCents(values.budget);
  if (budgetCents === null) {
    errors.budget = "Enter an amount in dollars with up to two decimals, for example 1250.00.";
  }

  const costPerImpressionMicros = wholeNumber(values.costPerImpressionMicros);
  if (costPerImpressionMicros === null) {
    errors.costPerImpressionMicros = "Enter a whole number of micros, 0 or more.";
  }

  const costPerClickCents = wholeNumber(values.costPerClickCents);
  if (costPerClickCents === null) {
    errors.costPerClickCents = "Enter a whole number of cents, 0 or more.";
  }

  let targetAudience: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = JSON.parse(values.targetingJson);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      targetAudience = parsed as Record<string, unknown>;
    } else {
      errors.targetingJson = 'Targeting must be a JSON object, for example {"region": "US"}.';
    }
  } catch {
    errors.targetingJson = "Targeting is not valid JSON.";
  }

  const creativeUrl = values.creativeUrl.trim();
  if (!isHttpUrl(creativeUrl) || creativeUrl.length > 2048) {
    errors.creativeUrl = "Enter a full http or https address.";
  }

  if (!isCalendarDay(values.startDate)) errors.startDate = "Choose a start date.";
  if (!isCalendarDay(values.endDate)) errors.endDate = "Choose an end date.";
  if (!errors.startDate && !errors.endDate && values.endDate < values.startDate) {
    errors.endDate = "The end date must be on or after the start date.";
  }

  if (
    Object.keys(errors).length > 0 ||
    budgetCents === null ||
    costPerImpressionMicros === null ||
    costPerClickCents === null ||
    targetAudience === null
  ) {
    return { errors, body: null };
  }

  return {
    errors: {},
    body: {
      name,
      status: values.status,
      budgetCents,
      costPerImpressionMicros,
      costPerClickCents,
      targetAudience,
      creativeUrl,
      startDate: `${values.startDate}T00:00:00.000Z`,
      endDate: `${values.endDate}T00:00:00.000Z`,
    },
  };
}

// Server field names differ from form field names in two places.
const SERVER_TO_FORM: Record<string, Field> = {
  name: "name",
  status: "status",
  budgetCents: "budget",
  costPerImpressionMicros: "costPerImpressionMicros",
  costPerClickCents: "costPerClickCents",
  targetAudience: "targetingJson",
  creativeUrl: "creativeUrl",
  startDate: "startDate",
  endDate: "endDate",
};

// Maps a server validation error to fields. Anything that cannot be placed on a field becomes a form message.
export function errorsFromServer(error: ApiError): FieldErrors {
  const errors: FieldErrors = {};
  const details: unknown = error.details;

  if (typeof details === "object" && details !== null && "fieldErrors" in details) {
    const fieldErrors = details.fieldErrors;
    if (typeof fieldErrors === "object" && fieldErrors !== null) {
      for (const [serverName, messages] of Object.entries(fieldErrors)) {
        const field = SERVER_TO_FORM[serverName];
        if (field && Array.isArray(messages) && typeof messages[0] === "string") {
          errors[field] = messages[0];
        }
      }
    }
  }

  // Date ordering is reported as a path on the error, not as a field error.
  if (typeof details === "object" && details !== null && "path" in details) {
    const path = details.path;
    if (Array.isArray(path) && path[0] === "endDate") {
      errors.endDate = error.message;
    }
  }

  if (Object.keys(errors).length === 0) {
    errors.form = error.message;
  }
  return errors;
}
