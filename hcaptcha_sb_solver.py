#!/usr/bin/env python3
"""
hcaptcha_sb_solver.py — Persistent SeleniumBase hCaptcha solver server.
Protocol: reads URL from stdin, writes token to stdout (line by line)
"""
import sys, time

sys.stderr.write("🔄 Starting SeleniumBase hCaptcha solver...\n")
sys.stderr.flush()

from seleniumbase import sb_cdp

def inject_and_wait(sb):
    """Inject hCaptcha script if needed and wait for iframe to appear."""
    # Scroll to hCaptcha widget first
    try:
        sb.scroll_into_view("h-captcha, .h-captcha, [data-hcaptcha-widget-id], iframe[src*='hcaptcha']")
        sb.sleep(1)
    except: pass

    # Check if iframe already present
    has_iframe = sb.evaluate("!!document.querySelector('iframe[src*=\"hcaptcha\"]')")
    if not has_iframe:
        sys.stderr.write("   💉 Injecting hCaptcha script...\n")
        sys.stderr.flush()
        sb.evaluate("""
            var el = document.querySelector('h-captcha,.h-captcha,[data-hcaptcha-widget-id]');
            if (el) el.scrollIntoView({block:'center'});
            if (!document.querySelector('iframe[src*="hcaptcha"]')) {
                var s = document.createElement('script');
                s.src = 'https://js.hcaptcha.com/1/api.js';
                s.async = true;
                document.head.appendChild(s);
            }
        """)
        # Wait up to 8s for iframe to appear
        for _ in range(16):
            sb.sleep(0.5)
            has_iframe = sb.evaluate("!!document.querySelector('iframe[src*=\"hcaptcha\"]')")
            if has_iframe:
                sys.stderr.write("   ✅ hCaptcha iframe appeared\n")
                sys.stderr.flush()
                break
    return has_iframe

def get_token(sb):
    """Check if hCaptcha token is present."""
    try:
        token = sb.evaluate(
            "document.querySelector(\"[name='h-captcha-response']\")?.value || ''"
        )
        return token if token and len(token) > 10 else None
    except:
        return None

def solve_hcaptcha(url: str) -> str:
    sb = None
    try:
        sb = sb_cdp.Chrome(url, lang="en")
        sb.sleep(5)

        # Inject and wait for iframe
        has_iframe = inject_and_wait(sb)
        if not has_iframe:
            sys.stderr.write("   ⚠️ No hCaptcha iframe found\n")
            sys.stderr.flush()

        sb.sleep(1)

        # Try solving up to 3 times
        for attempt in range(1, 4):
            sys.stderr.write(f"   🤖 Solve attempt {attempt}/3...\n")
            sys.stderr.flush()

            try:
                sb.gui_click_captcha()
            except Exception as e:
                sys.stderr.write(f"   ⚠️ gui_click_captcha: {str(e)[:60]}\n")
                sys.stderr.flush()
                # Try click_captcha as fallback
                try:
                    sb.click_captcha()
                except: pass

            # Wait up to 45s for token
            for i in range(22):
                sb.sleep(2)
                token = get_token(sb)
                if token:
                    sys.stderr.write(f"   ✅ Token obtained (len={len(token)}) attempt={attempt}\n")
                    sys.stderr.flush()
                    return token
                if i % 5 == 4:
                    sys.stderr.write(f"   ⏳ Waiting... ({(i+1)*2}s)\n")
                    sys.stderr.flush()

            sys.stderr.write(f"   ❌ Attempt {attempt} failed\n")
            sys.stderr.flush()

            if attempt < 3:
                # Re-inject and retry
                inject_and_wait(sb)
                sb.sleep(2)

        sys.stderr.write("❌ All attempts failed\n")
        sys.stderr.flush()
        return ""

    except Exception as e:
        sys.stderr.write(f"❌ Error: {e}\n")
        sys.stderr.flush()
        return ""
    finally:
        if sb:
            try: sb.driver.stop()
            except: pass

sys.stderr.write("✅ SeleniumBase hCaptcha solver ready\n")
sys.stderr.flush()

for line in sys.stdin:
    url = line.strip()
    if not url:
        print("", flush=True)
        continue
    sys.stderr.write(f"🌐 Solving: {url}\n")
    sys.stderr.flush()
    token = solve_hcaptcha(url)
    print(token, flush=True)
