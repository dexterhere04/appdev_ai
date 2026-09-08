export interface FileNode {
  id: string;
  path: string;
  name: string;
  type: "file" | "dir";
  children?: FileNode[];
}
