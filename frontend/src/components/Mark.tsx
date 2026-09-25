export function Mark() {
  return (
    <svg
      className="brand-mark"
      viewBox="0 0 48 40"
      width="32"
      height="32"
      fill="none"
      aria-hidden="true"
    >
      <path
        className="brand-mark-physical"
        d="M2.5 36 17.6 4.3A2 2 0 0 1 19.4 3H24l-4.2 9L8.9 36H2.5Z"
      />
      <path
        className="brand-mark-digital"
        d="M24.1 3h4.5a2 2 0 0 1 1.8 1.2L45.5 36h-6.4L20.2 12l3.9-9Z"
      />
      <path className="brand-mark-physical" d="M9.8 24h10.7v3H8.4l1.4-3Z" />
      <path className="brand-mark-digital" d="M27.5 24h10.7l1.4 3H27.5v-3Z" />
      <path className="brand-mark-physical" d="m17.5 25.5 5-5v10l-5-5Z" />
      <path className="brand-mark-digital" d="m23.5 20.5 5 5-5 5v-10Z" />
    </svg>
  );
}
