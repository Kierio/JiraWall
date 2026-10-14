import type { ServerResponse } from 'node:http';
import type { StreamMessage } from '../shared/types.js';

/** Keeps track of connected screens / admin pages and pushes messages to them. */
export class SseHub {
  private clients = new Set<ServerResponse>();
  private heartbeat: NodeJS.Timeout;

  constructor() {
    // Comment lines keep proxies and Chromium from timing the connection out.
    this.heartbeat = setInterval(() => {
      for (const res of this.clients) res.write(': ping\n\n');
    }, 25_000);
    this.heartbeat.unref();
  }

  get size() {
    return this.clients.size;
  }

  /** Takes over a raw response; `initial` messages are sent straight away. */
  add(res: ServerResponse, initial: StreamMessage[]) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 3000\n\n');
    for (const message of initial) res.write(encode(message));
    this.clients.add(res);
    res.on('close', () => this.clients.delete(res));
  }

  broadcast(message: StreamMessage) {
    const data = encode(message);
    for (const res of this.clients) res.write(data);
  }

  close() {
    clearInterval(this.heartbeat);
    for (const res of this.clients) res.end();
    this.clients.clear();
  }
}

function encode(message: StreamMessage): string {
  return `data: ${JSON.stringify(message)}\n\n`;
}
