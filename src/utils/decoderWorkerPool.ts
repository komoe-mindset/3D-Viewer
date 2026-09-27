import * as THREE from 'three';
import { WorkerDecodeRequest, WorkerDecodeResponse } from '../workers/decoderWorker';

interface PendingTask {
  resolve: (res: WorkerDecodeResponse) => void;
  reject: (err: Error) => void;
  timeoutId: number;
}

class DecoderWorkerPool {
  private workers: Worker[] = [];
  private poolSize: number;
  private currentWorkerIndex = 0;
  private pendingTasks = new Map<string, PendingTask>();
  private isAvailable = false;

  constructor(poolSize = 2) {
    this.poolSize = poolSize;
    this.initPool();
  }

  private initPool() {
    if (typeof window === 'undefined' || typeof Worker === 'undefined') {
      return;
    }

    try {
      for (let i = 0; i < this.poolSize; i++) {
        const worker = new Worker(
          new URL('../workers/decoderWorker.ts', import.meta.url),
          { type: 'module' }
        );

        worker.onmessage = (e: MessageEvent<WorkerDecodeResponse>) => {
          const res = e.data;
          const task = this.pendingTasks.get(res.id);
          if (task) {
            clearTimeout(task.timeoutId);
            this.pendingTasks.delete(res.id);
            if (res.success) {
              task.resolve(res);
            } else {
              task.reject(new Error(res.error || 'Worker decoding error'));
            }
          }
        };

        worker.onerror = (err) => {
          console.warn('Decoder worker error:', err);
        };

        this.workers.push(worker);
      }
      this.isAvailable = true;
    } catch (err) {
      console.warn('Failed to initialize Decoder Worker Pool, will use fallback:', err);
      this.isAvailable = false;
    }
  }

  public get available(): boolean {
    return this.isAvailable && this.workers.length > 0;
  }

  public async decode(
    type: 'spz' | 'obj' | 'stl' | 'ply',
    data: { buffer?: ArrayBuffer; text?: string }
  ): Promise<WorkerDecodeResponse> {
    if (!this.available) {
      throw new Error('Worker pool is unavailable');
    }

    const id = `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const worker = this.workers[this.currentWorkerIndex];
    this.currentWorkerIndex = (this.currentWorkerIndex + 1) % this.workers.length;

    const request: WorkerDecodeRequest = {
      id,
      type,
      buffer: data.buffer,
      text: data.text,
    };

    return new Promise<WorkerDecodeResponse>((resolve, reject) => {
      // 30s timeout guard
      const timeoutId = window.setTimeout(() => {
        if (this.pendingTasks.has(id)) {
          this.pendingTasks.delete(id);
          reject(new Error(`Worker decode timeout for type: ${type}`));
        }
      }, 30000);

      this.pendingTasks.set(id, { resolve, reject, timeoutId });

      // Build transfer list of all transferable ArrayBuffers
      const transferList: Transferable[] = [];

      if (data.buffer instanceof ArrayBuffer && data.buffer.byteLength > 0) {
        transferList.push(data.buffer);
      } else if (ArrayBuffer.isView(data.buffer) && (data.buffer as any).buffer instanceof ArrayBuffer) {
        transferList.push((data.buffer as any).buffer);
      } else if (!data.buffer && data.text) {
        // Convert text payload into an ArrayBuffer so it can be transferred with zero-copy
        const encoded = new TextEncoder().encode(data.text);
        request.buffer = encoded.buffer;
        request.text = undefined;
        transferList.push(encoded.buffer);
      }

      if (transferList.length > 0) {
        worker.postMessage(request, transferList);
      } else {
        worker.postMessage(request);
      }
    });
  }

  public terminate() {
    this.workers.forEach((w) => w.terminate());
    this.workers = [];
    this.pendingTasks.clear();
    this.isAvailable = false;
  }
}

export const globalDecoderWorkerPool = new DecoderWorkerPool(2);
