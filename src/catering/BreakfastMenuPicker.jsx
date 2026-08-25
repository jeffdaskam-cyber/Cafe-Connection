/**
 * BreakfastMenuPicker.jsx — structured Breakfast menu selection.
 *
 * Replaces the free-text "Menu selection" field for a Breakfast meal. A planner
 * picks a style (Buffet or À la Carte), then an item from the matching list;
 * each pick becomes its own row with an editable quantity (defaulting to the
 * meal's headcount). À la carte lets the planner add as many items as they
 * want — each one added through the "Add additional item" button. Buffets carry
 * everything they include (beverages among them), so unlike the Coffee Break
 * packages there is no separate beverage choice here.
 *
 * The rows are the source of truth passed up via onChange; `name`/`price` are
 * snapshotted onto each row at selection time (see emptyMenuItemSelection), so
 * the estimated cost and the saved event do not reprice when the catalog
 * changes later. The estimated cost shown here is planner-facing and
 * informational only — it is never written to estimatedRevenue/actualRevenue.
 */
import { useState } from "react";

import { COLORS, FONT, RADIUS } from "../theme.js";
import { emptyMenuItemSelection } from "./formState.js";
import { Button, Field, Input, Select } from "./ui.jsx";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
function formatMoney(value) {
  return money.format(Number.isFinite(Number(value)) ? Number(value) : 0);
}

const HELP_TEXT =
  "Decaf coffee available upon request. Prices are per person; menu " +
  "customizations may incur additional charges.";

export default function BreakfastMenuPicker({ menuItems = [], headcount, catalog, onChange }) {
  const { buffets = [], items = [] } = catalog || {};
  // Local UI state: which picker to show. Not persisted — it only steers which
  // second dropdown is offered. `showItemPicker` re-opens the à la carte
  // dropdown after an item is added, driving the "Add additional item" button.
  const [style, setStyle] = useState("");
  const [showItemPicker, setShowItemPicker] = useState(false);

  function addItem(item) {
    const row = {
      ...emptyMenuItemSelection(),
      itemId: item.id,
      category: item.category,
      subcategory: item.subcategory || "",
      name: item.name,
      price: item.price != null ? String(item.price) : "",
      quantity: headcount ? String(headcount) : "",
    };
    onChange([...menuItems, row]);
  }

  function updateRow(localId, patch) {
    onChange(menuItems.map((r) => (r.localId === localId ? { ...r, ...patch } : r)));
  }

  function removeRow(localId) {
    onChange(menuItems.filter((r) => r.localId !== localId));
  }

  function onPickBuffet(e) {
    const item = buffets.find((p) => p.id === e.target.value);
    if (item) addItem(item);
    setStyle(""); // back to blank so another buffet or à la carte item can be added
  }

  function onPickALaCarte(e) {
    const item = items.find((p) => p.id === e.target.value);
    if (item) addItem(item);
    // Collapse the dropdown into the "Add additional item" button; the planner
    // re-opens it to add the next item.
    setShowItemPicker(false);
  }

  function onPickStyle(e) {
    const next = e.target.value;
    setStyle(next);
    // Entering à la carte immediately offers the first item dropdown.
    setShowItemPicker(next === "a_la_carte");
  }

  const estimatedCost = menuItems.reduce(
    (sum, r) => sum + (Number(r.price) || 0) * (Number(r.quantity) || 0),
    0,
  );

  return (
    <div style={{ marginBottom: 16 }}>
      <Field label="Breakfast style">
        <Select value={style} onChange={onPickStyle}>
          <option value="">Add a buffet or à la carte item…</option>
          <option value="buffet">Buffet</option>
          <option value="a_la_carte">À la Carte</option>
        </Select>
      </Field>

      {style === "buffet" && (
        <Field label="Buffet">
          <Select value="" onChange={onPickBuffet}>
            <option value="">Choose a buffet…</option>
            {buffets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {formatMoney(p.price)}/person
              </option>
            ))}
          </Select>
        </Field>
      )}

      {style === "a_la_carte" && showItemPicker && (
        <Field label="À la carte item">
          <Select value="" onChange={onPickALaCarte}>
            <option value="">Choose an item…</option>
            {items.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {formatMoney(p.price)}/person
              </option>
            ))}
          </Select>
        </Field>
      )}

      {style === "a_la_carte" && !showItemPicker && (
        <Button variant="ghost" onClick={() => setShowItemPicker(true)} style={{ marginBottom: 12 }}>
          + Add additional item
        </Button>
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
