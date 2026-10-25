import { SCORE_RULES as R } from '../core/scoring';

export function ScoringInfo() {
  return (
    <details className="scoring-info">
      <summary>Cách tính điểm</summary>
      <ul>
        <li>
          Điểm khởi đầu <b>100</b>. Chỉ chấm khi đơn đã <b>lấy đủ</b> và mang về khu đóng gói.
        </li>
        <li>
          <b>Quãng đường:</b> trừ {R.routeWeight} × (QĐ của bạn ÷ QĐ tối ưu − 1), tối đa {R.routeMax} điểm. Ví dụ đi dài hơn tối ưu 20% → −10.
        </li>
        <li>
          <b>Thời gian:</b> thời gian chuẩn = {R.secPerMeter} s × QĐ tối ưu + {R.secPerLine} s × số SKU. Chậm hơn chuẩn mỗi {R.secPerTimePoint} s
          trừ 1 điểm, tối đa {R.timeMax}.
        </li>
        <li>
          <b>Nhặt sai:</b> −{R.wrongEach} điểm mỗi lần nhặt sản phẩm không có trong đơn, tối đa {R.wrongMax}.
        </li>
        <li>
          Xếp loại: ≥90 Xuất sắc · ≥75 Tốt · ≥60 Đạt · dưới 60 Cần cải thiện.
        </li>
        <li className="muted">
          Điểm luôn so với tuyến tối ưu <i>trên chính bố trí của lượt đó</i>, nên chỉ phản ánh kỹ năng chọn tuyến — không trộn lẫn với hiệu quả
          của việc thay đổi bố trí kho.
        </li>
      </ul>
    </details>
  );
}
