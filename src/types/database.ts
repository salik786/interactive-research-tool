export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type ProjectRole = "owner" | "editor" | "viewer";
export type SourceStatus = "keep" | "pending" | "excluded";
export type SearchDecision = "pending" | "keep" | "revise" | "reject";
export type CriterionType = "include" | "exclude";
export type NoteRelationType = "supports" | "contradicts" | "extends" | "related_to";
export type OutlineSectionKey = "intro" | "gap" | "approach" | "related_work";
export type AiProvider = "anthropic" | "openai";
export type AiTarget =
  | "related_work"
  | "intro"
  | "gap"
  | "approach"
  | "paper_extraction"
  | "theme_synthesis"
  | "screening_check";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          full_name: string | null;
          avatar_url: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["profiles"]["Row"]> & { id: string };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
        Relationships: [];
      };
      projects: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          research_question: string;
          aim: string;
          pcc_population: string;
          pcc_concept: string;
          pcc_context: string;
          scope_notes: string;
          identified_count: number | null;
          duplicates_removed_count: number | null;
          excluded_screening_count: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["projects"]["Row"]> & {
          owner_id: string;
          name: string;
        };
        Update: Partial<Database["public"]["Tables"]["projects"]["Row"]>;
        Relationships: [];
      };
      project_members: {
        Row: {
          project_id: string;
          user_id: string;
          role: ProjectRole;
          invited_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["project_members"]["Row"]> & {
          project_id: string;
          user_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["project_members"]["Row"]>;
        Relationships: [
          { foreignKeyName: "project_members_project_id_fkey"; columns: ["project_id"]; isOneToOne: false; referencedRelation: "projects"; referencedColumns: ["id"] },
          { foreignKeyName: "project_members_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }
        ];
      };
      pending_invites: {
        Row: {
          id: string;
          project_id: string;
          email: string;
          role: ProjectRole;
          invited_by: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["pending_invites"]["Row"]> & {
          project_id: string;
          email: string;
        };
        Update: Partial<Database["public"]["Tables"]["pending_invites"]["Row"]>;
        Relationships: [];
      };
      project_objectives: {
        Row: { id: string; project_id: string; content: string; position: number };
        Insert: Partial<Database["public"]["Tables"]["project_objectives"]["Row"]> & {
          project_id: string;
          content: string;
        };
        Update: Partial<Database["public"]["Tables"]["project_objectives"]["Row"]>;
        Relationships: [];
      };
      project_sub_questions: {
        Row: { id: string; project_id: string; content: string; position: number };
        Insert: Partial<Database["public"]["Tables"]["project_sub_questions"]["Row"]> & {
          project_id: string;
          content: string;
        };
        Update: Partial<Database["public"]["Tables"]["project_sub_questions"]["Row"]>;
        Relationships: [];
      };
      search_blocks: {
        Row: { id: string; project_id: string; name: string; terms: string[]; position: number };
        Insert: Partial<Database["public"]["Tables"]["search_blocks"]["Row"]> & {
          project_id: string;
          name: string;
        };
        Update: Partial<Database["public"]["Tables"]["search_blocks"]["Row"]>;
        Relationships: [];
      };
      search_tests: {
        Row: {
          id: string;
          project_id: string;
          database: string | null;
          version_label: string | null;
          results_count: string | null;
          relevance_pct: string | null;
          seed_papers_captured: string;
          decision: SearchDecision;
          query_string: string | null;
          notes: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["search_tests"]["Row"]> & {
          project_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["search_tests"]["Row"]>;
        Relationships: [
          { foreignKeyName: "search_tests_created_by_fkey"; columns: ["created_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }
        ];
      };
      sources: {
        Row: {
          id: string;
          citation: string;
          doi: string | null;
          authors: string | null;
          year: number | null;
          venue: string | null;
          abstract: string | null;
          pdf_url: string | null;
          library_owner_id: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["sources"]["Row"]> & {
          citation: string;
          library_owner_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["sources"]["Row"]>;
        Relationships: [
          { foreignKeyName: "sources_library_owner_id_fkey"; columns: ["library_owner_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }
        ];
      };
      notes: {
        Row: {
          id: string;
          source_id: string;
          content: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["notes"]["Row"]> & {
          source_id: string;
          content: string;
        };
        Update: Partial<Database["public"]["Tables"]["notes"]["Row"]>;
        Relationships: [
          { foreignKeyName: "notes_source_id_fkey"; columns: ["source_id"]; isOneToOne: false; referencedRelation: "sources"; referencedColumns: ["id"] }
        ];
      };
      note_links: {
        Row: {
          id: string;
          from_note_id: string;
          to_note_id: string;
          relation_type: NoteRelationType;
        };
        Insert: Partial<Database["public"]["Tables"]["note_links"]["Row"]> & {
          from_note_id: string;
          to_note_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["note_links"]["Row"]>;
        Relationships: [];
      };
      tags: {
        Row: { id: string; name: string };
        Insert: Partial<Database["public"]["Tables"]["tags"]["Row"]> & { name: string };
        Update: Partial<Database["public"]["Tables"]["tags"]["Row"]>;
        Relationships: [];
      };
      note_tags: {
        Row: { note_id: string; tag_id: string };
        Insert: Database["public"]["Tables"]["note_tags"]["Row"];
        Update: Partial<Database["public"]["Tables"]["note_tags"]["Row"]>;
        Relationships: [];
      };
      project_sources: {
        Row: {
          id: string;
          project_id: string;
          source_id: string;
          method: string | null;
          dataset: string | null;
          key_result: string | null;
          theme: string | null;
          status: SourceStatus;
          exclusion_reason: string | null;
          relevance_note: string | null;
          added_by: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["project_sources"]["Row"]> & {
          project_id: string;
          source_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["project_sources"]["Row"]>;
        Relationships: [
          { foreignKeyName: "project_sources_project_id_fkey"; columns: ["project_id"]; isOneToOne: false; referencedRelation: "projects"; referencedColumns: ["id"] },
          { foreignKeyName: "project_sources_source_id_fkey"; columns: ["source_id"]; isOneToOne: false; referencedRelation: "sources"; referencedColumns: ["id"] }
        ];
      };
      project_notes: {
        Row: {
          id: string;
          project_id: string;
          note_id: string;
          theme: string | null;
          added_by: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["project_notes"]["Row"]> & {
          project_id: string;
          note_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["project_notes"]["Row"]>;
        Relationships: [
          { foreignKeyName: "project_notes_project_id_fkey"; columns: ["project_id"]; isOneToOne: false; referencedRelation: "projects"; referencedColumns: ["id"] },
          { foreignKeyName: "project_notes_note_id_fkey"; columns: ["note_id"]; isOneToOne: false; referencedRelation: "notes"; referencedColumns: ["id"] }
        ];
      };
      screening_criteria: {
        Row: {
          id: string;
          project_id: string;
          type: CriterionType;
          content: string;
          position: number;
        };
        Insert: Partial<Database["public"]["Tables"]["screening_criteria"]["Row"]> & {
          project_id: string;
          type: CriterionType;
          content: string;
        };
        Update: Partial<Database["public"]["Tables"]["screening_criteria"]["Row"]>;
        Relationships: [];
      };
      theme_synthesis: {
        Row: {
          id: string;
          project_id: string;
          theme_name: string;
          content: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["theme_synthesis"]["Row"]> & {
          project_id: string;
          theme_name: string;
        };
        Update: Partial<Database["public"]["Tables"]["theme_synthesis"]["Row"]>;
        Relationships: [];
      };
      outline_sections: {
        Row: {
          id: string;
          project_id: string;
          section_key: OutlineSectionKey;
          content: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["outline_sections"]["Row"]> & {
          project_id: string;
          section_key: OutlineSectionKey;
        };
        Update: Partial<Database["public"]["Tables"]["outline_sections"]["Row"]>;
        Relationships: [];
      };
      ai_generations: {
        Row: {
          id: string;
          project_id: string;
          target: string;
          provider: AiProvider | null;
          model: string | null;
          input_sections: Json | null;
          prompt_text: string | null;
          response_text: string | null;
          inserted_into: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["ai_generations"]["Row"]> & {
          project_id: string;
          target: string;
        };
        Update: Partial<Database["public"]["Tables"]["ai_generations"]["Row"]>;
        Relationships: [
          { foreignKeyName: "ai_generations_created_by_fkey"; columns: ["created_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_project_member: {
        Args: { pid: string };
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
  };
}

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
