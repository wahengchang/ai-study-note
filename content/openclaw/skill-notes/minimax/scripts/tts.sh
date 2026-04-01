#!/bin/bash

# Default values
MODEL="speech-2.6-turbo"
VOICE="Chinese (Mandarin)_HK_Flight_Attendant"
BOOST="Chinese,Yue"
SPEED=1.0
VOL=1.0
PITCH=0

# Parse arguments
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --text) TEXT="$2"; shift ;;
        --output) OUTPUT="$2"; shift ;;
        --model) MODEL="$2"; shift ;;
        --voice) VOICE="$2"; shift ;;
        --boost) BOOST="$2"; shift ;;
        --speed) SPEED="$2"; shift ;;
        --vol) VOL="$2"; shift ;;
        --pitch) PITCH="$2"; shift ;;
    esac
    shift
done

if [ -z "$TEXT" ] || [ -z "$OUTPUT" ]; then
    echo "Usage: $0 --text 'text' --output 'file.mp3' [--model model] [--voice voice] [--boost boost] [--speed speed] [--vol vol] [--pitch pitch]"
    exit 1
fi

# Load API Key from .env in the skill directory
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -f "$SKILL_DIR/.env" ]; then
    export $(grep -v '^#' "$SKILL_DIR/.env" | xargs)
fi

if [ -z "$MINIMAX_API_KEY" ]; then
    echo "Error: MINIMAX_API_KEY not found in $SKILL_DIR/.env"
    exit 1
fi

# Prepare payload
PAYLOAD=$(cat <<EOF
{
  "model": "$MODEL",
  "text": $(echo "$TEXT" | python3 -c "import json, sys; print(json.dumps(sys.stdin.read().strip()))"),
  "stream": false,
  "language_boost": "$BOOST",
  "voice_setting": {
    "voice_id": "$VOICE",
    "speed": $SPEED,
    "vol": $VOL,
    "pitch": $PITCH
  },
  "audio_setting": {
    "sample_rate": 32000,
    "bitrate": 128000,
    "format": "mp3"
  }
}
EOF
)

# Call API
RESPONSE=$(curl -s -X POST "https://api.minimaxi.chat/v1/t2a_v2" \
  -H "Authorization: Bearer $MINIMAX_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

# Extract audio
echo "$RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
if data.get('data', {}).get('audio'):
    audio_hex = data['data']['audio']
    with open('$OUTPUT', 'wb') as f:
        f.write(bytes.fromhex(audio_hex))
    sys.exit(0)
else:
    print(json.dumps(data, indent=2, ensure_ascii=False), file=sys.stderr)
    sys.exit(1)
"
