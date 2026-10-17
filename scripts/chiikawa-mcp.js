#!/usr/bin/env node
/**
 * Chiikawa Companion MCP (Model Context Protocol) Server
 * Enables AI agents like OpenCode, Antigravity, Claude Code, and Cursor
 * to interact directly with the Chiikawa 3D Desktop Mascot.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

// Locate configuration and credentials
function loadConfig() {
  const home = os.homedir();
  const candidates = [
    path.join(home, 'Library', 'Application Support', 'chiikawa-companion', 'chiikawa-config.json'),
    path.join(process.env.APPDATA || '', 'chiikawa-companion', 'chiikawa-config.json'),
    path.join(home, '.config', 'chiikawa-companion', 'chiikawa-config.json'),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, 'utf-8');
        return JSON.parse(raw);
      } catch (e) {
        // Continue searching
      }
    }
  }

  return { port: 7788, token: '' };
}

// HTTP request helper to Chiikawa Companion server
function sendNotification(payload) {
  return new Promise((resolve) => {
    const config = loadConfig();
    const port = config.port || 7788;
    const token = config.token || '';

    const postData = JSON.stringify(payload);

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: port,
        path: '/notify',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          Authorization: `Bearer ${token}`,
          Host: `127.0.0.1:${port}`,
        },
        timeout: 2500,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve({ ok: true });
          } else {
            resolve({ ok: false, error: `HTTP ${res.statusCode}: ${body}` });
          }
        });
      }
    );

    req.on('error', (err) => resolve({ ok: false, error: err.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'Timeout connecting to Chiikawa Companion' });
    });

    req.write(postData);
    req.end();
  });
}

function askQuestion(question, options, source, timeoutMs) {
  return new Promise((resolve) => {
    const config = loadConfig();
    const port = config.port || 7788;
    const token = config.token || '';

    const timeout = timeoutMs || 60000;
    const postData = JSON.stringify({
      question,
      options: options || ['Đồng ý', 'Từ chối'],
      source: source || 'ai-agent',
      timeout_ms: timeout,
      wait: true,
    });

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: port,
        path: '/ask',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          Authorization: `Bearer ${token}`,
          Host: `127.0.0.1:${port}`,
        },
        timeout: timeout + 5000,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            resolve(data);
          } catch (e) {
            resolve({ ok: false, error: 'Failed to parse response: ' + body });
          }
        });
      }
    );

    req.on('error', (err) => resolve({ ok: false, error: err.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'Timeout waiting for human decision' });
    });

    req.write(postData);
    req.end();
  });
}

function checkHealth() {
  return new Promise((resolve) => {
    const config = loadConfig();
    const port = config.port || 7788;

    const req = http.get(
      {
        hostname: '127.0.0.1',
        port: port,
        path: '/health',
        headers: { Host: `127.0.0.1:${port}` },
        timeout: 1500,
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            resolve({ running: true, ...data });
          } catch (e) {
            resolve({ running: true, raw: body });
          }
        });
      }
    );

    req.on('error', () => {
      resolve({ running: false, error: 'App is not running or port is unreachable' });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ running: false, error: 'Timeout connecting to app' });
    });
  });
}

function getPendingChoice() {
  return new Promise((resolve) => {
    const config = loadConfig();
    const port = config.port || 7788;

    const req = http.get(
      {
        hostname: '127.0.0.1',
        port: port,
        path: '/action/choice',
        headers: { Host: `127.0.0.1:${port}` },
        timeout: 1500,
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            resolve({ ok: true, choice: data.choice, label: data.label });
          } catch (e) {
            resolve({ ok: false, choice: null });
          }
        });
      }
    );

    req.on('error', () => resolve({ ok: false, choice: null }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, choice: null });
    });
  });
}

function playSound(clipOrEvent) {
  return new Promise((resolve) => {
    const config = loadConfig();
    const port = config.port || 7788;
    const token = config.token || '';

    const postData = JSON.stringify({ clip: clipOrEvent });

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: port,
        path: '/play-sound',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          Authorization: `Bearer ${token}`,
          Host: `127.0.0.1:${port}`,
        },
        timeout: 2500,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve({ ok: true });
          } else {
            resolve({ ok: false, error: `HTTP ${res.statusCode}: ${body}` });
          }
        });
      }
    );

    req.on('error', (err) => resolve({ ok: false, error: err.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'Timeout playing sound' });
    });

    req.write(postData);
    req.end();
  });
}

// Tool definitions for MCP
const TOOLS = [
  {
    name: 'chiikawa_ask',
    description:
      'Prompt the user with a question and interactive 1-click choice buttons on the Chiikawa desktop mascot (e.g. Approve/Reject, Retry/Cancel). Waits for the user to click an option and returns their decision instantly. Perfect for rapid human confirmation.',
    inputSchema: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: 'The question or confirmation prompt to display to the user',
        },
        options: {
          type: 'array',
          items: { type: 'string' },
          description:
            'List of quick-action button labels (default: ["Đồng ý", "Từ chối"]). Example: ["Duyệt", "Hủy"], ["Retry", "Rollback"]',
        },
        source: {
          type: 'string',
          description: 'Calling agent or tool name (e.g. "opencode", "antigravity", "claude")',
          default: 'ai-agent',
        },
        timeout_ms: {
          type: 'number',
          description: 'Maximum time to wait for human action in milliseconds (default: 60000)',
        },
      },
      required: ['question'],
    },
  },
  {
    name: 'chiikawa_notify',
    description:
      'Display a notification bubble above the Chiikawa 3D desktop mascot and trigger an emotional animation. Can optionally include quick-action buttons.',
    inputSchema: {
      type: 'object',
      properties: {
        state: {
          type: 'string',
          enum: ['idle', 'thinking', 'success', 'alert', 'error'],
          description:
            'Emotional state: "thinking" (analyzing/working), "success" (task complete, joyful jump), "alert" (needs user attention/approval), "error" (task failed, sad slump), "idle" (calm breathing)',
        },
        message: {
          type: 'string',
          description: 'The message text to display in Chiikawa\'s speech bubble',
        },
        source: {
          type: 'string',
          description: 'Calling agent or tool name (e.g. "opencode", "antigravity", "claude")',
          default: 'ai-agent',
        },
        options: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional quick-choice buttons for the user to click',
        },
        duration_ms: {
          type: 'number',
          description: 'Duration in milliseconds to display the bubble before auto-hiding (default: 5000)',
        },
        sticky: {
          type: 'boolean',
          description: 'If true, speech bubble stays until user clicks to dismiss',
        },
        sound: {
          type: 'string',
          description:
            'Optional specific sound clip or event to play: "usagi_yaha", "usagi_una", "usagi_una_na_yaha", "usagi_huh", "usagi_haaa", "usagi_wula", "hachiware_oi", "momonga_silly", "momonga_crying", "nani_nani", "una_yaha_curry", "usagi_iyaha", "usagi_ulaulaula", "usagi_pyjamas_party"',
        },
      },
      required: ['state', 'message'],
    },
  },
  {
    name: 'chiikawa_set_state',
    description:
      'Quickly change Chiikawa\'s 3D animation state without a persistent bubble. Useful while thinking or working.',
    inputSchema: {
      type: 'object',
      properties: {
        state: {
          type: 'string',
          enum: ['idle', 'thinking', 'success', 'alert', 'error'],
          description: 'Animation state to transition to',
        },
        message: {
          type: 'string',
          description: 'Optional brief message',
        },
      },
      required: ['state'],
    },
  },
  {
    name: 'chiikawa_play_sound',
    description:
      'Play one of the 16 authentic Chiikawa voice line sound effects (e.g. usagi_yaha, usagi_una, usagi_iyaha, momonga_crying, nani_nani).',
    inputSchema: {
      type: 'object',
      properties: {
        sound: {
          type: 'string',
          description:
            'Sound clip ID or event name: "usagi_yaha", "usagi_una", "usagi_una_na_yaha", "usagi_huh", "usagi_haaa", "usagi_wula", "hachiware_oi", "momonga_silly", "momonga_crying", "nani_nani", "una_yaha_curry", "usagi_iyaha", "usagi_ulaulaula", "usagi_pyjamas_party", "task_complete", "attention_surprise", etc.',
        },
      },
      required: ['sound'],
    },
  },
  {
    name: 'chiikawa_get_user_choice',
    description:
      'Fetch the latest 1-click decision or button choice clicked by the user on the Chiikawa desktop mascot.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'chiikawa_status',
    description: 'Check if the Chiikawa Companion desktop application is currently running.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

// Handle JSON-RPC method calls
async function handleRpc(msg) {
  const { id, method, params } = msg;

  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: 'chiikawa-companion-mcp',
          version: '1.0.0',
        },
      },
    };
  }

  if (method === 'notifications/initialized') {
    return null;
  }

  if (method === 'ping') {
    return { jsonrpc: '2.0', id, result: {} };
  }

  if (method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        tools: TOOLS,
      },
    };
  }

  if (method === 'tools/call') {
    const { name, arguments: args } = params || {};

    if (name === 'chiikawa_ask') {
      const res = await askQuestion(args.question, args.options, args.source, args.timeout_ms);
      if (res && res.ok && res.choice) {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: `User selected: "${res.choice}" (1-click human confirmation on Chiikawa companion)`,
              },
            ],
          },
        };
      } else {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: res.error || 'No decision made or timed out',
              },
            ],
            isError: true,
          },
        };
      }
    }

    if (name === 'chiikawa_notify') {
      const res = await sendNotification({
        state: args.state,
        message: args.message,
        source: args.source || 'ai-agent',
        options: args.options,
        duration_ms: args.duration_ms,
        sticky: args.sticky,
        sound: args.sound,
        event: args.event,
      });

      if (res.ok) {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: `Notification sent to Chiikawa Companion [${args.state}]: "${args.message}"`,
              },
            ],
          },
        };
      } else {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: `Failed to notify Chiikawa Companion: ${res.error}`,
              },
            ],
            isError: true,
          },
        };
      }
    }

    if (name === 'chiikawa_play_sound') {
      const res = await playSound(args.sound);
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: res.ok
                ? `Played Chiikawa voice line: "${args.sound}"`
                : `Error playing sound: ${res.error}`,
            },
          ],
          isError: !res.ok,
        },
      };
    }

    if (name === 'chiikawa_set_state') {
      const res = await sendNotification({
        state: args.state,
        message: args.message || '',
        source: 'ai-agent',
        duration_ms: 2500,
      });

      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: res.ok
                ? `Chiikawa state set to "${args.state}"`
                : `Error: ${res.error}`,
            },
          ],
        },
      };
    }

    if (name === 'chiikawa_status') {
      const health = await checkHealth();
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(health, null, 2),
            },
          ],
        },
      };
    }

    if (name === 'chiikawa_get_user_choice' || name === 'chiikawa_get_user_prompt') {
      const res = await getPendingChoice();
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: res.choice
                ? `Latest choice by user: "${res.choice}"`
                : 'No pending choice from user.',
            },
          ],
        },
      };
    }

    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Tool not found: ${name}` },
    };
  }

  return {
    jsonrpc: '2.0',
    id,
    error: { code: -32601, message: `Method not found: ${method}` },
  };
}

// Setup stdio readline interface
function start() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  rl.on('line', async (line) => {
    if (!line.trim()) return;

    try {
      const msg = JSON.parse(line.trim());
      const res = await handleRpc(msg);
      if (res) {
        process.stdout.write(JSON.stringify(res) + '\n');
      }
    } catch (err) {
      process.stdout.write(
        JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32700, message: 'Parse error: ' + err.message },
        }) + '\n'
      );
    }
  });

  process.stderr.write('[Chiikawa MCP] Server running and listening on stdio\n');
}

start();
