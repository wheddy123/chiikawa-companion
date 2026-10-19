# 🎙️ Chiikawa Voice Cloning & Acoustic Design Specification

> **Mục tiêu**: Tái tạo và cấu hình giọng nói chuẩn xác cho nhân vật **Chiikawa (ちいかわ)** theo đúng phong cách diễn xuất của diễn viên lồng tiếng **Aoki Haruka (青木遥)**, ứng dụng cho các mô hình AI Voice Cloning (RVC, VITS, ElevenLabs, Bark, Audiobox).

---

## 1. 📊 Thuộc tính âm học cốt lõi (Core Acoustic Features)

| Đặc tính | Chi tiết cấu hình cho AI | Thông số kỹ thuật (DSP & Formants) |
|---|---|---|
| **Độ tuổi giọng (Age)** | Trẻ sơ sinh / mới biết đi (**Toddler 2–4 tuổi**) | Chiều dài thanh quản ngắn (~8–9 cm), không có âm trầm ngực. |
| **Giới tính (Gender)** | Trọng âm trẻ thơ, do diễn viên nữ thể hiện tông rất cao | Pitch range: **C5 – A5 (440 Hz – 880 Hz)**, đỉnh ré đạt > 1000 Hz. |
| **Cao độ (Pitch - f0)** | Cực kỳ cao (**Extremely High-pitched**) | Tần số cơ bản $f_0 \approx 520 - 750\text{ Hz}$. Âm thanh mỏng, thanh mảnh. |
| **Âm sắc (Timbre)** | Trong trẻo (**Clear**), mềm mại (**Soft**), ngọng nghịu | Formants cao: $F_1 \approx 900\text{ Hz}$, $F_2 \approx 1800 - 2400\text{ Hz}$, $F_3 > 3500\text{ Hz}$. Lọc cắt bỏ dải tần $< 180\text{ Hz}$. |
| **Tốc độ nói (Tempo)** | Ngập ngừng, bối rối khi bình thường; dồn dập, ré lên khi hoảng sợ | Dynamic timing: Normal 300–600ms / âm; hoảng sợ 100–250ms / âm. |

---

## 2. 🗣️ Các đặc trưng phát âm đặc biệt (Speech Patterns & Gibberish)

Chiikawa giao tiếp bằng các từ tượng thanh và cảm thán (Onomatopoeia / Gibberish), không nói câu hoàn chỉnh của con người:

1. **Âm bập bẹ cơ bản (Toddler Babbling)**:
   - `"Wah"`: Tiếng bập bẹ mở miệng ngây thơ, kết thúc êm dịu (`chiikawa_wah.mp3`).
   - `"Fuwa"`: Thể hiện sự tò mò, ngơ ngác đáng yêu (`chiikawa_fuwa.mp3`).
   - `"Ya"`: Tiếng reo vui tươi ngắn gọn khi phấn khích (`chiikawa_ya.mp3`).
   - `"Haa"`: Tiếng thở phào nhẹ nhõm hoặc thấm mệt (`chiikawa_haa.mp3`).

2. **Tiếng kêu khi sợ hãi / bất ngờ (Panic Screech)**:
   - `"Whie?!"` / `"Eeeeyah?!"`: Chuyển đột ngột sang tông giả thanh (**Falsetto**) cực cao ($f_0 > 850\text{ Hz}$).
   - Tiếng giãy giụa `"Iya, iya, iyaaa~!"` (`chiikawa_iya.mp3`).

3. **Tiếng khóc (Cute Crying Sounds)**:
   - `"U-u-waa..."`: Nghẹn ngào nức nở với các glottal stops dồn dập (`chiikawa_crying.mp3`).

4. **Biểu cảm cơ thể (Body Movement & Rhythm)**:
   - `"Puka puka"`: Nhịp điệu bập bẹ khi lắc lư, nhảy múa hoặc được xoa đầu (`chiikawa_puka.mp3`).
   - `"Nani nani?"`: Tiếng hỏi ngây thơ khi xuất hiện bong bóng tương tác (`nani_nani.mp3`).

---

## 3. 🛠️ Quy trình thiết lập dữ liệu huấn luyện (Dataset Curation for RVC)

Khi huấn luyện mô hình Retrieval-Based Voice Conversion (**RVC v2**):

1. **Lọc sạch dữ liệu (Vocal Isolation)**:
   - Dùng **UVR5 (Ultimate Vocal Remover)** với kiến trúc **MDX-Net** (`UVR-MDX-NET-Inst_HQ_3`) hoặc **VR Architecture** để bóc tách 100% nhạc nền (BGM) và hiệu ứng tiếng động môi trường.
   - Giữ lại các đoạn biểu cảm cực đoan (la hét, khóc nấc, cười lớn) để AI bao phủ toàn bộ dải động (**Dynamic Range**).
2. **Cắt đoạn (Chunking)**:
   - Cắt audio thành các file `.wav` ngắn từ **1.5 đến 4.0 giây** (không để quá 10s tránh làm loãng trọng số f0).
   - Định dạng chuẩn: **44.1 kHz / 48 kHz, 16-bit PCM Mono**.
3. **Mô hình tham khảo cộng đồng**:
   - Repository: `Utakatatata/rvc-Chiikawa` trên Hugging Face (`Chiikawa.zip` chứa file `.pth` và `.index`).

---

## 4. 🏷️ Prompting Keywords cho Text-to-Speech (Bark, Audiobox, ElevenLabs)

Khi gọi API hoặc cấu hình prompt cho các mô hình sinh giọng nói AI:

### Tiếng Anh (English Prompting):
```text
Extremely high-pitched cute anime toddler voice, Japanese anime style, toddler babbling, expressive and emotional, soft and squeaky, high formant resonance, 3-year-old child tone, no deep chest frequencies, pure playful vocalization.
```

### Tiếng Nhật (Japanese Prompting):
```text
ちいかわ風, 超高音, 赤ちゃんのような声, 幼児の喃語, アニメ声優風, 高いピッチ, 感情豊か, 息混じりの可愛い声, 青木遥風.
```

---

## 5. 📦 Danh mục Audio Assets đã tích hợp trong App

| Tên file | Nhân vật | Mục đích kích hoạt | Thông số |
|---|---|---|---|
| `chiikawa_wah.mp3` | Chiikawa | Click tương tác nhẹ / chào hỏi | 450 ms, f0=530Hz |
| `chiikawa_ya.mp3` | Chiikawa | Hoàn thành task / nhiệm vụ thành công | 280 ms, f0=580-680Hz |
| `chiikawa_fuwa.mp3` | Chiikawa | Trạng thái suy nghĩ (`thinking`) | 550 ms, f0=480Hz |
| `chiikawa_haa.mp3` | Chiikawa | Thở phào nhẹ nhõm / nghỉ ngơi | 500 ms, f0=460Hz |
| `chiikawa_puka.mp3` | Chiikawa | Phản ứng xoa đầu (`petting`) | 580 ms, nhịp đôi |
| `chiikawa_iya.mp3` | Chiikawa | Kéo lê / từ chối / struggle | 550 ms, authentic voice |
| `chiikawa_crying.mp3` | Chiikawa | Trạng thái lỗi (`error`) | 1200 ms, authentic voice |
| `nani_nani.mp3` | Chiikawa | Câu hỏi / tương tác (`ask`) | 1100 ms, authentic voice |
| `ui_pop.wav` | UI SFX | Hiện bong bóng thoại | 105 ms, Peak -3.2dBFS |
| `ui_hover.wav` | UI SFX | Hover nút bấm lựa chọn | 20 ms, Peak -3.2dBFS |
| `ui_complete.wav` | UI SFX | Chuông hoàn thành pentatonic | 1017 ms, Peak -3.5dBFS |
| `sleep_gentle.wav` | UI SFX | Chuông nhắc ngủ 22:30 (Cmaj9) | 2798 ms, Peak -3.5dBFS |
