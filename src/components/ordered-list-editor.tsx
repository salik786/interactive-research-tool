"use client";

import * as React from "react";
import { Plus, X, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export interface OrderedListItem {
  id: string;
  content: string;
}

export function OrderedListEditor({
  items,
  onAdd,
  onUpdate,
  onDelete,
  placeholder = "Add an item…",
  itemLabel = "item",
}: {
  items: OrderedListItem[];
  onAdd: (content: string) => Promise<OrderedListItem | void>;
  onUpdate: (id: string, content: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  placeholder?: string;
  itemLabel?: string;
}) {
  const [localItems, setLocalItems] = React.useState(items);
  const [draft, setDraft] = React.useState("");
  const [adding, setAdding] = React.useState(false);

  // Re-sync local optimistic state when the server-fetched list changes underneath it.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  React.useEffect(() => setLocalItems(items), [items]);

  const handleAdd = async () => {
    const content = draft.trim();
    if (!content) return;
    setAdding(true);
    setDraft("");
    try {
      const created = await onAdd(content);
      if (created) setLocalItems((prev) => [...prev, created]);
    } catch (err) {
      toast.error(`Couldn't add ${itemLabel}`, {
        description: err instanceof Error ? err.message : undefined,
      });
      setDraft(content);
    } finally {
      setAdding(false);
    }
  };

  const handleUpdate = async (id: string, content: string) => {
    setLocalItems((prev) => prev.map((i) => (i.id === id ? { ...i, content } : i)));
    try {
      await onUpdate(id, content);
    } catch (err) {
      toast.error(`Couldn't save ${itemLabel}`, {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const handleDelete = async (id: string) => {
    const prev = localItems;
    setLocalItems((p) => p.filter((i) => i.id !== id));
    try {
      await onDelete(id);
    } catch (err) {
      setLocalItems(prev);
      toast.error(`Couldn't remove ${itemLabel}`, {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {localItems.map((item, idx) => (
        <div key={item.id} className="flex items-center gap-2">
          <GripVertical className="h-4 w-4 shrink-0 text-text-secondary/50" />
          <span className="w-5 shrink-0 text-sm text-text-secondary">{idx + 1}.</span>
          <ListItemInput item={item} onUpdate={handleUpdate} />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Remove ${itemLabel}`}
            onClick={() => handleDelete(item.id)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <div className="flex items-center gap-2 pl-6">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder={placeholder}
          disabled={adding}
        />
        <Button type="button" variant="outline" size="icon" onClick={handleAdd} disabled={adding}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function ListItemInput({
  item,
  onUpdate,
}: {
  item: OrderedListItem;
  onUpdate: (id: string, content: string) => void;
}) {
  const [value, setValue] = React.useState(item.content);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  React.useEffect(() => setValue(item.content), [item.content]);

  return (
    <Input
      value={value}
      onChange={(e) => {
        setValue(e.target.value);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => onUpdate(item.id, e.target.value), 500);
      }}
    />
  );
}
