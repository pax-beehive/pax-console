export const overviewContent = {
  en: {
    title: "PaxWorkspace — Different agents. One workspace.",
    description:
      "PaxWorkspace (PAX) brings your AI coding agents into one workspace. Connect your own computers and servers, manage projects and sessions, and review progress, approvals, and artifacts from desktop or mobile.",
    skip: "Skip to content",
    homeLabel: "PaxWorkspace overview",
    open: "Open workspace",
    start: "Get started",
    learn: "See how it works",
    headline: "Different agents.",
    headlineEnd: "One workspace.",
    intro:
      "Bring your AI coding agents into one workspace. From desktop to mobile, choose an agent for your project, follow its progress, and review what it delivers.",
    desktop: "Desktop",
    mobile: "Mobile",
    ownership: "Your devices. Your projects.",
    featuresHeading: "Your agents. Your devices. Stay connected.",
    startHeading: "Start with your own project.",
    faqHeading: "Common questions",
    languageLabel: "Choose language",
    workbenchNote: "The workspace is currently available in English.",
    steps: [
      "Sign in and follow the setup guide to connect your computer or server.",
      "Choose a project directory and a configured agent.",
      "Start a session. Follow progress, handle approvals, and review artifacts.",
    ],
    features: [
      {
        number: "01",
        title: "Your choice of agent",
        body: "Connect different coding agents to one workspace and choose the right one for each project or task. Keep sessions, progress, and artifacts in one place.",
      },
      {
        number: "02",
        title: "Work runs on your devices",
        body: "Connect your own computers or servers. Agents work in project directories on those devices, while you manage devices, projects, and sessions from the workspace.",
      },
      {
        number: "03",
        title: "Keep up from anywhere",
        body: "Open the same workspace on your phone to follow sessions, send the next instruction, handle pending approvals, and review delivered files.",
      },
      {
        number: "04",
        title: "No VPN. No jump hosts. No open ports.",
        body: "Your devices initiate outbound connections to PAX cloud. Reach your agents without setting up a VPN, jump host, or port forwarding. No inbound ports to open, and no need to expose your device’s IP address as a public access point.",
      },
      {
        number: "05",
        title: "Live streaming, smooth responses",
        body: "Agent output flows continuously to your browser as a stream of frames. Follow each response as it unfolds, without waiting for the full reply. Low-latency delivery keeps you close to your agent’s progress.",
      },
    ],
    questions: [
      {
        question: "What is PaxWorkspace?",
        answer:
          "PaxWorkspace, or PAX, is a workspace for AI agents. It brings devices, projects, and agent sessions together so you can work with connected coding agents in your browser.",
      },
      {
        question: "Which agents can I use?",
        answer:
          "PAX connects coding agents through ACP (Agent Client Protocol) and compatible adapters. Available agents, models, and capabilities depend on the runtimes, adapters, and accounts configured on your devices. Check the available list in your workspace.",
      },
      {
        question: "Can I use it on my phone?",
        answer:
          "Yes. Open the workspace in a browser on your computer or phone. Once a device is connected, you can follow tasks and continue messaging in the same sessions.",
      },
      {
        question: "Does it support end-to-end encryption?",
        answer:
          "Yes. After pairing your browser with a device, you can enable E2EE for sessions. Session content is encrypted and decrypted in your browser and on the device running the agent; PAX cloud relays ciphertext. This covers the browser-to-device connection. Calls from the agent to model providers still use those providers’ connections.",
      },
      {
        question: "How do I get started?",
        answer:
          "Open the workspace, sign in, and follow the device setup guide to connect your computer or server. Then choose a project and a configured agent to start your first session.",
      },
    ],
    diagram: {
      heading: "One workspace, your devices",
      kind: "Connections",
      title:
        "Your computer connects through PAX cloud to devices running agents",
      description:
        "Your computer is on the left, PAX cloud relays connections in the middle, and three devices run agents on the right. Optional end-to-end encryption encrypts and decrypts session content at the browser and device, with the cloud relaying ciphertext.",
      computer: "Your computer",
      cloud: "PAX cloud",
      browser: "Browser workspace",
      relay: "Connect & relay",
      hosts: ["Server A", "Server B", "Work computer"],
      agent: "Runs agents",
      sourceTitle: "Fully open source. Transparent and auditable.",
      sourceDescription:
        "All PAX code is open source, from the browser workspace and cloud services to the software on your devices. Inspect how data flows, permissions are enforced, and encryption works, so you can verify the implementation for yourself.",
      sourceLink: "Explore the source",
      encryption: "End-to-end encryption · E2EE",
      caption:
        "When enabled, session content is encrypted between your browser and the device running the agent. PAX cloud relays ciphertext.",
    },
  },
  zh: {
    title: "PaxWorkspace — 不同 AI Agent，同一个工作台",
    description:
      "PaxWorkspace（PAX）是面向多种 AI 编程 Agent 的统一工作台。在电脑和手机上连接自己的设备，管理项目与会话，查看工作进展、处理授权、审阅产物，让你自由选择适合任务的 Agent。",
    skip: "跳到正文",
    homeLabel: "PaxWorkspace 产品介绍",
    open: "打开工作台",
    start: "开始使用",
    learn: "了解如何开始",
    headline: "不同 Agent，",
    headlineEnd: "同一个工作台。",
    intro:
      "PaxWorkspace 把你接入的 AI 编程 Agent 放在同一个工作台里。从电脑到手机，围绕你的项目，选择 Agent、跟进会话、审阅产物。",
    desktop: "电脑",
    mobile: "手机",
    ownership: "你的设备 · 你的项目",
    featuresHeading: "自由选 Agent，安心连接，流畅交互。",
    startHeading: "从自己的项目开始。",
    faqHeading: "常见问题",
    languageLabel: "选择语言",
    workbenchNote: "工作台目前为英文。",
    steps: [
      "登录工作台，按引导连接电脑或服务器。",
      "选择项目目录和已配置的 Agent。",
      "开始会话，随时查看进度、处理授权、审阅产物。",
    ],
    features: [
      {
        number: "01",
        title: "Agent 由你选",
        body: "把不同的编程 Agent 接入同一个工作台，按项目和任务选择。会话、进度和产物有统一的入口。",
      },
      {
        number: "02",
        title: "工作留在你的设备上",
        body: "连接自己的电脑或服务器，让 Agent 在对应设备的项目目录里工作。在工作台里管理设备、项目和会话。",
      },
      {
        number: "03",
        title: "离开电脑，也能接着看",
        body: "用手机打开同一个工作台，查看会话进展、发送下一条指令、处理待授权操作，查看 Agent 交付的文件。",
      },
      {
        number: "04",
        title: "无需 VPN，无需跳板，无需开端口",
        body: "设备主动向 PAX 云建立出站连接，即可通过工作台远程使用 Agent。无需搭建 VPN、配置跳板机或端口映射，无需开放入站端口，也无需将设备 IP 暴露为公网访问入口。",
      },
      {
        number: "05",
        title: "实时流式，顺滑吐字",
        body: "Agent 输出以实时帧流持续传递到浏览器，生成过程边看边跟进，无需等待完整回复。以低延迟传输，让每一段输出及时呈现，交互自然连贯。",
      },
    ],
    questions: [
      {
        question: "PaxWorkspace 是什么？",
        answer:
          "PaxWorkspace，也叫 PAX，是一个 AI Agent 工作台。它把设备、项目和 Agent 会话集中在一起，让你从浏览器使用接入的编程 Agent。",
      },
      {
        question: "可以使用哪些 Agent？",
        answer:
          "PAX 通过 ACP（Agent Client Protocol）及相应适配器接入编程 Agent。具体可用的 Agent、模型和能力，取决于你在设备上安装的运行时、适配器和账号配置；以工作台中的可用列表为准。",
      },
      {
        question: "手机上可以用吗？",
        answer:
          "可以。电脑和手机都通过浏览器打开工作台。连接设备后，就能查看会话、跟进任务，并在对应会话中继续发消息。",
      },
      {
        question: "支持端到端加密吗？",
        answer:
          "支持。配对浏览器与设备后，可以为会话开启 E2EE。会话内容在浏览器和运行 Agent 的设备两端加解密，PAX 云负责转发密文。加密范围是浏览器到设备这一段；Agent 调用模型服务时，仍使用对应服务的连接。",
      },
      {
        question: "怎么开始？",
        answer:
          "打开工作台并登录，按设备接入引导连接自己的电脑或服务器，再选择项目和已配置的 Agent，开始第一段会话。",
      },
    ],
    diagram: {
      heading: "一个入口，连接你的设备",
      kind: "连接示意",
      title: "你的电脑通过 PAX 云连接多台运行 Agent 的服务器",
      description:
        "左侧是你的电脑，中间是负责连接与转发的 PAX 云，右侧是三台运行 Agent 的设备。支持可选端到端加密，开启后在浏览器和设备两端加解密，云端转发会话密文。",
      computer: "你的电脑",
      cloud: "PAX 云",
      browser: "浏览器工作台",
      relay: "连接与转发",
      hosts: ["服务器 A", "服务器 B", "工作电脑"],
      agent: "运行 Agent",
      sourceTitle: "全栈开源，透明可审计。",
      sourceDescription:
        "从前端工作台、云端服务到设备端程序，PAX 全部代码开源。你可以自行审查数据流转、权限控制与加密实现，让信任有据可查。",
      sourceLink: "探索开源代码",
      encryption: "支持端到端加密 · E2EE",
      caption:
        "开启后，会话内容在你的浏览器与运行 Agent 的设备之间加密传输，PAX 云转发密文。",
    },
  },
};

export type OverviewLocale = keyof typeof overviewContent;
export const overviewPaths = { en: "/overview", zh: "/zh/overview" } as const;
