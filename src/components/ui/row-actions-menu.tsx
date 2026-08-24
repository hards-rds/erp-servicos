"use client";

import { Ellipsis } from "lucide-react";
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function RowActionsMenu({ children, label = "Acoes do registro" }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function openMenu() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const menuWidth = 208;
    const right = Math.max(12, window.innerWidth - rect.right);
    const opensUpward = window.innerHeight - rect.bottom < 220 && rect.top > 220;
    setPosition(opensUpward
      ? { right, bottom: window.innerHeight - rect.top + 6, width: menuWidth }
      : { right, top: rect.bottom + 6, width: menuWidth });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;

    function closeOnOutsideClick(event: MouseEvent) {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) setOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    function closeOnViewportChange() {
      setOpen(false);
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeOnViewportChange);
    window.addEventListener("scroll", closeOnViewportChange, true);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("scroll", closeOnViewportChange, true);
    };
  }, [open]);

  return (
    <div className="row-actions-menu">
      <button
        ref={triggerRef}
        className="row-actions-trigger"
        type="button"
        title={label}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => open ? setOpen(false) : openMenu()}
      >
        <Ellipsis aria-hidden="true" size={18} />
      </button>
      {open && typeof document !== "undefined" ? createPortal(
        <div ref={menuRef} className="row-actions-popover" role="menu" aria-label={label} style={position}>
          {children}
        </div>,
        document.body
      ) : null}
    </div>
  );
}
