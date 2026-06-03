import { NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { assertPermission, type PermissionModule } from "@/lib/permissions";

export type ApiSession = {
  user: {
    id: string;
    role: Role;
    name?: string | null;
    email?: string | null;
  };
};

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function errorJson(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

export async function requireApiSession(module?: PermissionModule): Promise<ApiSession> {
  const session = await getSession();
  const user = session?.user;

  if (!user?.id || !user.role) {
    const error = new Error("Authentication required.");
    error.name = "AuthenticationError";
    throw error;
  }

  if (module) {
    assertPermission(user.role, module);
  }

  return { user: { id: user.id, role: user.role, name: user.name, email: user.email } };
}

export function handleApiError(error: unknown) {
  if (error instanceof Error) {
    if (error.name === "AuthenticationError") return errorJson(error.message, 401);
    if (error.name === "PermissionError") return errorJson(error.message, 403);
    if (error.name === "ZodError") return errorJson("Validation failed.", 400, error);
    return errorJson(error.message, 400);
  }

  return errorJson("Unexpected server error.", 500);
}

export function getSearchParams(request: Request) {
  return new URL(request.url).searchParams;
}

export function parsePagination(searchParams: URLSearchParams) {
  const page = Math.max(Number(searchParams.get("page") ?? 1), 1);
  const pageSize = Math.min(Math.max(Number(searchParams.get("pageSize") ?? 20), 1), 100);
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}
