// ── shared/constants.js ───────────────────────────────────────────
// Single source of truth for constants shared across multiple scripts.
// ES module — imported by background.js, popup.js, and options.js.
// esbuild inlines each constant into its respective bundle.

export const GEMINI_URL = "https://gemini.google.com/app";

export const MAX_HISTORY = 20;

export const DEFAULT_SUMMARIZE_PREFIX_KEY = "default_summarize_prefix";

export const DEFAULT_TEMPLATE_KEYS_BY_MODEL = {
  flash: [
    "default_template_flash_summarize",
    "default_template_flash_translate",
    "default_template_flash_explain",
    "default_template_flash_proscons",
  ],
  thinking: [
    "default_template_thinking_step",
    "default_template_thinking_edges",
    "default_template_thinking_analyze",
  ],
  pro: [
    "default_template_pro_deep",
    "default_template_pro_fix",
    "default_template_pro_compare",
    "default_template_pro_report",
  ],
};

export const PE_TEMPLATE_MAX = 400;
export const PE_ROLE_MAX     = 240;

export const DEFAULT_PE_ROLE_KEY = "default_pe_role";

/** Variables that templates can reference. */
export const PE_VARIABLES = [
  { name: "selection", descKey: "options_pe_var_selection_desc" },
  { name: "url",       descKey: "options_pe_var_url_desc" },
  { name: "domain",    descKey: "options_pe_var_domain_desc" },
  { name: "title",     descKey: "options_pe_var_title_desc" },
  { name: "lang",      descKey: "options_pe_var_lang_desc" },
  { name: "length",    descKey: "options_pe_var_length_desc" },
];

export const DEFAULT_PROMPT_RULES = [
  {
    id: "url", labelKey: "options_pe_rule_url_label", priority: 90,
    hintKey: "options_pe_rule_url_hint",
    templateKey: "default_pe_rule_url_template",
    enabled: true,
  },
  {
    id: "error", labelKey: "options_pe_rule_error_label", priority: 80,
    hintKey: "options_pe_rule_error_hint",
    templateKey: "default_pe_rule_error_template",
    enabled: true,
  },
  {
    id: "diff", labelKey: "options_pe_rule_diff_label", priority: 75,
    hintKey: "options_pe_rule_diff_hint",
    templateKey: "default_pe_rule_diff_template",
    enabled: true,
  },
  {
    id: "log", labelKey: "options_pe_rule_log_label", priority: 72,
    hintKey: "options_pe_rule_log_hint",
    templateKey: "default_pe_rule_log_template",
    enabled: true,
  },
  {
    id: "json", labelKey: "options_pe_rule_json_label", priority: 70,
    hintKey: "options_pe_rule_json_hint",
    templateKey: "default_pe_rule_json_template",
    enabled: true,
  },
  {
    id: "sql", labelKey: "options_pe_rule_sql_label", priority: 70,
    hintKey: "options_pe_rule_sql_hint",
    templateKey: "default_pe_rule_sql_template",
    enabled: true,
  },
  {
    id: "regex", labelKey: "options_pe_rule_regex_label", priority: 65,
    hintKey: "options_pe_rule_regex_hint",
    templateKey: "default_pe_rule_regex_template",
    enabled: true,
  },
  {
    id: "code", labelKey: "options_pe_rule_code_label", priority: 60,
    hintKey: "options_pe_rule_code_hint",
    templateKey: "default_pe_rule_code_template",
    enabled: true,
  },
  {
    id: "markdown", labelKey: "options_pe_rule_markdown_label", priority: 58,
    hintKey: "options_pe_rule_markdown_hint",
    templateKey: "default_pe_rule_markdown_template",
    enabled: true,
  },
  {
    id: "translate", labelKey: "options_pe_rule_translate_label", priority: 55,
    hintKey: "options_pe_rule_translate_hint",
    templateKey: "default_pe_rule_translate_template",
    enabled: true,
  },
  {
    id: "question", labelKey: "options_pe_rule_question_label", priority: 55,
    hintKey: "options_pe_rule_question_hint",
    templateKey: "default_pe_rule_question_template",
    enabled: true,
  },
  {
    id: "data", labelKey: "options_pe_rule_data_label", priority: 50,
    hintKey: "options_pe_rule_data_hint",
    templateKey: "default_pe_rule_data_template",
    enabled: true,
  },
  {
    id: "term", labelKey: "options_pe_rule_term_label", priority: 40,
    hintKey: "options_pe_rule_term_hint",
    templateKey: "default_pe_rule_term_template",
    enabled: true,
  },
  {
    id: "article", labelKey: "options_pe_rule_article_label", priority: 30,
    hintKey: "options_pe_rule_article_hint",
    templateKey: "default_pe_rule_article_template",
    enabled: true,
  },
  {
    id: "default", labelKey: "options_pe_rule_default_label", priority: 0,
    hintKey: "options_pe_rule_default_hint",
    templateKey: "default_pe_rule_default_template",
    enabled: true,
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
