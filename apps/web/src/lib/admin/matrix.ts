import type { PriceMatrix } from "./api";

/** Grid form of a price matrix: rows "" (base price) + option codes, columns vehicle codes.
 * Cells are strings straight from inputs; an empty price means "not offered". */
export type Grid = Record<string, Record<string, { price: string; minutes: string }>>;

export function toGrid(matrix: PriceMatrix, rows: string[], vehicles: string[]): Grid {
  const grid: Grid = {};
  for (const row of rows) {
    grid[row] = Object.fromEntries(vehicles.map((v) => [v, { price: "", minutes: "" }]));
  }
  for (const e of matrix.entries) {
    const row = e.option_code ?? "";
    if (grid[row]?.[e.vehicle_code]) {
      grid[row][e.vehicle_code] = { price: String(e.price_kzt), minutes: String(e.duration_min) };
    }
  }
  return grid;
}

export function fromGrid(grid: Grid): PriceMatrix {
  const entries: PriceMatrix["entries"] = [];
  for (const [row, cells] of Object.entries(grid)) {
    for (const [vehicle, cell] of Object.entries(cells)) {
      if (cell.price.trim() === "") continue;
      entries.push({
        option_code: row === "" ? null : row,
        vehicle_code: vehicle,
        price_kzt: Math.round(Number(cell.price)),
        duration_min: Math.round(Number(cell.minutes || 0)),
      });
    }
  }
  return { entries };
}

/** "Заголовок | Текст" per line ↔ [{title, text}] (process steps in the editor). */
export const stepsToText = (steps: { title: string; text: string }[] = []) =>
  steps.map((s) => `${s.title} | ${s.text}`).join("\n");
export const textToSteps = (text: string) =>
  text
    .split("\n")
    .map((line) => line.split("|").map((p) => p.trim()))
    .filter(([title, body]) => title && body)
    .map(([title, body]) => ({ title, text: body }));
export const listToText = (items: string[] = []) => items.join("\n");
export const textToList = (text: string) => text.split("\n").map((l) => l.trim()).filter(Boolean);
