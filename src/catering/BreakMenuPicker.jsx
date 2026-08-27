/**
 * BreakMenuPicker.jsx — structured Coffee Break menu selection.
 *
 * Replaces the free-text "Menu selection" field for a Coffee Break meal. A
 * planner picks a break style (Package or À la Carte), then an item from the
 * matching list; each pick becomes its own row with an editable quantity
 * (defaulting to the meal's headcount) and, for packages, a beverage choice.
 * Multiple rows are allowed — any mix of packages and à la carte items.
 *
 * The rows are the source of truth passed up via onChange; `name`/`price` are
 * snapshotted onto each row at selection time (see emptyMenuItemSelection),
 * so the estimated cost and the saved event do not reprice when the catalog
 * changes later. The estimated cost shown here is planner-facing and
 * informational only — it is never written to estimatedRevenue/actualRevenue.
 */
import { useState } from "react";

import { COLORS, FONT, RADIUS } from "../theme.js";
import { PACKAGE_BEVERAGE_OPTIONS } from "../../api/_lib/cateringMenuData.mjs";
import { emptyMenuItemSelection } from "./formState.js";
import { Button, Field, Input, Select } from "./ui.jsx";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
function formatMoney(value) {
  return money.format(Number.isFinite(Number(value)) ? Number(value) : 0);
}

const HELP_TEXT =
  "Decaf coffee available upon request. Prices are per person; menu " +
  "customizations may incur additional charges.";

export default function BreakMenuPicker({ menuItems = [], headcount, catalog, onChange }) {
  const { packages = [], morning = [], afternoon = [] } = catalog || {};
  // Local UI state: which picker to show. Not persisted — it only steers which
  // second dropdown is offered.
  const [style, setStyle] = useState("");

  function addItem(item, { withBeverage = false } = {}) {
    const row = {
      ...emptyMenuItemSelection(),
      itemId: item.id,
      category: item.category,
      subcategory: item.subcategory || "",
      name: item.name,
      price: item.price != null ? String(item.price) : "",
      quantity: headcount ? String(headcount) : "",
      beverage: withBeverage ? (PACKAGE_BEVERAGE_OPTIONS[0] || "") : "",
    };
    onChange([...menuItems, row]);
    setStyle(""); // back to blank so another item can be added
  }

  function updateRow(localId, patch) {
    onChange(menuItems.map((r) => (r.localId === localId ? { ...r, ...patch } : r)));
  }

  function removeRow(localId) {
    onChange(menuItems.filter((r) => r.localId !== localId));
  }

  function onPickPackage(e) {
    const item = packages.find((p) => p.id === e.target.value);
    if (item) addItem(item, { withBeverage: true });
  }

  function onPickALaCarte(e) {
    const item = [...morning, ...afternoon].find((p) => p.id === e.target.value);
    if (item) addItem(item);
  }

  const estimatedCost = menuItems.reduce(
    (sum, r) => sum + (Number(r.price) || 0) * (Number(r.quantity) || 0),
    0,
  );

  return (
    <div style={{ marginBottom: 16 }}>
      <Field label="Break style">
        <Select value={style} onChange={(e) => setStyle(e.target.value)}>
          <option value="">Add a package or à la carte item…</option>
          <option value="package">Package</option>
          <option value="a_la_carte">À la Carte</option>
        </Select>
      </Field>

      {style === "package" && (
        <Field label="Package">
          <Select value="" onChange={onPickPackage}>
            <option value="">Choose a package…</option>
            {packages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {formatMoney(p.price)}/person
              </option>
            ))}
          </Select>
        </Field>
      )}

      {style === "a_la_carte" && (
        <Field label="À la carte item">
          <Select value="" onChange={onPickALaCarte}>
            <option value="">Choose an item…</option>
            <optgroup label="Morning">
              {morning.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {formatMoney(p.price)}/person
                </option>
              ))}
            </optgroup>
            <optgroup label="Afternoon">
              {afternoon.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {formatMoney(p.price)}/person
                </option>
              ))}
            </optgroup>
          </Select>
        </Field>
      )}

      {menuItems.length > 0 && (
        <div style={{ marginTop: 4 }}>
          {menuItems.map((row) => (
            <div key={row.localId} style={{
              border: `1px solid ${COLORS.BORDER}`, borderRadius: RADIUS.MD,
              padding: "10px 12px", marginBottom: 8, background: COLORS.BG_SURFACE,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                <span style={{ fontSize: 13, fontWeight: FONT.WEIGHT_BOLD, color: COLORS.TEXT_PRIMARY }}>
                  {row.name}
                </span>
                <span style={{ fontSize: 12, color: COLORS.TEXT_MUTED, whiteSpace: "nowrap" }}>
                  {formatMoney(row.price)}/person
                </span>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", marginTop: 10 }}>
                {row.category === "package" && (
                  <div style={{ flex: "1 1 220px", minWidth: 180 }}>
                    <FieldLabel>Beverage</FieldLabel>
                    <Select value={row.beverage}
                      onChange={(e) => updateRow(row.localId, { beverage: e.target.value })}>
                      {PACKAGE_BEVERAGE_OPTIONS.map((b) => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </Select>
                  </div>
                )}
                <div style={{ flex: "0 1 120px", minWidth: 90 }}>
                  <FieldLabel>Quantity</FieldLabel>
                  <Input type="number" min="0" value={row.quantity}
                    onChange={(e) => updateRow(row.localId, { quantity: e.target.value })} />
                </div>
                <Button variant="ghost" onClick={() => removeRow(row.localId)}
                  style={{ padding: "10px 14px" }}>
                  Remove
                </Button>
              </div>
            </div>
          ))}

          <div style={{
            fontSize: 13, fontWeight: FONT.WEIGHT_BOLD, color: COLORS.TEXT_SECONDARY,
            marginTop: 6,
          }}>
            Estimated cost: {formatMoney(estimatedCost)}
          </div>
        </div>
      )}

      <p style={{ fontSize: 11, color: COLORS.TEXT_MUTED, marginTop: 12, lineHeight: 1.5 }}>
        {HELP_TEXT}
      </p>
    </div>
  );
}

function FieldLabel({ children }) {
  return (
    <span style={{
      display: "block", fontSize: 11, fontWeight: FONT.WEIGHT_BOLD,
      color: COLORS.TEXT_SECONDARY, letterSpacing: "0.04em",
      textTransform: "uppercase", marginBottom: 6,
    }}>
      {children}
    </span>
  );
}
