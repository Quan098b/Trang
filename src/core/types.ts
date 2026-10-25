/** Mức nhu cầu: C = Cao, TB = Trung bình, T = Thấp */
export type Demand = 'C' | 'TB' | 'T';

/** Nhóm sản phẩm thường được mua cùng nhau */
export type GroupId = 'rang' | 'tam' | 'da' | 'trang' | 'tien';

/** Mã ô lưu trữ cố định, ví dụ "R1-01" */
export type SlotId = string;

export interface Cell {
  x: number;
  y: number;
}

export interface Product {
  id: string;
  name: string;
  demand: Demand;
  group: GroupId;
  icon: string;
  /** Vị trí trong bố trí ban đầu (theo bảng dữ liệu) */
  originalSlot: SlotId;
}

/** Bố trí kho: mỗi ô chứa đúng một sản phẩm */
export type Layout = Record<SlotId, string>;

export interface OrderLine {
  productId: string;
  qty: number;
}

export type Difficulty = 'Dễ' | 'Trung bình' | 'Khó' | 'Rất khó' | 'Ngẫu nhiên' | 'Tùy chỉnh';

export interface Order {
  id: string;
  name: string;
  difficulty: Difficulty;
  lines: OrderLine[];
}

export type Phase = 'pick1' | 'layout' | 'pick2' | 'compare';
export type ResultKey = 'before' | 'after';

export interface ScoreBreakdown {
  total: number;
  routePenalty: number;
  timePenalty: number;
  wrongPenalty: number;
  /** Quãng đường người chơi / quãng đường tối ưu */
  ratio: number;
  refTimeSec: number;
  grade: string;
}

export interface RunResult {
  key: ResultKey;
  orderId: string;
  orderName: string;
  layout: Layout;
  distance: number;
  timeSec: number;
  optimalDistance: number;
  optimalExact: boolean;
  optimalSequence: SlotId[];
  optimalPath: Cell[];
  playerPath: Cell[];
  correctLines: number;
  totalLines: number;
  unitsPicked: number;
  wrongPicks: number;
  turnarounds: number;
  score: ScoreBreakdown;
  finishedAt: string;
}
