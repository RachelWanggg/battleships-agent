import { mkdir, appendFile } from "node:fs/promises";
import { dirname } from "node:path";

export type TelemetryEvent = {
  timestamp: string;
  event: string;
  data: Record<string, unknown>;
};

export class TelemetryWriter {
  constructor(private readonly filePath: string) {}

  async write(event: string, data: Record<string, unknown>): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const payload: TelemetryEvent = {
      timestamp: new Date().toISOString(),
      event,
      data
    };
    await appendFile(this.filePath, `${JSON.stringify(payload)}\n`);
  }
}
