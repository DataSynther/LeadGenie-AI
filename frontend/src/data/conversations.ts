export interface ConvMessage {
  direction: "outbound" | "inbound";
  sender: string;
  channel: string;
  timestamp: string;
  body: string;
}

export interface ConvDraft {
  classification: string;
  classificationTone: "objection" | "positive" | "neutral";
  riskLevel: "high" | "medium" | "low";
  riskReason: string;
  text: string;
  explainer: string;
}

export interface Conversation {
  id: string;
  name: string;
  meta: string;
  preview: string;
  tag: { label: string; tone: "objection" | "positive" | "neutral" };
  timestamp: string;
  thread: {
    title: string;
    sub: string;
    messages: ConvMessage[];
    draft?: ConvDraft;
  };
}

export const conversations: Conversation[] = [
  {
    id: "conv_devon",
    name: "Devon Park",
    meta: "VP DATA · HELIX BIO",
    preview: "Thanks for reaching out, but your pricing seems steep compared to…",
    tag: { label: "Objection: budget", tone: "objection" },
    timestamp: "12m",
    thread: {
      title: "Devon Park",
      sub: "VP DATA · HELIX BIO · helix.bio · Series B",
      messages: [
        {
          direction: "outbound",
          sender: "LeadGenie",
          channel: "Email",
          timestamp: "Mon 10:14am",
          body: "Hi Devon,\n\nSaw Helix just closed your Series B — congrats. With 14 new data eng roles posted in the past month and Snowflake at the center of your stack, I'd bet data governance is becoming a real bottleneck.\n\nWe help teams like yours stay compliant without slowing engineering down. Worth a quick call?",
        },
        {
          direction: "inbound",
          sender: "Devon",
          channel: "Email",
          timestamp: "12m ago",
          body: "Thanks for reaching out. The use case is interesting but honestly the pricing I've seen from similar tools is steep for where we are. What does your enterprise tier actually cost?",
        },
      ],
      draft: {
        classification: "Objection: budget",
        classificationTone: "objection",
        riskLevel: "high",
        riskReason: "High Risk · Pricing",
        text: "Hi Devon, totally fair concern. Our pricing is tied to data volume and number of seats — for a Series B team your size, we typically come in around $48k annually but I'd want to scope it properly. Happy to share a custom quote after a 20-min discovery call. Does Thursday afternoon work?",
        explainer:
          "Objection classified as budget. Memory shows Devon emphasized cost-sensitivity. Mentions specific number ($48k) — flagged as high risk because explicit pricing commitments require human approval per governance policy.",
      },
    },
  },
  {
    id: "conv_anya",
    name: "Anya Volkov",
    meta: "CTO · CORTEX LABS",
    preview: "Friday at 3pm works! I'll send a calendar invite shortly…",
    tag: { label: "Meeting booked", tone: "positive" },
    timestamp: "2h",
    thread: {
      title: "Anya Volkov",
      sub: "CTO · CORTEX LABS · cortexlabs.io · Series A",
      messages: [
        {
          direction: "outbound",
          sender: "LeadGenie",
          channel: "Email",
          timestamp: "Fri 9:02am",
          body: "Hi Anya, congrats on shipping the new GenAI product. Wanted to share how teams at your stage handle inference cost without bottlenecking the ML team. 15 min next week?",
        },
        {
          direction: "inbound",
          sender: "Anya",
          channel: "Email",
          timestamp: "2h ago",
          body: "Friday at 3pm works! I'll send a calendar invite shortly. Looking forward to it.",
        },
      ],
    },
  },
  {
    id: "conv_sarah",
    name: "Sarah Lindqvist",
    meta: "REVOPS · NORTHWIND",
    preview: "Can you walk me through how you compare with Outreach…",
    tag: { label: "FAQ", tone: "neutral" },
    timestamp: "11m",
    thread: {
      title: "Sarah Lindqvist",
      sub: "HEAD OF REVOPS · NORTHWIND · northwind.io · Series C",
      messages: [
        {
          direction: "outbound",
          sender: "LeadGenie",
          channel: "Email",
          timestamp: "Wed 11:30am",
          body: "Hi Sarah, with the recent reorg at Northwind, attribution often gets murky right when leadership wants the clearest picture. We help RevOps teams stitch that back together. Worth a quick chat?",
        },
        {
          direction: "inbound",
          sender: "Sarah",
          channel: "Email",
          timestamp: "11m ago",
          body: "Can you walk me through how you compare with Outreach? We use them already and switching cost is a real concern.",
        },
      ],
    },
  },
];
