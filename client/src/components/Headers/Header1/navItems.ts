export interface NavItem {
  id: number;
  label: string;
  path: string;
}
export const navItems: NavItem[] = [
  {
    id: 1,
    label: "Electronics",
    path: "/electronics",
  },
  {
    id: 2,
    label: "Accessories",
    path: "/accessories",
  },
  {
    id: 3,
    label: "Home Decor",
    path: "/home-decor",
  },
  {
    id: 4,
    label: "Lighting",
    path: "/lighting",
  },
];
