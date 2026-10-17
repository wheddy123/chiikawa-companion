#!/usr/bin/env python3
"""Measure mascot stillness over 10 seconds at 20 Hz (200 samples).
Pure Python (no numpy/scipy).
Thresholds from Phase 5 spec:
- rootPos range < 0.003
- rootRot range < 0.012 rad
- rootScale range < 0.012
- rootRot zero-crossings <= 6 in 10s
"""
import sys, os, time, json, urllib.request

config_path = os.path.expanduser('~/Library/Application Support/chiikawa-companion/chiikawa-config.json')
with open(config_path) as f:
    token = json.load(f)['token']

def get_state():
    req = urllib.request.Request('http://127.0.0.1:7788/debug/state', headers={'Authorization': f'Bearer {token}'})
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())['state']

print("Settling for 3.0s before stillness measurement...")
time.sleep(3.0)

samples = []
duration = 10.0
sample_interval = 0.05 # 20 Hz
t_end = time.time() + duration

print("Sampling /debug/state at 20 Hz for 10.0s...")
while time.time() < t_end:
    st = get_state()
    m = st['mascot']
    samples.append({
        'posX': m['rootPos'][0], 'posY': m['rootPos'][1], 'posZ': m['rootPos'][2],
        'rotX': m['rootRot'][0], 'rotY': m['rootRot'][1], 'rotZ': m['rootRot'][2],
        'scaleX': m['rootScale'][0], 'scaleY': m['rootScale'][1], 'scaleZ': m['rootScale'][2],
    })
    time.sleep(sample_interval)

N = len(samples)
print(f"Collected {N} samples.\n")

channels = [
    ('posX', 'rootPos.x', 0.003),
    ('posY', 'rootPos.y', 0.003),
    ('posZ', 'rootPos.z', 0.003),
    ('rotX', 'rootRot.x', 0.012),
    ('rotY', 'rootRot.y', 0.012),
    ('rotZ', 'rootRot.z', 0.012),
    ('scaleX', 'rootScale.x', 0.012),
    ('scaleY', 'rootScale.y', 0.012),
    ('scaleZ', 'rootScale.z', 0.012),
]

all_pass = True
print(f"{'Channel':<15} {'Min':<10} {'Max':<10} {'Range':<10} {'Threshold':<10} {'ZeroX':<8} {'Status'}")
print("-" * 75)

for key, name, thresh in channels:
    vals = [s[key] for s in samples]
    v_min = min(vals)
    v_max = max(vals)
    v_range = v_max - v_min
    mean = sum(vals) / N
    detrended = [v - mean for v in vals]
    
    # Count zero crossings
    zx = 0
    for i in range(1, N):
        if (detrended[i-1] < 0 and detrended[i] > 0) or (detrended[i-1] > 0 and detrended[i] < 0):
            zx += 1
            
    is_rot = 'rot' in key
    range_pass = v_range < thresh
    zx_pass = (zx <= 6) if is_rot else True
    ch_pass = range_pass and zx_pass
    if not ch_pass:
        all_pass = False
        
    status = "PASS" if ch_pass else "FAIL"
    print(f"{name:<15} {v_min:<10.6f} {v_max:<10.6f} {v_range:<10.6f} {thresh:<10.6f} {zx:<8} {status}")

print("-" * 75)
if all_pass:
    print("✓ STILLNESS TEST: ALL CHANNELS PASS!")
else:
    print("✗ STILLNESS TEST: SOME CHANNELS EXCEEDED THRESHOLD")

sys.exit(0 if all_pass else 1)
