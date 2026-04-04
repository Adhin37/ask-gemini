// ── shared/constants.js ───────────────────────────────────────────
// Single source of truth for constants shared across multiple scripts.
// Loaded by popup.html and options.html via <script>, and by
// background.js via importScripts(). Must remain plain JS (no import/export).

const GEMINI_URL = "https://gemini.google.com/app";

const MAX_HISTORY = 20;

const DEFAULT_SUMMARIZE_PREFIX = "Summarize the following:\n\n";

const DEFAULT_TEMPLATES_BY_MODEL = {
  flash: [
    "Summarize: ",
    "Translate to English: ",
    "Explain simply: ",
    "Pros and cons of: ",
  ],
  thinking: [
    "Think through this step-by-step: ",
    "What are the edge cases for: ",
    "Analyze deeply: ",
  ],
  pro: [
    "Deep analysis of: ",
    "Fix this code:\n",
    "Compare and contrast: ",
    "Write a comprehensive report on: ",
  ],
};

const DEFAULT_PROMPT_ENG_RULES = [
  {
    id: "code", label: "Code",
    hint: "Selection looks like code, or the page is a known code site (GitHub, Stack Overflow…)",
    enabled: true,
    template: "Analyze this code:\n1. **Purpose** — what does it do?\n2. **Logic** — how does it work step-by-step?\n3. **Issues** — any bugs, edge cases, or improvements?\n\n{selection}",
  },
  {
    id: "error", label: "Error / Bug",
    hint: "Selection contains an error message or stack trace",
    enabled: true,
    template: "Debug this systematically:\n1. **Root cause** — what is failing and why?\n2. **Fix** — provide the corrected code or command\n3. **Prevention** — how to avoid this in the future\n\n{selection}",
  },
  {
    id: "url", label: "URL",
    hint: "The entire selection is a URL",
    enabled: true,
    template: "For this URL, provide:\n- **Topic** — one-sentence summary\n- **Key points** — 3 bullet points\n- **Audience** — who is this aimed at?\n\n{selection}",
  },
  {
    id: "question", label: "Question",
    hint: "Selection ends with a question mark",
    enabled: true,
    template: "Answer this question:\n1. **Direct answer** — clear and concise\n2. **Why** — brief reasoning or evidence\n3. **Example** — concrete illustration if helpful\n\n{selection}",
  },
  {
    id: "data", label: "Data / Numbers",
    hint: "Selection is mostly numbers or structured data",
    enabled: true,
    template: "Analyze this data:\n1. **What it shows** — key metrics or values\n2. **Trends** — notable patterns or changes\n3. **Insight** — the most meaningful takeaway\n\n{selection}",
  },
  {
    id: "term", label: "Term / Keyword",
    hint: "Short selection of 4 words or fewer",
    enabled: true,
    template: "Explain \"{selection}\":\n- **Definition** — simple, jargon-free\n- **Practical use** — when and why it matters\n- **Common misconception** — what people often get wrong",
  },
  {
    id: "article", label: "Article / Text",
    hint: "Default for longer natural-language selections",
    enabled: true,
    template: "Summarize this text:\n**TL;DR:** one-sentence essence\n**Key points:**\n- Main argument\n- Supporting evidence (2–3 bullets)\n\n**Takeaway:** most actionable insight\n\n{selection}",
  },
  {
    id: "default", label: "Default (fallback)",
    hint: "Applied when no other rule matches or all others are disabled",
    enabled: true,
    template: "{selection}",
  },
];

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|context|rules?)/i,
  /disregard\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|context)/i,
  /forget\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|context|everything)/i,
  /override\s+(your\s+)?(instructions?|safety|guidelines?|system)/i,
  /new\s+(system\s+)?instructions?\s*:/i,
  /you\s+are\s+now\s+(a|an)\s+/i,
  /act\s+as\s+(if\s+you\s+(are|were)|a|an)\s+/i,
  /pretend\s+(to\s+be|you\s+(are|were))\s+/i,
  /\[INST\]/,
  /<<SYS>>/,
  /<\s*system\s*>/i,
  /###\s*System\s*:/i,
  /\bDAN\b.*\bmode\b/i,
  /\bjailbreak\b/i,
];
