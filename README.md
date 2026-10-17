# 🐾 Chiikawa Companion

> Desktop mascot 3D đa nền tảng (**Windows 11** & **macOS Apple Silicon**) làm trợ lý thông báo sống động cho các coding agent chạy trong terminal (**Claude Code**, **Antigravity**, **Aider**, **Cursor**...).

MỘT source code duy nhất bằng TypeScript, Electron và Three.js, tự động rẽ nhánh hành vi theo `process.platform`. Tối ưu cực hạn cho máy Mac 8GB RAM: **<= 120MB RAM, <= 3% CPU khi hiển thị, và 0% GPU khi ẩn**.

---

## 🌟 Tính Năng Nổi Bật

- **Mascot 3D Chiikawa mượt mà**: Load trực tiếp `chiikawa.glb` bằng Three.js. Hệ thống procedural animation chuyển động tự nhiên:
  - `idle`: Thở nhẹ, nhún nhẩy chậm rãi (~30 FPS tiết kiệm tài nguyên).
  - `thinking`: Nghiêng/lắc đầu chậm tò mò khi agent đang suy nghĩ / gọi công cụ.
  - `success`: Nhảy cẫng vui sướng, nhún squash & stretch, vẫy mình khi agent làm xong.
  - `alert`: Rung nhẹ, nhảy nhấp nhổm báo động khi agent chờ bạn phê duyệt.
  - `error`: Cúi đầu thất vọng, lắc đầu nguầy nguậy khi lệnh thất bại.
  - **Vật lý co giãn Squishy Mochi**: Khi bị chuột kéo rê, thân Chiikawa kéo giãn dính như kẹo mochi theo hướng di chuyển, hai chân ngọ nguậy lủng lẳng cuống cuồng, buông chuột nảy tưng tưng đàn hồi jello spring cực yêu.
  - **Nhìn theo con trỏ chuột**: Đầu và thân Chiikawa dõi theo vị trí trỏ chuột trên màn hình.
  - **Crossfade**: Chuyển đổi trạng thái mượt mà không bị giật khung hình.
- **🔊 Starter Pack 16 Voice Lines Chiikawa chính chủ**:
  - Tích hợp 16 âm thanh soundboard đặc trưng: Usagi (*"Una"*, *"Yahaaaa"*, *"U-una-na-ya-ha"*, *"Haaaa?!"*, *"Wula!"*, *"IYAHA"*, *"Pyjamas Party"*), Hachiware (*"Oi"*), Momonga (*"Silly noise"*, *"Crying"*), Chiikawa (*"Nani nani?"*).
  - Tự động phát âm thanh ăn khớp theo từng trạng thái (thành công, đang suy nghĩ, báo động, lỗi, click chọc ghẹo).
  - Bật/tắt tiếng nhanh gọn qua menu Tray / Menu Bar.
- **💬 Chat Box tương tác 2 chiều với Agent**:
  - Bấm nút 💬 ở góc dưới hoặc click vào mascot để mở khung chat.
  - Nhập prompt/chỉ đạo trực tiếp cho coding agent, nhấn Enter hoặc "Gửi". Chiikawa sẽ hiển thị câu hỏi và chuyển tiếp cho agent qua API `/chat/prompt` hoặc MCP Server.
  - Tự động nhận diện bàn phím và nhả focus trả lại cho editor khi gõ xong.
- **Cửa sổ trong suốt & Click xuyên vùng trống**:
  - `transparent: true`, `frame: false`, `alwaysOnTop: true`.
  - Tự động click-through qua vùng trong suốt; chỉ nhận click khi con trỏ rê vào mascot hoặc bong bóng thoại.
- **Bong bóng thoại HTML/CSS**:
  - Bo tròn xinh xắn, có đuôi trỏ xuống đỉnh đầu mascot.
  - Tự co giãn theo độ dài văn bản, tự ẩn sau `duration_ms` (mặc định 5s).
  - Trạng thái `alert` hoặc `sticky: true` giữ nguyên cho đến khi bạn click để tắt.
  - Hàng đợi (queue) thông minh chứa tối đa 5 thông báo nối tiếp kèm huy hiệu số lượng.
- **Cổng nhận thông báo HTTP an toàn (127.0.0.1:7788)**:
  - Sinh Bearer token ngẫu nhiên lưu tại thư mục `userData`.
  - Khóa chặt `Host` header là `localhost`/`127.0.0.1`, không bật CORS, giới hạn body 4KB và rate-limit để chặn hoàn toàn trang web độc hại từ trình duyệt gọi vào.
- **Hành vi riêng trên Windows 11**:
  - Tự động bám sát góc dưới bên phải taskbar dựa trên `screen.getPrimaryDisplay().workArea`.
  - Lắng nghe `display-metrics-changed` để tự chỉnh vị trí khi đổi scale/độ phân giải/dời taskbar.
  - Khởi động cùng Windows (`openAtLogin`). Single instance lock.
- **Hành vi riêng trên macOS (Apple Silicon / Intel)**:
  - Ẩn khỏi Dock, hoạt động tinh gọn qua icon trên Menu Bar.
  - Tự động đứng ở **góc dưới bên phải màn hình** (ngay trên mép Dock theo `workArea`), vừa mắt và không che khuất các ứng dụng làm việc.
  - **Tương tác trực tiếp & Kéo thả (Draggable)**: Bấm giữ chuột trái vào Chiikawa để kéo đi bất kỳ vị trí nào trên màn hình; click nhẹ để Chiikawa nhảy vui vẻ.
  - Menu Bar có sẵn tùy chọn **Đặt lại vị trí góc dưới** để kéo Chiikawa về vị trí chuẩn ban đầu bất cứ lúc nào.

---

## 📁 Cấu Trúc Dự Án

```
├── .github/workflows/
│   └── build.yml               # CI/CD tự động đóng gói Win & Mac khi push tag v*
├── assets/
│   ├── chiikawa.glb            # Mô hình 3D Chiikawa (~7.7k tris)
│   └── tray.png                # Icon menu bar / system tray
├── scripts/
│   ├── build-native.js         # Script biên dịch Swift helper trên macOS
│   ├── chiikawa-notify.sh      # CLI gửi thông báo cho macOS/Linux
│   ├── chiikawa-notify.ps1     # CLI gửi thông báo cho Windows PowerShell
│   └── raycast-toggle.sh       # Raycast Script Command thủ công
├── src/
│   ├── main/
│   │   ├── config.ts           # Quản lý file cấu hình & token
│   │   ├── index.ts            # Entrypoint main process Electron
│   │   ├── server.ts           # HTTP Notification Server bảo mật
│   │   ├── tray.ts             # Menu Bar / System Tray
│   │   ├── window.ts           # Khởi tạo BrowserWindow & cursor polling
│   │   └── platform/
│   │       ├── win.ts          # Xử lý vị trí taskbar & autostart trên Windows
│   │       ├── mac.ts          # Quản lý Raycast watcher & showInactive trên macOS
│   │       └── raycast-watcher.swift # Native Swift observer phát hiện Raycast
│   ├── preload/
│   │   └── index.ts            # Context bridge an toàn giữa Main & Renderer
│   ├── renderer/
│   │   ├── animation.ts        # State machine procedural animation & crossfade
│   │   ├── bubble.ts           # Speech bubble UI, queue & dismiss handler
│   │   ├── index.html          # Giao diện HTML
│   │   ├── index.ts            # Renderer bootstrap & hit-testing
│   │   ├── scene.ts            # Three.js scene, studio lighting & GLTF loader
│   │   └── style.css           # Hiệu ứng bong bóng, responsive DPI
│   └── types/
│       └── index.ts            # Định nghĩa kiểu dữ liệu TypeScript dùng chung
├── electron-builder.json       # Cấu hình đóng gói NSIS (Windows) & DMG (macOS)
├── package.json
└── README.md
```

---

## 🚀 Cài Đặt & Chạy Môi Trường Phát Triển

### Yêu Cầu Hệ Thống
- Node.js >= 20.x, npm >= 10.x.
- **macOS**: Đã cài Command Line Tools (`xcode-select --install`) để biên dịch Swift helper nhỏ.
- **Windows**: Windows 10/11 64-bit.

### Cài Đặt
```bash
# Clone hoặc mở thư mục dự án
cd chiikaưa

# Cài đặt dependencies
npm install

# Khởi chạy chế độ phát triển
npm start
# hoặc: npm run dev
```

Sau khi chạy lần đầu, ứng dụng tự tạo token và file cấu hình tại:
- **macOS**: `~/Library/Application Support/chiikawa-companion/chiikawa-config.json`
- **Windows**: `%APPDATA%\chiikawa-companion\chiikawa-config.json`

---

## 🔔 Tích Hợp Coding Agent

### 0. Kết Nối Trực Tiếp Qua MCP (Model Context Protocol) 🔌
Hỗ trợ trực tiếp các AI Agent thế hệ mới (**OpenCode**, **Antigravity**, **Claude Code**, **Cursor**, **Cline**...). AI Agent có thể trực tiếp gọi công cụ `chiikawa_notify` hoặc `chiikawa_set_state` để biểu đạt cảm xúc và giao tiếp với bạn trong lúc lập trình!

File server MCP sẵn có tại: `scripts/chiikawa-mcp.js`.

#### Cấu hình cho OpenCode (`opencode.json`):
```json
{
  "mcp": {
    "chiikawa": {
      "command": "node",
      "args": ["/Users/wheddy/Desktop/chiikaưa/scripts/chiikawa-mcp.js"]
    }
  }
}
```

#### Cấu hình cho Antigravity / Cursor / Claude Desktop (`mcp.json` / `claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "chiikawa": {
      "command": "node",
      "args": ["/Users/wheddy/Desktop/chiikaưa/scripts/chiikawa-mcp.js"]
    }
  }
}
```

**Các công cụ MCP cung cấp cho AI Agent:**
- `chiikawa_notify`: Gửi thông báo kèm bong bóng thoại và animation (`state`, `message`, `source`, `duration_ms`, `sticky`).
- `chiikawa_set_state`: Đổi nhanh cảm xúc 3D của Chiikawa (`thinking`, `success`, `alert`, `error`, `idle`).
- `chiikawa_status`: Kiểm tra Chiikawa Companion có đang chạy hay không.

---

### 1. Dùng CLI Script Sẵn Có

#### Trên macOS / Linux (`scripts/chiikawa-notify.sh`)
```bash
# Cú pháp đầy đủ:
./scripts/chiikawa-notify.sh --state success --message "Đã hoàn thành refactor!" --source "claude-code"

# Cú pháp ngắn:
./scripts/chiikawa-notify.sh alert "Cần bạn duyệt file cấu hình" "antigravity"
./scripts/chiikawa-notify.sh thinking "Đang phân tích codebase..." "aider"
./scripts/chiikawa-notify.sh error "Lệnh test thất bại!" "terminal"
```

> **Gợi ý**: Bạn có thể copy hoặc symlink script này vào thư mục PATH (ví dụ `~/.local/bin/chiikawa-notify`):
> ```bash
> ln -sf "$(pwd)/scripts/chiikawa-notify.sh" ~/.local/bin/chiikawa-notify
> ```

#### Trên Windows PowerShell (`scripts/chiikawa-notify.ps1`)
```powershell
# Cú pháp đầy đủ:
.\scripts\chiikawa-notify.ps1 -State success -Message "Build hoàn tất rồi sếp!" -Source "claude-code"

# Trạng thái alert (cần click để tắt):
.\scripts\chiikawa-notify.ps1 -State alert -Message "Có 3 file xung đột git!" -Source "antigravity" -Sticky
```

---

### 2. Cấu Hình Hook Mẫu Cho Claude Code

Trong file cấu hình Claude Code (`~/.claude/config.json` hoặc settings hooks):

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "type": "command",
        "command": "chiikawa-notify --state thinking --message 'Chiikawa đang suy nghĩ...' --source 'claude-code'"
      }
    ],
    "Notification": [
      {
        "type": "command",
        "command": "chiikawa-notify --state alert --message 'Cần bạn duyệt thao tác!' --source 'claude-code' --sticky"
      }
    ],
    "Stop": [
      {
        "type": "command",
        "command": "chiikawa-notify --state success --message 'Nhiệm vụ xong rồi sếp ơi!' --source 'claude-code'"
      }
    ]
  }
}
```

---

### 3. Antigravity / Aider / Shell Alias Tùy Ý

Thêm vào `~/.zshrc` hoặc `~/.bashrc`:
```bash
# Wrapper thông báo khi lệnh dài chạy xong
function run_with_chiikawa() {
  chiikawa-notify --state thinking --message "Đang chạy: $*" --source "terminal"
  "$@"
  local status=$?
  if [ $status -eq 0 ]; then
    chiikawa-notify --state success --message "Lệnh hoàn tất thành công!" --source "terminal"
  else
    chiikawa-notify --state error --message "Lệnh thất bại (mã $status)!" --source "terminal"
  fi
  return $status
}

# Ví dụ chạy:
# run_with_chiikawa npm run build
```

---

### 4. Gọi Trực Tiếp Qua HTTP API (curl & PowerShell)

Token được đọc tự động trong file cấu hình, hoặc copy từ menu tray (**Sao chép token**).

#### Bằng `curl`:
```bash
TOKEN="<TOKEN_CỦA_BẠN>"

# Gửi thông báo
curl -X POST http://127.0.0.1:7788/notify \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "state": "success",
    "message": "Deploy thành công lên production!",
    "source": "antigravity",
    "duration_ms": 6000
  }'

# Kiểm tra sức khỏe server (không cần token):
curl http://127.0.0.1:7788/health
```

#### Bằng PowerShell (`Invoke-RestMethod`):
```powershell
$token = "<TOKEN_CỦA_BẠN>"
$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type"  = "application/json"
}
$body = @{
    state   = "alert"
    message = "Cần kiểm tra log gấp!"
    source  = "antigravity"
    sticky  = $true
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://127.0.0.1:7788/notify" -Method Post -Headers $headers -Body $body
```

---

### 5. Kết Nối Trực Tiếp Qua Model Context Protocol (MCP)

Chiikawa Companion cung cấp sẵn MCP Server tại `scripts/chiikawa-mcp.js` tương thích chuẩn JSON-RPC stdio. Các AI Agent (như **OpenCode**, **Antigravity**, **Claude Code**, **Cursor**) có thể tự động gọi Chiikawa thông qua tools:

- `chiikawa_notify`: Gửi thông báo kèm trạng thái cảm xúc, âm thanh tùy chọn.
- `chiikawa_play_sound`: Phát bất kỳ clip nào trong 16 voice line (ví dụ `usagi_yaha`, `usagi_una`, `usagi_iyaha`, `momonga_crying`).
- `chiikawa_set_state`: Đổi trạng thái 3D mascot tức thì (`thinking`, `success`, `alert`, `error`, `idle`).
- `chiikawa_get_user_prompt`: Đọc câu hỏi/chỉ đạo mới nhất mà người dùng vừa gõ vào khung chat của mascot.
- `chiikawa_status`: Kiểm tra app Chiikawa có đang bật hay không.

#### Cấu hình cho Claude Desktop / OpenCode / Antigravity / Cursor:
Thêm vào file cấu hình MCP (ví dụ `claude_desktop_config.json` hoặc `.gemini/settings.json`):

```json
{
  "mcpServers": {
    "chiikawa": {
      "command": "node",
      "args": ["/đường/dẫn/tới/chiikaưa/scripts/chiikawa-mcp.js"]
    }
  }
}
```

---

## 🍏 Hướng Dẫn Dành Riêng Cho macOS

### 1. Cơ Chế Bám Theo Raycast
- Ứng dụng tích hợp bộ theo dõi native viết bằng Swift (`src/main/platform/raycast-watcher.swift`).
- Khi bạn nhấn `Cmd + Space` (hoặc phím tắt mở Raycast):
  1. Helper nhận diện bundle id `com.raycast.macos` trở thành active app.
  2. Đo đạc tọa độ cửa sổ Raycast thông qua `CGWindowListCopyWindowInfo`.
  3. Chiikawa Companion tự động hiện lên (`showInactive()`) ngồi vừa khít mép trên ô gõ Raycast mà **không cướp focus nhập liệu**.
  4. Khi Raycast đóng, mascot lập tức ẩn và tắt render loop (0% GPU).

### 2. Phương Án Dự Phòng: Raycast Script Command
Nếu bạn không muốn sử dụng bộ theo dõi tự động hoặc môi trường bảo mật chặn API cửa sổ:
1. Mở Raycast Settings > Extensions > Script Commands.
2. Thêm thư mục `scripts/` vào Raycast.
3. Lệnh **Toggle Chiikawa** (`scripts/raycast-toggle.sh`) sẽ xuất hiện trong danh sách lệnh của Raycast để bạn gán phím tắt tùy ý.

### 3. Cấp Quyền & Mở Ứng Dụng Chưa Ký (Unnotarized App)
Bản build macOS mã nguồn mở không kèm chứng chỉ trả phí của Apple Developer Program nên Gatekeeper sẽ hiển thị cảnh báo khi mở lần đầu:
- **Cách 1**: Giữ phím `Control` (hoặc chuột phải) click vào `Chiikawa Companion.app` > Chọn **Open** > Nhấn **Open** xác nhận.
- **Cách 2**: Chạy lệnh gỡ cờ cách ly trong Terminal:
  ```bash
  xattr -dr com.apple.quarantine "/Applications/Chiikawa Companion.app"
  ```
- **Quyền đọc cửa sổ**: Hệ điều hành có thể hỏi quyền *Accessibility* hoặc *Screen Recording* nếu bạn muốn helper lấy chính xác kích thước cửa sổ Raycast. Nếu từ chối, ứng dụng tự động dùng tọa độ mặc định ở giữa màn hình mà vẫn hoạt động bình thường.

---

## 🪟 Hướng Dẫn Dành Riêng Cho Windows 11

- Cửa sổ tự động tính toán vùng khả dụng `screen.getPrimaryDisplay().workArea` để đặt Chiikawa đứng vững trên thanh Taskbar ở góc dưới bên phải.
- Hoạt động ổn định bất kể Taskbar đặt ở cạnh trên/dưới/trái/phải, hay màn hình có tỉ lệ DPI scaling 125%, 150%, 200%.
- Tự động lắng nghe sự kiện `display-metrics-changed` để đặt lại vị trí khi cắm màn hình ngoài hoặc đổi độ phân giải.
- Có tùy chọn **Khởi động cùng máy** trong menu khay hệ thống (System Tray).

---

## 📦 Đóng Gói Ứng Dụng (Build & Release)

```bash
# Đóng gói cho macOS (tạo file .dmg cho arm64 và x64):
npm run build:mac

# Đóng gói cho Windows (tạo file setup .exe với NSIS x64):
npm run build:win

# Đóng gói cho hệ điều hành hiện tại:
npm run dist
```
Các file cài đặt đầu ra sẽ nằm trong thư mục `release/`.

### Tự Động Hóa Với GitHub Actions
File `.github/workflows/build.yml` đã được thiết lập sẵn:
1. Tạo tag phiên bản mới và push lên GitHub:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
2. Workflow trên GitHub Actions sẽ tự động khởi chạy trên cả `macos-latest` và `windows-latest`, biên dịch ứng dụng và đính kèm các file `.dmg` và `.exe` vào GitHub Release.

---

## 🛠️ Xử Lý Lỗi Thường Gặp (Troubleshooting)

| Lỗi | Nguyên nhân | Cách khắc phục |
|---|---|---|
| **EADDRINUSE: Port 7788 is already in use** | Có ứng dụng khác đang chiếm cổng 7788 | Mở file `chiikawa-config.json` trong thư mục cấu hình và đổi `"port": 7789` (hoặc cổng trống bất kỳ), sau đó khởi động lại app. |
| **HTTP 401 Unauthorized** | Token không khớp hoặc chưa gửi header `Authorization: Bearer <token>` | Click chuột phải vào icon khay hệ thống > Chọn **Sao chép token**, hoặc kiểm tra lại file cấu hình. |
| **HTTP 403 Forbidden: Invalid Host header** | Gửi request có Host header khác `127.0.0.1` hoặc `localhost` | Đảm bảo URL gọi tới là `http://127.0.0.1:7788/notify` hoặc `http://localhost:7788/notify`. |
| **Mô hình không nhìn theo chuột** | Hệ thống bật chế độ giảm chuyển động (`prefers-reduced-motion`) | Tắt tùy chọn "Reduce motion" trong Cài đặt Trợ năng (Accessibility) của hệ điều hành nếu muốn mascot hoạt náo. |
| **macOS không tự phát hiện Raycast** | Chưa cấp quyền Accessibility hoặc Swift watcher chưa được biên dịch | Chạy `npm run build:native` hoặc dùng lệnh Raycast thủ công `scripts/raycast-toggle.sh`. |

---

## 📄 License
MIT. Tự do sử dụng và tùy biến cho quy trình làm việc của riêng bạn!
