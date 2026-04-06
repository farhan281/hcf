"""
hcaptcha_sb_test.py — SeleniumBase CDP with gui_click_captcha
"""
from seleniumbase import sb_cdp
import time

print("🌐 Opening contact page...")
sb = sb_cdp.Chrome(
    "https://www.delicatedentalgroup.com/contact/",
    lang="en",
)
sb.sleep(5)

# Fill form
print("📝 Filling form...")
try:
    for el in sb.find_elements('input, textarea'):
        try:
            el_id   = el.attributes.get('id', '')
            el_name = el.attributes.get('name', '')
            el_type = el.attributes.get('type', 'text')
            el_tag  = el.tag_name.lower() if hasattr(el, 'tag_name') else ''
            ctx = (el_id + ' ' + el_name).lower()
            if el_type == 'tel' or 'phone' in ctx:
                el.click(); sb.sleep(0.2); sb.press_keys(el, "9913298992")
            elif el_type == 'email' or 'email' in ctx:
                el.click(); sb.sleep(0.2); sb.press_keys(el, "farhan.ansari@perceptionsystem.in")
            elif 'first' in ctx or '6.3' in ctx:
                el.click(); sb.sleep(0.2); sb.press_keys(el, "Farhan")
            elif 'last' in ctx or '6.6' in ctx:
                el.click(); sb.sleep(0.2); sb.press_keys(el, "Ansari")
            elif el_tag == 'textarea' or 'comment' in ctx or 'message' in ctx:
                el.click(); sb.sleep(0.2); sb.press_keys(el, "Hi Team, I came across your agency and would love to connect.")
        except: pass
    print("✅ Form filled")
except Exception as e:
    print("⚠️ Fill error:", str(e)[:80])

sb.sleep(2)

# Inject hCaptcha script
print("💉 Injecting hCaptcha script...")
sb.evaluate("""
    if (!document.querySelector('iframe[src*="hcaptcha"]')) {
        var s = document.createElement('script');
        s.src = 'https://js.hcaptcha.com/1/api.js';
        s.async = true;
        document.head.appendChild(s);
    }
""")
sb.sleep(4)

# Scroll to hCaptcha
print("🔍 Scrolling to hCaptcha...")
try:
    sb.scroll_into_view("h-captcha, .h-captcha")
    sb.sleep(2)
except: pass

# Click hCaptcha using gui_click_element (PyAutoGUI based — isTrusted=true)
print("🤖 Clicking hCaptcha with gui_click_element...")
clicked = False
try:
    iframe = sb.select('iframe[src*="hcaptcha"]')
    if iframe:
        sb.gui_click_element(iframe)
        print("   ✅ gui_click_element on iframe")
        clicked = True
except Exception as e:
    print("⚠️ gui_click_element error:", str(e)[:80])

if not clicked:
    try:
        sb.gui_click_captcha()
        print("   ✅ gui_click_captcha")
        clicked = True
    except Exception as e:
        print("⚠️ gui_click_captcha error:", str(e)[:80])

if not clicked:
    try:
        sb.click_captcha()
        print("   ✅ click_captcha")
    except Exception as e:
        print("⚠️ click_captcha error:", str(e)[:80])

# Wait for token
print("⏳ Waiting for hCaptcha token...")
for i in range(30):
    sb.sleep(2)
    try:
        token_len = sb.evaluate(
            "document.querySelector(\"[name='h-captcha-response']\")?.value?.length || 0"
        )
        if token_len > 10:
            print(f"✅ hCaptcha SOLVED! Token length: {token_len}")
            break
        if i % 5 == 4:
            print(f"   Still waiting... ({(i+1)*2}s) token={token_len}")
    except: pass
else:
    print("❌ Not solved in 60s")

sb.sleep(3)
sb.driver.stop()
