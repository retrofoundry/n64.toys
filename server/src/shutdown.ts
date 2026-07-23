export type ShutdownSignal = "SIGINT" | "SIGTERM";

export type ShutdownDependencies = {
  closeServer: (onClose: (error?: Error) => void) => void;
  closePool: () => Promise<void>;
  onSignal: (signal: ShutdownSignal, listener: () => void) => void;
  removeSignalListener: (
    signal: ShutdownSignal,
    listener: () => void,
  ) => void;
  exit: (code: number) => void;
  logError: (error: unknown) => void;
};

const shutdownSignals = ["SIGINT", "SIGTERM"] as const;

export function registerShutdown(dependencies: ShutdownDependencies): void {
  let shutdownStarted = false;

  const finish = (error?: unknown) => {
    for (const signal of shutdownSignals) {
      dependencies.removeSignalListener(signal, shutdown);
    }
    if (error !== undefined) {
      dependencies.logError(error);
    }
    dependencies.exit(error === undefined ? 0 : 1);
  };

  const closePool = (serverError?: Error) => {
    void dependencies.closePool().then(
      () => finish(serverError),
      (poolError: unknown) => finish(poolError),
    );
  };

  const shutdown = () => {
    if (shutdownStarted) {
      return;
    }
    shutdownStarted = true;
    dependencies.closeServer(closePool);
  };

  for (const signal of shutdownSignals) {
    dependencies.onSignal(signal, shutdown);
  }
}
