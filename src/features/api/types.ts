export type ApiRecord = Record<string, unknown>;

export type User = {
  user_id: string;
  email?: string;
  display_name?: string;
  name?: string;
  role?: string;
  is_admin?: boolean;
  created_at?: string;
  last_seen_at?: string;
};

export type Node = {
  node_id: string;
  name?: string;
  description?: string;
  hostname?: string;
  os?: string;
  arch?: string;
  machine_type?: string;
  paxd_version?: string;
  api_endpoint?: string;
  online?: boolean;
  status?: string;
  created_at?: string;
  updated_at?: string;
  last_active_at?: string;
  last_heartbeat?: string;
  registered_at?: string;
  metadata?: ApiRecord;
  user_metadata?: ApiRecord;
};

export type Health = {
  status?: string;
};

export type PaxdRelease = {
  platform: string;
  product: string;
  sha256: string;
  size_bytes: number;
  tags: string[];
  version: string;
};

export type Agent = {
  agent_id: string;
  node_id?: string;
  owner_user_id?: string;
  name?: string;
  description?: string;
  hostname?: string;
  agent_type?: string;
  machine_type?: string;
  os?: string;
  status?: string;
  online?: boolean;
  card?: ApiRecord;
  capabilities?: ApiRecord;
  metadata?: ApiRecord;
  user_metadata?: ApiRecord;
  created_at?: string;
  updated_at?: string;
  last_active_at?: string;
  last_heartbeat?: string;
  registered_at?: string;
};

export type NodeDaemonControlError = {
  code?: string;
  field?: string;
  message?: string;
};

export type NodeDaemonStatus = {
  phase: string;
};

export type NodeDaemonHarness = {
  capability?: string;
  command?: string[];
  display_name?: string;
  harness: string;
  install_hint?: string;
  last_error?: string;
  source?: string;
  state: string;
  version?: string;
};

export type NodeDaemonAgentConnectionStatus = {
  connected_at?: string;
  connection_id: string;
  failure_class?: string;
  last_error_code?: string;
  last_error_message?: string;
  observed_generation: number;
  observed_restart_nonce: number;
  phase: string;
  pid?: number;
  updated_at?: string;
};

export type NodeDaemonAgentConnection = {
  agent_type: string;
  cloud_agent_id?: string;
  command: string[];
  desired_acp_slots: number;
  desired_state: string;
  enabled: boolean;
  generation: number;
  harness: string;
  id: string;
  instance_id: string;
  name: string;
  remote_id: string;
  restart_nonce: number;
  report_local_sessions?: boolean;
  status?: NodeDaemonAgentConnectionStatus;
  working_dir?: string;
};

export type NodeDaemonCommand = {
  applied_at?: string;
  command_id: string;
  desired_generation?: number;
  error_code?: string;
  error_message?: string;
  received_at?: string;
  status: string;
  target_id?: string;
  target_type?: string;
  type?: string;
  updated_at?: string;
};

export type NodeDaemonSecretChannel = {
  channel_id: string;
  // Whatever paxd bound into this channel's encryption context. Not
  // necessarily this node's manager-assigned ID — callers must echo it back
  // verbatim when sealing/pushing a secret, never substitute their own idea
  // of "this node's ID".
  node_id: string;
  public_key: string;
  expires_at: string;
};

export type NodeDaemonQueryResult = {
  agent_connections?: { items: NodeDaemonAgentConnection[] };
  command?: NodeDaemonCommand;
  error?: NodeDaemonControlError;
  harnesses?: { items: NodeDaemonHarness[] };
  status?: NodeDaemonStatus;
  secret_channel_open?: NodeDaemonSecretChannel;
  type: string;
};

export type NodeDaemonCommandData = {
  command_ack?: ApiRecord;
  command_id: string;
  command_status?: string;
  confirmation_status?: string;
  connection_id?: string;
  desired_generation?: number;
  dispatch_error?: string;
  dispatch_status?: string;
  expected_version?: string;
  remote_id?: string;
};

export type CreatedNodeDaemonAgentConnection = NodeDaemonCommandData & {
  agent?: Agent;
  agent_id: string;
};

export type UserAPIKey = {
  key_id: string;
  name?: string;
  prefix?: string;
  owner_user_id?: string;
  created_at?: string;
  last_used_at?: string;
  revoked_at?: string;
};

export type CreatedUserAPIKey = {
  api_key: UserAPIKey;
  key: string;
};

export type CreatedNodeRegistrationToken = {
  expires_at?: string;
  owner_user_id?: string;
  token: string;
};

export type ApprovedNodeRegistration = {
  expires_at?: string;
  pair_code: string;
  registration_id: string;
  status: string;
};

export type ApprovedPaxlDeviceLogin = {
  expires_at?: string;
  login_id: string;
  status: string;
  user_code: string;
};

export type NodeRegistrationPreview = {
  created_at?: string;
  expires_at?: string;
  network?: {
    city?: string;
    country?: string;
    ip_address?: string;
  };
  pair_code: string;
  registration_id: string;
  request?: {
    api_endpoint?: string;
    arch?: string;
    hostname?: string;
    machine_type?: string;
    os?: string;
    paxd_version?: string;
  };
  status: string;
};

export type PaxdConnectPreview = {
  apiEndpoint?: string;
  arch?: string;
  city?: string;
  country?: string;
  hostname?: string;
  ipAddress?: string;
  machineType?: string;
  os?: string;
  paxdVersion?: string;
  requestedAt?: string;
};

export type ApprovalOption = {
  option_id?: string;
  label?: string;
  decision?: string;
  scope?: string;
};

export type AgentApproval = {
  approval_id: string;
  status?: string;
  title?: string;
  description?: string;
  risk_level?: string;
  domain?: string;
  operation?: string;
  resource_type?: string;
  resource_ref?: string;
  request_node_id?: string;
  request_agent_id?: string;
  request_session_id?: string;
  source_message_id?: string;
  requested_effects?: ApiRecord;
  request_body?: ApiRecord;
  raw_payload?: ApiRecord;
  options?: ApprovalOption[];
  decision?: string;
  decision_option?: string;
  decision_scope?: string;
  decided_by_user_id?: string;
  decided_at?: string;
  expires_at?: string;
  grant_node_id?: string;
  grant_agent_id?: string;
  grant_session_id?: string;
  grant_body?: ApiRecord;
  grant_revoked_at?: string;
  grant_revocation_reason?: string;
  grant_revoked_by_user_id?: string;
  owner_user_id?: string;
  created_at?: string;
};

export type TokenUsage = {
  input_tokens?: number;
  output_tokens?: number;
  reasoning_tokens?: number;
  total_tokens?: number;
  cost_usd?: number;
  actual_cost_usd?: number;
  estimated_cost_usd?: number;
};

export type FileChange = {
  path?: string;
  tool?: string;
  old_content?: string;
  new_content?: string;
};

export type MessagePart = {
  id?: number;
  revision?: number;
  message_id?: string;
  part_index: number;
  part_type: string;
  text?: string;
  payload_json?: ApiRecord;
  artifact_uri?: string;
  created_at?: string;
  updated_at?: string;
};

export type HistoryMessage = {
  id?: number;
  revision?: number;
  message_id: string;
  conversation_id?: string;
  owner_user_id?: string;
  node_id?: string;
  agent_id?: string;
  session_id?: string;
  source?: string;
  direction?: string;
  role?: string;
  status?: string;
  message_type?: string;
  parent_message_id?: string;
  turn_id?: string;
  response_id?: string;
  logical_key?: string;
  raw_json?: ApiRecord;
  parts?: MessagePart[];
  // Transcript ordering key (seq refactor): session-scoped monotonic order,
  // the single key used to order and dedup live + durable items.
  session_seq?: number;
  conversation_seq?: number;
  created_at?: string;
  updated_at?: string;
};

export type AgentSession = {
  id?: number;
  session_id: string;
  native_id?: string;
  node_id: string;
  agent_id: string;
  agent_type?: string;
  primary_project_id?: string;
  name?: string;
  reported_name?: string;
  name_is_custom?: boolean;
  preview?: string;
  current_task?: string;
  status?: string;
  run_id?: string;
  run_status?: string;
  runtime_status?: "idle" | "running" | "waiting_approval" | "unknown";
  runtime_turn_instance_id?: string;
  source?: string;
  transport?: "manager" | "e2ee";
  model?: string;
  message_count?: number;
  workspace_roots?: string[];
  token_usage?: TokenUsage;
  metadata?: ApiRecord;
  pax_config?: SessionPaxConfig;
  created_at?: string;
  updated_at?: string;
  last_active_at?: string;
  last_message_at?: string;
  last_user_message_at?: string;
  archived_at?: string;
};

export type Project = {
  project_id: string;
  owner_user_id: string;
  display_name: string;
  parent_project_id?: string;
  archived_at?: string;
  created_at: string;
  updated_at: string;
};

export type ProjectTarget = {
  target_id: string;
  project_id: string;
  agent_id: string;
  display_name: string;
  cwd: string;
  is_default: boolean;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type CreateProjectInput = {
  display_name: string;
  parent_project_id?: string;
};

export type UpdateProjectInput = {
  display_name?: string;
  parent_project_id?: string;
};

export type CreateProjectTargetInput = {
  agent_id: string;
  display_name?: string;
  cwd: string;
  is_default?: boolean;
  enabled?: boolean;
};

export type UpdateProjectTargetInput = {
  agent_id?: string;
  display_name?: string;
  cwd?: string;
  is_default?: boolean;
  enabled?: boolean;
};

export type Pagination = {
  page_num: number;
  page_size: number;
  total?: number;
  total_pages?: number;
};

export type ArtifactContent = {
  artifact_id?: string;
  ref: string;
  filename?: string;
  content_type?: string;
  size_bytes?: number;
  sha256?: string;
  bucket?: string;
  object?: string;
  generation?: number;
  storage_uri?: string;
  text?: string;
  created_at?: string;
};

export type SessionArtifact = {
  artifact_id: string;
  owner_user_id?: string;
  kind: string;
  schema_version: number;
  title?: string;
  summary?: string;
  status: "available" | "proposed" | "failed" | string;
  session_id?: string;
  message_id?: string;
  node_id?: string;
  agent_id?: string;
  source_json?: ApiRecord;
  payload_json?: ApiRecord;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string;
  contents?: ArtifactContent[];
};

export type ArtifactUpload = {
  upload_id: string;
  owner_user_id?: string;
  session_id?: string;
  kind?: string;
  title?: string;
  summary?: string;
  filename?: string;
  content_type?: string;
  size_bytes?: number;
  sha256?: string;
  bucket: string;
  object: string;
  generation?: number;
  status: "pending" | "completed" | string;
  expires_at: string;
  completed_at?: string;
  created_at?: string;
  updated_at?: string;
};

export type ArtifactUploadTicket = {
  upload_id: string;
  protocol: string;
  method: "PUT" | string;
  url: string;
  bucket: string;
  object: string;
  expires_at: string;
  headers?: Record<string, string>;
  upload: ArtifactUpload;
  content_ref: string;
  complete_url?: string;
};

export type CompleteArtifactUploadData = {
  upload: ArtifactUpload;
  artifact: SessionArtifact;
};

export type ArtifactContentURL = {
  url: string;
  expires_at: string;
  artifact: SessionArtifact;
  content: ArtifactContent;
};

export type UserAttachment = {
  attachment_id: string;
  conversation_id?: string;
  filename: string;
  content_type?: string;
  size_bytes?: number;
  sha256?: string;
  generation?: number;
  upload_status: "pending" | "completed" | string;
  upload_expires_at?: string;
  completed_at?: string;
  created_at?: string;
  updated_at?: string;
};

export type UserAttachmentUpload = {
  protocol: string;
  method: "POST" | string;
  url: string;
  headers?: Record<string, string>;
  chunk_alignment?: number;
  expires_at?: string;
};

export type UserAttachmentUploadTicket = {
  attachment: UserAttachment;
  upload: UserAttachmentUpload;
  complete_url?: string;
};

export type ArtifactPublication = {
  publication_id: string;
  node_id?: string;
  agent_id?: string;
  session_id?: string;
  filename?: string;
  title?: string;
  status: "queued" | "uploading" | "available" | "failed" | string;
  artifact_id?: string;
  error_code?: string;
  error_message?: string;
  created_at?: string;
  updated_at?: string;
};

export type ArtifactPublicationState = {
  publication: ArtifactPublication;
  artifact?: SessionArtifact;
};

export type ArtifactPreviewKind =
  | "image"
  | "pdf"
  | "text"
  | "markdown"
  | "json"
  | "download"
  | string;

export type ArtifactPublicationContentState = {
  status: "available" | "not_available" | "failed" | string;
  retryable: boolean;
  publication: ArtifactPublication;
  artifact?: Pick<SessionArtifact, "artifact_id">;
  content?: ArtifactContent;
  url?: string;
  expires_at?: string;
  preview_kind?: ArtifactPreviewKind;
  disposition?: "inline" | "attachment" | string;
  retry_after_seconds?: number;
};

export type SessionApprovalMode = "manual" | "auto_approve_all";

export type AgentPermissionChoice = {
  choice_id: string;
  label: string;
  description?: string;
  kind: "pax" | "agent";
  risk?: string;
  requires_confirmation?: boolean;
};

export type AgentPermissionCatalog = {
  catalog_revision: number | string;
  default_choice_id?: string;
  source: "live" | "observed" | "profile" | "pax_only";
  stale: boolean;
  choices: AgentPermissionChoice[];
};

export type SessionConfigValue = {
  value: string;
  name: string;
  description?: string;
  group?: string;
};

export type SessionConfigOption = {
  id: string;
  name: string;
  description?: string;
  category?: string;
  type: "select" | "boolean" | string;
  current_value: string | boolean;
  options?: SessionConfigValue[];
};

export type SessionLegacyModel = {
  id: string;
  name: string;
  description?: string;
};

export type SessionAvailableCommand = {
  name: string;
  description: string;
  input?: { hint?: string; type?: string; [key: string]: unknown } | null;
  _meta?: Record<string, unknown>;
};

export type SessionConfiguration = {
  commands?: {
    available_commands: SessionAvailableCommand[];
    observed_at: string;
  };
  session_id: string;
  options: SessionConfigOption[];
  legacy_models?: {
    current_model_id?: string;
    available?: SessionLegacyModel[];
  };
  source?: string;
  observed_at?: string;
  can_set: boolean;
  can_force_refresh: boolean;
  refresh_semantics?: "reapply_current_value" | string;
};

export type SessionPaxConfig = {
  cwd?: string;
  approval_mode?: SessionApprovalMode;
  permission_choice_id?: string;
};

export type AgentProfile = {
  profile_id: string;
  owner_type?: string;
  owner_id?: string;
  display_name?: string;
  description?: string;
  card?: ApiRecord;
  metadata?: ApiRecord;
  status?: string;
  created_by_user_id?: string;
  created_at?: string;
  updated_at?: string;
  archived_at?: string;
};

export type RepresentativeAgent = {
  representative_agent_id: string;
  profile_id: string;
  runtime_agent_id: string;
  represents_type?: string;
  represents_id?: string;
  approval_policy_id?: string;
  status?: string;
  created_by_user_id?: string;
  created_at?: string;
  updated_at?: string;
  archived_at?: string;
};

export type Conversation = {
  conversation_id: string;
  conversation_type?: string;
  boundary_type?: string;
  boundary_id?: string;
  history_policy?: string;
  status?: string;
  created_at?: string;
  archived_at?: string;
};

export type ConversationAgentBinding = {
  binding_id: string;
  conversation_id: string;
  representative_agent_id: string;
  relationship_type?: string;
  added_by_user_id?: string;
  access_mode?: string;
  status?: string;
  created_at?: string;
  archived_at?: string;
};

export type ConversationAgentInvocation = {
  invocation_id: string;
  conversation_id: string;
  representative_agent_id: string;
  session_id?: string;
  requested_by_user_id?: string;
  access_mode?: string;
  max_turns?: number;
  remaining_turns?: number;
  status?: string;
  created_at?: string;
};

export type AgentConversationDelivery = {
  status: "delivered" | "pending" | string;
  error?: string;
};

export type AgentInquiryResult = {
  bindings: ConversationAgentBinding[];
  conversation: Conversation;
  delivery: AgentConversationDelivery;
  invocation: ConversationAgentInvocation;
  prompt_message: HistoryMessage;
  source_session: AgentSession;
  target_session: AgentSession;
};

export type AgentOwnerSubject = {
  kind: "user" | "team" | string;
  user?: User;
  team?: TeamSummary;
};

export type AgentOwnerInfo = {
  agent: Agent;
  owner: AgentOwnerSubject;
  profile?: AgentProfile;
  representative_agent?: RepresentativeAgent;
};

export type MailboxMessage = {
  id?: number;
  message_id: string;
  node_id?: string;
  agent_id?: string;
  session_id?: string;
  user_id?: string;
  direction?: string;
  message?: string;
  message_type?: string;
  status?: string;
  payload?: ApiRecord;
  events?: ApiRecord;
  file_changes?: FileChange[];
  token_usage?: TokenUsage;
  result?: string;
  error?: string;
  turn_id?: string;
  response_id?: string;
  parent_message_id?: string;
  created_at?: string;
  delivered_at?: string;
  completed_at?: string;
};

export type TeamRole = "owner" | "operator" | "member";

export type Team = {
  team_id: string;
  owner_user_id: string;
  name: string;
  status: "active" | "archived" | string;
  created_at?: string;
  archived_at?: string;
};

export type TeamSummary = Team & {
  my_role?: TeamRole | string;
  role?: TeamRole | string;
  member_count: number;
  agent_count: number;
};

export type TeamMember = {
  team_id: string;
  user_id: string;
  email?: string;
  role: TeamRole | string;
  status: "active" | "removed" | string;
  invited_by_user_id?: string;
  joined_at?: string;
  removed_at?: string;
  removed_by_user_id?: string;
};

export type TeamInvite = {
  invite_id: string;
  team_id: string;
  email: string;
  recipient_user_id?: string;
  role: Exclude<TeamRole, "owner"> | string;
  status: "pending" | "accepted" | "declined" | "canceled" | string;
  invited_by_user_id?: string;
  created_at?: string;
  accepted_at?: string;
  declined_at?: string;
  canceled_at?: string;
};

export type TeamAgent = {
  team_id: string;
  agent_id: string;
  agent_owner_user_id: string;
  agent_owner_email?: string;
  added_by_user_id?: string;
  added_at?: string;
  removed_at?: string;
  removed_by_user_id?: string;
  agent?: Agent;
};

export type TeamAuditAction =
  | "team.created"
  | "team.archived"
  | "invite.created"
  | "invite.accepted"
  | "invite.declined"
  | "invite.canceled"
  | "member.role_updated"
  | "member.removed"
  | "agent.added"
  | "agent.removed"
  | string;

export type TeamAuditEvent = {
  event_id: string;
  team_id: string;
  actor_user_id: string;
  action: TeamAuditAction;
  target_user_id?: string;
  target_agent_id?: string;
  target_invite_id?: string;
  metadata?: ApiRecord;
  created_at?: string;
};

export type Friend = {
  friend_id: string;
  requester_user_id: string;
  requester_email: string;
  requester_alias?: string;
  recipient_user_id?: string;
  recipient_email: string;
  recipient_alias?: string;
  status: "pending" | "accepted" | "removed" | "blocked" | string;
  created_at?: string;
  accepted_at?: string;
  removed_at?: string;
  blocked_at?: string;
};

export type KnowledgeCapsule = {
  capsule_id: string;
  owner_user_id: string;
  source_session_id: string;
  source_agent_id: string;
  source_node_id?: string;
  created_by_user_id: string;
  keyword: string;
  title: string;
  summary: string;
  content: string;
  suggested_skills?: unknown;
  references?: unknown;
  open_questions?: unknown;
  risks?: unknown;
  redactions?: unknown;
  status: "active" | "archived" | string;
  truncated?: boolean;
  original_estimated_chars?: number;
  created_at?: string;
  archived_at?: string;
};

export type SessionKnowledgeInjection = {
  injection_id: string;
  owner_user_id: string;
  capsule_id: string;
  target_session_id: string;
  target_agent_id: string;
  target_node_id?: string;
  created_by_user_id: string;
  delivered_as_user_id?: string;
  delivery_method?: string;
  delivery_message_id?: string;
  delivery_message_type?: string;
  status: "pending" | "delivered" | "failed" | "revoked" | string;
  created_at?: string;
  delivered_at?: string;
  failed_at?: string;
  revoked_at?: string;
  error?: string;
};

export type Envelope = {
  envelope_id: string;
  sender_user_id: string;
  sender_email: string;
  recipient_user_id?: string;
  recipient_email: string;
  payload_type: "knowledge_capsule" | string;
  payload_json: unknown;
  message?: string;
  status: "pending" | "accepted" | "archived" | string;
  created_at?: string;
  accepted_at?: string;
  archived_at?: string;
};
