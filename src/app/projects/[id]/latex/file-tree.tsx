"use client";

import * as React from "react";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileCode2,
  BookOpen,
  Image as ImageIcon,
  FileText,
  File as FileIcon,
  MoreVertical,
  Star,
  Pencil,
  Trash2,
  Download,
  ClipboardCopy,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { extname, formatBytes, previewKind } from "@/lib/latex/project-files";
import type { ProjectFile } from "@/lib/latex/store";

interface DirNode {
  type: "dir";
  name: string;
  path: string;
  children: TreeNode[];
}
interface FileNode {
  type: "file";
  name: string;
  path: string;
  file: ProjectFile;
}
type TreeNode = DirNode | FileNode;

export function buildTree(files: ProjectFile[]): TreeNode[] {
  const root: DirNode = { type: "dir", name: "", path: "", children: [] };
  for (const file of files) {
    const parts = file.path.split("/");
    let dir = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const path = parts.slice(0, i + 1).join("/");
      let next = dir.children.find((c): c is DirNode => c.type === "dir" && c.path === path);
      if (!next) {
        next = { type: "dir", name: parts[i], path, children: [] };
        dir.children.push(next);
      }
      dir = next;
    }
    dir.children.push({ type: "file", name: parts[parts.length - 1], path: file.path, file });
  }
  const sort = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name, undefined, { numeric: true }) : a.type === "dir" ? -1 : 1));
    for (const n of nodes) if (n.type === "dir") sort(n.children);
  };
  sort(root.children);
  return root.children;
}

function FileGlyph({ file }: { file: ProjectFile }) {
  const cls = "h-4 w-4 shrink-0";
  const ext = extname(file.path);
  if (ext === "bib") return <BookOpen className={cn(cls, "text-warning")} aria-hidden />;
  const kind = previewKind(file.path, file.kind);
  if (kind === "image") return <ImageIcon className={cn(cls, "text-success")} aria-hidden />;
  if (kind === "pdf") return <FileText className={cn(cls, "text-danger")} aria-hidden />;
  if (ext === "tex" || ext === "sty" || ext === "cls") return <FileCode2 className={cn(cls, "text-primary")} aria-hidden />;
  return <FileIcon className={cn(cls, "text-text-secondary")} aria-hidden />;
}

export interface FileTreeProps {
  files: ProjectFile[];
  activePath: string | null;
  mainPath: string | null;
  collapsed: Set<string>;
  onToggleDir: (path: string) => void;
  onOpen: (path: string) => void;
  onSetMain: (path: string) => void;
  onRename: (file: ProjectFile) => void;
  onDelete: (file: ProjectFile) => void;
  onDownload: (file: ProjectFile) => void;
  onCopySnippet: (file: ProjectFile) => void;
}

export function FileTree(props: FileTreeProps) {
  const { files, collapsed, onToggleDir } = props;
  const tree = React.useMemo(() => buildTree(files), [files]);

  const renderNodes = (nodes: TreeNode[], depth: number): React.ReactNode =>
    nodes.map((node) => {
      const indent = { paddingLeft: `${depth * 14 + 8}px` };
      if (node.type === "dir") {
        const isCollapsed = collapsed.has(node.path);
        return (
          <li key={`d:${node.path}`}>
            <button
              type="button"
              onClick={() => onToggleDir(node.path)}
              style={indent}
              className="flex min-h-11 w-full items-center gap-1.5 rounded-md pr-2 text-left text-sm hover:bg-surface-alt lg:min-h-8"
              aria-expanded={!isCollapsed}
            >
              {isCollapsed ? <ChevronRight className="h-4 w-4 shrink-0 text-text-secondary" /> : <ChevronDown className="h-4 w-4 shrink-0 text-text-secondary" />}
              {isCollapsed ? <Folder className="h-4 w-4 shrink-0 text-text-secondary" /> : <FolderOpen className="h-4 w-4 shrink-0 text-text-secondary" />}
              <span className="truncate font-medium">{node.name}</span>
            </button>
            {!isCollapsed && <ul>{renderNodes(node.children, depth + 1)}</ul>}
          </li>
        );
      }

      const { file } = node;
      const isActive = props.activePath === file.path;
      const isMain = props.mainPath === file.path;
      const canBeMain = extname(file.path) === "tex";
      const kind = previewKind(file.path, file.kind);
      return (
        <li key={`f:${file.id}`} className="group relative">
          <button
            type="button"
            onClick={() => props.onOpen(file.path)}
            style={{ ...indent, paddingLeft: `${depth * 14 + 26}px` }}
            className={cn(
              "flex min-h-11 w-full items-center gap-2 rounded-md pr-10 text-left text-sm lg:min-h-8",
              isActive ? "bg-primary/10 font-medium text-primary" : "hover:bg-surface-alt"
            )}
            aria-current={isActive ? "true" : undefined}
            title={`${file.path} · ${formatBytes(file.size)}`}
          >
            <FileGlyph file={file} />
            <span className="truncate">{node.name}</span>
            {isMain && (
              <Star className="h-3.5 w-3.5 shrink-0 fill-warning text-warning" aria-label="Main document" />
            )}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Actions for ${file.path}`}
                className="touch-target absolute right-0.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-text-secondary hover:bg-surface-alt hover:text-foreground focus-visible:opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:data-[state=open]:opacity-100"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {canBeMain && !isMain && (
                <DropdownMenuItem className="min-h-11" onSelect={() => props.onSetMain(file.path)}>
                  <Star className="h-4 w-4" /> Set as main document
                </DropdownMenuItem>
              )}
              {kind !== "text" && kind !== "other" && (
                <DropdownMenuItem className="min-h-11" onSelect={() => props.onCopySnippet(file)}>
                  <ClipboardCopy className="h-4 w-4" /> Copy figure snippet
                </DropdownMenuItem>
              )}
              <DropdownMenuItem className="min-h-11" onSelect={() => props.onRename(file)}>
                <Pencil className="h-4 w-4" /> Rename / move
              </DropdownMenuItem>
              <DropdownMenuItem className="min-h-11" onSelect={() => props.onDownload(file)}>
                <Download className="h-4 w-4" /> Download
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="min-h-11 text-danger focus:text-danger" onSelect={() => props.onDelete(file)}>
                <Trash2 className="h-4 w-4" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </li>
      );
    });

  return (
    <ul role="tree" aria-label="Project files" className="flex flex-col gap-0.5 p-2">
      {renderNodes(tree, 0)}
    </ul>
  );
}
