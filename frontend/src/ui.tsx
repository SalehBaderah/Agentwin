import { useEffect, useId, useLayoutEffect, useRef } from "react";
import { X } from "lucide-react";

export function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    const previous = document.activeElement;
    dialog.showModal();
    const frame = requestAnimationFrame(() => dialog.classList.add("is-open"));
    return () => {
      cancelAnimationFrame(frame);
      dialog.close();
      dialog.classList.remove("is-open", "is-closing");
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [open]);
  const close = () => {
    const dialog = ref.current;
    if (!dialog || dialog.classList.contains("is-closing")) return;
    dialog.classList.remove("is-open");
    dialog.classList.add("is-closing");
    const delay = matchMedia("(prefers-reduced-motion: reduce)").matches
      ? 0
      : parseFloat(
          getComputedStyle(dialog).getPropertyValue("--modal-close-dur"),
        ) || 150;
    window.setTimeout(onClose, delay);
  };
  return (
    <dialog
      ref={ref}
      className="dialog t-modal"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const rect = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            close();
        }
      }}
    >
      <div className="dialog-heading">
        <h2 id={titleId}>{title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Close dialog"
          onClick={close}
        >
          <X size={18} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export function Tabs({
  value,
  onChange,
  items,
}: {
  value: string;
  onChange: (value: string) => void;
  items: string[][];
}) {
  const rail = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  useLayoutEffect(() => {
    const element = rail.current;
    if (!element) return;
    const move = (animate: boolean) => {
      const active = element.querySelector<HTMLButtonElement>(
        '[aria-selected="true"]',
      );
      const pill = element.querySelector<HTMLElement>(".t-tabs-pill");
      if (!active || !pill) return;
      if (!animate) pill.style.transition = "none";
      pill.style.transform = `translateX(${active.offsetLeft}px)`;
      pill.style.width = `${active.offsetWidth}px`;
      if (!animate) {
        void pill.offsetWidth;
        pill.style.transition = "";
      }
    };
    move(initialized.current);
    initialized.current = true;
    const observer = new ResizeObserver(() => move(false));
    observer.observe(element);
    return () => observer.disconnect();
  }, [value]);
  return (
    <div
      ref={rail}
      className="tabs t-tabs"
      role="tablist"
      aria-label="Project views"
      onKeyDown={(event) => {
        const focused =
          event.target instanceof HTMLElement
            ? event.target.id.replace("tab-", "")
            : value;
        const index = items.findIndex(([key]) => key === focused);
        const next =
          event.key === "ArrowRight"
            ? (index + 1) % items.length
            : event.key === "ArrowLeft"
              ? (index + items.length - 1) % items.length
              : event.key === "Home"
                ? 0
                : event.key === "End"
                  ? items.length - 1
                  : -1;
        if (next < 0) return;
        event.preventDefault();
        onChange(items[next][0]);
        const tabs = rail.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
        tabs?.[next]?.focus();
      }}
    >
      <span className="t-tabs-pill" aria-hidden="true" />
      {items.map(([key, label]) => (
        <button
          className={`t-tab ${value === key ? "active" : ""}`}
          key={key}
          id={`tab-${key}`}
          role="tab"
          aria-selected={value === key}
          aria-controls="project-panel"
          tabIndex={value === key ? 0 : -1}
          onClick={() => onChange(key)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
