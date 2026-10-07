export interface CaptureReport<Record> {
  id: string;
  endedAtMs: number | null;
  pendingSpans: number;
  records: Record[];
}

export interface TransitionCapture<Record = unknown> {
  stage<Report extends CaptureReport<Record>>(reports: Report[]): (Omit<Report, 'records'> & { recordCount: number })[];
  read(id: string): { id: string; offset: number; records: Record[]; done: boolean };
  status(): { pendingReports: number; maximumReports: number; maximumRecords: number; maximumBytes: number; maximumRows: number };
  clear(): void;
}

export function installTransitionCapture(target?: object): void;
