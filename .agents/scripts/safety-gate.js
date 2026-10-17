#!/usr/bin/env node
/**
 * Chiikawa Native Safety Gate (Antigravity PreToolUse Hook)
 * Intercepts risky or destructive CLI commands before execution.
 * Prompts the operator via Chiikawa Desktop Mascot (:7788 /ask) with 1-click Authorize/Deny.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

// High-risk destructive commands that require operator authorization
const DANGEROUS_PATTERNS = [
  {
    regex: /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|[a-zA-Z]*f[a-zA-Z]*r|-r|-R)\s+/i,
    label: 'Xoá thư mục/tập tin đệ quy (rm -rf / rm -r)',
  },
  {
    regex: /\bgit\s+reset\s+--hard/i,
    label: 'Huỷ toàn bộ thay đổi Git (git reset --hard)',
  },
  {
    regex: /\bgit\s+clean\s+(-[a-zA-Z]*f)/i,
    label: 'Xoá vĩnh viễn untracked files (git clean -f)',
  },
  {
    regex: /\bgit\s+push\s+.*(--force|-f\b)/i,
    label: 'Ghi đè lịch sử Git từ xa (git push --force)',
  },
  {
    regex: /\bmkfs(\.[a-z0-9]+)?\b/i,
    label: 'Format phân vùng đĩa (mkfs)',
  },
  {
    regex: /\bdd\s+if=.*of=\/dev/i,
    label: 'Ghi đè thiết bị phần cứng (dd of=/dev)',
  },
  {
    regex: /\bfdisk\b/i,
    label: 'Thao tác phân vùng ổ cứng (fdisk)',
  },
  {
    regex: /\bchmod\s+(-R\s+)?(777|000)\s+(\/|~|\$HOME|\.\.)/i,
    label: 'Gán quyền hệ thống nguy hiểm (chmod 777/000)',
  },
  {
    regex: /\bdrop\s+(database|table)\b/i,
    label: 'Xoá database / table SQL',
  },
  {
    regex: /\bkill\s+-9\s+1\b/i,
    label: 'Diệt tiến trình init hệ điều hành',
  },
  {
    regex: /\b(shutdown|reboot)\b/i,
    label: 'Tắt hoặc khởi động lại máy tính',
  },
];

function getChiikawaConfig() {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const possiblePaths = [
    path.join(home, 'Library/Application Support/chiikawa-companion/chiikawa-config.json'),
    path.join(process.env.APPDATA || '', 'chiikawa-companion/chiikawa-config.json'),
  ];

  for (const cfgPath of possiblePaths) {
    if (fs.existsSync(cfgPath)) {
      try {
        const raw = fs.readFileSync(cfgPath, 'utf8');
        return JSON.parse(raw);
      } catch (e) {
        // Continue checking
      }
    }
  }

  return { port: 7788, token: process.env.CHIIKAWA_TOKEN || '' };
}

function askChiikawa(config, commandLine, patternLabel) {
  return new Promise((resolve) => {
    const postData = JSON.stringify({
      question: `⚠️ Cảnh báo an toàn! Antigravity định chạy lệnh:\n\n\`${commandLine}\`\n\n[Loại rủi ro: ${patternLabel}]\nBạn có cho phép thực thi không?`,
      state: 'alert',
      sound: 'nani_nani',
      options: [
        { id: 'allow', label: 'Cho phép (Authorize) 🚀', style: 'danger', sound: 'usagi_yaha' },
        { id: 'deny', label: 'Chặn lại (Block) 🛡️', style: 'primary', sound: 'momonga_crying' },
      ],
      timeout_ms: 30000,
    });

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: config.port || 7788,
        path: '/ask',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          Authorization: `Bearer ${config.token || ''}`,
        },
        timeout: 32000,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            resolve({ ok: true, data });
          } catch (e) {
            resolve({ ok: false, error: 'Invalid JSON response from Chiikawa' });
          }
        });
      }
    );

    req.on('error', (err) => {
      resolve({ ok: false, error: err.message });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'Chiikawa request timed out' });
    });

    req.write(postData);
    req.end();
  });
}

let inputData = '';
process.stdin.setEncoding('utf8');

process.stdin.on('data', (chunk) => {
  inputData += chunk;
});

process.stdin.on('end', async () => {
  try {
    if (!inputData.trim()) {
      process.stdout.write(JSON.stringify({ decision: 'allow' }));
      return;
    }

    const payload = JSON.parse(inputData);
    const toolCall = payload.toolCall;

    if (toolCall && toolCall.name === 'run_command') {
      const commandLine = toolCall.args?.CommandLine || '';

      // Check if command matches any dangerous pattern
      let matchedLabel = null;
      for (const item of DANGEROUS_PATTERNS) {
        if (item.regex.test(commandLine)) {
          matchedLabel = item.label;
          break;
        }
      }

      if (matchedLabel) {
        const config = getChiikawaConfig();
        const result = await askChiikawa(config, commandLine, matchedLabel);

        if (result.ok && result.data) {
          if (result.data.choice === 'allow') {
            process.stdout.write(JSON.stringify({ decision: 'allow' }));
            return;
          } else {
            process.stdout.write(
              JSON.stringify({
                decision: 'deny',
                reason: `Chiikawa Safety Gate: Thao tác bị Operator từ chối trên Desktop Mascot (${matchedLabel}).`,
              })
            );
            return;
          }
        } else {
          // Mascot offline or unreachable: fallback to native CLI confirmation
          process.stdout.write(
            JSON.stringify({
              decision: 'force_ask',
              reason: `Chiikawa Safety Gate: Phát hiện lệnh rủi ro cao (${matchedLabel}). Mascot không phản hồi, yêu cầu xác nhận qua CLI.`,
            })
          );
          return;
        }
      }
    }

    // Default: allow safe tools
    process.stdout.write(JSON.stringify({ decision: 'allow' }));
  } catch (err) {
    // Fail-safe: allow on unexpected hook exception
    process.stdout.write(JSON.stringify({ decision: 'allow' }));
  }
});
