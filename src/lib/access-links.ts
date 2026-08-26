/**
 * Public access-link configuration for BIK Prestige Enterprise.
 *
 * This data structure is intentionally machine-readable so QR generation can
 * be added later. Each entry is a PUBLIC login URL — never credentials,
 * customer IDs, tokens, or recovery links. A QR code would encode only
 * `shortPath` (resolved against the site origin).
 */
export interface AccessLink {
  key: "customer" | "momo" | "susu" | "admin";
  title: string;
  icon: string;
  description: string;
  shortPath: string;
  instruction: string;
  /** Admin is the privileged account — keep it visually distinct. */
  admin?: boolean;
}

export const ACCESS_LINKS: AccessLink[] = [
  {
    key: "customer",
    title: "Customer",
    icon: "👤",
    description: "View your Susu savings and account",
    shortPath: "/login/customer",
    instruction: "Use your Customer ID, phone number or email and password to sign in.",
  },
  {
    key: "momo",
    title: "MoMo Agent",
    icon: "💰",
    description: "Manage your daily MoMo transactions",
    shortPath: "/login/momo",
    instruction: "Use your staff login details provided by your administrator.",
  },
  {
    key: "susu",
    title: "Susu Collector",
    icon: "🧑‍💼",
    description: "Manage customer savings collections",
    shortPath: "/login/susu",
    instruction: "Use your staff login details provided by your administrator.",
  },
  {
    key: "admin",
    title: "Administrator",
    icon: "🔐",
    description: "Manage BIK Prestige Enterprise",
    shortPath: "/admin/login",
    instruction: "Administrator access is separate from the staff and customer login.",
    admin: true,
  },
];
