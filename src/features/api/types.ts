export type ApiRecord = Record<string, unknown>;

export type User = {
  user_id: string;
  email?: string;
  name?: string;
  role?: string;
  is_admin?: boolean;
  created_at?: string;
  last_seen_at?: string;
};

export type Node = {
  node_id: string;
  name?: string;
  hostname?: string;
  os?: string;
  arch?: string;
  machine_type?: string;
  paxd_version?: string;
  api_endpoint?: string;
  online?: boolean;
  status?: string;
  last_heartbeat?: string;
  registered_at?: string;
  metadata?: ApiRecord;
};

export type Health = {
  status?: string;
};

export type Agent = {
  agent_id: string;
  node_id: string;
  name?: string;
  hostname?: string;
  agent_type?: string;
  status?: string;
  online?: boolean;
  capabilities?: ApiRecord;
  metadata?: ApiRecord;
  last_heartbeat?: string;
  registered_at?: string;
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
  message_id: string;
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
  project_id?: string;
  name?: string;
  preview?: string;
  current_task?: string;
  status?: string;
  run_id?: string;
  run_status?: string;
  source?: string;
  model?: string;
  message_count?: number;
  workspace_roots?: string[];
  token_usage?: TokenUsage;
  metadata?: ApiRecord;
  created_at?: string;
  updated_at?: string;
  last_message_at?: string;
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
  my_role: TeamRole | string;
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
  status: "pending" | "accepted" | "declined" | string;
  invited_by_user_id?: string;
  created_at?: string;
  accepted_at?: string;
  declined_at?: string;
};

export type TeamAgent = {
  team_id: string;
  agent_id: string;
  agent_owner_user_id: string;
  added_by_user_id?: string;
  added_at?: string;
  removed_at?: string;
  removed_by_user_id?: string;
  agent?: Agent;
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
