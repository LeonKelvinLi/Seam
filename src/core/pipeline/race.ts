/**
 * Fan-out helper: settle as soon as one task reports success, or when every task has settled. Tasks that are
 * still running keep going (their side effects are already booked by the task itself) and are returned so the
 * caller can log their outcome when it arrives.
 */
export async function firstPassing<T extends { ok: boolean }>(tasks: Promise<T>[]): Promise<{ done: T[]; pending: Promise<T>[] }> {
  if (!tasks.length) return { done: [], pending: [] };
  return new Promise((resolve) => {
    const settled = new Map<number, T>();
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      resolve({ done: [...settled.values()], pending: tasks.filter((_, i) => !settled.has(i)) });
    };
    tasks.forEach((task, i) => {
      task.then((r) => {
        settled.set(i, r);
        if (r.ok || settled.size === tasks.length) finish();
      }, () => {
        // runOne never rejects; a rejection here counts as a settled failure so the round cannot hang.
        settled.set(i, { ok: false } as T);
        if (settled.size === tasks.length) finish();
      });
    });
  });
}
