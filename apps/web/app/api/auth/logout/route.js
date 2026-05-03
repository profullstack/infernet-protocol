import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabaseAuthClient } from "@/lib/supabase/auth-server";
import { wantsRedirect } from "@/lib/auth/parse-body";
import { appUrl } from "@/lib/auth/app-url";

export const dynamic = "force-dynamic";

export async function POST(request) {
    const supabase = await getSupabaseAuthClient();
    await supabase.auth.signOut();
    // Bust the Router Cache so SiteHeader re-reads the (now missing)
    // session cookie on the next navigation. Without this, the layout's
    // cached RSC payload keeps showing the signed-in chrome until a hard
    // reload — and the user sees a "Mint deploy token" button that 401s.
    revalidatePath("/", "layout");
    if (wantsRedirect(request)) {
        return NextResponse.redirect(new URL("/", appUrl()), { status: 303 });
    }
    return NextResponse.json({ ok: true });
}

// Allow GET too for "click this link to sign out" UX.
export async function GET(request) {
    return POST(request);
}
