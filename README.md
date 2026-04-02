# Contact Form Filler + Google Maps Scraper

An automated tool that:
1. **Scrapes** business data from Google Maps (digital marketing agencies)
2. **Fills** contact forms on their websites automatically
3. **Solves CAPTCHAs** (reCAPTCHA, image, math)
4. **Saves results** to CSV and Google Sheets in real time

---

## What This Tool Does

- Searches Google Maps for digital marketing agencies in 311 cities worldwide
- Visits each agency's website and finds their contact page
- Fills the contact form with your details and message
- Handles CAPTCHAs automatically (audio solver using Whisper AI)
- Saves all results to CSV files and a live Google Sheet

---

## How to Use

### Step 1 — Install dependencies
```bash
npm install
pip install openai-whisper
```

### Step 2 — Scrape Google Maps data
```bash
node run.js
```
This searches Google Maps and saves business data to `digital_marketing_data.csv`

### Step 3 — Fill contact forms
```bash
node fill.js
```
This reads URLs from the CSV and fills contact forms automatically.
It keeps running and picks up new URLs as the scraper adds them.

### Run both together (two terminals)
```bash
# Terminal 1
node run.js

# Terminal 2
node fill.js
```

---

## File Explanations

### Main Files

| File | What it does |
|------|-------------|
| `run.js` | Starts the Google Maps scraper |
| `fill.js` | Reads scraped URLs and fills contact forms. Keeps watching for new URLs |
| `main.js` | Core contact form filling engine — loads URLs, processes each one |
| `unified_scraper.js` | Scrapes Google Maps for business names, websites, emails, contact URLs |
| `config.js` | Your contact details (name, email, phone, message, company) |
| `config.json` | List of 311 cities and 10 keywords to search on Google Maps |
| `autopush.js` | Watches for file changes and auto-pushes to GitHub |

### Form Filling Modules

| File | What it does |
|------|-------------|
| `navigator.js` | Finds the contact page on a website (checks nav links, common paths like /contact, sitemap) |
| `form_finder.js` | Finds the contact form on the page (supports WordPress, HubSpot, Gravity Forms, React SPAs, iframes) |
| `fields.js` | Detects and fills each form field (name, email, phone, company, message etc.) |
| `submitter.js` | Clicks the submit button and detects success (thank you page, redirect) |
| `form_types.js` | Detects form type (CF7, WPForms, Gravity Forms, HubSpot, Typeform etc.) |
| `driver_setup.js` | Sets up Chrome browser with Selenium |
| `result_tracker.js` | Saves results to CSV and sends to Google Sheets |

### CAPTCHA Solvers (`captcha/` folder)

| File | What it does |
|------|-------------|
| `handler.js` | Main CAPTCHA handler — decides which solver to use |
| `detector.js` | Detects what type of CAPTCHA is on the page |
| `recaptcha.js` | Solves reCAPTCHA v2 using audio challenge + Whisper AI |
| `image_captcha.js` | Solves image CAPTCHAs (OCR) and math CAPTCHAs (2+3=?) |
| `turnstile.js` | Handles Cloudflare Turnstile |

### Data Files

| File | What it does |
|------|-------------|
| `digital_marketing_data.csv` | Scraped business data from Google Maps |
| `retry_urls.txt` | List of URLs to fill contact forms on |
| `form_results/contact_results.csv` | Results of contact form filling (success/failed/partial) |
| `form_results/unknown_fields.log` | Fields that couldn't be matched — used to improve the tool |
| `unified_progress.json` | Scraper progress — so it resumes from where it stopped |

### Other Files

| File | What it does |
|------|-------------|
| `code.gs` | Google Apps Script — paste this in Google Sheets to receive live data |
| `whisper_server.py` | Python server that runs Whisper AI for audio CAPTCHA solving |
| `package.json` | Node.js dependencies list |

---

## Configuration

### Change your contact details — `config.js`
```js
first_name: 'Your Name',
email:      'you@company.com',
phone:      '+91 9999999999',
company:    'Your Company',
message:    'Your message here...'
```

### Change target cities/keywords — `config.json`
```json
{
  "areas": ["New York", "London", ...],
  "keywords": ["Digital marketing agency", "SEO agency", ...]
}
```

### Google Sheets live updates
1. Open your Google Sheet
2. Go to **Extensions → Apps Script**
3. Paste the contents of `code.gs`
4. Deploy as **Web App** (Anyone can access)
5. Copy the Web App URL into `unified_scraper.js` and `result_tracker.js`

---

## Output

- **`digital_marketing_data.csv`** — All scraped businesses with name, address, phone, website, contact form URL
- **`form_results/contact_results.csv`** — Each URL with status: `Success`, `Failed`, `Partial`, `Skipped`
- **Google Sheet** — Live updates as data comes in (MapData sheet + CFResults sheet)

---

## Requirements

- Node.js v18+
- Google Chrome
- Python 3.8+ with `openai-whisper` installed
- Internet connection

---

## Resume Support

If the tool stops, just run it again — it resumes from where it left off automatically.
