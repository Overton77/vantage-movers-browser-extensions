export type ChannelOperationKind =
  | "lead_snapshot_apply"
  | "booking_action_apply";

export type ExtensionGranotApplyItem = {
  operation_id: string;
  operation_kind: ChannelOperationKind;
  granot_statement: Record<string, string | number | null>;
  expected_target?: { model: "FormLead" | "CallLead"; id: string };
};

export type SynchronizationOutcome =
  | "created"
  | "applied"
  | "linked"
  | "already_current"
  | "stale"
  | "pending_match"
  | "unmatched"
  | "ambiguous"
  | "conflict"
  | "deferred"
  | "policy_blocked"
  | "insufficient_creation_data"
  | "invalid"
  | "unsupported";

export type ExtensionGranotApplyResult = {
  operation_id: string;
  receipt_id: string;
  processing_state: "completed" | "accepted_for_processing";
  observation_id?: string;
  decision_id?: string;
  outcome?: SynchronizationOutcome;
  target?: { model: string; id: string };
  changed_paths: string[];
  message: string;
};

export type PendingGranotOperation = {
  operation_id: string;
  row_fingerprint: string;
  operation_kind: ChannelOperationKind;
  created_at: string;
  attempt_count: number;
};

export type UiRowStatus = "updated" | "unchanged" | "failed" | "skipped";
