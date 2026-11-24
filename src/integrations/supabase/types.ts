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
          author: string | null
          category: string
          cover_image_url: string | null
          created_at: string | null
          description: string | null
          full_file_url: string | null
          id: string
          is_free: boolean | null
          preview_file_url: string | null
          summary: string | null
          target_level: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          author?: string | null
          category?: string
          cover_image_url?: string | null
          created_at?: string | null
          description?: string | null
          full_file_url?: string | null
          id?: string
          is_free?: boolean | null
          preview_file_url?: string | null
          summary?: string | null
          target_level?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          author?: string | null
          category?: string
          cover_image_url?: string | null
          created_at?: string | null
          description?: string | null
          full_file_url?: string | null
          id?: string
          is_free?: boolean | null
          preview_file_url?: string | null
          summary?: string | null
          target_level?: string | null
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
      online_presence: {
        Row: {
          created_at: string
          current_page: string | null
          current_subject: string | null
          display_name: string
          id: string
          last_seen: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_page?: string | null
          current_subject?: string | null
          display_name?: string
          id?: string
          last_seen?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_page?: string | null
          current_subject?: string | null
          display_name?: string
          id?: string
          last_seen?: string
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
          plan_id: string | null
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
          plan_id?: string | null
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
          plan_id?: string | null
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
          free_live_quiz_used: number
          email: string | null
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
          free_live_quiz_used?: number
          email?: string | null
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
          free_live_quiz_used?: number
          email?: string | null
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
          examination: string | null
          exam_hint: string | null
          explanation: string | null
          id: string
          option_a: string
          option_b: string
          option_c: string
          option_d: string
          option_e: string | null
          diagram_url: string | null
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
          examination?: string | null
          exam_hint?: string | null
          explanation?: string | null
          id?: string
          option_a: string
          option_b: string
          option_c: string
          option_d: string
          option_e?: string | null
          diagram_url?: string | null
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
          examination?: string | null
          exam_hint?: string | null
          explanation?: string | null
          id?: string
          option_a?: string
          option_b?: string
          option_c?: string
          option_d?: string
          option_e?: string | null
          diagram_url?: string | null
          passage?: string | null
          question_text?: string
          question_type?: string | null
          subject?: string
          topic?: string
          year?: number | null
        }
        Relationships: []
      }
      quiz_answers: {
        Row: {
          answered_at: string
          id: string
          is_correct: boolean
          question_index: number
          room_id: string
          selected_option: string | null
          time_taken: number
          user_id: string
        }
        Insert: {
          answered_at?: string
          id?: string
          is_correct?: boolean
          question_index: number
          room_id: string
          selected_option?: string | null
          time_taken?: number
          user_id: string
        }
        Update: {
          answered_at?: string
          id?: string
          is_correct?: boolean
          question_index?: number
          room_id?: string
          selected_option?: string | null
          time_taken?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_answers_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "quiz_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_participants: {
        Row: {
          display_name: string
          id: string
          is_connected: boolean
          joined_at: string
          room_id: string
          score: number
          user_id: string
        }
        Insert: {
          display_name?: string
          id?: string
          is_connected?: boolean
          joined_at?: string
          room_id: string
          score?: number
          user_id: string
        }
        Update: {
          display_name?: string
          id?: string
          is_connected?: boolean
          joined_at?: string
          room_id?: string
          score?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_participants_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "quiz_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_rooms: {
        Row: {
          created_at: string
          current_question_index: number
          expires_at: string | null
          host_id: string
          id: string
          num_questions: number
          questions: Json
          room_code: string
          status: string
          subject: string
          time_per_question: number
        }
        Insert: {
          created_at?: string
          current_question_index?: number
          expires_at?: string | null
          host_id: string
          id?: string
          num_questions?: number
          questions?: Json
          room_code: string
          status?: string
          subject: string
          time_per_question?: number
        }
        Update: {
          created_at?: string
          current_question_index?: number
          expires_at?: string | null
          host_id?: string
          id?: string
          num_questions?: number
          questions?: Json
          room_code?: string
          status?: string
          subject?: string
          time_per_question?: number
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
      student_question_reviews: {
        Row: {
          created_at: string
          due_at: string
          id: string
          interval_days: number
          last_result: boolean
          last_reviewed_at: string
          question_id: string
          repetitions: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          due_at?: string
          id?: string
          interval_days?: number
          last_result?: boolean
          last_reviewed_at?: string
          question_id: string
          repetitions?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          due_at?: string
          id?: string
          interval_days?: number
          last_result?: boolean
          last_reviewed_at?: string
          question_id?: string
          repetitions?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_question_reviews_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      student_topic_mastery: {
        Row: {
          attempts: number
          correct_answers: number
          created_at: string
          id: string
          last_attempt_at: string
          subject: string
          topic: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          correct_answers?: number
          created_at?: string
          id?: string
          last_attempt_at?: string
          subject: string
          topic: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          correct_answers?: number
          created_at?: string
          id?: string
          last_attempt_at?: string
          subject?: string
          topic?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      user_seen_questions: {
        Row: {
          id: string
          question_id: string
          seen_at: string
          user_id: string
        }
        Insert: {
          id?: string
          question_id: string
          seen_at?: string
          user_id: string
        }
        Update: {
          id?: string
          question_id?: string
          seen_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_seen_questions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_seen_question_ids: {
        Args: { p_user_id: string; p_question_ids: string[] }
        Returns: string[]
      }
      start_cbt_session: {
        Args: {
          p_user_id: string
          p_mode: string
          p_subjects: string[]
          p_total_questions: number
          p_examination: string
          p_exam_year: number | null
          p_questions: Json
        }
        Returns: Json
      }
      admin_record_manual_payment: {
        Args: { _amount: number; _note: string; _plan_id?: string | null; _reference: string; _target_user_id: string }
        Returns: string
      }
      admin_set_support_agent_role: {
        Args: { _enabled: boolean; _target_user_id: string }
        Returns: undefined
      }
      is_current_user_support_agent: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      admin_reset_user_trials: {
        Args: { _target_user_id: string }
        Returns: undefined
      }
      admin_set_user_subscription: {
        Args: { _target_user_id: string; _is_subscribed: boolean }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_current_user_admin: {
        Args: Record<PropertyKey, never>
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
