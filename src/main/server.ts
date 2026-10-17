import http from 'http';
import { BrowserWindow } from 'electron';
import type { NotifyPayload, MascotState, UserChoice, SystemTelemetry } from '../types';
import { DEBUG, snapshot, getState, click, setBandaid, calibrate } from './debug';

export interface ServerCallbacks {
  onNotify: (payload: NotifyPayload) => void;
  onToggleRaycast?: () => void;
  onPlaySound?: (clipOrEvent: string) => void;
  getTelemetry?: () => SystemTelemetry | null;
  getBrowserWindow?: () => BrowserWindow | null;
}

export class NotifyServer {
  private server: http.Server | null = null;
  private port: number;
  private token: string;
  private callbacks: ServerCallbacks;

  // Rate limiter: sliding window count
  private requestTimestamps: number[] = [];
  private readonly MAX_REQUESTS_PER_SECOND = 40;
  private readonly MAX_BODY_BYTES = 8192; // 8KB
  private pendingChoices: UserChoice[] = [];
  private choiceWaiters: Array<{
    questionId?: string;
    res: http.ServerResponse;
    timer: NodeJS.Timeout;
  }> = [];

  constructor(port: number, token: string, callbacks: ServerCallbacks) {
    this.port = port;
    this.token = token;
    this.callbacks = callbacks;
  }

  public start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          console.error(`[NotifyServer] Port ${this.port} is already in use by another process.`);
        } else {
          console.error('[NotifyServer] Server error:', err);
        }
        reject(err);
      });

      // BIND STRICTLY TO 127.0.0.1
      this.server.listen(this.port, '127.0.0.1', () => {
        console.log(`[NotifyServer] Listening securely on http://127.0.0.1:${this.port}`);
        resolve();
      });
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      // Clear any waiting choice requests
      for (const waiter of this.choiceWaiters) {
        clearTimeout(waiter.timer);
        this.sendJsonResponse(waiter.res, 503, { error: 'Server shutting down' });
      }
      this.choiceWaiters = [];

      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    // 1. Rate limiting check
    const now = Date.now();
    this.requestTimestamps = this.requestTimestamps.filter((t) => now - t < 1000);
    if (this.requestTimestamps.length >= this.MAX_REQUESTS_PER_SECOND) {
      this.sendJsonResponse(res, 429, { error: 'Rate limit exceeded' });
      return;
    }
    this.requestTimestamps.push(now);

    // 2. Validate Host header to prevent DNS rebinding / web browser attacks
    const host = req.headers['host'] || '';
    const validHosts = [
      `127.0.0.1:${this.port}`,
      `localhost:${this.port}`,
      '127.0.0.1',
      'localhost',
    ];
    if (!validHosts.includes(host)) {
      this.sendJsonResponse(res, 403, { error: 'Forbidden: Invalid Host header' });
      return;
    }

    // 3. No CORS headers are attached (blocks cross-origin web browser fetch/XHR)
    const url = req.url || '';
    const method = req.method || 'GET';

    // Route: GET /health (does not require auth)
    if (method === 'GET' && (url === '/health' || url === '/health/')) {
      this.sendJsonResponse(res, 200, { ok: true, platform: process.platform });
      return;
    }

    // Route: POST /action/choice (called from local renderer when user clicks an option)
    if (method === 'POST' && (url === '/action/choice' || url === '/action/choice/' || url === '/chat/input')) {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        try {
          const choice: UserChoice = JSON.parse(body);
          this.pendingChoices.push(choice);

          // Resolve any waiting long-poll requests (from POST /ask)
          const matchedWaiterIndex = this.choiceWaiters.findIndex(
            (w) => !choice.questionId || !w.questionId || w.questionId === choice.questionId
          );
          if (matchedWaiterIndex !== -1) {
            const waiter = this.choiceWaiters.splice(matchedWaiterIndex, 1)[0];
            clearTimeout(waiter.timer);
            this.sendJsonResponse(waiter.res, 200, {
              ok: true,
              choice: choice.id,
              label: choice.label,
              data: choice,
            });
          }

          this.sendJsonResponse(res, 200, { ok: true });
        } catch (e) {
          this.sendJsonResponse(res, 400, { error: 'Invalid JSON' });
        }
      });
      return;
    }

    // Route: GET /action/choice, /choice, /chat/prompt (fetch pending human choice for coding agent)
    if (
      method === 'GET' &&
      (url === '/action/choice' || url === '/choice' || url === '/chat/prompt' || url === '/chat/prompt/')
    ) {
      const nextChoice = this.pendingChoices.shift() || null;
      this.sendJsonResponse(res, 200, {
        ok: true,
        choice: nextChoice ? nextChoice.id : null,
        label: nextChoice ? nextChoice.label : null,
        prompt: nextChoice ? nextChoice.label : null,
        data: nextChoice,
      });
      return;
    }

    // Debug endpoints (strictly require CHIIKAWA_DEBUG=1 AND valid Bearer token)
    if (url.startsWith('/debug/')) {
      if (!DEBUG) {
        this.sendJsonResponse(res, 404, { error: 'Not Found' });
        return;
      }

      const authHeader = req.headers['authorization'];
      if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.slice(7).trim() !== this.token) {
        this.sendJsonResponse(res, 401, { error: 'Unauthorized: Invalid or missing Bearer token' });
        return;
      }

      const win = this.callbacks.getBrowserWindow ? this.callbacks.getBrowserWindow() : null;
      if (!win || win.isDestroyed()) {
        this.sendJsonResponse(res, 503, { error: 'Window not available' });
        return;
      }

      // GET /debug/snapshot?name=...
      if (method === 'GET' && url.startsWith('/debug/snapshot')) {
        const parsedUrl = new URL(url, 'http://127.0.0.1');
        const name = parsedUrl.searchParams.get('name') || 'snap';
        snapshot(win, name)
          .then((result) => this.sendJsonResponse(res, 200, { ok: true, ...result }))
          .catch((err) => this.sendJsonResponse(res, 500, { error: String(err) }));
        return;
      }

      // GET /debug/state
      if (method === 'GET' && (url === '/debug/state' || url === '/debug/state/')) {
        getState(win)
          .then((state) => this.sendJsonResponse(res, 200, { ok: true, state }))
          .catch((err) => this.sendJsonResponse(res, 500, { error: String(err) }));
        return;
      }

      // POST /debug/click { x, y, count }
      if (method === 'POST' && (url === '/debug/click' || url === '/debug/click/')) {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', async () => {
          try {
            const data = JSON.parse(body || '{}');
            const x = Number(data.x ?? 0);
            const y = Number(data.y ?? 0);
            const count = Number(data.count ?? 1);
            await click(win, x, y, count);
            this.sendJsonResponse(res, 200, { ok: true, clicked: { x, y, count } });
          } catch (e: any) {
            this.sendJsonResponse(res, 400, { error: e.message || 'Invalid JSON' });
          }
        });
        return;
      }

      // POST /debug/bandaid { visible: boolean }
      if (method === 'POST' && (url === '/debug/bandaid' || url === '/debug/bandaid/')) {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', async () => {
          try {
            const data = JSON.parse(body || '{}');
            await setBandaid(win, Boolean(data.visible));
            this.sendJsonResponse(res, 200, { ok: true, visible: Boolean(data.visible) });
          } catch (e: any) {
            this.sendJsonResponse(res, 400, { error: e.message || 'Invalid JSON' });
          }
        });
        return;
      }

      // POST /debug/calibrate { px, py }
      if (method === 'POST' && (url === '/debug/calibrate' || url === '/debug/calibrate/')) {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', async () => {
          try {
            const data = JSON.parse(body || '{}');
            const px = Number(data.px);
            const py = Number(data.py);
            const resData = await calibrate(win, px, py);
            this.sendJsonResponse(res, 200, { ok: true, anchor: resData });
          } catch (e: any) {
            this.sendJsonResponse(res, 400, { error: e.message || 'Invalid JSON' });
          }
        });
        return;
      }

      this.sendJsonResponse(res, 404, { error: 'Unknown debug route' });
      return;
    }

    // 4. Require Bearer Token for other endpoints
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.slice(7).trim() !== this.token) {
      this.sendJsonResponse(res, 401, { error: 'Unauthorized: Invalid or missing Bearer token' });
      return;
    }

    // Route: POST /ask (convenient blocking/non-blocking endpoint for agent questions)
    if (method === 'POST' && (url === '/ask' || url === '/ask/')) {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          const question = data.question || data.message;
          if (!question || typeof question !== 'string') {
            this.sendJsonResponse(res, 400, { error: 'Field "question" or "message" must be a non-empty string' });
            return;
          }

          const qId = 'q_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
          const options = Array.isArray(data.options) && data.options.length > 0
            ? data.options
            : ['Đồng ý', 'Từ chối'];

          const payload: NotifyPayload = {
            id: qId,
            state: data.state || 'alert',
            message: question,
            source: data.source || 'agent',
            options: options,
            sticky: true,
            sound: data.sound || 'need_attention',
          };

          this.callbacks.onNotify(payload);

          // If wait is explicitly false, return questionId immediately
          if (data.wait === false) {
            this.sendJsonResponse(res, 200, { ok: true, questionId: qId });
            return;
          }

          // Default: wait for user's 1-click decision (default 60s timeout)
          const timeoutMs =
            typeof data.timeout_ms === 'number' && data.timeout_ms > 0
              ? Math.min(data.timeout_ms, 300000)
              : 60000;

          const timer = setTimeout(() => {
            const idx = this.choiceWaiters.findIndex((w) => w.questionId === qId);
            if (idx !== -1) {
              this.choiceWaiters.splice(idx, 1);
              this.sendJsonResponse(res, 200, {
                ok: false,
                error: 'User choice timed out',
                choice: null,
                label: null,
              });
            }
          }, timeoutMs);

          this.choiceWaiters.push({ questionId: qId, res, timer });
        } catch (e) {
          this.sendJsonResponse(res, 400, { error: 'Invalid JSON body' });
        }
      });
      return;
    }

    // Route: GET /telemetry
    if (method === 'GET' && (url === '/telemetry' || url === '/telemetry/')) {
      const data = this.callbacks.getTelemetry ? this.callbacks.getTelemetry() : null;
      this.sendJsonResponse(res, 200, { ok: true, telemetry: data });
      return;
    }

    // Route: POST /toggle-raycast (macOS fallback)
    if (method === 'POST' && (url === '/toggle-raycast' || url === '/toggle-raycast/')) {
      if (this.callbacks.onToggleRaycast) {
        this.callbacks.onToggleRaycast();
        this.sendJsonResponse(res, 200, { ok: true, message: 'Raycast visibility toggled' });
      } else {
        this.sendJsonResponse(res, 404, { error: 'Endpoint not supported on this platform' });
      }
      return;
    }

    // Route: POST /play-sound
    if (method === 'POST' && (url === '/play-sound' || url === '/play-sound/')) {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          const clipOrEvent = data.clip || data.sound || data.event || data.id;
          if (typeof clipOrEvent !== 'string' || !clipOrEvent.trim()) {
            this.sendJsonResponse(res, 400, { error: 'Field "clip" or "event" must be a non-empty string' });
            return;
          }
          if (this.callbacks.onPlaySound) {
            this.callbacks.onPlaySound(clipOrEvent.trim());
          }
          this.sendJsonResponse(res, 200, { ok: true, played: clipOrEvent.trim() });
        } catch (e) {
          this.sendJsonResponse(res, 400, { error: 'Invalid JSON body' });
        }
      });
      return;
    }

    // Route: POST /notify
    if (method === 'POST' && (url === '/notify' || url === '/notify/')) {
      let body = '';
      let bodyLength = 0;

      req.on('data', (chunk) => {
        bodyLength += chunk.length;
        if (bodyLength > this.MAX_BODY_BYTES) {
          req.destroy();
          this.sendJsonResponse(res, 413, { error: 'Payload too large (max 8KB)' });
          return;
        }
        body += chunk;
      });

      req.on('end', () => {
        try {
          const payload = JSON.parse(body);
          const validationError = this.validateNotifyPayload(payload);
          if (validationError) {
            this.sendJsonResponse(res, 400, { error: validationError });
            return;
          }

          this.callbacks.onNotify(payload);
          this.sendJsonResponse(res, 200, { ok: true });
        } catch (e) {
          this.sendJsonResponse(res, 400, { error: 'Invalid JSON body' });
        }
      });
      return;
    }

    // 404 for any other route
    this.sendJsonResponse(res, 404, { error: 'Not found' });
  }

  private validateNotifyPayload(payload: any): string | null {
    if (!payload || typeof payload !== 'object') {
      return 'Body must be a JSON object';
    }

    const validStates: MascotState[] = ['idle', 'thinking', 'success', 'alert', 'error'];
    if (!payload.state || !validStates.includes(payload.state)) {
      return `Invalid state: "${payload.state}". Must be one of: ${validStates.join(', ')}`;
    }

    if (payload.message !== undefined && typeof payload.message !== 'string') {
      return 'Field "message" must be a string';
    }
    if (payload.message === undefined) {
      payload.message = '';
    }

    if (payload.source !== undefined && typeof payload.source !== 'string') {
      return 'Field "source" must be a string';
    }

    if (payload.duration_ms !== undefined && (typeof payload.duration_ms !== 'number' || payload.duration_ms < 0)) {
      return 'Field "duration_ms" must be a positive number';
    }

    if (payload.sticky !== undefined && typeof payload.sticky !== 'boolean') {
      return 'Field "sticky" must be a boolean';
    }

    if (payload.sound !== undefined && typeof payload.sound !== 'string') {
      return 'Field "sound" must be a string';
    }

    if (payload.event !== undefined && typeof payload.event !== 'string') {
      return 'Field "event" must be a string';
    }

    if (payload.interactive !== undefined && typeof payload.interactive !== 'boolean') {
      return 'Field "interactive" must be a boolean';
    }

    if (payload.choices !== undefined && !Array.isArray(payload.choices)) {
      return 'Field "choices" must be an array';
    }

    if (payload.options !== undefined && !Array.isArray(payload.options)) {
      return 'Field "options" must be an array';
    }

    return null;
  }

  private sendJsonResponse(res: http.ServerResponse, status: number, data: object): void {
    const jsonStr = JSON.stringify(data);
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(jsonStr),
      'Cache-Control': 'no-store',
    });
    res.end(jsonStr);
  }
}
