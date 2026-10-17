import http from 'http';
import type { NotifyPayload, MascotState } from '../types';

export interface ServerCallbacks {
  onNotify: (payload: NotifyPayload) => void;
  onToggleRaycast?: () => void;
}

export class NotifyServer {
  private server: http.Server | null = null;
  private port: number;
  private token: string;
  private callbacks: ServerCallbacks;

  // Rate limiter: sliding window count
  private requestTimestamps: number[] = [];
  private readonly MAX_REQUESTS_PER_SECOND = 40;
  private readonly MAX_BODY_BYTES = 4096; // 4KB

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

    // 4. Require Bearer Token for other endpoints
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.slice(7).trim() !== this.token) {
      this.sendJsonResponse(res, 401, { error: 'Unauthorized: Invalid or missing Bearer token' });
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

    // Route: POST /notify
    if (method === 'POST' && (url === '/notify' || url === '/notify/')) {
      let body = '';
      let bodyLength = 0;

      req.on('data', (chunk) => {
        bodyLength += chunk.length;
        if (bodyLength > this.MAX_BODY_BYTES) {
          req.destroy();
          this.sendJsonResponse(res, 413, { error: 'Payload too large (max 4KB)' });
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

    if (typeof payload.message !== 'string') {
      return 'Field "message" must be a string';
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
