// Form Lead API endpoints. Extracted from `utils/api.ts` in Unit 04.
import { vantageFetch } from "./client";

export type FormLeadLookup = {
  _id: string;
  ref_no?: string;
  quoted?: boolean;
  cubic_feet?: number;
  /**
   * Mongo ObjectId of an attached BookedLead, when the form lead has one.
   * Present when the form lead has been booked. The popup uses this to
   * show "This form lead has a booking attached".
   */
  booked?: string | null;
};

export type FormLeadUpdatePayload = {
  quoted?: boolean;
  cubic_feet?: number;
};

export async function getFormLeadById(id: string): Promise<FormLeadLookup> {
  const envelope = await vantageFetch<FormLeadLookup>(
    `/api/v1/form-leads/${id}`,
    {
      method: "GET",
    },
  );

  return envelope.data;
}

export async function updateFormLead(
  id: string,
  payload: FormLeadUpdatePayload,
): Promise<FormLeadLookup> {
  const envelope = await vantageFetch<FormLeadLookup>(
    `/api/v1/form-leads/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );

  return envelope.data;
}
