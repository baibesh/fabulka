-- Reference splits into global data (the superadmin's) and per-country data, with three new parts a
-- role may hold: a country's delivery cities, its delivery fee, and its print formats (offer and
-- prices). The built-in country manager gets them, keeping any rights the owner gave it.
UPDATE "StaffRole"
SET "rights" = "rights" || ARRAY(
      SELECT r FROM unnest(ARRAY['reference.cities', 'reference.delivery', 'reference.formats_country']) AS r
      WHERE NOT r = ANY("rights")
    ),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'country_manager';
