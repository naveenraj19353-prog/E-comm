export const BUSINESS_TYPES = ["retail", "service", "menu"] as const;

export type BusinessType = (typeof BUSINESS_TYPES)[number];

export const BUSINESS_TYPE_OPTIONS: {
  value: BusinessType;
  label: string;
  hint: string;
}[] = [
  {
    value: "retail",
    label: "Retail",
    hint: "Sell physical products online",
  },
  {
    value: "service",
    label: "Service",
    hint: "Bookings, appointments, or service offerings",
  },
  {
    value: "menu",
    label: "Menu",
    hint: "Food & beverage menus and ordering",
  },
];

export function isBusinessType(value: string): value is BusinessType {
  return (BUSINESS_TYPES as readonly string[]).includes(value);
}
