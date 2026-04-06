# Contact Form Filler — Automated Outreach Tool

Node.js + Selenium automation jo websites ke contact forms automatically fill aur submit karta hai. hCaptcha, reCAPTCHA, Cloudflare Turnstile, Math CAPTCHA sab solve karta hai.

---

## Quick Start

```bash
npm install
pip install seleniumbase openai-whisper pydub --break-system-packages
```

URLs file banao:
```bash
echo "https://example.com" > retry_urls.txt
```

Run karo:
```bash
node main.js      # main filler
node retry.js     # failed URLs retry
```

---

## File Structure

```
cf-filler-repo/
├── main.js                    # Main entry point
├── retry.js                   # Failed URLs retry engine
├── fill.js                    # CSV watcher + auto-queue
├── run.js                     # Scraper launcher
├── config.js                  # Contacts, paths, settings
├── navigator.js               # Contact page finder
├── form_finder.js             # Form detection engine
├── form_types.js              # Form type handlers
├── fields.js                  # Field filling logic
├── submitter.js               # Form submit + success detect
├── driver_setup.js            # Chrome/Selenium setup
├── result_tracker.js          # CSV + Google Sheets logging
├── unified_scraper.js         # Google Maps scraper
├── autopush.js                # Auto git push
├── code.gs                    # Google Apps Script
├── whisper_server.py          # Whisper audio transcription server
├── hcaptcha_sb_solver.py      # SeleniumBase hCaptcha solver ⭐
├── hcaptcha_cnn_solver.py     # CNN image classifier (fallback)
└── captcha/
    ├── handler.js             # CAPTCHA orchestrator
    ├── detector.js            # CAPTCHA type detector
    ├── hcaptcha.js            # hCaptcha Node.js wrapper ⭐
    ├── recaptcha.js           # reCAPTCHA v2 audio solver
    ├── image_captcha.js       # Image OCR + Math solver
    └── turnstile.js           # Cloudflare Turnstile handler
```

---

## File Details

### `main.js`
Main processing loop. Har URL ke liye:
1. Page load karta hai
2. HTTP error check (403/404 → skip)
3. Contact page dhundta hai
4. Form dhundta hai
5. Fields fill karta hai
6. CAPTCHA solve karta hai
7. Submit karta hai
8. Success detect karta hai
9. CSV + Google Sheets mein save karta hai

### `retry.js`
`contact_results.csv` se failed/skipped URLs pick karta hai aur retry karta hai. Features:
- Already done URLs skip karta hai (`retry_results.csv` check)
- Resume support (`retry_progress.txt`)
- Har URL ka result turant append karta hai
- 4 strategies: navigator → scroll+JS wait → shadow DOM → overlay removal

### `config.js`
- 13 rotating contact identities (naam + email)
- File paths, timeouts, CAPTCHA policy settings
- CSV field definitions

### `navigator.js`
Homepage se contact page dhundta hai:
- URL mein "contact" word check
- Page pe existing form check
- Links scan karta hai (score-based)
- Sirf existing links follow karta hai — random paths guess nahi karta

### `form_finder.js`
Page pe contact form dhundta hai:
- Score-based ranking (email field, textarea, visible inputs)
- WordPress plugins detect (CF7, WPForms, Gravity, Elementor, HubSpot)
- Iframe forms support
- Formless React/Vue/Angular forms support
- 3 passes with JS render wait

### `fields.js`
Form fields fill karta hai:
- Label, name, id, placeholder se field type identify karta hai
- 12 field types: name, email, phone, company, website, job_title, subject, message, budget, address, etc.
- Select dropdowns: India/phone code, service type, budget
- Honeypot detection (hidden fields skip)
- CF7 Quiz/Math CAPTCHA inline solve
- React/Vue/Angular compatible (native setter + events)

### `submitter.js`
- Score-based submit button detection
- 4 fallback methods: click → submit event → form.submit() → Enter key
- Success detection: URL redirect, thank-you text, CSS selectors
- reCAPTCHA V3 error detection

### `driver_setup.js`
Chrome setup:
- hektCaptcha extension auto-load (`hcaptcha_models/ext/`)
- `navigator.webdriver = undefined` spoof via CDP
- Window size: 960×1080 (left half of 1920 screen)
- Proxy rotation support

### `result_tracker.js`
- CSV save/load
- Google Sheets push (via Apps Script webhook)
- Progress file management
- Debug screenshots

### `code.gs`
Google Apps Script — 3 sheets manage karta hai:
- `MapData` — scraper data
- `CFResults` — main.js results (green tab)
- `RetryResults` — retry.js results (orange tab)

---

## CAPTCHA System

### `captcha/detector.js`
Page pe CAPTCHA type detect karta hai:
- reCAPTCHA v2 (anchor iframe check)
- reCAPTCHA V3 (error message after submit)
- hCaptcha (iframe + widget + response textarea)
- Cloudflare Turnstile
- Image CAPTCHA (img + input selectors)
- Math CAPTCHA (label text scan)
- CF7 Quiz

### `captcha/handler.js`
CAPTCHA orchestrator — type ke hisaab se solver call karta hai:
```
Image/Math  → image_captcha.js
reCAPTCHA V3 → Skip (score-based, not solvable)
Cloudflare  → turnstile.js
reCAPTCHA v2 → recaptcha.js (Whisper audio)
hCaptcha    → hcaptcha.js (SeleniumBase CDP) ⭐
```

Post-submit success check bhi karta hai — agar page already success show kare to captcha skip.

---

## hCaptcha Solver — Detailed Explanation ⭐

### Problem
hCaptcha normal Selenium clicks detect kar leta hai kyunki:
- JavaScript `dispatchEvent()` se click ka `isTrusted = false` hota hai
- hCaptcha `isTrusted` property check karta hai
- Bot detect hone par image challenge deta hai ya block karta hai

### Solution: CDP `Input.dispatchMouseEvent`

**Chrome DevTools Protocol (CDP)** browser engine level pe kaam karta hai — JavaScript DOM ke upar. CDP se bheja gaya mouse event `isTrusted = true` hota hai, exactly jaise real human click.

```
Normal JS click:    event.isTrusted = false  ❌ hCaptcha detects bot
CDP mouse event:    event.isTrusted = true   ✅ hCaptcha thinks human
```

### SeleniumBase Implementation

**`hcaptcha_sb_solver.py`** — Python server jo SeleniumBase CDP use karta hai:

```python
sb = sb_cdp.Chrome(url, lang="en")  # Apna Chrome kholta hai
sb.gui_click_captcha()               # CDP click → isTrusted=true
token = sb.evaluate("[name='h-captcha-response']?.value")
```

`gui_click_captcha()` internally:
1. hCaptcha iframe dhundta hai
2. `gui_click_x_y(x, y)` → PyAutoGUI se screen coordinates pe click
3. Ya CDP `Input.dispatchMouseEvent` → `mousePressed` + `mouseReleased`
4. hCaptcha checkbox click hota hai
5. Agar image challenge aaye → automatically solve karta hai
6. Token `h-captcha-response` textarea mein inject hota hai

### Complete Flow

```
retry.js / main.js
    ↓
handleCaptcha(driver, record, 'pre-submit')   [handler.js]
    ↓
detectCaptchaState() → "hCaptcha"             [detector.js]
    ↓
solveHcaptcha(driver)                          [hcaptcha.js]
    ↓
sbSolve(url)  ← URL bhejta hai Python ko
    ↓
hcaptcha_sb_solver.py  ← SeleniumBase Chrome khulta hai
    ↓ (same URL pe)
inject hCaptcha script (agar lazy load)
scroll to widget
gui_click_captcha()  ← CDP isTrusted=true click
wait for token (up to 45s × 3 attempts)
    ↓
token return (1600+ chars)
    ↓
hcaptcha.js → token inject into main browser
    ↓
form submit → SUCCESS ✅
```

### Why Two Browsers?

SeleniumBase apna alag Chrome window kholta hai kyunki:
- Selenium WebDriver ka Chrome `navigator.webdriver = true` hota hai
- SeleniumBase CDP mode mein yeh `undefined` hota hai
- hCaptcha `navigator.webdriver` check karta hai

**Main browser** (Selenium) → form fill karta hai  
**SeleniumBase browser** → hCaptcha solve karta hai, token return karta hai  
**Token inject** → main browser mein paste hota hai

### `captcha/hcaptcha.js`
Node.js wrapper:
- Python process spawn karta hai (singleton — ek baar start, baar baar use)
- URL bhejta hai stdin se
- Token stdout se receive karta hai
- Token main Selenium browser mein inject karta hai

### `hcaptcha_cnn_solver.py`
CNN fallback (agar SeleniumBase fail ho):
- MobileNetV3-Small (ImageNet pretrained)
- Tile images URLs se download karta hai
- Cosine similarity se classify karta hai
- Unsolvable types (drag, triangle, shape) reload karta hai

---

## reCAPTCHA v2 Solver

**`captcha/recaptcha.js`** — Whisper audio approach:
1. Checkbox click (CDP)
2. Image challenge → audio button click
3. Audio file download
4. **`whisper_server.py`** → Whisper tiny model transcribe karta hai
5. Digit sequence extract (noise/repeat reject)
6. Answer type karta hai
7. Verify click

**`whisper_server.py`** — Persistent Python server:
- Whisper tiny model load (ek baar)
- Audio path stdin se receive
- Transcription stdout pe return
- Digit extraction: word numbers → digits, noise reject, repeat pattern reject

---

## Math / CF7 Quiz Solver

**`captcha/image_captcha.js`** → `solveMathCaptcha()`:
- CF7 REST API se question fetch
- Math expressions solve: `2 + 3 = ?` → `5`
- Text answers: `"Spam Check Enter s3oc0mpany"` → `s3oc0mpany` (last word)
- Word numbers: `"seven plus three"` → `10`

---

## Google Sheets Setup

`code.gs` ko Google Apps Script mein deploy karo:
1. [script.google.com](https://script.google.com) → New Project
2. `code.gs` content paste karo
3. Deploy → Web App → Anyone access
4. URL copy karo → `result_tracker.js` mein `SHEETS_URL` set karo

3 tabs automatically banenge:
- 🔵 `MapData` — scraper data
- 🟢 `CFResults` — main.js results
- 🟠 `RetryResults` — retry.js results

---

## Output Files

```
form_results/
├── contact_results.csv      # main.js results
├── retry_results.csv        # retry.js results
├── retry_progress.txt       # resume point
├── retry_skipped.txt        # still failing URLs
├── progress.txt             # main.js resume point
└── unknown_fields.log       # unrecognized form fields
```

---

## Status Values

| Status | Meaning |
|--------|---------|
| `Success` | Form submitted, confirmation detected |
| `Partial` | Submitted but email/name missing |
| `Failed` | Form found but submit failed |
| `Skipped` | 404/403/timeout/reCAPTCHA V3 |

---

## Dependencies

```bash
npm install selenium-webdriver chrome-driver-manager tesseract.js
pip install seleniumbase openai-whisper pydub torch torchvision
```
