export function assertPrivateBuildDirectory(directory: string): void
export function inspectNativeHostOutput(directory: string, name: string): { file: string; exists: boolean }
export function prepareAndPublishNativeHost(options: {
  directory: string; name: string; sourceExecutable: string;
  prepare(path: string): void | Promise<void>;
  validate(path: string): void | Promise<void>;
}): Promise<{ executablePath: string; cleanupPending?: string }>