import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Delete expired non-permanent custom exams
    const { data: deleted, error } = await supabase
      .from("custom_exams")
      .delete()
      .lt("expires_at", new Date().toISOString())
      .eq("is_permanent", false)
      .select("id");

    const deletedCount = deleted?.length || 0;

    // Also delete associated results for deleted exams
    if (deleted && deleted.length > 0) {
      const ids = deleted.map(e => e.id);
      await supabase.from("custom_exam_results").delete().in("exam_id", ids);
    }

    console.log(`Cleaned up ${deletedCount} expired exams`);

    return new Response(JSON.stringify({ success: true, deleted: deletedCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("cleanup error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
