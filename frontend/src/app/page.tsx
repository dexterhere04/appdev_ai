"use client";

import { useState } from "react";
import { FileExplorer } from "@/components/FileExplorer";
import { CodeEditor } from "@/components/CodeEditor";

export default function IDE() {
  const [file, setFile] = useState("index.js");
  const [code, setCode] = useState("// Welcome to your web IDE!");

  return (
    <div className="flex h-screen w-screen">
      <FileExplorer onSelect={setFile} />
      <div className="flex flex-col flex-1">
        <div className="bg-[#1e1e1e] border-b border-gray-700 p-2 text-sm">
          {file}
        </div>
        <CodeEditor file={file} code={code} onChange={setCode} />
      </div>
    </div>
  );
}
