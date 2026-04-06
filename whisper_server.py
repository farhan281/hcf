#!/usr/bin/env python3
import sys, re, os, ssl

ssl._create_default_https_context = ssl._create_unverified_context

sys.stderr.write("🔄 Loading Whisper tiny model...\n")
sys.stderr.flush()

try:
    import whisper
    model = whisper.load_model("tiny")
    sys.stderr.write("✅ Whisper model loaded\n")
    sys.stderr.flush()
except Exception as e:
    sys.stderr.write(f"❌ Whisper load failed: {e}\n")
    sys.stderr.flush()
    sys.exit(1)

try:
    from pydub import AudioSegment
    HAS_PYDUB = True
except ImportError:
    HAS_PYDUB = False

DIGIT_WORDS = {
    'zero':'0','one':'1','two':'2','three':'3','four':'4',
    'five':'5','six':'6','seven':'7','eight':'8','nine':'9',
    'to':'2','too':'2','for':'4','ate':'8','won':'1','tree':'3',
    'sex':'6','nein':'9','oh':'0',
    # do NOT map 'o' → '0' (causes false positives in normal words)
}

def extract_digits(text):
    text = text.lower().strip()
    words = re.split(r'[\s,\.]+', text)
    digits = []
    for w in words:
        w = w.strip()
        if not w:
            continue
        if re.fullmatch(r'\d', w):          # single digit char
            digits.append(w)
        elif w in DIGIT_WORDS:
            digits.append(DIGIT_WORDS[w])
    # Reject: fewer than 4 digits (reCAPTCHA uses 6-8)
    if len(digits) < 4:
        return ''
    # Reject: all same digit (silence/noise hallucination like "0 0 0 0 0...")
    if len(set(digits)) == 1:
        sys.stderr.write(f'   ⚠️ All-same digits — noise, rejecting\n')
        sys.stderr.flush()
        return ''
    # Reject: repeating pattern like "5 9 4 9 4 9 4 9..." (looping noise)
    if len(digits) > 8:
        # Check if most digits follow a short repeating cycle (noise)
        is_repeat = False
        for cycle in [2, 3]:
            core = digits[1:1+cycle]  # skip first digit, check rest
            matches = sum(1 for i in range(1, min(len(digits), 20))
                         if digits[i] == core[(i-1) % cycle])
            if matches >= min(len(digits)-1, 14):  # 14+ out of remaining match
                is_repeat = True
                break
        if is_repeat:
            sys.stderr.write(f'   ⚠️ Repeating pattern — rejecting\n')
            sys.stderr.flush()
            return ''
        digits = digits[:8]  # reCAPTCHA max 8 digits
    result = ' '.join(digits)
    sys.stderr.write(f'   🔢 Raw: "{text}" → Digits: "{result}"\n')
    sys.stderr.flush()
    return result

def transcribe(audio_path):
    try:
        wav = audio_path
        if audio_path.endswith('.mp3') and HAS_PYDUB:
            wav = audio_path.replace('.mp3', '.wav')
            AudioSegment.from_mp3(audio_path).export(wav, format='wav')

        result = model.transcribe(
            wav,
            language='en',
            fp16=False,
            temperature=0.0,
            initial_prompt='The answer is: 3 7 2 9 4 8 1 5 6 0',
            condition_on_previous_text=False,
        )
        raw = re.sub(r'[^a-z0-9 ]+', '', result['text'].lower()).strip()
        # ONLY return valid digit sequences — never return raw text
        return extract_digits(raw)
    except Exception as e:
        sys.stderr.write(f'⚠️ Transcribe error: {e}\n')
        sys.stderr.flush()
        return ''

for line in sys.stdin:
    path = line.strip()
    if not path:
        continue
    if not os.path.exists(path):
        print('', flush=True)
        continue
    result = transcribe(path)
    sys.stderr.write(f'   🗣️ Result: "{result}"\n')
    sys.stderr.flush()
    print(result, flush=True)
