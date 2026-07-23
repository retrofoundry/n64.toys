export type ExitConfirmation = (message: string) => boolean | Promise<boolean>;

const EXIT_MESSAGE = "Discard your unsaved changes?";

export class NavGuard {
  constructor(
    private readonly isDirty: () => boolean,
    private readonly confirmExit: ExitConfirmation = (message) =>
      window.confirm(message),
  ) {}

  async requestExit(intent: () => void | Promise<void>): Promise<void> {
    if (this.isDirty() && !(await this.confirmExit(EXIT_MESSAGE))) return;
    await intent();
  }

  handleBeforeUnload = (event: BeforeUnloadEvent): void => {
    if (!this.isDirty()) return;
    event.preventDefault();
    event.returnValue = "";
  };
}
