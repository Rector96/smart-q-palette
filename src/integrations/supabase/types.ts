export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      custom_exam_results: {
        Row: {
          answers: Json | null
          completed_at: string | null
          exam_id: string | null
          id: string
          score: number | null
          student_name: string
          total_questions: number | null
        }
        Insert: {
          answers?: Json | null
          completed_at?: string | null
          exam_id?: string | null
          id?: string
          score?: number | null
          student_name: string
          total_questions?: number | null
        }
        Update: {
          answers?: Json | null
          completed_at?: string | null
          exam_id?: string | null
          id?: string
          score?: number | null
          student_name?: string
          total_questions?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_exam_results_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "custom_exams"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_exams: {
        Row: {
          created_at: string | null
          creator_id: string
          duration_minutes: number | null
          expires_at: string | null
          id: string
          instructions: string | null
          is_permanent: boolean | null
          questions: Json
          share_code: string
          title: string
        }
        Insert: {
          created_at?: string | null
          creator_id: string
          duration_minutes?: number | null
          expires_at?: string | null
          id?: string
          instructions?: string | null
          is_permanent?: boolean | null
          questions?: Json
          share_code: string
          title: string
        }
        Update: {
          created_at?: string | null
          creator_id?: string
          duration_minutes?: number | null
          expires_at?: string | null
          id?: string
          instructions?: string | null
          is_permanent?: boolean | null
          questions?: Json
          share_code?: string
          title?: string
        }
        Relationships: []
      }
      digital_library: {
        Row: {
          cover_image_url: string | null
          created_at: string | null
          description: string | null
          full_file_url: string | null
          id: string
          is_free: boolean | null
          preview_file_url: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          cover_image_url?: string | null
          created_at?: string | null
          description?: string | null
          full_file_url?: string | null
          id?: string
          is_free?: boolean | null
          preview_file_url?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          cover_image_url?: string | null
          created_at?: string | null
          description?: string | null
          full_file_url?: string | null
          id?: string
          is_free?: boolean | null
          preview_file_url?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      exam_sessions: {
        Row: {
          completed: boolean
          completed_at: string | null
          correct_answers: number
          duration_seconds: number | null
          id: string
          mode: string
          score_percentage: number | null
          started_at: string
          subjects: string[]
          total_questions: number
          user_id: string
        }
        Insert: {
          completed?: boolean
          completed_at?: string | null
          correct_answers?: number
          duration_seconds?: number | null
          id?: string
          mode: string
          score_percentage?: number | null
          started_at?: string
          subjects?: string[]
          total_questions?: number
          user_id: string
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          correct_answers?: number
          duration_seconds?: number | null
          id?: string
          mode?: string
          score_percentage?: number | null
          started_at?: string
          subjects?: string[]
          total_questions?: number
          user_id?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          payment_method: string | null
          paystack_reference: string | null
          reference: string | null
          status: string
          updated_at: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          payment_method?: string | null
          paystack_reference?: string | null
          reference?: string | null
          status?: string
          updated_at?: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          payment_method?: string | null
          paystack_reference?: string | null
          reference?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          ai_builder_usage: number | null
          ai_tutor_usage: number | null
          created_at: string
          full_name: string | null
          id: string
          is_subscribed: boolean
          preferred_subjects: string[] | null
          trial_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_builder_usage?: number | null
          ai_tutor_usage?: number | null
          created_at?: string
          full_name?: string | null
          id?: string
          is_subscribed?: boolean
          preferred_subjects?: string[] | null
          trial_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_builder_usage?: number | null
          ai_tutor_usage?: number | null
          created_at?: string
          full_name?: string | null
          id?: string
          is_subscribed?: boolean
          preferred_subjects?: string[] | null
          trial_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      questions: {
        Row: {
          correct_answer: string
          created_at: string
          difficulty: string
          explanation: string | null
          id: string
          option_a: string
          option_b: string
          option_c: string
          option_d: string
          passage: string | null
          question_text: string
          question_type: string | null
          subject: string
          topic: string
          year: number | null
        }
        Insert: {
          correct_answer: string
          created_at?: string
          difficulty?: string
          explanation?: string | null
          id?: string
          option_a: string
          option_b: string
          option_c: string
          option_d: string
          passage?: string | null
          question_text: string
          question_type?: string | null
          subject: string
          topic: string
          year?: number | null
        }
        Update: {
          correct_answer?: string
          created_at?: string
          difficulty?: string
          explanation?: string | null
          id?: string
          option_a?: string
          option_b?: string
          option_c?: string
          option_d?: string
          passage?: string | null
          question_text?: string
          question_type?: string | null
          subject?: string
          topic?: string
          year?: number | null
        }
        Relationships: []
      }
      shared_exams: {
        Row: {
          created_at: string
          creator_id: string
          id: string
          mode: string
          session_id: string | null
          share_code: string
          subjects: string[]
          timer_minutes: number | null
        }
        Insert: {
          created_at?: string
          creator_id: string
          id?: string
          mode: string
          session_id?: string | null
          share_code: string
          subjects?: string[]
          timer_minutes?: number | null
        }
        Update: {
          created_at?: string
          creator_id?: string
          id?: string
          mode?: string
          session_id?: string | null
          share_code?: string
          subjects?: string[]
          timer_minutes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "shared_exams_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "exam_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_history: {
        Row: {
          answered_at: string
          id: string
          is_correct: boolean
          question_id: string
          selected_answer: string
          session_id: string | null
          time_spent_seconds: number | null
          user_id: string
        }
        Insert: {
          answered_at?: string
          id?: string
          is_correct: boolean
          question_id: string
          selected_answer: string
          session_id?: string | null
          time_spent_seconds?: number | null
          user_id: string
        }
        Update: {
          answered_at?: string
          id?: string
          is_correct?: boolean
          question_id?: string
          selected_answer?: string
          session_id?: string | null
          time_spent_seconds?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_history_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
