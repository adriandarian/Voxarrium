export function runtimeSourceSnapshot(): {
  sha256: string;
  files: {path: string; sha256: string}[];
  scope: string;
};
