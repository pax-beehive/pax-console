export const company = {
  name: "Pax Tech LLC",
  address: "14522 104th Ave NE, Bothell, WA 98011, United States",
  email: "toddzheng@paxtech.net",
  effective: "October 12, 2026",
};

export const pages = {
  "/about": {
    title: "Your agents. Your machines. One workspace.",
    description:
      "PAX Workspace connects your devices and AI agents in one workspace for tasks, conversations, and collaboration.",
    eyebrow: "PAX WORKSPACE",
    body: `
      <p class="lead">Connect your own machines, manage your AI agents, and keep work moving from one workspace.</p>
      <div class="actions"><a class="button" href="/">Open workspace <span aria-hidden="true">↗</span></a><a href="/overview">Explore PAX Workspace</a></div>
      <section><h2>Bring your agents together</h2><p>PAX Workspace connects to agents running on devices you control. View their status, follow conversations, send tasks, and review results through the web console.</p></section>
      <section><h2>Keep context with the work</h2><p>Organize sessions, review task artifacts, and collaborate through workspaces and permissions. Your configured agents and model providers carry out tasks with the access you give them.</p></section>
      <section><h2>Understand what is shared</h2><p>Optional end-to-end encryption protects supported conversation payloads between a paired browser and agent device. Account information and routing metadata are separate, and agents may send task content to the model or tools you configure.</p><p>Read our <a href="/privacy">Privacy Policy</a> and <a href="/terms">Terms of Service</a> for information about accounts, data, and responsible use.</p></section>
      <section><h2>Built and operated by Pax Tech LLC</h2><p>${company.address}</p><p>Product support and privacy requests: <a href="mailto:${company.email}">${company.email}</a>.</p><p><a href="/zh/overview" lang="zh-CN">阅读中文产品介绍 →</a></p></section>
    `,
  },
  "/privacy": {
    title: "Privacy Policy",
    description:
      "How Pax Tech LLC handles account information, agent content, authentication, and privacy requests for PAX Workspace.",
    eyebrow: "PAX WORKSPACE / PRIVACY",
    body: `
      <p class="lead">This policy explains how Pax Tech LLC handles information when you use PAX Workspace, including its web console and connected agent features.</p>
      <p>Effective ${company.effective}. Contact: <a href="mailto:${company.email}">${company.email}</a>.<br>${company.name}, ${company.address}.</p>
      <section><h2>1. Information we process</h2>
      <ul><li><strong>Account and sign-in information.</strong> Email address, account and identity-provider identifiers, and basic profile information supplied by your login provider, such as a name or profile image. We use this information to authenticate you, identify your account, and manage access.</li>
      <li><strong>Workspace and device information.</strong> Your account's assigned region, memberships and permissions, connected devices, agent status, and session metadata. We use these records to connect devices, route requests, organize work, and enforce access controls.</li>
      <li><strong>Task content.</strong> Instructions, messages, files, results, and artifacts that you or your agents submit through enabled features. We process them to execute, synchronize, display, and retain your work.</li>
      <li><strong>Service and support information.</strong> Technical and security records, signed-in account visit times, device and session counts, and information you send for support. We use these to operate the service, investigate errors, respond to requests, and prevent abuse. Network providers also process request information such as IP addresses.</li></ul></section>
      <section><h2>2. Email, Google, and GitHub sign-in</h2>
      <p>PAX is introducing WorkOS for email verification-code, Google, and GitHub sign-in. Existing sign-in may continue through Cloudflare Access during the transition. Where WorkOS sign-in is offered, WorkOS processes authentication information and returns the sign-in result to PAX. Email addresses are used to deliver requested verification codes.</p>
      <p>Google sign-in requests basic profile and email information. GitHub sign-in requests access to your email addresses. These sign-in permissions do not request your Google mail, Drive files, or private GitHub repository contents. Separate integrations, if used, can require separate permissions.</p>
      <p>We use these identity details for authentication, account association, and account security. Migrating sign-in associates identities with existing PAX accounts and their assigned regions; it does not transfer device encryption keys to a new device. Revoking a login provider's authorization does not by itself delete your PAX account.</p></section>
      <section><h2>3. Content, encryption, and AI providers</h2>
      <p>Supported end-to-end encrypted conversation paths store and relay encrypted payloads, with decryption on paired clients and agent devices. This does not mean every type of PAX data is end-to-end encrypted. Account records, routing information, device status, session metadata, and content outside those supported paths have different protection boundaries.</p>
      <p>Agents run with the permissions and configuration you provide. They may access local files or send content to model providers, tools, and collaborators you select. Those recipients process information under their own policies. Encryption between your browser and agent device does not prevent your authorized agent from sending decrypted task content to a configured model or tool.</p></section>
      <section><h2>4. When information is shared</h2>
      <p>We use service providers for authentication, network delivery, hosting, storage, and operations. These include Cloudflare for network and access services and WorkOS where its sign-in is enabled. Google and GitHub participate when you select their sign-in methods. Information needed to provide the relevant function is processed by these services.</p>
      <p>Information may be made available to members or recipients through collaboration and sharing features you use. Authorized administrators can access account and operational information according to their permissions; visibility of content depends on the feature and its encryption boundary.</p>
      <p>We may disclose information when required by applicable law, to address abuse or security incidents, or to protect rights and safety. Contact us for information about the providers relevant to your use of PAX.</p></section>
      <section><h2>5. Storage regions and retention</h2>
      <p>PAX currently uses US and Hong Kong business regions and records the region assigned to an account. A region assignment is not a guarantee that authentication, edge-network processing, backups, or every third-party service processes data only within that region.</p>
      <p>Account and workspace records are retained to provide ongoing access and preserve work. Retention also depends on the type of record, security and support needs, and applicable obligations. PAX does not currently apply one universal automatic deletion period to all messages, files, logs, and backups. You can contact us to request deletion or details about retention for your account.</p>
      <p>Removing an active record may not immediately remove backup copies, records that must be retained, or copies on your devices and third-party services. We will explain applicable limitations when handling a request.</p></section>
      <section><h2>6. Your choices and requests</h2>
      <p>To request access, correction, export, account closure, or deletion, email <a href="mailto:${company.email}">${company.email}</a>. We may need to verify your identity and clarify the records involved. We handle requests according to applicable requirements and will explain any limitations. Where applicable law gives you additional rights or a right to complain to a regulator, this policy does not limit those rights.</p>
      <p>You control the devices, agent permissions, integrations, and sharing choices you configure. Closing a PAX account or revoking a provider grant may require separate action to remove local device data or information held by a third-party service.</p></section>
      <section><h2>7. Cookies and local storage</h2>
      <p>Sign-in, security, preferences, and device pairing can use cookies or browser storage. Clearing them may sign you out, reset preferences, or require pairing again. The public pages at /about, /privacy, and /terms do not include advertising scripts, analytics scripts, or account polling.</p></section>
      <section><h2>8. Contact and updates</h2>
      <p>If you believe information was provided without appropriate authority, including information about a child, contact us so we can review it. We publish policy changes on this page with an updated effective date and provide additional notice when required for material changes.</p>
      <p>${company.name}<br>${company.address}<br><a href="mailto:${company.email}">${company.email}</a></p></section>
    `,
  },
  "/terms": {
    title: "Terms of Service",
    description:
      "Terms for using PAX Workspace, operated by Pax Tech LLC, to connect devices, manage AI agents, and collaborate.",
    eyebrow: "PAX WORKSPACE / TERMS",
    body: `
      <p class="lead">These terms govern your use of PAX Workspace, provided by Pax Tech LLC. By using the service, you agree to these terms.</p>
      <p>Effective ${company.effective}. Contact: <a href="mailto:${company.email}">${company.email}</a>.<br>${company.name}, ${company.address}.</p>
      <section><h2>1. The service</h2><p>PAX Workspace provides device connections, AI-agent management, tasks, sessions, and collaboration features. Some functions require devices you operate, installed agents, or third-party models and tools you configure. Availability depends on your version, permissions, configuration, and connected services.</p></section>
      <section><h2>2. Accounts and authority</h2><p>Provide accurate account information and protect your email account, third-party sign-in accounts, API keys, and device pairing information. Connect only devices, repositories, and services you are authorized to use, and grant permissions appropriate for the work.</p><p>You must have the legal capacity and authority required to agree to these terms. If you use PAX on an organization's behalf, you must be authorized to do so. Report suspected unauthorized access promptly, and revoke affected credentials where possible.</p></section>
      <section><h2>3. Agents and third-party services</h2><p>AI agents can produce inaccurate or incomplete results. Depending on the access you grant, agents may change files, execute commands, access networks, or call paid services. Review permissions and results, maintain appropriate backups, and exercise care with actions affecting production systems, money, important data, or other people's rights.</p><p>Third-party models, software, and integrations have their own terms, charges, availability, and limits. PAX access does not itself include third-party subscriptions or usage credits.</p></section>
      <section><h2>4. Acceptable use</h2><p>Do not use PAX for unauthorized system access, credential theft, malware, infringement of intellectual property or privacy, or other unlawful activity. Do not bypass access controls, interfere with the service, or use automation in ways that impose an unreasonable burden on its operation.</p></section>
      <section><h2>5. Your content and intellectual property</h2><p>You retain the rights you have in content you submit. You are responsible for having the rights and authority needed to submit, process, and share it.</p><p>You authorize Pax Tech LLC to host, store, transmit, and display that content as needed to provide the features you request, including delivery to your selected devices, members, and integrations. Information handling is described in our <a href="/privacy">Privacy Policy</a>.</p><p>PAX software and materials are subject to their applicable ownership and licenses; third-party components retain their own licenses. AI output may not be unique or accurate, and its ownership or protectability depends on applicable rules and provider terms. We do not guarantee that output is free of third-party claims.</p></section>
      <section><h2>6. Charges</h2><p>Any PAX paid offering is governed by the prices and payment, renewal, cancellation, and refund terms presented for that offering or separately agreed with you. These terms alone do not authorize a new charge or subscription. You remain responsible for third-party charges you incur through services you configure.</p></section>
      <section><h2>7. Access restrictions and account closure</h2><p>We may restrict relevant functions or suspend access to address security incidents, abuse, or violations of these terms. You may contact us for an explanation, review, or help restoring access.</p><p>You can request account closure by emailing <a href="mailto:${company.email}">${company.email}</a>. Retention, export, deletion, and backup handling follow our Privacy Policy and applicable requirements. Data on your devices or held by third parties may require separate action.</p></section>
      <section><h2>8. Availability and responsibilities</h2><p>PAX depends on networks, user devices, and third-party services. Interruptions, delays, errors, data loss, and compatibility changes are possible. Maintain backups and review agent outputs according to the risks of your tasks. No specific uptime or support response time is promised by these terms.</p><p>Nothing in these terms excludes liability that cannot lawfully be excluded or limits mandatory rights available to you under applicable law.</p></section>
      <section><h2>9. Changes and contact</h2><p>We publish changes to these terms with an updated effective date and provide appropriate notice of material changes as required. Contact us about questions or disputes so that we can seek a resolution. These terms do not require binding arbitration or waive statutory consumer rights.</p><p>${company.name}<br>${company.address}<br><a href="mailto:${company.email}">${company.email}</a></p></section>
    `,
  },
};
