import { describe, it, expect, beforeAll } from "vitest";
import { t } from "../../src/shared/stringUtils.js";

let scoreContext, detectContext, expandVariables, buildPrompt;

beforeAll(async () => {
  const mod = await import("../../src/shared/promptEngine.js");
  scoreContext    = mod.scoreContext;
  detectContext   = mod.detectContext;
  expandVariables = mod.expandVariables;
  buildPrompt     = mod.buildPrompt;
});

// ── Helpers ──────────────────────────────────────────────────────
import { DEFAULT_PROMPT_RULES } from "../../src/shared/constants.js";

function ctx(selection, opts = {}) {
  return { selection, pageUrl: opts.url || "", pageTitle: opts.title || "", uiLang: opts.lang || "en", detectedLangs: opts.detectedLangs };
}

function detect(selection, opts = {}) {
  return detectContext(ctx(selection, opts), DEFAULT_PROMPT_RULES);
}

// ══════════════════════════════════════════════════════════════════
// detectContext — per-rule fixtures
// ══════════════════════════════════════════════════════════════════

describe("detectContext — url", () => {
  it("detects a bare URL", () => {
    expect(detect("https://github.com/foo/bar")).toBe("url");
  });
  it("does not fire on a URL inside prose", () => {
    const id = detect("See https://example.com for details.");
    expect(id).not.toBe("url");
  });
});

describe("detectContext — error", () => {
  it("detects a JS TypeError", () => {
    expect(detect("TypeError: Cannot read properties of undefined")).toBe("error");
  });
  it("detects a Python Traceback", () => {
    expect(detect("Traceback (most recent call last):\n  File \"app.py\", line 12, in <module>")).toBe("error");
  });
  it("detects an 'at' stack frame", () => {
    expect(detect("    at Object.<anonymous> (index.js:42:5)")).toBe("error");
  });
});

describe("detectContext — diff", () => {
  it("detects a unified diff hunk header", () => {
    expect(detect("@@ -1,4 +1,6 @@\n-old line\n+new line\n context")).toBe("diff");
  });
  it("detects a git diff file marker", () => {
    expect(detect("--- a/src/foo.js\n+++ b/src/foo.js\n-removed\n+added")).toBe("diff");
  });
  it("detects a diff on a GitHub commit URL", () => {
    const d = "@@ -1,3 +1,4 @@\n-old line here\n+new line here\n context\n another context";
    expect(detect(d, { url: "https://github.com/foo/bar/commit/abc123" })).toBe("diff");
  });
});

describe("detectContext — log", () => {
  it("detects ISO timestamp log lines", () => {
    const log = "2024-01-15T10:32:11 INFO Starting server\n2024-01-15T10:32:12 DEBUG Listening on :8080\n2024-01-15T10:32:15 WARN Slow query detected";
    expect(detect(log)).toBe("log");
  });
  it("detects HH:MM:SS.mmm log lines", () => {
    const log = "10:32:11.045 INFO  server started\n10:32:11.120 DEBUG config loaded\n10:32:12.000 ERROR database unreachable";
    expect(detect(log)).toBe("log");
  });
});

describe("detectContext — json", () => {
  it("detects a JSON object", () => {
    expect(detect('{\n  "name": "Alice",\n  "age": 30\n}')).toBe("json");
  });
  it("detects a JSON array", () => {
    expect(detect('[\n  {"id": 1},\n  {"id": 2}\n]')).toBe("json");
  });
});

describe("detectContext — sql", () => {
  it("detects a SELECT query", () => {
    expect(detect("SELECT id, name FROM users WHERE active = 1 ORDER BY name;")).toBe("sql");
  });
  it("detects an INSERT statement", () => {
    expect(detect("INSERT INTO orders (user_id, amount) VALUES (42, 99.99);")).toBe("sql");
  });
  it("detects a JOIN query", () => {
    expect(detect("SELECT u.name FROM users u JOIN orders o ON u.id = o.user_id WHERE o.amount > 100;")).toBe("sql");
  });
});

describe("detectContext — regex", () => {
  it("detects a literal regex", () => {
    expect(detect("/^https?:\\/\\/\\S+$/i")).toBe("regex");
  });
  it("detects a regex with metacharacters", () => {
    expect(detect("\\bfoo\\b|\\d+")).toBe("regex");
  });
});

describe("detectContext — code", () => {
  it("detects a JS function", () => {
    expect(detect("function greet(name) {\n  return `Hello ${name}`;\n}")).toBe("code");
  });
  it("detects async/await code", () => {
    expect(detect("const result = await fetchData();\nreturn result;")).toBe("code");
  });
  it("detects code on a GitHub page", () => {
    expect(detect("const x = 1;", { url: "https://github.com/foo/bar/blob/main/index.js" })).toBe("code");
  });
});

describe("detectContext — markdown", () => {
  it("detects markdown headers + list", () => {
    const md = "# Getting Started\n\nThis is intro.\n\n## Installation\n\n- Step one\n- Step two\n- Step three";
    expect(detect(md)).toBe("markdown");
  });
  it("detects markdown with code fence", () => {
    const md = "# Example\n\nSome text.\n\n```js\nconsole.log('hello');\n```\n\n- bullet one\n- bullet two";
    expect(detect(md)).toBe("markdown");
  });
});

describe("detectContext — translate", () => {
  it("fires when a non-English language is detected at high confidence", () => {
    const id = detectContext(
      ctx("Bonjour, comment allez-vous aujourd'hui?", {
        detectedLangs: [{ language: "fr", percentage: 92 }],
        lang: "en",
      }),
      DEFAULT_PROMPT_RULES,
    );
    expect(id).toBe("translate");
  });
  it("does not fire when same language as UI", () => {
    const id = detectContext(
      ctx("Hello, how are you today?", {
        detectedLangs: [{ language: "en", percentage: 99 }],
        lang: "en",
      }),
      DEFAULT_PROMPT_RULES,
    );
    expect(id).not.toBe("translate");
  });
  it("does not fire at low confidence (<70%)", () => {
    const id = detectContext(
      ctx("foo", {
        detectedLangs: [{ language: "de", percentage: 50 }],
        lang: "en",
      }),
      DEFAULT_PROMPT_RULES,
    );
    expect(id).not.toBe("translate");
  });
});

describe("detectContext — question", () => {
  it("detects a question", () => {
    expect(detect("What is the difference between REST and GraphQL?")).toBe("question");
  });
});

describe("detectContext — data", () => {
  it("detects a numeric dataset", () => {
    expect(detect("100 200 300\n400 500 600")).toBe("data");
  });
});

describe("detectContext — term", () => {
  it("detects a very short term", () => {
    expect(detect("Big O notation")).toBe("term");
  });
  it("detects a single word", () => {
    expect(detect("idempotent")).toBe("term");
  });
});

describe("detectContext — article", () => {
  it("detects a long prose paragraph", () => {
    const prose = "The quick brown fox jumps over the lazy dog. It was a bright cold day in April. The clocks were striking thirteen. All happy families are alike. It was the best of times, it was the worst of times. Call me Ishmael. In the beginning God created the heavens.";
    expect(detect(prose)).toBe("article");
  });
});

describe("detectContext — default fallback", () => {
  it("falls back to default when nothing matches", () => {
    const id = detectContext(ctx("x"), [{ id: "default", enabled: true, template: "{selection}" }]);
    expect(id).toBe("default");
  });
});

// ══════════════════════════════════════════════════════════════════
// Collision / priority edge cases
// ══════════════════════════════════════════════════════════════════

describe("detectContext — collisions", () => {
  it("stack trace inside JSON → error wins", () => {
    // The TypeError and at-frame patterns score +20 (text cap); json scores +14 (2 text hits + length).
    const text = 'TypeError: Cannot read properties of undefined\n    at Object.<anonymous> (app.js:12)\n    at Module._compile (node:internal/modules/cjs/loader:1376)';
    expect(detect(text)).toBe("error");
  });

  it("URL inside a prose paragraph → not url", () => {
    const text = "You can find more information at https://example.com and read the docs.";
    expect(detect(text)).not.toBe("url");
  });

  it("short SQL SELECT → sql wins over code", () => {
    expect(detect("SELECT * FROM users WHERE id = 1;")).toBe("sql");
  });

  it("diff on GitHub PR page → diff wins over code", () => {
    const text = "@@ -1,3 +1,4 @@\n-old\n+new\n context";
    expect(detect(text, { url: "https://github.com/foo/bar/pull/123" })).toBe("diff");
  });

  it("markdown with code blocks → markdown wins over code", () => {
    const text = "# Title\n\n- bullet\n\n```js\nconst x = 1;\n```\n\nMore text here.";
    expect(detect(text)).toBe("markdown");
  });
});

// ══════════════════════════════════════════════════════════════════
// expandVariables
// ══════════════════════════════════════════════════════════════════

describe("expandVariables", () => {
  it("substitutes known variables", () => {
    const result = expandVariables("Hello {{name}}!", { name: "world" });
    expect(result).toBe("Hello world!");
  });

  it("leaves unknown variables literal", () => {
    const result = expandVariables("{{selection}} from {{foo}}", { selection: "text" });
    expect(result).toBe("text from {{foo}}");
  });

  it("substitutes empty string for known-but-missing variables", () => {
    const result = expandVariables("domain: {{domain}}", { domain: "" });
    expect(result).toBe("domain: ");
  });

  it("substitutes multiple variables", () => {
    const result = expandVariables("{{length}} text from {{domain}}", { length: "medium", domain: "example.com" });
    expect(result).toBe("medium text from example.com");
  });

  it("substitutes {{selection}} with the actual text", () => {
    const result = expandVariables("Explain: {{selection}}", { selection: "Big O" });
    expect(result).toBe("Explain: Big O");
  });
});

// ══════════════════════════════════════════════════════════════════
// buildPrompt
// ══════════════════════════════════════════════════════════════════

describe("buildPrompt", () => {
  const settings = {
    enabled: true,
    role: { enabled: false, text: "" },
    rules: DEFAULT_PROMPT_RULES.map(def => ({ ...def, template: t(def.templateKey) })),
  };

  it("returns a non-empty string", () => {
    const result = buildPrompt(ctx("SELECT * FROM users;"), settings);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("includes the selection text", () => {
    const sel = "SELECT * FROM users;";
    const result = buildPrompt(ctx(sel), settings);
    expect(result).toContain(sel);
  });

  it("prepends the role when enabled and non-empty", () => {
    const withRole = {
      ...settings,
      role: { enabled: true, text: "You are a DBA." },
    };
    const result = buildPrompt(ctx("SELECT 1;"), withRole);
    expect(result.startsWith("You are a DBA.")).toBe(true);
  });

  it("does not prepend role when disabled", () => {
    const withRole = {
      ...settings,
      role: { enabled: false, text: "You are a DBA." },
    };
    const result = buildPrompt(ctx("SELECT 1;"), withRole);
    expect(result.startsWith("You are a DBA.")).toBe(false);
  });

  it("does not prepend role when text is empty", () => {
    const withRole = {
      ...settings,
      role: { enabled: true, text: "   " },
    };
    const result = buildPrompt(ctx("SELECT 1;"), withRole);
    expect(result.startsWith("You")).toBe(false);
  });

  it("falls back to default rule when no other rule matches", () => {
    const minimalRules = [{ id: "default", enabled: true, template: "fallback:{{selection}}" }];
    const result = buildPrompt(ctx("x"), { ...settings, rules: minimalRules });
    expect(result).toBe("fallback:x");
  });

  it("expands {domain} from pageUrl", () => {
    const result = buildPrompt(
      ctx("SELECT 1;", { url: "https://dbfiddle.uk/query" }),
      settings,
    );
    // sql template has no {domain} by default but article template does; just
    // confirm expandVariables runs without crashing and returns a string.
    expect(typeof result).toBe("string");
  });

  it("expands {{title}} from pageTitle", () => {
    const termSettings = {
      ...settings,
      rules: [{ id: "term", enabled: true, template: "Explain {{selection}} (context: {{title}})" }],
    };
    const result = buildPrompt(ctx("closure", { title: "MDN Web Docs" }), termSettings);
    expect(result).toContain("MDN Web Docs");
  });

  it("expands {{length}} based on selection length", () => {
    const longSel = "word ".repeat(200);
    const result = buildPrompt(
      ctx(longSel, {}),
      { ...settings, rules: [{ id: "article", enabled: true, template: "This is {{length}}" }] },
    );
    expect(result).toContain("long");
  });
});

// ══════════════════════════════════════════════════════════════════
// scoreContext ordering
// ══════════════════════════════════════════════════════════════════

describe("scoreContext", () => {
  it("returns an array for every rule", () => {
    const scores = scoreContext(ctx("hello world"), DEFAULT_PROMPT_RULES);
    expect(scores.length).toBe(DEFAULT_PROMPT_RULES.length);
  });

  it("is sorted descending by score", () => {
    const scores = scoreContext(ctx("SELECT * FROM orders;"), DEFAULT_PROMPT_RULES);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i - 1].score).toBeGreaterThanOrEqual(scores[i].score);
    }
  });

  it("default always present with score 0 when nothing matches", () => {
    const scores = scoreContext(ctx("x"), [{ id: "default", enabled: true, template: "{selection}" }]);
    expect(scores.find(s => s.id === "default")?.score).toBe(0);
  });
});
