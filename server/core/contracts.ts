// WORKER HUB core contracts.
// Types only: nothing here runs, and nothing imports this file yet.
// The pipeline depends on these abstractions, never on a specific platform.

import type { CAPABILITY_KEYS } from '../caps.ts';
import type {
  ConnectorContext,
  DiscoveredTask,
  DiscoveryCapability,
  DiscoveryConnector,
} from '../discovery/types.ts';

/* ------------------------------------------------------------------ */
/* Task profile: what a task needs, produced by the analyzer           */
/* ------------------------------------------------------------------ */

export const OUTPUT_KINDS = [
  'text',
  'code',
  'structured_data',
  'media',
  'file',
  'social_action',
  'onchain_action',
  'other',
] as const;
export type OutputKind = (typeof OUTPUT_KINDS)[number];

export const TASK_SIZES = ['micro', 'small', 'large'] as const;
export type TaskSize = (typeof TASK_SIZES)[number];

export type SuitabilityDecision = 'suitable' | 'unsuitable' | 'uncertain';

export interface TaskProfile {
  outputKind: OutputKind;
  size: TaskSize;
  acceptanceCriteria: string[];
  decision: SuitabilityDecision;
  reasons: string[];
  confidence: number; // 0..1
  analyzer: string; // rules, or the model name that produced it
}

/* ------------------------------------------------------------------ */
/* Policy: how much freedom the system has, per task kind              */
/* ------------------------------------------------------------------ */

// auto: run and submit alone. approve: run, then wait for the user. manual: the user does the work.
export type Autonomy = 'auto' | 'approve' | 'manual';

export interface AutonomyPolicy {
  default: Autonomy;
  byKind?: Partial<Record<OutputKind, Autonomy>>;
}

/* ------------------------------------------------------------------ */
/* Executors: one handler per kind of deliverable                      */
/* ------------------------------------------------------------------ */

// automatic: the system produces the deliverable itself.
// assisted: the system prepares material and a checklist; the user performs the real action.
export type ExecutionMode = 'automatic' | 'assisted';

export interface ExecutorTask {
  taskId: number;
  executionId: number;
  attempt: number;
  title: string;
  description: string;
  reward: number;
  currency: string;
  deadline: string | null;
}

export interface ExecutorInput {
  task: ExecutorTask;
  profile: TaskProfile;
}

export interface ExecutorArtifact {
  name: string;
  mimeType: string;
  path: string; // under the Worker Hub data directory
  bytes: number;
}

export interface ExecutorOutput {
  text: string;
  artifacts: ExecutorArtifact[];
  checklist: string[]; // steps for the user; used by assisted executors
  model: string | null;
  provider: string | null;
}

export interface TaskExecutor {
  readonly id: string;
  readonly mode: ExecutionMode;
  readonly outputKinds: readonly OutputKind[];
  execute(input: ExecutorInput): Promise<ExecutorOutput>;
}

/* ------------------------------------------------------------------ */
/* Connectors: the only place that knows a platform's API              */
/* ------------------------------------------------------------------ */

export type CapabilityKey = (typeof CAPABILITY_KEYS)[number];
export type ConnectorCapabilities = Record<CapabilityKey, DiscoveryCapability>;

export type AuthStrategy =
  | 'none'
  | 'bearer'
  | 'api_key'
  | 'api_key_query'
  | 'hmac'
  | 'oauth2'
  | 'wallet_signature';

export interface OutgoingRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

// Connectors never see raw secrets: they hand a request to the signer and get it back authorized.
export interface RequestSigner {
  authorize(request: OutgoingRequest): Promise<OutgoingRequest>;
}

export interface AuthorizedContext extends ConnectorContext {
  signer: RequestSigner;
}

export interface TaskDetails {
  externalId: string;
  title: string;
  description: string;
  requirements?: string;
  attachments: { name: string; url: string }[];
  raw?: unknown;
}

export interface ClaimResult {
  claimed: boolean;
  claimId?: string;
  expiresAt?: string | null;
  message?: string;
}

export interface SubmissionPayload {
  text: string;
  artifacts: ExecutorArtifact[];
}

export interface SubmissionResult {
  accepted: boolean;
  submissionId?: string;
  message?: string;
}

export type RemoteTaskStatus =
  | 'open'
  | 'claimed'
  | 'submitted'
  | 'accepted'
  | 'rejected'
  | 'expired'
  | 'cancelled';

export interface PayoutEvent {
  externalId: string;
  taskExternalId?: string;
  amount: number;
  currency: string;
  status: 'pending' | 'confirmed' | 'paid' | 'reversed';
  occurredAt: string;
}

// Discovery is the only required capability. Everything else is optional and declared in `capabilities`.
export interface PlatformConnector extends DiscoveryConnector {
  readonly authStrategy: AuthStrategy;
  readonly capabilities: ConnectorCapabilities;
  getTaskDetails?(ctx: AuthorizedContext, externalId: string): Promise<TaskDetails>;
  claimTask?(ctx: AuthorizedContext, externalId: string): Promise<ClaimResult>;
  submitWork?(
    ctx: AuthorizedContext,
    externalId: string,
    payload: SubmissionPayload,
  ): Promise<SubmissionResult>;
  getTaskStatus?(ctx: AuthorizedContext, externalId: string): Promise<RemoteTaskStatus>;
  listPayouts?(ctx: AuthorizedContext, since?: string): Promise<PayoutEvent[]>;
}

export type { DiscoveredTask };

/* ------------------------------------------------------------------ */
/* Union type: any connector (discovery-only or full platform)        */
/* ------------------------------------------------------------------ */

/**
 * AnyConnector — إما DiscoveryConnector (مبسط) أو PlatformConnector (كامل).
 * يُستخدم في الـ registry والـ engine للتعامل مع النوعين بشكل موحد.
 */
export type AnyConnector = DiscoveryConnector | PlatformConnector;
