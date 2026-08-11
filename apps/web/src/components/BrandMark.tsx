type BrandMarkProps = {
  className?: string;
};

export function BrandMark({ className }: BrandMarkProps) {
  return (
    <img
      className={["brand-mark", className].filter(Boolean).join(" ")}
      src="/pricing-desk-mark.svg"
      width="64"
      height="64"
      alt=""
      aria-hidden="true"
    />
  );
}
