import type { Demand, GroupId, Product } from '../core/types';

/** Dữ liệu gốc 40 SKU — giữ nguyên vị trí theo bảng (bố trí cố ý chưa hợp lý). */
const RAW: [slot: string, name: string, demand: Demand, group: GroupId, icon: string][] = [
  ['R1-01', 'Bàn chải đánh răng', 'C', 'rang', '🪥'],
  ['R1-02', 'Son môi', 'TB', 'trang', '💄'],
  ['R1-03', 'Nước hoa mini', 'T', 'trang', '🌸'],
  ['R1-04', 'Dầu gội', 'C', 'tam', '🧴'],
  ['R1-05', 'Mascara', 'TB', 'trang', '🖊️'],
  ['R1-06', 'Toner', 'C', 'da', '💧'],
  ['R1-07', 'Cọ trang điểm', 'TB', 'trang', '🖌️'],
  ['R1-08', 'Dao cạo râu', 'T', 'tam', '🪒'],
  ['R2-01', 'Sữa tắm', 'C', 'tam', '🛁'],
  ['R2-02', 'Khăn ướt', 'T', 'tien', '🌊'],
  ['R2-03', 'Chỉ nha khoa', 'TB', 'rang', '🧵'],
  ['R2-04', 'Gel rửa tay', 'C', 'tien', '🧼'],
  ['R2-05', 'Mặt nạ giấy', 'T', 'da', '🎭'],
  ['R2-06', 'Kem dưỡng ẩm', 'TB', 'da', '🍯'],
  ['R2-07', 'Bông tẩy trang', 'C', 'da', '⚪'],
  ['R2-08', 'Kẹp tóc', 'T', 'tien', '📎'],
  ['R3-01', 'Khẩu trang', 'C', 'tien', '😷'],
  ['R3-02', 'Phấn mắt', 'T', 'trang', '🎨'],
  ['R3-03', 'Kem nền', 'TB', 'trang', '🫙'],
  ['R3-04', 'Nước súc miệng', 'TB', 'rang', '🥤'],
  ['R3-05', 'Sữa rửa mặt', 'C', 'da', '🫧'],
  ['R3-06', 'Son dưỡng', 'T', 'da', '💋'],
  ['R3-07', 'Dầu xả', 'TB', 'tam', '🧴'],
  ['R3-08', 'Sơn móng tay', 'T', 'trang', '💅'],
  ['R4-01', 'Nước tẩy trang', 'C', 'da', '💦'],
  ['R4-02', 'Tăm bông', 'TB', 'tien', '🧷'],
  ['R4-03', 'Sữa dưỡng thể', 'TB', 'tam', '🧴'],
  ['R4-04', 'Bông tắm', 'TB', 'tam', '🧽'],
  ['R4-05', 'Phấn phủ', 'TB', 'trang', '🌫️'],
  ['R4-06', 'Nước giặt mini', 'TB', 'tien', '🧺'],
  ['R4-07', 'Khăn giấy', 'C', 'tien', '🧻'],
  ['R4-08', 'Mi giả', 'T', 'trang', '👁️'],
  ['R5-01', 'Kem chống nắng', 'C', 'da', '☀️'],
  ['R5-02', 'Kem đánh răng', 'C', 'rang', '🦷'],
  ['R5-03', 'Kẻ mắt nước', 'T', 'trang', '✏️'],
  ['R5-04', 'Lăn khử mùi', 'TB', 'tam', '🌬️'],
  ['R5-05', 'Serum dưỡng da', 'TB', 'da', '🧪'],
  ['R5-06', 'Má hồng', 'T', 'trang', '🌺'],
  ['R5-07', 'Kem dưỡng tay', 'TB', 'tam', '🤲'],
  ['R5-08', 'Gương trang điểm', 'T', 'trang', '🪞'],
];

export const PRODUCTS: Product[] = RAW.map(([slot, name, demand, group, icon], i) => ({
  id: `P${String(i + 1).padStart(2, '0')}`,
  name,
  demand,
  group,
  icon,
  originalSlot: slot,
}));

export const PRODUCT_BY_ID: Record<string, Product> = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));

/** Tra mã sản phẩm theo vị trí ban đầu (dùng khi khai báo đơn mẫu). */
export function productAtOriginal(slot: string): string {
  const p = PRODUCTS.find((x) => x.originalSlot === slot);
  if (!p) throw new Error(`Không có sản phẩm tại ${slot}`);
  return p.id;
}

export const DEMAND_INFO: Record<Demand, { label: string; short: string; weight: number }> = {
  C: { label: 'Nhu cầu cao', short: 'Cao', weight: 6 },
  TB: { label: 'Nhu cầu trung bình', short: 'Trung bình', weight: 3 },
  T: { label: 'Nhu cầu thấp', short: 'Thấp', weight: 1 },
};

export const GROUP_INFO: Record<GroupId, { label: string; color: string }> = {
  rang: { label: 'Răng miệng', color: '#38bdf8' },
  tam: { label: 'Tắm gội & cơ thể', color: '#a78bfa' },
  da: { label: 'Chăm sóc da', color: '#f472b6' },
  trang: { label: 'Trang điểm', color: '#fb923c' },
  tien: { label: 'Tiện ích & vệ sinh', color: '#94a3b8' },
};
