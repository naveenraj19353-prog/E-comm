export const BRAND_LOGO_SRC = "/images/brand/rc-logo.png";

type BrandMarkProps = {
  className?: string;
};

export default function BrandMark({ className }: BrandMarkProps) {
  return (
    <img
      src={BRAND_LOGO_SRC}
      alt=""
      width={32}
      height={32}
      className={className}
      decoding="async"
    />
  );
}
