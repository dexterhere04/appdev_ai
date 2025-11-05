"use client";

import { useState, useEffect, useRef } from "react";
import { X, File, Folder, ChevronRight, ChevronDown, PanelLeftClose, PanelLeft } from "lucide-react";
import { FileNode } from "@/types/file";
import { FileExplorerItem } from "@/components/FileExplorer";
import { MonacoEditor } from "@/components/CodeEditor";

const STATIC_FILES: FileNode[] = [
  { id: "pubspec.yaml", name: "pubspec.yaml", type: "file" },
  {
    id: "lib",
    name: "lib",
    type: "dir",
    children: [
      { id: "lib/main.dart", name: "main.dart", type: "file" },
      { id: "lib/utils.dart", name: "utils.dart", type: "file" },
    ],
  },
  {
    id: "test",
    name: "test",
    type: "dir",
    children: [
      { id: "test/widget_test.dart", name: "widget_test.dart", type: "file" },
    ],
  },
];

const FILE_CONTENTS: Record<string, string> = {
  "pubspec.yaml": `name: my_app
description: A new Flutter project.
version: 1.0.0+1

environment:
  sdk: '>=3.0.0 <4.0.0'

dependencies:
  flutter:
    sdk: flutter
  cupertino_icons: ^1.0.2

dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^2.0.0`,
  "lib/main.dart": `import 'package:flutter/material.dart';

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Flutter Demo',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.deepPurple),
        useMaterial3: true,
      ),
      home: const MyHomePage(title: 'Flutter Demo Home Page'),
    );
  }
}

class MyHomePage extends StatefulWidget {
  const MyHomePage({super.key, required this.title});

  final String title;

  @override
  State<MyHomePage> createState() => _MyHomePageState();
}

class _MyHomePageState extends State<MyHomePage> {
  int _counter = 0;

  void _incrementCounter() {
    setState(() {
      _counter++;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: Theme.of(context).colorScheme.inversePrimary,
        title: Text(widget.title),
      ),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: <Widget>[
            const Text('You have pushed the button this many times:'),
            Text(
              '$_counter',
              style: Theme.of(context).textTheme.headlineMedium,
            ),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _incrementCounter,
        tooltip: 'Increment',
        child: const Icon(Icons.add),
      ),
    );
  }
}`,
  "lib/utils.dart": `// Utility functions for the application

String formatDate(DateTime date) {
  return '\${date.year}-\${date.month.toString().padLeft(2, '0')}-\${date.day.toString().padLeft(2, '0')}';
}

int calculateSum(List<int> numbers) {
  return numbers.fold(0, (sum, number) => sum + number);
}

bool isValidEmail(String email) {
  final emailRegex = RegExp(r'^[\\w-\\.]+@([\\w-]+\\.)+[\\w-]{2,4}$');
  return emailRegex.hasMatch(email);
}`,
  "test/widget_test.dart": `import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:my_app/main.dart';

void main() {
  testWidgets('Counter increments smoke test', (WidgetTester tester) async {
    await tester.pumpWidget(const MyApp());

    expect(find.text('0'), findsOneWidget);
    expect(find.text('1'), findsNothing);

    await tester.tap(find.byIcon(Icons.add));
    await tester.pump();

    expect(find.text('0'), findsNothing);
    expect(find.text('1'), findsOneWidget);
  });
}`,
};

export function getLanguageFromFileName(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  const langMap: Record<string, string> = {
    'dart': 'dart',
    'js': 'javascript',
    'ts': 'typescript',
    'jsx': 'javascript',
    'tsx': 'typescript',
    'json': 'json',
    'yaml': 'yaml',
    'yml': 'yaml',
    'html': 'html',
    'css': 'css',
    'md': 'markdown',
    'py': 'python',
  };
  return langMap[ext || ''] || 'plaintext';
}

export default function IDE() {
  const [openFiles, setOpenFiles] = useState<FileNode[]>([]);
  const [activeFile, setActiveFile] = useState<FileNode | null>(null);
  const [fileContents, setFileContents] = useState<Record<string, string>>({});
  const [explorerCollapsed, setExplorerCollapsed] = useState(false);

  const handleSelect = (file: FileNode) => {
    if (file.type !== "file") return;

    if (!openFiles.some((f) => f.id === file.id)) {
      setOpenFiles((prev) => [...prev, file]);
    }
    
    setActiveFile(file);
    
    if (!fileContents[file.id]) {
      setFileContents(prev => ({
        ...prev,
        [file.id]: FILE_CONTENTS[file.id] || `// ${file.name}\n\n`
      }));
    }
  };

  const handleClose = (file: FileNode, e: React.MouseEvent) => {
    e.stopPropagation();
    
    const fileIndex = openFiles.findIndex(f => f.id === file.id);
    const newOpenFiles = openFiles.filter((f) => f.id !== file.id);
    setOpenFiles(newOpenFiles);
    
    if (activeFile?.id === file.id) {
      if (newOpenFiles.length > 0) {
        const newActiveIndex = fileIndex > 0 ? fileIndex - 1 : 0;
        setActiveFile(newOpenFiles[newActiveIndex]);
      } else {
        setActiveFile(null);
      }
    }
  };

  const handleCodeChange = (value: string) => {
    if (activeFile) {
      setFileContents(prev => ({
        ...prev,
        [activeFile.id]: value
      }));
    }
  };

  return (
    <div className="flex h-screen bg-[#1e1e1e] text-gray-200">
      {/* File Explorer */}
      <div 
        className={`bg-[#252526] border-r border-[#3e3e42] flex flex-col transition-all duration-300 ${
          explorerCollapsed ? 'w-0 overflow-hidden' : 'w-64'
        }`}
      >
        <div className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-[#3e3e42] flex items-center justify-between">
          <span>Explorer</span>
          <button
            onClick={() => setExplorerCollapsed(true)}
            className="hover:bg-[#3e3e42] p-1 rounded transition-colors"
            title="Collapse Explorer"
          >
            <PanelLeftClose size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {STATIC_FILES.map((node) => (
            <FileExplorerItem key={node.id} node={node} onSelect={handleSelect} />
          ))}
        </div>
      </div>

      {/* Editor Area */}
      <div className="flex flex-col flex-1">
        {/* Tabs */}
        <div className="flex bg-[#252526] border-b border-[#3e3e42] overflow-x-auto">
          {explorerCollapsed && (
            <button
              onClick={() => setExplorerCollapsed(false)}
              className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-[#2a2d2e] transition-colors border-r border-[#3e3e42]"
              title="Open Explorer"
            >
              <PanelLeft size={16} />
            </button>
          )}
          {openFiles.length === 0 ? (
            <div className="px-4 py-2 text-xs text-gray-500">No files open</div>
          ) : (
            openFiles.map((file) => (
              <div
                key={file.id}
                onClick={() => setActiveFile(file)}
                className={`flex items-center gap-2 px-4 py-2 text-sm cursor-pointer border-r border-[#3e3e42] hover:bg-[#2a2d2e] transition-colors ${
                  activeFile?.id === file.id
                    ? "bg-[#1e1e1e] text-white"
                    : "bg-[#2d2d30] text-gray-400"
                }`}
              >
                <File size={14} />
                <span className="whitespace-nowrap">{file.name}</span>
                <button
                  onClick={(e) => handleClose(file, e)}
                  className="ml-2 hover:bg-[#3e3e42] rounded p-0.5 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Monaco Editor */}
        <div className="flex-1 overflow-hidden">
          {activeFile ? (
            <MonacoEditor
              file={activeFile}
              value={fileContents[activeFile.id] || ""}
              onChange={handleCodeChange}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <File size={48} className="mx-auto mb-4 opacity-50" />
                <p className="text-lg">Select a file to start editing</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}