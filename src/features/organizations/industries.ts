/**
 * Industries a business can sell in. Must match the CHECK constraint on
 * organizations.industries and the keys of private.industry_templates().
 * Picking an industry seeds a starter category tree with the right product
 * attributes and stock-tracking mode (quantity, serial number or batch).
 */
export const INDUSTRIES = [
  { id: "fashion", label: "Fashion", examples: "Clothing, footwear, bags" },
  { id: "electronics", label: "Electronics", examples: "Phones, laptops, audio" },
  { id: "home_kitchen", label: "Home & kitchen", examples: "Cookware, utensils, appliances" },
  { id: "grocery", label: "Grocery", examples: "Packaged food, beverages, staples" },
  { id: "beauty", label: "Beauty & personal care", examples: "Skincare, makeup, hair care" },
  { id: "books", label: "Books", examples: "Fiction, education, comics" },
  { id: "toys", label: "Toys & games", examples: "Toys, board games, puzzles" },
  { id: "sports", label: "Sports & fitness", examples: "Equipment, gym gear" },
  { id: "furniture", label: "Furniture", examples: "Tables, chairs, storage" },
  { id: "jewellery", label: "Jewellery", examples: "Gold, silver, fashion jewellery" },
  { id: "stationery", label: "Stationery", examples: "Notebooks, pens, office supplies" },
  { id: "other", label: "Something else", examples: "Start with a general category" },
] as const;

export type IndustryId = (typeof INDUSTRIES)[number]["id"];

export const INDUSTRY_IDS = INDUSTRIES.map((i) => i.id) as [IndustryId, ...IndustryId[]];

export const TRACKING_LABELS = {
  quantity: { label: "Quantity", hint: "Count units per warehouse" },
  serial: { label: "Serial / IMEI", hint: "Track every unit individually" },
  batch: { label: "Batch & expiry", hint: "Track lots with expiry dates (FEFO)" },
} as const;
