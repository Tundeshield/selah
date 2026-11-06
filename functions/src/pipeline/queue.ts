import { fns, REGION } from "../lib/admin";

export type TaskName = "processSermonTask" | "renderAssetTask" | "reviseAssetTask";

export async function enqueue(name: TaskName, data: Record<string, unknown>, delaySeconds = 0) {
  const queue = fns().taskQueue(`locations/${REGION}/functions/${name}`);
  await queue.enqueue(data, delaySeconds ? { scheduleDelaySeconds: delaySeconds } : undefined);
}
