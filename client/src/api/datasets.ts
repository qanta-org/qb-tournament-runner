export interface DatasetPacketInfo {
  id: string;
  name: string;
  tossupFile: string;
  bonusFile?: string;
  tossupCount?: number;
  bonusCount?: number;
}

export interface DatasetInfo {
  id: string;
  name: string;
  type: 'simple' | 'tournament';
  hasTossups: boolean;
  hasBonuses: boolean;
  tossupFile?: string;
  bonusFile?: string;
  packets?: DatasetPacketInfo[];
  responsesDir?: string;
}

