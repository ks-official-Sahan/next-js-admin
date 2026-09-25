import type { DefaultSession } from "next-auth";

import type { RoleName } from "@/lib/auth/permissions";

// The claims of docs/plan/admin-cms-adr.md, section 6.3.

declare module "next-auth" {
  interface User {
    sid?: string;
    role?: RoleName;
    pwf?: string;
    mfa?: boolean;
  }

  interface Session {
    sid: string;
    role: RoleName;
    pwf: string;
    mfa: boolean;
    user: { id: string } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    sid?: string;
    role?: RoleName;
    pwf?: string;
    mfa?: boolean;
  }
}
