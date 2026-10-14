import fs from 'node:fs';
import path from 'node:path';

/** A JSON file that is read once and written atomically (temp file + rename). */
export class JsonFile<T> {
  private writing: Promise<void> = Promise.resolve();

  constructor(
    readonly file: string,
    private readonly fallback: () => T,
  ) {}

  read(): T {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8')) as T;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        // Keep the broken file for inspection instead of silently overwriting it.
        const backup = `${this.file}.broken-${Date.now()}`;
        try {
          fs.copyFileSync(this.file, backup);
        } catch {
          /* ignore */
        }
        console.error(`[store] Could not parse ${this.file} (${(err as Error).message}); saved a copy to ${backup} and using defaults.`);
      }
      return this.fallback();
    }
  }

  /** Writes are serialised so a slow write never lands after a newer one. */
  write(value: T): Promise<void> {
    const data = JSON.stringify(value, null, 2);
    this.writing = this.writing
      .catch(() => undefined)
      .then(async () => {
        await fs.promises.mkdir(path.dirname(this.file), { recursive: true });
        const tmp = `${this.file}.${process.pid}.tmp`;
        await fs.promises.writeFile(tmp, data, 'utf8');
        await fs.promises.rename(tmp, this.file);
      });
    return this.writing;
  }
}
