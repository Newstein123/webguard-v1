
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "findings": {
                  Row: {
                    "created_at": string,"evidence": string,"evidence_lang": string | null,"fingerprint": string,"first_seen_scan_id": string | null,"id": string,"ignored_reason": string | null,"last_seen_scan_id": string | null,"location": string,"project_id": string,"resolved_in_scan_id": string | null,"rule_id": string,"severity": string,"status": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"evidence": string,"evidence_lang"?: string | null,"fingerprint": string,"first_seen_scan_id"?: string | null,"id"?: string,"ignored_reason"?: string | null,"last_seen_scan_id"?: string | null,"location": string,"project_id": string,"resolved_in_scan_id"?: string | null,"rule_id": string,"severity": string,"status"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"evidence"?: string,"evidence_lang"?: string | null,"fingerprint"?: string,"first_seen_scan_id"?: string | null,"id"?: string,"ignored_reason"?: string | null,"last_seen_scan_id"?: string | null,"location"?: string,"project_id"?: string,"resolved_in_scan_id"?: string | null,"rule_id"?: string,"severity"?: string,"status"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "findings_first_seen_scan_id_fkey"
      columns: ["first_seen_scan_id"]
isOneToOne: false
      referencedRelation: "scans"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "findings_last_seen_scan_id_fkey"
      columns: ["last_seen_scan_id"]
isOneToOne: false
      referencedRelation: "scans"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "findings_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "findings_resolved_in_scan_id_fkey"
      columns: ["resolved_in_scan_id"]
isOneToOne: false
      referencedRelation: "scans"
      referencedColumns: ["id"]
    }
                  ]
                },"projects": {
                  Row: {
                    "created_at": string,"id": string,"monitoring": NonNullable<Json>,"name": string,"repo": string | null,"source": string,"stack": (string)[],"url": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"monitoring"?: NonNullable<Json>,"name": string,"repo"?: string | null,"source": string,"stack"?: (string)[],"url"?: string | null,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"monitoring"?: NonNullable<Json>,"name"?: string,"repo"?: string | null,"source"?: string,"stack"?: (string)[],"url"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"scans": {
                  Row: {
                    "commit": Json | null,"duration_sec": number,"error": string | null,"finished_at": string | null,"id": string,"new_finding_ids": (string)[],"open_finding_ids": (string)[],"project_id": string,"resolved_finding_ids": (string)[],"stage_index": number,"stages": (string)[],"started_at": string,"status": string,"trigger": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "commit"?: Json | null,"duration_sec"?: number,"error"?: string | null,"finished_at"?: string | null,"id"?: string,"new_finding_ids"?: (string)[],"open_finding_ids"?: (string)[],"project_id": string,"resolved_finding_ids"?: (string)[],"stage_index"?: number,"stages"?: (string)[],"started_at"?: string,"status"?: string,"trigger": string,"user_id": string
                  }
                  Update: {
                    "commit"?: Json | null,"duration_sec"?: number,"error"?: string | null,"finished_at"?: string | null,"id"?: string,"new_finding_ids"?: (string)[],"open_finding_ids"?: (string)[],"project_id"?: string,"resolved_finding_ids"?: (string)[],"stage_index"?: number,"stages"?: (string)[],"started_at"?: string,"status"?: string,"trigger"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "scans_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            [_ in never]: never
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
