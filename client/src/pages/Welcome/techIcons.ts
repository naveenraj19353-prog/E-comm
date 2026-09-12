import type { IconType } from "react-icons";
import { FaAws } from "react-icons/fa";
import {
  SiFastapi,
  SiMongodb,
  SiReact,
  SiRazorpay,
  SiVite,
} from "react-icons/si";

export const TECH_ICONS: Record<
  string,
  { Icon: IconType; color: string; tint: string }
> = {
  react: { Icon: SiReact, color: "#61DAFB", tint: "#ecfeff" },
  vite: { Icon: SiVite, color: "#A855F7", tint: "#f5f3ff" },
  fastapi: { Icon: SiFastapi, color: "#009688", tint: "#f0fdfa" },
  mongodb: { Icon: SiMongodb, color: "#47A248", tint: "#f0fdf4" },
  s3: { Icon: FaAws, color: "#FF9900", tint: "#fff7ed" },
  razorpay: { Icon: SiRazorpay, color: "#072654", tint: "#eff6ff" },
};
