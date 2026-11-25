-- Cancel Call Management System: run once in Supabase > SQL Editor
create extension if not exists pgcrypto;

create table companies(
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now());
create unique index companies_name_uq on companies(lower(name));

-- One L-Code -> exactly one company. A company can own many L-Codes.
create table lcodes(
  id uuid primary key default gen_random_uuid(),
  lcode text not null,
  company_id uuid not null references companies(id),
  active boolean not null default true,
  created_at timestamptz default now());
create unique index lcodes_uq on lcodes(upper(lcode));

create table staff(
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  password_hash text not null,
  role text not null check (role in ('sde','bm','admin')),
  active boolean not null default true,
  created_at timestamptz default now());
create unique index staff_uq on staff(lower(user_id));

create table sde_companies(
  sde_id uuid not null references staff(id),
  company_id uuid not null references companies(id),
  primary key(sde_id, company_id));

create table cancel_calls(
  id uuid primary key default gen_random_uuid(),
  lcode_id uuid not null references lcodes(id),
  ticket_no text not null,
  created_date date not null,
  remarks text not null,
  status text not null default 'Pending' check (status in ('Pending','Approved','Rejected')),
  sde_id uuid references staff(id),
  response_remark text,
  responded_at timestamptz,
  submitted_at timestamptz not null default now());
create unique index calls_ticket_uq on cancel_calls(upper(ticket_no));
create index calls_status_ix on cancel_calls(status);
create index calls_lcode_ix on cancel_calls(lcode_id);
create index calls_date_ix on cancel_calls(created_date);

-- Read models (company + L-Code resolved through relationships)
create view v_calls as
select c.id, c.ticket_no, c.created_date, c.submitted_at, c.remarks, c.status,
       c.response_remark, c.responded_at, c.lcode_id, l.lcode, l.company_id,
       co.name as company, c.sde_id, s.user_id as sde
from cancel_calls c
join lcodes l on l.id = c.lcode_id
join companies co on co.id = l.company_id
left join staff s on s.id = c.sde_id;

create view v_staff as select id, user_id, role, active from staff;

-- Staff functions (password hashes never leave the database)
create function staff_login(p_uid text, p_hash text)
returns table(id uuid, user_id text, role text) language sql security definer as $$
  select id, user_id, role from staff
  where lower(user_id)=lower(p_uid) and password_hash=p_hash and active $$;

create function sde_register(p_uid text, p_hash text)
returns void language sql security definer as $$
  insert into staff(user_id,password_hash,role) values(trim(p_uid),p_hash,'sde') $$;

create function staff_create(a_uid text,a_hash text,p_uid text,p_hash text,p_role text)
returns void language plpgsql security definer as $$
begin
  if not exists(select 1 from staff where lower(user_id)=lower(a_uid) and password_hash=a_hash and role='admin' and active)
  then raise exception 'Not authorised'; end if;
  insert into staff(user_id,password_hash,role) values(trim(p_uid),p_hash,p_role);
end $$;

create function staff_update(a_uid text,a_hash text,p_id uuid,p_hash text,p_active boolean)
returns void language plpgsql security definer as $$
begin
  if not exists(select 1 from staff where lower(user_id)=lower(a_uid) and password_hash=a_hash and role='admin' and active)
  then raise exception 'Not authorised'; end if;
  update staff set password_hash=coalesce(p_hash,password_hash), active=coalesce(p_active,active) where id=p_id;
end $$;

-- Row Level Security: no deletes on important data, staff table fully closed
alter table companies enable row level security;
alter table lcodes enable row level security;
alter table staff enable row level security;
alter table sde_companies enable row level security;
alter table cancel_calls enable row level security;

create policy co_r on companies for select to anon using (true);
create policy co_i on companies for insert to anon with check (true);
create policy co_u on companies for update to anon using (true) with check (true);
create policy lc_r on lcodes for select to anon using (true);
create policy lc_i on lcodes for insert to anon with check (true);
create policy lc_u on lcodes for update to anon using (true) with check (true);
create policy cc_r on cancel_calls for select to anon using (true);
create policy cc_i on cancel_calls for insert to anon with check (status='Pending');
create policy cc_u on cancel_calls for update to anon using (true) with check (true);
create policy sc_all on sde_companies for all to anon using (true) with check (true);

revoke all on staff from anon;
revoke delete on companies, lcodes, cancel_calls from anon;
grant select on v_calls, v_staff to anon;
grant execute on function staff_login, sde_register, staff_create, staff_update to anon;

-- First Super Admin  ->  ID: admin   Password: admin123   (change it after first login)
insert into staff(user_id,password_hash,role)
values('admin', encode(digest('admin:admin123','sha256'),'hex'), 'admin');
