import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  emptyFavorites,
  favoritesEqual,
  FAVORITES_CHANGED_EVENT,
  FAVORITES_STORAGE_KEY,
  parseFavorites,
  toggleFavoriteId,
} from "./favorites-storage";

describe("favorites-storage", () => {
  it("persists under cfo_virtual_favorites and broadcasts cfo:favorites-changed", () => {
    assert.equal(FAVORITES_STORAGE_KEY, "cfo_virtual_favorites");
    assert.equal(FAVORITES_CHANGED_EVENT, "cfo:favorites-changed");
  });

  it("parses stored ids and ignores junk", () => {
    assert.deepEqual(parseFavorites(null), emptyFavorites());
    assert.deepEqual(parseFavorites("{"), emptyFavorites());
    assert.deepEqual(
      parseFavorites(
        JSON.stringify({
          favoriteMetricIds: ["gross_margin", 12, "roe"],
          favoriteChartIds: ["chart:pnl"],
          favoriteWidgetIds: ["chart-sankey", 7],
        }),
      ),
      {
        favoriteMetricIds: ["gross_margin", "roe"],
        favoriteChartIds: ["chart:pnl"],
        favoriteWidgetIds: ["chart-sankey"],
      },
    );
  });

  it("defaults widget favorites to empty for legacy payloads", () => {
    assert.deepEqual(
      parseFavorites(JSON.stringify({ favoriteMetricIds: ["roe"], favoriteChartIds: [] })),
      { favoriteMetricIds: ["roe"], favoriteChartIds: [], favoriteWidgetIds: [] },
    );
  });

  it("toggles ids without mutating the original list", () => {
    const original = ["roe"];
    assert.deepEqual(toggleFavoriteId(original, "roa"), ["roe", "roa"]);
    assert.deepEqual(toggleFavoriteId(["roe", "roa"], "roe"), ["roa"]);
    assert.deepEqual(original, ["roe"]);
  });

  it("compares favorite snapshots by ordered ids", () => {
    const a = { favoriteMetricIds: ["roe"], favoriteChartIds: [], favoriteWidgetIds: [] };
    const b = { favoriteMetricIds: ["roe"], favoriteChartIds: [], favoriteWidgetIds: [] };
    const c = { favoriteMetricIds: ["roa"], favoriteChartIds: [], favoriteWidgetIds: [] };
    const d = { favoriteMetricIds: ["roe"], favoriteChartIds: [], favoriteWidgetIds: ["chart-sankey"] };
    assert.equal(favoritesEqual(a, b), true);
    assert.equal(favoritesEqual(a, c), false);
    assert.equal(favoritesEqual(a, d), false);
  });
});
