# Migrations

Prisma applies these folders in lexicographic order of their names, not numeric order: `10_…`
sorts before `1_…`. So every migration after `9_book_layout` starts with `z` and its number -
`z11_template_blocks`, `z12_…` - and sorts after all the single-digit ones.

`10_order_layout` keeps its name: it only adds a column to `"Order"` (from `0_init`) and is already
applied on production, where renaming it would make Prisma see a new migration.

Never run `prisma migrate reset` or `prisma migrate dev` against a shared database; apply with
`prisma migrate deploy`.
