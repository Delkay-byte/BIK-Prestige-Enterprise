export interface NavItem {
  href: string;
  label: string;
  icon: string;
}

export const navSections: { title: string; items: NavItem[] }[] = [
  {
    title: "",
    items: [{ href: "/admin/dashboard", label: "Dashboard", icon: "📊" }],
  },
  {
    title: "MoMo",
    items: [
      { href: "/admin/locations", label: "Locations", icon: "📍" },
      { href: "/admin/workers", label: "Workers", icon: "👥" },
      { href: "/admin/reports", label: "Reports", icon: "📋" },
    ],
  },
  {
    title: "Susu",
    items: [
      { href: "/susu/admin", label: "Overview", icon: "💰" },
      { href: "/susu/admin/customers", label: "Customers", icon: "🧑" },
      { href: "/susu/admin/collectors", label: "Collectors", icon: "🚶" },
      { href: "/susu/admin/contributions", label: "Contributions", icon: "💵" },
      { href: "/susu/admin/withdrawals", label: "Withdrawals", icon: "🏧" },
      { href: "/susu/admin/remittances", label: "Money Handed In", icon: "🏦" },
      { href: "/susu/admin/history", label: "Money & History", icon: "📒" },
      { href: "/susu/admin/reports", label: "Reports", icon: "📑" },
    ],
  },
  {
    title: "Administration",
    items: [
      { href: "/admin/audit", label: "Activity History", icon: "📝" },
      { href: "/admin/settings", label: "Settings", icon: "⚙️" },
    ],
  },
];
