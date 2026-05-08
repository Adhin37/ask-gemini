// ── shared/constants.js ───────────────────────────────────────────
// Single source of truth for constants shared across multiple scripts.
// ES module — imported by background.js, popup.js, and options.js.
// esbuild inlines each constant into its respective bundle.

export const GEMINI_URL = "https://gemini.google.com/app";

export const MAX_HISTORY = 20;

export const DEFAULT_SUMMARIZE_PREFIX = "Summarize the following:\n\n";

export const DEFAULT_TEMPLATES_BY_MODEL = {
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

export const PE_TEMPLATE_MAX = 400;
export const PE_ROLE_MAX     = 240;

export const DEFAULT_PE_ROLE = "You are a knowledgeable assistant. Be concise and concrete.";

/** Variables that templates can reference. */
export const PE_VARIABLES = [
  { name: "selection", descKey: "options_pe_var_selection_desc" },
  { name: "url",       descKey: "options_pe_var_url_desc" },
  { name: "domain",    descKey: "options_pe_var_domain_desc" },
  { name: "title",     descKey: "options_pe_var_title_desc" },
  { name: "lang",      descKey: "options_pe_var_lang_desc" },
  { name: "length",    descKey: "options_pe_var_length_desc" },
];

export const DEFAULT_PROMPT_ENG_RULES = [
  {
    id: "url", labelKey: "options_pe_rule_url_label", priority: 90,
    hintKey: "options_pe_rule_url_hint",
    enabled: true,
    template: "Visit and summarise this URL ({domain}):\n- **Topic** — one sentence\n- **Key points** — 3 bullets\n- **Audience** — who is it for?\n\n{selection}",
  },
  {
    id: "error", labelKey: "options_pe_rule_error_label", priority: 80,
    hintKey: "options_pe_rule_error_hint",
    enabled: true,
    template: "Debug this error from {domain}:\n1. **Root cause** — what failed and why\n2. **Fix** — corrected code or command\n3. **Prevention** — how to avoid it next time\n\n{selection}",
  },
  {
    id: "diff", labelKey: "options_pe_rule_diff_label", priority: 75,
    hintKey: "options_pe_rule_diff_hint",
    enabled: true,
    template: "Review this diff:\n- **Intent** — what is the change trying to do?\n- **Risks** — bugs, regressions, side effects\n- **Suggestions** — concrete improvements\n\n{selection}",
  },
  {
    id: "log", labelKey: "options_pe_rule_log_label", priority: 72,
    hintKey: "options_pe_rule_log_hint",
    enabled: true,
    template: "Analyse this {length} log:\n1. **Timeline** — what happened, in order\n2. **Anomalies** — warnings, errors, unusual patterns\n3. **Likely cause** — most probable trigger\n\n{selection}",
  },
  {
    id: "json", labelKey: "options_pe_rule_json_label", priority: 70,
    hintKey: "options_pe_rule_json_hint",
    enabled: true,
    template: "Analyse this JSON:\n- **Shape** — top-level fields and types\n- **Notable values** — anything unusual or noteworthy\n- **Schema sketch** — a TypeScript-style type for it\n\n{selection}",
  },
  {
    id: "sql", labelKey: "options_pe_rule_sql_label", priority: 70,
    hintKey: "options_pe_rule_sql_hint",
    enabled: true,
    template: "Explain this SQL:\n1. **What it does** — plain-English query summary\n2. **Performance** — indexes used, hot spots\n3. **Safer rewrite** — same result, cleaner or faster\n\n{selection}",
  },
  {
    id: "regex", labelKey: "options_pe_rule_regex_label", priority: 65,
    hintKey: "options_pe_rule_regex_hint",
    enabled: true,
    template: "Break down this regex:\n- **Matches** — describe what it accepts in plain English\n- **Examples** — 3 strings that match, 3 that don't\n- **Pitfalls** — backtracking, unicode, edge cases\n\n{selection}",
  },
  {
    id: "code", labelKey: "options_pe_rule_code_label", priority: 60,
    hintKey: "options_pe_rule_code_hint",
    enabled: true,
    template: "Review this code from {domain}:\n1. **Purpose** — what does it do?\n2. **Logic** — step-by-step\n3. **Issues** — bugs, edge cases, improvements\n\n{selection}",
  },
  {
    id: "markdown", labelKey: "options_pe_rule_markdown_label", priority: 58,
    hintKey: "options_pe_rule_markdown_hint",
    enabled: true,
    template: "Summarise this {length} markdown document from {domain}:\n- **Structure** — outline of the headings\n- **Main points** — the actual content, distilled\n- **Action items** — anything actionable\n\n{selection}",
  },
  {
    id: "translate", labelKey: "options_pe_rule_translate_label", priority: 55,
    hintKey: "options_pe_rule_translate_hint",
    enabled: true,
    template: "Translate this to {lang} (preserve formatting and tone):\n- Provide the translation\n- Note any words that don't translate cleanly\n- Flag idioms with a literal + idiomatic equivalent\n\n{selection}",
  },
  {
    id: "question", labelKey: "options_pe_rule_question_label", priority: 55,
    hintKey: "options_pe_rule_question_hint",
    enabled: true,
    template: "Answer this {length} question:\n1. **Direct answer** — clear and concise\n2. **Why** — brief reasoning\n3. **Example** — one concrete illustration if useful\n\n{selection}",
  },
  {
    id: "data", labelKey: "options_pe_rule_data_label", priority: 50,
    hintKey: "options_pe_rule_data_hint",
    enabled: true,
    template: "Analyse this data:\n1. **What it shows** — key values and units\n2. **Patterns** — trends, outliers, correlations\n3. **Insight** — the most useful takeaway\n\n{selection}",
  },
  {
    id: "term", labelKey: "options_pe_rule_term_label", priority: 40,
    hintKey: "options_pe_rule_term_hint",
    enabled: true,
    template: "Explain \"{selection}\" (context: {title}):\n- **Definition** — simple, jargon-free\n- **Practical use** — when and why it matters\n- **Common misconception** — what people get wrong",
  },
  {
    id: "article", labelKey: "options_pe_rule_article_label", priority: 30,
    hintKey: "options_pe_rule_article_hint",
    enabled: true,
    template: "Summarise this {length} text from {domain}:\n**TL;DR:** one sentence\n**Key points:**\n- main argument\n- 2-3 supporting points\n**Takeaway:** most actionable insight\n\n{selection}",
  },
  {
    id: "default", labelKey: "options_pe_rule_default_label", priority: 0,
    hintKey: "options_pe_rule_default_hint",
    enabled: true,
    template: "{selection}",
  },
];

export const INJECTION_PATTERNS = [
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
