export interface FileNode {
  id: string;
  name: string;
  type: "file" | "folder";
  content?: string;
  children?: FileNode[];
}
