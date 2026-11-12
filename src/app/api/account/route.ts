import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/** Permanently deletes the signed-in user. Projects, scans and findings cascade. */
export async function DELETE() {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { error } = await supabaseAdmin().auth.admin.deleteUser(user.id);
  if (error) {
    console.error("[account.delete]", error);
    return NextResponse.json({ error: "Could not delete account" }, { status: 500 });
  }
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
