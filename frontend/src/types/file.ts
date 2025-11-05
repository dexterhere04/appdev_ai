export interface FileNode {
  id: string;
  name: string;
  type: "file" | "dir";
  children?: FileNode[];
}