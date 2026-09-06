/** Keep both clip uploads in one project, including when neither has finished yet. */
export function createProjectUploadQueue<T extends { state: { project: { id: string } } }>(initialProjectId: string | null = null) {
  let projectId = initialProjectId;
  let tail: Promise<void> = Promise.resolve();
  let pending = 0;
  return {
    get pending() { return pending; },
    async run(upload: (projectId: string | null) => Promise<T>): Promise<T> {
      pending++;
      const task = tail.then(() => upload(projectId)).then((result) => {
        projectId = result.state.project.id;
        return result;
      });
      // A rejected file must not prevent the other clip or a corrected file from uploading.
      tail = task.then(() => undefined, () => undefined);
      try { return await task; } finally { pending--; }
    },
  };
}
