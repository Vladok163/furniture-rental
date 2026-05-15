-- Инвентарь
create table inventory (
  id serial primary key,
  name text not null,
  total_qty integer not null,
  price_per_day integer not null
);

insert into inventory (name, total_qty, price_per_day) values
  ('Стол', 7, 800),
  ('Лавка', 14, 400),
  ('Стул', 3, 200);

-- Клиенты
create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  source text default 'Авито',
  notes text,
  created_at timestamptz default now()
);

-- Заказы
create table orders (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete set null,
  start_date date not null,
  end_date date not null,
  delivery_type text default 'Самовывоз',
  delivery_address text,
  prepayment integer default 0,
  total_amount integer default 0,
  discount integer default 0,
  status text default 'active',
  notes text,
  created_at timestamptz default now()
);

-- Позиции заказа
create table order_items (
  id serial primary key,
  order_id uuid references orders(id) on delete cascade,
  inventory_id integer references inventory(id),
  quantity integer not null,
  price_per_day integer not null
);

-- RLS
alter table inventory enable row level security;
alter table clients enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;

create policy "public_all" on inventory for all using (true) with check (true);
create policy "public_all" on clients for all using (true) with check (true);
create policy "public_all" on orders for all using (true) with check (true);
create policy "public_all" on order_items for all using (true) with check (true);
