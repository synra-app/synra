export type PluginWorkerTaskRequest<TPayload = unknown> = {
  requestId: string
  pluginId: string
  taskType: string
  payload: TPayload
  timeoutMs?: number
}

export type PluginWorkerTaskResult<TResult = unknown> = {
  requestId: string
  ok: boolean
  result?: TResult
  error?: {
    code: string
    message: string
    details?: unknown
  }
}

export type PluginWorkerRuntime = {
  executeTask<TPayload, TResult>(
    request: PluginWorkerTaskRequest<TPayload>
  ): Promise<PluginWorkerTaskResult<TResult>>
}

type WorkerResponseMessage = PluginWorkerTaskResult

type WorkerMessageEvent = {
  data: WorkerResponseMessage
}

type WorkerErrorEvent = {
  message: string
}

export type WorkerLike = {
  postMessage(message: unknown): void
  addEventListener(type: 'message', listener: (event: WorkerMessageEvent) => void): void
  addEventListener(type: 'error', listener: (event: WorkerErrorEvent) => void): void
  removeEventListener(type: 'message', listener: (event: WorkerMessageEvent) => void): void
  removeEventListener(type: 'error', listener: (event: WorkerErrorEvent) => void): void
}

export type WorkerRuntimeOptions = {
  timeoutMs?: number
  createRequestId?: () => string
}

export type LocalTaskExecutor = <TPayload, TResult>(
  request: PluginWorkerTaskRequest<TPayload>
) => Promise<PluginWorkerTaskResult<TResult>>

export class WorkerProxyRuntime implements PluginWorkerRuntime {
  private readonly pendingTasks = new Map<
    string,
    {
      resolve: (result: PluginWorkerTaskResult<unknown>) => void
      reject: (error: Error) => void
      timer: ReturnType<typeof setTimeout>
    }
  >()

  constructor(
    private readonly worker: WorkerLike,
    private readonly options: WorkerRuntimeOptions = {}
  ) {
    this.worker.addEventListener('message', this.onWorkerMessage)
    this.worker.addEventListener('error', this.onWorkerError)
  }

  async executeTask<TPayload, TResult>(
    request: PluginWorkerTaskRequest<TPayload>
  ): Promise<PluginWorkerTaskResult<TResult>> {
    const timeoutMs = request.timeoutMs ?? this.options.timeoutMs ?? 10_000
    const requestMessage: PluginWorkerTaskRequest<unknown> = {
      requestId: request.requestId,
      pluginId: request.pluginId,
      taskType: request.taskType,
      payload: request.payload,
      timeoutMs
    }

    return new Promise<PluginWorkerTaskResult<TResult>>((resolve, reject) => {
      const resolveUnknown = (result: PluginWorkerTaskResult<unknown>) => {
        resolve(result as PluginWorkerTaskResult<TResult>)
      }
      const timer = setTimeout(() => {
        this.pendingTasks.delete(request.requestId)
        reject(new Error(`Worker task '${request.requestId}' timed out.`))
      }, timeoutMs)
      this.pendingTasks.set(request.requestId, { resolve: resolveUnknown, reject, timer })
      this.worker.postMessage(requestMessage)
    })
  }

  dispose(): void {
    this.worker.removeEventListener('message', this.onWorkerMessage)
    this.worker.removeEventListener('error', this.onWorkerError)
    for (const pending of this.pendingTasks.values()) {
      clearTimeout(pending.timer)
      pending.reject(new Error('Worker runtime disposed.'))
    }
    this.pendingTasks.clear()
  }

  private readonly onWorkerMessage = (event: WorkerMessageEvent): void => {
    const response = event.data
    const pending = this.pendingTasks.get(response.requestId)
    if (!pending) {
      return
    }
    clearTimeout(pending.timer)
    this.pendingTasks.delete(response.requestId)
    pending.resolve(response)
  }

  private readonly onWorkerError = (event: WorkerErrorEvent): void => {
    for (const pending of this.pendingTasks.values()) {
      clearTimeout(pending.timer)
      pending.reject(new Error(event.message))
    }
    this.pendingTasks.clear()
  }
}

export class FallbackWorkerRuntime implements PluginWorkerRuntime {
  constructor(private readonly executeLocalTask: LocalTaskExecutor) {}

  executeTask<TPayload, TResult>(
    request: PluginWorkerTaskRequest<TPayload>
  ): Promise<PluginWorkerTaskResult<TResult>> {
    return this.executeLocalTask<TPayload, TResult>(request)
  }
}
