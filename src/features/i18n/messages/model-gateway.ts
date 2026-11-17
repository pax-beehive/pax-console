export const modelGatewayMessages: Record<string, string> = {
  "Model gateway": "模型网关",
  "Free model budgets, access, and usage": "免费模型预算、访问权限和用量",
  "Manage the regional free model pool, monthly user allowances, and model safety policies.":
    "管理当前区域的免费模型总池、用户月度额度与模型安全策略。",
  "A user override takes effect immediately and persists into future months. Reducing a cap preserves spend and reservations. Pausing access stops new free model requests.":
    "用户单独额度立即生效，并沿用至后续月份。降低上限不会清除已消费及预留金额。暂停访问将阻止新的免费模型请求。",
  "Access paused": "已暂停访问",
  "Applies to new free users and future monthly resets without a user override. Both the dollar and token limits apply. Zero disables that allowance.":
    "适用于新免费用户，以及未单独设置额度的用户后续月度重置。金额与 token 上限同时生效，设为零即停用该额度。",
  "Configuration audit": "配置审计",
  "Configuration revision {revision}": "配置修订号 {revision}",
  "Configured models": "已配置模型",
  "Conservative settlement": "保守结算",
  "Could not load model gateway settings{status}. Refresh to try again.":
    "无法加载模型网关设置{status}，请刷新重试。",
  "Could not refresh settings. Last loaded values and your edits are preserved. Refresh before saving.":
    "无法刷新设置。已保留上次加载的值和当前修改，请刷新后再保存。",
  "Could not save settings{status}. Your edits are preserved.":
    "无法保存设置{status}，已保留当前修改。",
  "Current regional Manager · amounts in USD":
    "当前区域 Manager · 金额单位为美元",
  "Default allowance": "默认额度",
  "Default monthly allowance": "默认月度额度",
  "Default monthly budget (USD)": "默认月度预算（美元）",
  "Default monthly tokens": "默认月度 token 额度",
  "Email or user ID": "邮箱或用户 ID",
  "Enable model": "启用模型",
  "Enable {id}": "启用 {id}",
  "Filter users and requests": "筛选用户与请求",
  "First {kind}": "首批{kind}",
  "Free model request ledger": "免费模型请求账本",
  "Generation canceled": "已取消生成",
  "Input USD / million for {id}": "{id} 每百万输入 token 价格（美元）",
  "Ledger records are shown once per request. Reserved amounts are holds, not additional charges. Failure codes contain no prompt or provider response body.":
    "每个请求只显示一条账本记录。预留金额是暂时冻结，不会重复收费。失败代码不包含提示词或上游响应正文。",
  "Loading model gateway…": "正在加载模型网关…",
  "Manage the free model pool, monthly allowances, and configured model policies for this region.":
    "管理当前区域的免费模型总池、月度额度与已配置模型策略。",
  "Max output tokens for {id}": "{id} 最大输出 token 数",
  "Model gateway management is available to administrators. Access denied. Sign in to the Manager deployment you want to manage.":
    "模型网关管理仅限管理员访问。请使用对应 Manager 部署的管理员账号登录。",
  "Model policy requires review: {warning}": "模型策略需要检查：{warning}",
  "Model requests": "模型请求",
  "Model {id}": "模型 {id}",
  "Moderation blocked": "安全检测已拦截",
  "Moderation interrupted": "安全检测中断",
  "Moderation unavailable": "安全检测不可用",
  "Monthly budget (USD) for {id}": "{id} 月度预算（美元）",
  "Monthly tokens for {id}": "{id} 月度 token 额度",
  "Next {kind}": "下一批{kind}",
  "No configuration changes recorded.": "暂无配置修改记录。",
  "No configured models.": "暂无已配置模型。",
  "No matching free users.": "没有匹配的免费用户。",
  "No matching model requests.": "没有匹配的模型请求。",
  "Off — skip moderation for this model": "关闭 — 此模型跳过安全检测",
  "OpenAI moderation required": "必须通过 OpenAI 安全检测",
  "Output USD / million for {id}": "{id} 每百万输出 token 价格（美元）",
  "Pause free access for {id}": "暂停 {id} 免费访问",
  "Pause free model access": "暂停免费模型访问",
  "Platform monthly budget (USD)": "平台月度预算（美元）",
  "Platform pool": "平台总池",
  "Policy version: {version}": "策略版本：{version}",
  "Prices are the accounting rates per million tokens. Keep them aligned with your provider pricing.":
    "价格是每百万 token 的记账费率，请与上游供应商的实际价格保持一致。",
  "Provider and upstream identities come from server configuration. Credentials stay on the server.":
    "供应商和上游模型身份来自服务端配置，密钥仅保存在服务端。",
  "Provider: {provider}": "供应商：{provider}",
  "Refresh settings": "刷新设置",
  "Remaining {remaining} · {tokens} tokens":
    "剩余 {remaining} · {tokens} token",
  "Request status": "请求状态",
  "Requests to this model skip the OpenAI safety check.":
    "此模型的请求将跳过 OpenAI 安全检测。",
  Reserved: "已预留",
  "Reset date unavailable": "重置日期不可用",
  "Reset date unavailable.": "重置日期不可用。",
  "Resets {date} (UTC)": "于 {date}（UTC）重置",
  "Resets {date} (UTC).": "于 {date}（UTC）重置。",
  "Safety policy for {model}": "{model} 安全策略",
  "Safety: {verdict}": "安全检测：{verdict}",
  "Save {label}": "保存{label}",
  "Saved changes record the administrator, action, target, revision, and time.":
    "保存的修改会记录管理员、操作、目标、修订号和时间。",
  "Saved.": "已保存。",
  "Search by exact email or user ID. Filters apply to both lists; changing filters returns to their first pages.":
    "按完整邮箱或用户 ID 搜索。筛选同时应用于两个列表，改变筛选条件会返回首页。",
  "Server model configuration changed. The previous policy was disabled. Review the provider, model, safety settings and prices, then enable and save this model to approve its current configuration.":
    "服务端模型配置已改变，旧策略已停用。请检查供应商、模型、安全设置和价格，再启用并保存模型以确认当前配置。",
  "Server settings changed; reload this form to use the latest values.":
    "服务端设置已改变，请重新加载此表单以使用最新值。",
  "Server values changed. Reset changes to review the current configuration before saving.":
    "服务端值已改变，请重置修改并检查当前配置后再保存。",
  "Settings changed on the server. Your edits are preserved. Reload this form to review current values before saving.":
    "服务端设置已改变，已保留当前修改。请重新加载此表单并检查当前值后再保存。",
  Settled: "已结算",
  "Spent {spent} · reserved {reserved}": "已消费 {spent} · 预留 {reserved}",
  "Time unavailable": "时间不可用",
  "Tokens: {spent} spent · {reserved} reserved":
    "Token：已消费 {spent} · 预留 {reserved}",
  Unresolved: "尚未解析",
  "Unused budget does not carry over. A changed cap preserves current spend and holds.":
    "未使用的预算不会结转。修改上限不会清除当前消费与预留金额。",
  Unversioned: "未设置版本",
  "Upstream model: {model}": "上游模型：{model}",
  "Upstream request ID": "上游请求 ID",
  "User allowances": "用户额度",
  "User {id}": "用户 {id}",
  "Users and requests": "用户与请求",
  users: "用户",
  "{amount} held": "已冻结 {amount}",
  "{kind} pagination": "{kind}分页",
  "{tokens} total": "共 {tokens}",
  "Monthly limit": "月度上限",
  Spent: "已消费",
  Remaining: "剩余",
  Funded: "有余额",
  "Zero budget": "预算为零",
  "Free model requests are disabled. Changing the budget does not enable hosting.":
    "免费模型请求尚未启用。调整预算不会启用托管。",
  "Free model requests are currently unavailable despite the remaining budget.":
    "当前仍有余额，但免费模型请求暂不可用。",
  Exhausted: "已耗尽",
  "Hosting enabled": "托管已启用",
  "Hosting disabled": "托管已停用",
  "Generation started": "已开始生成",
  "Generation not started": "尚未开始生成",
  "Time / request": "时间 / 请求",
  "Model / provider": "模型 / 供应商",
  "Status / safety": "状态 / 安全检测",
  "Spent / reserved": "消费 / 预留",
  "Tokens in / out": "输入 / 输出 token",
  "Reload this form": "重新加载此表单",
  "Reset changes": "重置修改",
  "Check the entered values.": "请检查输入值。",
  "Enter a nonnegative dollar amount with up to 6 decimal places.":
    "请输入非负金额，最多保留六位小数。",
  "Dollar amount is too large.": "金额过大。",
  "Enter a positive whole token limit.": "请输入正整数 token 上限。",
  "Enter a nonnegative whole token limit.": "请输入非负整数 token 上限。",

  "Choose a supported provider.": "请选择支持的供应商。",
  "Add model": "新增模型",
  "New model": "新模型",
  "Create model": "创建模型",
  "Model alias": "模型别名",
  Provider: "供应商",
  "Upstream model ID": "上游模型 ID",
  "Safety policy for the new model": "新模型安全策略",
  "Max output tokens for the new model": "新模型最大输出 token 数",
  "Input USD / million for the new model":
    "新模型每百万输入 token 价格（美元）",
  "Output USD / million for the new model":
    "新模型每百万输出 token 价格（美元）",
  "Cancel adding model": "取消新增模型",
  "New models start disabled. Connect the provider before enabling them.":
    "新增模型默认停用；启用前需要接入对应 Provider。",
  "Model saved and disabled. Connect its provider before enabling it.":
    "模型已保存并停用，接入对应 Provider 后才可启用。",
  "Use a public alias for agents and the provider's exact model ID. Prices are required; enter zero explicitly for a free rate. Credentials stay on the server.":
    "填写 Agent 使用的公开别名与供应商的准确模型 ID。必须填写价格；免费费率请明确输入零。密钥仅保存在服务端。",
  "This alias or provider/model is already configured. Choose a different model or alias; your other settings are preserved.":
    "模型别名或对应供应商模型已存在，请更换模型或别名，其他设置已保留。",
  "Enter a model alias of up to 128 letters, numbers or model ID punctuation.":
    "请输入最多 128 个字符的模型别名，仅支持字母、数字与模型 ID 标点。",
  "Enter an upstream model ID of up to 256 letters, numbers or model ID punctuation.":
    "请输入最多 256 个字符的上游模型 ID，仅支持字母、数字与模型 ID 标点。",
  "Max output tokens cannot exceed 8192.": "最大输出 token 数不能超过 8192。",
  "A model rate cannot exceed 1000000 USD per million tokens.":
    "模型费率不能超过每百万 token 1000000 美元。",
  "OpenRouter model catalog": "OpenRouter 模型目录",
  "Choose an OpenRouter model": "选择 OpenRouter 模型",
  "Retry catalog": "重试加载目录",
  "Refresh catalog": "刷新目录",
  "Loading OpenRouter models…": "正在加载 OpenRouter 模型…",
  "Could not load the OpenRouter catalog. Retry to choose a model.":
    "无法加载 OpenRouter 模型目录，请重试后选择模型。",
  "Search OpenRouter models": "搜索 OpenRouter 模型",
  "Search by model name or ID": "按模型名称或 ID 搜索",
  "OpenRouter models": "OpenRouter 模型列表",
  "Select {name} ({id})": "选择 {name}（{id}）",
  "Input {input} / output {output} per million tokens":
    "每百万 token 输入 {input} / 输出 {output}",
  "Context {context} · max output {output}":
    "上下文 {context} · 最大输出 {output}",
  "Showing 20 of {count} matches. Refine your search.":
    "显示 {count} 个匹配项中的前 20 个，请细化搜索条件。",
  "No matching unconfigured models. Change your search or review existing models.":
    "没有匹配的未配置模型，请调整搜索条件或检查已有模型。",
  "OpenRouter returned no compatible priced text models.":
    "OpenRouter 未返回兼容且有定价的文本模型。",
  "Catalog rates are estimates rounded up for accounting. Review them before saving; selecting a model does not enable it.":
    "目录费率按记账要求向上取整，请在保存前确认。选择模型不会启用模型。",
  "Conservative rate includes conditional token charges.":
    "保守费率包含条件 token 费用上限。",
  "This provider and model are already configured.": "此供应商和模型已配置。",
};
