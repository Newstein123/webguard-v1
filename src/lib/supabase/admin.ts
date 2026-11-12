import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Service-role client: bypasses RLS. Only the scan engine and account deletion
 * use it, and every caller must check ownership first.
 */
let admin: SupabaseClient<Database> | undefined;

export function supabaseAdmin() {
  admin ??= createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}
