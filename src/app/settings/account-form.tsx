"use client";

import { AutosaveInput } from "@/components/autosave-field";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { updateProfile, updateAvatarUrl } from "./actions";

export function AccountForm({
  email,
  initialFullName,
  initialAvatarUrl,
}: {
  email: string;
  initialFullName: string;
  initialAvatarUrl: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Avatar className="h-14 w-14">
          <AvatarImage src={initialAvatarUrl || undefined} alt="" />
          <AvatarFallback className="text-lg">{(email[0] ?? "?").toUpperCase()}</AvatarFallback>
        </Avatar>
        <p className="text-sm text-text-secondary">Paste a link to an image to use as your avatar.</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Email</Label>
        <Input value={email} disabled />
      </div>
      <AutosaveInput label="Full name" initialValue={initialFullName} onSave={(v) => updateProfile(v)} />
      <AutosaveInput
        label="Avatar URL"
        initialValue={initialAvatarUrl}
        onSave={(v) => updateAvatarUrl(v)}
        placeholder="https://…"
      />
    </div>
  );
}
