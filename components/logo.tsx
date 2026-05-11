export const Logo = (props: React.SVGProps<SVGSVGElement>) => {
  return (
    <svg
      viewBox="0 0 170 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="IndexForge"
      {...props}
    >
      <path d="M8 30L20 8H29L17 30H8Z" fill="#FFC700" />
      <path d="M24 30L36 8H45L33 30H24Z" fill="white" fillOpacity="0.88" />
      <path d="M40 30L52 8H61L49 30H40Z" fill="white" fillOpacity="0.42" />
      <text
        x="70"
        y="25"
        fill="white"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="17"
        fontWeight="700"
        letterSpacing="0"
      >
        IndexForge
      </text>
    </svg>
  );
};
