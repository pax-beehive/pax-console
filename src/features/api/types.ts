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
