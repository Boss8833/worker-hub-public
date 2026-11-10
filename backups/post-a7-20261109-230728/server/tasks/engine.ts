import { runNextTask } from './runner.ts';

/**
 * Worker Engine: يدير الـ Loop اللي بيشغل المهام في الخلفية.
 */
class WorkerEngine {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private isProcessing = false;
  private lastState: 'IDLE' | 'EXECUTING' | 'ERROR' = 'IDLE';
  private lastError: string | null = null;

  /**
   * يبدأ المحرك.
   * @param intervalMs الوقت بين كل مهمة والتانية (افتراضي 5000ms)
   */
  start(intervalMs: number = 5000): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastState = 'IDLE';
    this.lastError = null;

    this.intervalId = setInterval(async () => {
      if (this.isProcessing) return; // منع التزامن
      this.isProcessing = true;
      try {
        console.error('[engine] tick at', new Date().toISOString());
        this.lastState = 'EXECUTING';
        const result = await runNextTask();
        if (result) console.error('[engine] processed task:', result.execution?.taskId);
        else console.error('[engine] no task claimed');
        if (!result) {
          this.lastState = 'IDLE';
        }
      } catch (error) {
        this.lastState = 'ERROR';
        this.lastError = error instanceof Error ? error.message : String(error);
        console.error(JSON.stringify({
          t: new Date().toISOString(),
          level: 'error',
          message: 'Worker engine error',
          error: this.lastError,
        }));
      } finally {
        this.isProcessing = false;
      }
    }, intervalMs);

    console.log(JSON.stringify({
      t: new Date().toISOString(),
      level: 'info',
      message: `Worker engine started (interval: ${intervalMs}ms)`,
    }));
  }

  /** يوقف المحرك. */
  stop(): void {
    if (!this.isRunning) return;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    this.lastState = 'IDLE';
    console.log(JSON.stringify({
      t: new Date().toISOString(),
      level: 'info',
      message: 'Worker engine stopped',
    }));
  }

  /** يرجع حالة المحرك الحالية. */
  status() {
    return {
      running: this.isRunning,
      state: this.isRunning ? this.lastState : 'STOPPED',
      lastError: this.lastError,
    };
  }
}

export const workerEngine = new WorkerEngine();
