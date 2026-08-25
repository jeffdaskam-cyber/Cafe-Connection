/**
 * Catering Companion — Coffee Break menu catalog.
 *
 * Committed on purpose, like cateringReferenceData.mjs — no personal data.
 * Source: "2026 Breaks Menu.md" (Jeff, 2026-08-25). Regenerate this file
 * whenever the Breaks menu changes, then re-run the "Seed menu catalog"
 * admin action; writes are idempotent (stable slug IDs), so a re-seed after
 * a price change updates existing docs rather than duplicating them. Retire
 * an item by setting active:false rather than deleting it — past events
 * that selected it keep their own snapshotted name/price regardless.
 */

export const PACKAGE_BEVERAGE_OPTIONS = [
  "Coffee, Tea, & Water",
  "Assorted Cold Beverages & Water",
];

export const MENU_ITEMS = [
  // ── Packages ──────────────────────────────────────────────────────────
  { key: "cb-pkg-mediterranean", mealPeriod: "coffee_break", category: "package", subcategory: null,
    name: "Mediterranean", price: 11.25, sortOrder: 1,
    description: "Pita Triangles with Sliced Carrots & Celery Served with Homemade Hummus, Tzatziki, Olives, Mixed Nuts" },
  { key: "cb-pkg-tortilla-chips-dips", mealPeriod: "coffee_break", category: "package", subcategory: null,
    name: "Tortilla Chips & Dips", price: 11.25, sortOrder: 2,
    description: "Corn Tortilla Chips with Homemade Pico de Gallo, Salsa Verde, Guacamole" },
  { key: "cb-pkg-chips-dips", mealPeriod: "coffee_break", category: "package", subcategory: null,
    name: "Chips & Dips", price: 10.00, sortOrder: 3,
    description: "Assorted Chips with Jalapeño Cheddar, White Bean, Creamy Onion Herb Dips" },
  { key: "cb-pkg-pretzel-bar", mealPeriod: "coffee_break", category: "package", subcategory: null,
    name: "Pretzel Bar", price: 10.00, sortOrder: 4,
    description: "Soft & Crunchy Pretzels, Carrot Sticks with Warm Beer Cheese, Honey and Spicy Mustard Dips" },
  { key: "cb-pkg-popcorn-bar", mealPeriod: "coffee_break", category: "package", subcategory: null,
    name: "Popcorn Bar", price: 10.00, sortOrder: 5,
    description: "Homemade Sweet & Savory Popcorn Flavors" },
  { key: "cb-pkg-cheese-crackers", mealPeriod: "coffee_break", category: "package", subcategory: null,
    name: "Cheese & Crackers", price: 11.25, sortOrder: 6,
    description: "Assorted Cheese & Crackers (+GF) with Grapes, Dried Fruit, Mixed Nuts" },
  { key: "cb-pkg-sweet-salty", mealPeriod: "coffee_break", category: "package", subcategory: null,
    name: "Sweet & Salty", price: 12.00, sortOrder: 7,
    description: "Assorted Fresh Baked Mini Cookies, Chips/Popcorn, Fruit Platter with Berries" },
  { key: "cb-pkg-chocolate-lovers", mealPeriod: "coffee_break", category: "package", subcategory: null,
    name: "Chocolate Lovers", price: 12.50, sortOrder: 8,
    description: "Brownie Bites, Chocolate-Coconut Balls, Dark Chocolate-Covered Strawberries" },

  // ── À la carte — Morning ─────────────────────────────────────────────
  { key: "cb-am-pastries-muffins", mealPeriod: "coffee_break", category: "a_la_carte", subcategory: "morning",
    name: "Assorted Breakfast Pastries or Muffins", price: 4.50, sortOrder: 1, description: "" },
  { key: "cb-am-breakfast-breads", mealPeriod: "coffee_break", category: "a_la_carte", subcategory: "morning",
    name: "Assorted Breakfast Breads", price: 4.50, sortOrder: 2, description: "" },
  { key: "cb-am-coffee-cake-kuchen-streusel", mealPeriod: "coffee_break", category: "a_la_carte", subcategory: "morning",
    name: "Coffee Cake, Seasonal Kuchen, Apple Streusel Bars", price: 4.50, sortOrder: 3, description: "" },
  { key: "cb-am-bagels-spreads", mealPeriod: "coffee_break", category: "a_la_carte", subcategory: "morning",
    name: "Assorted Bagels with Spreads", price: 4.50, sortOrder: 4, description: "" },
  { key: "cb-am-smoked-salmon-upgrade", mealPeriod: "coffee_break", category: "a_la_carte", subcategory: "morning",
    name: "Smoked Salmon Upgrade", price: 4.50, sortOrder: 5,
    description: "Add-on to Assorted Bagels with Spreads" },
  { key: "cb-am-mini-frittatas", mealPeriod: "coffee_break", category: "a_la_carte", subcategory: "morning",
    name: "Mini Frittatas, Meat & Vegetarian Options (gluten-friendly)", price: 6.25, sortOrder: 6, description: "" },
  { key: "cb-am-fresh-fruit-salad", mealPeriod: "coffee_break", category: "a_la_carte", subcategory: "morning",
    name: "Fresh Fruit Salad", price: 4.50, sortOrder: 7, description: "" },
  { key: "cb-am-fresh-fruit-platter-berries", mealPeriod: "coffee_break", category: "a_la_carte", subcategory: "morning",
    name: "Fresh Fruit Platter with Berries", price: 5.00, sortOrder: 8, description: "" },
  { key: "cb-am-bowl-berries", mealPeriod: "coffee_break", category: "a_la_carte", subcategory: "morning",
    name: "Bowl of Berries", price: 5.75, sortOrder: 9, description: "" },
  { key: "cb-am-yogurt-granola", mealPeriod: "coffee_break", category: "a_la_carte", subcategory: "morning",
    name: "Yogurt with Granola", price: 5.00, sortOrder: 10, description: "" },
  { key: "cb-am-coconut-chia-pudding", mealPeriod: "coffee_break", category: "a_la_carte", subcategory: "morning",
    name: "Coconut Chia Pudding with Berries (vegan, gluten-friendly)", price: 5.00, sortOrder: 11, description: "" },
  { key: "cb-am-overnight-oats", mealPeriod: "coffee_break", category: "a_la_carte", subcategory: "morning",
    name: "Overnight Oats with Berries (vegan)", price: 5.00, sortOrder: 12, description: "" },
  { key: "cb-am-breakfast-juices", mealPeriod: "coffee_break", category: "a_la_carte", subcategory: "morning",
    name: "Assorted Breakfast Juices", price: 3.75, sortOrder: 13, description: "" },
  { key: "cb-am-coffee-tea-water", mealPeriod: "coffee_break", category: "a_la_carte", subcategory: "morning",
    name: "Coffee, Tea, and Water", price: 3.75, sortOrder: 14, description: "" },

  // ── À la carte — Afternoon ───────────────────────────────────────────
  { key: "cb-pm-tortilla-chips-salsa-or-guac", mealPeriod: "coffee_break", category: "a_la_carte", subcategory: "afternoon",
    name: "Tortilla Chips with Salsa OR Guacamole", price: 5.00, sortOrder: 1, description: "" },
  { key: "cb-pm-tortilla-chips-salsa-and-guac", mealPeriod: "coffee_break", category: "a_la_carte", subcategory: "afternoon",
    name: "Tortilla Chips with Salsa AND Guacamole", price: 6.25, sortOrder: 2, description: "" },
  { key: "cb-pm-bagged-snacks-chips-popcorn", mealPeriod: "coffee_break", category: "a_la_carte", subcategory: "afternoon",
    name: "Bagged Snacks, Chips & Popcorn", price: 3.25, sortOrder: 3, description: "" },
  { key: "cb-pm-granola-bars", mealPeriod: "coffee_break", category: "a_la_carte", subcategory: "afternoon",
    name: "Granola Bars", price: 3.25, sortOrder: 4, description: "" },
  { key: "cb-pm-premium-granola-bars", mealPeriod: "coffee_break", category: "a_la_carte", subcategory: "afternoon",
    name: "Premium Granola Bars", price: 3.75, sortOrder: 5, description: "" },
  { key: "cb-pm-cookies-or-brownies", mealPeriod: "coffee_break", category: "a_la_carte", subcategory: "afternoon",
    name: "Fresh Baked Cookies or Brownies", price: 3.75, sortOrder: 6, description: "" },
  { key: "cb-pm-dessert-bars", mealPeriod: "coffee_break", category: "a_la_carte", subcategory: "afternoon",
    name: "Assorted Dessert Bars", price: 3.75, sortOrder: 7, description: "" },
  { key: "cb-pm-mixed-nuts", mealPeriod: "coffee_break", category: "a_la_carte", subcategory: "afternoon",
    name: "Individually Bagged Mixed Nuts", price: 3.75, sortOrder: 8, description: "" },
  { key: "cb-pm-bowl-whole-fruit", mealPeriod: "coffee_break", category: "a_la_carte", subcategory: "afternoon",
    name: "Bowl of Whole Fruit", price: 3.25, sortOrder: 9, description: "" },
  { key: "cb-pm-bowl-berries", mealPeriod: "coffee_break", category: "a_la_carte", subcategory: "afternoon",
    name: "Bowl of Berries", price: 5.75, sortOrder: 10, description: "" },
  { key: "cb-pm-fresh-fruit-platter-berries", mealPeriod: "coffee_break", category: "a_la_carte", subcategory: "afternoon",
    name: "Fresh Fruit Platter with Berries", price: 5.00, sortOrder: 11, description: "" },
  { key: "cb-pm-fresh-fruit-salad", mealPeriod: "coffee_break", category: "a_la_carte", subcategory: "afternoon",
    name: "Fresh Fruit Salad", price: 4.50, sortOrder: 12, description: "" },
  { key: "cb-pm-soft-drinks-sparkling-water", mealPeriod: "coffee_break", category: "a_la_carte", subcategory: "afternoon",
    name: "Assorted Soft Drinks and Sparkling Water", price: 3.75, sortOrder: 13, description: "" },
  { key: "cb-pm-premium-bottled-beverage", mealPeriod: "coffee_break", category: "a_la_carte", subcategory: "afternoon",
    name: "Premium Bottled Beverage Display", price: 4.75, sortOrder: 14, description: "" },
  { key: "cb-pm-iced-tea-lemonade", mealPeriod: "coffee_break", category: "a_la_carte", subcategory: "afternoon",
    name: "Iced Tea and Lemonade Dispensers", price: 3.75, sortOrder: 15, description: "" },
  { key: "cb-pm-open-water", mealPeriod: "coffee_break", category: "a_la_carte", subcategory: "afternoon",
    name: "Open Water", price: 3.75, sortOrder: 16, description: "" },
  { key: "cb-pm-coffee-tea-water", mealPeriod: "coffee_break", category: "a_la_carte", subcategory: "afternoon",
    name: "Coffee, Tea, and Water", price: 3.75, sortOrder: 17, description: "" },
];
