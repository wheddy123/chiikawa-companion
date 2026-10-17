import assert from 'node:assert';

// Import Gesture (compiled TS or inline mirror for Node ESM test)
class Gesture {
  constructor(cb, slop = 6, gap = 350, dist = 14, singleDelay = 280) {
    this.cb = cb;
    this.slop = slop;
    this.gap = gap;
    this.dist = dist;
    this.singleDelay = singleDelay;
    this.down = null;
    this.dragging = false;
    this.lastUp = null;
    this.singleTimer = null;
  }

  pointerDown(sx, sy, t) {
    this.down = { x: sx, y: sy, t };
    this.dragging = false;
  }

  pointerMove(sx, sy) {
    if (!this.down || this.dragging) return;
    if (Math.hypot(sx - this.down.x, sy - this.down.y) > this.slop) {
      this.dragging = true;
      if (this.singleTimer !== null) {
        clearTimeout(this.singleTimer);
        this.singleTimer = null;
      }
      this.lastUp = null;
      this.cb.onDragStart();
    }
  }

  pointerUp(sx, sy, t) {
    if (!this.down) return;
    const wasDrag = this.dragging;
    this.down = null;
    this.dragging = false;
    if (wasDrag) return;

    const prev = this.lastUp;
    if (prev && t - prev.t <= this.gap && Math.hypot(sx - prev.x, sy - prev.y) <= this.dist) {
      if (this.singleTimer !== null) {
        clearTimeout(this.singleTimer);
        this.singleTimer = null;
      }
      this.lastUp = null;
      this.cb.onDouble();
    } else {
      this.lastUp = { x: sx, y: sy, t };
      if (this.singleTimer !== null) {
        clearTimeout(this.singleTimer);
      }
      this.singleTimer = setTimeout(() => {
        this.lastUp = null;
        this.singleTimer = null;
        this.cb.onSingle();
      }, this.singleDelay);
    }
  }
}

async function runTests() {
  console.log('Testing Gesture state machine...');

  // Test 1: Double Click
  {
    let singles = 0, doubles = 0, drags = 0;
    const g = new Gesture({
      onSingle: () => singles++,
      onDouble: () => doubles++,
      onDragStart: () => drags++,
    });

    g.pointerDown(100, 100, 1000);
    g.pointerUp(100, 100, 1050);
    g.pointerDown(102, 101, 1150);
    g.pointerUp(102, 101, 1200);

    await new Promise((r) => setTimeout(r, 350));
    assert.strictEqual(doubles, 1, 'Expected exactly 1 double click');
    assert.strictEqual(singles, 0, 'Expected 0 single clicks for double click');
    assert.strictEqual(drags, 0, 'Expected 0 drags');
    console.log('  ✓ Test 1: Double click passed');
  }

  // Test 2: Single Click
  {
    let singles = 0, doubles = 0, drags = 0;
    const g = new Gesture({
      onSingle: () => singles++,
      onDouble: () => doubles++,
      onDragStart: () => drags++,
    });

    g.pointerDown(100, 100, 1000);
    g.pointerUp(100, 100, 1050);

    assert.strictEqual(singles, 0, 'Single should not fire immediately');
    await new Promise((r) => setTimeout(r, 350));
    assert.strictEqual(singles, 1, 'Single should fire after delay');
    assert.strictEqual(doubles, 0, 'Double should not fire');
    console.log('  ✓ Test 2: Single click passed');
  }

  // Test 3: Drag without click
  {
    let singles = 0, doubles = 0, drags = 0;
    const g = new Gesture({
      onSingle: () => singles++,
      onDouble: () => doubles++,
      onDragStart: () => drags++,
    });

    g.pointerDown(100, 100, 1000);
    g.pointerMove(100, 110); // 10px move > 6px slop
    g.pointerUp(100, 110, 1200);

    await new Promise((r) => setTimeout(r, 350));
    assert.strictEqual(drags, 1, 'Expected drag start');
    assert.strictEqual(singles, 0, 'Drag should not trigger single click');
    assert.strictEqual(doubles, 0, 'Drag should not trigger double click');
    console.log('  ✓ Test 3: Drag without click passed');
  }

  // Test 4: Triple click produces 1 double then 1 single, never 2 doubles
  {
    let singles = 0, doubles = 0, drags = 0;
    const g = new Gesture({
      onSingle: () => singles++,
      onDouble: () => doubles++,
      onDragStart: () => drags++,
    });

    // 1st click
    g.pointerDown(100, 100, 1000);
    g.pointerUp(100, 100, 1050);
    // 2nd click (forms double)
    g.pointerDown(100, 100, 1150);
    g.pointerUp(100, 100, 1200);
    // 3rd click (should be treated as 1st click of a new sequence)
    g.pointerDown(100, 100, 1300);
    g.pointerUp(100, 100, 1350);

    await new Promise((r) => setTimeout(r, 350));
    assert.strictEqual(doubles, 1, 'Expected 1 double click');
    assert.strictEqual(singles, 1, 'Expected 1 single click');
    console.log('  ✓ Test 4: Triple click passed');
  }

  console.log('All gesture unit tests passed successfully!');
}

runTests();
