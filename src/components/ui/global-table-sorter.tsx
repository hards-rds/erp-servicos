"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { compareTableValuesInDirection, type SortDirection } from "@/lib/table-sort";

const STORAGE_PREFIX = "erp-servicos:table-sort";
const UNSORTABLE_HEADERS = new Set(["", "acoes", "acao", "selecionar"]);

type StoredSort = {
  column: number;
  label: string;
  direction: SortDirection;
};

function normalizedLabel(cell: HTMLTableCellElement) {
  return (cell.textContent || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function canSort(cell: HTMLTableCellElement) {
  if (cell.dataset.sortable === "false" || cell.colSpan > 1) return false;
  if (cell.querySelector('input[type="checkbox"]')) return false;
  if (cell.closest("table")?.dataset.serverSort === "true" && !cell.dataset.sortKey) return false;
  return !UNSORTABLE_HEADERS.has(normalizedLabel(cell));
}

function tableStorageKey(pathname: string, table: HTMLTableElement, tableIndex: number) {
  const explicitKey = table.dataset.sortKey;
  return `${STORAGE_PREFIX}:${pathname}:${explicitKey || tableIndex}`;
}

function readStoredSort(key: string): StoredSort | null {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "null") as StoredSort | null;
    if (!parsed || !Number.isInteger(parsed.column)) return null;
    if (parsed.direction !== "ascending" && parsed.direction !== "descending") return null;
    return parsed;
  } catch {
    return null;
  }
}

function updateHeaders(table: HTMLTableElement, activeCell: HTMLTableCellElement, direction: SortDirection) {
  table.querySelectorAll<HTMLTableCellElement>("thead th").forEach((cell) => {
    if (!canSort(cell)) return;
    cell.setAttribute("aria-sort", cell === activeCell ? direction : "none");
  });
}

function sortTable(table: HTMLTableElement, header: HTMLTableCellElement, direction: SortDirection) {
  const body = table.tBodies.item(0);
  if (!body) return;

  const column = header.cellIndex;
  const rows = Array.from(body.rows);
  const sortableRows = rows.filter((row) => {
    const cell = row.cells.item(column);
    return Boolean(cell && row.cells.length > 1 && cell.colSpan === 1);
  });
  const fixedRows = rows.filter((row) => !sortableRows.includes(row));
  sortableRows
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      const leftCell = left.row.cells.item(column);
      const rightCell = right.row.cells.item(column);
      const comparison = compareTableValuesInDirection(
        leftCell?.dataset.sortValue || leftCell?.innerText || "",
        rightCell?.dataset.sortValue || rightCell?.innerText || "",
        direction
      );
      return comparison === 0 ? left.index - right.index : comparison;
    })
    .forEach(({ row }) => body.appendChild(row));

  fixedRows.forEach((row) => body.appendChild(row));
  updateHeaders(table, header, direction);
}

function prepareTable(table: HTMLTableElement, pathname: string, tableIndex: number) {
  if (table.dataset.sortReady === "true") return;
  const headers = Array.from(table.querySelectorAll<HTMLTableCellElement>("thead th"));
  if (!headers.length || !table.tBodies.length) return;

  table.dataset.sortReady = "true";
  headers.forEach((header) => {
    if (!canSort(header)) return;
    header.classList.add("sortable-column");
    header.tabIndex = 0;
    header.setAttribute("aria-sort", "none");
    header.title = `Ordenar por ${(header.textContent || "esta coluna").trim()}`;
  });

  const storageKey = tableStorageKey(pathname, table, tableIndex);
  if (table.dataset.serverSort === "true") {
    const stored = readStoredSort(storageKey);
    const storedHeader = stored
      ? headers.find((header) => header.cellIndex === stored.column && normalizedLabel(header) === stored.label)
      : null;
    if (stored && storedHeader?.dataset.sortKey && (
      storedHeader.dataset.sortKey !== table.dataset.sortColumn || stored.direction !== table.dataset.sortDirection
    )) {
      const params = new URLSearchParams(window.location.search);
      params.set("sort", storedHeader.dataset.sortKey);
      params.set("dir", stored.direction === "ascending" ? "asc" : "desc");
      params.set("page", "1");
      window.location.assign(`${window.location.pathname}?${params.toString()}`);
      return;
    }
    const activeHeader = headers.find((header) => header.dataset.sortKey === table.dataset.sortColumn);
    const direction = table.dataset.sortDirection as SortDirection | undefined;
    if (activeHeader && direction) updateHeaders(table, activeHeader, direction);
    return;
  }

  const stored = readStoredSort(storageKey);
  const defaultHeader = headers.find((header) => header.dataset.sortDefault);
  const selectedHeader = stored
    ? headers.find((header) => header.cellIndex === stored.column && normalizedLabel(header) === stored.label)
    : defaultHeader;
  const direction = stored?.direction || (defaultHeader?.dataset.sortDefault as SortDirection | undefined);

  if (selectedHeader && direction && canSort(selectedHeader)) {
    sortTable(table, selectedHeader, direction);
  }
}

export function GlobalTableSorter() {
  const pathname = usePathname();

  useEffect(() => {
    const prepareAllTables = () => {
      document.querySelectorAll<HTMLTableElement>(".content table").forEach((table, index) => {
        prepareTable(table, pathname, index);
      });
    };

    const activateSort = (header: HTMLTableCellElement) => {
      const table = header.closest("table");
      if (!table || !canSort(header)) return;
      const currentDirection = header.getAttribute("aria-sort");
      const direction: SortDirection = currentDirection === "ascending" ? "descending" : "ascending";
      const tables = Array.from(document.querySelectorAll<HTMLTableElement>(".content table"));
      const tableIndex = tables.indexOf(table);

      if (table.dataset.serverSort === "true" && header.dataset.sortKey) {
        const params = new URLSearchParams(window.location.search);
        window.localStorage.setItem(tableStorageKey(pathname, table, tableIndex), JSON.stringify({
          column: header.cellIndex,
          label: normalizedLabel(header),
          direction
        } satisfies StoredSort));
        params.set("sort", header.dataset.sortKey);
        params.set("dir", direction === "ascending" ? "asc" : "desc");
        params.set("page", "1");
        window.location.assign(`${window.location.pathname}?${params.toString()}`);
        return;
      }

      sortTable(table, header, direction);
      window.localStorage.setItem(tableStorageKey(pathname, table, tableIndex), JSON.stringify({
        column: header.cellIndex,
        label: normalizedLabel(header),
        direction
      } satisfies StoredSort));
    };

    const handleClick = (event: MouseEvent) => {
      const header = (event.target as Element | null)?.closest<HTMLTableCellElement>("th.sortable-column");
      if (header) activateSort(header);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const header = (event.target as Element | null)?.closest<HTMLTableCellElement>("th.sortable-column");
      if (!header) return;
      event.preventDefault();
      activateSort(header);
    };

    prepareAllTables();
    const observer = new MutationObserver(prepareAllTables);
    const content = document.querySelector(".content");
    if (content) observer.observe(content, { childList: true, subtree: true });
    document.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      observer.disconnect();
      document.removeEventListener("click", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [pathname]);

  return null;
}
