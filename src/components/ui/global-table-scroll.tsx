"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type ManagedTable = {
  rail: HTMLDivElement;
  resizeObserver: ResizeObserver;
  update: () => void;
  cleanup: () => void;
};

function normalizeHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function markActionsColumn(wrapper: HTMLElement) {
  wrapper.querySelectorAll<HTMLTableElement>("table").forEach((table) => {
    const lastHeader = table.querySelector<HTMLTableCellElement>("thead th:last-child");
    table.classList.toggle("table-sticky-actions", normalizeHeader(lastHeader?.textContent || "") === "acoes");
  });
}

function enhanceTable(wrapper: HTMLElement): ManagedTable | null {
  const parent = wrapper.parentElement;
  if (!parent) return null;

  const rail = document.createElement("div");
  const spacer = document.createElement("div");
  rail.className = "table-scroll-top";
  spacer.className = "table-scroll-top-spacer";
  rail.setAttribute("role", "region");
  rail.setAttribute("aria-label", "Rolagem horizontal da tabela");
  rail.tabIndex = 0;
  rail.appendChild(spacer);
  parent.insertBefore(rail, wrapper);
  wrapper.dataset.scrollEnhanced = "true";

  const syncFromRail = () => {
    if (wrapper.scrollLeft !== rail.scrollLeft) wrapper.scrollLeft = rail.scrollLeft;
  };
  const syncFromTable = () => {
    if (rail.scrollLeft !== wrapper.scrollLeft) rail.scrollLeft = wrapper.scrollLeft;
  };
  const update = () => {
    if (!wrapper.isConnected) return;
    spacer.style.width = `${wrapper.scrollWidth}px`;
    rail.hidden = wrapper.scrollWidth <= wrapper.clientWidth + 1;
    markActionsColumn(wrapper);
    syncFromTable();
  };

  rail.addEventListener("scroll", syncFromRail, { passive: true });
  wrapper.addEventListener("scroll", syncFromTable, { passive: true });

  const resizeObserver = new ResizeObserver(update);
  resizeObserver.observe(wrapper);
  wrapper.querySelectorAll("table").forEach((table) => resizeObserver.observe(table));
  update();

  return {
    rail,
    resizeObserver,
    update,
    cleanup: () => {
      resizeObserver.disconnect();
      rail.removeEventListener("scroll", syncFromRail);
      wrapper.removeEventListener("scroll", syncFromTable);
      rail.remove();
      delete wrapper.dataset.scrollEnhanced;
      wrapper.querySelectorAll(".table-sticky-actions").forEach((table) => table.classList.remove("table-sticky-actions"));
    }
  };
}

export function GlobalTableScroll() {
  const pathname = usePathname();

  useEffect(() => {
    const managed = new Map<HTMLElement, ManagedTable>();

    const refresh = () => {
      document.querySelectorAll<HTMLElement>(".content .table-wrap").forEach((wrapper) => {
        const current = managed.get(wrapper);
        if (current) {
          current.update();
          return;
        }

        const table = enhanceTable(wrapper);
        if (table) managed.set(wrapper, table);
      });

      managed.forEach((table, wrapper) => {
        if (wrapper.isConnected) return;
        table.cleanup();
        managed.delete(wrapper);
      });
    };

    refresh();
    const content = document.querySelector(".content");
    const observer = new MutationObserver(refresh);
    if (content) observer.observe(content, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      managed.forEach((table) => table.cleanup());
      managed.clear();
    };
  }, [pathname]);

  return null;
}
