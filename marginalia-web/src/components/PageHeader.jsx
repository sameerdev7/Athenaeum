/**
 * Page-level heading: a gradient Fraunces h1, a glowing hairline, then an
 * optional standfirst.
 */
export default function PageHeader({ title, subtitle, children, size = "page" }) {
  return (
    <div className="rise-in">
      <h1
        className={`text-aurora pb-1 font-bold leading-[1.1] ${
          size === "page" ? "text-page" : "text-section"
        }`}
      >
        {title}
      </h1>
      <div className="meander mt-4 w-48" />
      {subtitle && (
        <p className="mt-4 max-w-2xl text-body italic text-ink-soft">{subtitle}</p>
      )}
      {children}
    </div>
  );
}
