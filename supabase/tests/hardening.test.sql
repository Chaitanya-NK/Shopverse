-- =============================================================================
-- Hardening: job queue, error tracking, order language.
-- Runs in a transaction and rolls back.
-- =============================================================================
begin;

create function pg_temp.assert(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_cond is distinct from true then raise exception 'ASSERTION FAILED: %', p_msg; end if;
end $$;

create function pg_temp.expect_error(p_sql text, p_state text, p_msg text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'ASSERTION FAILED (no error): %', p_msg;
exception when others then
  if sqlstate = 'P0001' and sqlerrm like 'ASSERTION FAILED%' then raise; end if;
  if sqlstate <> p_state then
    raise exception 'ASSERTION FAILED: % (expected %, got % %)', p_msg, p_state, sqlstate, sqlerrm;
  end if;
end $$;

create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
  execute case when p_user is null then 'set local role anon' else 'set local role authenticated' end;
end $$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@retail.test', '{"full_name":"Owner"}'),
  ('00000000-0000-0000-0000-0000000000f1', 'admin@shopverse.test', '{"full_name":"Platform"}');
insert into private.platform_admins (user_id) values ('00000000-0000-0000-0000-0000000000f1');

-- ---------------------------------------------------------------------------
-- Only the server can use the queue and the error log
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.expect_error($q$select public.enqueue_job('order.email', '{}')$q$, '42501', 'staff cannot enqueue');
select pg_temp.expect_error($q$select * from public.claim_jobs('x')$q$, '42501', 'staff cannot claim');
select pg_temp.expect_error($q$select public.record_error('abcdef0123456789', 'server', 'x')$q$, '42501', 'staff cannot write errors');
select pg_temp.expect_error($q$select public.admin_jobs()$q$, '42501', 'staff cannot see jobs');
select pg_temp.expect_error($q$select public.admin_errors()$q$, '42501', 'staff cannot see errors');
select pg_temp.act_as(null);
select pg_temp.expect_error($q$select public.enqueue_job('order.email', '{}')$q$, '42501', 'the public cannot enqueue');
select pg_temp.expect_error($q$select public.set_order_locale(gen_random_uuid(), 'hi')$q$, '42501', 'the public cannot set an order language');

-- ---------------------------------------------------------------------------
-- Enqueue, dedupe, claim, complete
-- ---------------------------------------------------------------------------
reset role;
set local role service_role;
create temp table j on commit drop as select
  public.enqueue_job('order.email', '{"orderId":"1"}') as a,
  public.enqueue_job('stock.alerts', '{}', 0, 'stock-alerts') as b,
  public.enqueue_job('stock.alerts', '{}', 0, 'stock-alerts') as b2,
  public.enqueue_job('order.email', '{"orderId":"2"}', 3600) as later;
select pg_temp.assert((select b = b2 from j), 'the same key while waiting is one job');
select pg_temp.expect_error($q$select public.enqueue_job('Bad Kind!', '{}')$q$, '23514', 'kinds are checked');

create temp table c1 on commit drop as select * from public.claim_jobs('w1', 10);
select pg_temp.assert((select count(*) = 2 from c1), 'claims the two due jobs, not the delayed one');
select pg_temp.assert((select bool_and(attempts = 1) from c1), 'attempt counted');
select pg_temp.assert((select count(*) = 0 from public.claim_jobs('w2', 10)), 'a second worker gets nothing (no double processing)');

select public.complete_job((select a from j));
reset role;
select pg_temp.assert((select status = 'done' and payload = '{}'::jsonb and finished_at is not null
                       from private.jobs where id = (select a from j)), 'done jobs drop their payload');
set local role service_role;
-- The key is free again once the job is done.
select public.complete_job((select b from j));
select pg_temp.assert(public.enqueue_job('stock.alerts', '{}', 0, 'stock-alerts') <> (select b from j), 'a finished key can be queued again');

-- ---------------------------------------------------------------------------
-- Failures: backoff, then dead; permanent failures die at once; retry
-- ---------------------------------------------------------------------------
create temp table f on commit drop as select public.enqueue_job('order.message', '{"x":1}', 0, null, 2) as id;
grant select on f to authenticated;
select * from public.claim_jobs('w1', 10);
select pg_temp.assert(public.fail_job((select id from f), 'Twilio said no') = 'retry', 'first failure retries');
reset role;
select pg_temp.assert((select status = 'queued' and run_after > now() + interval '20 seconds' and last_error = 'Twilio said no'
                       from private.jobs where id = (select id from f)), 'backs off');
update private.jobs set run_after = now() where id = (select id from f);
set local role service_role;
select * from public.claim_jobs('w1', 10);
select pg_temp.assert(public.fail_job((select id from f), 'still no') = 'dead', 'last attempt: dead');
select pg_temp.assert(public.fail_job((select id from f), 'again') is null, 'only running jobs can fail');

create temp table p on commit drop as select public.enqueue_job('order.email', '{}') as id;
select * from public.claim_jobs('w1', 10);
select pg_temp.assert(public.fail_job((select id from p), 'bad payload', true) = 'dead', 'permanent failures skip retries');

-- A crashed worker's job is claimed again after its lease.
create temp table l on commit drop as select public.enqueue_job('order.email', '{}') as id;
select * from public.claim_jobs('w1', 10);
reset role;
update private.jobs set locked_at = now() - interval '10 minutes' where id = (select id from l);
set local role service_role;
select pg_temp.assert((select count(*) = 1 from public.claim_jobs('w2', 10, 300) where id = (select id from l)),
  'expired leases are reclaimed');

-- Admin view and retry.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert((public.admin_jobs() -> 'counts' ->> 'dead')::int = 2, 'admins see dead jobs');
select public.admin_retry_job((select id from f));
reset role;
select pg_temp.assert((select status = 'queued' and attempts = 0 from private.jobs where id = (select id from f)), 'retry resets attempts');

-- Old finished jobs are cleaned up.
update private.jobs set finished_at = now() - interval '15 days' where id = (select a from j);
set local role service_role;
select * from public.claim_jobs('w9', 1);
reset role;
select pg_temp.assert(not exists (select 1 from private.jobs where id = (select a from j)), 'done jobs older than 14 days are deleted');

-- ---------------------------------------------------------------------------
-- Errors
-- ---------------------------------------------------------------------------
set local role service_role;
select public.record_error('aaaaaaaaaaaaaaaa', 'server', 'TypeError: x is undefined', 'stack', '/app/x', 'GET', 'req-1');
select public.record_error('aaaaaaaaaaaaaaaa', 'server', 'TypeError: x is undefined', 'stack', '/app/x', 'GET', 'req-2');
select public.record_error('bbbbbbbbbbbbbbbb', 'client', 'ReferenceError: y', null, '/s/shop', null, null, null, null,
  jsonb_build_object('blob', repeat('x', 9000)));
select pg_temp.expect_error($q$select public.record_error('not-hex', 'server', 'x')$q$, '23514', 'fingerprints are hex');
reset role;
select pg_temp.assert((select count = 2 from private.error_groups where fingerprint = 'aaaaaaaaaaaaaaaa'), 'grouped and counted');
select pg_temp.assert((select context = '{}'::jsonb from private.error_events where fingerprint = 'bbbbbbbbbbbbbbbb'), 'oversized context dropped');
-- Floods: the count goes up, stored events stop at 60 a minute.
set local role service_role;
select public.record_error('cccccccccccccccc', 'job', 'boom') from generate_series(1, 80);
reset role;
select pg_temp.assert((select count = 80 from private.error_groups where fingerprint = 'cccccccccccccccc'), 'every occurrence counted');
select pg_temp.assert((select count(*) = 50 from private.error_events where fingerprint = 'cccccccccccccccc'), 'at most 50 events kept per group');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert((public.admin_errors() ->> 'open')::int = 3, 'three open groups');
select public.admin_resolve_error('aaaaaaaaaaaaaaaa');
select pg_temp.assert((public.admin_errors('open') ->> 'open')::int = 2, 'resolved');
select pg_temp.assert(jsonb_array_length(public.admin_error('aaaaaaaaaaaaaaaa') -> 'events') = 2, 'events of a group');
reset role;
set local role service_role;
select public.record_error('aaaaaaaaaaaaaaaa', 'server', 'TypeError: x is undefined');
reset role;
select pg_temp.assert((select resolved_at is null from private.error_groups where fingerprint = 'aaaaaaaaaaaaaaaa'),
  'a resolved error that happens again reopens');

\echo ALL HARDENING TESTS PASSED
rollback;
