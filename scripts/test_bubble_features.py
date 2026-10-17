#!/usr/bin/env python3
import json
import os
import sys
import time
import urllib.request
import urllib.parse
from PIL import Image

CONFIG_PATH = os.path.expanduser('~/Library/Application Support/chiikawa-companion/chiikawa-config.json')
with open(CONFIG_PATH) as f:
    cfg = json.load(f)
TOKEN = cfg['token']
PORT = cfg.get('port', 7788)
BASE_URL = f"http://127.0.0.1:{PORT}"

def req(path, method='GET', data=None):
    url = f"{BASE_URL}{path}"
    headers = {
        'Authorization': f"Bearer {TOKEN}",
        'Content-Type': 'application/json'
    }
    encoded_data = json.dumps(data).encode('utf-8') if data is not None else None
    r = urllib.request.Request(url, data=encoded_data, headers=headers, method=method)
    with urllib.request.urlopen(r) as resp:
        return json.loads(resp.read().decode('utf-8'))

def get_state():
    res = req('/debug/state')
    return res.get('state', {})

def take_snapshot(name):
    res = req(f'/debug/snapshot?name={name}')
    raw_path = res['file']
    # Composite over neutral gray for clean viewing
    gray_path = raw_path.replace('.png', '_gray.png')
    im = Image.open(raw_path).convert('RGBA')
    bg = Image.new('RGBA', im.size, (240, 240, 240, 255))
    comp = Image.alpha_composite(bg, im)
    comp.convert('RGB').save(gray_path)
    return gray_path

def test_1_thinking_bubble():
    print("\n--- TEST CASE 1: Animated Thinking Bubble ---")
    payload = {"state": "thinking"}
    res = req('/notify', method='POST', data=payload)
    print(f"POST /notify response: {res}")
    time.sleep(0.3)

    state = get_state()
    bubble = state.get('bubble', {})
    print(f"Bubble state: {bubble}")

    assert bubble.get('visible') is True, "Expected bubble to be visible"
    assert bubble.get('isThinkingShimmer') is True, "Expected animated thinking shimmer element (.thinking-shimmer)"
    assert 'nghĩ ngợi' in bubble.get('text', ''), f"Expected thinking text in bubble, got '{bubble.get('text')}'"
    assert bubble.get('hasCountdownBar') is False, "Thinking bubble must NOT have a countdown progress bar"
    assert bubble.get('hideAt') == 0, "Thinking bubble must NOT have an auto-dismiss timeout"

    snap = take_snapshot("10_thinking_bubble")
    print(f"✓ Snapshot saved: {snap}")
    print("✓ TEST 1 PASSED: Animated thinking bubble rendered without countdown bar.")

def test_2_dynamic_sizing_and_countdown():
    print("\n--- TEST CASE 2: Dynamic Fit & Countdown Line ---")
    payload = {"state": "success", "message": "Xong rồi nè!"}
    res = req('/notify', method='POST', data=payload)
    print(f"POST /notify response: {res}")
    time.sleep(0.3)

    state = get_state()
    bubble = state.get('bubble', {})
    print(f"Bubble state: {bubble}")

    assert bubble.get('visible') is True, "Expected bubble to be visible"
    assert bubble.get('hasCountdownBar') is True, "Expected .bubble-countdown-bar to be present"
    assert bubble.get('hideAt') > 0, "Expected auto-dismiss timer to be active"
    assert bubble.get('width') >= 90 and bubble.get('width') <= 270, f"Expected width between 90 and 270px, got {bubble.get('width')}"

    snap = take_snapshot("11_success_countdown_bubble")
    print(f"✓ Snapshot saved: {snap}")
    print(f"✓ Bubble width: {bubble.get('width')}px (snugly fits 3 words)")

    # Wait for countdown duration to expire and verify bubble auto-dismisses
    duration = (bubble.get('hideAt') - bubble.get('shownAt')) / 1000.0
    print(f"Waiting for countdown to finish (~{duration:.1f}s)...")
    time.sleep(duration + 0.6)

    state_after = get_state()
    print(f"Bubble state after timeout: {state_after.get('bubble')}")
    assert state_after.get('bubble', {}).get('visible') is False, "Expected bubble to be dismissed after countdown"
    print("✓ TEST 2 PASSED: Dynamic sizing and countdown auto-dismiss verified.")

def test_3_interactive_badge_and_stickiness():
    print("\n--- TEST CASE 3: Interactive Badge & Stickiness ---")
    payload = {
        "state": "alert",
        "message": "Có muốn deploy production không sếp?",
        "interactive": True,
        "choices": ["Duyệt", "Hủy"]
    }
    res = req('/notify', method='POST', data=payload)
    print(f"POST /notify response: {res}")
    time.sleep(0.3)

    state = get_state()
    bubble = state.get('bubble', {})
    print(f"Bubble state: {bubble}")

    assert bubble.get('visible') is True, "Expected bubble to be visible"
    assert bubble.get('hasInteractiveBadge') is True, "Expected .bubble-badge-interactive '!?' badge"
    assert bubble.get('hasCountdownBar') is False, "Interactive bubble must NOT have countdown bar"
    assert bubble.get('hideAt') == 0, "Interactive bubble must NOT have an auto-dismiss timeout"

    snap = take_snapshot("12_interactive_bubble")
    print(f"✓ Snapshot saved: {snap}")

    # Verify bubble remains sticky past normal reading duration
    print("Checking persistence after 3.5s...")
    time.sleep(3.5)
    state_persisted = get_state()
    assert state_persisted.get('bubble', {}).get('visible') is True, "Interactive bubble MUST persist strictly on screen"
    print("✓ Bubble remains sticky and active on screen.")

    # Select choice "Duyệt" by clicking the button or calling /action/choice
    choice_payload = {
        "id": "Duyệt",
        "label": "Duyệt",
        "timestamp": int(time.time() * 1000)
    }
    choice_res = req('/action/choice', method='POST', data=choice_payload)
    print(f"Posted user choice: {choice_res}")

    print("✓ TEST 3 PASSED: Interactive badge rendered, countdown line disabled, and bubble persisted.")

if __name__ == '__main__':
    try:
        test_1_thinking_bubble()
        test_2_dynamic_sizing_and_countdown()
        test_3_interactive_badge_and_stickiness()
        print("\n==========================================")
        print("ALL 3 SPECIFICATION TEST CASES PASSED! ✓")
        print("==========================================")
    except Exception as e:
        print(f"\nTEST FAILED with error: {e}", file=sys.stderr)
        sys.exit(1)
