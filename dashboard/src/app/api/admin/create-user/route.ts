import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!serviceKey || !supabaseUrl) {
    return NextResponse.json(
      { error: "Server not configured: missing SUPABASE_SERVICE_ROLE_KEY" },
      { status: 500 }
    );
  }

  // Verify caller is authenticated admin via their access token
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user: caller } } = await callerClient.auth.getUser();
  if (!caller) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  // Check if caller is admin
  const { data: adminRow } = await callerClient
    .from("admin_users")
    .select("id")
    .eq("user_id", caller.id)
    .single();
  if (!adminRow) {
    return NextResponse.json({ error: "Not an admin" }, { status: 403 });
  }

  // Parse body
  const body = await req.json();
  const { name, email, password, contest_id } = body;
  if (!name || !email || !password) {
    return NextResponse.json({ error: "name, email, password required" }, { status: 400 });
  }

  // Create auth user with service_role key
  const adminClient = createClient(supabaseUrl, serviceKey);
  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, role: "contestant" },
  });

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 });
  }

  // Insert contestant record linked to auth user
  const { error: insertError } = await adminClient.from("contestants").insert({
    name,
    email,
    contest_id: contest_id || null,
    user_id: authData.user.id,
    password_temp: password,
    status: "CLEAN",
  });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  return NextResponse.json({ success: true, user_id: authData.user.id });
}
