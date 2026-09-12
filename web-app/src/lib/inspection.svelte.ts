import { PAGE_SIZE, continueTo, nextDraw, pageCount, stepLine, type StepKind, type Trace, type InspectionRow } from "./inspection";

export class Inspection {
  open = $state(false);
  trace = $state.raw<Trace | null>(null);
  selectedSeq = $state<number | null>(null);
  page = $state(0);
  stale = $state(false);
  presented = $state<boolean | null>(null);
  cursorLine = $state<number | null>(null);
  breakpoints = $state<number[]>([]);
  navigation = $state(0);

  get selected(): InspectionRow | undefined {
    return this.trace?.rows.find(row => row.seq === this.selectedSeq);
  }
  get linkedLine(): number | null {
    return this.open && !this.stale ? this.selected?.line ?? null : null;
  }
  capture(trace: Trace): void {
    this.trace = trace;
    this.presented = null;
    this.stale = false;
    if (!trace.rows.some(row => row.seq === this.selectedSeq)) this.selectedSeq = null;
    this.page = Math.min(this.page, pageCount(trace.rows.length) - 1);
    if (this.selectedSeq !== null) this.page = Math.floor(this.selectedSeq / PAGE_SIZE);
  }
  select(seq: number, navigate = true): boolean {
    if (!this.open || this.stale || !this.trace?.rows.some(row => row.seq === seq)) return false;
    this.selectedSeq = seq;
    this.presented = null;
    this.page = Math.floor(seq / PAGE_SIZE);
    if (navigate) {
      this.cursorLine = this.selected?.line ?? null;
      this.navigation++;
    }
    return true;
  }
  browseLine(line: number): void {
    if (!this.open || this.stale) return;
    this.cursorLine = line;
  }
  step(delta: number): number | null {
    const rows = this.trace?.rows ?? [];
    const index = rows.findIndex(row => row.seq === this.selectedSeq);
    const row = rows[index < 0 ? (delta > 0 ? 0 : rows.length - 1) : index + delta];
    return row?.seq ?? null;
  }
  nextDraw(): number | null { return nextDraw(this.trace?.rows ?? [], this.selectedSeq); }
  stepLine(kind: StepKind, dir: 1 | -1): number | null { return stepLine(this.trace?.rows ?? [], this.selectedSeq, dir, kind); }
  continueTo(dir: 1 | -1): number | null { return continueTo(this.trace?.rows ?? [], this.selectedSeq, this.breakpoints, dir); }
  /** Where a fresh run stops: the first breakpoint hit, or the whole frame. */
  entrySeq(): number | null {
    const rows = this.trace?.rows ?? [];
    return continueTo(rows, null, this.breakpoints, 1) ?? rows.at(-1)?.seq ?? null;
  }
  invalidate(): void { if (this.open) this.stale = true; this.cursorLine = null; this.presented = null; }
  close(): void {
    this.open = false; this.trace = null; this.selectedSeq = null; this.presented = null;
    this.page = 0; this.stale = false; this.cursorLine = null;
  }
}
