"use client";

import * as React from "react";
import { Plus, X, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmButton } from "@/components/confirm-button";
import { buildBooleanQuery } from "@/lib/search-query";
import type { Tables } from "@/types/database";
import {
  addSearchBlock,
  renameSearchBlock,
  updateSearchBlockTerms,
  deleteSearchBlock,
} from "./actions";

type Block = Tables<"search_blocks">;

export function SearchBlocksEditor({
  projectId,
  initialBlocks,
}: {
  projectId: string;
  initialBlocks: Block[];
}) {
  const [blocks, setBlocks] = React.useState(initialBlocks);
  const [copied, setCopied] = React.useState(false);

  const query = React.useMemo(() => buildBooleanQuery(blocks), [blocks]);

  const handleAddBlock = async () => {
    try {
      const block = await addSearchBlock(projectId, `Block ${blocks.length + 1}`, blocks.length);
      setBlocks((prev) => [...prev, block]);
    } catch (err) {
      toast.error("Couldn't add block", { description: err instanceof Error ? err.message : undefined });
    }
  };

  const handleRename = async (id: string, name: string) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, name } : b)));
    try {
      await renameSearchBlock(id, projectId, name);
    } catch (err) {
      toast.error("Couldn't rename block", { description: err instanceof Error ? err.message : undefined });
    }
  };

  const handleTermsChange = async (id: string, terms: string[]) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, terms } : b)));
    try {
      await updateSearchBlockTerms(id, projectId, terms);
    } catch (err) {
      toast.error("Couldn't update terms", { description: err instanceof Error ? err.message : undefined });
    }
  };

  const handleDelete = async (id: string) => {
    const prev = blocks;
    setBlocks((p) => p.filter((b) => b.id !== id));
    try {
      await deleteSearchBlock(id, projectId);
    } catch (err) {
      setBlocks(prev);
      toast.error("Couldn't delete block", { description: err instanceof Error ? err.message : undefined });
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(query);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {blocks.map((block) => (
          <BlockCard
            key={block.id}
            block={block}
            onRename={(name) => handleRename(block.id, name)}
            onTermsChange={(terms) => handleTermsChange(block.id, terms)}
            onDelete={() => handleDelete(block.id)}
          />
        ))}
      </div>

      <Button variant="outline" onClick={handleAddBlock} className="self-start">
        <Plus className="h-4 w-4" /> Add block
      </Button>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <h3 className="font-serif text-base font-semibold">Generated boolean query</h3>
          <Button variant="outline" size="sm" onClick={handleCopy} disabled={!query}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </CardHeader>
        <CardContent>
          <code className="block whitespace-pre-wrap break-words rounded-md bg-surface-alt p-3 font-mono text-sm">
            {query || "Add terms to blocks to generate a query."}
          </code>
        </CardContent>
      </Card>
    </div>
  );
}

function BlockCard({
  block,
  onRename,
  onTermsChange,
  onDelete,
}: {
  block: Block;
  onRename: (name: string) => void;
  onTermsChange: (terms: string[]) => void;
  onDelete: () => void;
}) {
  const [name, setName] = React.useState(block.name);
  const [draft, setDraft] = React.useState("");
  const nameTimeout = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const addTerm = () => {
    const term = draft.trim();
    if (!term || block.terms.includes(term)) {
      setDraft("");
      return;
    }
    onTermsChange([...block.terms, term]);
    setDraft("");
  };

  const removeTerm = (term: string) => {
    onTermsChange(block.terms.filter((t) => t !== term));
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <Input
          value={name}
          className="border-none px-0 font-serif text-base font-semibold shadow-none focus-visible:ring-0"
          onChange={(e) => {
            setName(e.target.value);
            if (nameTimeout.current) clearTimeout(nameTimeout.current);
            nameTimeout.current = setTimeout(() => onRename(e.target.value), 500);
          }}
        />
        <ConfirmButton onConfirm={onDelete} variant="ghost" size="icon">
          <X className="h-4 w-4" />
        </ConfirmButton>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {block.terms.map((term) => (
            <Badge key={term} variant="secondary" className="gap-1 pr-1">
              {term}
              <button
                type="button"
                aria-label={`Remove ${term}`}
                className="touch-target -mr-1 flex h-5 w-5 items-center justify-center rounded-full hover:bg-border"
                onClick={() => removeTerm(term)}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTerm();
            }
          }}
          placeholder="Type a term, press Enter…"
        />
      </CardContent>
    </Card>
  );
}
