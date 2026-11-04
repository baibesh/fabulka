-- Text over a picture gets a soft plate of the paper color behind it (BookTheme.overlayStyle): stored
-- themes (and their pending changes) get "plate", the curated themes in code have it too. A theme
-- copy without the field reads as "none", the look books had before, so finished ("done") books keep their
-- stored PDF and render in the reader as they were printed. Books still being made get the plate.
UPDATE "Theme"
SET "theme" = jsonb_set("theme", '{overlayStyle}', '"plate"')
WHERE jsonb_typeof("theme") = 'object' AND NOT ("theme" ? 'overlayStyle');

UPDATE "Theme"
SET "draft" = jsonb_set("draft", '{theme,overlayStyle}', '"plate"')
WHERE jsonb_typeof("draft" -> 'theme') = 'object' AND NOT (("draft" -> 'theme') ? 'overlayStyle');

UPDATE "Book"
SET "layout" = jsonb_set("layout", '{theme,overlayStyle}', '"plate"')
WHERE "status" <> 'done'
  AND jsonb_typeof("layout" -> 'theme') = 'object'
  AND NOT (("layout" -> 'theme') ? 'overlayStyle');
