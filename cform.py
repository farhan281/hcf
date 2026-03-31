"""
Perception System | Contact Form Outreach Automation
Author: Rafiq Ansari (Enhanced with Form Detection First)
"""

import time, re, csv, os, random
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.common.exceptions import (
    NoSuchElementException, ElementNotInteractableException,
    InvalidElementStateException, TimeoutException
)
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

# -----------------------------
# 1) CONFIGURATION
# -----------------------------

contact = {
    "first_name": "Farhan",
    "last_name": "Ansari",
    "full_name": "Farhan Ansari",
    "job_title": "Business Development",
    "email": "farhan.ansari@perceptionsystem.in",
    "phone": "+1 408 520 9495",
    "phone_country_code": "+1",
    "phone_local": "4085209495",
    "company": "Perception System",
    "website": "https://www.perceptionsystem.com/",
    "subject": "Work Now, Pay Later – scale with zero upfront risk",
    "budget": "Flexible",
    "address": "Ahmedabad, Gujarat, India",
    "message": """Hello Team,

We've been following your work—great innovation!

At Perception System (trusted by Dubai Govt. & Stanford University), we help businesses grow with:
• Web & Mobile App Development (CRM, ERP, SaaS)
• AI-powered solutions & process automation
• Pay-after-results Digital Marketing
• White-label SEO & SMM partnerships

Would love to explore collaboration opportunities.

Warm regards,
Farhan Ansari
Business Development | Perception System
https://www.perceptionsystem.com/
"""
}

# -----------------------------
# 2) LOAD URLS FROM FILE
# -----------------------------
URL_FILE = "urls.txt"
urls = []
if os.path.exists(URL_FILE):
    with open(URL_FILE, "r", encoding="utf-8") as f:
        urls = [line.strip() for line in f if line.strip()]
else:
    print(f"⚠️ {URL_FILE} not found! Please create it and add one contact URL per line.")
    exit(1)

print(f"🧩 Loaded {len(urls)} URLs from {URL_FILE}")

OUTPUT_DIR = "form_results"
os.makedirs(OUTPUT_DIR, exist_ok=True)
CSV_PATH = os.path.join(OUTPUT_DIR, "contact_results.csv")
PAGE_LOAD_TIMEOUT = 18
CAPTCHA_WAIT_TIMEOUT = 90
CSV_FIELDS = [
    "url", "status", "details", "load_status", "load_time_s",
    "contact_page_status", "form_status", "fields_filled",
    "validation_status", "captcha_status", "submit_status", "success_status"
]

# -----------------------------
# 3) SELENIUM SETUP
# -----------------------------
PROGRESS_FILE = os.path.join(OUTPUT_DIR, "progress.txt")

def make_driver():
    opts = webdriver.ChromeOptions()
    opts.add_argument("--disable-blink-features=AutomationControlled")
    opts.add_argument("--disable-notifications")
    opts.add_argument("--start-maximized")
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    
    # Try different Chrome binary locations (actual binaries, not wrapper scripts)
    chrome_paths = [
        "/opt/google/chrome/chrome",
        "/usr/bin/google-chrome-stable",
        "/usr/bin/google-chrome",
        "/usr/bin/chromium-browser",
        "/usr/bin/chromium",
        "/snap/bin/chromium"
    ]
    for path in chrome_paths:
        if os.path.exists(path):
            opts.binary_location = path
            print(f"   🌐 Using Chrome: {path}")
            break
    
    d = webdriver.Chrome(options=opts)
    d.set_page_load_timeout(PAGE_LOAD_TIMEOUT)
    return d

def is_driver_alive():
    try:
        _ = driver.title
        return True
    except Exception:
        return False

driver = make_driver()

# -----------------------------
# 4) HELPER FUNCTIONS
# -----------------------------

def restart_driver():
    global driver
    print("   🔄 Chrome crashed — restarting...")
    try:
        driver.quit()
    except Exception:
        pass
    time.sleep(2)
    driver = make_driver()
    print("   ✅ Chrome restarted")

def find_contact_page():
    """Find and navigate to contact page if not already there"""
    print("   🔎 Looking for contact page...")
    
    # Check if already on contact page
    current_url = driver.current_url.lower()
    page_text = driver.execute_script("return document.body.innerText").lower()
    
    if any(word in current_url for word in ['contact', 'get-in-touch', 'reach', 'touch']):
        print("      ✅ Already on contact page")
        return True
    
    # Look for contact page links
    contact_keywords = [
        'contact us', 'contact', 'get in touch', 'reach us', 'touch', 
        'get in contact', 'contact form', 'reach out', 'write to us',
        'contacto', 'contáctanos', 'contactanos', 'contato'
    ]
    
    try:
        # Method 1: Look for links with contact-related text
        for keyword in contact_keywords:
            try:
                # Try exact text match
                links = driver.find_elements(By.XPATH, 
                    f"//a[contains(translate(text(),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'{keyword}')]")
                
                for link in links:
                    if link.is_displayed():
                        href = link.get_attribute('href')
                        if href and 'mailto:' not in href and 'tel:' not in href:
                            print(f"      ✅ Found contact link: {link.text}")
                            driver.execute_script("arguments[0].scrollIntoView({block:'center'});", link)
                            time.sleep(0.5)
                            try:
                                link.click()
                            except:
                                driver.execute_script("arguments[0].click();", link)
                            time.sleep(3)
                            return True
            except:
                continue
        
        # Method 2: Look for links with contact-related href
        try:
            contact_links = driver.find_elements(By.XPATH, 
                "//a[contains(translate(@href,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'contact') or "
                "contains(translate(@href,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'touch') or "
                "contains(translate(@href,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'reach')]")
            
            for link in contact_links:
                if link.is_displayed():
                    href = link.get_attribute('href')
                    if href and 'mailto:' not in href and 'tel:' not in href:
                        print(f"      ✅ Found contact page via href")
                        driver.execute_script("arguments[0].scrollIntoView({block:'center'});", link)
                        time.sleep(0.5)
                        try:
                            link.click()
                        except:
                            driver.execute_script("arguments[0].click();", link)
                        time.sleep(3)
                        return True
        except:
            pass
        
        # Method 3: Check navigation menu
        try:
            nav_links = driver.find_elements(By.XPATH, "//nav//a | //header//a | //menu//a")
            for link in nav_links:
                link_text = link.text.lower()
                if any(word in link_text for word in ['contact', 'touch', 'reach']):
                    href = link.get_attribute('href')
                    if href and 'mailto:' not in href and 'tel:' not in href:
                        print(f"      ✅ Found contact in navigation: {link.text}")
                        driver.execute_script("arguments[0].scrollIntoView({block:'center'});", link)
                        time.sleep(0.5)
                        try:
                            link.click()
                        except:
                            driver.execute_script("arguments[0].click();", link)
                        time.sleep(3)
                        return True
        except:
            pass
            
    except Exception as e:
        print(f"      ⚠️ Error finding contact page: {e}")
    
    print("      ℹ️ No contact page link found, staying on current page")
    return False

def find_contact_form():
    """Find contact form on the page using multiple strategies"""
    print("   🔍 Searching for contact form...")
    
    contact_keywords = ['contact', 'inquiry', 'enquiry', 'message', 'reach', 'touch', 'quote', 'request']
    negative_keywords = ['login', 'log-in', 'signin', 'sign-in', 'signup', 'sign-up', 'register', 'newsletter', 'subscribe', 'search', 'password']
    
    try:
        forms = driver.find_elements(By.TAG_NAME, "form")
        
        if len(forms) == 0:
            print("      ⚠️ No forms found on page")
            return None
        
        print(f"      Found {len(forms)} form(s) on page")

        ranked_forms = []
        for idx, form in enumerate(forms):
            form_html = form.get_attribute('outerHTML').lower()
            form_id = form.get_attribute('id') or ''
            form_class = form.get_attribute('class') or ''
            form_action = form.get_attribute('action') or ''
            form_text = f"{form_id} {form_class} {form_action} {form_html[:4000]}".lower()
            field_count = len(form.find_elements(By.XPATH, ".//input | .//textarea | .//select"))
            textarea_count = len(form.find_elements(By.TAG_NAME, "textarea"))
            email_fields = form.find_elements(By.XPATH, ".//input[contains(translate(@type,'EMAIL','email'),'email') or contains(translate(@name,'EMAIL','email'),'email')]")
            password_fields = form.find_elements(By.XPATH, ".//input[@type='password' or contains(translate(@name,'PASSWORD','password'),'password') or contains(translate(@id,'PASSWORD','password'),'password')]")
            submit_controls = form.find_elements(By.XPATH, ".//button | .//input[@type='submit'] | .//input[@type='button']")

            score = 0
            if any(keyword in form_text for keyword in contact_keywords):
                score += 12
            if email_fields:
                score += 4
            if textarea_count:
                score += 6
            if field_count >= 3:
                score += min(field_count, 8)
            if submit_controls:
                score += 3

            if any(keyword in form_text for keyword in negative_keywords):
                score -= 12
            if password_fields:
                score -= 15
            if field_count <= 2 and textarea_count == 0:
                score -= 6

            print(f"      Form {idx+1}: {field_count} fields, ID='{form_id}', Action='{form_action}'")
            print(f"         score={score}, email={len(email_fields)}, textarea={textarea_count}, password={len(password_fields)}")
            ranked_forms.append((score, field_count, form))

        ranked_forms.sort(key=lambda item: (item[0], item[1]), reverse=True)
        best_score, best_field_count, best_form = ranked_forms[0]

        if best_score <= 0:
            print("      ⚠️ No strong contact-form candidate found")
            return None

        print(f"      ✅ Selected best form candidate (score={best_score}, fields={best_field_count})")
        return best_form
            
    except Exception as e:
        print(f"      ⚠️ Error finding form: {e}")
    
    return None

def safe_type(elem, value):
    """Safely type into an element with multiple attempts"""
    try:
        # Remove readonly attribute
        driver.execute_script("arguments[0].removeAttribute('readonly');", elem)
        driver.execute_script("arguments[0].removeAttribute('disabled');", elem)
        
        # Clear field
        elem.clear()
        time.sleep(0.2)
        
        # Type value
        elem.send_keys(value)
        time.sleep(0.2)
        
        # Verify value was entered
        entered_value = elem.get_attribute('value')
        if entered_value and len(entered_value) > 0:
            return True
        
        # Try JavaScript if normal typing failed
        driver.execute_script("arguments[0].value = arguments[1];", elem, value)
        driver.execute_script("arguments[0].dispatchEvent(new Event('input', { bubbles: true }));", elem)
        driver.execute_script("arguments[0].dispatchEvent(new Event('change', { bubbles: true }));", elem)
        return True
    except Exception as e:
        return False

def normalize_token(value):
    return re.sub(r"[^a-z0-9]+", "", (value or "").lower())

PHONE_KEYWORDS = [
    "phone", "phone number", "mobile", "mobile number", "telephone", "tel",
    "contact number", "contact no", "contact no.", "contact#", "cell",
    "cellphone", "cell phone", "whatsapp", "whatsapp number", "phone no",
    "phone no.", "mobile no", "mobile no.", "number"
]

MESSAGE_KEYWORDS = [
    "message", "your message", "comments", "comment", "inquiry", "enquiry",
    "description", "details", "project details", "requirements", "notes",
    "how can we help", "how may we help", "tell us about", "additional information"
]

def get_field_metadata(el):
    parts = [
        el.get_attribute('name'),
        el.get_attribute('id'),
        el.get_attribute('placeholder'),
        el.get_attribute('aria-label'),
        el.get_attribute('type'),
    ]
    return " ".join(filter(None, parts)).lower()

def get_field_key(el):
    return "|".join([
        el.tag_name.lower(),
        el.get_attribute('name') or "",
        el.get_attribute('id') or "",
        el.get_attribute('type') or "",
    ])

def keyword_match_score(el, keywords):
    metadata = get_field_metadata(el)
    normalized_metadata = normalize_token(metadata)
    score = 0

    for kw in keywords:
        kw_lower = kw.lower()
        kw_normalized = normalize_token(kw)

        if kw_lower and kw_lower in metadata:
            score += 3
        if kw_normalized and kw_normalized in normalized_metadata:
            score += 4

    name = (el.get_attribute('name') or "").lower()
    el_id = (el.get_attribute('id') or "").lower()
    placeholder = (el.get_attribute('placeholder') or "").lower()

    for kw in keywords[:3]:
        kw_lower = kw.lower()
        kw_normalized = normalize_token(kw)
        if kw_lower and name == kw_lower:
            score += 10
        if kw_normalized and normalize_token(name) == kw_normalized:
            score += 12
        if kw_lower and el_id == kw_lower:
            score += 8
        if kw_normalized and normalize_token(el_id) == kw_normalized:
            score += 10
        if kw_lower and placeholder == kw_lower:
            score += 5

    return score

def select_country_code_in_element(el):
    """Try to select +1 US in any type of country code element."""
    tag = el.tag_name.lower()
    el_type = (el.get_attribute('type') or '').lower()

    # --- SELECT dropdown ---
    if tag == 'select':
        from selenium.webdriver.support.ui import Select as SeleniumSelect
        try:
            sel = SeleniumSelect(el)
            # Try by value first
            for val in ['+1', '1', 'US', 'us', 'USA', 'usa', 'United States']:
                try:
                    sel.select_by_value(val)
                    print(f"      ✓ Selected country code by value: {val}")
                    return True
                except Exception:
                    pass
            # Try by visible text
            for opt in el.find_elements(By.TAG_NAME, 'option'):
                txt = (opt.text or '').strip()
                val = (opt.get_attribute('value') or '').strip()
                if any(x in txt for x in ['+1', 'United States', 'USA', 'US']) or \
                   any(x in val for x in ['+1', '1', 'US', 'USA']):
                    opt.click()
                    print(f"      ✓ Selected country code option: {txt}")
                    return True
        except Exception:
            pass

    # --- Custom flag/dropdown (div/span/li/ul trigger) ---
    # Many intl-tel-input or similar widgets use a flag div
    # Try clicking the flag container then selecting US
    try:
        parent = driver.execute_script("return arguments[0].parentElement;", el)
        if parent:
            # Look for flag/trigger button near this element
            flag_triggers = driver.execute_script("""
                var el = arguments[0];
                var parent = el.parentElement;
                for (var i = 0; i < 4; i++) {
                    if (!parent) break;
                    var triggers = parent.querySelectorAll(
                        '.iti__flag-container, .flag-dropdown, .country-flag, "
                        "[class*=flag], [class*=country], .iti__selected-flag, "
                        "[class*=dial], [class*=code], .phone-code'
                    );
                    if (triggers.length > 0) return Array.from(triggers);
                    parent = parent.parentElement;
                }
                return [];
            """, el)

            for trigger in (flag_triggers or []):
                try:
                    driver.execute_script("arguments[0].click();", trigger)
                    time.sleep(0.8)
                    # Now look for US option in dropdown list
                    us_options = driver.find_elements(By.XPATH,
                        "//*[contains(@class,'country') or contains(@class,'option') or contains(@class,'item')]"
                        "[contains(text(),'+1') or contains(text(),'United States') or "
                        "contains(@data-dial-code,'1') or contains(@data-country-code,'us')]")
                    for opt in us_options:
                        if opt.is_displayed():
                            driver.execute_script("arguments[0].click();", opt)
                            print("      ✓ Selected +1 US from custom flag dropdown")
                            return True
                    # Close dropdown if nothing matched
                    driver.execute_script("arguments[0].click();", trigger)
                except Exception:
                    pass
    except Exception:
        pass

    # --- Plain text input ---
    if tag == 'input':
        if safe_type(el, contact['phone_country_code']):
            print(f"      ✓ Typed country code: {contact['phone_country_code']}")
            return True

    return False


def fill_phone_fields(form_context, used_fields=None):
    """Handle phone country-code widget + number field."""
    used_fields = used_fields if used_fields is not None else set()
    code_filled = False

    # ---- STEP A: explicit country-code input/select (compound tokens only) ----
    CODE_TOKENS = [
        'countrycode', 'country_code', 'country-code', 'dialcode', 'dial_code',
        'dial-code', 'callingcode', 'calling_code', 'phonecode', 'phone_code',
        'mobilecode', 'isd', 'isdcode', 'isd_code', 'intlcode', 'intl_code',
    ]
    try:
        for el in form_context.find_elements(By.CSS_SELECTOR, "input, select"):
            if not el.is_displayed() or not el.is_enabled():
                continue
            if get_field_key(el) in used_fields:
                continue
            meta = " ".join(filter(None, [
                el.get_attribute('name'), el.get_attribute('id'),
                el.get_attribute('placeholder'), el.get_attribute('aria-label'),
                el.get_attribute('class'),
            ])).lower()
            if not any(tok in meta for tok in CODE_TOKENS):
                continue
            driver.execute_script("arguments[0].scrollIntoView({block:'center'});", el)
            time.sleep(0.3)
            if select_country_code_in_element(el):
                used_fields.add(get_field_key(el))
                code_filled = True
                break
    except Exception:
        pass

    # ---- STEP B: intl-tel-input flag button ----
    if not code_filled:
        try:
            for btn in form_context.find_elements(By.CSS_SELECTOR,
                    ".iti__flag-container, .iti__selected-flag, .flag-dropdown, "
                    "[class*='selected-flag'], [class*='flag-container']"):
                if not btn.is_displayed():
                    continue
                driver.execute_script("arguments[0].click();", btn)
                time.sleep(0.8)
                us_opts = driver.find_elements(By.CSS_SELECTOR,
                    "[data-country-code='us'], [data-dial-code='1'], .iti__country[data-country-code='us']")
                if not us_opts:
                    us_opts = driver.find_elements(By.XPATH,
                        "//*[contains(@class,'country') or contains(@class,'option')]"
                        "[contains(text(),'United States') or contains(text(),'+1')]")
                for opt in us_opts:
                    if opt.is_displayed():
                        driver.execute_script("arguments[0].click();", opt)
                        print("      ✓ Selected +1 US via intl-tel-input")
                        code_filled = True
                        break
                if not code_filled:
                    driver.execute_script("arguments[0].click();", btn)  # close
                else:
                    break
        except Exception:
            pass

    # ---- STEP C: fill number field ----
    phone_value = contact["phone_local"] if code_filled else contact["phone"]
    number_filled = field_filler(
        PHONE_KEYWORDS, phone_value,
        form_context=form_context, field_type="tel", used_fields=used_fields
    )
    return code_filled or number_filled

def remove_overlays():
    selectors = [
        "#CybotCookiebotDialog", ".cookie", ".cky-consent-bar",
        "div[class*='cookie']", "button[aria-label*='Accept']"
    ]
    for s in selectors:
        try:
            driver.execute_script(
                "document.querySelectorAll(arguments[0]).forEach(e => e.remove());", s)
        except Exception:
            pass

def field_matches_type(el, field_type):
    """Allow loose matching because many forms have broken markup."""
    if not field_type:
        return True

    el_type = (el.get_attribute('type') or 'text').lower()
    metadata = " ".join(filter(None, [
        el.get_attribute('name'),
        el.get_attribute('id'),
        el.get_attribute('placeholder'),
        el.get_attribute('aria-label')
    ])).lower()

    if field_type == 'email':
        return el_type == 'email' or 'email' in metadata or 'e-mail' in metadata or 'mail' in metadata
    if field_type == 'tel':
        inputmode = (el.get_attribute('inputmode') or '').lower()
        autocomplete = (el.get_attribute('autocomplete') or '').lower()
        return (
            el_type in ['tel', 'phone', 'number'] or
            inputmode in ['tel', 'numeric', 'decimal'] or
            autocomplete in ['tel', 'tel-national', 'tel-country-code'] or
            any(token in metadata for token in PHONE_KEYWORDS)
        )
    if field_type == 'url':
        url_tokens = ['website', 'url', 'site', 'web']
        return el_type == 'url' or any(token in metadata for token in url_tokens)

    return True

def get_invalid_fields(form_context):
    """Return visible invalid fields and the browser validation message."""
    invalid_fields = []
    try:
        elements = form_context.find_elements(By.CSS_SELECTOR, "input, textarea, select")
        for el in elements:
            if not el.is_displayed():
                continue
            is_valid = driver.execute_script("return arguments[0].checkValidity();", el)
            if is_valid:
                continue
            invalid_fields.append({
                "field": el.get_attribute('name') or el.get_attribute('id') or el.get_attribute('placeholder') or el.tag_name,
                "message": driver.execute_script("return arguments[0].validationMessage;", el)
            })
    except Exception:
        pass
    return invalid_fields

# Strict field family definitions — each family owns exclusive tokens
FIELD_FAMILIES = {
    "first_name":  {"tokens": ["firstname", "first_name", "first-name", "fname", "given", "forename"],
                   "blocks":  ["last", "surname", "email", "phone", "company", "message", "subject", "url", "website"]},
    "last_name":   {"tokens": ["lastname", "last_name", "last-name", "lname", "surname", "family"],
                   "blocks":  ["first", "fname", "email", "phone", "company", "message", "subject", "url", "website"]},
    "full_name":   {"tokens": ["fullname", "full_name", "full-name", "yourname", "contactname", "your_name", "name"],
                   "blocks":  ["email", "phone", "company", "message", "subject", "url", "website", "first", "last", "user", "login"]},
    "email":       {"tokens": ["email", "e-mail", "mail", "emailaddress", "email_address", "your_email"],
                   "blocks":  ["phone", "mobile", "tel", "company", "name", "message", "subject", "url", "website", "password", "confirm"]},
    "phone":       {"tokens": ["phone", "mobile", "tel", "telephone", "cellphone", "phonenumber", "phone_number",
                               "mobilenumber", "contactnumber", "whatsapp"],
                   "blocks":  ["email", "company", "name", "message", "subject", "url", "website", "fax", "code", "country"]},
    "company":     {"tokens": ["company", "companyname", "company_name", "organization", "organisation", "business", "firm"],
                   "blocks":  ["email", "phone", "name", "message", "subject", "url", "website"]},
    "website":     {"tokens": ["website", "webaddress", "web_address", "siteurl", "site_url", "yourwebsite"],
                   "blocks":  ["email", "phone", "name", "message", "subject", "company"]},
    "subject":     {"tokens": ["subject", "topic", "regarding", "re", "inquiry_subject", "enquiry_subject"],
                   "blocks":  ["email", "phone", "name", "message", "company", "url", "website"]},
    "job":         {"tokens": ["jobtitle", "job_title", "job-title", "designation", "position", "role"],
                   "blocks":  ["email", "phone", "name", "message", "company", "url", "website", "subject"]},
    "message":     {"tokens": ["message", "yourmessage", "your_message", "comment", "comments", "inquiry",
                               "enquiry", "description", "details", "notes", "body", "content", "requirements"],
                   "blocks":  ["email", "phone", "name", "company", "url", "website", "subject"]},
    "address":     {"tokens": ["address", "streetaddress", "street_address", "location", "city", "state", "country", "region"],
                   "blocks":  ["email", "phone", "name", "company", "url", "website", "message"]},
    "budget":      {"tokens": ["budget", "projectbudget", "investment", "amount", "price"],
                   "blocks":  ["email", "phone", "name", "company", "url", "website", "message"]},
}

def get_family_for_keywords(keywords):
    kw_set = set(normalize_token(k) for k in keywords)
    for family, cfg in FIELD_FAMILIES.items():
        if any(normalize_token(t) in kw_set for t in cfg["tokens"]):
            return family
    return None

def field_is_blocked(field_metadata, keywords):
    """
    Returns True if the field metadata contains tokens that belong
    to a DIFFERENT family than the one we are trying to fill.
    This prevents e.g. filling 'email' value into a 'name' field.
    """
    family = get_family_for_keywords(keywords)
    if not family:
        return False
    cfg = FIELD_FAMILIES[family]
    meta = normalize_token(field_metadata)
    for block_token in cfg["blocks"]:
        if normalize_token(block_token) in meta:
            return True
    return False

def _do_fill(el, value, keywords, field_type, used_fields, label_hint=""):
    """Core fill logic shared by all methods. Returns True on success."""
    try:
        if not el.is_displayed() or not el.is_enabled():
            return False
        if get_field_key(el) in used_fields:
            return False
        if not field_matches_type(el, field_type):
            return False
        field_metadata = " ".join(filter(None, [
            el.get_attribute('name'), el.get_attribute('id'),
            el.get_attribute('placeholder'), el.get_attribute('aria-label'),
        ]))
        if field_is_blocked(field_metadata, keywords):
            return False
        current = (el.get_attribute('value') or '').strip()
        if current and current != value.strip():
            return False
        driver.execute_script("arguments[0].scrollIntoView({block:'center'});", el)
        time.sleep(0.3)
        if safe_type(el, value):
            lbl = label_hint or el.get_attribute('name') or el.get_attribute('id') or el.get_attribute('placeholder') or el.tag_name
            used_fields.add(get_field_key(el))
            print(f"      ✓ Filled [{lbl}]")
            return True
    except Exception:
        pass
    return False


def field_filler(keywords, value, tag="input", form_context=None, field_type=None, used_fields=None):
    """Fill the right field using keyword match → label match → positional fallback."""
    used_fields = used_fields if used_fields is not None else set()
    search_context = form_context if form_context else driver

    # --- Method 1: attribute keyword match (name/id/placeholder/aria-label) ---
    xpath_conditions = []
    for kw in keywords:
        kw_l = kw.lower()
        for attr in ['@name', '@id', '@placeholder', '@aria-label']:
            xpath_conditions.append(
                f"contains(translate({attr},'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'{kw_l}')"
            )
    xpath = f".//{tag}[" + " or ".join(xpath_conditions) + "]"
    try:
        elements = search_context.find_elements(By.XPATH, xpath)
        for el in sorted(elements, key=lambda e: keyword_match_score(e, keywords), reverse=True):
            if keyword_match_score(el, keywords) > 0 and _do_fill(el, value, keywords, field_type, used_fields):
                return True
    except Exception:
        pass

    # --- Method 2: label text match → find associated input by for= or sibling ---
    for kw in keywords:
        try:
            labels = search_context.find_elements(By.XPATH,
                f".//label[contains(translate(.,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'{kw.lower()}')]")
            for lbl in labels:
                lbl_text = (lbl.text or '').strip()
                if field_is_blocked(lbl_text, keywords):
                    continue
                # Try for= attribute
                for_id = lbl.get_attribute('for')
                if for_id:
                    try:
                        el = driver.find_element(By.ID, for_id)
                        if el.tag_name.lower() == tag and _do_fill(el, value, keywords, field_type, used_fields, lbl_text):
                            return True
                    except Exception:
                        pass
                # Try next sibling input/textarea
                try:
                    el = lbl.find_element(By.XPATH, f"following-sibling::{tag}[1]")
                    if _do_fill(el, value, keywords, field_type, used_fields, lbl_text):
                        return True
                except Exception:
                    pass
                # Try parent container's first input/textarea
                try:
                    parent = driver.execute_script("return arguments[0].parentElement;", lbl)
                    if parent:
                        el = parent.find_element(By.TAG_NAME, tag)
                        if _do_fill(el, value, keywords, field_type, used_fields, lbl_text):
                            return True
                except Exception:
                    pass
        except Exception:
            pass

    # --- Method 3: positional fallback for textarea (any unfilled visible textarea) ---
    if tag == "textarea":
        try:
            for el in search_context.find_elements(By.TAG_NAME, "textarea"):
                if _do_fill(el, value, keywords, field_type, used_fields, "textarea-fallback"):
                    return True
        except Exception:
            pass

    return False

def click_if_present(selectors):
    for s in selectors:
        try:
            e = driver.find_element(By.CSS_SELECTOR, s)
            driver.execute_script("arguments[0].click();", e)
        except Exception:
            continue

def captcha_present(form_context=None):
    search_context = form_context if form_context else driver
    selectors = [
        ".g-recaptcha",
        "iframe[src*='recaptcha']",
        "textarea[name='g-recaptcha-response']",
        "iframe[title*='hCaptcha']",
        "iframe[src*='hcaptcha']",
        "[data-sitekey]",
        ".h-captcha",
        ".cf-turnstile",
        "iframe[src*='turnstile']",
    ]
    try:
        for selector in selectors:
            elements = search_context.find_elements(By.CSS_SELECTOR, selector)
            if any(el.is_displayed() for el in elements):
                return True
    except Exception:
        pass
    return False

def captcha_solved(form_context=None):
    try:
        responses = driver.find_elements(By.CSS_SELECTOR, "textarea[name='g-recaptcha-response'], textarea[name='h-captcha-response'], input[name='cf-turnstile-response']")
        for el in responses:
            value = (el.get_attribute("value") or "").strip()
            if value:
                return True
    except Exception:
        pass

    return not captcha_present(form_context)

def wait_for_captcha(form_context=None, timeout=CAPTCHA_WAIT_TIMEOUT):
    if not captcha_present(form_context):
        return True

    print(f"   🔐 CAPTCHA detected. Waiting up to {timeout}s for manual solve...")
    deadline = time.time() + timeout
    while time.time() < deadline:
        if captcha_solved(form_context):
            print("      ✅ CAPTCHA solved")
            return True
        time.sleep(2)

    print("   ⏭️ CAPTCHA not solved in time, skipping site")
    return False

def detect_success():
    """Detects thank-you messages, redirects, or form disappearance."""
    indicators = [
        "thank", "thanks", "success", "submitted", "submit successfully",
        "sent", "message sent", "we will", "received", "enquiry received"
    ]
    start_url = driver.current_url
    for _ in range(12):
        time.sleep(1)
        text = driver.execute_script("return document.body.innerText").lower()
        if any(i in text for i in indicators):
            return True
        try:
            result_text = driver.find_element(By.ID, "result").text.strip().lower()
            if any(i in result_text for i in indicators):
                return True
        except NoSuchElementException:
            pass
        try:
            success_nodes = driver.find_elements(
                By.CSS_SELECTOR,
                ".wpcf7-response-output, .wpcf7-mail-sent-ok, .wpcf7-not-valid-tip, .alert-success, .elementor-message-success"
            )
            for node in success_nodes:
                node_text = node.text.strip().lower()
                if any(i in node_text for i in indicators):
                    return True
        except Exception:
            pass
        if driver.current_url != start_url:
            return True
        try:
            driver.find_element(By.TAG_NAME, "form")
        except NoSuchElementException:
            return True
    return False

# -----------------------------
# 5) MAIN AUTOMATION
# -----------------------------

# Resume from last saved progress
start_index = 0
if os.path.exists(PROGRESS_FILE):
    with open(PROGRESS_FILE) as f:
        val = f.read().strip()
        if val.isdigit():
            start_index = int(val)
            print(f"▶️  Resuming from URL #{start_index + 1}")

# Load existing results if resuming
results = []
if start_index > 0 and os.path.exists(CSV_PATH):
    with open(CSV_PATH, newline="", encoding="utf-8") as f:
        results = list(csv.DictReader(f))

for idx, url in enumerate(urls):
    if idx < start_index:
        continue
    record = {
        "url": url,
        "status": "Failed",
        "details": "",
        "load_status": "",
        "load_time_s": "",
        "contact_page_status": "",
        "form_status": "",
        "fields_filled": "",
        "validation_status": "",
        "captcha_status": "",
        "submit_status": "",
        "success_status": "",
    }
    print(f"\n🟢 [{idx+1}/{len(urls)}] Visiting: {url}")

    # Restart Chrome if it crashed
    if not is_driver_alive():
        restart_driver()

    try:
        load_started_at = time.time()
        driver.get(url)
        load_seconds = time.time() - load_started_at
        record["load_status"] = "Loaded"
        record["load_time_s"] = f"{load_seconds:.1f}"
        if load_seconds > PAGE_LOAD_TIMEOUT:
            print(f"   ⏭️ Skipping slow site ({load_seconds:.1f}s to load)")
            record["status"] = "Skipped"
            record["details"] = f"Slow site skipped after {load_seconds:.1f}s load"
            record["load_status"] = "Slow"
            results.append(record)
            continue
        time.sleep(random.uniform(3, 5))
        remove_overlays()

        # STEP 1: FIND AND NAVIGATE TO CONTACT PAGE
        contact_page_found = find_contact_page()
        record["contact_page_status"] = "Opened" if contact_page_found else "Not found / stayed on current page"
        time.sleep(2)
        remove_overlays()

        # STEP 2: FIND CONTACT FORM
        contact_form = find_contact_form()
        
        if not contact_form:
            print("   ❌ No contact form found on this page")
            record["details"] = "No contact form detected"
            record["form_status"] = "Not found"
            results.append(record)
            continue
        record["form_status"] = "Found"
        
        # STEP 3: FILL ALL FIELDS WITHIN THE FORM
        print("   📝 Filling form fields...")
        filled_count = 0
        used_fields = set()

        # First name
        if field_filler(["firstname", "first_name", "first-name", "fname", "given", "forename"],
                        contact["first_name"], form_context=contact_form, used_fields=used_fields):
            filled_count += 1

        # Last name
        if field_filler(["lastname", "last_name", "last-name", "lname", "surname", "family"],
                        contact["last_name"], form_context=contact_form, used_fields=used_fields):
            filled_count += 1

        # Full name (only if first+last not separately filled)
        if field_filler(["fullname", "full_name", "full-name", "yourname", "your_name", "contactname", "name"],
                        contact["full_name"], form_context=contact_form, used_fields=used_fields):
            filled_count += 1

        # Email
        if field_filler(["email", "e-mail", "mail", "emailaddress", "email_address", "your_email"],
                        contact["email"], form_context=contact_form, field_type="email", used_fields=used_fields):
            filled_count += 1
            print("      ✅ EMAIL FILLED")
        else:
            print("      ⚠️ EMAIL NOT FILLED")

        # Phone (country code + number handled inside)
        if fill_phone_fields(contact_form, used_fields=used_fields):
            filled_count += 1

        # Company
        if field_filler(["company", "companyname", "company_name", "organization", "organisation", "business", "firm"],
                        contact["company"], form_context=contact_form, used_fields=used_fields):
            filled_count += 1

        # Website
        if field_filler(["website", "webaddress", "web_address", "siteurl", "site_url", "yourwebsite"],
                        contact["website"], form_context=contact_form, field_type="url", used_fields=used_fields):
            filled_count += 1

        # Subject
        if field_filler(["subject", "topic", "regarding", "inquiry_subject", "enquiry_subject"],
                        contact["subject"], form_context=contact_form, used_fields=used_fields):
            filled_count += 1

        # Job title
        if field_filler(["jobtitle", "job_title", "job-title", "designation", "position", "role"],
                        contact["job_title"], form_context=contact_form, used_fields=used_fields):
            filled_count += 1

        # Budget (optional)
        field_filler(["budget", "projectbudget", "investment", "amount"],
                     contact["budget"], form_context=contact_form, used_fields=used_fields)

        # Address (optional)
        field_filler(["address", "streetaddress", "street_address", "location", "city"],
                     contact["address"], form_context=contact_form, used_fields=used_fields)

        # Message — textarea first, then input
        msg_kw = ["message", "yourmessage", "your_message", "comment", "comments",
                  "inquiry", "enquiry", "description", "details", "notes", "body", "requirements"]
        if field_filler(msg_kw, contact["message"], tag="textarea",
                        form_context=contact_form, used_fields=used_fields):
            filled_count += 1
            print("      ✅ MESSAGE FILLED")
        elif field_filler(msg_kw, contact["message"], tag="input",
                          form_context=contact_form, used_fields=used_fields):
            filled_count += 1
            print("      ✅ MESSAGE FILLED")

        print(f"   ✅ Filled {filled_count} fields")
        record["fields_filled"] = str(filled_count)
        
        if filled_count == 0:
            print("   ⚠️ WARNING: No fields were filled! Form may not be detected.")
            record["details"] = "No form fields detected"
            results.append(record)
            continue

        invalid_before_submit = get_invalid_fields(contact_form)
        if invalid_before_submit:
            print("   ⚠️ Browser validation will block submit:")
            for invalid in invalid_before_submit:
                print(f"      - {invalid['field']}: {invalid['message']}")
            record["validation_status"] = "; ".join(
                f"{invalid['field']}: {invalid['message']}" for invalid in invalid_before_submit
            )
        else:
            record["validation_status"] = "OK"

        if not wait_for_captcha(contact_form):
            record["status"] = "Skipped"
            record["details"] = f"CAPTCHA not solved within {CAPTCHA_WAIT_TIMEOUT}s"
            record["captcha_status"] = f"Not solved within {CAPTCHA_WAIT_TIMEOUT}s"
            results.append(record)
            continue
        record["captcha_status"] = "Not present or solved"

        # STEP 4: Handle checkboxes (consent, terms, privacy, etc.)
        print("   ☑️  Handling checkboxes...")
        checkbox_count = 0
        try:
            checkboxes = contact_form.find_elements(By.CSS_SELECTOR, "input[type='checkbox']")
            for cb in checkboxes:
                if cb.is_displayed() and not cb.is_selected():
                    try:
                        driver.execute_script("arguments[0].scrollIntoView({block:'center'});", cb)
                        time.sleep(0.2)
                        driver.execute_script("arguments[0].click();", cb)
                        checkbox_count += 1
                    except:
                        pass
            if checkbox_count > 0:
                print(f"      ✓ Checked {checkbox_count} checkboxes")
        except:
            pass
        
        # Wait a moment for any dynamic form updates
        time.sleep(1)

        # STEP 5: Submit form with enhanced detection
        print("   🚀 Looking for submit button...")
        submitted = False
        last_submit_error = None
        
        # Method 1: Button text patterns (most common)
        submit_patterns = ["send", "submit", "contact", "enviar", "request", "inquiry", "enquiry", "get", "start", "apply", "go", "continue"]
        for pat in submit_patterns:
            if submitted:
                break
            try:
                buttons = contact_form.find_elements(By.XPATH, 
                    f".//button[contains(translate(text(),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'{pat}')]")
                for btn in buttons:
                    if btn.is_displayed() and btn.is_enabled():
                        try:
                            driver.execute_script("arguments[0].scrollIntoView({block:'center'});", btn)
                            time.sleep(0.5)
                            # Try multiple click methods
                            try:
                                btn.click()
                            except Exception as e:
                                last_submit_error = f"{type(e).__name__}: {e}"
                                driver.execute_script("arguments[0].click();", btn)
                            print(f"      ✓ Clicked button: {btn.text}")
                            submitted = True
                            record["submit_status"] = f"Clicked button: {btn.text.strip() or '[no text]'}"
                            break
                        except Exception as e:
                            last_submit_error = f"{type(e).__name__}: {e}"
                            continue
            except Exception as e:
                last_submit_error = f"{type(e).__name__}: {e}"
                continue
        
        # Method 2: Input type submit
        if not submitted:
            try:
                submits = contact_form.find_elements(By.XPATH, ".//input[@type='submit']")
                for btn in submits:
                    if btn.is_displayed():
                        try:
                            driver.execute_script("arguments[0].scrollIntoView({block:'center'});", btn)
                            time.sleep(0.5)
                            try:
                                btn.click()
                            except Exception as e:
                                last_submit_error = f"{type(e).__name__}: {e}"
                                driver.execute_script("arguments[0].click();", btn)
                            print(f"      ✓ Clicked submit input: {btn.get_attribute('value')}")
                            submitted = True
                            record["submit_status"] = f"Clicked submit input: {btn.get_attribute('value') or '[no value]'}"
                            break
                        except Exception as e:
                            last_submit_error = f"{type(e).__name__}: {e}"
                            continue
            except Exception as e:
                last_submit_error = f"{type(e).__name__}: {e}"
                pass
        
        # Method 3: Button type submit
        if not submitted:
            try:
                submits = contact_form.find_elements(By.XPATH, ".//button[@type='submit']")
                for btn in submits:
                    if btn.is_displayed():
                        try:
                            driver.execute_script("arguments[0].scrollIntoView({block:'center'});", btn)
                            time.sleep(0.5)
                            try:
                                btn.click()
                            except Exception as e:
                                last_submit_error = f"{type(e).__name__}: {e}"
                                driver.execute_script("arguments[0].click();", btn)
                            print(f"      ✓ Clicked submit button: {btn.text}")
                            submitted = True
                            record["submit_status"] = f"Clicked submit button: {btn.text.strip() or '[no text]'}"
                            break
                        except Exception as e:
                            last_submit_error = f"{type(e).__name__}: {e}"
                            continue
            except Exception as e:
                last_submit_error = f"{type(e).__name__}: {e}"
                pass
        
        # Method 4: Any button or input with submit-like attributes
        if not submitted:
            try:
                all_buttons = contact_form.find_elements(By.XPATH, ".//button | .//input[@type='button']")
                for btn in all_buttons:
                    btn_text = (btn.text or btn.get_attribute('value') or '').lower()
                    if any(word in btn_text for word in ['send', 'submit', 'contact', 'request']):
                        if btn.is_displayed():
                            try:
                                driver.execute_script("arguments[0].scrollIntoView({block:'center'});", btn)
                                time.sleep(0.5)
                                driver.execute_script("arguments[0].click();", btn)
                                print(f"      ✓ Clicked button (fallback): {btn_text}")
                                submitted = True
                                record["submit_status"] = f"Clicked fallback button: {btn_text or '[no text]'}"
                                break
                            except Exception as e:
                                last_submit_error = f"{type(e).__name__}: {e}"
                                continue
            except Exception as e:
                last_submit_error = f"{type(e).__name__}: {e}"
                pass

        # Verify result
        if submitted:
            print("   • Submit clicked, verifying response...")
            if detect_success():
                print("✅ Form submission verified successfully.")
                record["status"] = "Success"
                record["details"] = "Verified thank-you message or redirect"
                record["success_status"] = "Success detected"
            else:
                invalid_after_submit = get_invalid_fields(contact_form)
                if invalid_after_submit:
                    invalid_msg = "; ".join(
                        f"{invalid['field']}: {invalid['message']}" for invalid in invalid_after_submit
                    )
                    print(f"⚠️ Browser validation blocked submission: {invalid_msg}")
                    record["details"] = f"Validation blocked submission: {invalid_msg}"
                    record["validation_status"] = invalid_msg
                    record["success_status"] = "Blocked by validation"
                else:
                    try:
                        result_text = driver.find_element(By.ID, "result").text.strip()
                    except NoSuchElementException:
                        result_text = ""
                    if result_text:
                        print(f"⚠️ Form returned message: {result_text}")
                        record["details"] = f"Form returned message: {result_text}"
                        record["success_status"] = f"Result message: {result_text}"
                    else:
                        print("⚠️ No confirmation message after submission.")
                        record["details"] = "Clicked submit, no visible confirmation or result message"
                        record["success_status"] = "No confirmation detected"
                if is_driver_alive():
                    try:
                        driver.save_screenshot(os.path.join(OUTPUT_DIR, f"no_confirm_{int(time.time())}.png"))
                    except Exception:
                        pass
        else:
            if detect_success():
                print("✅ Form submission verified successfully.")
                record["status"] = "Success"
                record["details"] = "Success detected even though submit click was not tracked"
                record["submit_status"] = "Not tracked"
                record["success_status"] = "Success detected"
            else:
                if last_submit_error:
                    print(f"⚠️ Submit click failed: {last_submit_error}")
                    record["details"] = f"Submit click failed: {last_submit_error}"
                    record["submit_status"] = f"Failed: {last_submit_error}"
                else:
                    print("⚠️ No clickable submit button found.")
                    record["details"] = "No clickable submit button found"
                    record["submit_status"] = "No clickable submit button found"
                record["success_status"] = "No success detected"
                if is_driver_alive():
                    try:
                        driver.save_screenshot(os.path.join(OUTPUT_DIR, f"no_submit_{int(time.time())}.png"))
                    except Exception:
                        pass

    except TimeoutException:
        print(f"⏭️ Skipping slow site: page load exceeded {PAGE_LOAD_TIMEOUT}s")
        record["status"] = "Skipped"
        record["details"] = f"Page load timeout after {PAGE_LOAD_TIMEOUT}s"
        record["load_status"] = f"Timeout after {PAGE_LOAD_TIMEOUT}s"
        try:
            driver.execute_script("window.stop();")
        except Exception:
            pass
    except Exception as e:
        print(f"❌ Error on {url}: {e}")
        record["details"] = str(e)[:300]
        record["success_status"] = f"Exception: {type(e).__name__}"
        if is_driver_alive():
            try:
                driver.save_screenshot(os.path.join(OUTPUT_DIR, f"error_{int(time.time())}.png"))
            except Exception:
                pass

    results.append(record)

    # Save progress after every URL
    with open(CSV_PATH, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS)
        writer.writeheader()
        writer.writerows(results)
    with open(PROGRESS_FILE, "w") as f:
        f.write(str(idx + 1))

    time.sleep(random.uniform(2, 4))

# -----------------------------
# 6) EXPORT RESULTS
# -----------------------------
with open(CSV_PATH, "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=CSV_FIELDS)
    writer.writeheader()
    writer.writerows(results)

# Clear progress file on clean finish
if os.path.exists(PROGRESS_FILE):
    os.remove(PROGRESS_FILE)

print(f"\n🏁 All done! Results saved to {CSV_PATH}")
try:
    driver.quit()
except Exception:
    pass
