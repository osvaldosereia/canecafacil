alter table public.mug_templates
  add column if not exists description text,
  add column if not exists tags text[] not null default '{}',
  add column if not exists base_price_cents integer,
  add column if not exists image_url text;

alter table public.mug_templates
  drop constraint if exists mug_templates_base_price_cents_check;
alter table public.mug_templates
  add constraint mug_templates_base_price_cents_check
  check (base_price_cents is null or base_price_cents >= 0);

create index if not exists mug_templates_active_idx on public.mug_templates(active);
create index if not exists mug_templates_tags_gin_idx on public.mug_templates using gin(tags);

comment on column public.mug_templates.base_price_cents is
  'Authoritative base unit price in integer cents; null means not sellable until configured.';
