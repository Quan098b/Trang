# Warehouse Picking Challenge – Thử thách tối ưu kho hàng

Trò chơi mô phỏng order picking trong kho chữ U (React + TypeScript + Vite), dùng cho workshop quản trị kho.

## Chạy trò chơi

```bash
npm install      # lần đầu
npm run dev      # http://localhost:5173
```

Các lệnh khác: `npm test` (kiểm thử logic), `npm run typecheck`, `npm run build` + `npm run preview` (bản build).

## Chơi nhiều đội (có quản trò)

1. Máy quản trò chạy `npm run dev`. Terminal in ra địa chỉ mạng, ví dụ:
   ```
   🎮 Chế độ nhiều đội
      Các đội vào:  http://192.168.1.5:5173
      Quản trò:     http://192.168.1.5:5173/#/admin   (mã PIN: 1234)
   ```
2. Quản trò mở `/#/admin`, nhập PIN, chọn đơn hàng.
3. Các đội (cùng Wi-Fi/LAN) mở địa chỉ “Các đội vào”, nhập tên đội.
4. Quản trò bấm **Bắt đầu vòng 1** → mọi đội đếm ngược 3 giây rồi chơi cùng lúc.
   Quản trò thấy quãng đường tối ưu, vị trí và tiến độ trực tiếp của từng đội.
5. **Kết thúc vòng 1** → các đội xem kết quả + tuyến tối ưu và sắp xếp lại kho.
6. **Bắt đầu vòng 2** → mỗi đội picking trên bố trí của mình. **Kết thúc** → bảng xếp hạng.

- Đổi PIN: đặt biến môi trường `ADMIN_PIN` trước khi chạy (PowerShell: `$env:ADMIN_PIN="9999"; npm run dev`).
- Đáp án tối ưu và điểm bị ẩn với các đội cho tới khi vòng kết thúc. Máy chủ kiểm tra lại tuyến đi và tự tính lại điểm.
- Trạng thái ván chơi lưu ở `.workshop/state.json` — khởi động lại máy chủ không mất kết quả.
- Nếu máy khác không vào được: cho phép Node.js qua Windows Firewall (mạng Private).
- Chế độ chơi một máy vẫn ở `/#/solo`.

## Luồng chơi

1. **Picking ban đầu** – bố trí cố ý chưa hợp lý. Bấm *Bắt đầu*, di chuyển bằng WASD/mũi tên
   (hoặc nhấp chuột lên lối đi/kệ), nhặt hàng bằng nút *Nhặt hàng* hoặc Space, mang về khu đóng gói.
2. **Tối ưu bố trí** – kéo thả để hoán đổi SKU giữa 40 ô; xem chỉ số trước/sau.
3. **Picking lại** – cùng đơn hàng trên bố trí mới.
4. **So sánh** – bảng trước/sau, tách riêng *tối ưu tuyến đường* và *tối ưu vị trí lưu trữ*.

## Cấu trúc

- `src/data/products.ts` – 40 SKU, mức nhu cầu, nhóm hàng
- `src/core/warehouse.ts` – lưới kho (1 ô = 1 m), kệ, lối đi, khu chức năng
- `src/core/pathfinding.ts` – BFS tìm đường không xuyên kệ
- `src/core/routing.ts` – Held–Karp (≤ 8 SKU, tối ưu chính xác); heuristic 2-opt (> 8 SKU, ước lượng)
- `src/core/engine.ts` – di chuyển, nhặt hàng, hoàn thành (hàm thuần)
- `src/core/scoring.ts` – công thức chấm điểm
- `src/core/layout.ts` – hoán đổi SKU và chỉ số bố trí
- `src/core/orders.ts` – đơn mẫu, đơn ngẫu nhiên có trọng số 6/3/1
- `src/components/` – giao diện; `src/hooks/usePickingGame.ts` – vòng lặp chơi
- `server/` – máy chủ nhiều đội (plugin Vite: API + Server-Sent Events); `src/team/`, `src/admin/` – giao diện đội và quản trò

Trạng thái (đơn hàng, bố trí, kết quả trước/sau, lịch sử) được lưu trong localStorage.
