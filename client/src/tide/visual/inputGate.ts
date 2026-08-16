export class PointerActionGate {
  private activePointers = new Set<number>();

  begin(pointerId: number, button: number, isPrimary: boolean, timeStamp: number) {
    if (button !== 0 || !isPrimary || this.activePointers.has(pointerId)) return null;
    this.activePointers.add(pointerId);
    return `pointer-${pointerId}-${timeStamp.toFixed(2)}`;
  }

  end(pointerId: number) {
    this.activePointers.delete(pointerId);
  }

  reset() {
    this.activePointers.clear();
  }
}
