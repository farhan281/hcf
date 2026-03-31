#!/usr/bin/env python3
import sys, re, os, ssl

# Fix SSL cert verification on this system
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

def transcribe(audio_path):
    try:
        wav = audio_path
        if audio_path.endswith('.mp3') and HAS_PYDUB:
            wav = audio_path.replace('.mp3', '.wav')
            AudioSegment.from_mp3(audio_path).export(wav, format='wav')
        result = model.transcribe(wav, language='en', fp16=False)
        text = re.sub(r'[^a-z0-9 ]+', '', result['text'].lower()).strip()
        return text
    except Exception as e:
        sys.stderr.write(f"⚠️ Transcribe error: {e}\n")
        sys.stderr.flush()
        return ''

# Main loop — read path from stdin, write result to stdout
for line in sys.stdin:
    path = line.strip()
    if not path:
        continue
    if not os.path.exists(path):
        print('', flush=True)
        continue
    result = transcribe(path)
    print(result, flush=True)
