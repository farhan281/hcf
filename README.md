# Contact Form Filler

Automated contact form filler — Node.js + Selenium.

## Setup

```bash
npm install
```

Python (for Whisper/reCAPTCHA audio):
```bash
pip install openai-whisper pydub SpeechRecognition
```

## Usage

1. Create `urls.txt` with one URL per line
2. Edit `config.js` — add your contact details
3. Run:

```bash
node main.js
```

Results saved to `form_results/contact_results.csv`

## Features
- Smart form detection (WordPress, Elementor, HubSpot, custom)
- All field types: name, email, phone, message, selects, checkboxes
- CAPTCHA: image OCR, math solver, reCAPTCHA audio (Whisper)
- Rotating contact identities
- Human-like delays
