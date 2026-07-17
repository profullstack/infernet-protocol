import { NextResponse } from "next/server";
import { handleRoute } from "@/lib/http";
import { verifyBearerHeader } from "@/lib/auth/bearer";
import { getCurrentUser } from "@/lib/supabase/auth-server";
import { cancelCommand, userOwnsPubkey } from "@/lib/data/node-commands";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/v1/user/nodes/<pubkey>/commands/<commandId>
 *
 * Owner cancels an in-flight (pending/running) command — e.g. a vLLM install
 * that's stuck loading. Sets status='cancelled'; the daemon sees it on its
 * next progress tick and stops the running process. Terminal commands are a
 * no-op (returns their current status).
 *
 * Auth + owner check identical to the sibling commands route.
 */
async function resolveUser(request) {
    const claims = verifyBearerHeader(request.headers.get("authorization"));
    if (claims?.sub) return { userId: claims.sub };
    try {
        const user = await getCurrentUser();
        if (user?.id) return { userId: user.id };
    } catch { /* fall through */ }
    return null;
}

export async function DELETE(request, { params }) {
    return handleRoute(async () => {
        const { pubkey, commandId } = await params;
        const auth = await resolveUser(request);
        if (!auth) {
            const err = new Error("not signed in");
            err.status = 401;
            throw err;
        }
        if (!(await userOwnsPubkey(auth.userId, pubkey))) {
            const err = new Error("you don't own that node");
            err.status = 403;
            throw err;
        }
        const result = await cancelCommand({ userId: auth.userId, pubkey, commandId });
        return NextResponse.json({ data: result });
    });
}
