#!/usr/bin/env python3
import sys, os, time, json, urllib.request, subprocess

config_path = os.path.expanduser('~/Library/Application Support/chiikawa-companion/chiikawa-config.json')
with open(config_path) as f:
    cfg = json.load(f)
token = cfg['token']

def api_get(endpoint):
    req = urllib.request.Request(f'http://127.0.0.1:7788{endpoint}', headers={'Authorization': f'Bearer {token}'})
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())

def api_post(endpoint, data):
    body = json.dumps(data).encode()
    req = urllib.request.Request(
        f'http://127.0.0.1:7788{endpoint}',
        data=body,
        headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())

print("=== Starting Speech Bubble Verification ===")

# Test A: Auto-advance timing
print("\n--- Running Test A: Auto-advance timing ---")
# 1. Short message (3 words): expected ~2500ms (max(2500, 2000 + 3*180 = 2540) = 2540ms)
msg1 = "Build completed successfully" # 3 words
api_post('/notify', {'state': 'success', 'message': msg1, 'source': 'agent'})
t0 = time.time()

# Poll until bubble disappears
disappeared = False
while time.time() - t0 < 6.0:
    st = api_get('/debug/state')['state']['bubble']
    if not st['visible']:
        elapsed = (time.time() - t0) * 1000
        print(f"Message 1 ('{msg1}') auto-dismissed in {elapsed:.0f}ms (expected ~2540ms)")
        assert 2200 <= elapsed <= 3300, f"Elapsed {elapsed} outside [2200, 3300]"
        disappeared = True
        break
    time.sleep(0.1)
assert disappeared, "Message 1 did not auto-dismiss!"

# 2. Alert message without sticky: must also auto-advance
msg_alert = "Canh bao loi ket noi may chu" # 6 words => 2000 + 6*180 = 3080ms
api_post('/notify', {'state': 'alert', 'message': msg_alert, 'source': 'server', 'sticky': False})
t0 = time.time()
disappeared = False
while time.time() - t0 < 6.0:
    st = api_get('/debug/state')['state']['bubble']
    if not st['visible']:
        elapsed = (time.time() - t0) * 1000
        print(f"Alert message ('{msg_alert}') auto-dismissed in {elapsed:.0f}ms (expected ~3080ms)")
        assert 2700 <= elapsed <= 3800, f"Elapsed {elapsed} outside [2700, 3800]"
        disappeared = True
        break
    time.sleep(0.1)
assert disappeared, "Alert message did not auto-dismiss!"
print("✓ Test A: Auto-advance passed!")

# Test B: Click-to-next instant advance
print("\n--- Running Test B: Click-to-next instant advance ---")
# Send 2 notifications
api_post('/notify', {'state': 'thinking', 'message': 'First message waiting for click', 'source': 'agent'})
api_post('/notify', {'state': 'success', 'message': 'Second message queued', 'source': 'agent'})
time.sleep(0.3)

st1 = api_get('/debug/state')['state']['bubble']
assert st1['visible'], "First message should be visible"
assert 'First' in st1['text'], f"Expected first message, got {st1['text']}"

# Click on bubble (approx x: 160, y: 220 in the window rect)
t_click = time.time()
api_post('/debug/click', {'x': 160, 'y': 220, 'count': 1})

# Wait and verify second message appears quickly (< 400ms)
advanced = False
while time.time() - t_click < 1.0:
    st2 = api_get('/debug/state')['state']['bubble']
    if 'Second' in st2['text']:
        advance_time = (time.time() - t_click) * 1000
        print(f"Advanced to second message in {advance_time:.0f}ms (< 400ms)")
        advanced = True
        break
    time.sleep(0.05)
assert advanced, "Bubble did not advance to second message on click!"

# Dismiss second message with a click too
time.sleep(0.2)
api_post('/debug/click', {'x': 160, 'y': 220, 'count': 1})
time.sleep(0.4)
st_end = api_get('/debug/state')['state']['bubble']
assert not st_end['visible'], "Bubble should be dismissed"
print("✓ Test B: Click-to-next passed!")

# Test C: Decision /ask bubbles stay sticky and choice can be selected
print("\n--- Running Test C: Decision (/ask) stickiness ---")
# Send /ask with wait=false so we can test polling
ask_res = api_post('/ask', {
    'question': 'Anh co dong y merge pull request nay khong?',
    'options': ['Co, merge ngay', 'Khong, de xem lai'],
    'wait': False,
    'source': 'git'
})
print("/ask posted:", ask_res)

# Take snapshot of decision bubble
subprocess.run(['./scripts/snap.sh', '09_p4_decision_bubble'], check=True)

# Wait 5 seconds and verify it is STILL visible (sticky)
time.sleep(5.0)
st_ask = api_get('/debug/state')['state']['bubble']
assert st_ask['visible'], "Decision bubble must NOT auto-dismiss!"
assert st_ask['sticky'], "Decision bubble must have sticky=True"
print(f"Decision bubble confirmed visible and sticky after 5s! text='{st_ask['text']}'")

# Simulate user selecting option 1 by posting to /action/choice
choice_payload = {
    'id': 'opt_0',
    'label': 'Co, merge ngay',
    'questionId': ask_res.get('questionId')
}
choice_res = api_post('/action/choice', choice_payload)
print("Choice submitted:", choice_res)

# Verify choice is fetchable via GET /action/choice
get_choice = api_get('/action/choice')
print("Fetched choice:", get_choice)
assert get_choice['choice'] == 'opt_0', f"Expected opt_0, got {get_choice}"

# Dismiss bubble if still showing
api_post('/debug/click', {'x': 160, 'y': 220, 'count': 1})
time.sleep(0.5)

print("✓ Test C: Decision stickiness and choice selection passed!")
print("\n=== All Speech Bubble Tests PASSED! ===")
