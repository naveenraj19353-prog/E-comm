import content from "./welcome.content.json";

export type WelcomeLink = {
  label: string;
  href: string;
};

export type WelcomeContent = typeof content;

export const welcomeContent: WelcomeContent = content;
