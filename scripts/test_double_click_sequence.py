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

initial_state = api_get('/debug/state')
print("Initial muted state:", initial_state['state']['muted'])

# Ensure we start from known state (if muted, toggle to unmuted first so sequence is muted -> unmuted)
if initial_state['state']['muted']:
    print("Toggling once to start from unmuted (muted=False)...")
    api_post('/debug/click', {'x': 160, 'y': 340, 'count': 2})
    time.sleep(0.4)

results = []
config_sound_states = []

for i in range(1, 7):
    # Click count=2 at mascot center
    api_post('/debug/click', {'x': 160, 'y': 340, 'count': 2})
    time.sleep(0.4) # wait for IPC roundtrip and state update
    
    st = api_get('/debug/state')['state']
    muted = st['muted']
    results.append(muted)
    
    with open(config_path) as f:
        cfg_now = json.load(f)
    config_sound_states.append(cfg_now['soundEnabled'])
    
    if i == 1:
        subprocess.run(['./scripts/snap.sh', '07_p3_dblclick_muted_on'], check=True)
    elif i == 2:
        subprocess.run(['./scripts/snap.sh', '08_p3_dblclick_muted_off'], check=True)

print("Muted sequence (6 toggles):", results)
print("Config soundEnabled sequence:", config_sound_states)

expected_muted = [True, False, True, False, True, False]
expected_sound_enabled = [False, True, False, True, False, True]

assert results == expected_muted, f"Expected muted {expected_muted}, got {results}"
assert config_sound_states == expected_sound_enabled, f"Expected soundEnabled {expected_sound_enabled}, got {config_sound_states}"

print("✓ All 6 double-click alternating toggles PASSED!")
