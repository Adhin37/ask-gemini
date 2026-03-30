# Chrome Web Store — Developer Program Policies

> Reference document for publishing **Ask Gemini** on the Chrome Web Store.
> Based on the official policies last updated **2025-05-22**.
> Source: <https://developer.chrome.com/docs/webstore/program-policies/policies>

---

## Table of Contents

1. [Before You Submit — Best Practices](#1-before-you-submit--best-practices)
2. [Fostering a Safe Ecosystem](#2-fostering-a-safe-ecosystem)
3. [Protecting User Privacy](#3-protecting-user-privacy)
4. [Responsible Marketing & Monetization](#4-responsible-marketing--monetization)
5. [Building Quality Products](#5-building-quality-products)
6. [Technical Requirements](#6-technical-requirements)
7. [Enforcement](#7-enforcement)
8. [Submission Checklist for Ask Gemini](#8-submission-checklist-for-ask-gemini)
9. [Common Rejection Reasons](#9-common-rejection-reasons)
10. [Practical Tips for Faster Review](#10-practical-tips-for-faster-review)

---

## 1. Before You Submit — Best Practices

Google's official best practices before any submission:

- Read and understand all Chrome Web Store policies **before** building.
- Your extension must add genuine value — if it isn't useful or unique, it
  doesn't belong on the store.
- No cheating: misleading users, copying other developers' work, or
  manipulating ratings/reviews results in a **permanent ban**.
- Carefully follow the data collection and disclosure requirements (see §3).
- Keep all listing metadata (description, screenshots, privacy fields)
  accurate and up to date at all times.
- Test for crashes, broken features, and bugs before every submission.
- Verify your developer account email is active — enforcement emails require
  timely action; failing to respond can result in removal.
- Include a clear description of your extension's **single purpose** in the
  designated field.
- Policies can change at any time. Google notifies developers via email, and
  compliance with updated policies is the developer's responsibility.

---

## 2. Fostering a Safe Ecosystem

### 2.1 Mature & Sexually Explicit Content

- No nudity, graphic sex acts, sexually explicit material, or links to
  pornography sites.
- Zero tolerance for child sexual abuse material (CSAM) — reported to
  authorities and account deleted immediately.
- Non-sexual nudity (artistic, educational, scientific) may be allowed but
  can reduce store visibility.
- Content not suitable for all ages must be marked **Mature** in the
  Developer Dashboard.

### 2.2 Malicious and Prohibited Products

- No viruses, worms, Trojan horses, malware, or destructive code of any kind.
- No content that harms Google's or third-party networks/servers/infrastructure.
- Spyware, malicious scripts, and phishing scams are prohibited.
- Do not circumvent paywalls or login restrictions on external websites.
- Do not facilitate unauthorized download or streaming of copyrighted content.
- Cryptocurrency mining is not allowed.

### 2.3 Hate Speech and Violent Behavior

- No gratuitous violence, threats, harassment, or bullying.
- No content that incites hatred based on race, ethnicity, religion,
  disability, gender, age, veteran status, nationality, sexual orientation,
  gender identity, or any similarly protected characteristic.
- Extensions that recruit, fundraise for, or promote violence on behalf of
  extremist groups are removed immediately.

### 2.4 Regulated Goods and Services

- No promotion or facilitation of illegal activities.
- **Real money gambling is explicitly prohibited** (casinos, sports betting,
  lotteries, skill-prize games). Simulated gambling with no real-money prizes
  may be allowed with clear disclosure.
- No facilitation of sales of pharmaceuticals, alcohol, tobacco, fireworks,
  weapons, or health/medical devices.

---

## 3. Protecting User Privacy

### 3.1 Privacy Policy

- **Required** if your extension handles any user data.
- Must comprehensively disclose how data is collected, used, and shared, and
  list all third parties data is shared with.
- Must be linked in the designated Chrome Web Store Developer Dashboard field.

### 3.2 Limited Use

- You must limit data use to the practices disclosed.
- Collection of web browsing activity is prohibited unless it is required
  for a prominently described user-facing feature.
- User data obtained for one purpose must only be used to provide or improve
  that single purpose. Specifically prohibited:
  - Selling data to advertising platforms or data brokers.
  - Using data for personalized ads.
  - Using data to determine credit-worthiness.
  - Transferring data for any reason not listed in the policy.
- If your extension accesses Google APIs, you must publish a statement on your
  website affirming compliance with Limited Use requirements.

### 3.3 Minimum Permissions

- Request the **narrowest permissions** necessary. If two permissions could
  accomplish the same thing, use the one with the least access.
- Do not "future-proof" by requesting permissions for features not yet built.

### 3.4 Disclosure & Consent

- Be transparent about all data handling.
- If data collected is not closely related to the prominently described
  functionality, you must:
  1. Prominently disclose what data is collected and how it will be used.
  2. Obtain affirmative, informed user consent **before** installation.

### 3.5 Data Security

- Handle all user data securely and transmit via modern cryptography.
- Never publicly disclose financial, payment, or authentication information.
- Security vulnerabilities that could be exploited must be addressed; Google
  may remove the extension until remediation steps are completed.

---

## 4. Responsible Marketing & Monetization

### 4.1 Impersonation & Intellectual Property

- Do not impersonate another company or claim official authorization you
  don't have.
- Do not mimic OS or browser functionality/warnings.
- Do not create sites that mimic or pass themselves off as the Chrome Web Store.
- No false metadata ("Editor's Choice", "Number One", etc.).
- Do not infringe on patents, trademarks, trade secrets, or copyrights.

### 4.2 Deceptive Installation Tactics

The following are prohibited and will result in removal:

- Misleading ads or marketing materials that don't accurately describe the
  extension.
- Misleading call-to-action buttons or forms that hide the fact that an
  extension will be installed.
- Manipulating the store listing window to hide metadata from users.
- Bundling other extensions or offers in the same installation flow.
- Requiring unrelated user actions to access advertised functionality.

### 4.3 Accepting Payments

- Collect financial information securely in accordance with privacy laws and
  PCI standards.
- Clearly describe what you are selling and post terms of sale prominently.
- If the extension requires payment for basic functionality, state this
  clearly in the description.
- Clearly identify yourself — not Google — as the seller.

### 4.4 Misleading or Unexpected Behavior

- No deceptive content in titles, descriptions, icons, or screenshots.
- Device settings changes must have user knowledge and consent, and be
  easily reversible.
- Do not include hidden functionality unrelated to the primary purpose.
- No impossible claimed features (e.g. "see who viewed your profile").

### 4.5 Ads

- Ads must comply with all content policies.
- AdSense may **not** be used in extensions.
- Ads must be clearly labeled with their source.
- Ads must be easily removable by the user.
- Ads must not simulate system notifications or warnings.
- Forcing users to click ads or submit personal information to use the
  extension is prohibited.
- Ads must not interfere with ads or native content on third-party websites
  unless all four conditions are met: disclosed to the user, clearly
  attributed, non-interfering, and non-impersonating.

### 4.6 Affiliate Ads

- Affiliate programs must be prominently described in the store listing, UI,
  and before installation.
- Affiliate links/codes/cookies may only be included when the extension
  provides a direct, transparent user benefit tied to its core functionality.
- User action is required before each affiliate code, link, or cookie is
  applied. Silent background injection is a violation.

---

## 5. Building Quality Products

### 5.1 Featured Products

The following types of products are eligible for the store but will **not** be
featured in curated collections:

- Religious or political content
- VPNs
- Video downloaders
- Anti-virus tools
- Content not suitable for all families
- Bots
- Cryptocurrency tools
- Non-production builds
- Gambling content
- Extensions from developers with a history of misleading or malicious products

### 5.2 Spam and Abuse

- Do not publish multiple extensions that duplicate the same experience.
- Do not manipulate ratings, reviews, or install counts (no incentivized or
  fraudulent downloads/reviews).
- No notification abuse: no spam, ads, promotions, phishing, or unwanted
  messages via extension notifications.
- Do not send messages on behalf of the user without confirmation of content
  and recipients.
- Must comply with Google's Webmaster Quality Guidelines.

### 5.3 Single Purpose / Quality Guidelines

- An extension must have **one narrow, clearly understood purpose**.
- Do not bundle unrelated features. If two features are clearly separate,
  they should be separate extensions.
- Persistent UI elements should actively enhance the user's current task
  with minimal distraction.
- Violations include: side panels that hijack browsing, extensions whose
  primary purpose is serving ads, toolbars with a broad array of unrelated
  functionality.

### 5.4 Listing Requirements

- A blank description, missing icon, or missing screenshots results in
  **automatic rejection**.
- All listing metadata must be accurate, up to date, and comprehensive.
- Privacy fields in the dashboard must match your privacy policy and actual
  extension behavior.
- No keyword spam: do not stuff irrelevant or excessive keywords, lists of
  brands/regions, or repetitions of the same keyword more than 5 times.
- No anonymous or unattributed user testimonials in the description.

### 5.5 Minimum Functionality

- Do not publish an extension whose sole purpose is launching another app,
  theme, webpage, or extension.
- No broken functionality (dead links, non-functioning features).
- Must provide genuine utility. Violations include: extensions with no
  functionality, extensions that only redirect to an external service, and
  click-bait template extensions with negligible unique value.

---

## 6. Technical Requirements

### 6.1 Code Readability

- Code must not be **obfuscated** or have its functionality concealed. This
  includes external code fetched by the extension.
- Minification **is** allowed: removing whitespace/comments, shortening
  variable names, collapsing files.

### 6.2 API Use

- Extensions must use existing Chrome APIs for their intended use cases. Using
  unofficial methods where an API exists is a violation.
- Example: overriding the New Tab page through any means other than the URL
  Overrides API is not permitted.

### 6.3 Manifest V3 Requirements

- The full functionality of an MV3 extension must be discernible from its
  submitted code — logic must be self-contained.
- The extension may reference external **data/resources**, but external
  resources must not contain any logic.
- Prohibited:
  - `<script>` tags pointing to resources outside the extension package.
  - `eval()` or equivalent to execute remotely fetched strings.
  - Interpreters for commands fetched from a remote source.
- Permitted remote execution only via officially documented APIs:
  - Debugger API
  - User Scripts API
- Communicating with remote servers is still allowed for: account sync,
  remote config (where all logic is local), non-logic resources (images),
  and server-side operations on data.

### 6.4 2-Step Verification (2SV)

- **Mandatory** for all developer accounts before publishing or updating
  any extension. Enable at: <https://myaccount.google.com/security>

---

## 7. Enforcement

### 7.1 Outcomes During Review

| Outcome | Action |
|---|---|
| No violations found | Submission approved, may be published |
| Policy violation found | Submission rejected, developer notified with details |
| Malware / extreme violation | Extension immediately removed, no notification |

### 7.2 Outcomes for Published Extensions

Published extensions are subject to periodic re-review. Possible outcomes:

| Severity | Action |
|---|---|
| No violation | No action taken |
| Minor violation | Warning sent; developer has a set time to fix before takedown |
| Serious violation | Extension immediately taken down, developer notified |
| Extreme issue (malware) | Immediately taken down, developer **not** notified |

### 7.3 Appeals

- Developers may appeal a violation decision **once**.
- After the appeal decision, no further appeals are accepted for that violation.
- Frivolous or bad-faith appeals may result in forfeiture of future appeal rights.

### 7.4 Repeat Abuse

- Serious or repeated violations result in **suspension of the developer
  account** and possibly related accounts.
- Repeated IP infringement (copyright) results in account termination.
- Extreme cases may result in suspension of associated Google services.

### 7.5 Enforcement Circumvention

- Any attempt to circumvent limitations or enforcement results in **immediate
  termination** of the developer account.

---

## 8. Submission Checklist for Ask Gemini

Use this checklist before every submission or update.

### manifest.json

- [ ] `manifest_version` is `3`
- [ ] `version` is bumped from the previously published version
- [ ] `name` and `description` are accurate and up to date
- [ ] Only the minimum required permissions are declared:
  `storage`, `contextMenus`, `tabs`, `scripting`, `activeTab`
- [ ] `host_permissions` limited to `https://gemini.google.com/*`
- [ ] No `eval()` or remotely hosted scripts
- [ ] Icons provided at 16×16, 48×48, and 128×128 px

### Store Listing (Developer Dashboard)

- [ ] Title: "Ask Gemini" — matches manifest name
- [ ] Description: clear, accurate, no keyword spam, no unattributed quotes
- [ ] Category: Productivity (or similar)
- [ ] Icon: 128×128 PNG, non-blurry
- [ ] At least 1 screenshot (1280×800 or 640×400 px)
- [ ] Small promo tile: 440×280 px (optional but recommended)
- [ ] Privacy fields filled in and consistent with actual behavior
- [ ] Privacy policy link provided (if any user data is collected)

### Privacy & Data

- [ ] The extension stores messages temporarily in `chrome.storage.local`
  to pass them to the Gemini tab — this qualifies as user data handling
- [ ] Confirm no data is sent to third-party servers
- [ ] Confirm no data is persisted beyond the local browser storage
- [ ] Privacy policy (if required) discloses local storage usage

### Code

- [ ] No obfuscated code
- [ ] No `eval()` or dynamic remote code execution
- [ ] Content script only injects on `https://gemini.google.com/*`
- [ ] All features work as described; no broken links or dead features
- [ ] Tested in Chrome with Developer Mode before zipping

### Account

- [ ] 2-Step Verification enabled on the Google account
- [ ] Developer account email is active and not filtering Google's emails as spam
- [ ] Developer Dashboard payment ($5 one-time) completed

---

## 9. Common Rejection Reasons

Based on official documentation and developer community reports:

| Reason | How it applies to Ask Gemini |
|---|---|
| **Broad host permissions** | ✅ Not applicable — only `gemini.google.com` |
| **Missing description or icon** | Easy to fix before submission |
| **Keyword spam in description** | Avoid repeating "Gemini", "AI", etc. excessively |
| **Privacy field mismatch** | Ensure dashboard privacy fields match the README/policy |
| **Obfuscated code** | Not applicable — all code is readable; minification is fine |
| **Remote code execution** | Not applicable — no `eval()`, no remote scripts |
| **Misleading functionality claims** | Describe injection as "best-effort"; Gemini's DOM may change |
| **Single purpose violation** | ✅ Extension has one clear purpose: sending prompts to Gemini |
| **Deceptive install tactics** | N/A — no ads or install funnels |

---

## 10. Practical Tips for Faster Review

- **Avoid broad host permissions.** `<all_urls>` or `https://*/*` dramatically
  increase review time and scrutiny. Ask Gemini correctly uses only
  `https://gemini.google.com/*`.
- **Use `activeTab` over persistent tab permissions** where possible.
- **Keep code readable.** Minify if needed, but do not obfuscate.
- **Accurate metadata.** Mismatches between the listing and actual behavior
  are a top reason for rejection and re-review.
- **Review times vary.** Most submissions complete in under 24 hours; 90%
  within 3 days. Extensions with sensitive permissions may take longer.
  If pending for more than 3 weeks, contact developer support.
- **Don't re-submit immediately after rejection.** Fix the flagged issues
  first; re-submitting without changes can extend review time.
- **30-day publish window.** After approval, you have 30 days to publish
  before the submission reverts to draft and requires re-review.
- **Enable email notifications** in the Developer Dashboard Account page to
  receive publish and stage notifications (rejection/takedown emails are
  enabled by default).

---

## Useful Links

| Resource | URL |
|---|---|
| Program Policies | <https://developer.chrome.com/docs/webstore/program-policies/policies> |
| Developer Agreement | <https://developer.chrome.com/docs/webstore/program-policies/terms> |
| User Data FAQ | <https://developer.chrome.com/docs/webstore/program-policies/user-data-faq> |
| Quality Guidelines FAQ | <https://developer.chrome.com/docs/webstore/program-policies/quality-guidelines-faq> |
| Deceptive Installation FAQ | <https://developer.chrome.com/docs/webstore/program-policies/deceptive-installation-tactics-faq> |
| Spam Policy FAQ | <https://developer.chrome.com/docs/webstore/program-policies/spam-faq> |
| Review Process | <https://developer.chrome.com/docs/webstore/review-process> |
| Publish Guide | <https://developer.chrome.com/docs/webstore/publish> |
| Developer Dashboard | <https://chrome.google.com/webstore/devconsole> |
| Extension Shortcuts | chrome://extensions/shortcuts |
| 2-Step Verification | <https://myaccount.google.com/security> |
| Report Security Vulnerability | <https://www.google.com/about/appsecurity/ddprp/> |
