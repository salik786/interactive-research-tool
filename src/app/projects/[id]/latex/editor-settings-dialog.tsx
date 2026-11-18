"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { Settings2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DEFAULT_SETTINGS,
  FONT_LABELS,
  PREVIEW_SAMPLE,
  THEMES,
  settingsExtensions,
  type EditorSettings,
  type FontId,
  type ThemeId,
} from "@/lib/latex/editor-settings";
import { latexLanguage } from "@/lib/latex/editor-languages";

const CodeMirror = dynamic(() => import("@uiw/react-codemirror"), {
  ssr: false,
  loading: () => <Skeleton className="h-40 w-full rounded-md" />,
});

export function EditorSettingsDialog({
  open,
  onOpenChange,
  settings,
  onChange,
  appIsDark,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: EditorSettings;
  onChange: (patch: Partial<EditorSettings>) => void;
  appIsDark: boolean;
}) {
  const preview = React.useMemo(() => [latexLanguage, ...settingsExtensions(settings, appIsDark)], [settings, appIsDark]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-primary" /> Editor settings
          </DialogTitle>
          <DialogDescription>Changes apply instantly and are remembered in this browser.</DialogDescription>
        </DialogHeader>

        <div className="overflow-hidden rounded-md border border-border" aria-label="Preview">
          <CodeMirror
            value={PREVIEW_SAMPLE}
            editable={false}
            extensions={preview}
            theme="none"
            basicSetup={{
              lineNumbers: settings.lineNumbers,
              foldGutter: false,
              highlightActiveLine: false,
              highlightActiveLineGutter: false,
              autocompletion: false,
            }}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Colour theme" id="set-theme">
            <Select value={settings.theme} onValueChange={(v) => onChange({ theme: v as ThemeId })}>
              <SelectTrigger id="set-theme">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Match app (light/dark)</SelectItem>
                {Object.entries(THEMES).map(([id, t]) => (
                  <SelectItem key={id} value={id}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Font" id="set-font">
            <Select value={settings.fontFamily} onValueChange={(v) => onChange({ fontFamily: v as FontId })}>
              <SelectTrigger id="set-font">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(FONT_LABELS).map(([id, label]) => (
                  <SelectItem key={id} value={id}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label={`Font size — ${settings.fontSize}px`} id="set-size">
            <input
              id="set-size"
              type="range"
              min={11}
              max={24}
              step={1}
              value={settings.fontSize}
              onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
              className="h-11 w-full accent-[var(--primary)]"
            />
          </Field>

          <Field label="Line spacing" id="set-lh">
            <Select value={String(settings.lineHeight)} onValueChange={(v) => onChange({ lineHeight: Number(v) })}>
              <SelectTrigger id="set-lh">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1.4">Compact (1.4)</SelectItem>
                <SelectItem value="1.6">Comfortable (1.6)</SelectItem>
                <SelectItem value="1.8">Relaxed (1.8)</SelectItem>
                <SelectItem value="2">Double (2.0)</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Indentation" id="set-tab">
            <Select value={String(settings.tabSize)} onValueChange={(v) => onChange({ tabSize: Number(v) as 2 | 4 })}>
              <SelectTrigger id="set-tab">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2">2 spaces</SelectItem>
                <SelectItem value="4">4 spaces</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className="grid gap-x-6 sm:grid-cols-2">
          <Toggle label="Wrap long lines" checked={settings.wrap} onChange={(v) => onChange({ wrap: v })} />
          <Toggle label="Line numbers" checked={settings.lineNumbers} onChange={(v) => onChange({ lineNumbers: v })} />
          <Toggle label="Highlight current line" checked={settings.activeLine} onChange={(v) => onChange({ activeLine: v })} />
          <Toggle label="Auto-close brackets" checked={settings.closeBrackets} onChange={(v) => onChange({ closeBrackets: v })} />
          <Toggle
            label="Autocomplete"
            hint="\cite keys from your .bib, \ref labels, figures, environments"
            checked={settings.autocomplete}
            onChange={(v) => onChange({ autocomplete: v })}
          />
          <Toggle label="Spell check" hint="Uses your browser's dictionary" checked={settings.spellcheck} onChange={(v) => onChange({ spellcheck: v })} />
          <Toggle
            label="Auto-compile"
            hint="Recompile ~2.5 s after you stop typing"
            checked={settings.autoCompile}
            onChange={(v) => onChange({ autoCompile: v })}
          />
        </div>

        <div className="flex justify-end">
          <Button variant="ghost" onClick={() => onChange(DEFAULT_SETTINGS)}>
            <RotateCcw className="h-4 w-4" /> Reset to defaults
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = React.useId();
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border py-2 last:border-0">
      <Label htmlFor={id} className="grid cursor-pointer gap-0.5 font-normal">
        <span className="text-sm">{label}</span>
        {hint && <span className="text-xs text-text-secondary">{hint}</span>}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
