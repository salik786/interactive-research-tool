"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AutosaveTextarea } from "@/components/autosave-field";
import { OrderedListEditor } from "@/components/ordered-list-editor";
import {
  updateScopeField,
  addObjective,
  updateObjective,
  deleteObjective,
  reorderObjectives,
  addSubQuestion,
  updateSubQuestion,
  deleteSubQuestion,
  reorderSubQuestions,
} from "./actions";
import type { Tables } from "@/types/database";

export function ScopeForm({
  project,
  objectives,
  subQuestions,
}: {
  project: Tables<"projects">;
  objectives: Tables<"project_objectives">[];
  subQuestions: Tables<"project_sub_questions">[];
}) {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Research question</CardTitle>
          <CardDescription>The single question this review sets out to answer.</CardDescription>
        </CardHeader>
        <CardContent>
          <AutosaveTextarea
            label="Research question"
            initialValue={project.research_question}
            onSave={(v) => updateScopeField(project.id, "research_question", v)}
            rows={3}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Aim</CardTitle>
        </CardHeader>
        <CardContent>
          <AutosaveTextarea
            label="Aim"
            initialValue={project.aim}
            onSave={(v) => updateScopeField(project.id, "aim", v)}
            rows={3}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Objectives</CardTitle>
        </CardHeader>
        <CardContent>
          <OrderedListEditor
            items={objectives.map((o) => ({ id: o.id, content: o.content }))}
            itemLabel="objective"
            placeholder="Add an objective…"
            onAdd={async (content) =>
              addObjective(project.id, content, objectives.length).then((row) => ({
                id: row.id,
                content: row.content,
              }))
            }
            onUpdate={(id, content) => updateObjective(id, content, project.id)}
            onDelete={(id) => deleteObjective(id, project.id)}
            onReorder={(ids) => reorderObjectives(project.id, ids)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sub-research questions</CardTitle>
        </CardHeader>
        <CardContent>
          <OrderedListEditor
            items={subQuestions.map((q) => ({ id: q.id, content: q.content }))}
            itemLabel="sub-question"
            placeholder="Add a sub-research question…"
            onAdd={async (content) =>
              addSubQuestion(project.id, content, subQuestions.length).then((row) => ({
                id: row.id,
                content: row.content,
              }))
            }
            onUpdate={(id, content) => updateSubQuestion(id, content, project.id)}
            onDelete={(id) => deleteSubQuestion(id, project.id)}
            onReorder={(ids) => reorderSubQuestions(project.id, ids)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>PCC framework</CardTitle>
          <CardDescription>Population, Concept, Context.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <AutosaveTextarea
            label="Population"
            initialValue={project.pcc_population}
            onSave={(v) => updateScopeField(project.id, "pcc_population", v)}
            rows={2}
          />
          <AutosaveTextarea
            label="Concept"
            initialValue={project.pcc_concept}
            onSave={(v) => updateScopeField(project.id, "pcc_concept", v)}
            rows={2}
          />
          <AutosaveTextarea
            label="Context"
            initialValue={project.pcc_context}
            onSave={(v) => updateScopeField(project.id, "pcc_context", v)}
            rows={2}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Scope & boundary notes</CardTitle>
        </CardHeader>
        <CardContent>
          <AutosaveTextarea
            label="Scope & boundary notes"
            initialValue={project.scope_notes}
            onSave={(v) => updateScopeField(project.id, "scope_notes", v)}
            rows={4}
          />
        </CardContent>
      </Card>
    </div>
  );
}
