/** Auth screens: one floating glass card with a gradient halo. */
export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="mx-auto flex min-h-[72vh] max-w-md flex-col justify-center px-4 py-12">
      <div className="rise-in ring-aurora rounded-[18px]">
        <div
          className="tablet-edge relative rounded-[18px] px-7 py-9"
          style={{ background: "var(--nav-bg)" }}
        >
          <div className="bg-aurora mx-auto mb-5 grid h-14 w-14 place-items-center rounded-xl shadow-[0_12px_30px_-8px_var(--g-b)]">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#1d1409" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 9.5 12 4l9 5.5" />
          <path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8" />
          <path d="M3 20.5h18" />
        </svg>
          </div>
          <h1 className="text-aurora text-center text-section">{title}</h1>
          {subtitle && (
            <p className="mt-2 text-center text-uitext text-ink-soft">{subtitle}</p>
          )}
          <div className="mt-7">{children}</div>
        </div>
      </div>
      {footer && <div className="mt-5 text-center text-uitext text-ink-soft">{footer}</div>}
    </div>
  );
}
