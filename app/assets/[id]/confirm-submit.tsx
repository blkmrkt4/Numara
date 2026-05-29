"use client";

// A submit button that asks for confirmation before letting the surrounding
// server-action form submit. Used for destructive actions (deleting a balance
// entry) so a stray tap can't silently drop data.
export function ConfirmSubmit({
  message,
  children,
  className,
  ariaLabel,
}: {
  message: string;
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <button
      type="submit"
      aria-label={ariaLabel}
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
